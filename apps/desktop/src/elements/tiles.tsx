import type { ReactNode } from 'react';
import { cx } from '@slidr/ui';

/*
 * The pictures of the collections on the first screen of Elements: a coloured card with a small
 * drawing of what the collection holds, on a second card that peeks out behind it. Drawn here as
 * SVG, so they show at once, are sharp at any size, and need no file.
 */

export const COLLECTIONS = [
  'designs',
  'cards',
  'shapes',
  'graphics',
  'emoji',
  'icons',
  'frames',
  'tables',
] as const;

export type CollectionId = (typeof COLLECTIONS)[number];

interface TileArt {
  /** The front card, from its lit corner to its far one. */
  front: readonly [string, string];
  /** The card behind it. */
  back: readonly [string, string];
  art: (id: string) => ReactNode;
}

const WHITE = '#ffffff';

/** Four line icons of the icon library, on Lucide's 24-pixel grid. */
const LINE_ICONS = [
  'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z',
  'M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z',
  'M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z',
  'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z',
];

/** Four small cards, each with the dot of its own colour: where it stands, and its colour. */
const SMALL_CARDS: readonly (readonly [x: number, y: number, tone: string])[] = [
  [27, 30, '#ff5a47'],
  [53, 30, '#ffd93b'],
  [27, 53, '#57c4ff'],
  [53, 53, '#5fe3a1'],
];

