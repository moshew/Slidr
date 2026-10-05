import type { Background, Command, Deck } from '@slidr/model';

/*
 * The theme's look beyond colours, fonts and sizes (ADR-040, "what the panel lacks"): its
 * backgrounds and the palette of its charts, as the commands an edit in the Templates panel
 * sends. Pure, so it is tested without a DOM.
 */

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The most colours the chart palette takes; a chart with more series repeats them. */
export const MAX_CHART_COLORS = 12;

/**
 * A variant of the theme's background changed, was added (`index` past the end) or removed
 * (`next` null). A slide that picked the variant holds a copy of it, so a slide whose
 * background is the variant as it was follows the change; a removed variant stays on the
 * slides that have it, as their own background. One batch: one undo step.
 */
export function variantCommands(deck: Deck, index: number, next: Background | null): Command[] {
  const variants = deck.theme.backgroundVariants;
  const before = variants[index];
  const after =
    next === null
      ? variants.filter((_, i) => i !== index)
      : index < variants.length
        ? variants.map((variant, i) => (i === index ? next : variant))
        : [...variants, next];
  if (same(after, variants)) return [];
  const commands: Command[] = [{ type: 'theme.update', patch: { backgroundVariants: after } }];
  if (before && next) {
    for (const slide of deck.slides) {
      if (!same(slide.background, before)) continue;
      commands.push({ type: 'slide.update', slideId: slide.id, patch: { background: next } });
    }
  }
  return commands;
}

/**
 * The chart palette with one colour changed, added (`index` past the end) or removed (`color`
 * null). It keeps at least one colour and at most `MAX_CHART_COLORS`; nothing when the edit
 * would leave it as it is or outside those bounds.
 */
export function paletteCommands(deck: Deck, index: number, color: string | null): Command[] {
  const palette = deck.theme.colors.chart;
  const after =
    color === null
      ? palette.filter((_, i) => i !== index)
      : index < palette.length
        ? palette.map((value, i) => (i === index ? color : value))
        : [...palette, color];
  if (after.length < 1 || after.length > MAX_CHART_COLORS || same(after, palette)) return [];
  return [{ type: 'theme.update', patch: { colors: { chart: after } } }];
}
