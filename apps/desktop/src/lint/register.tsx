import { registerMessages } from '../i18n';
import { registerStatusItem, whenEditor } from '../shell';
import { checkOf } from './app';
import { en, he } from './messages';
import { StatusCount } from './StatusCount';

/*
 * The design check follows the deck and surfaces actionable findings from the status bar.
 */

registerMessages('lint', { he, en });

registerStatusItem({ id: 'lint', render: StatusCount });

whenEditor((editor) => {
  checkOf(editor).watch();
});
