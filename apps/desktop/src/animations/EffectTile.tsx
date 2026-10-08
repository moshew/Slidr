import { cx } from '@slidr/ui';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Phase = 'entrance' | 'emphasis' | 'exit' | 'transition';

/** Small diagrams make the effect's motion recognizable before it is applied. */
function EffectPreview({ effect, phase }: { effect: string; phase: Phase }) {
  const motif =
    effect === 'none'
      ? 'none'
      : /^(cover|reveal|swap|crossfade|dissolve|appear|disappear)$/.test(effect)
        ? effect
        : /blur/.test(effect)
          ? 'blur'
          : /iris/.test(effect)
            ? 'iris'
            : /split|expand|contract/.test(effect)
              ? 'split'
              : /fold|unfold|wipe/.test(effect)
                ? 'wipe'
                : /cube|flip/.test(effect)
                  ? 'cube'
                  : /rotate|spin|swing|wiggle|sway|tilt|jello|tada/.test(effect)
                    ? 'rotate'
                    : /scale|zoom|pop|elastic|pulse|growShrink|heartbeat/.test(effect)
                      ? 'scale'
                      : /flash|flicker/.test(effect)
                        ? 'flash'
                        : /shake/.test(effect)
                          ? 'shake'
                          : /bounce|rise|sink|drop|float/.test(effect)
                            ? 'vertical'
                            : /fly|slide|push|cover|reveal|swap/.test(effect)
                              ? 'horizontal'
                              : 'fade';

  const square = (x = 30, y = 17, size = 28): ReactNode => (
    <rect x={x} y={y} width={size} height={size} rx="5" fill="url(#effect-fill)" />
  );
  const ghost = (x: number, y: number, size = 28): ReactNode => (
    <rect x={x} y={y} width={size} height={size} rx="5" fill="#c9a9ff" opacity=".72" />
  );
  const arrow = (path: string): ReactNode => (
    <path
      d={path}
      fill="none"
      stroke="#873cf2"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );

  let artwork: ReactNode;
  switch (motif) {
    case 'appear':
    case 'disappear':
      artwork = <>{square()}</>;
      break;
    case 'cover':
      artwork = (
        <>
          {ghost(18, 15, 34)}
          {square(39, 19, 32)}
          {arrow('M30 54h36m-4-4 4 4-4 4')}
        </>
      );
      break;
    case 'reveal':
      artwork = (
        <>
          {square(21, 17, 32)}
          {ghost(40, 17, 28)}
          {arrow('M26 54h39m-4-4 4 4-4 4')}
        </>
      );
      break;
    case 'swap':
      artwork = (
        <>
          {ghost(17, 13, 30)}
          {square(42, 20, 30)}
          {arrow('M25 51c12 9 29 9 41 0M61 47l5 4-5 4')}
        </>
      );
      break;
    case 'crossfade':
      artwork = (
        <>
          {ghost(22, 16, 31)}
          <rect
            x="35"
            y="16"
            width="31"
            height="31"
            rx="5"
            fill="url(#effect-fill)"
            opacity=".75"
          />
        </>
      );
      break;
    case 'dissolve':
      artwork = (
        <>
          {square(31, 17, 27)}
          <circle cx="19" cy="18" r="3" fill="#a255ff" opacity=".5" />
          <circle cx="22" cy="37" r="2" fill="#a255ff" opacity=".65" />
          <circle cx="67" cy="20" r="3" fill="#a255ff" opacity=".6" />
          <circle cx="70" cy="41" r="2" fill="#a255ff" opacity=".45" />
        </>
      );
      break;
    case 'none':
      artwork = (
        <>
          <rect
            x="24"
            y="11"
            width="40"
            height="40"
            rx="8"
            fill="none"
            stroke="#c9a9ff"
            strokeWidth="2"
            strokeDasharray="4 4"
          />
          {arrow('M26 50 62 12')}
        </>
      );
      break;
    case 'blur':
      artwork = (
        <>
          <rect
            x="29"
            y="16"
            width="30"
            height="30"
            rx="6"
            fill="#8e3cf6"
            opacity=".68"
            filter="url(#effect-blur)"
          />
          {square(34, 21, 20)}
        </>
      );
      break;
    case 'iris':
      artwork = (
        <>
          <circle cx="44" cy="31" r="24" fill="none" stroke="#d9c1ff" strokeWidth="2" />
          {square(32, 19, 24)}
          <circle cx="44" cy="31" r="13" fill="none" stroke="#fff" strokeWidth="2" />
        </>
      );
      break;
    case 'split':
      artwork = (
        <>
          {ghost(23, 17, 22)}
          {square(43, 17, 22)}
          {arrow('M18 31h-7m3-3-3 3 3 3M70 31h7m-3-3 3 3-3 3')}
        </>
      );
      break;
    case 'wipe':
      artwork = (
        <>
          {ghost(25, 17, 28)}
          {square(37, 17, 28)}
          <path d="M37 14v34" stroke="#fff" strokeWidth="2" opacity=".9" />
          {arrow('M17 51h48m-4-4 4 4-4 4')}
        </>
      );
      break;
    case 'cube':
      artwork = (
        <>
          <path d="M23 18 42 12v37l-19-6z" fill="#c9a9ff" />
          <path d="M42 12 65 18v25l-23 6z" fill="url(#effect-fill)" />
          {arrow('M69 17q9 14 0 28')}
        </>
      );
      break;
    case 'rotate':
      artwork = (
        <>
          <rect
            x="27"
            y="17"
            width="28"
            height="28"
            rx="5"
            fill="#c9a9ff"
            transform="rotate(-20 41 31)"
          />
          {square(33, 18, 26)}
          {arrow('M63 18a20 20 0 0 1 2 27m-4-2 4 2 2-4')}
        </>
      );
      break;
    case 'scale':
      artwork = (
        <>
          <rect
            x="17"
            y="4"
            width="54"
            height="54"
            rx="12"
            fill="none"
            stroke="#e7d8ff"
            strokeWidth="2"
          />
          <rect
            x="23"
            y="10"
            width="42"
            height="42"
            rx="9"
            fill="none"
            stroke="#c9a9ff"
            strokeWidth="3"
          />
          {square()}
        </>
      );
      break;
    case 'flash':
      artwork = (
        <>
          {square()}
          {arrow('M44 4v7M44 51v7M17 31h7M64 31h7M25 12l5 5M58 45l5 5M63 12l-5 5M30 45l-5 5')}
        </>
      );
      break;
    case 'shake':
      artwork = (
        <>
          {ghost(21, 17)}
          {ghost(39, 17)}
          {square()}
          {arrow('M12 25h7m-3-3 3 3-3 3M76 37h-7m3-3-3 3 3 3')}
        </>
      );
      break;
    case 'vertical':
      artwork = (
        <>
          {ghost(30, 28)}
          {square(30, 12)}
          {arrow('M72 47V18m-4 4 4-4 4 4')}
        </>
      );
      break;
    case 'horizontal':
      artwork = (
        <>
          {ghost(12, 17)}
          {ghost(22, 17)}
          {square(35, 17, 28)}
          {arrow('M28 53h38m-4-4 4 4-4 4')}
        </>
      );
      break;
    default:
      artwork = (
        <>
          {ghost(21, 17)}
          {ghost(27, 17)}
          {square(34, 17, 28)}
        </>
      );
  }

  return (
    <svg viewBox="0 0 88 62" width="88" height="62" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="effect-fill" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#a255ff" />
          <stop offset="1" stopColor="#7631ed" />
        </linearGradient>
        <filter id="effect-blur" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
      </defs>
      <g transform={phase === 'exit' ? 'translate(88 0) scale(-1 1)' : undefined}>{artwork}</g>
    </svg>
  );
}

