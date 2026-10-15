/**
 * What the ready-made slides of Elements → Designs are written with, in the shape of the media
 * library's `elements/designs/managed.json`: a slide in Hebrew and one in English, each drawn by
 * hand for its direction, with every run of text naming its font, size, weight and colour, and
 * one picture, `__subject__`, that the app swaps for the design's file when it is inserted.
 */
import {
  createElement,
  createSlide,
  type Background,
  type Color,
  type Element,
  type Fill,
  type Frame,
  type ImageElement,
  type Marks,
  type Paragraph,
  type Run,
  type ShapeElement,
  type Slide,
  type Stroke,
  type TextElement,
} from '@slidr/model';

export type Group = 'hitech' | 'techproduct' | 'defense';

export interface DesignEntry {
  id: string;
  group: Group;
  name: { he: string; en: string };
  /** A point on the subject of the picture, in the English slide (the Hebrew one is its mirror): nothing may cover it. */
  subject: [number, number];
  he: Slide;
  en: Slide;
}

export type Lang = 'he' | 'en';

/** A colour by its CSS value. */
export const c = (value: string, alpha?: number): Color =>
  alpha === undefined ? { value } : { value, alpha };

export const fill = (value: string, alpha?: number): Fill => ({
  kind: 'solid',
  color: c(value, alpha),
});

export const linear = (angle: number, ...stops: [string, number, number?][]): Fill => ({
  kind: 'linear',
  angle,
  stops: stops.map(([value, at, alpha]) => ({ color: c(value, alpha), at })),
});

export const radial = (x: number, y: number, ...stops: [string, number, number?][]): Fill => ({
  kind: 'radial',
  center: { x, y },
  stops: stops.map(([value, at, alpha]) => ({ color: c(value, alpha), at })),
});

/** The look of a run: font, size, weight and colour always; the rest when given. */
export interface Look {
  font: string;
  size: number;
  weight?: number;
  color: string;
  letterSpacing?: number;
  italic?: boolean;
}

const marks = (look: Look): Marks => ({
  font: look.font,
  size: look.size,
  weight: look.weight ?? 400,
  color: c(look.color),
  ...(look.letterSpacing !== undefined ? { letterSpacing: look.letterSpacing } : {}),
  ...(look.italic ? { italic: true } : {}),
});

/** A piece of a line in a look of its own. */
export type Piece = [text: string, look: Look];

/** A line: plain text in the box's look, or pieces in looks of their own. */
export type Line = string | Piece[];

export interface TextInit {
  frame: Frame;
  lines: Line[];
  look: Look;
  lang: Lang;
  /** `start` and `end` follow the direction of the line. */
  align?: Paragraph['align'];
  /** The direction of the lines: the slide's language unless given (a figure, a code). */
  dir?: Paragraph['dir'];
  lineHeight?: number;
  vAlign?: TextElement['vAlign'];
  name?: string;
}

/** A text box whose lines never wrap: each line is written as it should break. */
export function textBox(init: TextInit): TextElement {
  const dir = init.dir ?? (init.lang === 'he' ? 'rtl' : 'ltr');
  const paragraphs: Paragraph[] = init.lines.map((line) => ({
    dir,
    align: init.align ?? 'start',
    lineHeight: init.lineHeight ?? 1.2,
    runs:
      typeof line === 'string'
        ? [{ text: line, marks: marks(init.look) }]
        : line.map(([text, look]): Run => ({ text, marks: marks(look) })),
  }));
  return createElement.text({
    frame: init.frame,
    vAlign: init.vAlign ?? 'middle',
    wrap: false,
    content: { paragraphs },
    ...(init.name ? { name: init.name } : {}),
  });
}

