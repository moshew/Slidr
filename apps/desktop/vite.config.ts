import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Port and host are fixed because `tauri.conf.json` points `devUrl` at them.
export default defineConfig({
  plugins: [react()],
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
  },
});
