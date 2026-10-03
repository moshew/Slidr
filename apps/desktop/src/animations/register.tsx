import { Film } from '@slidr/ui/icons';
import { registerMessages } from '../i18n';
import { registerContextTool, registerPanel } from '../shell';
import { AnimationsPanel } from './AnimationsPanel';
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

registerContextTool({
  id: 'slide.transition',
  kinds: ['none'],
  group: 'slide',
  order: 2,
  render: TransitionTool,
});
