import alefUrl from '@fontsource/alef/files/alef-latin-400-normal.woff2?url';
import {
  createDeck,
  createElement,
  createSlide,
  richText,
  type AssetMeta,
  type Deck,
} from '@slidr/model';
import { afterEach, describe, expect, test } from 'vitest';
import { exportHtml } from './exportHtml';

// The fonts a deck carries as assets (SPEC 5.7), in an exported file. Every slide registers
// them for itself while it is drawn, and each of those rules became a copy of the font in the
// file: a deck of 35 imported slides with its fonts came to 21 MB (ADR-036). The file needs
// each font once, in its head, and every slide draws with it from there.

const FONT = 'f0'.repeat(32);
const FAMILY = 'T Deck Font';

const asset: AssetMeta = {
  id: FONT,
  kind: 'font',
  mime: 'font/woff2',
  file: `${FONT}.woff2`,
  bytes: 20_000,
  origin: 'import',
  font: { family: FAMILY, weight: '400', style: 'normal' },
};

const slide = (id: string) =>
  createSlide({
    id,
    elements: [
      createElement.text({
        id: `${id}_text`,
        frame: { x: 100, y: 100, w: 1200, h: 200 },
        content: richText('Hamburgefonstiv', { marks: { font: FAMILY } }),
      }),
    ],
  });

const deckOf = (...ids: string[]): Deck => ({
  ...createDeck({ lang: 'en', slides: ids.map(slide) }),
  assets: { [FONT]: asset },
});

async function fontFile(): Promise<Blob> {
  return (await fetch(alefUrl)).blob();
}

/** The font as a file holds it: the text of its data URI, after the header. */
async function inBase64(blob: Blob): Promise<string> {
  let binary = '';
  for (const byte of new Uint8Array(await blob.arrayBuffer())) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function exported(deck: Deck, font: Blob) {
  return exportHtml(deck, {
    loadAsset: (meta) => Promise.resolve(meta.id === FONT ? font : undefined),
    // No font of a library: the only fonts of the file are the deck's.
    fontCss: () => Promise.resolve(''),
  });
}

const count = (text: string, part: string) => text.split(part).length - 1;

let frames: HTMLIFrameElement[] = [];
afterEach(() => {
  for (const frame of frames) frame.remove();
  frames = [];
});

/** The exported file, opened as a page of its own. */
async function open(html: string): Promise<Document> {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:absolute;left:0;top:0;width:960px;height:540px';
  const loaded = new Promise((resolve) => frame.addEventListener('load', resolve, { once: true }));
  frame.srcdoc = html;
  document.body.append(frame);
  frames.push(frame);
  await loaded;
  const page = frame.contentDocument!;
  await expect.poll(() => page.documentElement.classList.contains('slidr-ready')).toBe(true);
  return page;
}

describe('the fonts of the deck in an exported file', () => {
  test('a font is in a file of three slides once, in its head', async () => {
    const font = await fontFile();
    const base64 = await inBase64(font);
    expect(base64.length).toBeGreaterThan(10_000);
    const three = await exported(deckOf('s_one', 's_two', 's_three'), font);

    // One copy of the font, whatever the number of slides: there were three.
    expect(count(three.html, base64)).toBe(1);
    expect(three.html).not.toContain('blob:');
    // Its rule is in the head, as the renderer writes it, and no slide has one of its own.
    const page = new DOMParser().parseFromString(three.html, 'text/html');
    const rule = `@font-face { font-family: "${FAMILY}"; font-weight: 400; font-style: normal; font-display: block; src: url("data:font/woff2;base64,${base64}"); }`;
    const sheets = (root: ParentNode) =>
      Array.from(root.querySelectorAll('style'), (style) => style.textContent ?? '');
    expect(sheets(page.head).filter((css) => css.includes('@font-face'))).toEqual([rule]);
    expect(page.querySelectorAll('section.slide')).toHaveLength(3);
    expect(sheets(page.body).filter((css) => css.includes('@font-face'))).toEqual([]);
    // The report lists the font once, as before.
    expect(three.assets.map((entry) => entry.id)).toEqual([FONT]);

    // Two more slides cost two slides, not two fonts.
    const one = await exported(deckOf('s_one'), font);
    expect(count(one.html, base64)).toBe(1);
    expect(three.bytes - one.bytes).toBeLessThan(base64.length / 2);
  });

  test('every slide of the file is drawn in the font, and nothing is fetched for it', async () => {
    const font = await fontFile();
    const { html } = await exported(deckOf('s_one', 's_two', 's_three'), font);
    const page = await open(html);
    const view = page.defaultView as unknown as {
      slidr: { setState(state: { slide: number; step: number }): void };
      performance: Performance;
    };
    const sections = Array.from(page.querySelectorAll('section.slide'));
    const widths: number[] = [];
    for (let index = 0; index < 3; index++) {
      view.slidr.setState({ slide: index, step: 0 });
      const run = sections[index]!.querySelector<HTMLElement>('[data-slidr-text] p span')!;
      // A font is asked for when the text that needs it is laid out, not before.
      run.getBoundingClientRect();
      await page.fonts.ready;
      const width = run.getBoundingClientRect().width;
      widths.push(width);
      // The same words in what the run would fall back to: the deck's font is not that.
      const fallback = run.cloneNode(true) as HTMLElement;
      fallback.style.fontFamily = 'var(--font-body)';
      run.after(fallback);
      expect(fallback.getBoundingClientRect().width, `slide ${index + 1}`).not.toBe(width);
      fallback.remove();
    }
    expect(widths[0]).toBeGreaterThan(0);
    expect(widths).toEqual([widths[0], widths[0], widths[0]]);
    const loaded = Array.from(page.fonts).filter((face) => face.status === 'loaded');
    expect(loaded.map((face) => face.family.replace(/"/g, ''))).toEqual([FAMILY]);
    // The page asked the network for nothing: the font is the data of its one rule.
    expect(view.performance.getEntriesByType('resource').map((entry) => entry.name)).toEqual([]);
  });
});
