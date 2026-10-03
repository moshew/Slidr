import { unionBounds, type Frame } from '@slidr/model';
import { area, contentArea, describeBox, intersection, slideArea } from '../geometry';
import type { Item, Rule } from '../rule';
import { isMeaningfulShape } from '../visual';

/** The content's bounding box has to cover this share of the content area (SPEC 9.2). */
export const MIN_COVERAGE = 0.6;

/**
 * Where an element counts as content. Text counts by its glyphs: a wide, mostly empty text box
 * fills nothing. A line, and a shape that is a divider or a background panel, do not count: one
 * rule across the slide would otherwise stretch the bounding box over empty space.
 */
function contentBox({ element, measure }: Item, slide: Frame): Frame | undefined {
  switch (element.type) {
    case 'line':
      return undefined;
    case 'text':
      return measure.text?.ink;
    case 'shape':
      return isMeaningfulShape(element, slide) ? measure.box : measure.text?.ink;
    default:
      return measure.box;
  }
}

/** L07: the bounding box of the content covers less than 60% of the area inside the margins. */
export const L07: Rule = {
  id: 'L07',
  severity: 'warning',
  agent: true,
  check({ deck, items }) {
    const slide = slideArea(deck);
    const safe = contentArea(deck);
    const boxes = items.flatMap((item) => contentBox(item, slide) ?? []);
    const need = `at least ${MIN_COVERAGE * 100}% of the content area (the ${safe.w}x${safe.h}px inside the safe margins) is required`;
    if (boxes.length === 0) {
      return [{ elementIds: [], message: `The slide has no content; ${need}. Fill the slide.` }];
    }
    const bounds = unionBounds(boxes);
    const covered = intersection(bounds, safe);
    const share = covered ? area(covered) / area(safe) : 0;
    if (share >= MIN_COVERAGE) return [];
    return [
      {
        elementIds: [],
        // Rounded down, so a share just short of the bar never reads as meeting it.
        message: `The content covers ${Math.floor(share * 100)}% of the content area: its bounding box is ${describeBox(bounds)}, and ${need}. Enlarge or spread out the content, or add a visual element, so the slide is filled.`,
      },
    ];
  },
};
