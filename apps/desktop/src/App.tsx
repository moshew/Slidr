import { useEffect } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { EditorProvider, type Editor } from './shell/editor';
import { Shell } from './shell/Shell';

export function App({ editor }: { editor: Editor }) {
  useEffect(() => {
    // The main window starts hidden so Windows never displays an empty WebView2 surface.
    // A passive effect runs after React has committed the full shell to the DOM.
    if (!isTauri()) return;
    const appWindow = getCurrentWindow();
    const chrome = document.documentElement.dataset.theme === 'dark' ? '#161618' : '#f4f4f6';
    void appWindow
      .setBackgroundColor(chrome)
      .catch((error: unknown) => console.error('Could not set the window background', error))
      .then(() => appWindow.show())
      .catch((error: unknown) => console.error('Could not show the main window', error));
  }, []);

  return (
    <EditorProvider editor={editor}>
      <Shell />
    </EditorProvider>
  );
}
