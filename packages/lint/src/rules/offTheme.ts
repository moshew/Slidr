import {
  updateElement,
  walkElements,
  type Color,
  type Command,
  type Element,
  type Theme,
} from '@slidr/model';
import { distance, isNeutral, nearestToken, parseHex } from '../palette';
import type { Problem, Rule, SlideContext } from '../rule';
import { mapRuns, proseOf, setText, styleOf } from '../text';

/** A deck reads best in this many font families (SPEC 9.1). */
export const MAX_FAMILIES = 2;
/** A colour this near a colour of the theme is that colour. */
const SAME_COLOUR = 2;

// ---------------------------------------------------------------------------------------------
// Fonts

function themeFamilies(theme: Theme): Set<string> {
  const { heading, body } = theme.fonts;
  return new Set([heading.he, heading.latin, body.he, body.latin]);
}

/**
 * The families a slide is set in: each font pair of the theme that text of the slide uses is
 * one family (a Hebrew face and its Latin partner are chosen to read as one), and every font a
 * run names by itself that is not of the theme is one more.
 */
function families(ctx: SlideContext): { pairs: Set<string>; own: Map<string, Set<string>> } {
  const { theme } = ctx.deck;
  const ofTheme = themeFamilies(theme);
  const pairs = new Set<string>();
  const own = new Map<string, Set<string>>();
  for (const element of walkElements(ctx.slide.elements)) {
    const prose = proseOf(element);
    if (!prose || element.hidden) continue;
    for (const paragraph of prose.paragraphs) {
      for (const run of paragraph.runs) {
        if (run.text.trim() === '') continue;
        const font = run.marks?.font;
        if (font && !ofTheme.has(font)) {
          if (!own.has(font)) own.set(font, new Set());
          own.get(font)!.add(element.id);
        } else if (!font) pairs.add(styleOf(theme, paragraph).font);
        else pairs.add(font);
      }
    }
  }
  return { pairs, own };
}

function fontProblem(ctx: SlideContext): Problem[] {
  const { pairs, own } = families(ctx);
  if (own.size === 0 || pairs.size + own.size <= MAX_FAMILIES) return [];
  const ids = [...new Set([...own.values()].flatMap((set) => [...set]))];
  const fix: Command[] = [];
  for (const element of walkElements(ctx.slide.elements)) {
    const prose = proseOf(element);
    if (!prose || !ids.includes(element.id)) continue;
    const content = mapRuns(prose, (run) => {
      if (!run.marks?.font || !own.has(run.marks.font)) return run;
      const { font: _font, ...marks } = run.marks;
      return Object.keys(marks).length ? { ...run, marks } : { text: run.text };
    });
    if (content) fix.push(setText(ctx.slide.id, element.id, content));
  }
  return [
    {
      elementIds: ids,
      message: `The slide is set in ${pairs.size + own.size} font families: the template's, and ${[...own.keys()].map((f) => `"${f}"`).join(', ')}. More than ${MAX_FAMILIES} families make a slide look assembled; set the text in the template's fonts.`,
      ...(fix.length ? { fix } : {}),
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// Colours

/** A colour of the model that is no colour of the theme, with the token nearest to it. */
function stray(theme: Theme, color: Color | undefined): { hex: string; to: Color } | undefined {
  if (!color || 'token' in color) return undefined;
  const rgb = parseHex(color.value);
  // Black, white and grey belong to every template; a colour that is not hex is left unjudged.
  if (!rgb || isNeutral(rgb)) return undefined;
  const chart = theme.colors.chart.some((c) => {
    const of = parseHex(c);
    return of && distance(of, rgb) <= SAME_COLOUR;
  });
  const nearest = nearestToken(theme, rgb);
  if (chart || !nearest || nearest.distance <= SAME_COLOUR) return undefined;
  return {
    hex: color.value.toLowerCase(),
    to: { token: nearest.token, ...(color.alpha === undefined ? {} : { alpha: color.alpha }) },
  };
}

/**
 * The colours an element is drawn in that the theme does not hold, and the commands that turn
 * each into the token nearest to it: the text's colour and highlight, a flat fill, a stroke.
 * Gradients, pictures, tables, charts and free HTML are left alone.
 */
function strays(
  ctx: SlideContext,
  element: Element,
): { found: Map<string, Color>; fix: Command[] } {
  const { theme } = ctx.deck;
  const found = new Map<string, Color>();
  const fix: Command[] = [];
  const turn = (color: Color | undefined): Color | undefined => {
    const off = stray(theme, color);
    if (off) found.set(off.hex, off.to);
    return off?.to;
  };

  const prose = proseOf(element);
  if (prose) {
    const content = mapRuns(prose, (run) => {
      const color = turn(run.marks?.color);
      const highlight = turn(run.marks?.highlight);
      if (!color && !highlight) return run;
      return {
        ...run,
        marks: { ...run.marks, ...(color ? { color } : {}), ...(highlight ? { highlight } : {}) },
      };
    });
    if (content) fix.push(setText(ctx.slide.id, element.id, content));
  }
  if (element.type === 'shape') {
    const fill = element.fill.kind === 'solid' ? turn(element.fill.color) : undefined;
    const stroke = element.stroke ? turn(element.stroke.color) : undefined;
    if (fill || stroke) {
      fix.push(
        updateElement(ctx.slide.id, element.id, {
          ...(fill ? { fill: { kind: 'solid', color: fill } } : {}),
          ...(stroke && element.stroke ? { stroke: { ...element.stroke, color: stroke } } : {}),
        }),
      );
    }
  }
  if (element.type === 'line') {
    const stroke = turn(element.stroke.color);
    if (stroke) {
      fix.push(
        updateElement(ctx.slide.id, element.id, { stroke: { ...element.stroke, color: stroke } }),
      );
    }
  }
  return { found, fix };
}

function colourProblem(ctx: SlideContext): Problem[] {
  const colours = new Map<string, Color>();
  const ids: string[] = [];
  const fix: Command[] = [];
  for (const element of walkElements(ctx.slide.elements)) {
    if (element.hidden) continue;
    const off = strays(ctx, element);
    if (off.found.size === 0) continue;
    ids.push(element.id);
    fix.push(...off.fix);
    for (const [hex, to] of off.found) colours.set(hex, to);
  }
  if (colours.size === 0) return [];
  const list = [...colours]
    .slice(0, 6)
    .map(([hex, to]) => `${hex} (nearest: ${'token' in to ? to.token : hex})`)
    .join(', ');
  return [
    {
      elementIds: ids,
      message: `${colours.size} ${colours.size === 1 ? 'colour here is' : 'colours here are'} not the template's: ${list}${colours.size > 6 ? ', and more' : ''}. Colours outside the palette do not change with the template; use the theme's colours.`,
      fix,
    },
  ];
}

/**
 * L11: more than two font families on the slide, and colours that are not the template's. Two
 * findings, since each has a fix of its own: text goes back to the template's fonts, and each
 * colour to the theme token nearest to it. Information only: a brand colour may be meant.
 */
export const L11: Rule = {
  id: 'L11',
  severity: 'info',
  agent: false,
  check(ctx) {
    return [...fontProblem(ctx), ...colourProblem(ctx)];
  },
};
