import { registerMessages } from '../i18n';
import { getEditor, registerAction, registerShortcut } from '../shell';
import { en, he } from './messages';
import { startPresenting } from './present';

/*
 * Present mode (WG8-T06, T07): the row A button and the shortcuts of SPEC Appendix A. The button
 * shows the slide on the Stage, which is what one wants while editing; F5 is the whole deck from
 * its start. See docs/adr/ADR-030-present-mode.md.
 */

registerMessages('present', { he, en });

registerAction('present', () => {
  startPresenting(getEditor(), { from: 'current' });
});

registerShortcut({
  id: 'present.fromStart',
  keys: 'F5',
  label: 'keys.presentStart',
  section: 'present',
  run: (editor) => startPresenting(editor, { from: 'first' }),
});
registerShortcut({
  id: 'present.fromCurrent',
  keys: 'Shift+F5',
  label: 'keys.presentCurrent',
  section: 'present',
  run: (editor) => startPresenting(editor, { from: 'current' }),
});
