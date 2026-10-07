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
    // Resolve the theme token to RGBA: Tauri accepts byte tuples and hex strings, while CSS
    // computes light-dark() to rgb(). A pixel also handles future CSS colour spaces.
    const pixel = document.createElement('canvas');
    pixel.width = pixel.height = 1;
    const context = pixel.getContext('2d')!;
    context.fillStyle = getComputedStyle(document.body).backgroundColor;
    context.fillRect(0, 0, 1, 1);
    const chrome = Array.from(context.getImageData(0, 0, 1, 1).data) as [
      number,
      number,
      number,
      number,
    ];
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
