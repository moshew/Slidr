import { createDeck, createElement, createSlide, type AssetMeta, type Deck } from '@slidr/model';
import { describe, expect, test } from 'vitest';
import { exportHtml } from './exportHtml';

// CSS names an asset of the deck as `url("slidr-asset:<id>")`: in the stylesheet of an `html`
// element, in an inline style of its markup, and in a slide's own stylesheet (an HTML import
// writes all three). The exported file has no deck to ask, so each name has to leave as the
// picture itself.

const PICTURE = 'c2'.repeat(32);

async function picture(): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no canvas');
  ctx.fillStyle = '#c2185b';
  ctx.fillRect(0, 0, 64, 64);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('no picture'))), 'image/png'),
  );
}

const asset: AssetMeta = {
  id: PICTURE,
  kind: 'image',
  mime: 'image/png',
  file: `${PICTURE}.png`,
  bytes: 200,
  origin: 'import',
  width: 64,
  height: 64,
};

function deckWith(slide: Parameters<typeof createSlide>[0]): Deck {
  return {
    ...createDeck({ lang: 'en', slides: [createSlide(slide)] }),
    assets: { [PICTURE]: asset },
  };
}

async function exported(deck: Deck): Promise<string> {
  const blob = await picture();
  const { html } = await exportHtml(deck, {
    loadAsset: (meta) => Promise.resolve(meta.id === PICTURE ? blob : undefined),
    fontCss: () => Promise.resolve(''),
  });
  return html;
}

/** The slides of an exported file, without the player's script. */
function slidesOf(html: string): string {
  const page = new DOMParser().parseFromString(html, 'text/html');
  return Array.from(page.querySelectorAll('section.slide'))
    .map((section) => section.getHTML({ serializableShadowRoots: true }))
    .join('\n');
}

describe('an asset that CSS names, in an exported file', () => {
  test('is in the file where the stylesheet of an html element names it', async () => {
    const slides = slidesOf(
      await exported(
        deckWith({
          id: 's_one',
          elements: [
            createElement.html({
              id: 'e_card',
              frame: { x: 100, y: 100, w: 600, h: 400 },
              markup: '<div class="card">Card</div>',
              styles: `.card { background: linear-gradient(#0008, #0008), url("slidr-asset:${PICTURE}") center / cover; }`,
            }),
          ],
        }),
      ),
    );
    expect(slides).not.toContain('slidr-asset:');
    expect(slides).not.toContain('blob:');
    expect(slides).toMatch(/\.card \{[^}]*url\(["']?data:image\//);
  });

  test('is in the file where an inline style names it', async () => {
    const slides = slidesOf(
      await exported(
        deckWith({
          id: 's_one',
          elements: [
            createElement.html({
              id: 'e_card',
              frame: { x: 100, y: 100, w: 600, h: 400 },
              markup: `<div style="height: 200px; background-image: url(&quot;slidr-asset:${PICTURE}&quot;)">Card</div>`,
            }),
          ],
        }),
      ),
    );
    expect(slides).not.toContain('slidr-asset:');
    expect(slides).not.toContain('blob:');
    expect(slides).toMatch(/background-image: url\((&quot;|["'])?data:image\//);
  });

  test("is in the file where the slide's own stylesheet names it", async () => {
    const slides = slidesOf(
      await exported(
        deckWith({
          id: 's_one',
          css: `.mark { background-image: url("slidr-asset:${PICTURE}"); }`,
          elements: [
            createElement.html({
              id: 'e_card',
              frame: { x: 100, y: 100, w: 600, h: 400 },
              markup: '<div>Card</div>',
            }),
          ],
        }),
      ),
    );
    expect(slides).not.toContain('slidr-asset:');
    expect(slides).not.toContain('blob:');
    expect(slides).toMatch(/\.mark \{[^}]*url\(["']?data:image\//);
  });
});
