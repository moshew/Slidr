import type { Slide } from '@slidr/model';
import { ScaledSlide } from '@slidr/renderer';
import { Button, cx, IconButton } from '@slidr/ui';
import { Check, X } from '@slidr/ui/icons';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { useDeck, useEditor } from '../shell';
import { modalOpen } from '../shell/overlay';
import { applyLibraryTemplate } from './actions';
import { library } from './app';
import type { LibraryEntry } from './library';
import { templateName, templateTagline } from './names';
import { previewOf, type TemplatePreview } from './previews';

/*
 * The slides that show a template, spread over the editor: for a built-in template its sample
 * deck, for a personal one a slide for each of its layouts, each under the name of its layout.
 * The library of the Templates panel opens it for the template whose picture was pressed
 * (`showTemplateSlides`); the panel is too narrow to show a deck in. All the slides are seen at
 * once, with nothing to scroll: the card lies over the Stage and the filmstrip under it. It
 * opens from the side of the panel and closes back into it; another template takes the open
 * card as it is, its slides fading in over the ones that fade away. It changes no deck: the
 * template is applied by the card's button.
 */

/** The template whose slides are spread over the Stage, by id; null when none is. */
export const templateSlides = createStore<{ id: string | null }>(() => ({ id: null }));

/** Spreads the slides of a template over the Stage; `null` folds them away. */
export function showTemplateSlides(id: string | null): void {
  if (templateSlides.getState().id !== id) templateSlides.setState({ id });
}

/** Space between the slides, in px: `gap-4`. */
const SLIDE_GAP = 16;
/** The height a slide's name takes under it, with the space between them, in px. */
const CAPTION = 24;

interface Size {
  width: number;
  height: number;
}

/**
 * The size an element is laid out at, kept current. Not the size it is drawn at: the card is
 * drawn in part while it opens, and its slides are sized for the card as it will be.
 */
