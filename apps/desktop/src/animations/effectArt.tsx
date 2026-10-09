import { useId, type CSSProperties, type ReactNode } from 'react';

/*
 * The pictures of the effects: what the tiles of the transition gallery and of the animation
 * gallery show. A coloured card, lit from its corner, with the effect drawn on it in white: a
 * slide (or an object) that is solid where it arrives and faint where it was. Drawn here as
 * SVG in their own colours, as the pictures of Elements are, so they show at once and are sharp
 * at any size.
 */

export type EffectPhase = 'entrance' | 'emphasis' | 'exit' | 'transition';

/** The colours of a tile: its lit corner, its far corner, and the ink of what a slide shows. */
const TONES = {
  violet: ['#b49dff', '#6a3be4', '#5a2fd1'],
  blue: ['#78c6ff', '#2c6ee6', '#2358c9'],
  pink: ['#ffa3d1', '#d93a92', '#b82a7a'],
  green: ['#8ce8ae', '#1f9e58', '#17824a'],
  orange: ['#ffc680', '#f0711b', '#c95a0c'],
  rose: ['#ffabba', '#e2375b', '#bf2449'],
} as const;

export type EffectTone = keyof typeof TONES;

const WHITE = '#ffffff';
/** How much of a slide that is on its way out is left to see. */
const FAINT = 0.42;

/** The coloured card itself: a gradient from the lit corner, with a soft light on it. */
export function toneBackdrop(tone: EffectTone): CSSProperties {
  const [lit, far] = TONES[tone];
  return {
    backgroundImage: [
      'radial-gradient(120% 90% at 12% 0%, #ffffff59, #ffffff00 58%)',
      `linear-gradient(135deg, ${lit}, ${far})`,
    ].join(', '),
  };
}

/** What a picture is drawn with: the ink of its tile, and the filters of its own SVG. */
interface Draw {
  ink: string;
  shadow: string;
  blur: string;
  id: string;
}

const line = (d: string, opacity = 1): ReactNode => (
  <path
    d={d}
    fill="none"
    stroke={WHITE}
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    opacity={opacity}
  />
);

/** An arrow that points right, from `x1` to `x2`. */
const arrow = (x1: number, x2: number, y: number): ReactNode =>
  line(`M${x1} ${y}H${x2}m-4.5-4.2 4.5 4.2-4.5 4.2`);

/* ---------------------------------------------------------------- transitions: slides */

/** A slide that has arrived: a white card with a title and two lines of text. */
function slide(d: Draw, cx: number, cy: number, w = 40, h = 26, opacity = 1): ReactNode {
  const x = cx - w / 2;
  const y = cy - h / 2;
  const k = h / 26;
  return (
    <g opacity={opacity}>
      <rect x={x} y={y} width={w} height={h} rx={4 * k} fill={WHITE} filter={d.shadow} />
      <rect
        x={x + 5 * k}
        y={y + 5.5 * k}
        width={w * 0.4}
        height={3.2 * k}
        rx={1.6 * k}
        fill={d.ink}
        opacity=".9"
      />
      <rect
        x={x + 5 * k}
        y={y + 12.5 * k}
        width={w * 0.62}
        height={2.2 * k}
        rx={1.1 * k}
        fill={d.ink}
        opacity=".32"
      />
      <rect
        x={x + 5 * k}
        y={y + 17 * k}
        width={w * 0.46}
        height={2.2 * k}
        rx={1.1 * k}
        fill={d.ink}
        opacity=".32"
      />
    </g>
  );
}

/** The slide that gives way: the same card, faint and empty. */
function leaving(cx: number, cy: number, w = 40, h = 26, opacity = FAINT): ReactNode {
  return (
    <rect
      x={cx - w / 2}
      y={cy - h / 2}
      width={w}
      height={h}
      rx={(4 * h) / 26}
      fill={WHITE}
      opacity={opacity}
    />
  );
}

