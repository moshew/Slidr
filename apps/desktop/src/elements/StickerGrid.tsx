import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { cx, Skeleton, Tooltip } from '@slidr/ui';
import { tell, useEditor } from '../shell';
import { insertSticker } from './insert';
import type { RecentSticker } from './recent';
import { stickerMarkup, type Sticker } from './stickers';

/* The grids of graphics and emoji: a drawing is a button that puts it on the slide. */

/** How large the drawings of a grid are: graphics are looked at, emoji are picked from many. */
export type StickerSize = 'graphic' | 'emoji';

/**
 * How many drawings a grid puts in a row: as many as the panel has room for (`.element-grid`).
 * Zero until the grid is measured.
 */
function useColumns(ref: RefObject<Element | null>): number {
  const [columns, setColumns] = useState(0);
  useEffect(() => {
    const grid = ref.current;
    if (!grid) return;
    const measure = () =>
      setColumns(getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length);
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    return () => observer.disconnect();
  }, [ref]);
  return columns;
}

/** How far ahead of the visible part of the panel a grid is filled in. */
const AHEAD = '600px 0px';

/** True once the element has come near the visible part of the panel; it then stays true. */
function useNear<T extends Element>(): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    if (near || !ref.current) return;
    const observer = new IntersectionObserver(
      (entries) => entries.some((entry) => entry.isIntersecting) && setNear(true),
      { rootMargin: AHEAD },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [near]);
  return [ref, near];
}

/** Calls `onReach` whenever the end of a list comes near the visible part of the panel. */
export function ListEnd({ onReach, at }: { onReach: () => void; at: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(
      (entries) => entries.some((entry) => entry.isIntersecting) && onReach(),
      { rootMargin: AHEAD },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
    // Watching again after the list grew notices an end that is still in view.
  }, [onReach, at]);
  return <div ref={ref} aria-hidden className="h-px" />;
}

/** The drawings of some stickers, by id; undefined while their art set loads. */
function useDrawn(stickers: readonly Sticker[], wanted: boolean) {
  const [drawn, setDrawn] = useState<ReadonlyMap<string, string> | 'failed'>();
  useEffect(() => {
    if (!wanted) return;
    let current = true;
    Promise.all(
      stickers.map(async (sticker) => [sticker.id, await stickerMarkup(sticker)] as const),
    )
      .then((results) => {
        if (!current) return;
        setDrawn(new Map(results.flatMap(([id, markup]) => (markup ? [[id, markup]] : []))));
      })
      .catch(() => current && setDrawn('failed'));
    return () => {
      current = false;
    };
  }, [stickers, wanted]);
  return drawn;
}

/**
 * A grid of graphics or emoji. It is filled in when it comes near the visible part of the
 * panel: until then, and while the art loads, every drawing has a placeholder of its own size,
 * so nothing moves when the drawings arrive. With `rows` it is a preview: the first drawings,
 * as many as fill that many whole rows at the width the panel has.
 */
export function StickerGrid({
  stickers: all,
  size,
  rows,
  label,
  testId,
}: {
  stickers: readonly Sticker[];
  size: StickerSize;
  rows?: number;
  /** Names the grid for screen readers. */
  label: string;
  testId?: string;
}) {
  const { t } = useTranslation('elements');
  const [ref, near] = useNear<HTMLDivElement>();
  const columns = useColumns(ref);
  const stickers = useMemo(
    () => (rows === undefined ? all : all.slice(0, rows * columns)),
    [all, rows, columns],
  );
  const drawn = useDrawn(stickers, near);
  if (drawn === 'failed') {
    return <p className="py-8 text-center text-sm text-ui-fg-muted">{t('loadFailed')}</p>;
  }
  return (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      aria-busy={!drawn}
      className="element-grid"
      data-size={size}
      data-testid={testId}
    >
      {stickers.map((sticker) => {
        const markup = drawn?.get(sticker.id);
        if (markup) {
          return <StickerButton key={sticker.id} sticker={{ ...sticker, markup }} size={size} />;
        }
        // A drawing its set dropped leaves no gap once the others are in.
        if (drawn) return null;
        return near ? (
          <Skeleton key={sticker.id} className="m-1 aspect-square" />
        ) : (
          <span key={sticker.id} className="aspect-square" />
        );
      })}
    </div>
  );
}

/** One drawing: a click puts it in the middle of the current slide. */
export function StickerButton({ sticker, size }: { sticker: RecentSticker; size: StickerSize }) {
  const { t, i18n } = useTranslation('elements');
  const editor = useEditor();
  const name = i18n.language.startsWith('he') ? sticker.label.he : sticker.label.en;
  return (
    <Tooltip content={name}>
      <button
        type="button"
        aria-label={t('insert', { name })}
        data-sticker={sticker.id}
        onClick={() => {
          const { id, label, markup } = sticker;
          if (!insertSticker(editor, { id, label, markup })) void tell(t('media:noSlide'));
        }}
        className={cx(
          'flex aspect-square w-full cursor-default items-center justify-center rounded-control transition-colors',
          'focus-visible:-outline-offset-2',
          '[&>svg]:size-full [&>svg]:transition-transform hover:[&>svg]:scale-110',
          size === 'graphic' ? 'p-2.5' : 'p-1.5',
          // Drawings in black line are lost on the dark panel: there they sit on paper.
          sticker.id.startsWith('graphic:outlined:')
            ? 'bg-ui-paper hover:bg-ui-paper-hover'
            : 'hover:bg-ui-hover active:bg-ui-pressed',
        )}
        // The art set's own markup, from the app's packages (`stickers.ts`).
        dangerouslySetInnerHTML={{ __html: sticker.markup }}
      />
    </Tooltip>
  );
}
