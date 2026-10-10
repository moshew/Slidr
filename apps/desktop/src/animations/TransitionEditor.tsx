import type { Deck, Slide, Transition } from '@slidr/model';
import { ScaledSlide } from '@slidr/renderer';
import {
  defaultTransitionDirection,
  runTransition,
  transitionTurns,
  transitionTypes,
} from '@slidr/runtime';
import {
  Button,
  cx,
  EmptyState,
  Icon,
  IconButton,
  type LucideIcon,
  SegmentedControl,
  Slider,
} from '@slidr/ui';
import { Blend, CopyCheck, Info, Move, Play, SkipForward, Timer } from '@slidr/ui/icons';
import {
  Fragment,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useGestureTx } from '../controls';
import { useAssetResolver, useDeck, useEditor } from '../shell';
import {
  applyTransitionToAll,
  opensTheShow,
  shownTransition,
  slideBefore,
  storedTransition,
  TRANSITION_DEFAULTS,
  withType,
} from './model';
import { DirectionField, SecondsField, useCurrentSlide, useSeconds } from './parts';
import { toneBackdrop, type EffectTone } from './effectArt';
import { EffectTile } from './EffectTile';

/*
 * The transition into the slide on the Stage (WG8-T05, SPEC 4.4): its kind, the way it travels,
 * how long it takes, when the slide moves on, and "apply to all". It is drawn in its own panel
 * and in the row B popover, and writes through `slide.update`.
 * A kind is chosen from a gallery of tiles. What belongs to the chosen kind (the transition
 * played small, and its settings) is one card that opens under the row of its tile, where the
 * eye already is; "none" has nothing to set, and no card.
 * Each family of kinds has a colour: of its tiles, of the dot by its name, and of the stage the
 * card plays the chosen kind on.
 */

const GROUPS = [
  {
    key: 'simple',
    tone: 'violet',
    types: ['none', 'fade', 'crossfade', 'dissolve', 'blur', 'flash'],
  },
  {
    key: 'movement',
    tone: 'blue',
    types: ['push', 'cover', 'reveal', 'wipe', 'slide', 'swap'],
  },
  { key: 'depth', tone: 'pink', types: ['zoom', 'flip', 'cube', 'rotate', 'split', 'iris'] },
] as const;

/** The colour of a kind: of its family, or of the first family for a kind that has no tile. */
function toneOf(type: string): EffectTone {
  return (
    GROUPS.find((group) => (group.types as readonly string[]).includes(type))?.tone ?? 'violet'
  );
}

/** The tiles of a group lie three to a row (`grid-cols-3`): one class per column of a row. */
const COLUMN_START = ['col-start-1', 'col-start-2', 'col-start-3'] as const;

/** Where the tile of a kind lies in its group: the last tile of its row, and its column. */
function placeOf(
  types: readonly string[],
  type: string,
): { rowEnd: number; column: number } | null {
  const at = types.indexOf(type);
  if (at < 0) return null;
  const columns = COLUMN_START.length;
  return {
    rowEnd: Math.min(at - (at % columns) + columns - 1, types.length - 1),
    column: at % columns,
  };
}

/** The longest transition the slider offers, in milliseconds; the field beside it takes more. */
const SLIDER_MAX = 3000;
/** How long a slide waits before it moves on by itself, when that is first switched on. */
const AUTO_AFTER_MS = 3000;
/** The width the two slides of the preview are drawn at. */
const PREVIEW_W = 256;
/** The air left around the card when the panel scrolls to show it, in pixels. */
const REVEAL_MARGIN = 16;

/**
 * Scrolls what the card scrolls in, and nothing else, until the card is in view; a card taller
 * than the view shows from its top. Not `scrollIntoView`, which also moves every clipped
 * ancestor it can, the shell's own regions among them.
 */
function reveal(card: HTMLElement, smooth: boolean): void {
  let scroller = card.parentElement;
  while (scroller && !/auto|scroll/.test(getComputedStyle(scroller).overflowY)) {
    scroller = scroller.parentElement;
  }
  if (!scroller) return;
  const view = scroller.getBoundingClientRect();
  const { top, bottom } = card.getBoundingClientRect();
  const down = bottom + REVEAL_MARGIN - view.bottom;
  const up = top - REVEAL_MARGIN - view.top;
  const by = down > 0 ? Math.min(down, up) : Math.min(up, 0);
  if (by !== 0) scroller.scrollBy({ top: by, behavior: smooth ? 'smooth' : 'auto' });
}

/**
 * The transition, played small: the slide before this one gives way to it, by the runtime's own
 * `runTransition`. It plays when `play` changes.
 */
