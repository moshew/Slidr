import { normalizeAngle, type Command, type Element, type Frame, type Slide } from '@slidr/model';
import { refitPatches, resizeGroup, type Patch } from '../stage/groups';
import { indexElements } from '../stage/space';

/*
 * Position, size and rotation as numbers (ARR-07): what the fields of row B write. A number
 * does what the matching gesture on the Stage does: a group is stretched with what is in it, and
 * the groups around an element are fitted to it again. Pure, so it is tested without a DOM.
 */

export type PlacementField = 'x' | 'y' | 'w' | 'h' | 'rotation';

/** The smallest side a field accepts, in slide pixels: as the Stage's own resize. */
export const MIN_SIDE = 1;

/** The types whose proportions are theirs to keep: a picture stretched by a number is distorted. */
const KEEPS_ASPECT = new Set<Element['type']>(['image', 'svg', 'video', 'html', 'chart']);

/** Whether width and height start out tied for an element (IMG-02). */
export function keepsAspect(element: Element): boolean {
  return KEEPS_ASPECT.has(element.type);
}

/**
 * Whether the size of an element is set by numbers. A line is drawn between its points, which
 * the Stage edits; its frame is only the box around them.
 */
export function sizable(element: Element): boolean {
  return element.type !== 'line';
}

/** The rotation as the field shows it: -180 to 180, so that a turn to the left reads as one. */
export function shownRotation(rotation: number): number {
  const turned = normalizeAngle(Math.round(rotation * 10) / 10);
  return turned > 180 ? Math.round((turned - 360) * 10) / 10 : turned;
}

/** The frame of an element with one of its numbers changed. */
export function frameWith(
  frame: Frame,
  field: Exclude<PlacementField, 'rotation'>,
  value: number,
  keepAspect: boolean,
): Frame {
  if (field === 'x' || field === 'y') return { ...frame, [field]: Math.round(value) };
  const side = Math.max(MIN_SIDE, Math.round(value));
  if (!keepAspect || frame.w <= 0 || frame.h <= 0) return { ...frame, [field]: side };
  return field === 'w'
    ? { ...frame, w: side, h: Math.max(MIN_SIDE, Math.round((side * frame.h) / frame.w)) }
    : { ...frame, h: side, w: Math.max(MIN_SIDE, Math.round((side * frame.w) / frame.h)) };
}

/**
 * The commands that set one number of an element's placement, as one batch: the element, what
 * is inside it when it is a group, and the groups it is in. Empty when the element is not on
 * the slide, is locked, or already has that number.
 */
export function placementCommands(
  slide: Slide,
  elementId: string,
  field: PlacementField,
  value: number,
  keepAspect = false,
): Command[] {
  const located = indexElements(slide.elements).get(elementId);
  if (!located || located.locked || !Number.isFinite(value)) return [];
  const { element } = located;
  let patches: Map<string, Patch>;
  if (field === 'rotation') {
    const rotation = normalizeAngle(Math.round(value * 10) / 10);
    if (rotation === normalizeAngle(element.rotation)) return [];
    patches = new Map([[element.id, { rotation }]]);
  } else {
    if (!sizable(element) && (field === 'w' || field === 'h')) return [];
    const frame = frameWith(element.frame, field, value, keepAspect);
    if (JSON.stringify(frame) === JSON.stringify(element.frame)) return [];
    const resized = frame.w !== element.frame.w || frame.h !== element.frame.h;
    patches =
      element.type === 'group' && resized
        ? resizeGroup(element, frame)
        : new Map([[element.id, { frame }]]);
  }
  return Array.from(refitPatches(located.path, patches), ([id, patch]) => ({
    type: 'element.update' as const,
    slideId: slide.id,
    elementId: id,
    patch,
  }));
}
