import { useCallback, useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';
import { findElement, findSlide, type Point, type TextElement } from '@slidr/model';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@slidr/ui';
import { languages } from '../i18n';
import { insertFiles } from '../objects/takeIn';
import { layerSnippet } from '../arrange/layers';
import { KeyboardStatus } from '../stage/KeyboardStatus';
import { stagePreview } from '../stage/preview';
import { SelectionToolbar } from '../stage/SelectionToolbar';
import { Stage } from '../stage/Stage';
import { useAgentMarks } from '../stage/useAgentMarks';
import { useAssetResolver } from './assets';
import { useDeck, useEditor, useSelection } from './editor';
import { useStageLayers, useStageMenu } from './registry';
import { selectionKind } from './selection';
import { useShell } from './store';
import { ContextTools } from './TopTools';

/*
 * The Stage (WG2, src/stage) in the shell's layout. The component knows only the bus and the
 * stores; this file hands it the editor, the zoom and the open workspace, and draws around it
 * what belongs to the app and not to the slide: the right-click menu, the toolbar beside the
 * selection, and the layers other areas put over the Stage.
 */

/** The kinds of element whose text is edited in place: a right click there is the text's own. */
const TEXT_EDITED = new Set(['text', 'shape', 'html']);

/**
 * In the app's own text editor: the text of a text box or of a shape, or of a table cell (the
 * whole cell is the editor's while it is typed in). A right click there opens the menu of the
 * text, whose parts the text area registers (`ofEditedText`).
 */
function inTextEditor(target: EventTarget): boolean {
  return (
    target instanceof Element && Boolean(target.closest('[data-text-editor], [data-cell-editing]'))
  );
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
  const { t, i18n } = useTranslation();
  const editor = useEditor();
  const { bus, selection } = editor;
  const deck = useDeck((s) => s.deck);
  const zoom = useShell((s) => s.zoom);
  const marked = useAgentMarks(editor);
  const resolveAsset = useAssetResolver();
  const preview = useStore(stagePreview, (s) => s.deck);
  const slideId = useSelection((s) => s.currentSlideId);
  const elementIds = useSelection((s) => s.selectedElementIds);
  const editingId = useSelection((s) => s.editingElementId);
  const layers = useStageLayers();
  const previewing = Boolean(preview?.slides.some((s) => s.id === slideId));

  const onViewScale = useCallback((viewScale: number) => useShell.setState({ viewScale }), []);
  const onZoomChange = useCallback((value: number) => useShell.setState({ zoom: value }), []);

  /**
   * Dropped or pasted files become assets of the document and elements of the slide (STG-09),
   * each by itself: a file that cannot be taken is left out and named to the user.
   */
  const onFiles = useCallback(
    (files: File[], at: Point) => void insertFiles(editor, files, at, t('stage.insert')),
    [editor, t],
  );

  // An empty placeholder says what it is for, in the language of the deck and not of the app:
  // the words stand where the deck's own text will be.
  const deckLang = deck.meta.lang;
  const placeholderHint = useCallback(
    (element: TextElement) => {
      const key = `stage:hint.${element.role}`;
      if (!element.role || !i18n.exists(key)) return undefined;
      const lang = (languages as readonly string[]).includes(deckLang) ? deckLang : i18n.language;
      return i18n.getFixedT(lang)(key);
    },
    [deckLang, i18n],
  );

  // The right click's menu (STG-06). The Stage has already made what was clicked the selection,
  // so the menu is the one of the selection's kind; its parts come from the areas.
  const kind = selectionKind(deck, slideId, elementIds, editingId);
  /** The last right click was in text that is being edited: the menu is the text's. */
  const [menuInText, setMenuInText] = useState(false);
  const menu = useStageMenu(kind, menuInText);
  const slide = slideId ? findSlide(deck, slideId) : undefined;
  const editing = slide && editingId ? findElement(slide, editingId) : undefined;
  // While text is edited in place the right click is the text's own.
  const editingText = editing !== undefined && TEXT_EDITED.has(editing.type);
  const slideNumber = slide ? deck.slides.indexOf(slide) + 1 : 0;
  const one = slide && elementIds.length === 1 ? findElement(slide, elementIds[0]!) : undefined;
  const selected =
    elementIds.length > 1
      ? t('stage.selected', { what: t('selection.multiple', { n: elementIds.length }) })
      : one
        ? t('stage.selected', {
            what: [t(`selection.${kind}`), one.name ?? layerSnippet(one)]
              .filter(Boolean)
              .join(' · '),
          })
        : '';

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild disabled={!slideId}>
        <section
          aria-label={t('stage.label')}
          data-testid="stage"
          data-pane="stage"
          className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-ui-canvas"
        >
          <ContextTools />
          <div
            className="relative min-h-0 flex-1"
            onContextMenu={(event) => {
              const inText = inTextEditor(event.target);
              setMenuInText(inText);
              // While text is edited in place, a right click outside the app's own editor is
              // not the Stage menu's: beside the text, and in the text of an `html` element,
              // which keeps the menu of a text field.
              if (editingText && !inText) layerContextMenu(event);
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
              marked={marked}
              placeholderHint={placeholderHint}
              label={t('stage.surface', { n: slideNumber, total: deck.slides.length })}
              className="h-full w-full"
            />
            {/* What is selected, said by a screen reader as the selection changes (UI-06). */}
            <p role="status" data-testid="stage-selection" className="sr-only">
              {selected}
            </p>
            {/* And where the keyboard is beyond it: a point of a line, a crop handle, the walk. */}
            <KeyboardStatus />
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
