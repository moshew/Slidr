/**
 * The half of font embedding that needs neither a document nor a font (WG9-T09): what an
 * `@font-face` rule says, which faces the browser picks for a piece of text, and the rule that
 * goes into the file.
 */

/** An `@font-face` rule, with its descriptors as the browser writes them. */
export interface Face {
  /** The family name, without quotes. */
  family: string;
  /** `normal`, `italic` or `oblique <angle>`. */
  style: string;
  /** One weight (`400`), or the range of a variable font (`100 900`). */
  weight: string;
  /** `font-stretch`, or an empty string when the rule has none. */
  stretch: string;
  /** Empty when the face covers every character. */
  unicodeRange: string;
  /** The `src` descriptor, and the address its URLs are relative to. */
  src: string;
  base: string;
  /** Every other descriptor, e.g. the metric overrides: written out as it is. */
  rest: (readonly [name: string, value: string])[];
}

/** Text of the slides in one font: a family list, a style and a weight. */
export interface TextUse {
  families: string[];
  style: FontStyleKind;
  weight: number;
  /** The text asks for OpenType features by name, so a face that draws it keeps them all. */
  features: boolean;
  /** The text sets variation axes itself, so the axes of a face that draws it stay whole. */
  variations: boolean;
  codePoints: Set<number>;
}

/** What the slides need of one face. */
export interface FaceUse {
  /** Every character the face draws. */
  codePoints: Set<number>;
  /**
   * The same characters by the weight they are drawn at: where on its weight axis, when the face
   * is a variable font. A weight outside the range of the face counts at the nearest end of it.
   */
  byWeight: Map<number, Set<number>>;
  features: boolean;
  variations: boolean;
}

export type FontStyleKind = 'normal' | 'italic' | 'oblique';
export type CodePointRange = readonly [first: number, last: number];

const LAST_CODE_POINT = 0x10ffff;

/**
 * The ranges of a `unicode-range` descriptor (`U+0590-05FF, U+20AA, U+4??`), in order and merged.
 * A face without one covers everything.
 */
export function parseUnicodeRange(text: string): CodePointRange[] {
  const ranges: [number, number][] = [];
  for (const part of text.split(',')) {
    const match = /^u\+([0-9a-f?]{1,6})(?:-([0-9a-f]{1,6}))?$/i.exec(part.trim());
    if (!match?.[1]) continue;
    // `U+4??` is every code point from U+400 to U+4FF.
    const first = parseInt(match[1].replace(/\?/g, '0'), 16);
    const last = parseInt(match[2] ?? match[1].replace(/\?/g, 'f'), 16);
    if (first <= last) ranges.push([first, Math.min(last, LAST_CODE_POINT)]);
  }
  if (!ranges.length) return text.trim() ? [] : [[0, LAST_CODE_POINT]];
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const range of ranges) {
    const previous = merged[merged.length - 1];
    if (previous && range[0] <= previous[1] + 1) previous[1] = Math.max(previous[1], range[1]);
    else merged.push([range[0], range[1]]);
  }
  return merged;
}

export function inRanges(ranges: readonly CodePointRange[], codePoint: number): boolean {
  let low = 0;
  let high = ranges.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const range = ranges[middle] as CodePointRange;
    if (codePoint < range[0]) high = middle - 1;
    else if (codePoint > range[1]) low = middle + 1;
    else return true;
  }
  return false;
}

/** The names of a `font-family` list, without their quotes. Generic names stay in it. */
export function parseFamilies(value: string): string[] {
  const names: string[] = [];
  const item = /\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^,]*))\s*(?:,|$)/y;
  while (item.lastIndex < value.length) {
    const match = item.exec(value);
    if (!match) break;
    const quoted = match[1] ?? match[2];
    const name =
      quoted !== undefined
        ? quoted.replace(/\\(.)/g, '$1')
        : (match[3] ?? '').trim().replace(/\s+/g, ' ');
    if (name) names.push(name);
  }
  return names;
}