/** The pictures of the transitions, each on a canvas of 96 by 60. */
function transitionArt(type: string, d: Draw): ReactNode {
  switch (type) {
    case 'fade':
      return (
        <>
          <defs>
            <linearGradient id={`${d.id}g`} gradientUnits="userSpaceOnUse" x1="24" x2="62">
              <stop offset="0" stopColor={WHITE} stopOpacity=".08" />
              <stop offset="1" stopColor={WHITE} />
            </linearGradient>
            <mask id={`${d.id}m`} maskUnits="userSpaceOnUse" x="0" y="0" width="96" height="60">
              <rect width="96" height="60" fill={`url(#${d.id}g)`} />
            </mask>
          </defs>
          <g mask={`url(#${d.id}m)`}>{slide(d, 48, 30, 46, 30)}</g>
        </>
      );
    case 'crossfade':
      return (
        <>
          {leaving(40, 25, 40, 26, 0.5)}
          {slide(d, 56, 35, 40, 26, 0.92)}
        </>
      );
    case 'dissolve':
      return (
        <>
          {slide(d, 60, 30)}
          {[
            [30, 19, 6, 0.9],
            [32, 32, 5, 0.85],
            [23, 38, 4.5, 0.7],
            [21, 25, 4.5, 0.7],
            [13, 31, 3.5, 0.5],
            [15, 18, 3, 0.45],
            [26, 46, 3, 0.5],
            [8, 42, 2.5, 0.35],
            [6, 24, 2.5, 0.3],
          ].map(([x, y, size, opacity]) => (
            <rect
              key={`${x}-${y}`}
              x={x}
              y={y}
              width={size}
              height={size}
              rx="1"
              fill={WHITE}
              opacity={opacity}
            />
          ))}
        </>
      );
    case 'blur':
      return (
        <>
          <rect
            x="25"
            y="15"
            width="46"
            height="30"
            rx="5"
            fill={WHITE}
            opacity=".7"
            filter={d.blur}
          />
          {slide(d, 48, 30, 30, 19.5)}
        </>
      );
    case 'flash':
      return (
        <>
          {slide(d, 48, 30, 38, 25)}
          {line(
            'M48 6v5.5M48 48.5V54M16 30h6M74 30h6M24.5 10.5l4 3.8M71.5 10.5l-4 3.8M24.5 49.5l4-3.8M71.5 49.5l-4-3.8',
          )}
        </>
      );
    case 'push':
      return (
        <>
          {leaving(71, 27)}
          {slide(d, 29, 27)}
          {arrow(31, 65, 50)}
        </>
      );
    case 'cover':
      return (
        <>
          {leaving(57, 24)}
          {slide(d, 40, 31)}
          {arrow(24, 58, 52)}
        </>
      );
    case 'reveal':
      return (
        <>
          {slide(d, 36, 27)}
          {leaving(66, 27)}
          {arrow(52, 86, 50)}
        </>
      );
    case 'wipe':
      return (
        <>
          {leaving(48, 29, 44, 28)}
          <path
            d="M30 15H48V43H30a4 4 0 0 1-4-4V19a4 4 0 0 1 4-4Z"
            fill={WHITE}
            filter={d.shadow}
          />
          <rect x="31" y="20.5" width="11" height="3.2" rx="1.6" fill={d.ink} opacity=".9" />
          <rect x="31" y="27.5" width="13" height="2.2" rx="1.1" fill={d.ink} opacity=".32" />
          <rect x="31" y="32" width="10" height="2.2" rx="1.1" fill={d.ink} opacity=".32" />
          {line('M48 9.5V48.5')}
          {arrow(31, 65, 54.5)}
        </>
      );
    case 'slide':
      return (
        <>
          {line('M12 20h20', 0.9)}
          {line('M8 28h24', 0.65)}
          {line('M16 36h16', 0.4)}
          {slide(d, 60, 28)}
        </>
      );
    case 'swap':
      return (
        <>
          {leaving(38, 26)}
          {slide(d, 58, 34)}
          {line('M48 7q22-3 33 13M81 20l.2-5.5M81 20l-5.1-2.1')}
          {line('M48 53q-22 3-33-13M15 40l-.2 5.5M15 40l5.1 2.1')}
        </>
      );
    case 'zoom':
      return (
        <>
          <rect
            x="18"
            y="11"
            width="60"
            height="38"
            rx="7"
            fill="none"
            stroke={WHITE}
            strokeWidth="2"
            opacity=".3"
          />
          <rect
            x="25"
            y="15.5"
            width="46"
            height="29"
            rx="5.5"
            fill="none"
            stroke={WHITE}
            strokeWidth="2"
            opacity=".6"
          />
          {slide(d, 48, 30, 30, 19.5)}
        </>
      );
    case 'flip':
      return (
        <>
          {leaving(48, 30, 40, 26, 0.3)}
          <path
            d="M33 21 63 15V45L33 39Z"
            fill={WHITE}
            stroke={WHITE}
            strokeWidth="3"
            strokeLinejoin="round"
            filter={d.shadow}
          />
          <path d="M38 25.2l8-1.3" stroke={d.ink} strokeWidth="3.2" strokeLinecap="round" />
          <path
            d="M38 31h17M38 35.5l13 .8"
            stroke={d.ink}
            strokeWidth="2.2"
            strokeLinecap="round"
            opacity=".32"
          />
          {line('M38 8.5q10-6 20 0M58 8.5l-2.3-5M58 8.5l-5.5.4')}
        </>
      );
    case 'cube':
      return (
        <>
          <path
            d="M22 21 46 14V46L22 39Z"
            fill={WHITE}
            stroke={WHITE}
            strokeWidth="3"
            strokeLinejoin="round"
            opacity={FAINT}
          />
          <path
            d="M46 14 72 21V39L46 46Z"
            fill={WHITE}
            stroke={WHITE}
            strokeWidth="3"
            strokeLinejoin="round"
            filter={d.shadow}
          />
          <path d="M51 22.5l9 2" stroke={d.ink} strokeWidth="3.2" strokeLinecap="round" />
          <path
            d="M51 30h15M51 35l11-.8"
            stroke={d.ink}
            strokeWidth="2.2"
            strokeLinecap="round"
            opacity=".32"
          />
          {line('M80 19q7 11 0 22M80 41l5.1-2.1M80 41l-.2-5.5')}
        </>
      );
    case 'rotate':
      return (
        <>
          <g transform="rotate(-18 44 31)">{leaving(44, 31, 38, 25)}</g>
          {slide(d, 46, 30, 38, 25)}
          {line('M77 15a22 22 0 0 1 2 28M79 43l5.2-1.9M79 43l.1-5.5')}
        </>
      );
    case 'split':
      return (
        <>
          <path d="M12 16H27V42H12a4 4 0 0 1-4-4V20a4 4 0 0 1 4-4Z" fill={WHITE} opacity=".5" />
          <path d="M69 16H84a4 4 0 0 1 4 4V38a4 4 0 0 1-4 4H69Z" fill={WHITE} opacity=".5" />
          {slide(d, 48, 29, 34, 26)}
          {line('M24 52H10m4.5-4.2L10 52l4.5 4.2M72 52H86m-4.5-4.2L86 52l-4.5 4.2')}
        </>
      );
    case 'iris':
      return (
        <>
          {leaving(48, 30, 48, 31, 0.36)}
          <circle cx="48" cy="30" r="16" fill="none" stroke={WHITE} strokeWidth="2" opacity=".75" />
          <circle cx="48" cy="30" r="10.5" fill={WHITE} filter={d.shadow} />
          <rect x="42" y="26.2" width="12" height="3" rx="1.5" fill={d.ink} opacity=".9" />
          <rect x="43.5" y="31.5" width="9" height="2.2" rx="1.1" fill={d.ink} opacity=".32" />
        </>
      );
    default:
      // A kind this app has no picture for: a slide, arriving.
      return (
        <>
          {leaving(38, 26)}
          {slide(d, 56, 33)}
        </>
      );
  }
}

