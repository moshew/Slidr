import {
  DeckApiError,
  markdownToRichText,
  type LayoutService,
  type RoleContent,
} from '@slidr/agent-tools';
import type { Layout, PlaceholderRole } from '@slidr/model';
import { createSlide, type LayoutContent, type RoleFill } from '@slidr/templates';

/** The roles of a layout as the agent should read them: `title, body ×3, image`. */
function describeRoles(layout: Layout): string {
  const counts = new Map<PlaceholderRole, number>();
  for (const { role } of layout.placeholders) counts.set(role, (counts.get(role) ?? 0) + 1);
  if (counts.size === 0) return 'none';
  return [...counts].map(([role, n]) => (n > 1 ? `${role} ×${n}` : role)).join(', ');
}

/**
 * The Deck API's layout service (`slide_create`) over the layout engine. The engine takes rich
 * text; the Markdown of `text_set` becomes rich text here, in the deck's direction, because this
 * is where both packages are in view. Content the layout has no place for is an error the agent
 * can act on: the service returns only a slide, so dropping it would go unnoticed.
 */
export function createLayoutService(): LayoutService {
  return {
    createSlide: (deck, { layoutId, content, name }) =>
      Promise.resolve().then(() => {
        const fill = (value: RoleContent): RoleFill =>
          typeof value === 'string' ? markdownToRichText(value, { deckDir: deck.meta.dir }) : value;
        const fills: LayoutContent = {};
        for (const [role, value] of Object.entries(content)) {
          if (value === undefined) continue;
          fills[role as PlaceholderRole] = Array.isArray(value) ? value.map(fill) : fill(value);
        }
        const { slide, unplaced } = createSlide(deck, {
          layoutId,
          content: fills,
          ...(name ? { name } : {}),
        });
        if (unplaced.length > 0) {
          const layout = deck.layouts.find((l) => l.id === layoutId);
          throw new DeckApiError(
            'invalid_input',
            `Layout "${layoutId}" has no place for the content of: ${unplaced.join(', ')}. ` +
              `Its placeholders: ${layout ? describeRoles(layout) : 'none'}. ` +
              'A text role takes Markdown, image and logo take {"assetId"} or {"imagePrompt"}, ' +
              'and a role with several placeholders takes a list, one value for each in order; ' +
              'a chart and a table are filled after the slide is made (chart_set, table_set). ' +
              'Nothing was created.',
          );
        }
        return slide;
      }),
  };
}