/** A picture and a readable label stay in one keyboard accessible choice. */
export function EffectTile({
  label,
  effect,
  phase,
  selected = false,
  disabled = false,
  onClick,
  ...rest
}: {
  label: string;
  effect: string;
  phase: Phase;
  selected?: boolean;
  disabled?: boolean;
  onClick: () => void;
} & Pick<ButtonHTMLAttributes<HTMLButtonElement>, 'role' | 'aria-checked'> & {
    'data-transition'?: string;
    'data-testid'?: string;
  }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled}
      onClick={onClick}
      className="group flex min-w-0 cursor-pointer flex-col items-stretch gap-1.5 text-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-focus disabled:cursor-not-allowed"
    >
      <span
        className={cx(
          'flex h-[86px] items-center justify-center overflow-hidden rounded-xl border bg-ui-raised transition-[border-color,box-shadow,transform] duration-(--duration-base)',
          'group-hover:-translate-y-0.5 group-hover:border-ui-accent group-hover:shadow-floating',
          'group-disabled:opacity-60 group-disabled:group-hover:translate-y-0 group-disabled:group-hover:shadow-none',
          selected ? 'border-ui-accent ring-2 ring-ui-accent' : 'border-ui-line',
        )}
      >
        <EffectPreview effect={effect} phase={phase} />
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
