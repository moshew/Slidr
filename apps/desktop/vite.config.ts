import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Port and host are fixed because `tauri.conf.json` points `devUrl` at them.
// Any HTML file under this folder is a page of the dev server, e.g. `/dev/gallery.html`.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: {
    // WebView2 is evergreen Chromium; no need to transpile down.
    target: 'chrome120',
    sourcemap: Boolean(process.env.TAURI_ENV_DEBUG),
    rollupOptions: {
      // The app, and the page of the hidden slide-capture window (ADR-003).
      input: {
        main: fileURLToPath(new URL('index.html', import.meta.url)),
        capture: fileURLToPath(new URL('capture.html', import.meta.url)),
      },
    },
  },
});
