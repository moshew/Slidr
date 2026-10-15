import { chartsSettled } from '@slidr/renderer';
import { slideNumberHidden } from '@slidr/templates';
import { Button, cx, IconButton } from '@slidr/ui';
import { Check, Hash, X } from '@slidr/ui/icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { useDeck, useEditor } from '../shell';
import { modalOpen } from '../shell/overlay';
import { applyLibraryTemplate, showNumber } from './actions';
import { library } from './app';
import type { LibraryEntry } from './library';
import { templateName, templateTagline } from './names';
import { PreviewGrid, useLaidOutSize, usePreviewLayers } from './PreviewGrid';

/*
 * The slides that show a template, spread over the editor: for a built-in template its sample
 * deck, for a personal one a slide for each of its layouts, each under the name of its layout.
 * The library of the Templates panel opens it for the template whose picture was pressed
 * (`showTemplateSlides`); the panel is too narrow to show a deck in. All the slides are seen at
 * once, with nothing to scroll: the card lies over the Stage and the filmstrip under it. It
 * opens beside the panel with its slides already in it, and closes back towards the panel;
 * another template takes the open card as it is, its slides fading in over the ones that fade
 * away. It changes no deck: the
 * template is applied by the card's button, with or without the slide number (the button
 * beside it, pressed while it is on), and the slides show the choice.
 */

/** The template whose slides are spread over the Stage, by id; null when none is. */
export const templateSlides = createStore<{ id: string | null }>(() => ({ id: null }));

/** Spreads the slides of a template over the Stage; `null` folds them away. */
export function showTemplateSlides(id: string | null): void {
  if (templateSlides.getState().id !== id) templateSlides.setState({ id });
}

/**
 * The longest the card waits for its slides before it opens without them, in ms; they then come
 * into it. A preview that was made ahead is there at once.
 */
const OPEN_WAIT = 300;

/** Resolves after `count` frames of the page. */
function frames(count: number): Promise<void> {
  return new Promise((resolve) => {
    const next = (left: number) =>
      left === 0 ? resolve() : requestAnimationFrame(() => next(left - 1));
    next(count);
  });
}

/**
 * The card. It is laid out from the start, for its slides to be fitted to it, and opens once they
 * are ready, with them in it; `onClosed` when it is closed before it opened, with nothing to fold.
 */