/* ---------------------------------------------------------------- animations: objects */

/** The pictures of the animation presets, each on a canvas of 88 by 62. */
function objectArt(effect: string, d: Draw): ReactNode {
  const motif = /^(cover|reveal|swap|crossfade|dissolve|appear|disappear)$/.test(effect)
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

  /** The object where it ends up. */
  const block = (x = 30, y = 17, size = 28): ReactNode => (
    <rect x={x} y={y} width={size} height={size} rx="6" fill={WHITE} filter={d.shadow} />
  );
  /** The object where it was. */
  const trace = (x: number, y: number, size = 28, opacity = FAINT): ReactNode => (
    <rect x={x} y={y} width={size} height={size} rx="6" fill={WHITE} opacity={opacity} />
  );

  switch (motif) {
    case 'appear':
    case 'disappear':
      return block();
    case 'cover':
      return (
        <>
          {trace(18, 15, 34)}
          {block(39, 19, 32)}
          {line('M30 56h36m-4-4 4 4-4 4')}
        </>
      );
    case 'reveal':
      return (
        <>
          {block(21, 17, 32)}
          {trace(44, 17, 28)}
          {line('M26 56h39m-4-4 4 4-4 4')}
        </>
      );
    case 'swap':
      return (
        <>
          {trace(17, 11, 30)}
          {block(42, 18, 30)}
          {line('M25 51c12 9 29 9 41 0M61 47l5 4-5 4')}
        </>
      );
    case 'crossfade':
      return (
        <>
          {trace(22, 14, 31, 0.5)}
          <g opacity=".92">{block(37, 20, 31)}</g>
        </>
      );
    case 'dissolve':
      return (
        <>
          {block(33, 17, 27)}
          <circle cx="19" cy="18" r="3" fill={WHITE} opacity=".6" />
          <circle cx="22" cy="37" r="2.2" fill={WHITE} opacity=".75" />
          <circle cx="71" cy="20" r="3" fill={WHITE} opacity=".7" />
          <circle cx="72" cy="43" r="2.2" fill={WHITE} opacity=".5" />
          <circle cx="12" cy="29" r="1.8" fill={WHITE} opacity=".4" />
        </>
      );
    case 'blur':
      return (
        <>
          <rect
            x="27"
            y="14"
            width="34"
            height="34"
            rx="7"
            fill={WHITE}
            opacity=".7"
            filter={d.blur}
          />
          {block(34, 21, 20)}
        </>
      );
    case 'iris':
      return (
        <>
          <circle cx="44" cy="31" r="24" fill="none" stroke={WHITE} strokeWidth="2" opacity=".5" />
          {block(32, 19, 24)}
          <circle cx="44" cy="31" r="7" fill="none" stroke={d.ink} strokeWidth="2" opacity=".6" />
        </>
      );
    case 'split':
      return (
        <>
          {trace(21, 17, 22)}
          {block(45, 17, 22)}
          {line('M16 31H9m3-3-3 3 3 3M72 31h7m-3-3 3 3-3 3')}
        </>
      );
    case 'wipe':
      return (
        <>
          {trace(25, 15, 28)}
          {block(37, 15, 28)}
          <path d="M37 11v36" stroke={d.ink} strokeWidth="2" strokeLinecap="round" opacity=".7" />
          {line('M17 54h48m-4-4 4 4-4 4')}
        </>
      );
    case 'cube':
      return (
        <>
          <path
            d="M23 18 42 12v37l-19-6z"
            fill={WHITE}
            stroke={WHITE}
            strokeWidth="3"
            strokeLinejoin="round"
            opacity={FAINT}
          />
          <path
            d="M42 12 65 18v25l-23 6z"
            fill={WHITE}
            stroke={WHITE}
            strokeWidth="3"
            strokeLinejoin="round"
            filter={d.shadow}
          />
          {line('M71 17q9 14 0 28')}
        </>
      );
    case 'rotate':
      return (
        <>
          <g transform="rotate(-20 41 31)">{trace(27, 17)}</g>
          {block(33, 18, 26)}
          {line('M65 18a20 20 0 0 1 2 27m-4-2 4 2 2-4')}
        </>
      );
    case 'scale':
      return (
        <>
          <rect
            x="17"
            y="4"
            width="54"
            height="54"
            rx="12"
            fill="none"
            stroke={WHITE}
            strokeWidth="2"
            opacity=".3"
          />
          <rect
            x="23"
            y="10"
            width="42"
            height="42"
            rx="9"
            fill="none"
            stroke={WHITE}
            strokeWidth="2.5"
            opacity=".6"
          />
          {block()}
        </>
      );
    case 'flash':
      return (
        <>
          {block()}
          {line('M44 4v7M44 51v7M17 31h7M64 31h7M25 12l5 5M58 45l5 5M63 12l-5 5M30 45l-5 5')}
        </>
      );
    case 'shake':
      return (
        <>
          {trace(20, 17)}
          {trace(40, 17)}
          {block()}
          {line('M12 25h7m-3-3 3 3-3 3M76 37h-7m3-3-3 3 3 3')}
        </>
      );
    case 'vertical':
      return (
        <>
          {trace(30, 30)}
          {block(30, 12)}
          {line('M72 47V18m-4 4 4-4 4 4')}
        </>
      );
    case 'horizontal':
      return (
        <>
          {trace(10, 15)}
          {trace(21, 15)}
          {block(35, 15, 28)}
          {line('M28 54h38m-4-4 4 4-4 4')}
        </>
      );
    default:
      return (
        <>
          {trace(19, 17, 28, 0.25)}
          {trace(26, 17, 28, 0.5)}
          {block(34, 17, 28)}
        </>
      );
  }
}

