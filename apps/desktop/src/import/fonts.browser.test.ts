/**
 * The fonts of an imported file (SPEC 5.7, IMP-12), in a real browser and with real font files:
 * a font the file carries becomes a font asset of the deck, and the app's own fonts are known
 * to a file that names one without carrying it.
 */
import { createImportPage, type ImportPage } from '@slidr/html-import';
import { testHost } from '@slidr/html-import/testing';
import { createDeck, type AssetMeta } from '@slidr/model';
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
