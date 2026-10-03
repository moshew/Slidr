import {
  alignElements,
  canReorder,
  distributeElements,
  locateElement,
  type Element,
  type Slide,
  type ZOrderMove,
} from '@slidr/model';

/** What the arrange tools can do with a selection: a tool that cannot act is disabled. */
export interface Abilities {
  /** Selected elements that are on the slide. */
  count: number;
  /** Align against the bounds of the selection: two or more of one parent, one of them movable. */
  align: boolean;
  /** Even out the gaps: three or more movable elements of one parent. */
  distribute: boolean;
  /** Align and distribute against the slide. */
  toSlide: boolean;
  group: boolean;
  ungroup: boolean;
  order: Record<ZOrderMove, boolean>;
  /** Every selected element is locked, so the menu offers to unlock. */
  allLocked: boolean;
  /** Something selected is not locked, so it can be deleted or cut. */
  remove: boolean;
}

const NONE: Abilities = {
  count: 0,
  align: false,
  distribute: false,
  toSlide: false,
  group: false,
  ungroup: false,
  order: { front: false, forward: false, backward: false, back: false },
  allLocked: false,
  remove: false,
};

/** The compose helpers refuse what they cannot do (other parents, too few elements) by throwing. */
function works(compute: () => unknown): boolean {
  try {
    compute();
    return true;
  } catch {
    return false;
  }
}

/** The selected elements that exist on the slide, in the order they were selected. */
export function selectedElements(slide: Slide | undefined, ids: readonly string[]): Element[] {
  if (!slide) return [];
  return ids.flatMap((id) => locateElement(slide.elements, id)?.element ?? []);
}

export function abilities(slide: Slide | undefined, elementIds: readonly string[]): Abilities {
  const elements = selectedElements(slide, elementIds);
  if (!slide || elements.length === 0) return NONE;
  const ids = elements.map((e) => e.id);
  const movable = elements.some((e) => !e.locked);
  const oneParent = works(() => alignElements(slide, ids, 'left', 'selection'));
  return {
    count: ids.length,
    align: ids.length > 1 && oneParent && movable,
    distribute: works(() => distributeElements(slide, ids, 'horizontal', 'selection')),
    toSlide: movable && works(() => alignElements(slide, ids, 'left', 'slide')),
    group: ids.length > 1 && oneParent,
    ungroup: elements.some((e) => e.type === 'group'),
    order: {
      front: canReorder(slide, ids, 'front'),
      forward: canReorder(slide, ids, 'forward'),
      backward: canReorder(slide, ids, 'backward'),
      back: canReorder(slide, ids, 'back'),
    },
    allLocked: elements.every((e) => e.locked),
    remove: movable,
  };
}
