import {
  findElement,
  updateElement,
  type Command,
  type CommandBus,
  type DispatchOptions,
  type Element,
  type ElementPatch,
  type ShapeElement,
  type Slide,
} from '@slidr/model';
import { useMemo } from 'react';
import { useStoreWithEqualityFn } from 'zustand/traditional';
import { useDeck, useEditor, useSelection } from '../shell';
import { cardBox } from './card';

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

/** An element of a slide as a target. `element.update` finds it by its id, also inside a group. */
export function targetOf<T extends Element>(
  bus: CommandBus,
  slideId: string,
  element: T,
): Target<T> {
  return {
    slideId,
    element,
    update: (patch, options, first = []) =>
      bus.batch([...first, updateElement(slideId, element.id, patch)], options),
  };
}

/**
 * Fields of an element that row B does not draw from: where its box is, and its text. They change
 * with every frame of a drag and every letter typed, and twenty tools drawn again for each of them
 * cost the row a millisecond a frame. A tool that needs them reads them when it acts, from the
 * deck as it is then (`Targets.update` does), or from a store of its own.
 */
const PASSING = new Set(['frame', 'content']);

/** The two are the same element to the tools of row B, wherever its box is and whatever it says. */
function sameToTools(a: Element, b: Element): boolean {
  if (a === b) return true;
  const x = a as unknown as Record<string, unknown>;
  const y = b as unknown as Record<string, unknown>;
  const keys = Object.keys(x);
  if (keys.length !== Object.keys(y).length) return false;
  return keys.every((key) => {
    if (PASSING.has(key) || x[key] === y[key]) return true;
    // A group moved or resized moves its children with it.
    return key === 'children' && a.type === 'group' && b.type === 'group'
      ? sameElements(a.children, b.children)
      : false;
  });
}

function sameElements(a: readonly Element[], b: readonly Element[]): boolean {
  return a.length === b.length && a.every((element, i) => sameToTools(element, b[i]!));
}

/**
 * Elements of the slide on the Stage, by their ids, as row B draws from them: the same objects
 * while a change touches only their box or their text (`sameToTools`). Undefined when the slide
 * does not hold every one of them.
 */
function useElementsOf(ids: readonly string[]): readonly Element[] | undefined {
  const editor = useEditor();
  const slideId = useSelection((s) => s.currentSlideId);
  return useStoreWithEqualityFn(
    editor.deck,
    (s) => {
      const slide = slideId ? s.deck.slides.find((one) => one.id === slideId) : undefined;
      if (!slide || ids.length === 0) return undefined;
      const elements = ids.flatMap((id) => findElement(slide, id) ?? []);
      return elements.length === ids.length ? elements : undefined;
    },
    (a, b) => a === b || (a !== undefined && b !== undefined && sameElements(a, b)),
  );
}

const NONE: readonly string[] = [];

/** The one selected element of the slide on the Stage, when exactly one is selected. */
function useSelected(): { slideId: string; element: Element } | undefined {
  const slideId = useSelection((s) => s.currentSlideId);
  const selected = useSelection((s) => s.selectedElementIds);
  const elements = useElementsOf(selected.length === 1 ? selected : NONE);
  const element = elements?.[0];
  return useMemo(() => (slideId && element ? { slideId, element } : undefined), [slideId, element]);
}

/**
 * The selected element, when exactly one is selected. Row B tools get only the kind of the
 * selection: they read the element here and draw nothing when they do not apply to it. The element
 * is the one the tools were last drawn for: its box and its text may have changed since.
 */
export function useTarget(): Target | undefined {
  const { bus } = useEditor();
  const selected = useSelected();
  return useMemo(
    () => selected && targetOf(bus, selected.slideId, selected.element),
    [bus, selected],
  );
}

/**
 * An element that the selected one stands for, as a target: `pick` finds it in the selected
 * element, which may be that element itself (the picture of a group that a frame made, or a
 * picture that is selected as it is). `pick` is a function of the module, not made on a render.
 */
export function useTargetIn<T extends Element>(
  pick: (selected: Element) => T | undefined,
): Target<T> | undefined {
  const { bus } = useEditor();
  const selected = useSelected();
  return useMemo(() => {
    const element = selected && pick(selected.element);
    return selected && element ? targetOf(bus, selected.slideId, element) : undefined;
  }, [bus, selected, pick]);
}

/**
 * The box of the selected card (`cardBox`), when exactly one element is selected and it is a
 * card. The tools of a shape take it in place of the selection, so a card that is selected as
 * the group it is gets painted like the box it looks like, with no step into the group first.
 */
export function useCardBox(): Target<ShapeElement> | undefined {
  const { bus } = useEditor();
  const selected = useSelected();
  return useMemo(() => {
    const box = selected && cardBox(selected.element);
    return box ? targetOf(bus, selected.slideId, box) : undefined;
  }, [bus, selected]);
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
  const slideId = useSelection((s) => s.currentSlideId);
  const selected = useSelection((s) => s.selectedElementIds);
  const elements = useElementsOf(selected);
  return useMemo(() => {
    if (!slideId || !elements) return undefined;
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
  }, [bus, slideId, elements]);
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
