/**
 * The fonts of an imported file (SPEC 5.7, IMP-12), in a real browser and with real font files:
 * a font the file carries becomes a font asset of the deck, and the app's own fonts are known
 * to a file that names one without carrying it.
 */
import { createImportPage, mountSlide, type ImportPage } from '@slidr/html-import';
import { testHost } from '@slidr/html-import/testing';
import { createDeck, type AssetMeta, type Slide } from '@slidr/model';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
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
    expect(result.slide.elements.map((element) => element.type)).toEqual(['text', 'text']);
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
