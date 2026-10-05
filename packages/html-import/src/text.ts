/**
 * A rendered block of text as a model paragraph (SPEC 5.4, 11.5): runs with their marks,
 * direction, alignment, line height and list marker, all read from computed styles. What the
 * text model has no field for goes into the element's `css` when it holds for the whole
 * block, and makes the block unsuitable (it then stays HTML) when it holds for a part of it.
 */
import type { Color, ListInfo, Marks, Paragraph, Run, Theme } from '@slidr/model';
import {
  alphaOf,
  collapseWhitespace,
  fontFamilies,
  isGenericFamily,
  px,
  round,
  scalePx,
} from './css';
import {
  composedChildNodes,
  composedParent,
  isElement,
  isSvg,
  isText,
  linkAround,
  neverRendered,
  ownPaint,
  pseudoKind,
  pseudoText,
  styleOf,
  subtreeHidden,
} from './measure';
import { chooseTextStyle, marksOver, type TextLook, type ThemeValues } from './tokens';

export interface TextTheme {
  theme: Theme;
  values: ThemeValues;
  /**
   * A computed colour as a model colour: a theme token when the property of that element
   * takes it from the theme (see `readThemeUse`), the value otherwise.
   */
  color(css: string, node: Element, property: string, pseudo?: string): Color;
  /** False for a foreign document: its text is not tied to the theme's fonts and text styles. */
  link: boolean;
  /**
   * A forced conversion (HTM-05): text with styling the model has no field for becomes a text
   * element all the same, without that styling, instead of staying html.
   */
  lossy?: boolean;
}

/**
 * Inherited properties that change how text looks and have no field in the model, with the
 * value each has when nobody set it. On the element's box they reach its text by inheritance.
 */
const TEXT_PASSTHROUGH: readonly (readonly [string, readonly string[]])[] = [
  ['text-shadow', ['none']],
  ['font-stretch', ['100%', 'normal']],
  ['font-feature-settings', ['normal']],
  ['font-variation-settings', ['normal']],
  ['font-variant-numeric', ['normal']],
  ['font-variant-caps', ['normal']],
  ['font-variant-ligatures', ['normal']],
  ['font-kerning', ['auto']],
  ['word-spacing', ['0px', 'normal']],
  ['word-break', ['normal']],
  ['line-break', ['auto']],
  ['hyphens', ['manual']],
  ['text-wrap-style', ['auto', '']],
  ['text-align-last', ['auto']],
  ['tab-size', ['8']],
  ['text-rendering', ['auto']],
  ['-webkit-font-smoothing', ['auto', '']],
  ['font-optical-sizing', ['auto']],
  ['text-underline-offset', ['auto']],
];

/** What cannot be said per run and cannot be put on the box either. */
function unsupportedText(cs: CSSStyleDeclaration, lossy = false): string | undefined {
  if (cs.writingMode !== 'horizontal-tb') return 'vertical writing mode';
  // A forced conversion shows the whole text where the HTML cut it short.
  if (lossy) return undefined;
  if (cs.getPropertyValue('-webkit-line-clamp') !== 'none') return 'line clamp';
  if (cs.textOverflow !== 'clip' && cs.overflowX !== 'visible') return 'text-overflow';
  return undefined;
}

function passthrough(cs: CSSStyleDeclaration, scale: number): Record<string, string> {
  const css: Record<string, string> = {};
  for (const [property, initial] of TEXT_PASSTHROUGH) {
    const value = cs.getPropertyValue(property);
    if (value && !initial.includes(value)) css[property] = scalePx(value, scale);
  }
  const stroke = px(cs.getPropertyValue('-webkit-text-stroke-width'));
  if (stroke > 0) {
    css['-webkit-text-stroke'] =
      `${round(stroke * scale)}px ${cs.getPropertyValue('-webkit-text-stroke-color')}`;
  }
  return css;
}

