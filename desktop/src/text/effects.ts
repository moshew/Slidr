import { ColorToken, type Color, type CssPassthrough, type Shadow } from '@slidr/model';
import { colorCss } from '@slidr/renderer';

/*
 * Text effects (TXT-11): a gradient fill, an outline and a shadow for all the text of a box. The
 * model has no fields for them; they are CSS of the element (`css`, SPEC 5.9), which the renderer
 * applies to the element's box and the text inherits:
 *
 *   fill      background-image: linear-gradient(<angle>deg, <from>, <to>)
 *             background-clip: text  (and -webkit-background-clip)
 *             -webkit-text-fill-color: transparent
 *   outline   -webkit-text-stroke: <width>px <colour>;  paint-order: stroke fill
 *   shadow    text-shadow: <x>px <y>px <blur>px <colour>
 *
 * A colour of the theme is written as its variable (`var(--color-primary)`, as `colorCss` writes
 * it), so the effect follows a change of theme. This module reads the three effects out of a
 * `css` record and writes them back, and leaves every other property as it is. Pure: no DOM.
 */

/** A two-stop linear gradient; the angle is CSS's (0 is upwards, 90 to the right). */
export interface TextGradient {
  angle: number;
  from: Color;
  to: Color;
}

/** The width is that of the stroke, which is drawn behind the letters: half of it shows. */
export interface TextOutline {
  width: number;
  color: Color;
}

/** As the element's own shadow, without spread: text has none. */
export type TextShadow = Omit<Shadow, 'spread'>;

/**
 * `custom` is CSS this module did not write and cannot show in its controls: what an imported
 * deck brought (two shadows, a radial gradient). It is drawn, and kept until the user changes
 * that effect.
 */
export type Effect<T> = T | 'custom' | null;

export interface TextEffects {
  fill: Effect<TextGradient>;
  outline: Effect<TextOutline>;
  shadow: Effect<TextShadow>;
}

/** What to set; null takes the effect away. An effect that is not named is left as it is. */
export interface TextEffectsPatch {
  fill?: TextGradient | null;
  outline?: TextOutline | null;
  shadow?: TextShadow | null;
}

/** The properties each effect owns: all of them go when the effect is changed or removed. */
const FILL = [
  'background-image',
  'background-clip',
  '-webkit-background-clip',
  '-webkit-text-fill-color',
];
const OUTLINE = [
  '-webkit-text-stroke',
  '-webkit-text-stroke-width',
  '-webkit-text-stroke-color',
  'paint-order',
];
const SHADOW = ['text-shadow'];

const nameOf = (key: string) => key.trim().toLowerCase();

/** The declarations of a `css` record by property name, as CSS reads them: any case, trimmed. */
function declarations(css: CssPassthrough | undefined): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(css ?? {})) out.set(nameOf(key), value.trim());
  return out;
}

