import { useCallback, useMemo, useSyncExternalStore } from 'react';
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
  const { assets, bus, document } = useEditor();
  // The workspace is read at every change of the bus, not only when the deck itself changes:
  // the first document of a window is created around the deck the bus already holds, and a
  // deck that starts with assets (a default template with a logo) must find its folder then.
  const subscribe = useCallback((onChange: () => void) => bus.subscribe(onChange), [bus]);
  const dir = useSyncExternalStore(subscribe, () => document?.workspace?.dir ?? null);
  return useMemo(() => resolverFor(assets, dir), [assets, dir]);
}
