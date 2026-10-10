import {
  createElement,
  type Direction,
  type Frame,
  type LineElement,
  type ShapeElement,
} from '@slidr/model';
import { extraShapes, presetPath, shapePresets } from '@slidr/renderer';
import authored from '../../../../../Slidr-media/elements/catalogs/shapes.json?raw';

/*
 * The shape library (SHP-01) and the lines of the Insert menu (SHP-05): what each one is called,
 * where it sits in the library, and the element a click inserts. Pure, so it is tested without a
 * DOM. The geometry itself is the renderer's (`presetPath`).
 */

export type ShapeGroup = 'basic' | 'polygons' | 'arrows' | 'callouts' | 'brackets';

interface ShapeSpec {
  group: ShapeGroup;
  /** The size a click inserts, in slide pixels. */
  w: number;
  h: number;
  /** Proportions of the library glyph, when the inserted ones would draw too thin to read. */
  glyph?: readonly [number, number];
}

/** In library order. A preset the renderer adds later shows at the end of `basic` until listed. */
const library = JSON.parse(authored) as {
  groups: ShapeGroup[];
  shapes: Record<string, ShapeSpec>;
  lines: Record<LineKind, string>;
};
export const SHAPE_GROUPS: readonly ShapeGroup[] = library.groups;
const CATALOGUE = library.shapes;

const UNLISTED: ShapeSpec = { group: 'basic', w: 360, h: 360 };

function specOf(preset: string): ShapeSpec {
  return CATALOGUE[preset] ?? extraShapes[preset] ?? UNLISTED;
}

/** Every preset the renderer draws, by library group and in library order. */
export function shapeLibrary(
  presets: readonly string[] = shapePresets,
): { group: ShapeGroup; presets: string[] }[] {
  const listed = Object.keys(CATALOGUE).filter((preset) => presets.includes(preset));
  const all = [...listed, ...presets.filter((preset) => !(preset in CATALOGUE))];
  return SHAPE_GROUPS.map((group) => ({
    group,
    presets: all.filter((preset) => specOf(preset).group === group),
  })).filter((entry) => entry.presets.length > 0);
}

/** Brackets and braces: an outline with nothing to fill. */
export function isOpenPreset(preset: string): boolean {
  return presetPath(preset, 100, 100)?.closed === false;
}

/** The side of the square a library glyph is drawn in, and the part of it the shape may take. */
export const GLYPH_BOX = 24;
const GLYPH_INK = 18;
/** A speech bubble's tail hangs this far below its frame, as a share of the height. */
const CALLOUT_TAIL = 0.25;

/** A preset drawn small for the library: path data, and where it sits in the glyph box. */
export function shapeGlyph(
  preset: string,
): { d: string; closed: boolean; x: number; y: number } | undefined {
  const spec = specOf(preset);
  const [gw, gh] = spec.glyph ?? [spec.w, spec.h];
  const tall = spec.group === 'callouts' ? 1 + CALLOUT_TAIL : 1;
  const scale = Math.min(GLYPH_INK / gw, GLYPH_INK / (gh * tall));
  const w = gw * scale;
  const h = gh * scale;
  const path = presetPath(preset, w, h);
  if (!path) return undefined;
  return { ...path, x: (GLYPH_BOX - w) / 2, y: (GLYPH_BOX - h * tall) / 2 };
}

/* ---------------------------------------------------------------- inserting */

interface Size {
  w: number;
  h: number;
}

/** How far a new element steps aside when one already sits where it would land. */
const CASCADE = 24;
/** Outline of a new open shape and of a new line: readable on a 1920 slide at 64%. */
const STROKE_WIDTH = 4;

/**
 * A frame of the given size in the middle of the slide. When an element already starts at that
 * very spot (a shape was just inserted and not moved), the new one steps aside so both show.
 */
export function centredFrame(size: Size, slide: Size, taken: readonly Frame[] = []): Frame {
  let x = Math.round((slide.w - size.w) / 2);
  let y = Math.round((slide.h - size.h) / 2);
  for (let step = 0; step < 12 && taken.some((f) => f.x === x && f.y === y); step++) {
    x += CASCADE;
    y += CASCADE;
  }
  return { x, y, w: size.w, h: size.h };
}

/**
 * A new shape of the library, in the theme's colours: filled with `primary`, or for an open
 * outline (a bracket) stroked with `text`. Colours are tokens, so the shape follows the theme.
 */
export function newShape(preset: string, slide: Size, taken: readonly Frame[] = []): ShapeElement {
  const spec = specOf(preset);
  const frame = centredFrame(spec, slide, taken);
  const geometry = { kind: 'preset', preset } as const;
  if (isOpenPreset(preset)) {
    return createElement.shape({
      frame,
      geometry,
      fill: { kind: 'none' },
      stroke: { color: { token: 'text' }, width: STROKE_WIDTH },
    });
  }
  return createElement.shape({
    frame,
    geometry,
    fill: { kind: 'solid', color: { token: 'primary' } },
  });
}

export type LineKind = 'line' | 'arrow' | 'doubleArrow' | 'elbow' | 'curved';

export const LINE_KINDS: readonly LineKind[] = Object.keys(library.lines) as LineKind[];

/**
 * A new line. It runs in the reading direction of the deck, so an arrow points forward: to the
 * left in a right-to-left deck. Elbow and curved lines start plain; heads are one click away.
 */
export function newLine(
  kind: LineKind,
  slide: Size,
  taken: readonly Frame[] = [],
  dir: Direction = 'ltr',
): LineElement {
  const bent = kind === 'elbow' || kind === 'curved';
  const size = bent ? { w: 360, h: 240 } : { w: 480, h: 0 };
  const rtl = dir === 'rtl';
  return createElement.line({
    frame: centredFrame(size, slide, taken),
    points: [
      { x: rtl ? size.w : 0, y: 0 },
      { x: rtl ? 0 : size.w, y: size.h },
    ],
    stroke: { color: { token: 'text' }, width: STROKE_WIDTH },
    startHead: kind === 'doubleArrow' ? 'triangle' : 'none',
    endHead: kind === 'arrow' || kind === 'doubleArrow' ? 'triangle' : 'none',
    curve: kind === 'elbow' ? 'elbow' : kind === 'curved' ? 'curved' : 'straight',
  });
}

/** The lines of the Insert menu drawn small, in a 24 box, running left to right. */
export const LINE_GLYPHS: Record<LineKind, string> = library.lines;