function TransitionPreview({
  deck,
  slide,
  transition,
  play,
  playedRef,
}: {
  deck: Deck;
  slide: Slide;
  transition: Transition;
  /** A count of the times to play: every change of it plays the transition once. */
  play: number;
  /**
   * The count that was played last, kept by the editor: the card moves with the chosen kind,
   * and a preview drawn again in another row does not play what was played already.
   */
  playedRef: RefObject<number>;
}) {
  const resolveAsset = useAssetResolver();
  const from = useRef<HTMLDivElement>(null);
  const to = useRef<HTMLDivElement>(null);
  const before = slideBefore(deck, slide.id);
  const height = (PREVIEW_W * deck.size.h) / deck.size.w;
  // The transition as it is when the play is asked for: a later edit plays by itself.
  const latest = useRef(transition);
  useEffect(() => {
    latest.current = transition;
  });

  useEffect(() => {
    const leaving = from.current;
    const entering = to.current;
    if (!leaving || !entering || play === playedRef.current) return;
    const last = playedRef.current;
    playedRef.current = play;
    leaving.style.visibility = 'visible';
    const run = runTransition(leaving, entering, latest.current, deck.meta.dir);
    let over = false;
    let cut = false;
    void run.finished.then(() => {
      over = true;
      if (!cut) leaving.style.visibility = 'hidden';
    });
    return () => {
      cut = true;
      // Cut short, as React does to every first run in development: it is still to be played.
      if (!over) playedRef.current = last;
      run.finish();
      leaving.style.visibility = 'hidden';
    };
  }, [play, playedRef, deck.meta.dir]);

  const layer = 'absolute inset-0 overflow-hidden';
  return (
    <div
      // A moving picture of two slides: nothing in it is for a screen reader to read.
      aria-hidden
      data-testid="transition-preview"
      className="relative shrink-0 overflow-hidden rounded-inset bg-ui-canvas shadow-slide"
      style={{ width: PREVIEW_W, height }}
    >
      <div ref={from} className={cx(layer, 'invisible bg-ui-canvas')}>
        {before && (
          <ScaledSlide
            deck={deck}
            slide={before}
            width={PREVIEW_W}
            mode="thumbnail"
            resolveAsset={resolveAsset}
          />
        )}
      </div>
      <div ref={to} className={layer}>
        <ScaledSlide
          deck={deck}
          slide={slide}
          width={PREVIEW_W}
          mode="thumbnail"
          resolveAsset={resolveAsset}
        />
      </div>
    </div>
  );
}

/** The colours of the chips the settings' icons lie on, so the list is not one grey column. */
const CHIP = {
  direction: 'bg-ui-tool-blue text-ui-tool-blue-fg',
  duration: 'bg-ui-tool-orange text-ui-tool-orange-fg',
  advance: 'bg-ui-tool-green text-ui-tool-green-fg',
};

/** The slide a transition comes from, lying behind the preview and peeking out over it. */
function SlideBehind({ deck, slide }: { deck: Deck; slide: Slide }) {
  const resolveAsset = useAssetResolver();
  return (
    <div
      aria-hidden
      className="absolute inset-0 -translate-y-2 -rotate-4 overflow-hidden rounded-inset opacity-80 shadow-raised"
    >
      <ScaledSlide
        deck={deck}
        slide={slide}
        width={PREVIEW_W}
        mode="thumbnail"
        resolveAsset={resolveAsset}
      />
    </div>
  );
}

/**
 * One setting of the card: its name at the start of the line and its control at the end, which
 * goes under the name where the two do not fit side by side. `below` takes a line of its own.
 */
function SettingRow({
  icon,
  chip,
  mirror,
  label,
  children,
  below,
}: {
  icon: LucideIcon;
  /** The colours of the chip the icon lies on. */
  chip: string;
  /** Flips the icon in a right-to-left UI: an icon that points the way of reading. */
  mirror?: boolean;
  label: string;
  children: ReactNode;
  below?: ReactNode;
}) {
  const id = useId();
  return (
    <div
      role="group"
      aria-labelledby={id}
      className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2"
    >
      <span id={id} className="flex flex-1 items-center gap-2 text-sm whitespace-nowrap">
        <span
          className={cx('flex size-6 shrink-0 items-center justify-center rounded-small', chip)}
        >
          <Icon icon={icon} mirror={mirror} />
        </span>
        {label}
      </span>
      <div className="ms-auto flex items-center gap-2">{children}</div>
      {below && <div className="flex basis-full items-center justify-end gap-2">{below}</div>}
    </div>
  );
}

