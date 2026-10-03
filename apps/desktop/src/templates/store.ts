/**
 * Where personal templates are kept (THM-05, THM-08). In the app it is a folder under the app
 * data directory, held by Rust (`src-tauri/src/templates.rs`); in a plain browser (the Vite
 * page, Playwright) it is memory, so the flows work there too and end with the page.
 *
 * Like the deck's storage, this layer does not know what a template is: it keeps the JSON as
 * text and the asset files as bytes.
 */
import { invoke } from '@tauri-apps/api/core';

export interface TemplateFile {
  /** The file name inside the template: `<sha256>.<ext>`, as in a deck's `assets/`. */
  name: string;
  bytes: Uint8Array;
}

export interface TemplateStore {
  list(): Promise<{ id: string; json: string }[]>;
  /** Writes a template and its asset files; a template with the same id is replaced. */
  save(id: string, json: string, files: readonly TemplateFile[]): Promise<void>;
  remove(id: string): Promise<void>;
  readAsset(id: string, file: string): Promise<Uint8Array>;
}

export function memoryTemplateStore(): TemplateStore {
  const templates = new Map<string, { json: string; files: Map<string, Uint8Array> }>();
  return {
    list: () =>
      Promise.resolve(
        [...templates]
          .map(([id, { json }]) => ({ id, json }))
          .sort((a, b) => a.id.localeCompare(b.id)),
      ),
    save: (id, json, files) => {
      const kept = templates.get(id)?.files ?? new Map<string, Uint8Array>();
      for (const file of files) kept.set(file.name, file.bytes);
      templates.set(id, { json, files: kept });
      return Promise.resolve();
    },
    remove: (id) => {
      templates.delete(id);
      return Promise.resolve();
    },
    readAsset: (id, file) => {
      const bytes = templates.get(id)?.files.get(file);
      return bytes
        ? Promise.resolve(bytes)
        : Promise.reject(new Error(`Template "${id}" has no file "${file}".`));
    },
  };
}

/** The store over Tauri IPC. */
export const tauriTemplateStore: TemplateStore = {
  list: () => invoke('template_store_list'),
  save: async (id, json, files) => {
    // The files first: a template is never listed without the files it names.
    for (const file of files) {
      await invoke('template_store_write_asset', file.bytes, {
        headers: { 'x-template-id': id, 'x-file-name': encodeURIComponent(file.name) },
      });
    }
    await invoke('template_store_save', { id, json });
  },
  remove: async (id) => {
    await invoke('template_store_remove', { id });
  },
  readAsset: async (id, file) =>
    new Uint8Array(await invoke<ArrayBuffer>('template_store_read_asset', { id, file })),
};
