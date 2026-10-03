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

/** A target known to be of one element type. */
export function isTarget<K extends Element['type']>(
  target: Target | undefined,
  type: K,
): target is Target<Extract<Element, { type: K }>> {
  return target?.element.type === type;
}
