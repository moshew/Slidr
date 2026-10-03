import type { IconService, Services } from '@slidr/agent-tools';
import type { Editor } from '../shell/editor';
import { stockServiceOf } from './appStock';
import { findIcons } from './icons/library';

/**
 * The Deck API's icon service (`icon_search`): the built-in library, searched in Hebrew or in
 * English. The agent gets line icons only, which share one style (SPEC 9.1: one style of icons
 * for a deck).
 */
export const iconService: IconService = {
  search: ({ query, count }) => findIcons(query, { count, style: 'line' }),
};

/** The media services of an editing window, for the agent's tools: stock photos and icons. */
export function mediaServices(editor: Editor): Pick<Services, 'stock' | 'icons'> {
  return { stock: stockServiceOf(editor), icons: iconService };
}
