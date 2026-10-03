import frankUrl from '@fontsource-variable/frank-ruhl-libre/files/frank-ruhl-libre-hebrew-wght-normal.woff2?url';
import interUrl from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url';
import alefWoffUrl from '@fontsource/alef/files/alef-latin-400-normal.woff?url';
import alefUrl from '@fontsource/alef/files/alef-latin-400-normal.woff2?url';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { embedFonts } from './fonts';
import { shapedCodePoints } from './fontsMatch';
import { subsetFonts, type SubsetRequest } from './fontsSubset';

// Real fonts of the built-in library, cut down in the engine WebView2 uses. The proof that a
// subset keeps what shaping needs is that text is drawn with it exactly as with the whole font:
// the same pixels, so the same glyphs, kerning, mark positions and hinting. That holds for a
// static font, and for a variable one at the default of its weight axis; a static font cut from
// a variable one at another weight is held to be close. Other engines: the end-to-end suite
// (apps/desktop/e2e/runtime-export-fonts.spec.ts).

const HEBREW = 'U+0307-0308,U+0590-05FF,U+200C-2010,U+20AA,U+25CC,U+FB1D-FB4F';
const HEBREW_ONLY = 'U+0590-05FF,U+20AA,U+FB1D-FB4F';
const LATIN = 'U+0000-00FF,U+0131,U+0152-0153,U+2000-206F,U+20AC,U+2122';

const chars = (...codePoints: number[]) => String.fromCodePoint(...codePoints);
/** "In the beginning God created", with its points: a dagesh, a shin dot, vowels under letters. */
const POINTED = [
  chars(0x5d1, 0x5bc, 0x5b0, 0x5e8, 0x5b5, 0x5d0, 0x5e9, 0x5c1, 0x5b4, 0x5d9, 0x5ea),
  chars(0x5d1, 0x5bc, 0x5b8, 0x5e8, 0x5b8, 0x5d0),
  chars(0x5d0, 0x5b1, 0x5dc, 0x5b9, 0x5d4, 0x5b4, 0x5d9, 0x5dd),
].join(' ');
const SHALOM = chars(0x5e9, 0x5dc, 0x5d5, 0x5dd);
/** Pairs that are kerned, and letters that join into ligatures where a font has them. */
const KERNED = 'AVATAR Toy. WAVE fi ffl 1976';

async function file(url: string): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await (await fetch(url)).arrayBuffer());
}

/** A request for the text a face draws at each weight: `{ 400: 'abc', 700: 'Bold' }`. */
function request(
  bytes: Uint8Array,
  text: Record<number, string>,
  rest: Partial<SubsetRequest> = {},
): SubsetRequest {
  const byWeight = new Map(
    Object.entries(text).map(([weight, drawn]) => [
      Number(weight),
      shapedCodePoints(Array.from(drawn, (c) => Number(c.codePointAt(0)))),
    ]),
  );
  return { bytes, byWeight, features: false, instances: true, group: 'one', ...rest };
}

let registered: FontFace[] = [];
let added: Element[] = [];

async function register(family: string, bytes: Uint8Array<ArrayBuffer>, weight: string) {
  const face = new FontFace(family, bytes, { weight });
  await face.load();
  document.fonts.add(face);
  registered.push(face);
}

afterEach(() => {
  for (const face of registered) document.fonts.delete(face);
  for (const element of added) element.remove();
  registered = [];
  added = [];
});

/** The pixels of a line of text in a font, and its width. */
function draw(text: string, family: string, weight: number, size: number) {
  const canvas = document.createElement('canvas');
  canvas.width = 1600;
  canvas.height = size * 2;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#000';
  context.font = `${weight} ${size}px "${family}", monospace`;
  context.direction = /\p{Script=Hebrew}/u.test(text) ? 'rtl' : 'ltr';
  context.textAlign = 'left';
  context.fillText(text, 8, size * 1.4);
  return {
    width: context.measureText(text).width,
    pixels: context.getImageData(0, 0, canvas.width, canvas.height).data,
  };
}