/** Text shown through the box's background (gradient text). */
function clippedBackground(cs: CSSStyleDeclaration, scale: number): Record<string, string> {
  const clip = cs.getPropertyValue('-webkit-background-clip') || cs.backgroundClip;
  if (clip !== 'text' || cs.backgroundImage === 'none') return {};
  return {
    'background-image': scalePx(cs.backgroundImage, scale),
    'background-size': scalePx(cs.backgroundSize, scale),
    'background-position': scalePx(cs.backgroundPosition, scale),
    'background-repeat': cs.backgroundRepeat,
    '-webkit-background-clip': 'text',
    'background-clip': 'text',
    '-webkit-text-fill-color': cs.getPropertyValue('-webkit-text-fill-color'),
  };
}

interface FontProbe {
  /** The width of the text set in the font list, or undefined where nothing can measure. */
  width(font: string, text: string): number | undefined;
  available: Map<string, boolean>;
  has: Map<string, boolean>;
}

const probes = new WeakMap<Document, FontProbe>();

function probeOf(doc: Document): FontProbe {
  let probe = probes.get(doc);
  if (!probe) {
    const ctx = doc.createElement('canvas').getContext('2d');
    probe = {
      width: (font, text) => {
        if (!ctx) return undefined;
        ctx.font = font;
        return ctx.measureText(text).width;
      },
      available: new Map(),
      has: new Map(),
    };
    probes.set(doc, probe);
  }
  return probe;
}

const quoted = (name: string) => `"${name.replace(/["\\]/g, '\\$&')}"`;

/**
 * Whether the document can draw text in the family: a named family that is neither installed
 * nor loaded draws exactly like the fallback after it.
 */
function familyAvailable(name: string, doc: Document): boolean {
  if (isGenericFamily(name)) return true;
  const probe = probeOf(doc);
  const cached = probe.available.get(name);
  if (cached !== undefined) return cached;
  const sample = 'mmmmmmmmmmlli שלום 0123';
  const found =
    probe.width(`72px ${quoted(name)}, monospace`, sample) !==
      probe.width('72px monospace', sample) ||
    probe.width(`72px ${quoted(name)}, serif`, sample) !== probe.width('72px serif', sample);
  probe.available.set(name, found);
  return found;
}

/**
 * Whether the family has a glyph of its own for the character. With one, what comes after the
 * family in the list makes no difference to how the character is drawn; without one, the
 * character is as wide as whatever comes after. `face`: the style and weight asked for; the
 * faces of one family do not all hold the same letters (Segoe UI has Hebrew, its Black has not).
 */
function familyHas(name: string, char: string, face: string, doc: Document): boolean {
  if (isGenericFamily(name)) return true;
  const probe = probeOf(doc);
  const key = `${face}\n${name}\n${char}`;
  const cached = probe.has.get(key);
  if (cached !== undefined) return cached;
  const [a, b, c] = ['monospace', 'serif', 'sans-serif'].map((after) =>
    probe.width(`${face} 72px ${quoted(name)}, ${after}`, char),
  );
  const found = a === b && b === c;
  probe.has.set(key, found);
  return found;
}

/** Characters that are drawn with the one before them, whatever font has them. */
const JOINS_PREVIOUS = /^(?:\p{M}|\u200c|\u200d|\ufe0e|\ufe0f)$/u;

/**
 * The run, cut where the family that draws it changes. The browser takes each character from
 * the first family of the list that has it: Hebrew in a list that opens with a Latin-only
 * font is drawn by a later one. A font mark names one family, so each stretch gets its own.
 */
function byFamily(run: RawRun, doc: Document): RawRun[] {
  const families = run.look.families.filter((family) => familyAvailable(family, doc));
  if (families.length < 2) return [run];
  const cut: RawRun[] = [];
  const face = `${run.look.italic ? 'italic' : 'normal'} ${run.look.weight}`;
  let font: string | undefined;
  for (const char of run.text) {
    const family =
      font !== undefined && JOINS_PREVIOUS.test(char)
        ? font
        : (families.find((f) => familyHas(f, char, face, doc)) ?? font ?? families[0]!);
    const last = cut[cut.length - 1];
    if (last && family === font) last.text += char;
    else cut.push({ ...run, text: char, look: { ...run.look, font: family } });
    font = family;
  }
  return cut.length > 0 ? cut : [run];
}

/**
 * The height the style gives a line, in its own CSS px; undefined when it gives none the model
 * can hold: `normal`, which the font decides, and a height of nothing (`line-height: 0`, a
 * common way to centre a figure in a badge), where the glyphs are simply drawn around the
 * line's place. A single line sits the same under any height once its box is put where the
 * glyphs were, which the guard does by measuring.
 */
