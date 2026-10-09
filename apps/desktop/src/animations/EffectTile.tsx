import { cx } from '@slidr/ui';
import type { ButtonHTMLAttributes } from 'react';
import { EffectArt, toneBackdrop, type EffectPhase, type EffectTone } from './effectArt';

/**
 * One effect of a gallery: its picture on a coloured card, and its name under it, in one choice
 * the keyboard reaches. The card has the shape of a slide, and the colour of the family the
 * effect belongs to; "none" is no effect, and its card has no colour.
 */
export function EffectTile({
  label,
  effect,
  phase,
  tone,
  selected = false,
  disabled = false,
  onClick,
  ...rest
}: {
  label: string;
  effect: string;
  phase: EffectPhase;
  tone: EffectTone;
  selected?: boolean;
  disabled?: boolean;
  onClick: () => void;
} & Pick<ButtonHTMLAttributes<HTMLButtonElement>, 'role' | 'aria-checked'> & {
    'data-transition'?: string;
    'data-testid'?: string;
  }) {
  const plain = effect === 'none';
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled}
      onClick={onClick}
      className="group flex min-w-0 cursor-pointer flex-col items-stretch gap-1.5 rounded-control text-center focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ui-focus disabled:cursor-not-allowed"
    >
      <span
        style={plain ? undefined : toneBackdrop(tone)}
        className={cx(
          'flex aspect-8/5 items-center justify-center overflow-hidden rounded-control transition-[box-shadow,transform] duration-(--duration-base) ease-out',
          'group-hover:-translate-y-0.5 group-hover:shadow-floating group-active:translate-y-0',
          'group-disabled:opacity-50 group-disabled:group-hover:translate-y-0 group-disabled:group-hover:shadow-none',
          plain ? 'bg-ui-field text-ui-fg-subtle' : 'shadow-raised',
          // The gap between the card and its ring is the surface the gallery lies on.
          selected && 'outline-2 outline-offset-2 outline-ui-accent',
        )}
      >
        <span className="flex size-full transition-transform duration-(--duration-slow) ease-out group-hover:scale-105 group-disabled:group-hover:scale-100">
          <EffectArt effect={effect} phase={phase} tone={tone} />
        </span>
      </span>
      <span
        className={cx(
          'min-h-8 px-0.5 text-xs leading-4',
          selected ? 'font-semibold text-ui-accent-fg' : 'font-medium text-ui-fg',
        )}
      >
        {label}
      </span>
    </button>
  );
}