function useLaidOutSize(ref: RefObject<HTMLElement | null>): Size {
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () =>
      setSize((was) =>
        was.width === element.clientWidth && was.height === element.clientHeight
          ? was
          : { width: element.clientWidth, height: element.clientHeight },
      );
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

/**
 * The columns and the width of a slide at which `count` slides of 16:9, each over its name,
 * fill a space without leaving it: of every number of columns, the one that draws them largest.
 */
function fit(count: number, { width, height }: Size): { columns: number; thumb: number } {
  let best = { columns: 1, thumb: 0 };
  for (let columns = 1; columns <= count; columns += 1) {
    const rows = Math.ceil(count / columns);
    const wide = (width - SLIDE_GAP * (columns - 1)) / columns;
    const tall = (((height - SLIDE_GAP * (rows - 1)) / rows - CAPTION) * 16) / 9;
    const thumb = Math.floor(Math.min(wide, tall));
    if (thumb > best.thumb) best = { columns, thumb };
  }
  return best;
}

/** How long the slides of one template give way to those of the next, in ms: as in app.css. */
const SWAP = 260;
/** The longest the pictures of a template are waited for before its slides are shown, in ms. */
const PICTURES_WAIT = 700;

/** The slides of one template, as they are drawn. */
interface Shown extends TemplatePreview {
  personal: boolean;
}

/**
 * Waits for the pictures the slides of a preview show, so that they are in the slides when
 * these come in and do not arrive one by one after them. Not for long: a picture that is slow
 * or missing does not hold the slides back.
 */
async function picturesOf({ deck, resolveAsset }: TemplatePreview): Promise<void> {
  const drawn = JSON.stringify([deck.slides, deck.layouts]);
  const loads = Object.values(deck.assets)
    .filter((asset) => asset.mime.startsWith('image/') && drawn.includes(asset.id))
    .map((asset) => {
      const url = resolveAsset(asset);
      if (!url) return undefined;
      const image = new Image();
      image.src = url;
      return image.decode().catch(() => undefined);
    });
  await Promise.race([
    Promise.all(loads),
    new Promise((resolve) => setTimeout(resolve, PICTURES_WAIT)),
  ]);
}

/** The slides of a template, laid out to fill a space; `leaving` while they fade away. */
function Grid({ shown, size, leaving }: { shown: Shown; size: Size; leaving: boolean }) {
  const { t } = useTranslation('templates');
  const { deck } = shown;
  const { columns, thumb } = fit(deck.slides.length, size);
  /** A slide is named by its layout: a built-in one by its archetype, in the UI's language. */
  const nameOf = (slide: Slide): string => {
    const layout = deck.layouts.find((candidate) => candidate.id === slide.layoutId);
    if (!layout) return slide.name ?? '';
    return shown.personal ? layout.name : t(`archetype.${layout.archetype}`);
  };
  if (thumb <= 0) return null;
  return (
    <div
      data-leaving={leaving || undefined}
      className="template-slides-grid absolute inset-0 grid place-content-center gap-4"
      style={{ gridTemplateColumns: `repeat(${columns}, ${thumb}px)` }}
    >
      {deck.slides.map((slide, index) => (
        <figure
          key={slide.id}
          data-testid={leaving ? undefined : 'template-slide'}
          className="flex min-w-0 flex-col gap-1.5"
        >
          <div className="overflow-hidden rounded-inset shadow-slide">
            <ScaledSlide
              deck={deck}
              slide={slide}
              mode="thumbnail"
              width={thumb}
              resolveAsset={shown.resolveAsset}
            />
          </div>
          <figcaption className="flex h-4 min-w-0 items-baseline gap-1.5 px-0.5 text-xs leading-4 text-ui-fg-muted">
            <span className="tabular-nums">{index + 1}</span>
            <span dir="auto" className="min-w-0 truncate">
              {nameOf(slide)}
            </span>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

function Slides({ entry, closing }: { entry: LibraryEntry; closing: boolean }) {
  const { t, i18n } = useTranslation('templates');
  const editor = useEditor();
  const like = useDeck((s) => s.deck);
  const current = like.theme.id === entry.template.theme.id;
  const { lang, dir } = like.meta;
  const space = useRef<HTMLDivElement>(null);
  const size = useLaidOutSize(space);
  // The slides that are shown, and the ones before them while they fade away under these. The
  // slides of the template before stay until those of the next one are ready.
  const [{ shown, leaving }, setLayers] = useState<{ shown: Shown | null; leaving: Shown | null }>({
    shown: null,
    leaving: null,
  });
  const [busy, setBusy] = useState(false);
  // The latest deck, for the preview to take its language and direction from when it is made.
  const latest = useRef(like);
  useEffect(() => {
    latest.current = like;
  });
  // The preview follows the deck's direction and language, not every edit of the deck.
  useEffect(() => {
    let gone = false;
    void previewOf(entry, latest.current).then(async (made) => {
      await picturesOf(made);
      if (gone) return;
      setLayers((was) => ({ shown: { ...made, personal: entry.personal }, leaving: was.shown }));
    });
    return () => {
      gone = true;
    };
  }, [entry, lang, dir]);
  // The slides that fade away are gone when they have.
  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => setLayers((was) => ({ ...was, leaving: null })), SWAP);
    return () => clearTimeout(timer);
  }, [leaving]);
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
      await applyLibraryTemplate(editor, library, entry.template.theme.id, t('undo.apply'));
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
      data-state={closing ? 'closed' : 'open'}
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
          {leaving && <Grid key={leaving.deck.id} shown={leaving} size={size} leaving />}
          {shown && <Grid key={shown.deck.id} shown={shown} size={size} leaving={false} />}
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
              if (closing && event.target === event.currentTarget.firstElementChild) setDrawn(null);
            }}
          >
            {/* One card for every template: the next one takes it as it is, open. */}
            <Slides entry={entry} closing={closing} />
          </div>,
          host,
        )}
    </>
  );
}
