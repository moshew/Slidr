import { plainText, updateElement, type Command, type Frame } from '@slidr/model';
import { moveTops, type Move } from '../arrange';
import type { Item, Problem, Rule, SlideContext } from '../rule';
import { drawnDirection } from '../text';

/** Edges this close and not equal are a near miss (SPEC 9.2: 1 to 6px). */
export const NEAR = 6;
/** Rendering lands on fractions of a pixel: edges this close are equal. */
const EQUAL = 0.5;
/** The spacing unit of the guidelines (SPEC 9.1): a value on it is the likelier intent. */
const UNIT = 8;

type Side = 'left' | 'right' | 'top' | 'bottom';

const EDGE: Record<Side, (box: Frame) => number> = {
  left: (box) => box.x,
  right: (box) => box.x + box.w,
  top: (box) => box.y,
  bottom: (box) => box.y + box.h,
};
const OPPOSITE: Record<Side, Side> = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' };

/**
 * The objects whose edges are compared: what stands at the top of the slide's tree and is not
 * turned. A line is its two ends, not a box; a rotated element has no edge to line up.
 */
export function arranged(ctx: SlideContext): Item[] {
  return ctx.tops.filter(({ element }) => element.type !== 'line' && element.rotation === 0);
}

/**
 * The class of edges an object's edge is compared within, or undefined when the object shows
 * no such edge. A box shows all four. A text box shows only where its text is set against: the
 * side its lines are aligned to (the other side is ragged, and nobody sees where the frame
 * ends), and its top or its bottom when the text is seated there. The top of a text is where
 * its first line is, which depends on the size it is set in, so tops and bottoms of text are
 * compared between texts of one size and never with a box: a template that sets a large title
 * 6px above a small body beside it has lined up what the eye sees.
 */
function shows(ctx: SlideContext, { element, measure }: Item, side: Side): string | undefined {
  if (element.type !== 'text') return 'box';
  if (side === 'top' || side === 'bottom') {
    if (element.vAlign !== side) return undefined;
    return `text ${Math.round(measure.text?.spans[0]?.fontSize ?? 0)}`;
  }
  const first = element.content.paragraphs.find((p) => p.runs.some((run) => run.text !== ''));
  if (!first) return undefined;
  const text = plainText({ paragraphs: [first] });
  const start = drawnDirection(first.dir, text, ctx.deck.meta.dir) === 'rtl' ? 'right' : 'left';
  const set =
    first.align === 'start'
      ? [start]
      : first.align === 'end'
        ? [OPPOSITE[start]]
        : first.align === 'justify'
          ? ['left', 'right']
          : [];
  return set.includes(side) ? 'box' : undefined;
}

const round = (n: number) => Math.round(n * 10) / 10;

/** The value most of a cluster already holds; between equals, the one on the spacing unit. */
function target(values: number[]): number {
  const votes = values.map((v) => values.filter((other) => Math.abs(other - v) <= EQUAL).length);
  const most = Math.max(...votes);
  const offUnit = (v: number) => Math.abs(v - Math.round(v / UNIT) * UNIT);
  return values
    .filter((_, i) => votes[i] === most)
    .sort((a, b) => offUnit(a) - offUnit(b) || a - b)[0]!;
}

/**
 * The fix: every edge of the cluster goes to the value most of them hold. An element moves,
 * with what sits on it; unless its opposite edge is already lined up with another object's,
 * and then it is resized, so that fixing one edge does not break the other.
 */
function snap(ctx: SlideContext, all: Item[], cluster: Item[], side: Side, to: number): Command[] {
  const moves = new Map<string, Move>();
  const resizes: Command[] = [];
  const horizontal = side === 'left' || side === 'right';
  for (const item of cluster) {
    const by = to - EDGE[side](item.measure.box);
    if (Math.abs(by) <= EQUAL) continue;
    const other = EDGE[OPPOSITE[side]](item.measure.box);
    const held = all.some(
      (peer) => peer !== item && Math.abs(EDGE[OPPOSITE[side]](peer.measure.box) - other) <= EQUAL,
    );
    if (!held) {
      moves.set(item.element.id, horizontal ? { dx: by, dy: 0 } : { dx: 0, dy: by });
      continue;
    }
    const { frame } = item.element;
    const leading = side === 'left' || side === 'top';
    const size = (horizontal ? frame.w : frame.h) + (leading ? -by : by);
    if (size <= 0) continue;
    resizes.push(
      updateElement(ctx.slide.id, item.element.id, {
        frame: horizontal
          ? { ...frame, x: leading ? frame.x + by : frame.x, w: size }
          : { ...frame, y: leading ? frame.y + by : frame.y, h: size },
      }),
    );
  }
  return [...moveTops(ctx, moves), ...resizes];
}

/**
 * L09: edges of objects that nearly line up. Objects whose left edges stand at 96, 98 and 101
 * were meant to share one, and the eye sees that they do not. Only edges that show are compared
 * (see `shows`).
 */
export const L09: Rule = {
  id: 'L09',
  severity: 'warning',
  agent: false,
  check(ctx) {
    const all = arranged(ctx);
    const problems: Problem[] = [];
    for (const side of ['left', 'right', 'top', 'bottom'] as const) {
      const classes = new Map<string, Item[]>();
      for (const item of all) {
        const of = shows(ctx, item, side);
        if (of === undefined) continue;
        if (!classes.has(of)) classes.set(of, []);
        classes.get(of)!.push(item);
      }
      let cluster: Item[] = [];
      const flush = () => {
        const values = cluster.map((item) => EDGE[side](item.measure.box));
        if (cluster.length > 1 && values.at(-1)! - values[0]! > EQUAL) {
          const to = target(values);
          const axis = side === 'left' || side === 'right' ? 'x' : 'y';
          const fix = snap(ctx, all, cluster, side, to);
          problems.push({
            elementIds: cluster.map((item) => item.element.id),
            message: `The ${side} edges of ${cluster.map((item) => `"${item.element.id}"`).join(', ')} nearly line up (${axis} = ${values.map(round).join(', ')}): within ${NEAR}px of each other, and not equal. Align them at ${axis} = ${round(to)}.`,
            ...(fix.length ? { fix } : {}),
          });
        }
        cluster = [];
      };
      for (const members of classes.values()) {
        members.sort((a, b) => EDGE[side](a.measure.box) - EDGE[side](b.measure.box));
        for (const item of members) {
          const first = cluster[0];
          if (first && EDGE[side](item.measure.box) - EDGE[side](first.measure.box) > NEAR) flush();
          cluster.push(item);
        }
        flush();
      }
    }
    return problems;
  },
};
