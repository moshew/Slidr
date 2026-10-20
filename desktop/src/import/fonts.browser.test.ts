/**
 * The fonts of an imported file (SPEC 5.7, IMP-12), in a real browser and with real font files:
 * a font the file carries becomes a font asset of the deck, and the app's own fonts are known
 * to a file that names one without carrying it.
 */
import { embedFonts } from '@slidr/html-export';
import { createImportPage, mountSlide, type ImportPage } from '@slidr/html-import';
import { testHost } from '@slidr/html-import/testing';
import { createDeck, type AssetMeta, type Slide } from '@slidr/model';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { registerBuiltinFonts } from '../fonts';
import { builtinFaces } from '../fonts/builtinFonts.generated';

beforeAll(async () => {
  await page.viewport(1920, 1080);
});

/** One of the app's font files, as a `data:` URL a document can carry inside itself. */
async function fontData(family: string): Promise<string> {
  const face = builtinFaces.find((f) => f.family === family && f.unicodeRange?.includes('U+0000'));
  if (!face) throw new Error(`no Latin face of ${family} among the built-in fonts`);
  const blob = await (await fetch(face.url)).blob();
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve((reader.result as string).replace(/^data:[^;]*/, 'data:font/woff2'));
    reader.readAsDataURL(blob);
  });
}

const bytes = (html: string) => new TextEncoder().encode(html).buffer;

let open: ImportPage | undefined;

function importPage(html: string, options: Partial<Parameters<typeof createImportPage>[0]> = {}) {
  open = createImportPage({
    source: () => Promise.resolve(bytes(html)),
    host: testHost(),
    ...options,
  });
  return open;
}

afterEach(() => {
  open?.dispose();
  open = undefined;
});

const width = async (imported: ImportPage) =>
  Number(
    await imported.evaluate('return document.getElementById("t").getBoundingClientRect().width'),
  );

describe('the fonts of an imported file', () => {
  it('keeps a font the file carries as a font asset, once, with the characters it is for', async () => {
    const font = await fontData('Alef');
    const html = `<!doctype html><html><head><style>
      @font-face { font-family: "Deck Sans"; font-weight: 700; src: url("${font}") format("woff2"); unicode-range: U+0020-007E; }
      @font-face { font-family: "Elsewhere"; src: url("fonts/elsewhere.woff2") format("woff2"); }
      body { margin: 0; }
      section { width: 1280px; height: 720px; background: #fff; font: 700 60px "Deck Sans", Arial; padding: 40px; box-sizing: border-box; }
    </style></head><body><section><p style="margin:0">Quarterly plan</p></section><section><p style="margin:0">Next steps</p></section></body></html>`;
    const stored: AssetMeta[] = [];
    const host = testHost();
    const imported = importPage(html, {
      host: {
        ...host,
        async storeAsset(data, info) {
          const asset = await host.storeAsset(data, info);
          stored.push(asset);
          return asset;
        },
      },
    });
    await imported.setViewport({ width: 1280, height: 1440 });
    const deck = createDeck({ lang: 'en' });
    const first = await imported.capture({ selector: 'section', deck, takenIds: [] });
    const fonts = first.assets.filter((asset) => asset.kind === 'font');
    expect(fonts).toHaveLength(1);
    expect(fonts[0]).toMatchObject({
      origin: 'import',
      name: 'Deck Sans',
      font: { family: 'Deck Sans', weight: '700', style: 'normal', unicodeRange: 'U+20-7E' },
    });
    // The text is a text element in the file's own font, and looks like the source with it.
    expect(first.guard.faithful).toBe(true);
    expect(first.editability).toBe(1);
    const text = first.slide.elements.find((element) => element.type === 'text');
    expect(text?.type === 'text' && text.content.paragraphs[0]?.runs[0]?.marks?.font).toBe(
      'Deck Sans',
    );
    // The fonts are the deck's, not a rule repeated in every slide.
    expect(first.slide.css).toBeUndefined();
    // The face that points at a file elsewhere never loaded; it is not an asset.
    expect(stored.filter((asset) => asset.kind === 'font')).toHaveLength(1);

    const second = await imported.capture({
      js: 'document.querySelectorAll("section")[1]',
      deck,
      takenIds: first.slide.elements.map((element) => element.id),
    });
    // Stored once for the session, and handed over with every slide that may need it.
    expect(stored.filter((asset) => asset.kind === 'font')).toHaveLength(1);
    expect(second.assets.filter((asset) => asset.kind === 'font')).toEqual(fonts);
    expect(second.guard.faithful).toBe(true);
  });

  it("makes the app's own fonts known to a file that names one without carrying it", async () => {
    const html = `<!doctype html><html><head><style>
      body { margin: 0; font: 60px "Secular One", monospace; }
    </style></head><body><span id="t">Roadmap 2027</span></body></html>`;
    const without = importPage(html);
    const fallback = await width(without);
    without.dispose();

    const face = builtinFaces.find(
      (f) => f.family === 'Secular One' && f.unicodeRange?.includes('U+0000'),
    );
    const imported = importPage(html, {
      appFonts: builtinFaces
        .filter((f) => f.family === 'Secular One')
        .map((f) => ({ ...f, url: new URL(f.url, location.href).href })),
    });
    expect(face).toBeDefined();
    const loaded = JSON.parse(
      await imported.evaluate(
        'await document.fonts.ready; return Array.from(document.fonts).filter((f) => f.status === "loaded").map((f) => f.family)',
      ),
    ) as string[];
    expect(loaded.map((family) => family.replaceAll('"', ''))).toContain('Secular One');
    expect(await width(imported)).not.toBe(fallback);
  });

  it("leaves a family the file declares itself to the file's own font", async () => {
    const font = await fontData('Alef');
    const html = `<!doctype html><html><head><style>
      @font-face { font-family: "Secular One"; src: url("${font}") format("woff2"); }
      body { margin: 0; font: 60px "Secular One", monospace; }
    </style></head><body><span id="t">Roadmap 2027</span></body></html>`;
    const app = builtinFaces
      .filter((f) => f.family === 'Secular One' || f.family === 'Karantina')
      .map((f) => ({ ...f, url: new URL(f.url, location.href).href }));
    const alone = importPage(html);
    const own = await width(alone);
    alone.dispose();

    const imported = importPage(html, { appFonts: app });
    const families = JSON.parse(
      await imported.evaluate(
        'await document.fonts.ready; return Array.from(document.fonts).map((f) => f.family)',
      ),
    ) as string[];
    const names = families.map((family) => family.replaceAll('"', ''));
    // One "Secular One", the file's own; the app's other font is there for the file to use.
    expect(names.filter((family) => family === 'Secular One')).toHaveLength(1);
    expect(names).toContain('Karantina');
    expect(await width(imported)).toBe(own);
  });
});