/** The weights a `font-weight` descriptor covers: one, or the range of a variable font. */
export function parseWeightRange(value: string): [number, number] {
  const weights = value
    .trim()
    .split(/\s+/)
    .map((word) => (word === 'bold' ? 700 : Number(word) || 400));
  const first = weights[0] ?? 400;
  const second = weights[1] ?? first;
  return [Math.min(first, second), Math.max(first, second)];
}

export function styleKind(value: string): FontStyleKind {
  const word = value.trim().toLowerCase();
  return word.startsWith('italic') ? 'italic' : word.startsWith('oblique') ? 'oblique' : 'normal';
}

/** What tells one face from another, in one spelling for a rule and for a `FontFace` object. */
export function faceKey(face: {
  family: string;
  style: string;
  weight: string;
  unicodeRange: string;
}): string {
  return [
    face.family.toLowerCase(),
    face.style.trim().toLowerCase() || 'normal',
    parseWeightRange(face.weight).join('-'),
    parseUnicodeRange(face.unicodeRange)
      .map((range) => range.join('-'))
      .join(','),
  ].join('|');
}

/**
 * The faces a browser draws as one: the same family, style, weight and width, each with its own
 * `unicode-range` (CSS Fonts 4, 4.5: "a single composite face"). Font matching picks such a
 * group, never one of its faces. So the faces of a variable family become static fonts together
 * or not at all: one that kept its range would be a group of its own that holds the weights of
 * the static ones as well, and which of the two a browser then takes is not defined.
 */
export function groupKey(face: Face): string {
  return [
    face.family.toLowerCase(),
    face.style.trim().toLowerCase() || 'normal',
    parseWeightRange(face.weight).join('-'),
    face.stretch.trim().toLowerCase(),
  ].join('|');
}