function differing(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let count = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) count++;
  return count;
}

/** Text in the whole font against the same text in its subset: not one pixel may differ. */
function expectSameDrawing(text: string, whole: string, cut: string, weights: number[]) {
  for (const weight of weights) {
    for (const size of [17, 44]) {
      const a = draw(text, whole, weight, size);
      const b = draw(text, cut, weight, size);
      expect(b.width, `width at ${weight}, ${size}px`).toBe(a.width);
      expect(differing(a.pixels, b.pixels), `pixels at ${weight}, ${size}px`).toBe(0);
      // The text is there at all: a blank canvas would compare equal too.
      expect(a.pixels.some((value) => value < 128)).toBe(true);
    }
  }
}

const ink = (pixels: Uint8ClampedArray) => pixels.reduce((sum, value) => sum + (255 - value), 0);

/**
 * Text in a variable font against a static font cut from it at a weight that is not the default
 * of its axis. There the subsetter rounds what the browser interpolates, so the two are close,
 * not the same: as wide to half a pixel, and as heavy to 2%.
 */
function expectCloseDrawing(text: string, whole: string, cut: string, weight: number) {
  for (const size of [17, 44]) {
    const a = draw(text, whole, weight, size);
    const b = draw(text, cut, weight, size);
    expect(Math.abs(b.width - a.width), `width at ${size}px`).toBeLessThan(0.5);
    expect(Math.abs(ink(b.pixels) / ink(a.pixels) - 1), `ink at ${size}px`).toBeLessThan(0.02);
  }
}

const isWoff2 = (bytes: Uint8Array) => String.fromCharCode(...bytes.subarray(0, 4)) === 'wOF2';

/** Adds markup to the page and lays it out, so that the browser starts loading its fonts. */
function add(html: string): HTMLElement {
  const element = document.createElement('div');
  element.innerHTML = html;
  document.body.append(element);
  added.push(element);
  element.getBoundingClientRect();
  return element;
}

const rule = (family: string, url: string, descriptors = '') =>
  `@font-face { font-family: "${family}"; src: url("${url}"); font-display: block; ${descriptors} }`;

