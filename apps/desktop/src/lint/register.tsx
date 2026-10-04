import { ScanEye } from '@slidr/ui/icons';
import { registerMessages } from '../i18n';
import { registerPanel, registerSlideMark, registerStatusItem, whenEditor } from '../shell';
import { checkOf } from './app';
import { DesignCheckPanel } from './DesignCheckPanel';
import { SlideFindingsMark } from './SlideMark';
import { en, he } from './messages';
import { PANEL_ID, StatusCount } from './StatusCount';

/*
 * The design check in the app (WG7-T08, LNT-03): the panel the shell kept a place for, and the
 * count of findings in the status bar. See docs/adr/ADR-063-design-check-and-templates.md.
 */

registerMessages('lint', { he, en });

registerPanel({
  id: PANEL_ID,
  kind: 'tool',
  slot: 'tools',
  // The place SPEC 4.2 gives it, which the shell's placeholder held.
  order: 4,
  title: 'panels.lint',
  icon: ScanEye,
  content: DesignCheckPanel,
});

registerStatusItem({ id: 'lint', render: StatusCount });

// A mark on the thumbnail of a slide with findings (FLM-04).
registerSlideMark({ id: 'lint', render: SlideFindingsMark });

// The check follows the deck from the start, so the status bar counts before the panel opens.
whenEditor((editor) => {
  checkOf(editor).watch();
});
