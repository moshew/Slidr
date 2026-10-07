import type { Archetype, Layout, PlaceholderRole } from '@slidr/model';

type Seats = Partial<Record<PlaceholderRole, number>>;

/** The archetypes a template draws a layout for: all of them but the blank slide. */
export type Drawn = Exclude<Archetype, 'blank'>;

/**
 * The roles every built-in template seats for each archetype, and how many of each (ADR-039).
 * A deck that moves from one template to another finds a place for all its content because they
 * all draw the same roles; a template may seat more (see `OPTIONAL`), never less.
 */
export const ROLE_CONTRACT: Record<Drawn, Seats> = {
  hero: { caption: 2, title: 1, subtitle: 1 },
  section: { number: 1, caption: 1, title: 1, subtitle: 1 },
  title: { title: 1 },
  bigNumber: { caption: 4, title: 1, number: 4, subtitle: 1, body: 1, footer: 1 },
  quote: { quote: 1, attribution: 1, caption: 1, footer: 1 },
  text: { title: 1, body: 1 },
  textImage: { caption: 1, title: 1, image: 1, subtitle: 3, body: 3, footer: 1 },
  fullImage: { image: 1, caption: 1, title: 1, body: 1 },
  cards: { caption: 4, title: 1, subtitle: 3, body: 4, footer: 1 },
  timeline: { caption: 2, title: 1, number: 4, subtitle: 4, body: 4, footer: 1 },
  process: { caption: 6, title: 1, subtitle: 5, number: 5, body: 1, footer: 1 },
  comparison: { caption: 3, title: 1, subtitle: 2, body: 2, footer: 1 },
  chart: { caption: 2, title: 1, chart: 1, number: 2, body: 2, footer: 1 },
  table: { caption: 2, title: 1, table: 1, footer: 1 },
  team: { caption: 5, title: 1, image: 4, subtitle: 4, body: 4, footer: 1 },
  closing: { caption: 2, title: 1, body: 3 },
};

/**
 * What a template may seat beyond the contract: a photograph on the opening slide, and one in
 * each card. A deck that used such a seat keeps the picture where it was when it moves to a
 * template without it.
 */
export const OPTIONAL: Partial<Record<Drawn, Seats>> = {
  hero: { image: 1 },
  cards: { image: 3 },
};

/** How many placeholders of each role a layout seats. */
export function seats(layout: Layout): Seats {
  const count: Seats = {};
  for (const { role } of layout.placeholders) count[role] = (count[role] ?? 0) + 1;
  return count;
}

/** Where a layout departs from the contract of its archetype; empty when it keeps it. */
export function contractGaps(layout: Layout): string[] {
  if (layout.archetype === 'blank') return [];
  const wanted = ROLE_CONTRACT[layout.archetype];
  const optional = OPTIONAL[layout.archetype] ?? {};
  const has = seats(layout);
  const gaps: string[] = [];
  for (const role of new Set([
    ...Object.keys(wanted),
    ...Object.keys(has),
  ]) as Set<PlaceholderRole>) {
    const want = wanted[role] ?? 0;
    const got = has[role] ?? 0;
    const extra = optional[role] ?? 0;
    if (got !== want && got !== want + extra) {
      gaps.push(`${layout.id}: ${role} ×${got}, the contract seats ×${want}`);
    }
  }
  return gaps;
}
