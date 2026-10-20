/**
 * The HTML conversion engine in the app (ADR-017, ADR-027).
 *
 * The engine draws what it converts on a work surface the size of a slide and takes pictures of
 * it, so it cannot run in the editor's window: the user would see every slide flash over their
 * work. In the app it runs in the hidden capture window (ADR-003), which already has the
 * renderer and the fonts. The main window hands it a job through Rust and gets the result back:
 *
 * ```text
 * main window                         Rust (capture/)                    capture page
 * captureWindowConversion
 *   capture_run_job({ job }) ───────► window.__slidrJob(id) ───────────► capture_job_take(id)
 *                                                                        runConversionJob
 *                                     Page.captureScreenshot ◄────────── capture_clip(rect)
 *        ◄── the conversion ◄──────── capture_job_done(id, result) ◄────
 * ```
 *
 * In a plain browser (the Vite page, Playwright) there is no second window and nothing to take
 * a picture with; `pageConversion` runs the engine in the page itself, unguarded.
 */
import type { ConversionService, ElementConversion, HtmlSlideConversion } from '@slidr/agent-tools';
import { createConversionService, type ConversionHost } from '@slidr/html-import';
import type { AssetMeta, Deck } from '@slidr/model';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import type { AssetService } from '../document/assets';
import { tauriStorage } from '../document/tauriStorage';
import { iconMarkup } from '../media/icons/library';

/** One call of the conversion service, with the deck it was made on. */
export type ConversionJob =
  | { kind: 'htmlToSlide'; deck: Deck; request: { html: string; name?: string } }
  | {
      kind: 'convertElement';
      deck: Deck;
      request: { slideId: string; elementId: string; to: 'elements' | 'html'; force?: boolean };
    };

/** A job as the capture page receives it. */
export interface ConversionEnvelope {
  /** The job, and the workspace the assets it stores go to. */
  job: ConversionJob & { workspaceId: string | null };
  /** The workspace's `assets/` folder, for the asset protocol; null when there is none. */
  assetsDir: string | null;
}

/** A file name that tells the asset store the type, for content that does not say it itself. */
function assetFileName(info: { mime: string; name?: string }): string {
  const subtype = info.mime.split('/')[1]?.split(/[+;]/)[0] ?? '';
  const extension = /^[a-z0-9]{1,8}$/.test(subtype) ? subtype : 'bin';
  return `${info.name ?? 'converted'}.${extension}`;
}

/**
 * What the engine needs from the app, in the window it runs in: pictures of that window through
 * `capture_clip`, assets in the open workspace, the asset protocol to load them from, and the
 * icon library for `data-icon` (WG5-T11).
 */
export function workspaceConversionHost(workspace: {
  id: string | null;
  assetsDir: string | null;
}): ConversionHost {
  return {
    async capture(rect) {
      const png = await invoke<ArrayBuffer>('capture_clip', {
        rect,
        dpr: window.devicePixelRatio,
      });
      return new Blob([png], { type: 'image/png' });
    },
    async storeAsset(bytes, info) {
      if (!workspace.id) throw new Error('No document is open to store the asset in.');
      const imported = await tauriStorage.importAssetBytes(
        workspace.id,
        assetFileName(info),
        bytes,
      );
      const { name: _hint, ...stored } = imported;
      return { ...stored, origin: 'import', ...(info.name ? { name: info.name } : {}) };
    },
    resolveAsset: (asset: AssetMeta) =>
      workspace.assetsDir ? convertFileSrc(`${workspace.assetsDir}/${asset.file}`) : undefined,
    icon: iconMarkup,
  };
}

/** Runs one job with the engine of this page. The capture page's side of the protocol. */
export function runConversionJob(
  envelope: ConversionEnvelope,
): Promise<HtmlSlideConversion | ElementConversion> {
  const { job, assetsDir } = envelope;
  const service = createConversionService(
    workspaceConversionHost({ id: job.workspaceId, assetsDir }),
  );
  return job.kind === 'htmlToSlide'
    ? service.htmlToSlide(job.deck, job.request)
    : service.convertElement(job.deck, job.request);
}

/** A failure of the job as the agent should read it: the engine's own message. */
function jobError(error: unknown): Error {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return new Error(String(error.message));
  }
  return new Error(String(error));
}

/**
 * The Deck API's conversion service in the app: every call is a job for the capture window.
 * `workspaceId` is read on every call, since the service outlives the open document.
 */
export function captureWindowConversion(workspaceId: () => string | null): ConversionService {
  const run = async <T>(job: ConversionJob): Promise<T> => {
    const id = workspaceId();
    try {
      return await invoke<T>('capture_run_job', {
        job: { ...job, workspaceId: id },
        workspaceId: id,
      });
    } catch (error) {
      throw jobError(error);
    }
  };
  return {
    htmlToSlide: (deck, request) => run({ kind: 'htmlToSlide', deck, request }),
    convertElement: (deck, request) => run({ kind: 'convertElement', deck, request }),
  };
}

/** A PNG of one colour: what a host that cannot see the page answers with. */
function blankPicture(width: number, height: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('The canvas gave no picture.'))),
      'image/png',
    );
  });
}

/**
 * The conversion service of a plain browser page, for development and end-to-end tests: the
 * engine runs in the page itself, over the editor, and every picture it takes is blank. Two
 * blank pictures are equal, so the fidelity guard accepts whatever the measuring pass proposed.
 * Slides come out as elements; nothing checks that they look like the HTML.
 */
export function pageConversion(assets: AssetService): ConversionService {
  return createConversionService({
    capture: (rect) => blankPicture(rect.width, rect.height),
    storeAsset: (bytes, info) =>
      assets.import(new File([bytes], assetFileName(info), { type: info.mime }), 'import'),
    resolveAsset: (asset) => assets.url(asset),
    icon: iconMarkup,
  });
}
