import { Shapes } from '@slidr/ui/icons';
import { registerMessages } from '../i18n';
import { openPanel, registerAction, registerContextTool, registerPanel } from '../shell';
import { CardSetTools } from './cardSetTools';
import { ElementsPanel } from './ElementsPanel';
import { en, he } from './messages';

registerMessages('elements', { he, en });

export const ELEMENTS_PANEL = 'elements';

registerPanel({
  id: ELEMENTS_PANEL,
  kind: 'tool',
  slot: 'tools',
  order: -1,
  title: 'elements:title',
  icon: Shapes,
  content: ElementsPanel,
});

registerAction('insert.elements', () => openPanel(ELEMENTS_PANEL));

// Row B of a card set (ADR-085): adding a card, after the Ungroup button of any group (40) and
// before the tools of a card's box (50). It draws nothing for a group that is no card set.
registerContextTool({
  id: 'elements.cards',
  kinds: ['group'],
  group: 'elements.cards',
  order: 45,
  render: CardSetTools,
});
