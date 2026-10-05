import {
  findElement,
  updateElement,
  type Command,
  type DispatchOptions,
  type Element,
  type ElementPatch,
  type Slide,
} from '@slidr/model';
import { useMemo } from 'react';
import { useDeck, useEditor, useSelection } from '../shell';

/** The slide on the Stage. */
export function useCurrentSlide(): Slide | undefined {
  const slideId = useSelection((s) => s.currentSlideId);
  return useDeck((s) =>
    slideId ? s.deck.slides.find((slide) => slide.id === slideId) : undefined,
  );
}

/** The one selected element, as a row B tool works on it. */
export interface Target<T extends Element = Element> {
  slideId: string;
  element: T;
  /**
   * Changes fields of the element. `first` are commands that belong to the same change and go
   * before it, such as the `asset.add` of a picture that was just imported.
   */
  update: (patch: ElementPatch, options?: DispatchOptions, first?: readonly Command[]) => void;
}

/**
 * The selected element, when exactly one is selected. Row B tools get only the kind of the
 * selection: they read the element here and draw nothing when they do not apply to it.
 */
export function useTarget(): Target | undefined {
  const { bus } = useEditor();
  const slide = useCurrentSlide();
  const selected = useSelection((s) => s.selectedElementIds);
  const elementId = selected.length === 1 ? selected[0] : undefined;
  return useMemo(() => {
    const element = slide && elementId ? findElement(slide, elementId) : undefined;
    if (!slide || !element) return undefined;
    const slideId = slide.id;
    return {
      slideId,
      element,
      update: (patch, options, first = []) =>
        bus.batch([...first, updateElement(slideId, element.id, patch)], options),
    };
  }, [bus, slide, elementId]);
}

/**
 * The selected elements, one or several, as a row B tool changes them together: a tool that works
 * for one element works for a selection of them, when it applies to every member.
 */
export interface Targets<T extends Element = Element> {
  slideId: string;
  elements: readonly T[];
  /**
   * Changes each element by a patch of its own, as one undo step for all of them. An element
   * whose patch is undefined is left alone. `first` are commands that belong to the same change
   * and go before it, such as the `asset.add` of a picture that was just imported.
   */
  update: (
    patchOf: (element: T) => ElementPatch | undefined,
    options?: DispatchOptions,
    first?: readonly Command[],
  ) => void;
}

/** The selected elements of the slide on the Stage; undefined when none is selected. */
export function useTargets(): Targets | undefined {
  const { bus } = useEditor();
  const slide = useCurrentSlide();
  const selected = useSelection((s) => s.selectedElementIds);
  return useMemo(() => {
    if (!slide || selected.length === 0) return undefined;
    const elements = selected.flatMap((id) => findElement(slide, id) ?? []);
    if (elements.length !== selected.length) return undefined;
    const slideId = slide.id;
    return {
      slideId,
      elements,
      update: (patchOf, options, first = []) => {
        // Each patch is made from the element as it is now: between two steps of a drag the
        // elements this was rendered with are already a step behind.
        const now = bus.deck.slides.find((s) => s.id === slideId);
        const commands = elements.flatMap(({ id }) => {
          const element = now ? findElement(now, id) : undefined;
          const patch = element ? patchOf(element) : undefined;
          return patch ? [updateElement(slideId, id, patch)] : [];
        });
        if (first.length + commands.length > 0) bus.batch([...first, ...commands], options);
      },
    };
  }, [bus, slide, selected]);
}

/** Targets that are all of the given element types. */
export function areTargets<K extends Element['type']>(
  targets: Targets,
  ...types: K[]
): targets is Targets<Extract<Element, { type: K }>> {
  return targets.elements.every((element) => (types as string[]).includes(element.type));
}

/** A target known to be of one element type. */
export function isTarget<K extends Element['type']>(
  target: Target | undefined,
  type: K,
): target is Target<Extract<Element, { type: K }>> {
  return target?.element.type === type;
}
