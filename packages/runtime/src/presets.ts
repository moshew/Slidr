import type { Vec } from './direction';
import type { FlowDirection, Size } from './types';

/**
 * The ready-made animations (SPEC 5.6, WG8-T03). A preset describes its motion once, in slide
 * pixels and in terms that do not depend on how the part is drawn; `toKeyframes` turns that into
 * Web Animations keyframes for a box, or for a piece of inline text that cannot be transformed.
 */

/** One keyframe of a preset. A property a frame leaves out is interpolated from its neighbours. */
export interface Frame {
  offset: number;
  /** A share of the part's own opacity: 1 is the part as it is drawn. */
  opacity?: number;
  /** Displacement in slide pixels. */
  x?: number;
  y?: number;
  scale?: number;
  /** Degrees, clockwise. */
  rotate?: number;
  /** How much is cut off each side, 0..1: top, right, bottom, left. */
  clip?: readonly [number, number, number, number];
  /** Slide pixels. */
  blur?: number;
  hidden?: boolean;
  /** Easing from this frame to the next. */
  easing?: string;
}

/** The bounding box of a part in slide pixels. */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface PresetInput {
  /** The way the part, or the edge of a wipe, travels. */
  v: Vec;
  box: Box;
  slide: Size;
}

export interface Preset {
  frames: (input: PresetInput) => Frame[];
  /** The direction when the step names none. */
  direction: FlowDirection;
  /** The preset to use for inline text, which cannot be scaled, rotated or clipped. */
  inline?: string;
}

export type Category = 'entrance' | 'emphasis' | 'exit';

/** Clear of the slide's edge, so a shadow is out of sight too. */
const OFFSCREEN_MARGIN = 80;

/** Where a part has to be moved so that it is outside the slide, on the side it travels to. */
function beyond(v: Vec, box: Box, slide: Size): { x: number; y: number } {
  return {
    x:
      v.x > 0 ? slide.w - box.left + OFFSCREEN_MARGIN : v.x < 0 ? -box.right - OFFSCREEN_MARGIN : 0,
    y:
      v.y > 0 ? slide.h - box.top + OFFSCREEN_MARGIN : v.y < 0 ? -box.bottom - OFFSCREEN_MARGIN : 0,
  };
}

const opposite = (v: Vec): Vec => ({ x: -v.x as Vec['x'], y: -v.y as Vec['y'] });

/** A short drift: more for an element than for a word. */
function drift(box: Box): number {
  return Math.min(80, Math.max(24, (box.bottom - box.top) * 0.6));
}

/** The clip of a wipe whose edge has travelled `p` of the way along `v`: 0 hides, 1 shows. */
function revealed(v: Vec, p: number): [number, number, number, number] {
  const cut = 1 - p;
  return [v.y < 0 ? cut : 0, v.x > 0 ? cut : 0, v.y > 0 ? cut : 0, v.x < 0 ? cut : 0];
}

/** The clip of a wipe that hides what its edge has passed. */
function covered(v: Vec, p: number): [number, number, number, number] {
  return [v.y > 0 ? p : 0, v.x < 0 ? p : 0, v.y < 0 ? p : 0, v.x > 0 ? p : 0];
}

const entrance: Record<string, Preset> = {
  appear: {
    direction: 'up',
    frames: () => [
      { offset: 0, hidden: true },
      { offset: 1, hidden: false },
    ],
  },
  fade: {
    direction: 'up',
    frames: () => [
      { offset: 0, opacity: 0 },
      { offset: 1, opacity: 1 },
    ],
  },
  flyIn: {
    direction: 'up',
    frames: ({ v, box, slide }) => [
      { offset: 0, ...beyond(opposite(v), box, slide) },
      { offset: 1, x: 0, y: 0 },
    ],
  },
  rise: {
    direction: 'up',
    frames: ({ v, box }) => [
      { offset: 0, x: -v.x * drift(box), y: -v.y * drift(box), opacity: 0 },
      { offset: 1, x: 0, y: 0, opacity: 1 },
    ],
  },
  zoom: {
    direction: 'up',
    inline: 'fade',
    frames: () => [
      { offset: 0, scale: 0.7, opacity: 0 },
      { offset: 1, scale: 1, opacity: 1 },
    ],
  },
  pop: {
    direction: 'up',
    inline: 'fade',
    frames: () => [
      { offset: 0, scale: 0.5, opacity: 0, easing: 'ease-out' },
      { offset: 0.6, scale: 1.08, opacity: 1, easing: 'ease-in-out' },
      { offset: 0.8, scale: 0.97, easing: 'ease-in-out' },
      { offset: 1, scale: 1, opacity: 1 },
    ],
  },
  wipe: {
    direction: 'end',
    inline: 'fade',
    frames: ({ v }) => [
      { offset: 0, clip: revealed(v, 0) },
      { offset: 1, clip: revealed(v, 1) },
    ],
  },
  blur: {
    direction: 'up',
    inline: 'fade',
    frames: () => [
      { offset: 0, blur: 24, opacity: 0 },
      { offset: 1, blur: 0, opacity: 1 },
    ],
  },
};