const TILES: Record<CollectionId, TileArt> = {
  designs: {
    front: ['#84ccf5', '#3367db'],
    back: ['#ffcf79', '#ed7653'],
    art: () => (
      <>
        <rect x="27" y="31" width="48" height="39" rx="4" fill={WHITE} />
        <rect x="31" y="35" width="41" height="31" rx="2" fill="#b8e9e8" />
        <circle cx="57" cy="44" r="6" fill="#fbbf24" />
        <path d="m31 65 14-17 8 9 5-5 15 13Z" fill="#1f7777" />
        <path d="M35 74h31" stroke={WHITE} strokeWidth="3" strokeLinecap="round" />
      </>
    ),
  },
  cards: {
    front: ['#f0abfc', '#c026d3'],
    back: ['#fde68a', '#f59e0b'],
    art: () => (
      <>
        {SMALL_CARDS.map(([x, y, tone]) => (
          <g key={tone}>
            <rect x={x} y={y} width="22" height="19" rx="4" fill={WHITE} />
            <circle cx={x + 6} cy={y + 6.5} r="3" fill={tone} />
            <path
              d={`M${x + 12} ${y + 6.5}h6M${x + 4} ${y + 13}h14`}
              stroke="#86198f"
              strokeWidth="2"
              strokeLinecap="round"
              opacity=".5"
            />
          </g>
        ))}
      </>
    ),
  },
  shapes: {
    front: ['#5eead4', '#0d9488'],
    back: ['#f9a8d4', '#ec4899'],
    art: () => (
      <g stroke={WHITE} strokeWidth="2.5" strokeLinejoin="round">
        <rect x="28" y="49" width="23" height="23" rx="5" fill="#111111" />
        <circle cx="62.5" cy="61" r="12" fill="#111111" />
        <path
          d="M53 27.5 65 47a2 2 0 0 1-1.7 3H38.700a2 2 0 0 1-1.7-3l12-19.500a2.3 2.3 0 0 1 4 0Z"
          fill="#111111"
        />
      </g>
    ),
  },
  graphics: {
    front: ['#fdba74', '#ea580c'],
    back: ['#86efac', '#16a34a'],
    art: () => (
      <>
        <path d="M51 56v19" stroke="#14532d" strokeWidth="3.5" strokeLinecap="round" />
        <path d="M51 70c-1-6-6-8-11-7 1 6 6 8 11 7Z" fill="#22c55e" />
        <path d="M51 67c1-6 6-8 11-7-1 6-6 8-11 7Z" fill="#4ade80" />
        <g fill="#fde047" stroke="#b45309" strokeWidth=".8">
          {Array.from({ length: 10 }, (_, petal) => (
            <ellipse
              key={petal}
              cx="51"
              cy="30"
              rx="5"
              ry="9.5"
              transform={`rotate(${petal * 36} 51 43)`}
            />
          ))}
        </g>
        <circle cx="51" cy="43" r="8" fill="#7c2d12" />
        <circle cx="48.5" cy="40.5" r="2.4" fill="#c2410c" opacity=".8" />
      </>
    ),
  },
  emoji: {
    front: ['#86efac', '#16a34a'],
    back: ['#fdba74', '#f97316'],
    art: (id) => (
      <>
        <defs>
          <linearGradient id={`${id}-face`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fef08a" />
            <stop offset="1" stopColor="#fbbf24" />
          </linearGradient>
        </defs>
        <circle cx="51" cy="51" r="20.5" fill={`url(#${id}-face)`} stroke={WHITE} strokeWidth="4" />
        <ellipse cx="43.5" cy="46" rx="2.8" ry="3.8" fill="#713f12" />
        <ellipse cx="58.5" cy="46" rx="2.8" ry="3.8" fill="#713f12" />
        <path d="M39.5 54.5h23c0 7-5 11.5-11.5 11.5S39.5 61.5 39.5 54.500Z" fill="#713f12" />
        <path
          d="M45 62.800c1.5-1.8 3.6-2.6 6-2.600s4.5.8 6 2.600c-1.7 2-3.7 3.2-6 3.200s-4.3-1.2-6-3.200Z"
          fill="#fb7185"
        />
      </>
    ),
  },
  icons: {
    front: ['#c4b5fd', '#7c3aed'],
    back: ['#67e8f9', '#06b6d4'],
    art: () => (
      <g fill="none" stroke={WHITE} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
        {LINE_ICONS.map((d, index) => (
          <path
            key={index}
            d={d}
            transform={`translate(${index % 2 ? 53 : 29} ${index > 1 ? 53 : 29}) scale(.82)`}
          />
        ))}
      </g>
    ),
  },
  frames: {
    front: ['#bef264', '#65a30d'],
    back: ['#c4b5fd', '#7c3aed'],
    art: (id) => (
      <>
        <defs>
          <clipPath id={`${id}-arch`}>
            <path d="M30 71V46a12 12 0 0 1 24 0v25Z" />
          </clipPath>
          <clipPath id={`${id}-round`}>
            <circle cx="63" cy="60" r="12" />
          </clipPath>
        </defs>
        <path d="M27 74V46a15 15 0 0 1 30 0v28Z" fill={WHITE} />
        <g clipPath={`url(#${id}-arch)`}>
          <rect x="30" y="34" width="24" height="37" fill="#bae6fd" />
          <circle cx="46.5" cy="45" r="3.5" fill="#fde047" />
          <path d="M30 71V61l8-9 7 8 4-4 5 6v9Z" fill="#22c55e" />
        </g>
        <circle cx="63" cy="60" r="15" fill={WHITE} />
        <g clipPath={`url(#${id}-round)`}>
          <rect x="51" y="48" width="24" height="24" fill="#fdba74" />
          <circle cx="66" cy="57" r="4" fill="#fef9c3" />
          <path d="M51 65c5-4 9-4 13 0s8 3 11-1v8H51Z" fill="#a855f7" />
        </g>
      </>
    ),
  },
  tables: {
    front: ['#fda4af', '#e11d48'],
    back: ['#fcd34d', '#f59e0b'],
    art: (id) => (
      <>
        <defs>
          <clipPath id={`${id}-table`}>
            <rect x="27" y="30" width="48" height="42" rx="6.5" />
          </clipPath>
        </defs>
        <g clipPath={`url(#${id}-table)`}>
          <rect x="27" y="30" width="48" height="42" fill={WHITE} />
          <rect x="27" y="30" width="48" height="12" fill="#fecdd3" />
          <path
            d="M27 42h48M27 52h48M27 62h48M43 30v42M59 30v42"
            stroke="#fb7185"
            strokeWidth="1.6"
          />
        </g>
      </>
    ),
  },
};

/**
 * The picture of a collection. Inside a `group`, the card behind tilts further and the front
 * one lifts while the pointer is over it.
 */
export function CollectionTile({ id, className }: { id: CollectionId; className?: string }) {
  const { front, back, art } = TILES[id];
  // One tile of a collection is on the screen at a time, so its name is enough for its ids.
  const key = `elements-tile-${id}`;
  return (
    <svg aria-hidden viewBox="0 0 96 96" className={cx('overflow-visible', className)}>
      <defs>
        <linearGradient id={`${key}-front`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={front[0]} />
          <stop offset="1" stopColor={front[1]} />
        </linearGradient>
        <linearGradient id={`${key}-back`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={back[0]} />
          <stop offset="1" stopColor={back[1]} />
        </linearGradient>
        <linearGradient id={`${key}-light`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={WHITE} stopOpacity=".35" />
          <stop offset=".6" stopColor={WHITE} stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect
        x="12"
        y="9"
        width="62"
        height="62"
        rx="15"
        fill={`url(#${key}-back)`}
        className="origin-center -rotate-[9deg] transition-[rotate] duration-(--duration-base) ease-standard [transform-box:fill-box] group-hover:-rotate-[15deg]"
      />
      <g className="drop-shadow-[0_3px_4px_rgb(0_0_0/0.18)] transition-[translate] duration-(--duration-base) ease-standard group-hover:-translate-y-0.5">
        <rect x="18" y="18" width="66" height="66" rx="16" fill={`url(#${key}-front)`} />
        <rect x="18" y="18" width="66" height="66" rx="16" fill={`url(#${key}-light)`} />
        {art(key)}
      </g>
    </svg>
  );
}

/* ---------------------------------------------------------------- the photo frames */

/** What the thumbnails of the photo frames share, by id. */
export const FRAME_PHOTO = 'elements-frame-photo';

/**
 * The landscape of `FrameThumbDefs` as a picture of its own: the photograph in the thumbnail of
 * a frame that the renderer draws, which takes a picture by its address.
 */
export const FRAME_PHOTO_URL = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" preserveAspectRatio="xMidYMid slice">' +
    '<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#7dd3fc"/><stop offset="1" stop-color="#e0f2fe"/></linearGradient></defs>' +
    '<rect width="120" height="120" fill="url(#sky)"/><circle cx="84" cy="36" r="12" fill="#fde047"/>' +
    '<path d="M0 120V78l30-30 34 38 14-12 42 34v12Z" fill="#86efac"/>' +
    '<path d="M0 120v-18l44-30 40 26 36-14v36Z" fill="#22c55e"/></svg>',
)}`;

/**
 * What the thumbnails of the photo frames draw with, once for all of them: a landscape that
 * stands in for the photograph a frame waits for. In its own colours, as the pictures above
 * are.
 */
export function FrameThumbDefs() {
  return (
    <svg aria-hidden width="0" height="0" className="absolute">
      <defs>
        <linearGradient id={`${FRAME_PHOTO}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7dd3fc" />
          <stop offset="1" stopColor="#e0f2fe" />
        </linearGradient>
        <symbol id={FRAME_PHOTO} viewBox="0 0 120 120" preserveAspectRatio="xMidYMid slice">
          <rect width="120" height="120" fill={`url(#${FRAME_PHOTO}-sky)`} />
          <circle cx="84" cy="36" r="12" fill="#fde047" />
          <path d="M0 120V78l30-30 34 38 14-12 42 34v12Z" fill="#86efac" />
          <path d="M0 120v-18l44-30 40 26 36-14v36Z" fill="#22c55e" />
        </symbol>
      </defs>
    </svg>
  );
}
