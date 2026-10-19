import {
  alignElements,
  canReorder,
  distributeElements,
  locateElement,
  normalizeAngle,
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

/** The two say the same of a selection: the tools would be drawn the same. */
export function sameAbilities(a: Abilities, b: Abilities): boolean {
  return (
    a.count === b.count &&
    a.align === b.align &&
    a.distribute === b.distribute &&
    a.toSlide === b.toSlide &&
    a.group === b.group &&
    a.ungroup === b.ungroup &&
    a.allLocked === b.allLocked &&
    a.remove === b.remove &&
    a.order.front === b.order.front &&
    a.order.forward === b.order.forward &&
    a.order.backward === b.order.backward &&
    a.order.back === b.order.back
  );
}

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

/**
 * What the abilities of a selection depend on in its slide: which elements there are, in which
 * groups and in which order, which are locked, and how the groups are turned. Not where anything
 * is: a drag gives the slide new elements with every frame, and changes none of this.
 */
function shapeOf(elements: readonly Element[]): string {
  let shape = '';
  for (const e of elements) {
    shape += e.locked ? `${e.id}!,` : `${e.id},`;
    if (e.type === 'group') {
      const turned = normalizeAngle(e.rotation) !== 0 || e.flipH || e.flipV;
      shape += `(${turned ? 't' : ''}${shapeOf(e.children)})`;
    }
  }
  return shape;
}

/** The shapes of the lists of elements that cannot change any more. */
const shapes = new WeakMap<readonly Element[], string>();

function slideShape(slide: Slide): string {
  const { elements } = slide;
  if (!Object.isFrozen(elements)) return shapeOf(elements);
  let shape = shapes.get(elements);
  if (shape === undefined) shapes.set(elements, (shape = shapeOf(elements)));
  return shape;
}

/** The abilities found last, and what they were found for. */
let last: { key: string; can: Abilities } | undefined;

/**
 * What the arrange tools can do with the selection. Found once for a selection and the shape of
 * its slide (`shapeOf`): every tool of the row asks, and asks again with every frame of a drag,
 * and finding it tries the alignments and the distribution.
 */
export function abilities(slide: Slide | undefined, elementIds: readonly string[]): Abilities {
  if (!slide || elementIds.length === 0) return NONE;
  const key = `${slide.id} ${elementIds.join(' ')} ${slideShape(slide)}`;
  if (last?.key !== key) last = { key, can: find(slide, elementIds) };
  return last.can;
}

function find(slide: Slide, elementIds: readonly string[]): Abilities {
  const elements = selectedElements(slide, elementIds);
  if (elements.length === 0) return NONE;
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
