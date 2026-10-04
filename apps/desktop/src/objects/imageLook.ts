import type { ColorToken, Command, ElementPatch, ImageElement } from '@slidr/model';
import { duotonePreset } from '@slidr/renderer';
import { isOpenPreset, shapeLibrary } from './shapes';

/*
 * The look of a picture as row B edits it (IMG-05, IMG-06, IMG-07, IMG-10): its mask, its
 * adjustments, a ready-made filter, and making it the slide's background. Every one writes a
 * field of the element, never the file, so the original is always there to go back to (IMG-12).
 * Pure, so it is tested without a DOM.
 */

/* ---------------------------------------------------------------- mask */

export type Mask = NonNullable<ImageElement['mask']>;

/** What the mask picker shows as chosen: `shape:<preset>` for a shape of the library. */
export type MaskChoice = 'none' | 'rounded' | 'ellipse' | `shape:${string}`;

export function maskChoice(element: ImageElement): MaskChoice {
  const { mask } = element;
  if (!mask) return 'none';
  return mask.kind === 'shape' ? `shape:${mask.preset}` : mask.kind;
}

/** The corner a rounded mask starts with: an eighth of the shorter side. */
export function defaultMaskRadius(element: ImageElement): number {
  return Math.round(Math.min(element.frame.w, element.frame.h) / 8);
}

/** The largest corner of a rounded mask: half the shorter side, where it becomes a pill. */
export function maxMaskRadius(element: ImageElement): number {
  return Math.max(1, Math.floor(Math.min(element.frame.w, element.frame.h) / 2));
}

/** The change that gives the picture a mask, or takes it away. */
export function maskPatch(element: ImageElement, choice: MaskChoice): ElementPatch {
  if (choice === 'none') return { mask: null };
  if (choice === 'ellipse') return { mask: { kind: 'ellipse' } };
  if (choice === 'rounded') {
    const radius =
      element.mask?.kind === 'rounded' ? element.mask.radius : defaultMaskRadius(element);
    return { mask: { kind: 'rounded', radius } };
  }
  return { mask: { kind: 'shape', preset: choice.slice('shape:'.length) } };
}

/** Shapes with a hole draw as their outer edge when they clip a picture, so they are not offered. */
const NOT_A_MASK = new Set(['rect', 'roundRect', 'ellipse', 'donut', 'frame']);

/**
 * The shapes of the library a picture can be cut to: the closed ones, without the rectangle,
 * the rounded rectangle and the ellipse, which the picker offers as masks of their own.
 */
export function maskShapes(): string[] {
  return shapeLibrary()
    .flatMap(({ presets }) => presets)
    .filter((preset) => !NOT_A_MASK.has(preset) && !isOpenPreset(preset));
}

/* ---------------------------------------------------------------- adjustments */

export type Adjust = NonNullable<ImageElement['adjust']>;
export type AdjustKey = keyof Adjust;

export interface AdjustControl {
  key: AdjustKey;
  /** The range and the resting value of the slider, in the unit the user sees. */
  min: number;
  max: number;
  rest: number;
  unit: '%' | '°' | 'px' | '';
  /** The slider's value for one unit of the model's. */
  scale: number;
}

/**
 * The adjustments, in the order row B shows them. The model keeps brightness, contrast and
 * saturation as multipliers and temperature and grayscale as shares (see the renderer's
 * `imageLook`); the sliders show them as the percentages people expect.
 */
export const ADJUSTMENTS: readonly AdjustControl[] = [
  { key: 'brightness', min: 0, max: 200, rest: 100, unit: '%', scale: 100 },
  { key: 'contrast', min: 0, max: 200, rest: 100, unit: '%', scale: 100 },
  { key: 'saturation', min: 0, max: 200, rest: 100, unit: '%', scale: 100 },
  { key: 'temperature', min: -100, max: 100, rest: 0, unit: '', scale: 100 },
  { key: 'hue', min: -180, max: 180, rest: 0, unit: '°', scale: 1 },
  { key: 'blur', min: 0, max: 40, rest: 0, unit: 'px', scale: 1 },
  { key: 'grayscale', min: 0, max: 100, rest: 0, unit: '%', scale: 100 },
];

/** What the slider of an adjustment shows for the element. */
export function adjustValue(element: ImageElement, control: AdjustControl): number {
  const value = element.adjust?.[control.key];
  return value === undefined ? control.rest : Math.round(value * control.scale);
}

/**
 * The change that sets one adjustment from its slider. An adjustment at rest is not stored, and
 * when none is left the field itself goes: an untouched picture has no `adjust`.
 */
export function adjustPatch(
  element: ImageElement,
  control: AdjustControl,
  value: number,
): ElementPatch {
  const next: Adjust = { ...element.adjust };
  const clamped = Math.min(control.max, Math.max(control.min, value));
  if (clamped === control.rest) delete next[control.key];
  else next[control.key] = Math.round((clamped / control.scale) * 1000) / 1000;
  return { adjust: Object.keys(next).length > 0 ? next : null };
}

/** Whether the picture has any adjustment to reset. */
export function isAdjusted(element: ImageElement): boolean {
  return Boolean(element.adjust && Object.keys(element.adjust).length > 0);
}

/* ---------------------------------------------------------------- filters */

/**
 * The duotones the filter picker offers, as pairs of theme tokens. The renderer draws the dark
 * parts in the darker of the two, so each pair works on a light theme and on a dark one.
 */
export const DUOTONES: readonly (readonly [ColorToken, ColorToken])[] = [
  ['primary', 'bg'],
  ['secondary', 'bg'],
  ['accent', 'bg'],
  ['text', 'primary'],
  ['text', 'accent'],
  ['primary', 'accent'],
];

export const duotoneNames = DUOTONES.map(([a, b]) => duotonePreset(a, b));

/** The change that gives the picture a ready-made look, or takes it away. */
export function filterPatch(preset: string | null): ElementPatch {
  return { filterPreset: preset };
}

/* ---------------------------------------------------------------- as the slide background */

/**
 * The picture becomes the background of its slide (IMG-10): the slide shows the file, covering
 * it, and the element is gone. One batch, so one undo step brings the element back. Empty for a
 * picture that has no file yet.
 *
 * The background shows the whole file: a slide background has no crop, mask or adjustments, so
 * those of the element are not carried over.
 */
export function asBackgroundCommands(slideId: string, element: ImageElement): Command[] {
  if (!element.assetId) return [];
  return [
    {
      type: 'slide.update',
      slideId,
      patch: { background: { fill: { kind: 'image', assetId: element.assetId, fit: 'cover' } } },
    },
    { type: 'element.remove', slideId, elementIds: [element.id] },
  ];
}
