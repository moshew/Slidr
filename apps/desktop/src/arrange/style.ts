import type { Command, Element, ElementPatch, Slide } from '@slidr/model';
import { findElement } from '@slidr/model';
import { isBoxPreset, presetPath } from '@slidr/renderer';

/*
 * "Paste style only" for objects (ARR-06): the look of the element that was copied, put on the
 * selected ones, each taking what its own type can show. Nothing about where an element is or
 * what it holds is touched: not its frame, not its text, not its picture. The formatting of text
 * is the text tools' (TXT-10). Pure, so it is tested without a DOM.
 */

/** Whether a shape has an inside to fill: brackets and open paths do not. */
function hasFill(element: Extract<Element, { type: 'shape' }>): boolean {
  const { geometry } = element;
  if (geometry.kind === 'path') return /z\s*$/i.test(geometry.d.trim());
  return presetPath(geometry.preset, 100, 100)?.closed !== false;
}

/** Whether `effects.radius` rounds the corners of an element (see the renderer's `boxStyle`). */
function roundsCorners(element: Element): boolean {
  switch (element.type) {
    case 'image':
      return !element.mask;
    case 'video':
    case 'html':
      return true;
    case 'shape':
      return (
        element.geometry.kind === 'preset' &&
        isBoxPreset(element.geometry.preset) &&
        element.geometry.preset === 'rect'
      );
    default:
      return false;
  }
}

/** The outline of an element, whatever its type calls it. */
function outlineOf(element: Element) {
  if (element.type === 'shape' || element.type === 'line') return element.stroke;
  if (element.type === 'image') return element.border;
  return undefined;
}

const hasOutline = (element: Element) =>
  element.type === 'shape' || element.type === 'line' || element.type === 'image';

/**
 * The change that gives `target` the style of `source`, or undefined when it would change
 * nothing. What is taken:
 *
 * - from any element to any other: opacity, shadow and blur, and the corner radius where the
 *   target has corners to round;
 * - between elements that have an outline (shape, line, image): the outline. A line always has
 *   one, so "no outline" is not pasted onto it;
 * - shape to shape: the fill, when the target has an inside to fill;
 * - line to line: the ends and the way the line runs;
 * - image to image: mask, adjustments and filter;
 * - table to table: the table style.
 */
export function stylePatch(source: Element, target: Element): ElementPatch | undefined {
  const patch: Record<string, unknown> = {};
  const set = (key: string, next: unknown, now: unknown) => {
    if (JSON.stringify(next ?? null) !== JSON.stringify(now ?? null)) patch[key] = next ?? null;
  };

  set('opacity', source.opacity, target.opacity);
  const { shadow, blur } = source.effects ?? {};
  // Corners are taken only from an element that has corners to round; otherwise the target's stay.
  const radius = !roundsCorners(target)
    ? undefined
    : roundsCorners(source)
      ? source.effects?.radius
      : target.effects?.radius;
  const effects = {
    ...(shadow ? { shadow } : {}),
    ...(blur ? { blur } : {}),
    ...(radius !== undefined ? { radius } : {}),
  };
  set('effects', Object.keys(effects).length > 0 ? effects : undefined, target.effects);

  if (hasOutline(source) && hasOutline(target)) {
    const outline = outlineOf(source);
    if (target.type === 'image') set('border', outline, target.border);
    else if (target.type === 'shape') set('stroke', outline, target.stroke);
    else if (target.type === 'line' && outline) set('stroke', outline, target.stroke);
  }
  if (source.type === 'shape' && target.type === 'shape' && hasFill(target)) {
    set('fill', source.fill, target.fill);
  }
  if (source.type === 'line' && target.type === 'line') {
    set('startHead', source.startHead, target.startHead);
    set('endHead', source.endHead, target.endHead);
    set('curve', source.curve, target.curve);
  }
  if (source.type === 'image' && target.type === 'image') {
    set('mask', source.mask, target.mask);
    set('adjust', source.adjust, target.adjust);
    set('filterPreset', source.filterPreset, target.filterPreset);
  }
  if (source.type === 'table' && target.type === 'table') {
    set('style', source.style, target.style);
  }
  return Object.keys(patch).length > 0 ? patch : undefined;
}

/**
 * The commands that paste the style of `source` onto elements of a slide, as one batch. A locked
 * element, and the source itself, are left as they are.
 */
export function pasteStyleCommands(
  slide: Slide,
  elementIds: readonly string[],
  source: Element,
): Command[] {
  const commands: Command[] = [];
  for (const elementId of elementIds) {
    const target = findElement(slide, elementId);
    if (!target || target.locked || target.id === source.id) continue;
    const patch = stylePatch(source, target);
    if (patch) commands.push({ type: 'element.update', slideId: slide.id, elementId, patch });
  }
  return commands;
}
