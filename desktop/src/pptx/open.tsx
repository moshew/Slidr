import type { ImportWarning } from '@slidr/pptx';
import { UiProvider } from '@slidr/ui';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { i18n } from '../i18n';
import { focusStage, type Editor } from '../shell';
import { ImportReport } from './ImportReport';
import { PptxExportDialog } from './PptxExportDialog';

/*
 * The dialogs of PowerPoint export and import are React roots of their own, as the HTML export
 * dialog is (`export/open.tsx`): modal, one at a time.
 */

let closing: (() => void) | undefined;

function mount(render: (close: () => void) => ReactNode): void {
  if (closing) return;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  closing = () => {
    closing = undefined;
    root.unmount();
    host.remove();
    focusStage();
  };
  root.render(<UiProvider dir={i18n.dir()}>{render(() => closing?.())}</UiProvider>);
}

/** Opens the PowerPoint export dialog for the open deck. */
export function openPptxExport(editor: Editor): void {
  mount((close) => <PptxExportDialog editor={editor} onClose={close} />);
}

/** Shows what an import brought, and what came in otherwise than it was. */
export function openImportReport(report: {
  name: string;
  slides: number;
  warnings: ImportWarning[];
}): void {
  mount((close) => <ImportReport {...report} onClose={close} />);
}
