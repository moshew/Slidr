import {
  assignText,
  faceKey,
  fontFaceCss,
  fontUrl,
  groupKey,
  parseFamilies,
  type Face,
} from './fontsMatch';
import type { SubsetFont, SubsetRequest } from './fontsSubset';
import { collectText } from './fontsText';

/**
 * Fonts inside the file (WG9-T09): the faces the rendered slides use, cut down to the characters
 * in use and embedded as WOFF2 (EXP-01).
 *
 * The faces are those the page registered with `@font-face` rules, which is how the app registers
 * its built-in library; this package knows nothing of that library and reads the rules. Fonts
 * that are assets of the deck are not touched here: every slide registers them itself, in its own
 * markup, and they go into the file whole with the other assets.
 */

export interface EmbeddedFont {
  family: string;
  style: string;
  /**
   * The `font-weight` of the face in the file. One weight; or the weights of the static fonts a
   * variable face became, each a rule of its own (`400, 700`); or the range of a variable font
   * that stayed one.
   */
  weight: string;
  /** Bytes of the font file the page loaded, and of what went into the exported file. */
  originalBytes: number;
  bytes: number;
  /** How many different characters of the slides the face covers. */
  characters: number;
  /** False when the font could not be cut down and went in whole. */
  subset: boolean;
}

export interface EmbeddedFonts {
  /** `@font-face` rules with the fonts inside, as data URIs. */
  css: string;
  fonts: EmbeddedFont[];
  /** What could not be embedded as asked, e.g. a face that went in whole. */
  warnings: string[];
}

interface Rule {
  face: Face;
  /** A rule of the slides themselves: it is in their markup, and in the file with it. */
  own: boolean;
}

/** The descriptors `fontFaceCss` writes itself; the others are copied as they are. */
const WRITTEN = new Set([
  'font-family',
  'font-style',
  'font-weight',
  'font-display',
  'src',
  'unicode-range',
]);

function readFace(style: CSSStyleDeclaration, base: string): Face {
  const value = (name: string) => style.getPropertyValue(name).trim();
  const rest: [string, string][] = [];
  for (let i = 0; i < style.length; i++) {
    const name = style.item(i);
    if (name && !WRITTEN.has(name) && value(name)) rest.push([name, value(name)]);
  }
  return {
    family: parseFamilies(value('font-family'))[0] ?? '',
    style: value('font-style'),
    weight: value('font-weight'),
    stretch: value('font-stretch') || value('font-width'),
    unicodeRange: value('unicode-range'),
    src: value('src'),
    base,
    rest,
  };
}

/** Every `@font-face` rule of the document, in order: a later rule wins where two overlap. */
function faceRules(doc: Document, host: HTMLElement): Rule[] {
  const view = doc.defaultView;
  const rules: Rule[] = [];
  if (!view) return rules;
  const read = (sheet: CSSStyleSheet, own: boolean) => {
    let list: CSSRuleList;
    try {
      list = sheet.cssRules;
    } catch {
      // A stylesheet from another origin cannot be read.
      return;
    }
    walk(list, own, sheet.href ?? doc.baseURI);
  };
  const walk = (list: CSSRuleList, own: boolean, base: string) => {
    for (const rule of Array.from(list)) {
      if (rule instanceof view.CSSFontFaceRule) {
        rules.push({ face: readFace(rule.style, base), own });
      } else if (rule instanceof view.CSSImportRule) {
        if (rule.styleSheet) read(rule.styleSheet, own);
      } else if ('cssRules' in rule) {
        // `@media`, `@supports`, `@layer`: the rules inside count as well.
        walk((rule as CSSGroupingRule).cssRules, own, base);
      }
    }
  };
  for (const sheet of [...Array.from(doc.styleSheets), ...(doc.adoptedStyleSheets ?? [])]) {
    read(sheet, sheet.ownerNode !== null && host.contains(sheet.ownerNode));
  }
  return rules;
}

function dataUri(bytes: Uint8Array<ArrayBuffer>, mime: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('could not read a font'));
    reader.readAsDataURL(new Blob([bytes], { type: mime }));
  });
}

/** What a font file is, by its first four bytes: its type, and the `format()` of its `src`. */
function fileType(bytes: Uint8Array): { mime: string; format?: string } {
  const signature = String.fromCharCode(...bytes.subarray(0, 4));
  if (signature === 'wOF2') return { mime: 'font/woff2', format: 'woff2' };
  if (signature === 'wOFF') return { mime: 'font/woff', format: 'woff' };
  if (signature === 'OTTO') return { mime: 'font/otf', format: 'opentype' };
  if (signature === 'ttcf') return { mime: 'font/collection', format: 'collection' };
  // TrueType outlines: version 1.0 as a fixed-point number, or Apple's `true`.
  if (signature === 'true' || (bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0)) {
    return { mime: 'font/ttf', format: 'truetype' };
  }
  return { mime: 'application/octet-stream' };
}

