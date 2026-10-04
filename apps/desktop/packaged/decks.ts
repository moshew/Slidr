import { crc32, deflateSync } from 'node:zlib';
import {
  createDeck,
  createElement,
  createSlide,
  richText,
  type AssetMeta,
  type Deck,
} from '@slidr/model';
import type { Page } from '@playwright/test';
import { probeMarkup } from '../e2e/hardening-helpers';
import { answerDialog, invoke } from './app';

/*
 * Decks for the suites of the packaged app, made with the model's own factories, and a way to
 * put one in front of the app: as a `.slidr` file the app itself packs (its own save command),
 * opened as a user opens a file.
 */

/** Packs `deck` into a `.slidr` file at `path`, with the running app's own save. */
export async function writeDeckFile(page: Page, path: string, deck: Deck): Promise<void> {
  const workspace = await invoke<{ id: string }>(page, 'storage_new');
  await invoke(page, 'storage_save', {
    workspaceId: workspace.id,
    path,
    deckJson: JSON.stringify(deck),
    title: deck.meta.title,
  });
  await invoke(page, 'storage_close', { workspaceId: workspace.id });
}

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, sum]);
}

/**
 * A picture of noise, as a PNG: it does not compress, so its file is as heavy as a photograph
 * of its size, and each `seed` is another file to the content-addressed store.
 */
export function noisePng(width: number, height: number, seed: number): Buffer {
  const row = width * 3 + 1;
  const raw = Buffer.alloc(row * height);
  let state = seed >>> 0 || 1;
  for (let y = 0; y < height; y++) {
    for (let x = 1; x < row; x++) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      raw[y * row + x] = state & 0xff;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bits per channel
  header[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 1 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Packs a long deck with a picture of its own on every slide, the way a deck of photographs is
 * heavy: the pictures go into the workspace through the app's own import, and the deck refers
 * to them. Returns the size of the pictures, in bytes.
 */
export async function writePictureDeck(page: Page, path: string, count: number): Promise<number> {
  const deck = longDeck(count);
  const workspace = await invoke<{ id: string }>(page, 'storage_new');
  let bytes = 0;
  for (const [index, slide] of deck.slides.entries()) {
    const png = noisePng(480, 270, index + 1);
    bytes += png.length;
    const asset = await page.evaluate(
      async ({ base64, workspaceId, name }) => {
        const internals = (
          window as unknown as {
            __TAURI_INTERNALS__: {
              invoke: (command: string, body: unknown, options: unknown) => Promise<unknown>;
            };
          }
        ).__TAURI_INTERNALS__;
        const body = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        return internals.invoke('asset_import_bytes', body, {
          headers: { 'x-workspace-id': workspaceId, 'x-file-name': name },
        });
      },
      { base64: png.toString('base64'), workspaceId: workspace.id, name: `photo-${index + 1}.png` },
    );
    const imported = asset as AssetMeta;
    deck.assets[imported.id] = { ...imported, origin: 'upload', name: `photo-${index + 1}.png` };
    // In place of the panel: the picture takes the side of the slide the shapes had.
    slide.elements = [
      ...slide.elements.filter((element) => element.type === 'text'),
      createElement.image({
        id: `e_${index + 1}_photo`,
        frame: frame(1240, 300, 520, 520),
        assetId: imported.id,
      }),
    ];
  }
  await invoke(page, 'storage_save', {
    workspaceId: workspace.id,
    path,
    deckJson: JSON.stringify(deck),
    title: deck.meta.title,
  });
  await invoke(page, 'storage_close', { workspaceId: workspace.id });
  return bytes;
}

/** Opens a `.slidr` file through the File flow: Ctrl+O, with the file dialog answered. */
export async function openDeckFile(page: Page, path: string): Promise<void> {
  await answerDialog(page, 'open', path);
  await page.getByTestId('stage-surface').focus();
  await page.keyboard.press('Control+o');
}

const frame = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });

/**
 * A deck written to do harm: a script in an `html` object that tries to leave its frame, an
 * `html` object without scripts and an SVG that both carry what a cleaner must take out, and
 * references to a server outside the app. `outside` is the address of that server.
 */
export function hostileDeck(outside: string): Deck {
  const handlers = [
    `<img src="${outside}/pixel.png" onerror="window.__pwned = 'img'">`,
    `<a id="link" href="javascript:window.__pwned = 'href'">link</a>`,
    `<form action="${outside}/form"><button formaction="javascript:window.__pwned = 'form'">go</button></form>`,
    `<base href="${outside}/">`,
    `<meta http-equiv="refresh" content="0;url=${outside}/refresh">`,
    `<object data="${outside}/object"></object><embed src="${outside}/embed">`,
    `<iframe srcdoc="<script>parent.__pwned = 'frame'</scr` + `ipt>"></iframe>`,
    `<div style="background: url(${outside}/style.png)" onclick="window.__pwned = 'click'">text of the object</div>`,
  ].join('');
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" onload="window.__pwned = 'svg-onload'">`,
    `<script>window.__pwned = 'svg-script'</scr` + `ipt>`,
    `<a href="javascript:window.__pwned = 'svg-href'"><circle cx="50" cy="50" r="40" fill="#c00" onclick="window.__pwned = 'svg-click'"/></a>`,
    `<foreignObject width="100" height="100"><iframe srcdoc="x"></iframe></foreignObject>`,
    `<image href="${outside}/svg.png" width="10" height="10"/>`,
    `</svg>`,
  ].join('');
  return createDeck({
    lang: 'he',
    title: 'Hostile',
    slides: [
      createSlide({
        id: 's_hostile',
        elements: [
          createElement.text({
            id: 'e_title',
            frame: frame(160, 80, 1600, 120),
            content: richText('שקף שנכתב כדי להזיק', { dir: 'rtl' }),
          }),
          createElement.html({
            id: 'e_probe',
            frame: frame(160, 260, 400, 200),
            markup: probeMarkup(`${outside}/probe`),
            hasScripts: true,
            natural: { w: 400, h: 200 },
          }),
          createElement.html({
            id: 'e_handlers',
            frame: frame(640, 260, 500, 300),
            markup: handlers,
            styles: `@import url("${outside}/import.css"); div { color: red; }`,
            natural: { w: 500, h: 300 },
          }),
          createElement.svg({ id: 'e_svg', frame: frame(1240, 260, 300, 300), markup: svg }),
        ],
      }),
    ],
  });
}