function Slides({
  entry,
  closing,
  onClosed,
}: {
  entry: LibraryEntry;
  closing: boolean;
  onClosed: () => void;
}) {
  const { t, i18n } = useTranslation('templates');
  const editor = useEditor();
  const like = useDeck((s) => s.deck);
  const current = like.theme.id === entry.template.theme.id;
  const space = useRef<HTMLDivElement>(null);
  const size = useLaidOutSize(space);
  // Whether the card had opened when the slides came: those that come into it after it opened
  // fade in; the first come in with it.
  const wasOpened = useRef(false);
  // The preview follows the deck's direction and language, not every edit of the deck.
  const { shown, leaving, entering } = usePreviewLayers(entry, like, wasOpened);
  // The first slides are put in the card while it is not seen yet, and it opens once their charts
  // are drawn too: a chart's library draws it a moment after its slide. A card whose slides are
  // slow to come opens without them.
  const [ready, setReady] = useState(false);
  // The slides are drawn once the card has a size to fit them to.
  const laidOut = size.width > 0 && size.height > 0;
  useEffect(() => {
    if (!shown || ready || !laidOut) return;
    let gone = false;
    const charts = space.current?.querySelector('[data-slidr-chart]') !== null;
    void chartsSettled()
      .catch(() => undefined)
      // The library puts a chart it has drawn into the page on the next frame.
      .then(() => (charts ? frames(2) : undefined))
      .then(() => {
        if (!gone) setReady(true);
      });
    return () => {
      gone = true;
    };
  }, [shown, ready, laidOut]);
  const [late, setLate] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setLate(true), OPEN_WAIT);
    return () => clearTimeout(timer);
  }, []);
  const opened = ready || late;
  useEffect(() => {
    wasOpened.current = opened;
  });
  useEffect(() => {
    if (closing && !opened) onClosed();
  }, [closing, opened, onClosed]);
  const [busy, setBusy] = useState(false);
  // Whether the slides show their number once the template is applied: as the deck has it, until
  // the user chooses. On the template the deck is already on, the choice is the deck's own, and
  // takes effect at once. A template that draws no number offers no choice.
  const [numbers, setNumbers] = useState(() => !slideNumberHidden(like));
  const drawsNumber = entry.template.layouts.some((layout) =>
    layout.decorations.some((decoration) => decoration.role === 'slideNumber'),
  );
  const shownNumbers = current ? !slideNumberHidden(like) : numbers;
  const chooseNumbers = (on: boolean) => {
    setNumbers(on);
    if (current) showNumber(editor, on, t('undo.number'));
  };
  // Escape folds the slides away, unless a dialog or a menu is open over them.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || modalOpen()) return;
      if (
        event.target instanceof Element &&
        event.target.closest('[role="menu"], [role="listbox"]')
      )
        return;
      showTemplateSlides(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const apply = async () => {
    setBusy(true);
    try {
      await applyLibraryTemplate(editor, library, entry.template.theme.id, t('undo.apply'), {
        slideNumber: numbers,
      });
      // The deck on the Stage is the template now: nothing is left to be shown over it.
      showTemplateSlides(null);
    } finally {
      setBusy(false);
    }
  };

  const name = templateName(entry.template.theme, i18n.language);
  const tagline = templateTagline(entry.template.theme, i18n.language);
  return (
    <section
      aria-label={t('panel.slidesOf', { name })}
      data-testid="template-slides"
      data-state={opened ? (closing ? 'closed' : 'open') : 'pending'}
      className="template-slides absolute inset-3 z-10 flex flex-col overflow-hidden rounded-panel border border-ui-line bg-ui-panel text-ui-fg shadow-floating"
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-ui-line p-3">
        <IconButton
          icon={X}
          label={t('panel.closeSlides')}
          data-testid="template-slides-close"
          onClick={() => showTemplateSlides(null)}
        />
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <h2 dir="auto" className="shrink-0 truncate text-lg font-semibold">
            {name}
          </h2>
          {tagline && <p className="min-w-0 truncate text-sm text-ui-fg-muted">{tagline}</p>}
        </div>
        {drawsNumber && (
          // A switch with its name on it: tinted while on, an outline while off. The soft
          // variant draws no border, so it gets a clear one and keeps its width.
          <Button
            variant={shownNumbers ? 'soft' : 'secondary'}
            icon={Hash}
            aria-pressed={shownNumbers}
            data-testid="template-slides-numbers"
            className={cx(shownNumbers && 'border border-transparent')}
            onClick={() => chooseNumbers(!shownNumbers)}
          >
            {t('panel.slideNumbers')}
          </Button>
        )}
        <Button
          variant={current ? 'ghost' : 'primary'}
          icon={current ? Check : undefined}
          disabled={current}
          loading={busy}
          data-testid="template-slides-apply"
          onClick={() => void apply()}
        >
          {t(current ? 'panel.current' : 'panel.apply')}
        </Button>
      </header>
      <div className="flex min-h-0 flex-1 bg-ui-canvas p-5">
        {/* Pictures of slides: a screen reader was told whose they are. */}
        <div ref={space} aria-hidden className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
          {leaving && (
            <PreviewGrid
              key={leaving.deck.id}
              shown={leaving}
              size={size}
              leaving
              numbers={shownNumbers}
            />
          )}
          {shown && (
            <PreviewGrid
              key={shown.deck.id}
              shown={shown}
              size={size}
              leaving={false}
              entering={entering}
              numbers={shownNumbers}
            />
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * The layer of the Stage the slides are drawn from. A template that was closed stays for as
 * long as it takes to close; one opened in the meantime takes its place at once.
 */
export function TemplateSlidesLayer() {
  const id = useStore(templateSlides, (s) => s.id);
  const personal = useStore(library.state, (s) => s.personal);
  /** The template that is drawn: the open one, or the one that is closing. */
  const [drawn, setDrawn] = useState<string | null>(id);
  if (id !== null && drawn !== id) setDrawn(id);
  // The card is drawn over the whole editor, the filmstrip too: the Stage alone is too low for
  // every slide of a template to be seen at once.
  const [host, setHost] = useState<HTMLElement | null>(null);
  const anchor = useCallback(
    (element: HTMLElement | null) => setHost(element?.closest('main') ?? null),
    [],
  );
  // `personal` is read so that a template renamed, updated or deleted is drawn as it is now.
  const entry = drawn !== null && personal ? library.find(drawn) : undefined;
  // A template that is gone (deleted while its slides were shown) shows nothing.
  const gone = id !== null && id === drawn && !entry;
  useEffect(() => {
    if (gone) showTemplateSlides(null);
  }, [gone]);
  const closed = useCallback(() => setDrawn(null), []);
  if (!entry) return null;
  const closing = id === null;
  return (
    <>
      <span ref={anchor} hidden />
      {host &&
        createPortal(
          <div
            className={cx('contents', closing && 'pointer-events-none')}
            onAnimationEnd={(event) => {
              // The closing of the card itself, not the arrival of slides inside it.
              if (closing && event.target === event.currentTarget.firstElementChild) closed();
            }}
          >
            {/* One card for every template: the next one takes it as it is, open. */}
            <Slides entry={entry} closing={closing} onClosed={closed} />
          </div>,
          host,
        )}
    </>
  );
}
