import { Fragment, useMemo } from 'react';
import { cx } from '@slidr/ui';
import { CARD_GLYPH } from '../objects/card';
import { GLYPH_BOX, LINE_GLYPHS, shapeGlyph, type LineKind } from '../objects/shapes';

/* Shape and line previews use neutral black. The separate card preview keeps its accent ink. */

/** An ink, from the lit corner of a drawing to its far one. */
const INKS = {
  violet: ['#b49bff', '#6d28d9'],
  pink: ['#fda4cf', '#db2777'],
  teal: ['#5eead4', '#0d9488'],
  orange: ['#fcd34d', '#f97316'],
  blue: ['#7cc4ff', '#2563eb'],
  indigo: ['#a5b4fc', '#4f46e5'],
} as const;

export type Ink = keyof typeof INKS;

/** The same ink across the whole glyph box: a straight line has a box of no height to span. */
const boxPaint = (ink: Ink) => `url(#elements-ink-${ink}-box)`;
const shadow = (ink: Ink) => `url(#elements-ink-${ink}-shadow)`;

/** Room around the glyph box for a shadow, in the units of the box. */
const SHADOW_ROOM = 6;

/**
 * The inks, once for the collection: every picture of it paints with them by name. Not hidden
 * with `display`, which would take the inks from the pictures as well.
 */
export function ShapeInks() {
  return (
    <svg aria-hidden className="pointer-events-none absolute size-0">
      <defs>
        {(Object.keys(INKS) as Ink[]).map((ink) => {
          const [lit, far] = INKS[ink];
          const stops = (
            <>
              <stop offset="0" stopColor={lit} />
              <stop offset="1" stopColor={far} />
            </>
          );
          return (
            <Fragment key={ink}>
              <linearGradient id={`elements-ink-${ink}`} x1="0" y1="0" x2="1" y2="1">
                {stops}
              </linearGradient>
              <linearGradient
                id={`elements-ink-${ink}-box`}
                gradientUnits="userSpaceOnUse"
                x1="0"
                y1="0"
                x2={GLYPH_BOX}
                y2={GLYPH_BOX}
              >
                {stops}
              </linearGradient>
              <filter
                id={`elements-ink-${ink}-shadow`}
                filterUnits="userSpaceOnUse"
                x={-SHADOW_ROOM}
                y={-SHADOW_ROOM}
                width={GLYPH_BOX + 2 * SHADOW_ROOM}
                height={GLYPH_BOX + 2 * SHADOW_ROOM}
              >
                <feDropShadow
                  dx="0"
                  dy="1"
                  stdDeviation="0.9"
                  floodColor={far}
                  floodOpacity=".32"
                />
              </filter>
            </Fragment>
          );
        })}
      </defs>
    </svg>
  );
}

const box = `0 0 ${GLYPH_BOX} ${GLYPH_BOX}`;
const picture = 'overflow-visible';

/** A shape of the library in neutral black, matching its outline on the slide. */
export function ShapeArt({ preset, className }: { preset: string; className?: string }) {
  const glyph = useMemo(() => shapeGlyph(preset), [preset]);
  if (!glyph) return null;
  return (
    <svg aria-hidden viewBox={box} className={cx(picture, className)}>
      <path
        d={glyph.d}
        transform={`translate(${glyph.x} ${glyph.y})`}
        fill={glyph.closed ? '#111111' : 'none'}
        stroke="#111111"
        strokeWidth={glyph.closed ? 0 : 1.7}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** A line of the Insert menu. `flip` draws it as a deck that reads from the right gets it. */
export function LineArt({
  kind,
  flip,
  className,
}: {
  kind: LineKind;
  flip?: boolean;
  className?: string;
}) {
  return (
    <svg aria-hidden viewBox={box} className={cx(picture, className)}>
      <path
        d={LINE_GLYPHS[kind]}
        transform={flip ? `translate(${GLYPH_BOX} 0) scale(-1 1)` : undefined}
        fill="none"
        stroke="#111111"
        strokeWidth="1.9"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** A card: a sheet with its accent along the top and two lines of text, the heading shorter. */
export function CardArt({
  ink,
  flip,
  className,
}: {
  ink: Ink;
  flip?: boolean;
  className?: string;
}) {
  return (
    <svg aria-hidden viewBox={box} className={cx(picture, className)}>
      <path d={CARD_GLYPH.box} fill="#ffffff" filter={shadow(ink)} />
      <path d={CARD_GLYPH.accent} fill={boxPaint(ink)} />
      <path
        d={CARD_GLYPH.lines}
        transform={flip ? `translate(${GLYPH_BOX} 0) scale(-1 1)` : undefined}
        fill="none"
        stroke="#c5c3d1"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
