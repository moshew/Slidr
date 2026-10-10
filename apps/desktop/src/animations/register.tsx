import { Blend, Film } from '@slidr/ui/icons';
import { registerMessages } from '../i18n';
import { openPanel, registerAction, registerPanel } from '../shell';
import { AnimationsPanel } from './AnimationsPanel';
import { TransitionsPanel } from './TransitionEditor';
import { en, he } from './messages';

/*
 * Animations and transitions in the editor (WG8-T04, T05): the Animations panel of the Activity
 * Bar and the transitions panel. See
 * docs/adr/ADR-031-animations-panel.md.
 */

registerMessages('animations', { he, en });

registerPanel({
  id: 'animations',
  kind: 'tool',
  slot: 'tools',
  order: 1,
  title: 'panels.animations',
  icon: Film,
  content: AnimationsPanel,
});

const TRANSITIONS_PANEL = 'transitions';

registerPanel({
  id: TRANSITIONS_PANEL,
  kind: 'tool',
  slot: 'tools',
  order: 1.5,
  title: 'panels.transitions',
  icon: Blend,
  content: TransitionsPanel,
});

// A transition's mark in the Filmstrip makes its slide the current one, and opens the panel.
registerAction('transition', () => openPanel(TRANSITIONS_PANEL));
