import { createDeck, createElement, createSlide } from '@slidr/model';
import { hebrewDeck } from '@slidr/model/fixtures';
import { expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
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

test('paints nothing, also of content that says it is visible', async () => {
  // A part that says `visibility: visible` is drawn under a hidden parent. The markup of an
  // `html` element may say it, and so may a picture: the window showed them, a slide after a
  // slide, wherever they stand on their slides, every time the design check measured the deck.
  const part = 'width: 400px; height: 400px; background: rgb(255, 0, 0); visibility: visible;';
  const slide = createSlide({
    elements: [
      createElement.svg({
        id: 'e_icon',
        frame: { x: 100, y: 100, w: 400, h: 400 },
        markup:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g style="visibility: hidden;"><rect width="24" height="24" style="fill: rgb(255, 0, 0); visibility: visible;"/></g></svg>',
      }),
      createElement.html({
        id: 'e_html',
        frame: { x: 600, y: 100, w: 400, h: 400 },
        markup: `<div style="${part}"></div>`,
        hasScripts: false,
      }),
    ],
  });
  const deck = createDeck({ lang: 'en', slides: [slide] });
  // What the window shows: the slide is put over it, as it is over the editor.
  const shown = document.createElement('div');
  shown.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px;background:#ffffff';
  document.body.append(shown);
  const offscreen = await renderSlideOffscreen({ deck, slide });
  try {
    // The parts are there, laid out, and visible as far as their own style goes.
    const parts = Array.from(
      offscreen.root.querySelectorAll('[data-slidr-svg], [data-slidr-html]'),
      (host) => host.shadowRoot!.querySelector('rect, div')!,
    );
    expect(parts.map((el) => getComputedStyle(el).visibility)).toEqual(['visible', 'visible']);
    expect(parts.map((el) => Math.round(el.getBoundingClientRect().width))).toEqual([400, 400]);

    const base64 = await page.screenshot({ element: shown, save: false });
    const bitmap = await createImageBitmap(
      await (await fetch(`data:image/png;base64,${base64}`)).blob(),
    );
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d')!;
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
    let inked = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] !== 255 || data[i + 1] !== 255 || data[i + 2] !== 255) inked++;
    }
    expect(inked).toBe(0);
  } finally {
    offscreen.dispose();
    shown.remove();
  }
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
