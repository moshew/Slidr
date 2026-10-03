/**
 * The fonts of an imported document (SPEC 5.7, IMP-12). Two things, both about making the text
 * of an imported slide look the same in the editor as it did in the source:
 *
 * - The faces the file brought with it (`@font-face` with the font inside, as a `data:` or
 *   `blob:` URL) become font assets of the deck, once each, however many slides use them.
 * - The fonts the app itself offers are made known to the source document, so a file that
 *   names one of them without carrying it is drawn with it here, as it will be on the slide.
 */
import type { AssetMeta } from '@slidr/model';

/** A face of the app's own font library, with a URL the source document can load. */
export interface AppFontFace {
  family: string;
  style: string;
  weight: string;
  url: string;
  unicodeRange?: string;
}

/** A face the file declared, as its rule says it. */
interface DeclaredFace {
  family: string;
  weight: string;
  style: string;
  unicodeRange?: string;
  /** The `src` descriptor, whole. */
  src: string;
}

const unquote = (value: string) => value.trim().replace(/^(["'])(.*)\1$/, '$2');

/** Every `@font-face` rule of a document's stylesheets, in order. */
function declaredFaces(doc: Document): DeclaredFace[] {
  const faces: DeclaredFace[] = [];
  const visit = (rules: CSSRuleList) => {
    for (const rule of Array.from(rules)) {
      if (rule.constructor.name === 'CSSFontFaceRule') {
        const style = (rule as CSSFontFaceRule).style;
        const family = unquote(style.getPropertyValue('font-family'));
        const src = style.getPropertyValue('src');
        if (!family || !src) continue;
        const range = style.getPropertyValue('unicode-range').trim();
        faces.push({
          family,
          weight: style.getPropertyValue('font-weight').trim() || 'normal',
          style: style.getPropertyValue('font-style').trim() || 'normal',
          ...(range ? { unicodeRange: range } : {}),
          src,
        });
      } else if ('cssRules' in rule) visit((rule as CSSGroupingRule).cssRules);
    }
  };
  const sheets = [...Array.from(doc.styleSheets), ...Array.from(doc.adoptedStyleSheets ?? [])];
  for (const sheet of sheets) {
    try {
      visit(sheet.cssRules);
    } catch {
      // A sheet from another origin cannot be read.
    }
  }
  return faces;
}

/** The first source of a face that carries the font itself. */
function embeddedUrl(src: string): string | undefined {
  return /url\(\s*(["']?)((?:data|blob):[^"')]+)\1\s*\)/.exec(src)?.[2];
}

/** What tells one declared face from another, without holding megabytes of `src` as a key. */
function faceKey(face: DeclaredFace): string {
  const { family, weight, style, unicodeRange, src } = face;
  return [family, weight, style, unicodeRange ?? '', src.length, src.slice(-96)].join('|');
}

export interface SourceFonts {
  /**
   * Stores the embedded faces of `doc` that were not stored yet as font assets, and brings the
   * app's own fonts in line with what the file declares now. Returns what the agent should
   * know.
   */
  sync(doc: Document): Promise<string[]>;
}

export function createSourceFonts(options: {
  storeAsset(
    bytes: Uint8Array<ArrayBuffer>,
    info: { mime: string; name?: string },
  ): Promise<AssetMeta>;
  /** Called with each face that became an asset. */
  stored(asset: AssetMeta): void;
  appFonts?: readonly AppFontFace[];
}): SourceFonts {
  const seen = new Set<string>();
  /** The app faces added to each document, by family (lower case). */
  const added = new WeakMap<Document, Map<string, FontFace[]>>();

  /**
   * The app's fonts in a source document, as `FontFace` objects: nothing is added to its DOM.
   * A family the file declares itself is the file's, and the app's face of that name is taken
   * out, the way a deck's font assets take precedence over the built-in library on a slide.
   */
  function alignAppFonts(doc: Document, declared: readonly DeclaredFace[]): void {
    const view = doc.defaultView;
    if (!view || !options.appFonts?.length) return;
    const own = new Set(declared.map((face) => face.family.toLowerCase()));
    let mine = added.get(doc);
    if (!mine) {
      mine = new Map();
      added.set(doc, mine);
    }
    for (const [family, faces] of mine) {
      if (!own.has(family)) continue;
      for (const face of faces) doc.fonts.delete(face);
      mine.delete(family);
    }
    for (const face of options.appFonts) {
      const family = face.family.toLowerCase();
      if (own.has(family)) continue;
      const faces = mine.get(family) ?? [];
      const key = `${face.weight}|${face.style}|${face.unicodeRange ?? ''}|${face.url}`;
      if (faces.some((f) => (f as FontFace & { slidrKey?: string }).slidrKey === key)) continue;
      try {
        const made = new view.FontFace(face.family, `url(${JSON.stringify(face.url)})`, {
          style: face.style,
          weight: face.weight,
          display: 'block',
          ...(face.unicodeRange ? { unicodeRange: face.unicodeRange } : {}),
        });
        (made as FontFace & { slidrKey?: string }).slidrKey = key;
        doc.fonts.add(made);
        faces.push(made);
        mine.set(family, faces);
      } catch {
        // A face the browser will not take is one font the file falls back for, as before.
      }
    }
  }

  return {
    async sync(doc) {
      const notes: string[] = [];
      const declared = declaredFaces(doc);
      alignAppFonts(doc, declared);
      for (const face of declared) {
        const key = faceKey(face);
        if (seen.has(key)) continue;
        seen.add(key);
        const url = embeddedUrl(face.src);
        // A face that points at a file elsewhere did not load (no network), and drew nothing.
        if (!url) continue;
        try {
          const blob = await (await fetch(url)).blob();
          const bytes = new Uint8Array(await blob.arrayBuffer());
          const asset = await options.storeAsset(bytes, {
            mime: blob.type.startsWith('font/') ? blob.type : 'font/woff2',
            name: face.family,
          });
          if (asset.kind !== 'font') {
            notes.push(`The embedded font "${face.family}" is not a font file the app can keep.`);
            continue;
          }
          options.stored({
            ...asset,
            font: {
              family: face.family,
              weight: face.weight,
              style: face.style,
              ...(face.unicodeRange ? { unicodeRange: face.unicodeRange } : {}),
            },
          });
        } catch {
          notes.push(`The embedded font "${face.family}" could not be read.`);
        }
      }
      return notes;
    },
  };
}
