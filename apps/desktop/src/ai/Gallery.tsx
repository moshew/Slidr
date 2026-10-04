import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';
import type { SessionScope } from '@slidr/agent-tools';
import { findElement, findSlide, type Deck } from '@slidr/model';
import { ScaledSlide } from '@slidr/renderer';
import { Check, ChevronLeft, ChevronRight, CircleAlert, X } from '@slidr/ui/icons';
import { cx, Icon, IconButton, ScrollArea, Skeleton } from '@slidr/ui';
import { useAssetResolver, useDeck, useEditor, useElementSize } from '../shell';
import { historyOf, type GalleryCard, type OptionSet } from './variations';
import { MarkdownView } from './MarkdownView';
import { he } from './messages';
import { aiOf } from './runtime';

/*
 * The results area of an AI tool (SPEC 4.3; WG11-T08): the options the agent offered as cards.
 * Hovering a card shows it on the slide without changing the deck, and a click applies it as
 * one undo step. Images appear in their cards one by one, as they are made. The sets offered
 * before for the same target are a step back (AIO-09).
 */

/** Space between the cards of a row, and inside a card around its picture: Tailwind's 2. */
const GAP = 8;
/** A card's padding and border, on both sides. */
const CARD_EDGE = 2 * (GAP + 1);

/**
 * The sets a panel goes through: the newest one its tool was offered for what the panel is on,
 * after the ones offered for the same target before it (AIO-09). Empty while there is none.
 */
function useOptionSets(scope: SessionScope): OptionSet[] {
  const { gallery } = aiOf(useEditor());
  const state = useStore(gallery.store);
  const deck = useDeck((s) => s.deck);
  if (scope.kind !== 'slide' && scope.kind !== 'object') return [];
  const newest = state.sets.findLast(({ from, target }) => {
    if (from !== scope.kind || target.slideId !== scope.slideId) return false;
    if (scope.kind === 'object' && !scope.elementIds.includes(target.elementId ?? '')) return false;
    // What the options were for may have been deleted since.
    const slide = findSlide(deck, target.slideId);
    return Boolean(slide && (!target.elementId || findElement(slide, target.elementId)));
  });
  return newest ? historyOf(state, newest) : [];
}

function isFailure(
  kind: string | undefined,
): kind is Exclude<keyof typeof he.gallery.failure, 'other'> {
  return kind !== undefined && kind !== 'other' && Object.hasOwn(he.gallery.failure, kind);
}

/** What a card shows of its option: the text, the image, or the slide as it would look. */
function CardBody({ card, deck, width }: { card: GalleryCard; deck: Deck; width: number }) {
  const { t } = useTranslation('ai');
  const resolveAsset = useAssetResolver();
  // A design's own images are not in the deck until the design is picked.
  const drawn = useMemo(
    () =>
      card.assets?.length
        ? {
            ...deck,
            assets: { ...deck.assets, ...Object.fromEntries(card.assets.map((a) => [a.id, a])) },
          }
        : deck,
    [deck, card.assets],
  );
  if (card.state === 'failed') {
    return (
      <div className="flex items-start gap-1.5 text-sm text-ui-fg-muted">
        <Icon icon={CircleAlert} className="mt-0.5 text-ui-danger-fg" />
        <span>
          {t(`gallery.failure.${isFailure(card.problemKind) ? card.problemKind : 'other'}`)}
        </span>
      </div>
    );
  }
  if (card.text !== undefined) return <MarkdownView text={card.text} />;
  if (card.state === 'pending') return <Skeleton className="aspect-video w-full" />;
  if (card.asset) {
    return (
      <img
        src={resolveAsset(card.asset)}
        alt=""
        draggable={false}
        className="aspect-video w-full rounded-small object-cover"
      />
    );
  }
  if (card.slide && width > 0) {
    return (
      <div className="overflow-hidden rounded-small">
        <ScaledSlide
          deck={drawn}
          slide={card.slide}
          width={width}
          mode="thumbnail"
          resolveAsset={resolveAsset}
        />
      </div>
    );
  }
  return <Skeleton className="aspect-video w-full" />;
}

function OptionCard({
  set,
  card,
  index,
  picked,
  width,
}: {
  set: OptionSet;
  card: GalleryCard;
  index: number;
  picked: boolean;
  width: number;
}) {
  const { t } = useTranslation('ai');
  const { gallery } = aiOf(useEditor());
  const deck = useDeck((s) => s.deck);
  const label = card.label || t('gallery.option', { n: index + 1 });
  const show = () => gallery.preview(set.id, index);
  const hide = () => gallery.preview(set.id, null);
  return (
    <button
      type="button"
      disabled={card.state !== 'ready'}
      aria-pressed={picked}
      data-testid="option-card"
      data-state={card.state}
      data-picked={picked || undefined}
      onPointerEnter={show}
      onPointerLeave={hide}
      onFocus={show}
      onBlur={hide}
      onClick={() => gallery.pick(set.id, index, t('gallery.pickLabel'))}
      className={cx(
        'flex min-w-0 cursor-default flex-col gap-1.5 rounded-control border p-2 text-start transition-colors',
        picked
          ? 'border-ui-accent bg-ui-accent-soft'
          : 'border-ui-line enabled:hover:border-ui-accent enabled:hover:bg-ui-hover enabled:active:bg-ui-pressed',
      )}
    >
      <CardBody card={card} deck={deck} width={width} />
      <span className="flex items-center gap-1 text-xs text-ui-fg-muted">
        <span className="min-w-0 flex-1 truncate">
          {card.state === 'pending' ? t('gallery.pending') : label}
        </span>
        {picked && (
          <>
            <Icon icon={Check} className="text-ui-accent-fg" />
            <span className="sr-only">{t('gallery.picked')}</span>
          </>
        )}
      </span>
    </button>
  );
}

