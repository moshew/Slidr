import { Blend, Film } from '@slidr/ui/icons';
import { registerMessages } from '../i18n';
import { openPanel, registerAction, registerContextTool, registerPanel } from '../shell';
import { AnimationsPanel } from './AnimationsPanel';
import { TransitionsPanel } from './TransitionEditor';
import { en, he } from './messages';
import { TransitionTool } from './TransitionTool';

/*
 * Animations and transitions in the editor (WG8-T04, T05): the Animations panel of the Activity
 * Bar and the transition tool of row B, in the places the shell kept for them (ADR-008). See
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

registerContextTool({
  id: 'slide.transition',
  kinds: ['none'],
  group: 'slide',
  order: 2,
  render: TransitionTool,
});
