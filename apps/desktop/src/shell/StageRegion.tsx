import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';
import type { Point } from '@slidr/model';
import { Sparkles } from '@slidr/ui/icons';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@slidr/ui';
import { svgMarkups } from '../objects/svgImport';
import { insertAssetsCommands } from '../stage/insert';
import { stagePreview } from '../stage/preview';
import { Stage } from '../stage/Stage';
import { useAssetResolver } from './assets';
import { useDeck, useEditor, useSelection } from './editor';
import { PanelId } from './registry';
import { aiKinds, selectionKind } from './selection';
import { openPanel, useShell } from './store';

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
  const preview = useStore(stagePreview, (s) => s.deck);
  const slideId = useSelection((s) => s.currentSlideId);
  const elementIds = useSelection((s) => s.selectedElementIds);
  const editingId = useSelection((s) => s.editingElementId);
  const previewing = Boolean(preview?.slides.some((s) => s.id === slideId));

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
        // An SVG file goes in as cleaned markup, so its colours can be replaced (SHP-06, SEC-06).
        await svgMarkups(files, imported),
      );
      if (!commands.length) return;
      bus.batch(commands, { label: t('stage.insert') });
      selection.getState().selectElements(elementIds);
    },
    [bus, assets, selection, t],
  );

  // The right click's menu (STG-06 is P1; today it is the way to the AI tools, SPEC 4.2). The
  // Stage has already made what was clicked the selection.
  const onObject = aiKinds.has(selectionKind(deck, slideId, elementIds, editingId));

  return (
    <ContextMenu>
      {/* While text is edited in place the right click is the text's own. */}
      <ContextMenuTrigger asChild disabled={editingId !== null || !slideId}>
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
            preview={preview}
            className="h-full w-full"
          />
          {previewing && (
            <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
              <span
                role="status"
                data-testid="stage-preview"
                className="rounded-full bg-ui-accent px-3 py-1 text-xs font-medium text-ui-on-accent shadow-raised"
              >
                {t('stage.preview')}
              </span>
            </div>
          )}
        </section>
      </ContextMenuTrigger>
      <ContextMenuContent data-testid="stage-menu">
        {onObject ? (
          <ContextMenuItem
            icon={Sparkles}
            shortcut="Ctrl+3"
            onSelect={() => openPanel(PanelId.aiObject, 'chat')}
          >
            {t('tools.aiObject')}
          </ContextMenuItem>
        ) : (
          <ContextMenuItem
            icon={Sparkles}
            shortcut="Ctrl+2"
            onSelect={() => openPanel(PanelId.aiSlide, 'chat')}
          >
            {t('tools.aiSlide')}
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
