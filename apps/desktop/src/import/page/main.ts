/**
 * The page of the import window (SPEC 13.3, WG9-T14): never shown. The imported file runs in a
 * frame of this page, next to the conversion engine, and the editor sends it jobs through Rust.
 *
 * The file's scripts can reach everything this page can, so this page can do very little: the
 * window may call six commands and load nothing but itself (`src-tauri/src/import_window`).
 * Assets go through `import_store_asset`, to the workspace Rust holds for the session, and are
 * shown from memory: the window does not use the asset protocol.
 */
import { createImportPage, type ConversionHost } from '@slidr/html-import';
import type { AssetMeta } from '@slidr/model';
import { invoke } from '@tauri-apps/api/core';
import type { ImportedAsset } from '../../document/storage';
import { registerBuiltinFonts } from '../../fonts';
import { builtinFaces } from '../../fonts/builtinFonts.generated';
import { runImportJob, type ImportJob } from '../protocol';

declare global {
  interface Window {
    __slidrImportJob?: (id: number) => void;
  }
}

// The fonts of the app's library: the converted slide is drawn with them here as in the editor.
registerBuiltinFonts();

/** A file name that tells the asset store the type, for content that does not say it itself. */
function assetFileName(info: { mime: string; name?: string }): string {
  const subtype = info.mime.split('/')[1]?.split(/[+;]/)[0] ?? '';
  const extension = /^[a-z0-9]{1,8}$/.test(subtype) ? subtype : 'bin';
  return `${info.name ?? 'imported'}.${extension}`;
}

/** Where the page shows each asset it stored from. */
const urls = new Map<string, string>();

const host: ConversionHost = {
  async capture(rect) {
    const png = await invoke<ArrayBuffer>('capture_clip', { rect, dpr: window.devicePixelRatio });
    return new Blob([png], { type: 'image/png' });
  },
  async storeAsset(bytes, info) {
    const imported = await invoke<ImportedAsset>('import_store_asset', bytes, {
      headers: { 'x-file-name': encodeURIComponent(assetFileName(info)) },
    });
    if (!urls.has(imported.id)) {
      urls.set(imported.id, URL.createObjectURL(new Blob([bytes], { type: imported.mime })));
    }
    const { name: _hint, ...stored } = imported;
    return { ...stored, origin: 'import', ...(info.name ? { name: info.name } : {}) };
  },
  resolveAsset: (asset: AssetMeta) => urls.get(asset.id),
};

const page = createImportPage({
  source: () => invoke<ArrayBuffer>('import_source'),
  host,
  // The frame's document has no address of its own to resolve these against.
  appFonts: builtinFaces.map((face) => ({ ...face, url: new URL(face.url, location.href).href })),
});

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

// One job at a time: there is one file, and one surface the pictures are taken of.
let last: Promise<unknown> = Promise.resolve();

window.__slidrImportJob = (id) => {
  const run = last.then(async () => {
    const job = await invoke<ImportJob>('import_job_take', { id });
    return runImportJob(page, job);
  });
  last = run.catch(() => undefined);
  void run.then(
    (result) => invoke('import_job_done', { id, result, error: null }),
    (error: unknown) => invoke('import_job_done', { id, result: null, error: message(error) }),
  );
};

void invoke('import_page_loaded');

// For development: lets a debugger attached to this window drive the engine on the loaded file.
if (import.meta.env.DEV) Object.assign(window, { __slidrImport: { page, host } });
