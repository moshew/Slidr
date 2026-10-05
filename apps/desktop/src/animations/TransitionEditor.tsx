import type { Deck, Slide, Transition } from '@slidr/model';
import { ScaledSlide } from '@slidr/renderer';
import { runTransition, transitionTurns, transitionTypes } from '@slidr/runtime';
import {
  Button,
  cx,
  Field,
  Icon,
  IconButton,
  type LucideIcon,
  SegmentedControl,
  Slider,
} from '@slidr/ui';
import {
  Ban,
  Blend,
  CopyCheck,
  FlipHorizontal2,
  Layers2,
  MoveRight,
  PanelLeftOpen,
  Play,
  ScanLine,
  ZoomIn,
} from '@slidr/ui/icons';
import { useEffect, useRef, useState } from 'react';
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

/*
 * The transition into the slide on the Stage (WG8-T05, SPEC 4.4): its kind, the way it travels,
 * how long it takes, when the slide moves on, and "apply to all". It is drawn twice, in the row B
 * popover and at the foot of the animations panel, and writes through `slide.update`.
 */

const ICONS: Record<string, LucideIcon> = {
  none: Ban,
  fade: Blend,
  push: MoveRight,
  cover: Layers2,
  reveal: PanelLeftOpen,
  wipe: ScanLine,
  zoom: ZoomIn,
  flip: FlipHorizontal2,
};

/** The longest transition the slider offers, in milliseconds; the field beside it takes more. */
const SLIDER_MAX = 3000;
/** How long a slide waits before it moves on by itself, when that is first switched on. */
const AUTO_AFTER_MS = 3000;
/** The width the two slides of the preview are drawn at. */
const PREVIEW_W = 256;

/**
 * The transition, played small: the slide before this one gives way to it, by the runtime's own
 * `runTransition`. It plays when `play` changes.
 */
function TransitionPreview({
  deck,
  slide,
  transition,
  play,
}: {
  deck: Deck;
  slide: Slide;
  transition: Transition;
  /** A count of the times to play: every change of it plays the transition once. */
  play: number;
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
    if (!play || !leaving || !entering) return;
    leaving.style.visibility = 'visible';
    const run = runTransition(leaving, entering, latest.current, deck.meta.dir);
    let ended = false;
    void run.finished.then(() => {
      if (!ended) leaving.style.visibility = 'hidden';
    });
    return () => {
      ended = true;
      run.finish();
      leaving.style.visibility = 'hidden';
    };
  }, [play, deck.meta.dir]);

  const layer = 'absolute inset-0 overflow-hidden';
  return (
    <div
      data-testid="transition-preview"
      className="relative shrink-0 overflow-hidden rounded-control border border-ui-line bg-ui-canvas"
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

export function TransitionEditor() {
  const { t } = useTranslation('animations');
  const { bus } = useEditor();
  const deck = useDeck((s) => s.deck);
  const slide = useCurrentSlide();
  const tx = useGestureTx();
  const inSeconds = useSeconds();
  const [play, setPlay] = useState(0);
  // An undo step left open by a drag ends with the editor, whoever closes it.
  useEffect(() => tx.end, [tx]);
  if (!slide) return null;

  const transition = shownTransition(slide);
  const label = t('history.transition');
  const directional = transitionTurns(transition.type);
  const known = transitionTypes.includes(transition.type);
  const toAll = applyTransitionToAll(deck, slide.id);
  const auto = transition.advance.afterMs !== undefined;

  /** One step of a drag, or a whole change: `replay` plays it in the preview. */
  const change = (next: Transition, options: { gesture?: boolean; replay?: boolean } = {}) => {
    if (!options.gesture) tx.end();
    bus.dispatch(
      { type: 'slide.update', slideId: slide.id, patch: { transition: storedTransition(next) } },
      options.gesture ? { txId: tx.id(), label } : { label },
    );
    if (options.replay) setPlay((n) => n + 1);
  };

  return (
    <div data-testid="transition-editor" className="flex flex-wrap gap-4">
      <div className="relative self-start">
        <TransitionPreview deck={deck} slide={slide} transition={transition} play={play} />
        <IconButton
          icon={Play}
          size="sm"
          variant="secondary"
          label={t('transition.replay')}
          disabled={transition.type === 'none'}
          className="absolute end-1.5 bottom-1.5 bg-ui-raised"
          onClick={() => setPlay((n) => n + 1)}
        />
      </div>
      <div className="flex min-w-60 flex-1 flex-col gap-3">
        <div role="radiogroup" aria-label={t('transition.type')} className="grid grid-cols-4 gap-1">
          {transitionTypes.map((type) => (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={transition.type === type}
              data-transition={type}
              onClick={() =>
                change(withType(transition, type, transitionTurns(type)), { replay: true })
              }
              className={cx(
                'flex cursor-default flex-col items-center gap-1 rounded-control px-1 py-2 text-xs transition-colors',
                transition.type === type
                  ? 'bg-ui-accent-soft font-medium text-ui-accent-fg'
                  : 'text-ui-fg-muted hover:bg-ui-hover hover:text-ui-fg',
              )}
            >
              <Icon icon={ICONS[type] ?? Blend} size="md" />
              <span className="max-w-full truncate">{t(`transition.${type}`)}</span>
            </button>
          ))}
        </div>
        {!known && (
          <p className="text-xs text-ui-warning-fg">
            {t('transition.unknown', { type: transition.type })}
          </p>
        )}
        {transition.type !== 'none' && (
          <>
            {directional && (
              <Field label={t('field.direction')}>
                <DirectionField
                  label={t('field.direction')}
                  value={transition.direction ?? 'start'}
                  deckDir={deck.meta.dir}
                  onChange={(direction) => change({ ...transition, direction }, { replay: true })}
                />
              </Field>
            )}
            <Field label={inSeconds(t('field.duration'))}>
              <div className="flex items-center gap-3">
                <Slider
                  aria-label={t('field.duration')}
                  className="min-w-0 flex-1"
                  value={Math.min(transition.duration, SLIDER_MAX)}
                  min={100}
                  max={SLIDER_MAX}
                  step={50}
                  onValueChange={(duration) =>
                    change({ ...transition, duration }, { gesture: true })
                  }
                  onValueCommit={() => {
                    tx.end();
                    setPlay((n) => n + 1);
                  }}
                />
                <SecondsField
                  label={t('field.duration')}
                  className="w-20 shrink-0"
                  value={transition.duration}
                  onChange={(duration) => change({ ...transition, duration }, { replay: true })}
                />
              </div>
            </Field>
          </>
        )}
        <Field label={t('transition.advance')}>
          <div className="flex items-center gap-2">
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
            {auto && (
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
            )}
          </div>
        </Field>
        {opensTheShow(deck, slide.id) && transition.type !== 'none' && (
          <p className="text-xs text-ui-fg-muted">{t('transition.first')}</p>
        )}
        <Button
          variant="ghost"
          size="sm"
          icon={CopyCheck}
          className="self-start"
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
  );
}
