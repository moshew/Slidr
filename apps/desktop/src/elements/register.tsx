import { GalleryVerticalEnd, Shapes } from '@slidr/ui/icons';
import { registerMessages } from '../i18n';
import { openPanel, registerAction, registerContextTool, registerPanel } from '../shell';
import { CardSetTools } from './cardSetTools';
import { DesignsPanel } from './DesignsCollection';
import { ElementsPanel } from './ElementsPanel';
import { en, he } from './messages';

registerMessages('elements', { he, en });

export const ELEMENTS_PANEL = 'elements';

registerPanel({
  id: ELEMENTS_PANEL,
  slot: 'tools',
  order: -1,
  title: 'elements:title',
  icon: Shapes,
  content: ElementsPanel,
});

export const DESIGNS_PANEL = 'designs';

// Ready slides (ADR-106): between Templates (the look of the whole deck) and Elements (what goes
// on the open slide), since a design is a whole slide of its own.
registerPanel({
  id: DESIGNS_PANEL,
  slot: 'tools',
  order: -1.5,
  title: 'elements:designs.title',
  icon: GalleryVerticalEnd,
  content: DesignsPanel,
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
