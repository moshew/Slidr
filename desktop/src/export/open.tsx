import { UiProvider } from '@slidr/ui';
import { createRoot } from 'react-dom/client';
import { i18n } from '../i18n';
import { focusStage, type Editor } from '../shell';
import { ExportDialog } from './ExportDialog';

/*
 * The export dialog is a React root of its own: the shell's `ask()` asks a question with
 * buttons, and this dialog has a form and a report. It is modal, like the shell's.
 */

let closing: (() => void) | undefined;

/** Opens the export dialog for the open deck. Does nothing when it is open already. */
export function openExportDialog(editor: Editor): void {
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
  root.render(
    <UiProvider dir={i18n.dir()}>
      <ExportDialog editor={editor} onClose={() => closing?.()} />
    </UiProvider>,
  );
}
