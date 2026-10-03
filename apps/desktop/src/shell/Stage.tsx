import { convertFileSrc } from '@tauri-apps/api/core';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { AssetMeta, Point } from '@slidr/model';
import type { AssetResolver } from '@slidr/renderer';
import { Filmstrip } from '../stage/Filmstrip';
import { insertAssetsCommands } from '../stage/insert';
import { Stage } from '../stage/Stage';
import { useDeck, useEditor } from './editor';
import { useShell } from './store';

/*
 * The Stage and the Filmstrip (WG2, src/stage) in the shell's layout. The components know only
 * the bus and the stores; this file hands them the editor, the zoom and the open workspace.
 */

/** Asset files of the open workspace, through Tauri's asset protocol. None in a plain browser. */
function useAssetResolver(): AssetResolver | undefined {
  const { document } = useEditor();
  // A new or opened document resets the deck, which re-renders this.
  const dir = document?.workspace?.dir;
  return useMemo(
    () => (dir ? (asset: AssetMeta) => convertFileSrc(`${dir}/assets/${asset.file}`) : undefined),
    [dir],
  );
}

/** The Stage region (UI-03): the slide at the zoom the shell keeps, and direct manipulation. */
export function StageRegion() {
  const { t } = useTranslation();
  const { bus, selection, document } = useEditor();
  const deck = useDeck((s) => s.deck);
  const zoom = useShell((s) => s.zoom);
  const resolveAsset = useAssetResolver();

  const onViewScale = useCallback((viewScale: number) => useShell.setState({ viewScale }), []);
  const onZoomChange = useCallback((value: number) => useShell.setState({ zoom: value }), []);

  /** Dropped or pasted files become assets of the workspace and elements of the slide (STG-09). */
  const onFiles = useCallback(
    async (files: File[], at: Point) => {
      const slideId = selection.getState().currentSlideId;
      if (!document?.workspace || !slideId) return;
      const assets = await Promise.all(
        files.map(async (file) =>
          document.importAssetBytes(file.name, new Uint8Array(await file.arrayBuffer())),
        ),
      );
      const { commands, elementIds } = insertAssetsCommands(
        slideId,
        assets,
        bus.deck.size,
        at,
        (id) => id in bus.deck.assets,
      );
      if (!commands.length) return;
      bus.batch(commands, { label: t('stage.insert') });
      selection.getState().selectElements(elementIds);
    },
    [bus, document, selection, t],
  );

  return (
    <section
      aria-label={t('stage.label')}
      data-testid="stage"
      className="relative min-h-0 flex-1 overflow-hidden bg-ui-canvas"
    >
      <Stage
        bus={bus}
        deck={deck}
        selection={selection}
        zoom={zoom}
        onZoomChange={onZoomChange}
        onViewScale={onViewScale}
        resolveAsset={resolveAsset}
        onFiles={(files, at) => void onFiles(files, at)}
        className="h-full w-full"
      />
    </section>
  );
}

/** The Filmstrip region: 132px under the Stage (SPEC 4.1). */
export function FilmstripRegion() {
  const { t } = useTranslation();
  const { bus, selection } = useEditor();
  const deck = useDeck((s) => s.deck);
  const resolveAsset = useAssetResolver();
  const labels = useMemo(
    () => ({ addSlide: t('stage.newSlide'), slide: (n: number) => t('stage.slide', { n }) }),
    [t],
  );
  return (
    <section
      aria-label={t('stage.filmstrip')}
      data-testid="filmstrip"
      className="h-filmstrip shrink-0 border-t border-ui-line bg-ui-panel"
    >
      <Filmstrip
        bus={bus}
        deck={deck}
        selection={selection}
        resolveAsset={resolveAsset}
        labels={labels}
        className="h-full"
      />
    </section>
  );
}
