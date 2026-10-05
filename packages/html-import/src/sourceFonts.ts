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
import { ASSET_URL_SCHEME } from '@slidr/renderer';

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

/** The weights a `font-weight` descriptor covers: one weight, or a range of them. */
interface Span {
  lo: number;
  hi: number;
}

function weightSpan(weight: string): Span | undefined {
  const parts = weight
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((part) => (part === 'normal' ? 400 : part === 'bold' ? 700 : Number(part)));
  if (parts.length > 2 || parts.some((n) => !Number.isFinite(n) || n < 1 || n > 1000)) {
    return undefined;
  }
  return { lo: Math.min(...parts), hi: Math.max(...parts) };
}

/** Whether two faces are one face but for the weight they are declared for. */
const alikeButWeight = (a: DeclaredFace, b: DeclaredFace) =>
  a.family === b.family && a.style === b.style && (a.unicodeRange ?? '') === (b.unicodeRange ?? '');

/**
 * The range of weights that says what several faces of one file say, each for a weight of its
 * own: `400`, `500` and `600` are `400 600`. That is how a variable font is served, a rule a
 * weight over the same file, and a face with a range draws each of those weights from the file
 * exactly as the rule of that weight did, and the nearest end for a weight outside them.
 *
 * Not when there is a gap between the weights (`400` and `700`): a weight in the gap would be
 * drawn as itself, where the source drew the nearer of the two. And not when another file of
 * the family has a weight inside the range, which the range would take text from.
 */
function weightRange(
  faces: readonly DeclaredFace[],
  others: readonly DeclaredFace[],
): Span | undefined {
  const spans: Span[] = [];
  for (const face of faces) {
    const span = weightSpan(face.weight);
    if (!span) return undefined;
    spans.push(span);
  }
  const own = spans[0];
  if (!own) return undefined;
  const sorted = [...spans].sort((a, b) => a.lo - b.lo);
  const range = { ...sorted[0]! };
  for (const next of sorted.slice(1)) {
    if (next.lo - range.hi > 100) return undefined;
    range.hi = Math.max(range.hi, next.hi);
  }
  // The first face says it all already: nothing to widen.
  if (range.lo === own.lo && range.hi === own.hi) return undefined;
  for (const other of others) {
    const span = weightSpan(other.weight);
    if (!span || (span.lo <= range.hi && span.hi >= range.lo)) return undefined;
  }
  return range;
}

/** What a font asset says in its record. */
interface Recorded {
  face: DeclaredFace;
  /** The weights it is for, when they could be read. */
  span?: Span;
}

export interface SourceFonts {
  /**
   * Stores the embedded faces of `doc` that were not stored yet as font assets, and brings the
   * app's own fonts in line with what the file declares now. Returns what the agent should
   * know.
   */
  sync(doc: Document): Promise<string[]>;
  /**
   * `@font-face` rules for the faces whose font file is an asset that already says another
   * face, and that the asset's record cannot say as well: one file under two family names, two
   * weights of a variable font with others between them that the file does not declare. An
   * asset is its content and holds one face, so these go with the slides, as rules of the
   * slide's own stylesheet that name the asset. Empty when every face is in an asset's record.
   */
  css(): string;
}

/** A CSS string literal. */
const cssText = (value: string) => JSON.stringify(value);

/** The rule that registers a declared face from a font asset of the deck. */
function faceRule(face: DeclaredFace, assetId: string): string {
  const range = face.unicodeRange ? ` unicode-range: ${face.unicodeRange};` : '';
  return `@font-face { font-family: ${cssText(face.family)}; font-weight: ${face.weight}; font-style: ${face.style}; font-display: block; src: url("${ASSET_URL_SCHEME}${assetId}");${range} }`;
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
  /**
   * The face each font asset says in its record, by asset id: the first that brought the file,
   * for every weight the file was declared for beside it when those make a range.
   */
  const recorded = new Map<string, Recorded>();
  /** The rules of the other faces of the same file. */
  const shared: string[] = [];

  /** Whether an asset's record already says a face. */
  const says = (record: Recorded, face: DeclaredFace): boolean => {
    if (!alikeButWeight(record.face, face)) return false;
    if (record.face.weight === face.weight) return true;
    const span = weightSpan(face.weight);
    return Boolean(record.span && span && span.lo >= record.span.lo && span.hi <= record.span.hi);
  };
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
      /** The faces this call found, by the asset their file became, in the file's order. */
      const brought = new Map<string, { asset: AssetMeta; faces: DeclaredFace[] }>();
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
          const entry = brought.get(asset.id);
          if (entry) entry.faces.push(face);
          else brought.set(asset.id, { asset, faces: [face] });
        } catch {
          notes.push(`The embedded font "${face.family}" could not be read.`);
        }
      }
      // One file is one asset, and an asset says one face. Several rules that carry the same
      // file (a rule a weight, a second family name) are that face where its record can say
      // them all, and rules of the slides that point at the asset where it cannot.
      for (const { asset, faces } of brought.values()) {
        let record = recorded.get(asset.id);
        if (!record) {
          const first = faces[0];
          if (!first) continue;
          const alike = faces.filter((face) => alikeButWeight(face, first));
          // A rule the file wrote twice is the same face, not another file's.
          const mine = new Set(faces.map(faceKey));
          const range = weightRange(
            alike,
            declared.filter((face) => !mine.has(faceKey(face)) && alikeButWeight(face, first)),
          );
          const face = range ? { ...first, weight: `${range.lo} ${range.hi}` } : first;
          const span = range ?? weightSpan(first.weight);
          record = { face, ...(span ? { span } : {}) };
          recorded.set(asset.id, record);
          options.stored({
            ...asset,
            font: {
              family: face.family,
              weight: face.weight,
              style: face.style,
              ...(face.unicodeRange ? { unicodeRange: face.unicodeRange } : {}),
            },
          });
        }
        for (const face of faces) if (!says(record, face)) shared.push(faceRule(face, asset.id));
      }
      return notes;
    },
    css: () => shared.join('\n'),
  };
}
