/**
 * The engine on a subtree of a document that is already loaded: what `import_capture` will
 * hand it (SPEC 13.2). The page is of another size than the slide, paints its own background
 * behind the slide, and knows nothing of the deck's theme.
 */
import { createDeck, plainText, Slide, type TextElement } from '@slidr/model';
import { beforeAll, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { convertSubtree } from './engine';
import * as fixtures from './fixtures';
import { foreignFrame, testHost } from './testing';

beforeAll(async () => {
  await page.viewport(1920, 1080);
});

describe('a subtree of a live document', () => {
  it('scales a 1280x720 slide to 1920 and takes what is behind it as the background', async () => {
    const host = testHost();
    const deck = createDeck({ lang: 'he' });
    const frame = await foreignFrame(fixtures.foreignPage, { w: 1400, h: 800 });
    try {
      const r = await convertSubtree(frame.document.querySelector('section')!, {
        deck,
        host,
        foreign: true,
        behind: 'page',
      });
      console.log(
        `foreign page, 1280x720: editability ${(r.editability * 100).toFixed(0)}%, ${r.ms} ms, ${r.guard.rounds} round(s)`,
      );
      expect(Slide.safeParse(r.slide).error?.issues).toBeUndefined();
      // Compared exactly: the converted slide was drawn in the page's own pixels.
      expect(r.guard).toMatchObject({ faithful: true, exact: true, fallbacks: [] });
      expect(r.editability).toBe(1);

      // The gradient behind the slide belongs to the page: it comes along as a picture.
      expect(r.assets).toHaveLength(1);
      expect(r.assets[0]).toMatchObject({
        kind: 'image',
        origin: 'import',
        width: 1280,
        height: 720,
      });
      expect(r.slide.background).toEqual({
        fill: { kind: 'image', assetId: r.assets[0]!.id, fit: 'fill' },
      });

      // The title and the paragraph under it share a right edge: one text box, two paragraphs.
      const texts = r.slide.elements.filter((e): e is TextElement => e.type === 'text');
      expect(texts).toHaveLength(1);
      const [words] = texts;
      expect(plainText(words!.content)).toMatch(/^שקף מקובץ אחר\nהטקסט הזה/);
      // 64px at 1.5; every value is written out, nothing is tied to a theme that is not the page's.
      expect(words!.content.paragraphs[0]).toMatchObject({
        dir: 'rtl',
        runs: [{ marks: { font: 'Arial', size: 96, weight: 700, color: { value: '#0c4a6e' } } }],
      });
      expect(words!.content.paragraphs[1]).toMatchObject({
        runs: [{ marks: { size: 42 } }],
      });
      expect(words!.frame.x + words!.frame.w).toBeCloseTo(1800, 0);
      // The note is its box and the words in its middle: a shape with its text.
      const note = r.slide.elements.find((e) => e.type === 'shape')!;
      expect(note).toMatchObject({
        fill: { kind: 'solid', color: { value: '#0c4a6e' } },
        effects: { radius: 18 },
      });
      expect(note.type === 'shape' && plainText(note.content!)).toBe('הערה בפינה');
      expect(note.frame).toMatchObject({ x: 120, h: 96 });
    } finally {
      frame.dispose();
    }
  });

  it('converts a stage the page shows through a scale, and says the comparison was approximate', async () => {
    const host = testHost();
    const deck = createDeck({ lang: 'en' });
    const frame = await foreignFrame(fixtures.scaledPage, { w: 1400, h: 800 });
    try {
      const r = await convertSubtree(frame.document.querySelector('.stage')!, {
        deck,
        host,
        foreign: true,
        behind: 'page',
      });
      console.log(
        `stage scaled to 0.9: editability ${(r.editability * 100).toFixed(0)}%, ${r.ms} ms, ${r.guard.rounds} round(s)`,
      );
      expect(r.guard).toMatchObject({ faithful: true, exact: false });
      // The page's colour behind the stage, and the stage's own fill over it.
      expect(r.slide.background).toEqual({
        fill: { kind: 'solid', color: { value: 'rgb(15, 23, 42)' } },
        overlay: { kind: 'solid', color: { value: '#f8fafc' } },
      });
      // Sizes are those of the stage's own layout, not of what the window shows: 60px at 1.5.
      const title = r.slide.elements.find(
        (e) => e.type === 'text' && plainText(e.content).startsWith('Fitted'),
      );
      expect(title?.type === 'text' && title.content.paragraphs[0]).toMatchObject({
        runs: [{ marks: { size: 90 } }],
      });
      expect(title!.frame.x).toBeCloseTo(120, 0);
      expect(r.slide.elements.find((e) => e.type === 'shape')!.frame).toEqual({
        x: 1200,
        y: 135,
        w: 570,
        h: 390,
      });
    } finally {
      frame.dispose();
    }
  });
});
