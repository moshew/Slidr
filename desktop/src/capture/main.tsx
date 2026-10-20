/**
 * The capture page (ADR-003), in a window that is never shown. Rust hands it one slide at a time;
 * it draws the slide with `SlideRenderer` in `edit` mode (ADR-009), waits until it has settled,
 * and reports ready, after which Rust takes the screenshot.
 */
import type { AssetMeta } from '@slidr/model';
import { ScaledSlide } from '@slidr/renderer';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { listenForConversionJobs } from '../agent/conversionPage';
import { registerBuiltinFonts } from '../fonts';
import { shareScriptNonce } from '../scriptNonce';
import { SURFACE_WIDTH, type PageRequest } from './protocol';
import { settle } from './settle';

registerBuiltinFonts();
// A slide is captured as the user sees it: with the scripts of its `html` objects run (ADR-066).
shareScriptNonce();
const host = document.getElementById('root');
if (!host) throw new Error('#root is missing');

let renderError: unknown = null;
const root = createRoot(host, {
  onUncaughtError: (error) => {
    renderError = error;
  },
});

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

async function draw(request: PageRequest): Promise<void> {
  const slide = request.deck.slides[0];
  if (!slide) throw new Error('the request has no slide');
  const { assetsDir } = request;
  const resolveAsset = assetsDir
    ? (asset: AssetMeta) => convertFileSrc(`${assetsDir}/${asset.file}`)
    : undefined;
  renderError = null;
  flushSync(() => {
    root.render(
      <ScaledSlide
        deck={request.deck}
        slide={slide}
        width={SURFACE_WIDTH}
        mode="edit"
        resolveAsset={resolveAsset}
      />,
    );
  });
  await settle();
  if (renderError !== null) throw new Error(message(renderError));
}

// One thing at a time on this page: a slide drawn for a capture, or a job that draws a work
// surface of its own over it (ADR-027).
let last: Promise<unknown> = Promise.resolve();
function inTurn<T>(work: () => Promise<T>): Promise<T> {
  const run = last.then(work, work);
  last = run.catch(() => undefined);
  return run;
}

listenForConversionJobs(inTurn);

window.__slidrCapture = (id, request) => {
  void inTurn(() => draw(request)).then(
    () => invoke('capture_ready', { id, dpr: window.devicePixelRatio, error: null }),
    (error: unknown) =>
      invoke('capture_ready', { id, dpr: window.devicePixelRatio, error: message(error) }),
  );
};

void invoke('capture_page_loaded');
