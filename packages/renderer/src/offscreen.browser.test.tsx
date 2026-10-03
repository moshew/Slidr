import { hebrewDeck } from '@slidr/model/fixtures';
import { expect, test, vi } from 'vitest';
import { renderSlideOffscreen } from './offscreen';

test('renders a slide at its logical size, measurable and unpainted, and cleans up', async () => {
  const deck = hebrewDeck();
  const slide = deck.slides[0]!;
  const offscreen = await renderSlideOffscreen({ deck, slide, mode: 'present' });

  const rect = offscreen.root.getBoundingClientRect();
  expect([rect.left, rect.top, rect.width, rect.height]).toEqual([0, 0, 1920, 1080]);
  expect(offscreen.root.dataset.slideId).toBe(slide.id);
  expect(getComputedStyle(offscreen.root).visibility).toBe('hidden');
  // Laid out for real: the text has line boxes.
  const text = offscreen.root.querySelector('[data-element-id]');
  expect(text?.getBoundingClientRect().height).toBeGreaterThan(0);

  offscreen.dispose();
  expect(document.querySelector('[data-slide-id]')).toBeNull();
});

test('settles in a window that gets no frames, as a minimized one', async () => {
  const frames = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(0);
  try {
    const deck = hebrewDeck();
    const offscreen = await renderSlideOffscreen({ deck, slide: deck.slides[0]! });
    expect(offscreen.root.getBoundingClientRect().width).toBe(1920);
    offscreen.dispose();
  } finally {
    frames.mockRestore();
  }
});