const exit: Record<string, Preset> = {
  disappear: {
    direction: 'down',
    frames: () => [
      { offset: 0, hidden: true },
      { offset: 1, hidden: true },
    ],
  },
  fade: {
    direction: 'down',
    frames: () => [
      { offset: 0, opacity: 1 },
      { offset: 1, opacity: 0 },
    ],
  },
  flyOut: {
    direction: 'down',
    frames: ({ v, box, slide }) => [
      { offset: 0, x: 0, y: 0 },
      { offset: 1, ...beyond(v, box, slide) },
    ],
  },
  sink: {
    direction: 'down',
    frames: ({ v, box }) => [
      { offset: 0, x: 0, y: 0, opacity: 1 },
      { offset: 1, x: v.x * drift(box), y: v.y * drift(box), opacity: 0 },
    ],
  },
  zoom: {
    direction: 'down',
    inline: 'fade',
    frames: () => [
      { offset: 0, scale: 1, opacity: 1 },
      { offset: 1, scale: 0.7, opacity: 0 },
    ],
  },
  pop: {
    direction: 'down',
    inline: 'fade',
    frames: () => [
      { offset: 0, scale: 1, opacity: 1, easing: 'ease-in-out' },
      { offset: 0.3, scale: 1.08, opacity: 1, easing: 'ease-in' },
      { offset: 1, scale: 0.5, opacity: 0 },
    ],
  },
  wipe: {
    direction: 'end',
    inline: 'fade',
    frames: ({ v }) => [
      { offset: 0, clip: covered(v, 0) },
      { offset: 1, clip: covered(v, 1) },
    ],
  },
  blur: {
    direction: 'down',
    inline: 'fade',
    frames: () => [
      { offset: 0, blur: 0, opacity: 1 },
      { offset: 1, blur: 24, opacity: 0 },
    ],
  },
};

/** Emphasis draws attention and leaves the part as it was. */
const emphasis: Record<string, Preset> = {
  pulse: {
    direction: 'up',
    inline: 'flash',
    frames: () => [
      { offset: 0, scale: 1, easing: 'ease-in-out' },
      { offset: 0.5, scale: 1.08, easing: 'ease-in-out' },
      { offset: 1, scale: 1 },
    ],
  },
  spin: {
    direction: 'up',
    inline: 'flash',
    frames: () => [
      { offset: 0, rotate: 0 },
      { offset: 1, rotate: 360 },
    ],
  },
  wiggle: {
    direction: 'up',
    inline: 'shake',
    frames: () => [
      { offset: 0, rotate: 0 },
      { offset: 0.2, rotate: -4 },
      { offset: 0.4, rotate: 4 },
      { offset: 0.6, rotate: -3 },
      { offset: 0.8, rotate: 3 },
      { offset: 1, rotate: 0 },
    ],
  },
  shake: {
    direction: 'up',
    frames: () => [
      { offset: 0, x: 0 },
      { offset: 0.2, x: -12 },
      { offset: 0.4, x: 12 },
      { offset: 0.6, x: -8 },
      { offset: 0.8, x: 8 },
      { offset: 1, x: 0 },
    ],
  },
  bounce: {
    direction: 'up',
    frames: () => [
      { offset: 0, y: 0, easing: 'ease-out' },
      { offset: 0.3, y: -36, easing: 'ease-in' },
      { offset: 0.6, y: 0, easing: 'ease-out' },
      { offset: 0.8, y: -14, easing: 'ease-in' },
      { offset: 1, y: 0 },
    ],
  },
  flash: {
    direction: 'up',
    frames: () => [
      { offset: 0, opacity: 1 },
      { offset: 0.25, opacity: 0.15 },
      { offset: 0.5, opacity: 1 },
      { offset: 0.75, opacity: 0.15 },
      { offset: 1, opacity: 1 },
    ],
  },
};

