import type { Color, CssPassthrough, Shadow, Stroke } from '@slidr/model';
import { readCss } from '../color';
import { emu } from '../units';
import { el } from '../xml';
import type { ExportContext } from './context';
import { fillXml, shadowXml, solidFillXml } from './drawing';
import type { PartRels } from '../opc';

/*
 * The CSS an element keeps for what the model has no field for (SPEC 5.9), where DrawingML has
 * one: the text effects of a box (TXT-11: a gradient fill, an outline and a shadow of the
 * letters), and a box's own background, border, round corners and shadow.
 */

export interface CssLook {
  /** The letters' fill, outline and shadow, as the children of a run's properties. */
  text?: { fill?: string; line?: string; effects?: string };
  /** The box: what it is filled with, its outline, corners and shadow. */
  background?: string;
  border?: Stroke;
  radius?: number;
  shadow?: Shadow;
}

/** Splits CSS at the commas or spaces outside parentheses. */
function split(text: string, by: ',' | ' '): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (depth === 0 && (by === ',' ? c === ',' : /\s/.test(c))) {
      out.push(text.slice(start, i));
      start = i + 1;
    }
  }
  out.push(text.slice(start));
  return out.map((s) => s.trim()).filter(Boolean);
}

const px = (token: string | undefined): number | undefined => {
  if (!token) return undefined;
  const m = /^(-?[\d.]+)(px)?$/.exec(token);
  return m ? Number(m[1]) : undefined;
};

function colorOf(token: string): Color | undefined {
  const value = readCss(token);
  if (!value) return undefined;
  return 'token' in value ? value : { value: token };
}

/** `1px dashed #ccc`, in any order. */
function strokeOf(text: string): Stroke | undefined {
  let width: number | undefined;
  let dash: Stroke['dash'];
  let color: Color | undefined;
  for (const token of split(text, ' ')) {
    const n = px(token);
    if (n !== undefined) width = n;
    else if (token === 'solid' || token === 'double') dash = 'solid';
    else if (token === 'dashed') dash = 'dashed';
    else if (token === 'dotted') dash = 'dotted';
    else if (token === 'none' || token === 'hidden') return undefined;
    else color = colorOf(token) ?? color;
  }
  if (!width) return undefined;
  return { width, color: color ?? { value: '#000000' }, ...(dash ? { dash } : {}) };
}

/** The first shadow of a list that is not inset: `x y blur [spread] colour`. */
function shadowOf(text: string): Shadow | undefined {
  for (const one of split(text, ',')) {
    const tokens = split(one, ' ');
    if (tokens.includes('inset')) continue;
    const numbers: number[] = [];
    let color: Color | undefined;
    for (const token of tokens) {
      const n = px(token);
      if (n !== undefined) numbers.push(n);
      else color = colorOf(token) ?? color;
    }
    if (numbers.length < 2) continue;
    return {
      x: numbers[0]!,
      y: numbers[1]!,
      blur: Math.max(0, numbers[2] ?? 0),
      color: color ?? { value: '#000000', alpha: 0.3 },
    };
  }
  return undefined;
}

export async function readCssLook(
  css: CssPassthrough | undefined,
  ctx: ExportContext,
  rels: PartRels,
  box: { w: number; h: number },
  alpha: number,
): Promise<CssLook> {
  if (!css) return {};
  const get = (name: string) => {
    for (const [key, value] of Object.entries(css)) {
      if (key.trim().toLowerCase() === name) return value.trim();
    }
    return undefined;
  };
  const look: CssLook = {};
  const clipped = get('background-clip') === 'text' || get('-webkit-background-clip') === 'text';
  const background = get('background-image') ?? get('background') ?? get('background-color');
  const text: NonNullable<CssLook['text']> = {};
  if (clipped && background) {
    text.fill = await fillXml({ kind: 'css', value: background }, ctx, rels, box, alpha);
  } else if (background && background !== 'none' && background !== 'transparent') {
    look.background = await fillXml({ kind: 'css', value: background }, ctx, rels, box, alpha);
  }
  if (get('-webkit-text-fill-color') === 'transparent' && !text.fill) text.fill = el('a:noFill');
  const stroke = get('-webkit-text-stroke');
  if (stroke) {
    const tokens = split(stroke, ' ');
    const width = px(tokens[0]);
    const color = tokens[1] ? colorOf(tokens.slice(1).join(' ')) : undefined;
    if (width && color) text.line = el('a:ln', { w: emu(width) }, solidFillXml(color, alpha));
  }
  const textShadow = get('text-shadow');
  const glyphShadow = textShadow ? shadowOf(textShadow) : undefined;
  if (glyphShadow) text.effects = el('a:effectLst', {}, shadowXml(glyphShadow, alpha));
  if (text.fill || text.line || text.effects) look.text = text;
  const border = get('border') ?? get('outline');
  if (border) {
    const parsed = strokeOf(border);
    if (parsed) look.border = parsed;
  }
  const radius = px(get('border-radius'));
  if (radius) look.radius = radius;
  const boxShadow = get('box-shadow');
  const shadow = boxShadow ? shadowOf(boxShadow) : undefined;
  if (shadow) look.shadow = shadow;
  return look;
}
