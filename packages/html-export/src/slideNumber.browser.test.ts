import { createDeck, createElement, createSlide, richText, type Deck } from '@slidr/model';
import { describe, expect, test } from 'vitest';
import { exportHtml } from './exportHtml';

// The number a slide shows in an exported file is its number in the deck, as on the Stage and
// in present mode: a range starts at the number of its first slide, and a hidden slide that is
// left out still counts (ADR-063, "מה לא נבדק"; ADR-069).

const numbered = (id: string, hidden = false) =>
  createSlide({
    id,
    hidden,
    elements: [
      createElement.text({
        id: `${id}_number`,
        role: 'slideNumber',
        frame: { x: 1700, y: 1000, w: 120, h: 40 },
        content: richText('#'),
      }),
    ],
  });

const deck: Deck = createDeck({
  lang: 'en',
  slides: [numbered('s_one'), numbered('s_two', true), numbered('s_three'), numbered('s_four')],
});

async function numbers(options: { slideIds?: string[] } = {}) {
  const { html } = await exportHtml(deck, {
    loadAsset: () => Promise.resolve(undefined),
    fontCss: () => Promise.resolve(''),
    ...options,
  });
  const page = new DOMParser().parseFromString(html, 'text/html');
  return Array.from(page.querySelectorAll('section.slide')).map((section) =>
    section.querySelector('[data-element-id$="_number"]')?.textContent?.trim(),
  );
}

describe('the slide number in an exported file', () => {
  test('counts the hidden slide that is left out, as the app does', async () => {
    expect(await numbers()).toEqual(['1', '3', '4']);
  });

  test('is the number in the deck for a range of slides', async () => {
    expect(await numbers({ slideIds: ['s_three', 's_four'] })).toEqual(['3', '4']);
  });
});
