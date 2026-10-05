import type { AssetMeta, Color, FontPair, Shadow, TextStyle, Theme } from '@slidr/model';
import { cssString, cssUrl, num } from './css';

/**
 * A colour as CSS. Tokens become `var(--color-<token>)`, so a theme change restyles every element
 * that follows the theme without re-rendering it, and HTML written against the same variables
 * follows too (RND-08).
 */
export function colorCss(color: Color): string {
  const base = 'token' in color ? `var(--color-${color.token})` : color.value;
  const { alpha } = color;
  if (alpha === undefined || alpha >= 1) return base;
  if (alpha <= 0) return 'transparent';
  return `color-mix(in srgb, ${base} ${num(alpha * 100, 2)}%, transparent)`;
}

/** The Hebrew letters, the shekel sign and the Hebrew presentation forms. */
const HEBREW_RANGE = 'U+0590-05FF,U+20AA,U+FB1D-FB4F';

/** The name of a family's Hebrew-only face: its Hebrew letters and nothing else. */
export function hebrewFace(family: string): string {
  return `${family}::hebrew`;
}

/**
 * The faces to register a second time as Hebrew-only faces: of the faces a host registers, those
 * whose `unicode-range` holds the Hebrew block, renamed and narrowed to it. `fontStack` names
 * these faces, so a host that knows the files of its fonts registers them next to the originals.
 */
export function hebrewFaces<T extends { family: string; unicodeRange?: string }>(
  faces: readonly T[],
): T[] {
  return faces
    .filter((face) => face.unicodeRange?.includes('U+0590-05FF'))
    .map((face) => ({ ...face, family: hebrewFace(face.family), unicodeRange: HEBREW_RANGE }));
}

/**
 * A font family list where each script gets the face meant for it (SPEC 5.5). The Hebrew-only
 * face of the Hebrew family comes first and takes the Hebrew letters; then the Latin family, for
 * everything else; then the whole Hebrew family behind it. Without the first, a Latin family that
 * has Hebrew letters of its own (Rubik, Open Sans, Arial) would take the Hebrew text too. Where
 * nobody registered that face (a system font, a font that came as an asset) the name is skipped
 * and the Latin family comes first, which is right whenever it has no Hebrew.
 */
export function fontStack(pair: FontPair): string {
  const names =
    pair.latin === pair.he
      ? [familyCss(pair.latin)]
      : [cssString(hebrewFace(pair.he)), familyCss(pair.latin), familyCss(pair.he)];
  return [...names, 'sans-serif'].join(', ');
}

/** The generic families of CSS: keywords, which name no font when they are written in quotes. */
const GENERIC_FAMILIES = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'emoji',
  'math',
  'fangsong',
]);

/**
 * A font family as CSS: a quoted name, or a generic family as the keyword it is. Imported text
 * keeps whatever the source used (SPEC 5.9), and `"monospace"` in quotes is a family nobody has.
 */
export function familyCss(family: string): string {
  const keyword = family.trim().toLowerCase();
  return GENERIC_FAMILIES.has(keyword) ? keyword : cssString(family);
}

/** One family with the role's stack behind it, so a run in a Latin face keeps Hebrew covered. */
export function runFontStack(font: string, role: TextStyle['font']): string {
  return `${familyCss(font)}, var(--font-${role})`;
}

export function shadowCss(shadow: Shadow): string {
  const spread = shadow.spread ? ` ${shadow.spread}px` : '';
  return `${shadow.x}px ${shadow.y}px ${shadow.blur}px${spread} ${colorCss(shadow.color)}`;
}

/**
 * The theme as CSS custom properties, set on every slide root: `--color-*`, `--font-heading`,
 * `--font-body`, `--radius` and `--shadow`. This is the contract HTML written for a slide
 * relies on (SPEC 11.5, RND-08).
 */
export function themeVariables(theme: Theme): Record<string, string> {
  const { chart, ...colors } = theme.colors;
  const vars: Record<string, string> = {};
  for (const [name, value] of Object.entries(colors)) vars[`--color-${name}`] = value;
  chart.forEach((value, i) => (vars[`--color-chart-${i + 1}`] = value));
  vars['--font-heading'] = fontStack(theme.fonts.heading);
  vars['--font-body'] = fontStack(theme.fonts.body);
  vars['--radius'] = `${theme.radius}px`;
  // The theme shadow may itself use a colour token; it resolves against the same root.
  vars['--shadow'] = shadowCss(theme.shadow);
  return vars;
}

/** The theme variables as a CSS declaration block, for documents that do not inherit them. */
export function themeVariablesCss(theme: Theme): string {
  return Object.entries(themeVariables(theme))
    .map(([name, value]) => `${name}: ${value};`)
    .join(' ');
}

/*
 * What a face of a font asset may say of itself, as CSS writes it. The deck holds these as free
 * text, and they are written into a stylesheet of the page that draws the slide: text that is
 * not of the form is left out, so nothing a deck holds there is read as anything but a weight, a
 * style or a range.
 */
const NUMBER = String.raw`\d{1,4}(?:\.\d+)?`;
const FACE_WEIGHT = new RegExp(`^(?:normal|bold|${NUMBER}(?:\\s+${NUMBER})?)$`, 'i');
const FACE_STYLE = new RegExp(`^(?:normal|italic|oblique(?:\\s+-?${NUMBER}deg){0,2})$`, 'i');
const RANGE = String.raw`u\+[0-9a-f?]{1,6}(?:-[0-9a-f]{1,6})?`;
const FACE_RANGE = new RegExp(`^${RANGE}(?:\\s*,\\s*${RANGE})*$`, 'i');

/** A descriptor of a face when its value is of the form, and nothing when it is not. */
function descriptor(name: string, value: string | undefined, form: RegExp): string {
  const text = value?.trim();
  return text && form.test(text) ? ` ${name}: ${text};` : '';
}

/**
 * `@font-face` rules for the fonts a deck carries as assets (SPEC 5.7): an imported deck looks the
 * same on a machine that does not have its fonts installed.
 */
export function deckFontFaces(
  assets: Record<string, AssetMeta>,
  url: (asset: AssetMeta) => string | undefined,
): string {
  const rules: string[] = [];
  for (const asset of Object.values(assets)) {
    if (asset.kind !== 'font' || !asset.font) continue;
    const src = url(asset);
    if (!src) continue;
    const { family, weight, style, unicodeRange } = asset.font;
    rules.push(
      `@font-face { font-family: ${cssString(family)};${descriptor('font-weight', weight, FACE_WEIGHT)}${descriptor('font-style', style, FACE_STYLE)} font-display: block; src: ${cssUrl(src)};${
        // A family that came in subsets (one file per script) keeps them apart, as the source did.
        descriptor('unicode-range', unicodeRange, FACE_RANGE)
      } }`,
    );
  }
  return rules.join('\n');
}
