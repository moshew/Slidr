import { defineConfig, type Plugin } from 'vite';
import app from '../vite.config';

/**
 * `/?hold` is an empty page. The app's window opens on it (`eval.tauri.conf.json`), so the runner
 * can check which data folder the app was started with before the app itself loads and writes
 * its first workspace. The capture window's page still resolves against the root.
 */
const hold: Plugin = {
  name: 'slidr-eval-hold',
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      if (request.url !== '/?hold') {
        next();
        return;
      }
      response.setHeader('Content-Type', 'text/html');
      response.end('<!doctype html><title>Slidr evaluation</title>');
    });
  },
};

// The dev server the evaluation set runs the app on. It serves the sources as they were when a
// module was first asked for and never reloads the page: a run takes most of an hour, and an
// edit to a prompt in the middle of it must not restart the deck under test. Restart the server
// to pick up changes.
export default defineConfig({
  ...app,
  plugins: [...(app.plugins ?? []), hold],
  server: {
    ...app.server,
    // A session with ports of its own names its port (see scripts/run.mjs).
    port: Number(process.env.SLIDR_EVAL_VITE_PORT ?? 1491),
    strictPort: true,
    watch: null,
    hmr: false,
  },
});
