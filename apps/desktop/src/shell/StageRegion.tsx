import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { Point } from '@slidr/model';
import { insertAssetsCommands } from '../stage/insert';
import { Stage } from '../stage/Stage';
import { useAssetResolver } from './assets';
import { useDeck, useEditor } from './editor';
import { useShell } from './store';

/*
 * The Stage (WG2, src/stage) in the shell's layout. The component knows only the bus and the
 * stores; this file hands it the editor, the zoom and the open workspace.
 */

/** The Stage region (UI-03): the slide at the zoom the shell keeps, and direct manipulation. */
export function StageRegion() {
  const { t } = useTranslation();
  const { bus, selection, assets } = useEditor();
  const deck = useDeck((s) => s.deck);
  const zoom = useShell((s) => s.zoom);
  const resolveAsset = useAssetResolver();

  const onViewScale = useCallback((viewScale: number) => useShell.setState({ viewScale }), []);
  const onZoomChange = useCallback((value: number) => useShell.setState({ zoom: value }), []);

  /** Dropped or pasted files become assets of the document and elements of the slide (STG-09). */
  const onFiles = useCallback(
    async (files: File[], at: Point) => {
      const slideId = selection.getState().currentSlideId;
      if (!slideId) return;
      const imported = await Promise.all(files.map((file) => assets.import(file)));
      const { commands, elementIds } = insertAssetsCommands(
        slideId,
        imported,
        bus.deck.size,
        at,
        (id) => id in bus.deck.assets,
      );
      if (!commands.length) return;
      bus.batch(commands, { label: t('stage.insert') });
      selection.getState().selectElements(elementIds);
    },
    [bus, assets, selection, t],
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
