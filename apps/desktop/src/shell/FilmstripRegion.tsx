import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { canPaste, copySlides, cutSlides, pasteFromMemory } from '../arrange/clipboard';
import { Filmstrip, type FilmstripClipboard, type FilmstripLabels } from '../stage/Filmstrip';
import { useAssetResolver } from './assets';
import { useDeck, useEditor } from './editor';
import { useSlideMarks } from './registry';
import { openAiChat } from './store';

/**
 * The Filmstrip region: 132px under the Stage (SPEC 4.1). The Filmstrip itself is a standalone
 * component; this hands it the editor, the strings in the UI language, the window's clipboard and
 * the marks other areas put on a slide.
 */
export function FilmstripRegion() {
  const { t } = useTranslation();
  // The strings of managing slides live with the arrange area (WG5-T08).
  const { t: ta } = useTranslation('arrange');
  const editor = useEditor();
  const { bus, selection } = editor;
  const deck = useDeck((s) => s.deck);
  const resolveAsset = useAssetResolver();
  const labels = useMemo<FilmstripLabels>(
    () => ({
      addSlide: t('stage.newSlide'),
      slide: (n: number) => t('stage.slide', { n }),
      hidden: ta('slides.hidden'),
      blank: ta('slides.blank'),
      duplicate: ta('slides.duplicate'),
      delete: ta('slides.delete'),
      hide: ta('slides.hide'),
      show: ta('slides.show'),
      copy: ta('slides.copy'),
      cut: ta('slides.cut'),
      paste: ta('slides.paste'),
      move: ta('slides.move'),
      ai: t('tools.aiSlide'),
    }),
    [t, ta],
  );
  // What the areas mark a slide with (FLM-04): the design check's findings.
  const marks = useSlideMarks();
  const mark = useCallback(
    (slideId: string) => marks.map(({ id, render: Mark }) => <Mark key={id} slideId={slideId} />),
    [marks],
  );
  const clipboard = useMemo<FilmstripClipboard>(
    () => ({
      copy: (slideIds) => copySlides(editor, slideIds),
      cut: (slideIds) => cutSlides(editor, slideIds),
      paste: () => pasteFromMemory(editor),
      canPaste,
    }),
    [editor],
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
        clipboard={clipboard}
        labels={labels}
        mark={marks.length ? mark : undefined}
        onAi={openAiChat}
        className="h-full"
      />
    </section>
  );
}