/** The parts of a value between the commas that are not inside brackets. */
function splitTop(value: string, separator: ',' | ' '): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char === '(') depth++;
    else if (char === ')') depth--;
    else if (char === separator && depth === 0) {
      parts.push(value.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(value.slice(start));
  return parts.map((part) => part.trim()).filter(Boolean);
}

const PLAIN_COLOR = /^(?:#[0-9a-f]{3,8}|[a-z]+|[a-z-]+\([^()]*\))$/i;

/** A colour as `colorCss` writes it, back as a model colour. Undefined for what it never writes. */
export function parseColor(css: string): Color | undefined {
  const text = css.trim();
  const mix = /^color-mix\(in srgb,\s*(.+)\s+([\d.]+)%,\s*transparent\)$/i.exec(text);
  if (mix?.[1] && mix[2]) {
    const base = parseColor(mix[1]);
    return base && base.alpha === undefined ? { ...base, alpha: Number(mix[2]) / 100 } : undefined;
  }
  const token = ColorToken.safeParse(/^var\(--color-([a-z]+)\)$/.exec(text)?.[1]);
  if (token.success) return { token: token.data };
  return PLAIN_COLOR.test(text) ? { value: text } : undefined;
}

function readFill(css: Map<string, string>): Effect<TextGradient> {
  const clipped =
    css.get('background-clip') === 'text' || css.get('-webkit-background-clip') === 'text';
  if (!clipped && !css.has('-webkit-text-fill-color')) return null;
  const gradient = /^linear-gradient\(\s*(-?[\d.]+)deg\s*,(.+)\)$/i.exec(
    css.get('background-image') ?? '',
  );
  const stops = gradient?.[2] ? splitTop(gradient[2], ',') : [];
  const from = stops[0] ? parseColor(stops[0]) : undefined;
  const to = stops[1] ? parseColor(stops[1]) : undefined;
  if (!clipped || !gradient || stops.length !== 2 || !from || !to) return 'custom';
  if (css.get('-webkit-text-fill-color') !== 'transparent') return 'custom';
  return { angle: Number(gradient[1]), from, to };
}

function readOutline(css: Map<string, string>): Effect<TextOutline> {
  const stroke = css.get('-webkit-text-stroke');
  const longhand = css.has('-webkit-text-stroke-width') || css.has('-webkit-text-stroke-color');
  if (stroke === undefined) return longhand ? 'custom' : null;
  const parts = /^([\d.]+)px\s+(.+)$/.exec(stroke);
  const color = parts?.[2] ? parseColor(parts[2]) : undefined;
  return parts && color && !longhand ? { width: Number(parts[1]), color } : 'custom';
}

function readShadow(css: Map<string, string>): Effect<TextShadow> {
  const shadow = css.get('text-shadow');
  if (shadow === undefined || shadow === 'none') return null;
  const parts = /^(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px\s+(.+)$/.exec(shadow);
  const color = parts?.[4] ? parseColor(parts[4]) : undefined;
  // Several shadows are a list; one whose colour is no single colour is one too.
  if (!parts || !color || splitTop(shadow, ',').length !== 1) return 'custom';
  return { x: Number(parts[1]), y: Number(parts[2]), blur: Number(parts[3]), color };
}

/** The text effects a `css` record holds. */
export function readTextEffects(css: CssPassthrough | undefined): TextEffects {
  const all = declarations(css);
  return { fill: readFill(all), outline: readOutline(all), shadow: readShadow(all) };
}

/** Rounds away the noise of a dragged slider, as the renderer does for what it writes. */
const px = (value: number) => `${Math.round(value * 100) / 100}px`;

/**
 * The `css` record with the given effects set or removed, and everything else in it untouched.
 * Undefined when nothing is left: the element then needs no `css` at all.
 */
export function writeTextEffects(
  css: CssPassthrough | undefined,
  patch: TextEffectsPatch,
): CssPassthrough | undefined {
  const dropped = new Set<string>();
  const added: [string, string][] = [];
  if (patch.fill !== undefined) {
    for (const name of FILL) dropped.add(name);
    // A `background` shorthand that was the fill of the text goes with it.
    if (readFill(declarations(css)) !== null) dropped.add('background');
    if (patch.fill) {
      const { angle, from, to } = patch.fill;
      const turn = Math.round(angle * 100) / 100;
      added.push(
        ['background-image', `linear-gradient(${turn}deg, ${colorCss(from)}, ${colorCss(to)})`],
        ['background-clip', 'text'],
        ['-webkit-background-clip', 'text'],
        ['-webkit-text-fill-color', 'transparent'],
      );
    }
  }
  if (patch.outline !== undefined) {
    for (const name of OUTLINE) dropped.add(name);
    if (patch.outline) {
      added.push(
        ['-webkit-text-stroke', `${px(patch.outline.width)} ${colorCss(patch.outline.color)}`],
        // Behind the letters, so the stroke does not eat into them.
        ['paint-order', 'stroke fill'],
      );
    }
  }
  if (patch.shadow !== undefined) {
    for (const name of SHADOW) dropped.add(name);
    if (patch.shadow) {
      const { x, y, blur, color } = patch.shadow;
      added.push(['text-shadow', `${px(x)} ${px(y)} ${px(blur)} ${colorCss(color)}`]);
    }
  }
  const kept = Object.entries(css ?? {}).filter(([key]) => !dropped.has(nameOf(key)));
  const next = Object.fromEntries([...kept, ...added]);
  return Object.keys(next).length > 0 ? next : undefined;
}
