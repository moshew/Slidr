import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { transitionGlyph } from '../animations/transitionGlyphs';
import { canPaste, copySlides, cutSlides, pasteFromMemory } from '../arrange/clipboard';
import { Filmstrip, type FilmstripClipboard, type FilmstripLabels } from '../stage/Filmstrip';
import { useAssetResolver } from './assets';
import { useDeck, useEditor } from './editor';
import { useAction, useSlideMarks } from './registry';

/**
 * The Filmstrip region: 124px under the Stage. The Filmstrip itself is a standalone
 * component; this hands it the editor, the strings in the UI language, the window's clipboard,
 * the marks other areas put on a slide, and of a transition its picture and the way to its editor.
 */
export function FilmstripRegion() {
  const { t } = useTranslation();
  // The strings of managing slides live with the arrange area (WG5-T08).
  const { t: ta } = useTranslation('arrange');
  // What a screen reader hears of the strip, and the marks of a slide's states (FLM-04).
  const { t: ty } = useTranslation('a11y');
  // The names of the kinds of transition live with the animations area.
  const { t: tn } = useTranslation('animations');
  const editor = useEditor();
  const { bus, selection } = editor;
  const deck = useDeck((s) => s.deck);
  const resolveAsset = useAssetResolver();
  const labels = useMemo<FilmstripLabels>(
    () => ({
      strip: t('stage.filmstrip'),
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
      transition: ty('strip.transition'),
      transitionInto: (n: number, type: string) =>
        // A kind this app has no name for is shown as the deck has it.
        ty('strip.transitionInto', { n, name: tn(`transition.${type}`, { defaultValue: type }) }),
      addTransition: (n: number) => ty('strip.addTransition', { n }),
      animations: (count: number) => ty('strip.animations', { count }),
    }),
    [t, ta, ty, tn],
  );
  // The editor of a transition is the animations area's; until it registers, a mark is no button.
  const editTransition = useAction('transition');
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
      data-pane="filmstrip"
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
        onTransition={editTransition}
        transitionGlyph={transitionGlyph}
        className="h-full"
      />
    </section>
  );
}
