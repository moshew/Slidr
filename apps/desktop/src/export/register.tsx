import { registerMessages } from '../i18n';
import { getEditor, registerAction } from '../shell';
import { en, he } from './messages';
import { openExportDialog } from './open';

/*
 * Export to HTML (WG9-T12): the row A button opens the export dialog. See
 * docs/adr/ADR-032-export-dialog-and-fonts.md.
 */

registerMessages('export', { he, en });

registerAction('export', () => openExportDialog(getEditor()));
