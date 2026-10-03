import type { Slide } from '@slidr/model';
import type { FlowDirection } from '@slidr/runtime';
import { cx, NumberField, SegmentedControl } from '@slidr/ui';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from '@slidr/ui/icons';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { i18n } from '../i18n';
import { useDeck, useSelection } from '../shell';
import { arrowOf, flowOf, type Arrow } from './model';

/* The pieces the transition editor and the animations panel are both built from. */

/**
 * The string for a name the runtime owns (a preset, a transition type), or the name itself when
 * this app has no string for it: the model keeps these as free text, and a deck may carry one
 * that a newer runtime, or an agent, wrote. Call it from a component that uses `useTranslation`,
 * so it follows the language.
 */
export function nameLabel(key: string, name: string): string {
  const full = `animations:${key}`;
  return i18n.exists(full) ? i18n.t(full) : name;
}

/** The slide on the Stage. */
export function useCurrentSlide(): Slide | undefined {
  const slideId = useSelection((s) => s.currentSlideId);
  return useDeck((s) =>
    slideId ? s.deck.slides.find((slide) => slide.id === slideId) : undefined,
  );
}

/** A control under its label. */
export function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('flex min-w-0 flex-col gap-1.5', className)}>
      <span className="text-xs font-medium text-ui-fg-muted">{label}</span>
      {children}
    </div>
  );
}

/** The longest duration or delay a field takes, in seconds. */
const MAX_SECONDS = 60;

/**
 * A time of the model, which keeps milliseconds, shown and typed in seconds. The unit is said by
 * the label beside the field (`useSeconds`), not inside it: a number field lays its unit out as
 * Latin text, which puts a Hebrew unit on the wrong side of the number.
 */
export function SecondsField({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  /** Milliseconds. */
  value: number;
  onChange: (ms: number) => void;
  className?: string;
}) {
  return (
    <NumberField
      aria-label={label}
      size="sm"
      className={className}
      value={value / 1000}
      min={0}
      max={MAX_SECONDS}
      step={0.1}
      precision={2}
      onValueChange={(seconds) => onChange(Math.round(seconds * 1000))}
    />
  );
}

/** A label of a field that takes seconds: "Duration (s)". */
export function useSeconds(): (label: string) => string {
  const { t } = useTranslation('animations');
  return (label) => `${label} (${t('field.seconds')})`;
}

const ARROWS = [
  { value: 'left', icon: ArrowLeft },
  { value: 'up', icon: ArrowUp },
  { value: 'down', icon: ArrowDown },
  { value: 'right', icon: ArrowRight },
] as const;

/**
 * The way something travels, as arrows on the screen. The model says `start` and `end`, which
 * turn around with the reading direction of the deck (SPEC 5.6); a person says left and right.
 * So the control is physical, the same in every UI language, and translates through the deck's
 * direction: in a Hebrew deck the arrow that points right is `start`.
 */
export function DirectionField({
  label,
  value,
  deckDir,
  onChange,
}: {
  label: string;
  value: FlowDirection;
  deckDir: 'ltr' | 'rtl';
  onChange: (direction: FlowDirection) => void;
}) {
  const { t, i18n: ui } = useTranslation('animations');
  // Left is left: in a right-to-left UI the segments are laid out from the right, so the list is
  // turned around to keep the arrow that points left on the left.
  const arrows = ui.dir() === 'rtl' ? ARROWS.toReversed() : ARROWS;
  return (
    <SegmentedControl<Arrow>
      aria-label={label}
      size="sm"
      className="self-start"
      value={arrowOf(value, deckDir)}
      onValueChange={(arrow) => onChange(flowOf(arrow, deckDir))}
      options={arrows.map(({ value: arrow, icon }) => ({
        value: arrow,
        icon,
        iconOnly: true,
        label: t(`arrow.${arrow}`),
      }))}
    />
  );
}