/**
 * A deck of `count` slides of the kind people make: a title, a paragraph, a shape, and on some
 * slides a table. For the measurements of WG13-T01.
 */
export function longDeck(count: number): Deck {
  const slides = Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    return createSlide({
      id: `s_${n}`,
      name: `שקף ${n}`,
      elements: [
        createElement.text({
          id: `e_${n}_title`,
          role: 'title',
          frame: frame(160, 100, 1600, 140),
          content: richText(`נושא מספר ${n}: תוכנית העבודה`, { dir: 'rtl', styleRef: 'title' }),
        }),
        createElement.text({
          id: `e_${n}_body`,
          role: 'body',
          frame: frame(160, 300, 1000, 520),
          content: richText(
            [
              `הנקודה הראשונה של שקף ${n}, עם משפט שלם אחד.`,
              'הנקודה השנייה, קצרה יותר.',
              'Third point, in English, to mix directions.',
              'נקודה רביעית שסוגרת את הרשימה.',
            ].join('\n'),
            { dir: 'auto', styleRef: 'body' },
          ),
        }),
        createElement.shape({
          id: `e_${n}_panel`,
          frame: frame(1240, 300, 520, 520),
          geometry: { kind: 'preset', preset: 'roundRect' },
          fill: { kind: 'solid', color: { token: n % 2 ? 'primary' : 'accent' } },
        }),
        createElement.shape({
          id: `e_${n}_dot`,
          frame: frame(1420, 480, 160, 160),
          geometry: { kind: 'preset', preset: 'ellipse' },
          fill: { kind: 'solid', color: { token: 'surface' } },
        }),
      ],
    });
  });
  return createDeck({ lang: 'he', title: `Long deck ${count}`, slides });
}

/** One slide with `count` objects, in a grid: for the frame rate of dragging one of them. */
export function crowdedDeck(count: number): Deck {
  const columns = Math.ceil(Math.sqrt((count * 16) / 9));
  const rows = Math.ceil(count / columns);
  const w = 1760 / columns;
  const h = 920 / rows;
  const elements = Array.from({ length: count }, (_, i) => {
    const box = frame(80 + (i % columns) * w, 80 + Math.floor(i / columns) * h, w - 16, h - 16);
    return i % 3 === 0
      ? createElement.text({
          id: `e_${i}`,
          frame: box,
          content: richText(`אובייקט ${i}`, { dir: 'rtl' }),
        })
      : createElement.shape({
          id: `e_${i}`,
          frame: box,
          geometry: { kind: 'preset', preset: i % 3 === 1 ? 'roundRect' : 'ellipse' },
          fill: { kind: 'solid', color: { token: i % 2 ? 'primary' : 'accent' } },
        });
  });
  return createDeck({
    lang: 'he',
    title: `Crowded ${count}`,
    slides: [createSlide({ id: 's_crowd', elements })],
  });
}
