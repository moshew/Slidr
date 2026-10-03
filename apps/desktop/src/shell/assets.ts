import { useMemo } from 'react';
import type { AssetMeta } from '@slidr/model';
import type { AssetResolver } from '@slidr/renderer';
import type { AssetService } from '../document/assets';
import { useEditor } from './editor';

/**
 * A resolver for one document. Another workspace folder gets another resolver, so the renderer
 * asks again for every asset.
 */
function resolverFor(assets: AssetService, _workspaceDir: string | null): AssetResolver {
  return (asset: AssetMeta) => assets.url(asset);
}

/** Where the renderer loads the open document's assets from (`editor.assets`). */
export function useAssetResolver(): AssetResolver {
  const { assets, document } = useEditor();
  // A new or opened document resets the deck, which re-renders this.
  const dir = document?.workspace?.dir ?? null;
  return useMemo(() => resolverFor(assets, dir), [assets, dir]);
}