const presets: Record<Category, Record<string, Preset>> = { entrance, emphasis, exit };

/** A name that belongs to the other category means its counterpart: `flyIn` as an exit is `flyOut`. */
const COUNTERPART: Record<Category, Record<string, string>> = {
  entrance: { disappear: 'appear', flyOut: 'flyIn', sink: 'rise' },
  exit: { appear: 'disappear', flyIn: 'flyOut', rise: 'sink' },
  emphasis: {},
};

/** What plays when the name is unknown. The step still shows or hides its element. */
const FALLBACK: Record<Category, string> = { entrance: 'fade', exit: 'fade', emphasis: 'pulse' };

/** The names of the presets, for a picker and for the agent's prompt. */
export const animationPresets: Record<Category, readonly string[]> = {
  entrance: Object.keys(entrance),
  emphasis: Object.keys(emphasis),
  exit: Object.keys(exit),
};

/** The preset a step names, and whether the name was known. */
export function findPreset(category: Category, name: string): { preset: Preset; known: boolean } {
  const set = presets[category];
  const preset = set[name] ?? set[COUNTERPART[category][name] ?? ''];
  if (preset) return { preset, known: true };
  return { preset: set[FALLBACK[category]] as Preset, known: false };
}

/** The preset for a part that is inline text. */
export function inlinePreset(category: Category, preset: Preset): Preset {
  return (preset.inline ? presets[category][preset.inline] : undefined) ?? preset;
}

export interface PartStyle {
  /** False for inline text: it can be faded and moved, and nothing else. */
  box: boolean;
  /** The part's own opacity and filter, which the animation starts from and returns to. */
  opacity: number;
  filter: string;
  /** Pixels of the part's own space per slide pixel: above 1 inside shrunken text. */
  unit: number;
}

/** A wipe starts and ends this far outside the box, so it does not cut a shadow or an outline. */
const CLIP_MARGIN = 64;

const round = (n: number): number => Math.round(n * 1000) / 1000;

function inset(clip: readonly [number, number, number, number]): string {
  const side = (s: number) => `calc(${round(s * 100)}% + ${round((2 * s - 1) * CLIP_MARGIN)}px)`;
  return `inset(${clip.map(side).join(' ')})`;
}

/** Web Animations keyframes for a preset's frames. */
export function toKeyframes(frames: readonly Frame[], part: PartStyle): Keyframe[] {
  return frames.map((frame) => {
    const k: Keyframe = { offset: frame.offset };
    if (frame.easing) k.easing = frame.easing;
    if (frame.opacity !== undefined) k.opacity = round(frame.opacity * part.opacity);
    if (frame.hidden !== undefined) k.visibility = frame.hidden ? 'hidden' : 'visible';
    const moves = frame.x !== undefined || frame.y !== undefined;
    const x = round((frame.x ?? 0) * part.unit);
    const y = round((frame.y ?? 0) * part.unit);
    if (!part.box) {
      // Inline text keeps its place in the line and is offset from it.
      if (moves) {
        k.left = `${x}px`;
        k.top = `${y}px`;
      }
      return k;
    }
    // The individual transform properties compose with the element's own `transform`, which
    // carries its rotation: the element moves along the slide's axes and keeps its angle.
    if (moves) k.translate = `${x}px ${y}px`;
    if (frame.scale !== undefined) k.scale = String(frame.scale);
    if (frame.rotate !== undefined) k.rotate = `${frame.rotate}deg`;
    if (frame.clip) k.clipPath = inset(frame.clip);
    if (frame.blur !== undefined) {
      k.filter = `${part.filter ? `${part.filter} ` : ''}blur(${round(frame.blur * part.unit)}px)`;
    }
    return k;
  });
}
