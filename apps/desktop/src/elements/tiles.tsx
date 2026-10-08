import type { ReactNode } from 'react';
import { cx } from '@slidr/ui';

/*
 * The pictures of the collections on the first screen of Elements: a coloured card with a small
 * drawing of what the collection holds, on a second card that peeks out behind it. Drawn here as
 * SVG, so they show at once, are sharp at any size, and need no file.
 */

export const COLLECTIONS = [
  'shapes',
  'graphics',
  'emoji',
  'icons',
  'photos',
  'clips',
  'tables',
  'charts',
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

const TILES: Record<CollectionId, TileArt> = {
  shapes: {
    front: ['#5eead4', '#0d9488'],
    back: ['#f9a8d4', '#ec4899'],
    art: () => (
      <g stroke={WHITE} strokeWidth="2.5" strokeLinejoin="round">
        <rect x="28" y="49" width="23" height="23" rx="5" fill="#fde047" />
        <circle cx="62.5" cy="61" r="12" fill="#38bdf8" />
        <path
          d="M53 27.5 65 47a2 2 0 0 1-1.7 3H38.700a2 2 0 0 1-1.7-3l12-19.500a2.3 2.3 0 0 1 4 0Z"
          fill="#f472b6"
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
  photos: {
    front: ['#93c5fd', '#2563eb'],
    back: ['#fde047', '#f59e0b'],
    art: (id) => (
      <>
        <defs>
          <clipPath id={`${id}-photo`}>
            <rect x="30.5" y="32.5" width="41" height="35" rx="3.5" />
          </clipPath>
        </defs>
        <rect x="27" y="29" width="48" height="42" rx="6.5" fill={WHITE} />
        <g clipPath={`url(#${id}-photo)`}>
          <rect x="30" y="32" width="42" height="36" fill="#bae6fd" />
          <circle cx="62" cy="42" r="5" fill="#fde047" />
          <path d="m26 70 16-21 11 14 6-7 15 16H26Z" fill="#22c55e" />
          <path d="m42 49 11 14-5 7H26l16-21Z" fill="#16a34a" />
        </g>
      </>
    ),
  },
  clips: {
    front: ['#f0abfc', '#c026d3'],
    back: ['#a5b4fc', '#6366f1'],
    art: () => (
      <>
        <circle cx="47" cy="54" r="16" fill={WHITE} />
        <path
          d="M43 46.800v14.400a1.2 1.2 0 0 0 1.8 1l12.3-7.200a1.2 1.2 0 0 0 0-2L44.8 45.800a1.2 1.2 0 0 0-1.8 1Z"
          fill="#c026d3"
        />
        <g fill="#fde047">
          <path d="M65 42.500V29.600a1.5 1.5 0 0 1 1.1-1.400l8-2.300a1.5 1.5 0 0 1 1.9 1.400v11.900h-3v-8.200l-5 1.400v10.100Z" />
          <circle cx="64.5" cy="42.5" r="3.5" />
          <circle cx="72.5" cy="39.3" r="3.5" />
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
  charts: {
    front: ['#a5b4fc', '#4f46e5'],
    back: ['#6ee7b7', '#10b981'],
    art: () => (
      <>
        <g fill={WHITE}>
          <rect x="29" y="56" width="10" height="16" rx="3" opacity=".7" />
          <rect x="43" y="48" width="10" height="24" rx="3" opacity=".85" />
          <rect x="57" y="38" width="10" height="34" rx="3" />
        </g>
        <path
          d="m28 46 12-9 11 5 19-13"
          fill="none"
          stroke="#fde047"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="70" cy="29" r="4" fill="#fde047" stroke={WHITE} strokeWidth="1.5" />
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