/** A font file a browser can be given: the first `url()` of a `src` in a format it reads. */
export function fontUrl(src: string, base: string): string | undefined {
  const source =
    /url\(\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^)\s]*))\s*\)(?:\s*format\(\s*["']?([\w-]+)["']?\s*\))?/gi;
  for (const match of src.matchAll(source)) {
    const format = match[4]?.toLowerCase();
    if (format === 'embedded-opentype' || format === 'svg') continue;
    const quoted = match[1] ?? match[2];
    const url = quoted !== undefined ? quoted.replace(/\\(.)/g, '$1') : (match[3] ?? '');
    if (!url) continue;
    try {
      return new URL(url, base).href;
    } catch {
      continue;
    }
  }
  return undefined;
}

/**
 * Which style a browser falls back to when a family has no face of the style asked for (CSS
 * Fonts 4, 5.2). The angles of oblique faces are not weighed: all of them count as one style.
 */
const STYLE_ORDER: Record<FontStyleKind, readonly FontStyleKind[]> = {
  normal: ['normal', 'oblique', 'italic'],
  italic: ['italic', 'oblique', 'normal'],
  oblique: ['oblique', 'italic', 'normal'],
};

interface Candidate {
  face: Face;
  kind: FontStyleKind;
  weight: [number, number];
  ranges: CodePointRange[];
}

/**
 * The weights of a family that a browser draws text of a given weight with (CSS Fonts 4, 5.2): a
 * range that holds the weight, or else the nearest one, looking first towards the side the rule
 * names. Ranges it cannot tell apart are all returned.
 */
function matchWeight(candidates: readonly Candidate[], weight: number): Candidate[] {
  const within = candidates.filter((c) => c.weight[0] <= weight && weight <= c.weight[1]);
  if (within.length) return within;
  const above = candidates.filter((c) => c.weight[0] > weight);
  const below = candidates.filter((c) => c.weight[1] < weight);
  const lightest = Math.min(...above.map((c) => c.weight[0]));
  const boldest = Math.max(...below.map((c) => c.weight[1]));
  const up = above.filter((c) => c.weight[0] === lightest);
  const down = below.filter((c) => c.weight[1] === boldest);
  // Regular text takes a medium before a light, but a light before a bold.
  if (weight >= 400 && weight <= 500 && up.length && lightest <= 500) return up;
  if (weight <= 500) return down.length ? down : up;
  return up.length ? up : down;
}

/** The faces of one family that a browser considers for text of a style and a weight. */
function matchFaces(family: readonly Candidate[], style: FontStyleKind, weight: number) {
  // Faces of different widths are not weighed against each other: each width is matched alone.
  const widths = new Map<string, Candidate[]>();
  for (const candidate of family) {
    const width = candidate.face.stretch.trim().toLowerCase();
    const list = widths.get(width);
    if (list) list.push(candidate);
    else widths.set(width, [candidate]);
  }
  const matched: Candidate[] = [];
  for (const candidates of widths.values()) {
    const kind = STYLE_ORDER[style].find((k) => candidates.some((c) => c.kind === k));
    matched.push(
      ...matchWeight(
        candidates.filter((c) => c.kind === kind),
        weight,
      ),
    );
  }
  return matched;
}

const SPACE = 0x20;
const ZERO = 0x30;

/**
 * What each face has to draw: every character goes to the faces of its font list whose
 * `unicode-range` holds it, among those the browser matches to the style and the weight.
 *
 * This errs towards more. A browser stops at the first family that has a glyph for a character,
 * and only the font file knows which glyphs it has; here every family of the list takes the
 * character. A face that got characters this way and is never drawn is one the page did not
 * load, and the caller leaves those out.
 *
 * The space and the zero go to every face that can hold them, drawn or not: the first font of a
 * list that has a space sets the height of the lines, even of lines it draws nothing on, and the
 * width of its zero is the `ch` unit.
 */
export function assignText(faces: readonly Face[], uses: readonly TextUse[]): Map<Face, FaceUse> {
  const families = new Map<string, Candidate[]>();
  for (const face of faces) {
    const name = face.family.toLowerCase();
    const candidate: Candidate = {
      face,
      kind: styleKind(face.style),
      weight: parseWeightRange(face.weight),
      ranges: parseUnicodeRange(face.unicodeRange),
    };
    const family = families.get(name);
    if (family) family.push(candidate);
    else families.set(name, [candidate]);
  }

  const assigned = new Map<Face, FaceUse>();
  for (const use of uses) {
    for (const name of new Set(use.families.map((family) => family.toLowerCase()))) {
      const family = families.get(name);
      if (!family) continue;
      for (const { face, weight, ranges } of matchFaces(family, use.style, use.weight)) {
        const codePoints = [SPACE, ZERO, ...use.codePoints].filter((c) => inRanges(ranges, c));
        if (!codePoints.length) continue;
        let entry = assigned.get(face);
        if (!entry) {
          entry = {
            codePoints: new Set(),
            byWeight: new Map(),
            features: false,
            variations: false,
          };
          assigned.set(face, entry);
        }
        const drawnAt = Math.min(Math.max(use.weight, weight[0]), weight[1]);
        let atWeight = entry.byWeight.get(drawnAt);
        if (!atWeight) entry.byWeight.set(drawnAt, (atWeight = new Set()));
        for (const codePoint of codePoints) {
          entry.codePoints.add(codePoint);
          atWeight.add(codePoint);
        }
        entry.features ||= use.features;
        entry.variations ||= use.variations;
      }
    }
  }
  return assigned;
}

/** Pairs a right-to-left line draws the other way round: its `(` is drawn with the glyph of `)`. */
const MIRRORED = '()[]{}<>«»‹›≤≥≪≫⁅⁆⁽⁾₍₎〈〉⟨⟩⟪⟫⟦⟧';

/**
 * The composed characters that fall apart into others (`é` into `e` and an accent), with their
 * parts. The Hebrew presentation forms are among them: a font without mark positioning draws a
 * letter and its dagesh as one of those.
 */
let composed: { codePoint: number; parts: number[] }[] | undefined;
function composedCharacters() {
  if (composed) return composed;
  composed = [];
  // Latin, Greek, Cyrillic, Hebrew, Arabic, the Indic scripts and kana; then the presentation
  // forms. Hangul syllables are left out: there are thousands, and their fonts are not cut here.
  for (const [first, last] of [
    [0xc0, 0x33ff],
    [0xfb1d, 0xfb4f],
  ] as const) {
    for (let codePoint = first; codePoint <= last; codePoint++) {
      const parts = Array.from(String.fromCodePoint(codePoint).normalize('NFD'), (char) =>
        Number(char.codePointAt(0)),
      );
      if (parts.length > 1) composed.push({ codePoint, parts });
    }
  }
  return composed;
}

const MARK = /\p{M}/u;

/**
 * The characters a shaper may draw for the ones in the text. It works on what the font offers:
 * a letter followed by an accent is drawn as the one composed character where the font has it,
 * and a composed character the font lacks is drawn from its parts. A subset has to keep both
 * forms, or the text is shaped differently from the editor's. Brackets take their mirror image.
 */
export function shapedCodePoints(codePoints: Iterable<number>): Set<number> {
  const all = new Set(codePoints);
  let marks = false;
  for (const codePoint of Array.from(all)) {
    const char = String.fromCodePoint(codePoint);
    for (const part of char.normalize('NFD')) all.add(Number(part.codePointAt(0)));
    const pair = MIRRORED.indexOf(char);
    if (pair !== -1) all.add(MIRRORED.charCodeAt(pair ^ 1));
  }
  for (const codePoint of all) {
    if (MARK.test(String.fromCodePoint(codePoint))) {
      marks = true;
      break;
    }
  }
  if (marks) {
    for (const { codePoint, parts } of composedCharacters()) {
      if (parts.every((part) => all.has(part))) all.add(codePoint);
    }
  }
  return all;
}

/**
 * A CSS string literal that stays one: a line break or another control character in the text
 * would end it where it stands, and the rest would be read as CSS of the file.
 */
function cssString(value: string): string {
  return `"${value
    .replace(/["\\]/g, '\\$&')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, (char) => `\\${char.charCodeAt(0).toString(16)} `)}"`;
}

const FEATURES = 'font-feature-settings';

/**
 * Kerning, asked for by name. Every engine kerns without being asked, but Firefox then leaves the
 * spaces out of it, unless the font has some other rule about the space; a subset has lost those
 * rules, and many fonts never had one. Asked for by name, kerning takes the spaces along, as it
 * does in the editor's engine: the lines of a file come out as wide in Firefox as in the editor.
 * (Measured on fourteen of the built-in fonts: up to 0.85% wider without it, 0.01% with it.)
 */
function withKerning(features: string | undefined): string {
  if (!features) return '"kern"';
  // A rule that says something about kerning itself, e.g. turns it off, keeps its say.
  return features.includes('kern') ? features : `${features}, "kern"`;
}

/**
 * The rule of a face in the exported file: its descriptors as they were, the font inside as a
 * data URI. `block`, as in the editor: text does not show in another font first and then re-wrap.
 */
export function fontFaceCss(
  face: Face,
  font: { uri: string; format?: string; weight?: string },
): string {
  const features = face.rest.find(([name]) => name === FEATURES)?.[1];
  return [
    '@font-face {',
    `font-family: ${cssString(face.family)};`,
    `font-style: ${face.style.trim() || 'normal'};`,
    `font-weight: ${font.weight ?? (face.weight.trim() || 'normal')};`,
    ...face.rest.filter(([name]) => name !== FEATURES).map(([name, value]) => `${name}: ${value};`),
    `${FEATURES}: ${withKerning(features)};`,
    'font-display: block;',
    `src: url("${font.uri}")${font.format ? ` format("${font.format}")` : ''};`,
    face.unicodeRange.trim() ? `unicode-range: ${face.unicodeRange.trim()};` : '',
    '}',
  ]
    .filter(Boolean)
    .join(' ');
}