describe('faces of an imported file that share one font file', () => {
  /** Every text node under a root, shadow trees (where `html` elements are drawn) included. */
  function textNodes(root: Node, out: Text[] = []): Text[] {
    for (const child of Array.from(root.childNodes)) {
      if (child.nodeType === 3) out.push(child as Text);
      else if (child.nodeType === 1) {
        const shadow = (child as Element).shadowRoot;
        if (shadow) textNodes(shadow, out);
        textNodes(child, out);
      }
    }
    return out;
  }

  /**
   * How wide a piece of text comes out when the slide is drawn the way the editor draws it:
   * with the real renderer, from the slide and the assets the capture returned, in px of the
   * source (the slide is 1.5 times the 1280px source).
   */
  async function widthOnSlide(
    host: ReturnType<typeof testHost>,
    slide: Slide,
    assets: AssetMeta[],
    text: string,
  ): Promise<number> {
    const deck = {
      ...createDeck({ lang: 'en' }),
      assets: Object.fromEntries(assets.map((asset) => [asset.id, asset])),
    };
    const mounted = await mountSlide(deck, slide, host, {
      origin: { x: 0, y: 0 },
      viewScale: 1,
      k: 1,
      offX: 0,
      offY: 0,
    });
    try {
      await document.fonts.ready;
      await new Promise((done) => setTimeout(done, 300));
      for (const node of textNodes(mounted.root)) {
        const start = node.data.indexOf(text);
        if (start < 0) continue;
        const range = document.createRange();
        range.setStart(node, start);
        range.setEnd(node, start + text.length);
        return Math.round(range.getBoundingClientRect().width / 1.5);
      }
      return -1;
    } finally {
      mounted.dispose();
    }
  }

  const widthInSource = (imported: ImportPage, id: string) =>
    imported
      .evaluate(
        `await document.fonts.ready; const r = document.createRange(); r.selectNodeContents(document.getElementById(${JSON.stringify(id)})); return Math.round(r.getBoundingClientRect().width)`,
      )
      .then(Number);

  it('keeps both weights of a variable font that is declared once for each', async () => {
    // Heebo is a variable font (wght 100..900): one file serves every weight, and a file that
    // was packed with its fonts repeats the same bytes in the rule of each weight it uses.
    const font = await fontData('Heebo');
    const html = `<!doctype html><html><head><style>
      @font-face { font-family: "Brand Sans"; font-weight: 400; src: url("${font}") format("woff2"); }
      @font-face { font-family: "Brand Sans"; font-weight: 700; src: url("${font}") format("woff2"); }
      body { margin: 0; }
      section { width: 1280px; height: 720px; background: #fff; padding: 60px; box-sizing: border-box; font-family: "Brand Sans", monospace; font-size: 48px; color: #111; }
      p { margin: 0 0 30px; width: 1000px; }
    </style></head><body><section>
      <p id="regular" style="font-weight:400">Regular weight text of the deck, one line</p>
      <p id="bold" style="font-weight:700">Bold weight text of the deck, one line</p>
    </section></body></html>`;
    const host = testHost();
    const imported = importPage(html, { host });
    await imported.setViewport({ width: 1280, height: 720 });
    const source = {
      regular: await widthInSource(imported, 'regular'),
      bold: await widthInSource(imported, 'bold'),
    };
    const result = await imported.capture({
      selector: 'section',
      deck: createDeck({ lang: 'en' }),
      takenIds: [],
    });
    // One file is one asset, which says the first face. The second is a rule of the slide's
    // own stylesheet that names the asset: no font is written into the slide.
    const fonts = result.assets.filter((asset) => asset.kind === 'font');
    expect(fonts.map((asset) => asset.font)).toEqual([
      { family: 'Brand Sans', weight: '400', style: 'normal' },
    ]);
    expect(result.slide.css).toBe(
      `@font-face { font-family: "Brand Sans"; font-weight: 700; font-style: normal; font-display: block; src: url("slidr-asset:${fonts[0]!.id}"); }`,
    );
    expect(result.guard.faithful).toBe(true);
    expect(result.editability).toBe(1);
    // The two lines follow one another: one text box, a paragraph for each (ADR-073).
    expect(result.slide.elements.map((element) => element.type)).toEqual(['text']);
    const [words] = result.slide.elements;
    expect(words?.type === 'text' && words.content.paragraphs).toHaveLength(2);
    // Both lines as wide as the source drew them: each in its own weight of the font. (Drawn
    // with the bold face alone, as before, the regular line came out 19px wider.)
    const drawn = {
      regular: await widthOnSlide(
        host,
        result.slide,
        result.assets,
        'Regular weight text of the deck, one line',
      ),
      bold: await widthOnSlide(
        host,
        result.slide,
        result.assets,
        'Bold weight text of the deck, one line',
      ),
    };
    expect(Math.abs(drawn.regular - source.regular)).toBeLessThanOrEqual(2);
    expect(Math.abs(drawn.bold - source.bold)).toBeLessThanOrEqual(2);
  });

  it('keeps weights in a row as one face with a range, and writes no rule into the slide', async () => {
    // How a variable font is served: a rule for each weight the page uses, all over one file.
    // Weights with no gap between them are what one face with a range of weights says, and a
    // font asset can say that: the deck knows every weight, and no slide carries a rule (in a
    // packed deck of 35 slides and 18 font files that was 36 rules a slide).
    const font = await fontData('Heebo');
    const lines = {
      regular: 'Regular weight text of the deck, one line',
      medium: 'Medium weight text of the deck, one line',
      semi: 'Semibold weight text of the deck, one line',
      // Outside the declared weights: the source draws the nearest, and so does a range.
      black: 'Black weight text of the deck, one line',
    };
    const html = `<!doctype html><html><head><style>
      @font-face { font-family: "Brand Sans"; font-weight: 400; src: url("${font}") format("woff2"); }
      @font-face { font-family: "Brand Sans"; font-weight: 500; src: url("${font}") format("woff2"); }
      @font-face { font-family: "Brand Sans"; font-weight: 600; src: url("${font}") format("woff2"); }
      body { margin: 0; }
      section { width: 1280px; height: 720px; background: #fff; padding: 60px; box-sizing: border-box; font-family: "Brand Sans", monospace; font-size: 48px; color: #111; }
      p { margin: 0 0 30px; width: 1100px; }
    </style></head><body><section>
      <p id="regular" style="font-weight:400">${lines.regular}</p>
      <p id="medium" style="font-weight:500">${lines.medium}</p>
      <p id="semi" style="font-weight:600">${lines.semi}</p>
      <p id="black" style="font-weight:900">${lines.black}</p>
    </section></body></html>`;
    const host = testHost();
    const imported = importPage(html, { host });
    await imported.setViewport({ width: 1280, height: 720 });
    // One line at each declared weight: a weight apart is more than twice what the widths
    // below are allowed to differ by, so a line drawn in its neighbour's weight would show.
    const steps = JSON.parse(
      await imported.evaluate(
        `await document.fonts.ready; const width = (weight) => { const probe = document.createElement('span'); probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font-weight:' + weight; probe.textContent = ${JSON.stringify(lines.regular)}; document.querySelector('section').append(probe); const w = probe.getBoundingClientRect().width; probe.remove(); return w; }; return [width(400), width(500), width(600)]`,
      ),
    ) as number[];
    expect(steps[1]! - steps[0]!).toBeGreaterThan(4);
    expect(steps[2]! - steps[1]!).toBeGreaterThan(4);

    const names = Object.keys(lines) as (keyof typeof lines)[];
    const source = {} as Record<keyof typeof lines, number>;
    for (const name of names) source[name] = await widthInSource(imported, name);
    const result = await imported.capture({
      selector: 'section',
      deck: createDeck({ lang: 'en' }),
      takenIds: [],
    });
    const fonts = result.assets.filter((asset) => asset.kind === 'font');
    expect(fonts.map((asset) => asset.font)).toEqual([
      { family: 'Brand Sans', weight: '400 600', style: 'normal' },
    ]);
    expect(result.slide.css).toBeUndefined();
    expect(result.guard.faithful).toBe(true);
    expect(result.editability).toBe(1);
    expect(result.slide.elements.map((element) => element.type)).toEqual([
      'text',
      'text',
      'text',
      'text',
    ]);
    for (const name of names) {
      const drawn = await widthOnSlide(host, result.slide, result.assets, lines[name]);
      expect(Math.abs(drawn - source[name]), name).toBeLessThanOrEqual(2);
    }
  });

  it('keeps both families when one file is declared under two names', async () => {
    const font = await fontData('Alef');
    const html = `<!doctype html><html><head><style>
      @font-face { font-family: "Deck Sans"; src: url("${font}") format("woff2"); }
      @font-face { font-family: "Deck Head"; src: url("${font}") format("woff2"); }
      body { margin: 0; }
      section { width: 1280px; height: 720px; background: #fff; padding: 60px; box-sizing: border-box; font-size: 48px; color: #111; }
      p { margin: 0 0 30px; width: 1000px; }
    </style></head><body><section>
      <p style="font-family:'Deck Head', monospace">Heading text of the deck</p>
      <p id="body" style="font-family:'Deck Sans', monospace">Body text of the deck, one line</p>
    </section><section><p style="font-family:'Deck Head', monospace">A second slide</p></section></body></html>`;
    const host = testHost();
    const imported = importPage(html, { host });
    await imported.setViewport({ width: 1280, height: 1440 });
    const source = await widthInSource(imported, 'body');
    const deck = createDeck({ lang: 'en' });
    const result = await imported.capture({ selector: 'section', deck, takenIds: [] });
    const fonts = result.assets.filter((asset) => asset.kind === 'font');
    expect(fonts.map((asset) => asset.font?.family)).toEqual(['Deck Sans']);
    expect(result.slide.css).toContain('font-family: "Deck Head"');
    expect(result.slide.css).toContain(`url("slidr-asset:${fonts[0]!.id}")`);
    expect(result.guard.faithful).toBe(true);
    expect(result.editability).toBe(1);
    const drawn = await widthOnSlide(
      host,
      result.slide,
      result.assets,
      'Body text of the deck, one line',
    );
    expect(Math.abs(drawn - source)).toBeLessThanOrEqual(2);
    // In the fallback the line is a fifth wider: this is the file's own font.
    expect(source).toBeLessThan(720);

    // A slide captured later carries the rule too: it is the slide's, wherever it goes.
    const second = await imported.capture({
      js: 'document.querySelectorAll("section")[1]',
      deck,
      takenIds: result.slide.elements.map((element) => element.id),
    });
    expect(second.slide.css).toBe(result.slide.css);
    expect(second.guard.faithful).toBe(true);
    expect(second.editability).toBe(1);
  });
});