export function lineHeightPx(cs: CSSStyleDeclaration): number | undefined {
  if (cs.lineHeight === 'normal') return undefined;
  const height = px(cs.lineHeight);
  return height > 0 ? height : undefined;
}

/** How the browser shows the text of an element, in slide pixels. */
export function lookOf(
  node: Element,
  pseudo: string | undefined,
  cs: CSSStyleDeclaration,
  scale: number,
  ctx: TextTheme,
): TextLook {
  const families = fontFamilies(cs.fontFamily);
  const transform = cs.textTransform;
  return {
    families,
    font: families.find((f) => familyAvailable(f, node.ownerDocument)) ?? families[0],
    size: round(px(cs.fontSize) * scale),
    // A variable font takes any weight (450.5); the model's weight is a whole number.
    weight: Math.min(1000, Math.max(1, Math.round(Number(cs.fontWeight) || 400))),
    italic: cs.fontStyle !== 'normal',
    color: ctx.color(cs.color, node, 'color', pseudo),
    letterSpacing: cs.letterSpacing === 'normal' ? 0 : round(px(cs.letterSpacing) * scale),
    ...(transform === 'uppercase' ? { case: 'upper' as const } : {}),
    ...(transform === 'lowercase' ? { case: 'lower' as const } : {}),
  };
}

/** The line breaks and replaced content that end a line box of their own accord. */
const INLINE_ATOMS = new Set([
  'img',
  'canvas',
  'video',
  'iframe',
  'input',
  'button',
  'select',
  'textarea',
  'picture',
  'object',
  'embed',
]);

/** True when everything under `el` is inline phrasing content the text model can hold as runs. */
export function isPureInline(el: Element): boolean {
  for (const child of composedChildNodes(el)) {
    if (!isElement(child) || neverRendered(child)) continue;
    const tag = child.localName;
    if (tag === 'br' || tag === 'wbr') continue;
    const cs = styleOf(child);
    if (cs.display === 'none') continue;
    if (cs.display !== 'inline' && cs.display !== 'contents') return false;
    if (isSvg(child) || INLINE_ATOMS.has(tag)) return false;
    const paint = ownPaint(cs);
    if (paint.border || paint.shadow || cs.backgroundImage !== 'none') return false;
    if (px(cs.paddingLeft) + px(cs.paddingRight) > 0) return false;
    if (pseudoKind(child, '::before') === 'box' || pseudoKind(child, '::after') === 'box')
      return false;
    if (child.hasAttribute('data-icon') || child.hasAttribute('data-keep-html')) return false;
    if (!isPureInline(child)) return false;
  }
  return true;
}

export function hasOwnText(el: Element): boolean {
  return composedChildNodes(el).some((n) => isText(n) && n.data.trim() !== '');
}

export function hasAnyText(el: Element): boolean {
  for (const n of composedChildNodes(el)) {
    if (isText(n) && n.data.trim() !== '') return true;
    if (isElement(n) && !neverRendered(n) && styleOf(n).display !== 'none' && hasAnyText(n))
      return true;
  }
  return false;
}

interface RawRun {
  text: string;
  br: boolean;
  look: TextLook;
  underline: boolean;
  strike: boolean;
  highlight?: Color;
  link?: string;
  script?: 'sup' | 'sub';
  /** Computed line height in the run's own CSS px; undefined for `normal`. */
  lineHeight: number | undefined;
}

export interface TextBlock {
  paragraph: Paragraph;
  /** For the element's `css` field. */
  css: Record<string, string>;
  chars: number;
  /** The text includes generated content, which has no boxes to measure. */
  generated: boolean;
  /** Largest font size among the runs, in slide pixels. */
  maxSize: number;
  /** The theme text style the paragraph points at. */
  styleSize: number;
}

