import { i18n, registerMessages } from '../i18n';
import { getEditor, registerAction, registerImporter } from '../shell';
import { importPptxFile, importPptxPath } from './importFlow';
import { en, he } from './messages';
import { openPptxExport } from './open';

/*
 * PowerPoint files (ADR-108): "Import PowerPoint…" and "Export to PowerPoint…" of the File menu,
 * and a .pptx chosen in "Load from file" of the welcome screen.
 */

registerMessages('pptx', { he, en });

registerAction('importPptx', () => void importPptxFile(getEditor()));
registerAction('exportPptx', () => openPptxExport(getEditor()));

registerImporter({
  id: 'pptx',
  extensions: ['pptx'],
  filterName: () => i18n.t('filter', { ns: 'pptx' }),
  open: (path) => void importPptxPath(getEditor(), path),
});
