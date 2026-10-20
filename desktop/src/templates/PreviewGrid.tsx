import { CommandBus, createDeck, type Deck, type Slide } from '@slidr/model';
import { ScaledSlide } from '@slidr/renderer';
import { showSlideNumber } from '@slidr/templates';
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../i18n';
import type { LibraryEntry } from './library';
import { madePreview, readyPreview, type TemplatePreview } from './previews';

/*
 * The slides that show a template, laid out to fill a space with nothing to scroll, each under
 * the name of its layout; and the change from one template's slides to the next, which fade in
 * over the ones that fade away. Drawn over the editor by the Templates panel
 * (`./TemplateSlides`), and on the welcome screen beside the templates to pick from
 * (`./TemplateShowroom`).
 */

/** Space between the slides, in px: `gap-4`. */
const SLIDE_GAP = 16;
/** The height a slide's name takes under it, with the space between them, in px. */
const CAPTION = 24;
/** How long the slides of one template give way to those of the next, in ms: as in app.css. */
const SWAP = 260;

export interface Size {
  width: number;
  height: number;
}

/**
 * The size an element is laid out at, kept current. Not the size it is drawn at: the card is
 * drawn in part while it opens, and its slides are sized for the card as it will be.
 */
export function useLaidOutSize(ref: RefObject<HTMLElement | null>): Size {
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
export function fit(count: number, { width, height }: Size): { columns: number; thumb: number } {
  let best = { columns: 1, thumb: 0 };
  for (let columns = 1; columns <= Math.max(count, 2); columns += 1) {
    const rows = Math.max(1, Math.ceil(count / columns));
    const wide = (width - SLIDE_GAP * (columns - 1)) / columns;
    const tall = (((height - SLIDE_GAP * (rows - 1)) / rows - CAPTION) * 16) / 9;
    const thumb = Math.floor(Math.min(wide, tall));
    if (thumb > best.thumb) best = { columns, thumb };
  }
  return best;
}

/** The slides of one template, as they are drawn. */
export interface Shown extends TemplatePreview {
  personal: boolean;
}

/** The slides of a template that are drawn: see `usePreviewLayers`. */
export interface PreviewLayers {
  shown: Shown | null;
  leaving: Shown | null;
  entering: boolean;
}

/**
 * The deck the library's templates are shown for in the editor: an empty one in the UI language
 * and its direction, whatever the open deck is in (`useLanguage`), as on the welcome screen.
 * The same deck until the language changes, so the previews are not made again.
 */
export function useLike(): Deck {
  const lang = useLanguage();
  return useMemo(() => createDeck({ lang }), [lang]);
}

/**
 * The slides of a template that are shown, and the ones before them while they fade away under
 * these. The slides of the template before stay until those of the next one are ready. They
 * follow the language and the direction of `like`, not every edit of it. `entering`: the shown
 * slides came after the card they are in was `opened` (by default, always), and fade in. A
 * preview that was made ahead is there from the first drawing.
 */
export function usePreviewLayers(
  entry: LibraryEntry,
  like: Deck,
  opened?: RefObject<boolean>,
): PreviewLayers {
  const [layers, setLayers] = useState<PreviewLayers>(() => {
    const made = madePreview(entry, like);
    return {
      shown: made ? { ...made, personal: entry.personal } : null,
      leaving: null,
      entering: false,
    };
  });
  // The latest deck, for the preview to take its language and direction from when it is made.
  const latest = useRef(like);
  useEffect(() => {
    latest.current = like;
  });
  const { lang, dir } = like.meta;
  useEffect(() => {
    let gone = false;
    void readyPreview(entry, latest.current).then((made) => {
      if (gone) return;
      setLayers((was) =>
        // The slides that are shown already (back to them before the next ones came) stay.
        was.shown?.deck === made.deck
          ? was
          : {
              shown: { ...made, personal: entry.personal },
              leaving: was.shown,
              entering: opened?.current ?? true,
            },
      );
    });
    return () => {
      gone = true;
    };
  }, [entry, lang, dir, opened]);
  // The slides that fade away are gone when they have.
  const { leaving } = layers;
  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => setLayers((was) => ({ ...was, leaving: null })), SWAP);
    return () => clearTimeout(timer);
  }, [leaving]);
  return layers;
}

/** A deck with the slide number its layouts draw shown or hidden (SLD-04). */
function numbered(deck: Deck, shown: boolean): Deck {
  const commands = showSlideNumber(deck, shown);
  if (commands.length === 0) return deck;
  const bus = new CommandBus(deck);
  bus.batch(commands);
  return bus.deck;
}

/**
 * The slides of a template, laid out to fill a space; `leaving` while they fade away, `entering`
 * while they fade in over slides that were there. `numbers`: whether they show the slide number,
 * as the template has it when not given. The card around them is drawn again as it opens; its
 * slides are not.
 */
export const PreviewGrid = memo(function PreviewGrid({
  shown,
  size,
  leaving,
  entering = false,
  numbers,
}: {
  shown: Shown;
  size: Size;
  leaving: boolean;
  entering?: boolean;
  numbers?: boolean;
}) {
  const { t } = useTranslation('templates');
  const deck = useMemo(
    () => (numbers === undefined ? shown.deck : numbered(shown.deck, numbers)),
    [shown.deck, numbers],
  );
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
      data-entering={entering || undefined}
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
            {/* Its pictures are drawn with it, not a moment after. */}
            <ScaledSlide
              deck={deck}
              slide={slide}
              mode="thumbnail"
              width={thumb}
              resolveAsset={shown.resolveAsset}
              decoding="sync"
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
});