function capitalize(text: string): string {
  return text.replace(
    /(^|[\s\-(["'])(\p{L})/gu,
    (_, before: string, letter: string) => before + letter.toUpperCase(),
  );
}

/**
 * The paragraph an element's inline content makes, or why it cannot be one.
 *
 * @param owner  the element `cs` is the style of: `el` itself, or the parent of a lone text node
 * @param scale  CSS px of the element -> slide px
 * @param pitch  measured distance between line tops in slide px, when the text has several lines
 */
export function readTextBlock(
  el: Element,
  owner: Element,
  cs: CSSStyleDeclaration,
  scale: number,
  pitch: number | undefined,
  list: ListInfo | undefined,
  ctx: TextTheme,
): TextBlock | { unsupported: string } {
  const { theme, values } = ctx;
  const unsupported = unsupportedText(cs, ctx.lossy);
  if (unsupported) return { unsupported };
  const blockCss = passthrough(cs, scale);
  const signature = JSON.stringify(blockCss);
  const pre = /^pre|break-spaces/.test(cs.whiteSpace) && cs.whiteSpace !== 'pre-line';
  const keepNewlines = pre || cs.whiteSpace === 'pre-line';
  const raw: RawRun[] = [];
  let problem: string | undefined;
  let generated = false;

  /** `from`: whose style `style` is, so that a colour can be traced to the theme. */
  const push = (
    text: string,
    style: CSSStyleDeclaration,
    from: { node: Element; pseudo?: string },
    inherited: Partial<RawRun>,
    br = false,
  ) => {
    const decoration = style.textDecorationLine;
    const line = lineHeightPx(style);
    const base: RawRun = {
      text: style.textTransform === 'capitalize' ? capitalize(text) : text,
      br,
      look: lookOf(from.node, from.pseudo, style, scale, ctx),
      underline: inherited.underline || decoration.includes('underline'),
      strike: inherited.strike || decoration.includes('line-through'),
      lineHeight: line === undefined ? undefined : line * scale,
      ...(inherited.highlight ? { highlight: inherited.highlight } : {}),
      ...(inherited.link ? { link: inherited.link } : {}),
      ...(inherited.script ? { script: inherited.script } : {}),
    };
    // The renderer draws a raised or lowered run at 65% of its size mark.
    if (base.script) base.look = { ...base.look, size: round(base.look.size / 0.65) };
    raw.push(base);
  };

  const pseudo = (node: Element, which: '::before' | '::after', inherited: Partial<RawRun>) => {
    if (pseudoKind(node, which) !== 'text') return;
    generated = true;
    const style = styleOf(node, which);
    push(pseudoText(style), style, { node, pseudo: which }, inherited);
  };

  const walk = (
    node: Element,
    styled: Element,
    style: CSSStyleDeclaration,
    inherited: Partial<RawRun>,
  ) => {
    const from = { node: styled };
    if (node === styled) pseudo(node, '::before', inherited);
    for (const child of composedChildNodes(node)) {
      if (isText(child)) {
        if (keepNewlines) {
          child.data.split('\n').forEach((line, i) => {
            if (i > 0) push('\n', style, from, inherited, true);
            push(line, style, from, inherited);
          });
        } else push(child.data, style, from, inherited);
        continue;
      }
      if (!isElement(child) || neverRendered(child)) continue;
      if (child.localName === 'br') {
        push('\n', style, from, inherited, true);
        continue;
      }
      const childStyle = styleOf(child);
      if (subtreeHidden(childStyle) || childStyle.visibility !== 'visible') continue;
      if (childStyle.opacity !== '1') problem = 'a translucent part of the text';
      if (JSON.stringify(passthrough(childStyle, scale)) !== signature) {
        problem = 'text styling the model has no field for, on a part of the text';
      }
      const decoration = childStyle.textDecorationLine;
      if (
        decoration !== 'none' &&
        (childStyle.textDecorationStyle !== 'solid' ||
          childStyle.textDecorationThickness !== 'auto')
      ) {
        problem = 'a styled text decoration';
      }
      const next: Partial<RawRun> = {
        ...inherited,
        underline: inherited.underline || decoration.includes('underline'),
        strike: inherited.strike || decoration.includes('line-through'),
      };
      if (alphaOf(childStyle.backgroundColor) > 0) {
        next.highlight = ctx.color(childStyle.backgroundColor, child, 'background-color');
      }
      const href = child.localName === 'a' ? child.getAttribute('href') : null;
      if (href) next.link = href;
      if (childStyle.verticalAlign === 'super') next.script = 'sup';
      else if (childStyle.verticalAlign === 'sub') next.script = 'sub';
      else if (childStyle.verticalAlign !== 'baseline')
        problem = 'a vertically shifted part of the text';
      walk(child, child, childStyle, next);
    }
    if (node === styled) pseudo(node, '::after', inherited);
  };
  const decoration = cs.textDecorationLine;
  // A link around the block, or the block itself, makes all of it a link.
  const link = linkAround(owner);
  walk(el, owner, cs, {
    underline: decoration.includes('underline'),
    strike: decoration.includes('line-through'),
    ...(link ? { link } : {}),
  });
  // A forced conversion keeps the text and loses what the part of it could not carry.
  if (problem && !ctx.lossy) return { unsupported: problem };

  const texts = pre
    ? raw.map((r) => r.text)
    : collapseWhitespace(
        raw.map((r) => r.text),
        raw.map((r) => r.br),
      );
  const kept = raw
    .map((r, i) => ({ ...r, text: texts[i]! }))
    // Text of no size (`font-size: 0`) is in the DOM and not on screen, like text that is
    // hidden. It goes after the white space was collapsed around it: the spaces on its two
    // sides are both drawn, since it stood between them.
    .filter((r) => r.text !== '' && (r.br || r.look.size > 0))
    .flatMap((r) => (r.br ? [r] : byFamily(r, owner.ownerDocument)));
  if (kept.every((r) => r.br)) return { unsupported: 'no visible text' };

  // The style is chosen for the run that holds most of the text.
  const visible = kept.filter((r) => !r.br);
  const dominant = visible.reduce((a, b) => (b.text.length > a.text.length ? b : a));
  const styleRef = chooseTextStyle(dominant.look, theme, values);
  const style = theme.textStyles[styleRef];
  const maxSize = Math.max(...visible.map((r) => (r.script ? r.look.size * 0.65 : r.look.size)));

  const runs: Run[] = [];
  for (const r of kept) {
    const marks: Marks = marksOver(r.look, styleRef, theme, values, ctx.link);
    if (r.underline) marks.underline = true;
    if (r.strike) marks.strike = true;
    if (r.highlight) marks.highlight = r.highlight;
    if (r.link) marks.link = r.link;
    if (r.script) marks.script = r.script;
    const last = runs[runs.length - 1];
    const sameMarks = last && JSON.stringify(last.marks ?? {}) === JSON.stringify(marks);
    // A forced break belongs to the run before it; equal neighbours are one run.
    if (last && (r.br || sameMarks)) last.text += r.text;
    else runs.push({ text: r.text, ...(Object.keys(marks).length > 0 ? { marks } : {}) });
  }

  // The renderer sets a line's height from the larger of the style's size and the run's.
  const lineHeights = visible.map((r) => r.lineHeight).filter((n): n is number => n !== undefined);
  const linePx = pitch ?? (lineHeights.length > 0 ? Math.max(...lineHeights) : undefined);
  const multiplier = linePx === undefined ? undefined : linePx / Math.max(style.size, maxSize);

  const direction = cs.direction === 'rtl' ? 'rtl' : 'ltr';
  const indent = round(px(cs.textIndent) * scale);
  const paragraph: Paragraph = {
    dir: direction,
    align: alignOf(cs.textAlign, direction),
    ...(multiplier !== undefined && (!ctx.link || Math.abs(multiplier - style.lineHeight) > 0.004)
      ? { lineHeight: Math.round(multiplier * 10000) / 10000 }
      : {}),
    ...(indent !== 0 && !list ? { indent } : {}),
    ...(list ? { list } : {}),
    styleRef,
    runs,
  };
  return {
    paragraph,
    css: { ...blockCss, ...clippedBackground(cs, scale) },
    chars: visible.reduce((n, r) => n + r.text.length, 0),
    generated,
    maxSize,
    styleSize: style.size,
  };
}

function alignOf(textAlign: string, direction: 'rtl' | 'ltr'): Paragraph['align'] {
  const value = textAlign.replace('-webkit-', '');
  if (value === 'center' || value === 'justify') return value;
  if (value === 'end') return 'end';
  if (value === 'left') return direction === 'rtl' ? 'end' : 'start';
  if (value === 'right') return direction === 'rtl' ? 'start' : 'end';
  return 'start';
}

const BULLETS: Record<string, string> = { disc: '•', circle: '◦', square: '▪' };
/** The renderer's own glyphs by level; a marker equal to it needs no `glyph`. */
const DEFAULT_BULLETS = ['•', '◦', '▪'];

function alphabetic(n: number, first: number): string {
  let s = '';
  for (let v = n; v > 0; v = Math.floor((v - 1) / 26))
    s = String.fromCharCode(first + ((v - 1) % 26)) + s;
  return s;
}

function roman(n: number): string {
  const table: [number, string][] = [
    [1000, 'm'],
    [900, 'cm'],
    [500, 'd'],
    [400, 'cd'],
    [100, 'c'],
    [90, 'xc'],
    [50, 'l'],
    [40, 'xl'],
    [10, 'x'],
    [9, 'ix'],
    [5, 'v'],
    [4, 'iv'],
    [1, 'i'],
  ];
  let s = '';
  let v = n;
  for (const [value, letters] of table) {
    while (v >= value) {
      s += letters;
      v -= value;
    }
  }
  return s;
}

/** The marker text of a counter style the model can show, e.g. "3." for `decimal`. */
function counterText(type: string, n: number): string | undefined {
  switch (type) {
    case 'decimal':
      return `${n}.`;
    case 'decimal-leading-zero':
      return `${String(n).padStart(2, '0')}.`;
    case 'lower-alpha':
    case 'lower-latin':
      return `${alphabetic(n, 97)}.`;
    case 'upper-alpha':
    case 'upper-latin':
      return `${alphabetic(n, 65)}.`;
    case 'lower-roman':
      return `${roman(n)}.`;
    case 'upper-roman':
      return `${roman(n).toUpperCase()}.`;
    default:
      return undefined;
  }
}

/**
 * The list marker of an element the browser lays out as a list item: `undefined` when it has
 * none, `unsupported` when the model cannot show it (an image, a counter style it does not
 * know).
 */
export function readListMarker(
  el: Element,
  cs: CSSStyleDeclaration,
  ctx: TextTheme,
): ListInfo | 'unsupported' | undefined {
  if (cs.display !== 'list-item' || cs.listStyleType === 'none') {
    return cs.display === 'list-item' && cs.listStyleImage !== 'none' ? 'unsupported' : undefined;
  }
  if (cs.listStyleImage !== 'none') return 'unsupported';
  let level = 0;
  for (let p = composedParent(el); p; p = composedParent(p)) {
    if (styleOf(p).display === 'list-item') level++;
  }
  level = Math.min(level, 8);
  const markerColor = ctx.color(styleOf(el, '::marker').color, el, 'color', '::marker');
  const color =
    JSON.stringify(markerColor) === JSON.stringify(ctx.color(cs.color, el, 'color'))
      ? {}
      : { color: markerColor };
  const type = cs.listStyleType;
  const bullet = BULLETS[type];
  if (bullet) {
    return {
      kind: 'bullet',
      level,
      ...(bullet === DEFAULT_BULLETS[level % DEFAULT_BULLETS.length] ? {} : { glyph: bullet }),
      ...color,
    };
  }
  const literal = /^"(.*)"$/.exec(type);
  if (literal) {
    const glyph = literal[1]!.trim();
    return glyph ? { kind: 'bullet', level, glyph, ...color } : undefined;
  }
  const text = counterText(type, ordinalOf(el));
  // Each item is its own text box, so its number is written out rather than counted.
  return text ? { kind: 'number', level, glyph: text, ...color } : 'unsupported';
}

/** The number of a list item among its siblings, honouring `start` and `value`. */
function ordinalOf(el: Element): number {
  const parent = composedParent(el);
  if (!parent) return 1;
  const start = parent.getAttribute('start');
  let n = (start !== null && Number.isFinite(Number(start)) ? Number(start) : 1) - 1;
  for (const sibling of composedChildNodes(parent)) {
    if (!isElement(sibling) || styleOf(sibling).display !== 'list-item') continue;
    const value = sibling.getAttribute('value');
    n = value !== null && Number.isFinite(Number(value)) ? Number(value) : n + 1;
    if (sibling === el) break;
  }
  return n;
}
