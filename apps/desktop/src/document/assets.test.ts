import type { AssetMeta } from '@slidr/model';
import { describe, expect, it, vi } from 'vitest';
import { workspaceAssets } from './assets';
import type { DocumentService } from './documentService';

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => `asset://${path}`,
}));

const asset = (file: string): AssetMeta => ({
  id: 'a'.repeat(64),
  file,
  mime: 'image/png',
  kind: 'image',
  bytes: 1,
  origin: 'upload',
});

describe('workspaceAssets', () => {
  const open = { workspace: { id: 'w1', dir: 'C:/app/workspaces/w1' } } as DocumentService;

  it('loads an asset from the assets folder of the open workspace', () => {
    const name = `${'a'.repeat(64)}.png`;
    expect(workspaceAssets(open).url(asset(name))).toBe(
      `asset://C:/app/workspaces/w1/assets/${name}`,
    );
    expect(workspaceAssets({ workspace: null } as DocumentService).url(asset(name))).toBe(
      undefined,
    );
  });

  it('never joins a path or an address to the folder: such an asset has no file', () => {
    // What a deck made elsewhere may hold; the save leaves the same assets out of the file.
    for (const file of ['../../w2/assets/other.png', 'https://example.com/logo.png', 'a/b.png']) {
      expect(workspaceAssets(open).url(asset(file)), file).toBeUndefined();
    }
  });
});
