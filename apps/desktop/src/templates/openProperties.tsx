import { UiProvider } from '@slidr/ui';
import { createRoot } from 'react-dom/client';
import { i18n } from '../i18n';
import { EditorProvider, focusStage, type Editor } from '../shell';
import { DeckProperties } from './DeckProperties';

/*
 * The deck's properties are a React root of their own, like the export dialog, with the editor
 * given to it so its fields follow the deck as it changes.
 */

let closing: (() => void) | undefined;

/** Opens the properties of the open deck. Does nothing when they are open already. */
export function openDeckProperties(editor: Editor): void {
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
      <EditorProvider editor={editor}>
        <DeckProperties onClose={() => closing?.()} />
      </EditorProvider>
    </UiProvider>,
  );
}
