import { CommandError, type CommandOf } from '../commands';
import { createElement, richText } from '../factories';
import type { Deck, Element, PlaceholderRole } from '../schema';
import { deckIdSource } from './duplicate';

/** Placeholder roles that hold text. */
const TEXT_ROLES: ReadonlySet<PlaceholderRole> = new Set([
  'title',
  'subtitle',
  'body',
  'caption',
  'number',
  'quote',
  'attribution',
  'footer',
]);
/** Placeholder roles that hold a picture. */
const IMAGE_ROLES: ReadonlySet<PlaceholderRole> = new Set(['image', 'logo']);

export interface SlideFromLayoutOptions {
  /** Position of the new slide in the deck. Default: at the end. */
  index?: number;
  random?: () => number;
}

/**
 * A `slide.add` with a new slide of a layout (SLD-01): an empty text box for each text
 * placeholder, carrying its role, text style and alignment, and an empty image frame for each
 * picture placeholder. The decorations and the background stay with the layout, which the slide
 * points at, so the renderer draws them. Placeholders for a chart, a table or the slide number
 * give nothing yet: filling a layout with content by role, and mirroring it for the other
 * direction, is the layout engine's job (WG7-T02).
 */
export function slideFromLayout(
  deck: Deck,
  layoutId: string,
  options: SlideFromLayoutOptions = {},
): CommandOf<'slide.add'> {
  const layout = deck.layouts.find((l) => l.id === layoutId);
  if (!layout) throw new CommandError('not_found', `Layout "${layoutId}" does not exist.`);
  const fresh = deckIdSource(deck, options.random);

  const elements: Element[] = [];
  for (const { role, frame, styleRef, align, vAlign } of layout.placeholders) {
    if (TEXT_ROLES.has(role)) {
      elements.push(
        createElement.text({
          id: fresh('e'),
          role,
          frame: { ...frame },
          vAlign: vAlign ?? 'top',
          content: richText('', { align: align ?? 'start', styleRef }),
        }),
      );
    } else if (IMAGE_ROLES.has(role)) {
      elements.push(createElement.image({ id: fresh('e'), role, frame: { ...frame } }));
    }
  }
  return {
    type: 'slide.add',
    slide: { id: fresh('s'), layoutId, elements, timeline: [] },
    ...(options.index === undefined ? {} : { index: options.index }),
  };
}
