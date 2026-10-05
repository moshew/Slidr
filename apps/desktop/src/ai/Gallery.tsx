import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';
import { findElement, findSlide, type Deck } from '@slidr/model';
import { ScaledSlide } from '@slidr/renderer';
import { Check, ChevronLeft, ChevronRight, CircleAlert, X } from '@slidr/ui/icons';
import { cx, Icon, IconButton, ScrollArea, Skeleton } from '@slidr/ui';
import { useAssetResolver, useDeck, useEditor, useElementSize, useSelection } from '../shell';
import { historyOf, tryOn, type GalleryCard, type OptionSet } from './variations';
import { MarkdownView } from './MarkdownView';
import { he } from './messages';
import { aiOf } from './runtime';

/*
 * The results area of the AI chat (SPEC 4.3; WG11-T08): the options the agent offered as cards.
 * Hovering a card shows it on the slide without changing the deck, and a click applies it as
 * one undo step. Images appear in their cards one by one, as they are made. The sets offered
 * before for the same target are a step back (AIO-09). The area shows the options for what is on
 * the slide the Stage shows, where a card can be tried (ADR-072).
 */

/** Space between the cards of a row, and inside a card around its picture: Tailwind's 2. */
const GAP = 8;
/** A card's padding and border, on both sides. */
const CARD_EDGE = 2 * (GAP + 1);

/**
 * The sets the area goes through: the newest one offered for something on the slide the Stage
 * shows, after the ones offered for the same target before it (AIO-09). Empty while there is none.
 */
function useOptionSets(): OptionSet[] {
  const { gallery } = aiOf(useEditor());
  const state = useStore(gallery.store);
  const deck = useDeck((s) => s.deck);
  const slideId = useSelection((s) => s.currentSlideId);
  const newest = state.sets.findLast(({ target }) => {
    if (target.slideId !== slideId) return false;
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

/**
 * An element as an option would leave it (a chart, a table, a shape, an icon): its own part of
 * the slide, at the width of the card. An element inside a group, or a turned one, is shown on
 * its whole slide instead.
 */
function ElementPicture({
  set,
  card,
  deck,
  width,
}: {
  set: OptionSet;
  card: GalleryCard;
  deck: Deck;
  width: number;
}) {
  const resolveAsset = useAssetResolver();
  const tried = useMemo(() => tryOn(set, card, deck), [set, card, deck]);
  const slide = tried ? findSlide(tried, set.target.slideId) : undefined;
  if (!tried || !slide || width <= 0) return <Skeleton className="aspect-video w-full" />;
  const element = slide.elements.find((e) => e.id === set.target.elementId);
  // The picture is of a piece of the slide, with every word the slide holds: a card is named by
  // its label, so the picture is kept out of the name.
  if (!element || element.rotation !== 0) {
    return (
      <div aria-hidden className="overflow-hidden rounded-small">
        <ScaledSlide
          deck={tried}
          slide={slide}
          width={width}
          mode="thumbnail"
          resolveAsset={resolveAsset}
        />
      </div>
    );
  }
  const { x, y, w, h } = element.frame;
  // As wide as the card, and no taller than a slide of that width: a square icon is shown in
  // the middle of its card, not as a card twice the height of a chart's.
  const scale = Math.min(width / w, (width * tried.size.h) / tried.size.w / h);
  const left = (width - w * scale) / 2 - x * scale;
  return (
    <div
      aria-hidden
      className="relative overflow-hidden rounded-small"
      style={{ height: h * scale }}
    >
      {/* Physical left and top, as the slide itself is laid out: see `ScaledSlide`. */}
      <div className="absolute" style={{ left, top: -y * scale }}>
        <ScaledSlide
          deck={tried}
          slide={slide}
          width={tried.size.w * scale}
          mode="thumbnail"
          resolveAsset={resolveAsset}
        />
      </div>
    </div>
  );
}

/** What a card shows of its option: the text, the image, or the slide as it would look. */
function CardBody({
  set,
  card,
  deck,
  width,
}: {
  set: OptionSet;
  card: GalleryCard;
  deck: Deck;
  width: number;
}) {
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
  // A chart's title is plain text: what it holds is what the chart will say.
  if (card.title !== undefined) {
    return (
      <p dir="auto" className="text-start text-md leading-6 wrap-anywhere text-ui-fg">
        {card.title}
      </p>
    );
  }
  if (card.set) return <ElementPicture set={set} card={card} deck={deck} width={width} />;
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
      <CardBody set={set} card={card} deck={deck} width={width} />
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

/** The results area of the chat; nothing while no options were offered for this slide. */
export function Gallery() {
  const history = useOptionSets();
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

  // Options told apart by their words are read down a column; pictures sit side by side.
  const worded = (card: GalleryCard) => card.text !== undefined || card.title !== undefined;
  const columns = set.kind === 'text' || set.cards.every(worded) ? 1 : 2;
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
