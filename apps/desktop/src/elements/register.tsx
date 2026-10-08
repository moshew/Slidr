import { Shapes } from '@slidr/ui/icons';
import { registerMessages } from '../i18n';
import { openPanel, registerAction, registerPanel } from '../shell';
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
