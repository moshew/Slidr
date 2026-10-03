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

/**
 * A font family list where each script gets the face meant for it (SPEC 5.5). The Latin face
 * comes first: Latin faces rarely carry Hebrew glyphs, so Hebrew text falls through to the
 * Hebrew face, while Hebrew faces usually do carry Latin and would otherwise take it over.
 * A Latin face that has Hebrew glyphs keeps them; per-script `unicode-range` faces (WG2-T02)
 * are the full answer.
 */
export function fontStack(pair: FontPair): string {
  const names = pair.latin === pair.he ? [pair.latin] : [pair.latin, pair.he];
  return [...names.map(cssString), 'sans-serif'].join(', ');
}

/** One family with the role's stack behind it, so a run in a Latin face keeps Hebrew covered. */
export function runFontStack(font: string, role: TextStyle['font']): string {
  return `${cssString(font)}, var(--font-${role})`;
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
    rules.push(
      `@font-face { font-family: ${cssString(asset.font.family)}; font-weight: ${asset.font.weight}; font-style: ${asset.font.style}; font-display: block; src: ${cssUrl(src)}; }`,
    );
  }
  return rules.join('\n');
}