/** Where the panel is in the sets of its target, and the way to another one. */
interface Place {
  index: number;
  count: number;
  go: (index: number) => void;
}

/** The results area of the panel on `scope`; nothing while its tool has offered no options. */
export function Gallery({ scope }: { scope: SessionScope }) {
  const history = useOptionSets(scope);
  const newest = history.at(-1);
  // The set the user went back to, while no newer one has come: a new set shows itself.
  const [back, setBack] = useState<{ id: string; newest: string }>();
  if (!newest) return null;
  const shown = (back?.newest === newest.id && history.find((set) => set.id === back.id)) || newest;
  const place: Place = {
    index: history.indexOf(shown),
    count: history.length,
    go: (index) => {
      const set = history[index];
      if (set) setBack({ id: set.id, newest: newest.id });
    },
  };
  // One component for every set, so the keyboard stays on the button that moved between them.
  return <Options set={shown} place={place} />;
}

/** The buttons to the sets offered before and after the one shown, and where it is. */
function HistoryNav({ place }: { place: Place }) {
  const { t } = useTranslation('ai');
  const { index, count, go } = place;
  return (
    <div role="group" aria-label={t('gallery.history')} className="flex items-center">
      <IconButton
        icon={ChevronLeft}
        size="sm"
        className="rtl:-scale-x-100"
        label={t('gallery.earlier')}
        data-testid="gallery-earlier"
        disabled={index === 0}
        onClick={() => go(index - 1)}
      />
      <span
        data-testid="gallery-place"
        className="min-w-8 text-center text-xs text-ui-fg-muted tabular-nums"
      >
        <span aria-hidden>
          {index + 1} / {count}
        </span>
        <span className="sr-only">{t('gallery.place', { n: index + 1, total: count })}</span>
      </span>
      <IconButton
        icon={ChevronRight}
        size="sm"
        className="rtl:-scale-x-100"
        label={t('gallery.later')}
        data-testid="gallery-later"
        disabled={index === count - 1}
        onClick={() => go(index + 1)}
      />
    </div>
  );
}

function Options({ set, place }: { set: OptionSet; place: Place }) {
  const { t } = useTranslation('ai');
  const editor = useEditor();
  const { gallery } = aiOf(editor);
  const grid = useRef<HTMLDivElement>(null);
  const { width } = useElementSize(grid);
  // The pick shows as picked while its undo step stands: an undo takes the mark with it.
  useDeck((s) => s.revision);
  const picked = set.picked && editor.bus.transactionInfo(set.picked.txId) ? set.picked.index : -1;
  // A preview does not outlive the cards it was shown from.
  useEffect(() => () => gallery.preview(set.id, null), [gallery, set.id]);

  const columns = set.kind === 'text' ? 1 : 2;
  const cardWidth = Math.floor((width - GAP * (columns - 1)) / columns) - CARD_EDGE;
  const done = set.cards.filter((card) => card.state !== 'pending').length;
  const waiting = done < set.cards.length;
  return (
    <section
      aria-label={t(`gallery.${set.kind}`)}
      data-testid="gallery"
      data-kind={set.kind}
      data-set-id={set.id}
      className="flex shrink-0 flex-col gap-2 border-t border-ui-line pt-2"
    >
      <div className="flex items-start gap-2 ps-4 pe-2">
        <div className="flex min-w-0 flex-1 flex-col">
          <p dir="auto" className="truncate text-start text-sm font-medium text-ui-fg">
            {set.prompt ?? t(`gallery.${set.kind}`)}
          </p>
          <p role="status" className="truncate text-xs text-ui-fg-muted">
            {waiting
              ? t(set.kind === 'layout' ? 'gallery.converting' : 'gallery.generating', {
                  done,
                  total: set.cards.length,
                })
              : t('gallery.hint')}
          </p>
        </div>
        {place.count > 1 && <HistoryNav place={place} />}
        <IconButton
          icon={X}
          size="sm"
          label={t('gallery.close')}
          data-testid="gallery-close"
          onClick={() => gallery.dismiss(set.id)}
        />
      </div>
      <ScrollArea viewportClassName={columns === 1 ? 'max-h-72' : 'max-h-96'}>
        <div
          ref={grid}
          className={cx('mx-4 grid gap-2 pb-1', columns === 1 ? 'grid-cols-1' : 'grid-cols-2')}
        >
          {set.cards.map((card, index) => (
            <OptionCard
              key={index}
              set={set}
              card={card}
              index={index}
              picked={picked === index}
              width={cardWidth}
            />
          ))}
        </div>
      </ScrollArea>
    </section>
  );
}