describe("a file that carries a cut of one of the app's own fonts", () => {
  const HEADING = 'גידור מאינפלציה';
  const LOOK = 'margin:0;font:700 56px Rubik, sans-serif;color:#111;white-space:pre';

  /** How wide the glyphs of an element of the file are, to a fraction of a pixel. */
  const widthOf = (imported: ImportPage, id: string) =>
    imported
      .evaluate(
        `await document.fonts.ready; const r = document.createRange(); r.selectNodeContents(document.getElementById(${JSON.stringify(id)})); return r.getBoundingClientRect().width`,
      )
      .then(Number);

  it("is drawn with the app's font, and the deck keeps no copy of the cut", async () => {
    // What a deck exported from the app carries (`embedFonts`): Rubik cut down to the letters
    // of the heading, and of the variable font one static font, for the weight in use.
    registerBuiltinFonts();
    const drawn = document.createElement('div');
    drawn.style.cssText = 'position:fixed;left:0;top:0';
    drawn.innerHTML = `<h2 dir="rtl" style="${LOOK}">${HEADING}</h2>`;
    document.body.append(drawn);
    await document.fonts.load('700 56px "Rubik"', HEADING);
    const { css } = await embedFonts(drawn);
    // As wide as the app's own font draws the heading: what the slide will be drawn with.
    const range = document.createRange();
    range.selectNodeContents(drawn.firstElementChild!);
    const own = range.getBoundingClientRect().width;
    drawn.remove();
    expect(css).toMatch(/font-family: "Rubik";[^}]*font-weight: 700;[^}]*url\("data:font\/woff2/);

    const html = `<!doctype html><html lang="he" dir="rtl"><head><style>${css}</style><style>
      body { margin: 0; }
      section { width: 1280px; height: 720px; background: #fff; padding: 60px; box-sizing: border-box; }
    </style></head><body><section><h2 id="t" dir="rtl" style="${LOOK}">${HEADING}</h2></section></body></html>`;

    // The cut by itself, as a browser draws the file: its letters are a font unit wider or
    // narrower here and there, and the heading with them.
    const alone = importPage(html);
    await alone.setViewport({ width: 1280, height: 720 });
    const cut = await widthOf(alone, 't');
    alone.dispose();
    expect(Math.abs(cut - own)).toBeGreaterThan(0.02);

    const stored: AssetMeta[] = [];
    const host = testHost();
    const imported = importPage(html, {
      appFonts: builtinFaces
        .filter((face) => face.family === 'Rubik')
        .map((face) => ({ ...face, url: new URL(face.url, location.href).href })),
      host: {
        ...host,
        async storeAsset(data, info) {
          const asset = await host.storeAsset(data, info);
          stored.push(asset);
          return asset;
        },
      },
    });
    await imported.setViewport({ width: 1280, height: 720 });
    // The file is drawn with the app's Rubik now, from the app's files: no rule of the file's
    // own is left, and its face is the weight the file declared.
    expect(await widthOf(imported, 't')).toBeCloseTo(own, 2);
    const faces = JSON.parse(
      await imported.evaluate(
        'return { rules: Array.from(document.styleSheets).flatMap((sheet) => Array.from(sheet.cssRules)).filter((rule) => rule.constructor.name === "CSSFontFaceRule").length, weights: Array.from(document.fonts).filter((face) => face.family.replaceAll(\'"\', "") === "Rubik").map((face) => face.weight) }',
      ),
    ) as { rules: number; weights: string[] };
    expect(faces.rules).toBe(0);
    expect(new Set(faces.weights)).toEqual(new Set(['700']));

    const result = await imported.capture({
      selector: 'section',
      deck: createDeck({ lang: 'he' }),
      takenIds: [],
    });
    // The heading is a text element that looked like the source at the first try, and the cut
    // is no font of the deck: the app has the whole font.
    expect(result.guard).toMatchObject({ faithful: true, wholeSlide: false, rounds: 1 });
    expect(result.editability).toBe(1);
    expect(result.slide.elements.map((element) => element.type)).toEqual(['text']);
    expect(stored.filter((asset) => asset.kind === 'font')).toEqual([]);
    expect(result.assets.filter((asset) => asset.kind === 'font')).toEqual([]);
  });
});