/** A face as a warning names it: `Rubik 300 900 italic`. */
const nameOf = (face: Face) =>
  [face.family, face.weight, face.style === 'normal' ? '' : face.style].filter(Boolean).join(' ');

/**
 * The fonts of the slides drawn under `host`, once they have loaded.
 *
 * A face goes into the file when the page has loaded it and the text of the slides can reach it:
 * a browser loads a face only for text that needs it, so the faces it loaded are the ones the
 * slides are drawn with (and those of whatever else the page shows; the text decides between
 * them). Each face is cut down to the characters of that text, and a variable face into a
 * static font for each weight the text has (see `subsetFonts` for why).
 */
export async function embedFonts(host: HTMLElement): Promise<EmbeddedFonts> {
  const doc = host.ownerDocument;
  const result: EmbeddedFonts = { css: '', fonts: [], warnings: [] };
  // A document without font loading, as in a test without a browser, has nothing to embed.
  if (!doc.fonts) return result;
  await doc.fonts.ready;

  const rules = faceRules(doc, host);
  const loaded = new Set(
    Array.from(doc.fonts)
      .filter((face) => face.status === 'loaded')
      .map(faceKey),
  );
  // The fonts of the deck are registered once by every copy of a slide on the page. The copies
  // outside the host say what the slides here say already.
  const own = new Set(rules.filter((rule) => rule.own).map((rule) => faceKey(rule.face)));
  const uses = assignText(
    rules.map((rule) => rule.face),
    collectText(host),
  );
  const faces = rules
    .filter((rule) => !rule.own && !own.has(faceKey(rule.face)) && loaded.has(faceKey(rule.face)))
    .flatMap(({ face }) => {
      const use = uses.get(face);
      return use ? [{ face, use }] : [];
    });
  if (!faces.length) return result;

  // The files, each read once: a family's Hebrew-only face shares the file of its Hebrew subset.
  const reading = new Map<string, Promise<Uint8Array<ArrayBuffer> | undefined>>();
  const read = async (url: string | undefined) => {
    if (!url) return undefined;
    let file = reading.get(url);
    if (!file) {
      file = fetch(url)
        .then(async (response) =>
          response.ok ? new Uint8Array(await response.arrayBuffer()) : undefined,
        )
        .catch(() => undefined);
      reading.set(url, file);
    }
    return file;
  };
  const files = await Promise.all(faces.map(({ face }) => read(fontUrl(face.src, face.base))));
  const fonts = faces.flatMap((entry, i) => {
    const bytes = files[i];
    if (bytes) return [{ ...entry, bytes }];
    // Only a font installed on this computer (`local()`), or a file that is gone.
    result.warnings.push(`Font ${nameOf(entry.face)} could not be read: it is not in the file`);
    return [];
  });
  if (!fonts.length) return result;

  // A rule can set features and axes for its face, as text can: then they are kept as well.
  const sets = (face: Face, descriptor: string) => face.rest.some(([name]) => name === descriptor);
  const requests = fonts.map(({ face, use, bytes }): SubsetRequest => ({
    bytes,
    byWeight: use.byWeight,
    features: use.features || sets(face, 'font-feature-settings'),
    instances: !use.variations && !sets(face, 'font-variation-settings'),
    group: groupKey(face),
  }));

  let cut: (SubsetFont[] | undefined)[];
  let subsetter = true;
  try {
    // The subsetter and the WOFF2 codec are heavy: they load here, on the first export with fonts.
    const { subsetFonts } = await import('./fontsSubset');
    cut = await subsetFonts(requests);
  } catch {
    subsetter = false;
    cut = requests.map(() => undefined);
    result.warnings.push(
      'The fonts went in whole: what cuts them down to the characters in use could not be loaded',
    );
  }

  const css: string[] = [];
  for (const [i, { face, use, bytes }] of fonts.entries()) {
    const parts = cut[i];
    // One rule for each font a face became: a variable face is a static font for each weight.
    const weights: number[] = [];
    let size = 0;
    for (const part of parts ?? []) {
      const weight = part.weight === undefined ? undefined : String(part.weight);
      const uri = await dataUri(part.bytes, 'font/woff2');
      css.push(fontFaceCss(face, { uri, format: 'woff2', weight }));
      if (part.weight !== undefined) weights.push(part.weight);
      size += part.bytes.byteLength;
    }
    if (!parts) {
      const type = fileType(bytes);
      css.push(fontFaceCss(face, { uri: await dataUri(bytes, type.mime), format: type.format }));
      size = bytes.byteLength;
      if (subsetter) {
        result.warnings.push(
          `Font ${nameOf(face)} went in whole: it could not be cut down to the characters in use`,
        );
      }
    }
    result.fonts.push({
      family: face.family,
      style: face.style || 'normal',
      weight: weights.length ? weights.join(', ') : face.weight || 'normal',
      originalBytes: bytes.byteLength,
      bytes: size,
      characters: use.codePoints.size,
      subset: Boolean(parts),
    });
  }
  result.css = css.join('\n');
  return result;
}
