import type { Deck, Slide } from '@slidr/model';
import { ScaledSlide } from '@slidr/renderer';
import { cx } from '@slidr/ui';
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { LibraryEntry } from './library';
import { previewOf, type TemplatePreview } from './previews';

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
/** The longest the pictures of a template are waited for before its slides are shown, in ms. */
const PICTURES_WAIT = 700;

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
 * With a `hero`, the first slide takes two columns and two rows.
 */
export function fit(
  count: number,
  { width, height }: Size,
  hero = false,
): { columns: number; thumb: number } {
  const cells = hero ? count + 3 : count;
  let best = { columns: 1, thumb: 0 };
  for (let columns = hero ? 2 : 1; columns <= Math.max(cells, 2); columns += 1) {
    const rows = Math.max(hero ? 2 : 1, Math.ceil(cells / columns));
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

/**
 * Waits for the pictures the slides of a preview show, so that they are in the slides when
 * these come in and do not arrive one by one after them. Not for long: a picture that is slow
 * or missing does not hold the slides back.
 */
async function picturesOf({ deck, resolveAsset }: TemplatePreview): Promise<void> {
  const drawn = JSON.stringify([deck.slides, deck.layouts]);
  const loads = Object.values(deck.assets)
    .filter((asset) => asset.mime.startsWith('image/') && drawn.includes(asset.id))
    .flatMap((asset) => {
      const url = resolveAsset(asset);
      if (!url) return [];
      const image = new Image();
      image.src = url;
      return [image.decode().catch(() => undefined)];
    });
  await Promise.race([
    Promise.all(loads),
    new Promise((resolve) => setTimeout(resolve, PICTURES_WAIT)),
  ]);
}

/**
 * The slides of a template that are shown, and the ones before them while they fade away under
 * these. The slides of the template before stay until those of the next one are ready. They
 * follow the language and the direction of `like`, not every edit of it.
 */
export function usePreviewLayers(
  entry: LibraryEntry,
  like: Deck,
): { shown: Shown | null; leaving: Shown | null } {
  const [layers, setLayers] = useState<{ shown: Shown | null; leaving: Shown | null }>({
    shown: null,
    leaving: null,
  });
  // The latest deck, for the preview to take its language and direction from when it is made.
  const latest = useRef(like);
  useEffect(() => {
    latest.current = like;
  });
  const { lang, dir } = like.meta;
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
  const { leaving } = layers;
  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => setLayers((was) => ({ ...was, leaving: null })), SWAP);
    return () => clearTimeout(timer);
  }, [leaving]);
  return layers;
}

/**
 * The slides of a template, laid out to fill a space; `leaving` while they fade away. With a
 * `hero`, the first slide, the one a deck opens on, is drawn at twice the size of the others.
 */
export function PreviewGrid({
  shown,
  size,
  leaving,
  hero = false,
}: {
  shown: Shown;
  size: Size;
  leaving: boolean;
  hero?: boolean;
}) {
  const { t } = useTranslation('templates');
  const { deck } = shown;
  const big = hero && deck.slides.length > 2;
  const { columns, thumb } = fit(deck.slides.length, size, big);
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
      className="template-slides-grid absolute inset-0 grid grid-flow-dense place-content-center gap-4"
      style={{ gridTemplateColumns: `repeat(${columns}, ${thumb}px)` }}
    >
      {deck.slides.map((slide, index) => {
        const first = big && index === 0;
        return (
          <figure
            key={slide.id}
            data-testid={leaving ? undefined : 'template-slide'}
            className={cx('flex min-w-0 flex-col gap-1.5', first && 'col-span-2 row-span-2')}
          >
            <div className="overflow-hidden rounded-inset shadow-slide">
              <ScaledSlide
                deck={deck}
                slide={slide}
                mode="thumbnail"
                width={first ? thumb * 2 + SLIDE_GAP : thumb}
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
        );
      })}
    </div>
  );
}
