import type { Background, Command, Deck, Fill, Slide } from '@slidr/model';

/*
 * The slide background (SLD-03): what a slide shows, and the commands of "apply to all slides".
 * Pure, so it is tested without a DOM.
 */

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function layoutBackground(deck: Deck, slide: Slide): Background | undefined {
  return slide.layoutId ? deck.layouts.find((l) => l.id === slide.layoutId)?.background : undefined;
}

/** What a slide shows without a background of its own: its layout's, or else the theme's. */
export function inheritedBackground(deck: Deck, slide: Slide): Background {
  return layoutBackground(deck, slide) ?? deck.theme.background;
}

/** The background a slide shows, as the renderer resolves it. */
export function shownBackground(deck: Deck, slide: Slide): Background {
  return slide.background ?? inheritedBackground(deck, slide);
}

/**
 * The background with another fill. Blur and dim are for photos (the schema says so), so they go
 * when the fill is no longer an image; the overlay stays.
 */
export function withFill(background: Background, fill: Fill): Background {
  if (fill.kind === 'image') return { ...background, fill };
  const { blur: _blur, dim: _dim, ...rest } = background;
  return { ...rest, fill };
}

/** Sets or clears blur / dim: zero is stored as absent. */
export function withAdjust(
  background: Background,
  change: { blur?: number; dim?: number },
): Background {
  const next: Background = { ...background, ...change };
  if (!next.blur) delete next.blur;
  if (!next.dim) delete next.dim;
  return next;
}

/** Which of the theme's variants a background is, if any. */
export function variantIndex(deck: Deck, background: Background | undefined): number {
  if (!background) return -1;
  return deck.theme.backgroundVariants.findIndex((variant) => same(variant, background));
}

/**
 * "Apply to all slides": the background the given slide shows becomes the theme's, so slides
 * added later get it too, and every slide's own background is dropped. A slide whose layout has
 * a background of its own is given the background explicitly, since the layout would win over the
 * theme. One batch: one undo step. Empty when every slide already shows it.
 */
export function applyToAllCommands(deck: Deck, slideId: string): Command[] {
  const source = deck.slides.find((s) => s.id === slideId);
  if (!source) return [];
  const background = shownBackground(deck, source);
  const commands: Command[] = [];
  if (!same(deck.theme.background, background)) {
    commands.push({ type: 'theme.update', patch: { background } });
  }
  for (const slide of deck.slides) {
    const wanted = layoutBackground(deck, slide) ? background : undefined;
    if (same(slide.background, wanted)) continue;
    commands.push({
      type: 'slide.update',
      slideId: slide.id,
      patch: { background: wanted ?? null },
    });
  }
  return commands;
}
