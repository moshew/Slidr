import { useCallback, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';
import { findElement, findSlide, type Point } from '@slidr/model';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@slidr/ui';
import { svgMarkups } from '../objects/svgImport';
import { insertAssetsCommands } from '../stage/insert';
import { stagePreview } from '../stage/preview';
import { SelectionToolbar } from '../stage/SelectionToolbar';
import { Stage } from '../stage/Stage';
import { useAssetResolver } from './assets';
import { useDeck, useEditor, useSelection } from './editor';
import { useStageLayers, useStageMenu } from './registry';
import { selectionKind } from './selection';
import { useShell } from './store';

/*
 * The Stage (WG2, src/stage) in the shell's layout. The component knows only the bus and the
 * stores; this file hands it the editor, the zoom and the open workspace, and draws around it
 * what belongs to the app and not to the slide: the right-click menu, the toolbar beside the
 * selection, and the layers other areas put over the Stage.
 */

/** The kinds of element whose text is edited in place: a right click there is the text's own. */
const TEXT_EDITED = new Set(['text', 'shape', 'html']);

/** In the text editor of a table cell, where the right click is the text's too. */
function inCellText(target: EventTarget): boolean {
  return target instanceof Element && Boolean(target.closest('[data-cell-editing]'));
}

/**
 * A right click on a layer over the Stage is the layer's own, not the Stage menu's: it stops
 * here. So it never reaches the window, where `main.tsx` keeps the webview's own menu (Back,
 * Reload, Inspect) away, and the same rule is applied here: only a text field keeps its menu,
 * and in development Shift+right-click still opens it, for Inspect.
 */
function layerContextMenu(event: MouseEvent): void {
  event.stopPropagation();
  const target = event.target instanceof HTMLElement ? event.target : null;
  if (target?.closest('input, textarea, [contenteditable="true"]')) return;
  if (import.meta.env.DEV && event.shiftKey) return;
  event.preventDefault();
}

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
  const layers = useStageLayers();
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

  // The right click's menu (STG-06). The Stage has already made what was clicked the selection,
  // so the menu is the one of the selection's kind; its parts come from the areas.
  const kind = selectionKind(deck, slideId, elementIds, editingId);
  const menu = useStageMenu(kind);
  const slide = slideId ? findSlide(deck, slideId) : undefined;
  const editing = slide && editingId ? findElement(slide, editingId) : undefined;
  // While text is edited in place the right click is the text's own.
  const editingText = editing !== undefined && TEXT_EDITED.has(editing.type);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild disabled={editingText || !slideId}>
        <section
          aria-label={t('stage.label')}
          data-testid="stage"
          className="relative min-h-0 flex-1 overflow-hidden bg-ui-canvas"
        >
          <div
            className="contents"
            onContextMenu={(event) => {
              if (inCellText(event.target)) event.stopPropagation();
            }}
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
              selectionToolbar={<SelectionToolbar />}
              className="h-full w-full"
            />
          </div>
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
          {/* What other areas draw over the Stage; a right click there is theirs, not the menu's. */}
          <div className="contents" onContextMenu={layerContextMenu}>
            {layers.map(({ id, render: Layer }) => (
              <Layer key={id} />
            ))}
          </div>
        </section>
      </ContextMenuTrigger>
      <ContextMenuContent data-testid="stage-menu">
        {menu.map((group, index) => (
          // A part may draw nothing for the element at hand: its group, and the line above it,
          // then take no room. The first group is the clipboard, which always has something.
          <ContextMenuGroup key={group[0]?.group} className="hidden has-[[role^=menuitem]]:block">
            {index > 0 && <ContextMenuSeparator />}
            {group.map(({ id, render: Part }) => (
              <Part key={id} kind={kind} />
            ))}
          </ContextMenuGroup>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}