export interface ShapeInit {
  frame: Frame;
  fill: Fill;
  /** `rect`, `roundRect`, `ellipse`, or any preset of the renderer. */
  preset?: string;
  /** For `roundRect`: the radius as a share of the shorter side, 0..0.5. */
  round?: number;
  stroke?: Stroke;
  shadow?: { x: number; y: number; blur: number; color: string; alpha: number };
  opacity?: number;
  rotation?: number;
  /** Words on the shape: a button, a chip. */
  label?: {
    text: string;
    look: Look;
    lang: Lang;
    dir?: Paragraph['dir'];
    align?: Paragraph['align'];
  };
  path?: { d: string; w: number; h: number };
}

export function shape(init: ShapeInit): ShapeElement {
  const geometry: ShapeElement['geometry'] = init.path
    ? { kind: 'path', d: init.path.d, viewBox: { w: init.path.w, h: init.path.h } }
    : {
        kind: 'preset',
        preset: init.preset ?? (init.round !== undefined ? 'roundRect' : 'rect'),
        ...(init.round !== undefined ? { adjust: [init.round] } : {}),
      };
  const element = createElement.shape({
    frame: init.frame,
    geometry,
    fill: init.fill,
    ...(init.stroke ? { stroke: init.stroke } : {}),
    ...(init.shadow
      ? {
          effects: {
            shadow: {
              x: init.shadow.x,
              y: init.shadow.y,
              blur: init.shadow.blur,
              color: c(init.shadow.color, init.shadow.alpha),
            },
          },
        }
      : {}),
    ...(init.opacity !== undefined ? { opacity: init.opacity } : {}),
    ...(init.rotation !== undefined ? { rotation: init.rotation } : {}),
  });
  if (init.label) {
    const dir = init.label.dir ?? (init.label.lang === 'he' ? 'rtl' : 'ltr');
    element.content = {
      paragraphs: [
        {
          dir,
          align: init.label.align ?? 'center',
          lineHeight: 1.2,
          runs: [{ text: init.label.text, marks: marks(init.label.look) }],
        },
      ],
    };
    element.padding = { top: 0, bottom: 0, left: 0, right: 0 };
  }
  return element;
}

/** A drawing in SVG: lines, icons, a grid, a frame. Its letters, if any, are its own. */
export function art(frame: Frame, markup: string, name?: string): Element {
  return createElement.svg({ frame, markup, ...(name ? { name } : {}) });
}

/** A line between two points of the slide. */
export function rule(
  from: [number, number],
  to: [number, number],
  stroke: Stroke,
  heads: { start?: 'none' | 'arrow' | 'circle'; end?: 'none' | 'arrow' | 'circle' } = {},
): Element {
  const x = Math.min(from[0], to[0]);
  const y = Math.min(from[1], to[1]);
  return createElement.line({
    frame: { x, y, w: Math.abs(to[0] - from[0]), h: Math.abs(to[1] - from[1]) },
    points: [
      { x: from[0] - x, y: from[1] - y },
      { x: to[0] - x, y: to[1] - y },
    ],
    stroke,
    startHead: heads.start ?? 'none',
    endHead: heads.end ?? 'none',
    curve: 'straight',
  });
}

/** The design's picture: the app puts the file of the design in its place. */
export function picture(
  frame: Frame,
  alt: string,
  rest: Partial<
    Pick<ImageElement, 'fit' | 'mask' | 'crop' | 'border' | 'effects' | 'opacity' | 'rotation'>
  > = {},
): ImageElement {
  return createElement.image({
    frame,
    assetId: '__subject__',
    alt,
    fit: rest.fit ?? 'cover',
    ...rest,
  });
}

/** A slide of a design. */
export function slide(background: Background, elements: Element[]): Slide {
  return createSlide({ background, elements });
}

/** A frame given from the right edge, for a Hebrew slide drawn as the mirror of an English one. */
export const fromRight = (right: number, y: number, w: number, h: number): Frame => ({
  x: 1920 - right - w,
  y,
  w,
  h,
});

/** The same frame on the other side of the slide. */
export const mirror = (f: Frame): Frame => ({ ...f, x: 1920 - f.x - f.w });