export function TransitionsPanel() {
  const { t } = useTranslation('animations');
  const slide = useCurrentSlide();
  if (!slide)
    return <EmptyState icon={Blend} title={t('transition.noSlide')} className="min-h-80" />;
  return (
    <div data-testid="transitions-panel" className="flex flex-col gap-4 px-4 pb-5">
      <div>
        <h3 className="text-sm font-semibold text-ui-fg">{t('transition.heading')}</h3>
        <p className="text-xs text-ui-fg-muted">{t('transition.galleryHint')}</p>
      </div>
      <TransitionEditor />
    </div>
  );
}

export function TransitionEditor() {
  const { t } = useTranslation('animations');
  const { bus } = useEditor();
  const deck = useDeck((s) => s.deck);
  const slide = useCurrentSlide();
  const tx = useGestureTx();
  const inSeconds = useSeconds();
  const [play, setPlay] = useState(0);
  const played = useRef(0);
  const card = useRef<HTMLDivElement>(null);
  /** The kind whose tile was just pressed, until its card has been brought into view. */
  const chosen = useRef<string | null>(null);
  /** The slide whose card was brought into view last. */
  const seen = useRef<string | null>(null);
  // An undo step left open by a drag ends with the editor, whoever closes it.
  useEffect(() => tx.end, [tx]);
  // The card opens under the row of its tile, which may be at the foot of what is in view, or
  // out of it: the panel scrolls to show all of it. For a kind that was just chosen the scroll
  // is one the eye can follow; for a slide that has just come to the Stage, and for the editor
  // as it opens, it is there at once. A frame later, when a popover has found its height.
  const slideId = slide?.id ?? null;
  const shown = slide ? shownTransition(slide).type : null;
  useEffect(() => {
    if (slideId === null) return;
    const arrived = seen.current !== slideId;
    const picked = chosen.current !== null && chosen.current === shown;
    if (!arrived && !picked) return;
    const frame = requestAnimationFrame(() => {
      seen.current = slideId;
      chosen.current = null;
      const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (card.current) reveal(card.current, picked && !still);
    });
    return () => cancelAnimationFrame(frame);
  });
  if (!slide) return null;

  const transition = shownTransition(slide);
  const label = t('history.transition');
  const none = transition.type === 'none';
  const before = slideBefore(deck, slide.id);
  const directional = transitionTurns(transition.type);
  const known = transitionTypes.includes(transition.type);
  const toAll = applyTransitionToAll(deck, slide.id);
  const auto = transition.advance.afterMs !== undefined;
  // "None" has nothing to set. A slide without a transition that moves on by itself keeps the
  // card all the same: it is the one place that says so, and that turns it off.
  const hasCard = !none || auto;

  /** One step of a drag, or a whole change: `replay` plays it in the preview. */
  const change = (next: Transition, options: { gesture?: boolean; replay?: boolean } = {}) => {
    if (!options.gesture) tx.end();
    bus.dispatch(
      { type: 'slide.update', slideId: slide.id, patch: { transition: storedTransition(next) } },
      options.gesture ? { txId: tx.id(), label } : { label },
    );
    if (options.replay) setPlay((n) => n + 1);
  };

  /** The card of the chosen kind; `column` is where its tile lies in the row above it. */
  const settingsCard = (column?: number) => (
    <div
      ref={card}
      role="group"
      aria-label={t('transition.settings')}
      data-testid="transition-settings"
      className="relative col-span-full mt-1 flex animate-overlay-in flex-col gap-2 rounded-panel bg-ui-canvas p-2"
    >
      {column !== undefined && (
        // A notch in the card, under the tile it belongs to. It is laid out on the columns of
        // the tiles, so it follows them in both reading directions.
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-full grid grid-cols-3 gap-2"
        >
          <svg
            viewBox="0 0 16 8"
            className={cx('h-2 w-4 justify-self-center', COLUMN_START[column])}
          >
            <path d="M0 8 8 0l8 8" className="fill-ui-canvas" />
          </svg>
        </div>
      )}
      {!none && (
        // The stage the transition plays on, in the colour of its family. The slide it comes
        // from peeks out behind the slide it gives way to.
        <div
          className="flex justify-center overflow-hidden rounded-control px-2 pt-6 pb-4"
          style={toneBackdrop(toneOf(transition.type))}
        >
          <div className="relative max-w-full">
            {before && <SlideBehind deck={deck} slide={before} />}
            <TransitionPreview
              deck={deck}
              slide={slide}
              transition={transition}
              play={play}
              playedRef={played}
            />
            <IconButton
              icon={Play}
              variant="primary"
              label={t('transition.replay')}
              className="absolute end-2 bottom-2 shadow-floating"
              onClick={() => setPlay((n) => n + 1)}
            />
          </div>
        </div>
      )}
      {!known && (
        <p className="px-2 text-xs text-ui-warning-fg">
          {t('transition.unknown', { type: transition.type })}
        </p>
      )}
      {!none && opensTheShow(deck, slide.id) && (
        <p className="flex gap-1.5 px-2 text-xs text-ui-fg-muted">
          <Icon icon={Info} />
          {t('transition.first')}
        </p>
      )}
      <div className="divide-y divide-ui-line rounded-control bg-ui-raised shadow-raised">
        {directional && (
          <SettingRow icon={Move} chip={CHIP.direction} label={t('field.direction')}>
            <DirectionField
              label={t('field.direction')}
              value={transition.direction ?? defaultTransitionDirection(deck.meta.dir)}
              deckDir={deck.meta.dir}
              onChange={(direction) => change({ ...transition, direction }, { replay: true })}
            />
          </SettingRow>
        )}
        {!none && (
          <SettingRow
            icon={Timer}
            chip={CHIP.duration}
            label={inSeconds(t('field.duration'))}
            below={
              <Slider
                aria-label={t('field.duration')}
                value={Math.min(transition.duration, SLIDER_MAX)}
                min={100}
                max={SLIDER_MAX}
                step={50}
                onValueChange={(duration) => change({ ...transition, duration }, { gesture: true })}
                onValueCommit={() => {
                  tx.end();
                  setPlay((n) => n + 1);
                }}
              />
            }
          >
            <SecondsField
              label={t('field.duration')}
              className="w-16"
              value={transition.duration}
              onChange={(duration) => change({ ...transition, duration }, { replay: true })}
            />
          </SettingRow>
        )}
        <SettingRow
          icon={SkipForward}
          chip={CHIP.advance}
          mirror
          label={t('transition.advance')}
          below={
            auto && (
              <>
                <span className="text-xs text-ui-fg-muted">{t('transition.after')}</span>
                <SecondsField
                  label={t('transition.after')}
                  className="w-16"
                  value={transition.advance.afterMs ?? 0}
                  onChange={(afterMs) =>
                    change({ ...transition, advance: { ...transition.advance, afterMs } })
                  }
                />
                <span className="text-xs text-ui-fg-muted">{t('field.seconds')}</span>
              </>
            )
          }
        >
          <SegmentedControl
            aria-label={t('transition.advance')}
            size="sm"
            value={auto ? 'auto' : 'click'}
            onValueChange={(mode) =>
              change({
                ...transition,
                advance:
                  mode === 'auto'
                    ? { ...transition.advance, afterMs: AUTO_AFTER_MS }
                    : TRANSITION_DEFAULTS.advance,
              })
            }
            options={[
              { value: 'click', label: t('transition.onClick') },
              { value: 'auto', label: t('transition.auto') },
            ]}
          />
        </SettingRow>
        <div className="p-2">
          <Button
            variant="soft"
            icon={CopyCheck}
            className="w-full"
            disabled={toAll.length === 0}
            onClick={() => {
              tx.end();
              bus.batch(toAll, { label: t('history.transitionAll') });
            }}
          >
            {t('transition.applyAll')}
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div data-testid="transition-editor" className="flex min-w-0 flex-col gap-4">
      <div role="radiogroup" aria-label={t('transition.type')} className="flex flex-col gap-4">
        {GROUPS.map((group) => {
          const place = hasCard ? placeOf(group.types, transition.type) : null;
          return (
            <section
              key={group.key}
              aria-label={t(`transition.group.${group.key}`)}
              className="flex flex-col gap-2"
            >
              <h4 className="flex items-center gap-1.5 text-xs font-semibold text-ui-fg">
                <span
                  aria-hidden
                  className="size-2 rounded-full"
                  style={toneBackdrop(group.tone)}
                />
                {t(`transition.group.${group.key}`)}
              </h4>
              <div className="grid grid-cols-3 gap-2">
                {group.types.map((type, index) => (
                  <Fragment key={type}>
                    <EffectTile
                      role="radio"
                      aria-checked={transition.type === type}
                      data-transition={type}
                      label={t(`transition.${type}`)}
                      effect={type}
                      phase="transition"
                      tone={group.tone}
                      selected={transition.type === type}
                      onClick={() => {
                        chosen.current = type;
                        change(withType(transition, type, transitionTurns(type)), {
                          replay: true,
                        });
                      }}
                    />
                    {place?.rowEnd === index && settingsCard(place.column)}
                  </Fragment>
                ))}
              </div>
            </section>
          );
        })}
      </div>
      {/* A kind that has no tile (a newer runtime's, an agent's): its card closes the list. */}
      {GROUPS.every((group) => !placeOf(group.types, transition.type)) && settingsCard()}
    </div>
  );
}
