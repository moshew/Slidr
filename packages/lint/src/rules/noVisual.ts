import { slideArchetype, type Archetype } from '@slidr/model';
import { isOutside, slideArea } from '../geometry';
import type { Rule, SlideContext } from '../rule';
import { htmlHasVisual, isMeaningfulShape } from '../visual';

/**
 * Slides that may be text alone. Quote and section divider are the two QG-04 names; a big
 * number is itself the visual of its slide (SPEC 9.4, step 1).
 */
const TEXT_ARCHETYPES: readonly Archetype[] = ['quote', 'section', 'bigNumber'];

function hasVisual({ deck, slide, items }: SlideContext): boolean {
  const layout = slide.layoutId ? deck.layouts.find((l) => l.id === slide.layoutId) : undefined;
  const background = slide.background ?? layout?.background ?? deck.theme.background;
  // A photo behind the text is the picture of a full-image slide.
  if (background.fill.kind === 'image') return true;
  const area = slideArea(deck);
  return items.some(({ element, measure }) => {
    if (isOutside(measure.box, area)) return false;
    switch (element.type) {
      case 'image':
      case 'svg':
      case 'chart':
      case 'table':
      case 'video':
        return true;
      case 'shape':
        return isMeaningfulShape(element, area);
      case 'html':
        return htmlHasVisual(element);
      default:
        return false;
    }
  });
}

/** L16 (QG-04): a slide with content but no visual element, unless its archetype is textual. */
export const L16: Rule = {
  id: 'L16',
  severity: 'warning',
  agent: true,
  check(ctx) {
    const archetype = slideArchetype(ctx.deck, ctx.slide);
    if (archetype && TEXT_ARCHETYPES.includes(archetype)) return [];
    // An empty slide is L07's finding.
    if (ctx.items.length === 0 || hasVisual(ctx)) return [];
    return [
      {
        elementIds: [],
        message:
          'The slide has no visual element: no image, chart, icon, table or shape that carries the message, only text. Add one. If the slide is meant to be text alone, set its archetype to "quote", "section" or "bigNumber".',
      },
    ];
  },
};