/* ---------------------------------------------------------------- the picture */

/**
 * The picture of one effect, to lie on the coloured card of its tone. "None" is no effect, and
 * has no colour of its own: it is drawn in the colour of the text around it.
 */
export function EffectArt({
  effect,
  phase,
  tone,
}: {
  effect: string;
  phase: EffectPhase;
  tone: EffectTone;
}) {
  // An id of React's own holds colons, which a `url(#…)` cannot.
  const id = `fx${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const ink = TONES[tone][2];
  const transition = phase === 'transition';

  if (effect === 'none') {
    return (
      <svg viewBox="0 0 96 60" className="size-full" aria-hidden="true" focusable="false">
        <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <rect x="28" y="17" width="40" height="26" rx="5" strokeDasharray="4.5 4.5" />
          <path d="M37 39 59 21" />
        </g>
      </svg>
    );
  }

  const draw: Draw = { ink, id, shadow: `url(#${id}s)`, blur: `url(#${id}b)` };
  return (
    <svg
      viewBox={transition ? '0 0 96 60' : '0 0 88 62'}
      className="size-full"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <filter id={`${id}s`} x="-30%" y="-30%" width="160%" height="180%">
          <feDropShadow dx="0" dy="1.6" stdDeviation="1.7" floodColor={ink} floodOpacity=".5" />
        </filter>
        <filter id={`${id}b`} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="3.2" />
        </filter>
      </defs>
      {transition ? (
        transitionArt(effect, draw)
      ) : (
        <g transform={phase === 'exit' ? 'translate(88 0) scale(-1 1)' : undefined}>
          {objectArt(effect, draw)}
        </g>
      )}
    </svg>
  );
}
