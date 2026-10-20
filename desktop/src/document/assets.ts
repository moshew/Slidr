import { isAssetFileName, type AssetMeta } from '@slidr/model';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { DocumentService } from './documentService';

/**
 * The files of the open document, as the editor uses them: taking one in, and where the renderer
 * loads it from. In the app they live in the workspace (SPEC 5.7); in a plain browser (the Vite
 * page, Playwright) they live in memory, so pictures work there too.
 */
export interface AssetService {
  /**
   * Stores a file with the document and returns its entry for the asset table. The caller
   * dispatches `asset.add` in the same transaction as the element that uses it.
   */
  import(file: File, origin?: AssetMeta['origin']): Promise<AssetMeta>;
  /** Where the renderer loads an asset from; undefined when the file is not at hand. */
  url(asset: AssetMeta): string | undefined;
}

/** Assets in the workspace of the open document, served through Tauri's asset protocol. */
export function workspaceAssets(document: DocumentService): AssetService {
  return {
    import: async (file, origin = 'upload') =>
      document.importAssetBytes(file.name, new Uint8Array(await file.arrayBuffer()), origin),
    url: (asset) => {
      const dir = document.workspace?.dir;
      // A deck made elsewhere may name a path or an address as an asset's file. It is never
      // joined to the folder: the picture is missing on the slide, as it is from the saved file.
      if (!dir || !isAssetFileName(asset.file)) return undefined;
      return convertFileSrc(`${dir}/assets/${asset.file}`);
    },
  };
}

function kindOf(file: File): AssetMeta['kind'] {
  if (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)) return 'svg';
  if (/\.(?:woff2?|ttf|otf)$/i.test(file.name) || file.type.startsWith('font/')) return 'font';
  const family = file.type.split('/')[0];
  return family === 'image' || family === 'video' || family === 'audio' ? family : 'other';
}

async function pictureSize(url: string): Promise<{ width?: number; height?: number }> {
  const img = new Image();
  img.src = url;
  await img.decode().catch(() => undefined);
  return img.naturalWidth ? { width: img.naturalWidth, height: img.naturalHeight } : {};
}

/** Assets kept in memory as object URLs. Gone with the page: for development and tests. */
export function memoryAssets(): AssetService {
  const urls = new Map<string, string>();
  return {
    import: async (file, origin = 'upload') => {
      const bytes = await file.arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      const id = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join(
        '',
      );
      const url = urls.get(id) ?? URL.createObjectURL(file);
      urls.set(id, url);
      const kind = kindOf(file);
      const size = kind === 'image' || kind === 'svg' ? await pictureSize(url) : {};
      const extension = /\.([^.]+)$/.exec(file.name)?.[1]?.toLowerCase() ?? 'bin';
      return {
        id,
        file: `${id}.${extension}`,
        mime: file.type || 'application/octet-stream',
        kind,
        bytes: file.size,
        origin,
        name: file.name,
        ...size,
      };
    },
    url: (asset) => urls.get(asset.id),
  };
}