/** The faces of a family the browser itself has loaded, as `style weight`. */
const loadedFaces = (family: string) =>
  Array.from(document.fonts)
    .filter((face) => face.family.replace(/"/g, '') === family && face.status === 'loaded')
    .map((face) => `${face.style} ${face.weight}`)
    .sort();

// First in the file: once the subsetter has loaded it stays loaded, and this cannot be shown.
describe('without WebAssembly', () => {
  test('the fonts go in whole, with one warning', async () => {
    const instantiate = vi
      .spyOn(WebAssembly, 'instantiate')
      .mockRejectedValue(new Error('no WebAssembly here'));
    try {
      add(
        `<style>${rule('T Inter', interUrl, 'font-weight: 100 900;')}${rule('T Alef', alefUrl)}</style>`,
      );
      const host = add(
        `<p style='font-family: "T Inter"'>ab</p><p style='font-family: "T Alef"'>cd</p>`,
      );
      const { css, fonts, warnings } = await embedFonts(host);
      expect(warnings).toEqual([
        {
          code: 'fonts-whole',
          message:
            'The fonts went in whole: what cuts them down to the characters in use could not be loaded',
        },
      ]);
      expect(
        fonts.map((font) => [font.family, font.subset, font.bytes === font.originalBytes]),
      ).toEqual([
        ['T Inter', false, true],
        ['T Alef', false, true],
      ]);
      expect(css.match(/base64,[^"]+"\) format\("woff2"\);/g)).toHaveLength(2);
    } finally {
      instantiate.mockRestore();
    }
  });
});

describe('subsetFonts', () => {
  test('cuts a variable Hebrew font down to its text, with the points in place', async () => {
    const whole = await file(frankUrl);
    const [fonts] = await subsetFonts([request(whole, { 400: POINTED })]);
    const [cut] = fonts ?? [];
    expect(fonts).toHaveLength(1);
    expect(cut && isWoff2(cut.bytes)).toBe(true);
    // A static font of the one weight it is drawn at, with the letters and points of the text.
    expect(cut?.weight).toBe(400);
    expect(cut?.bytes.byteLength).toBeLessThan(whole.byteLength / 4);
    await register('Frank whole', whole, '300 900');
    await register('Frank cut', cut!.bytes, '400');
    // Regular is the default of this font's weight axis: not one pixel differs.
    expectSameDrawing(POINTED, 'Frank whole', 'Frank cut', [400]);
  });

  test('makes a static font for each weight a variable font is drawn at', async () => {
    const whole = await file(interUrl);
    const [fonts] = await subsetFonts([request(whole, { 700: 'Bold Toy', 400: KERNED })]);
    const [regular, bold] = fonts ?? [];
    expect(fonts?.map((font) => font.weight)).toEqual([400, 700]);
    expect(regular!.bytes.byteLength + bold!.bytes.byteLength).toBeLessThan(whole.byteLength / 4);
    await register('Inter whole', whole, '100 900');
    await register('Inter regular', regular!.bytes, '400');
    await register('Inter bold', bold!.bytes, '700');
    expectSameDrawing(KERNED, 'Inter whole', 'Inter regular', [400]);
    expectCloseDrawing('Bold Toy', 'Inter whole', 'Inter bold', 700);
    // Bold is really bold, and each font holds the characters of its own weight only.
    const heavy = draw('Bold Toy', 'Inter bold', 700, 44);
    expect(ink(heavy.pixels)).toBeGreaterThan(
      ink(draw('Bold Toy', 'Inter whole', 400, 44).pixels) * 1.2,
    );
    expect(draw('AV', 'Inter bold', 700, 44).width).not.toBe(
      draw('AV', 'Inter whole', 700, 44).width,
    );
  });

  test('leaves a variable font variable for text that sets the axes itself', async () => {
    const whole = await file(interUrl);
    const [fonts] = await subsetFonts([
      request(whole, { 400: KERNED, 650: KERNED }, { instances: false }),
    ]);
    const [cut] = fonts ?? [];
    expect(fonts?.map((font) => font.weight)).toEqual([undefined]);
    expect(cut!.bytes.byteLength).toBeLessThan(whole.byteLength / 2);
    await register('Inter whole', whole, '100 900');
    await register('Inter cut', cut!.bytes, '100 900');
    // Its axis untouched, it is drawn as the whole font is, anywhere on the axis.
    expectSameDrawing(KERNED, 'Inter whole', 'Inter cut', [400, 650, 700]);
  });

  test('makes static fonts of the faces of one group together or not at all', async () => {
    const inter = await file(interUrl);
    const alef = await file(alefUrl);
    // Alef has no weight axis, so Inter, in the same group, keeps its own.
    const cut = await subsetFonts([
      request(inter, { 400: 'ab', 700: 'cd' }, { group: 'mixed' }),
      request(alef, { 400: 'ab' }, { group: 'mixed' }),
    ]);
    expect(cut.map((fonts) => fonts?.map((font) => font.weight))).toEqual([
      [undefined],
      [undefined],
    ]);
    expect(cut.every((fonts) => fonts?.every((font) => isWoff2(font.bytes)))).toBe(true);
  });

  test('keeps the hinting of a static font', async () => {
    const whole = await file(alefUrl);
    const [fonts] = await subsetFonts([request(whole, { 400: KERNED })]);
    const [cut] = fonts ?? [];
    expect(cut?.weight).toBeUndefined();
    expect(cut?.bytes.byteLength).toBeLessThan(whole.byteLength / 2);
    await register('Alef whole', whole, '400');
    await register('Alef cut', cut!.bytes, '400');
    expectSameDrawing(KERNED, 'Alef whole', 'Alef cut', [400]);
  });

  test('gives up on a file it cannot read', async () => {
    const text = new TextEncoder().encode('This is not a font file at all.');
    const woff = await file(alefWoffUrl);
    const cut = await subsetFonts([request(text, { 400: 'ab' }), request(woff, { 400: 'ab' })]);
    expect(cut).toEqual([undefined, undefined]);
  });
});

describe('embedFonts', () => {
  test('embeds the faces the slides are drawn with, cut down to their text', async () => {
    add(`<style>
      ${rule('T Frank', frankUrl, `font-weight: 300 900; unicode-range: ${HEBREW};`)}
      ${rule('T Frank::hebrew', frankUrl, `font-weight: 300 900; unicode-range: ${HEBREW_ONLY};`)}
      ${rule('T Inter', interUrl, `font-weight: 100 900; unicode-range: ${LATIN};`)}
      ${rule('T Alef', alefUrl, `unicode-range: ${LATIN};`)}
    </style>`);
    const slide = (name: string) =>
      `<div style='font-family: "${name} Frank::hebrew", "${name} Inter", "${name} Frank", monospace'>
        <p><span id="${name}">${SHALOM} ${KERNED}</span></p><p style="font-weight: 700">Bold</p>
      </div>`;
    const host = add(slide('T'));
    const { css, fonts, warnings } = await embedFonts(host);

    expect(warnings).toEqual([]);
    // Not the whole Hebrew family, which the Hebrew-only face stands in front of, and not Alef,
    // which no text names: the page never loaded them.
    expect(fonts.map((font) => font.family)).toEqual(['T Frank::hebrew', 'T Inter']);
    // Both are variable fonts in the page, and static ones in the file: Hebrew is drawn at the
    // regular weight only, Latin at two, so Inter is two fonts.
    expect(fonts.map((font) => font.weight)).toEqual(['400', '400, 700']);
    expect(fonts[0]?.characters).toBe(4);
    for (const font of fonts) {
      expect(font.subset).toBe(true);
      expect(font.bytes).toBeLessThan(font.originalBytes / 4);
    }
    expect(css).not.toMatch(/https?:|blob:/);
    expect(css.match(/@font-face/g)).toHaveLength(3);
    expect(
      css.match(/font-family: "T Inter"; font-style: normal; font-weight: (400|700);/g),
    ).toEqual([
      'font-family: "T Inter"; font-style: normal; font-weight: 400;',
      'font-family: "T Inter"; font-style: normal; font-weight: 700;',
    ]);
    expect(css).toContain('font-display: block; src: url("data:font/woff2;base64,');
    expect(css).toContain('unicode-range: U+590-5FF, U+20AA, U+FB1D-FB4F;');

    // The rules as an exported file has them, under other names: the same text, the same width.
    add(`<style>${css.replaceAll('"T ', '"Cut ')}</style>`);
    add(slide('Cut'));
    await document.fonts.ready;
    const width = (id: string) => document.getElementById(id)!.getBoundingClientRect().width;
    expect(loadedFaces('Cut Frank::hebrew')).toEqual(['normal 400']);
    expect(loadedFaces('Cut Inter')).toEqual(['normal 400', 'normal 700']);
    expect(width('Cut')).toBe(width('T'));
  });

  test('leaves the fonts of the deck to the slides that register them', async () => {
    // A copy of a slide elsewhere on the page registers the same asset.
    add(
      `<style data-slidr-fonts>${rule('T Asset', alefUrl)}</style><p style='font-family: "T Asset"'>ab</p>`,
    );
    const host = add(
      `<style data-slidr-fonts>${rule('T Asset', alefUrl)}</style><p style='font-family: "T Asset"'>ab</p>`,
    );
    await document.fonts.ready;
    expect(loadedFaces('T Asset')).not.toEqual([]);
    expect(await embedFonts(host)).toEqual({ css: '', fonts: [], warnings: [] });
  });

  test('covers the text that CSS adds and changes', async () => {
    add(`<style>
      ${rule('T Inter', interUrl, 'font-weight: 100 900;')}
      .label::before { content: "Qz: "; }
      .label { text-transform: uppercase; }
      .cut { width: 40px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    </style>`);
    const host = add(`<div style='font-family: "T Inter"'>
      <p class="label">ab</p><p class="cut">mmmmmmmm</p><ol><li>w</li></ol>
      <svg width="100" height="20"><text y="15">x</text></svg>
    </div>`);
    const { css, fonts } = await embedFonts(host);
    expect(fonts.map((font) => font.family)).toEqual(['T Inter']);
    const cut = css.match(/base64,([^"]+)"/)?.[1] ?? '';
    await register(
      'Inter text',
      Uint8Array.from(atob(cut), (c) => c.charCodeAt(0)),
      '100 900',
    );
    await register('Inter whole', await file(interUrl), '100 900');
    // The font lacks none of these: a missing glyph would be drawn in the monospace font instead.
    const ellipsis = chars(0x2026);
    for (const text of ['Qz: ', 'AB', 'ab', ellipsis, '1234567890. ', 'wxm']) {
      expect(draw(text, 'Inter text', 400, 40).width, text).toBe(
        draw(text, 'Inter whole', 400, 40).width,
      );
    }
    // And it holds no more than it was asked for.
    expect(draw('k', 'Inter text', 400, 40).width).not.toBe(
      draw('k', 'Inter whole', 400, 40).width,
    );
  });

  test('takes the faces the browser takes for a weight and a style', async () => {
    const cases = [
      { weight: 400, style: 'normal' },
      { weight: 500, style: 'normal' },
      { weight: 600, style: 'normal' },
      { weight: 200, style: 'normal' },
      { weight: 900, style: 'normal' },
      { weight: 400, style: 'italic' },
      { weight: 800, style: 'italic' },
    ];
    for (const [i, { weight, style }] of cases.entries()) {
      // A family of its own for each case: a face stays loaded once the page has used it.
      const family = `T Weights ${i}`;
      add(`<style>
        ${['300', '400', '700', '750 900'].map((w) => rule(family, alefUrl, `font-weight: ${w};`)).join('\n')}
        ${rule(family, alefUrl, 'font-weight: 400; font-style: italic;')}
      </style>`);
      const host = add(
        `<p style='font-family: "${family}"; font-weight: ${weight}; font-style: ${style}'>ab</p>`,
      );
      await document.fonts.ready;
      const { fonts } = await embedFonts(host);
      const taken = loadedFaces(family);
      expect(taken, `${style} ${weight}`).toHaveLength(1);
      expect(
        fonts.map((font) => `${font.style} ${font.weight}`),
        `${style} ${weight}`,
      ).toEqual(taken);
    }
  });

  test('embeds a face it cannot cut down as it is, and says so', async () => {
    add(`<style>${rule('T Woff', alefWoffUrl)}</style>`);
    const host = add(`<p style='font-family: "T Woff"'>ab</p>`);
    await document.fonts.ready;
    const { css, fonts, warnings } = await embedFonts(host);
    expect(warnings).toEqual([
      {
        code: 'font-whole',
        subject: 'T Woff',
        message: 'Font T Woff went in whole: it could not be cut down to the characters in use',
      },
    ]);
    expect(fonts).toMatchObject([{ family: 'T Woff', subset: false }]);
    expect(fonts[0]?.bytes).toBe(fonts[0]?.originalBytes);
    expect(css).toContain('src: url("data:font/woff;base64,');
    expect(css).toContain('format("woff")');
  });
});
