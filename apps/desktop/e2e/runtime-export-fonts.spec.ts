import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  chromium,
  expect,
  firefox,
  test,
  webkit,
  type Browser,
  type BrowserType,
  type Page,
} from '@playwright/test';
import { differingShare, openDeck, type ShowWindow } from './runtime-helpers';

// The fonts of an exported file in every engine (WG9-T09): Edge, which wrote the file, and
// Playwright's Firefox and WebKit. Two questions.
//
// 1. Is every run of text as heavy as in Edge? Asked of the slide that shows all 23 families of
//    the library, each with a regular and a bold run. Ink is counted, not width: an engine can
//    lay text out at the weight asked for and draw another. Playwright's WebKit for Windows does
//    so with a variable font: its lines are as wide as Edge's, and it draws the default of the
//    weight axis at every weight, with the whole font as fontsource ships it too. That is why
//    the file carries no variable font, and this is the test that holds it to that. Each engine
//    is also asked, with one whole variable font, whether it draws weights at all: an answer for
//    the record, which is not held against the engine.
// 2. In an engine that does draw variable fonts: is the file drawn as the same file with the
//    whole fonts it was cut from? That is what cutting a font down may not change.
//
// Firefox and WebKit are not part of the repository's set-up: `pnpm exec playwright install
// firefox webkit`. An engine that is not installed skips its test. Safari itself is not checked
// here: WebKit on Windows is its engine with another font back end.

const OUT = fileURLToPath(new URL('../../../packages/html-export/test-results/', import.meta.url));
const VARIABLE_FONT = fileURLToPath(
  new URL(
    '../node_modules/@fontsource-variable/montserrat/files/montserrat-latin-wght-normal.woff2',
    import.meta.url,
  ),
);
const VIEW = { width: 1920, height: 1080 };

interface Engine {
  name: string;
  type: BrowserType;
  channel?: string;
  /** Whether the engine has to draw the weights of a whole variable font; undefined: not held. */
  drawsVariableFonts?: boolean;
}

const engines: Engine[] = [
  { name: 'edge', type: chromium, channel: 'msedge', drawsVariableFonts: true },
  { name: 'firefox', type: firefox, drawsVariableFonts: true },
  { name: 'webkit', type: webkit },
];

type Box = [x: number, y: number, width: number, height: number];

interface Line {
  /** The width of the whole line of text. */
  width: number;
  regular: Box;
  bold?: Box;
}

/** One whole variable font, as fontsource ships it, at three weights. */
function weightsPage(): string {
  const font = readFileSync(VARIABLE_FONT).toString('base64');
  const line = (id: string, weight: number) =>
    `<p id="${id}" style="font-weight: ${weight}">Hamburgefonstiv 123</p>`;
  return `<!doctype html><meta charset="utf-8"><style>
@font-face { font-family: "Whole"; font-weight: 100 900; src: url("data:font/woff2;base64,${font}") format("woff2"); }
body { margin: 0; background: #fff; color: #000; }
p { margin: 0; font: 60px "Whole", monospace; white-space: nowrap; }
</style>${line('thin', 100)}${line('regular', 400)}${line('bold', 700)}`;
}

/**
 * How much ink each box of a screenshot holds, in black pixels; the whole picture without boxes.
 * Counted in `page`, which is Edge.
 */
const ink = (page: Page, picture: Buffer, boxes?: Box[]): Promise<number[]> =>
  page.evaluate(
    async ({ base64, boxes }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = new OffscreenCanvas(image.naturalWidth, image.naturalHeight);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('no 2d context');
      context.drawImage(image, 0, 0);
      return (boxes ?? [[0, 0, canvas.width, canvas.height]]).map(([x, y, w, h]) => {
        const { data } = context.getImageData(
          Math.floor(x),
          Math.floor(y),
          Math.ceil(w),
          Math.ceil(h),
        );
        let sum = 0;
        for (let i = 0; i < data.length; i += 4) {
          sum += 255 - ((data[i] ?? 0) + (data[i + 1] ?? 0) + (data[i + 2] ?? 0)) / 3;
        }
        return Math.round(sum / 255);
      });
    },
    { base64: picture.toString('base64'), boxes },
  );

/** The slide that shows every family of the library. */
const fontSlide = (page: Page): Promise<number> =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('section.slide')).findIndex((section) =>
      section.querySelector('[data-element-id^="e_font_"]'),
    ),
  );

/**
 * Where each line of the slide that is shown has its regular and its bold run, in pixels of the
 * stage. Two pixels of room around a run: engines place text a little apart.
 */
const fontLines = (page: Page, slide: number): Promise<Record<string, Line>> =>
  page.evaluate((slide) => {
    const sections = Array.from(document.querySelectorAll('section.slide'));
    const stage = document.querySelector('.slidr-stage')?.getBoundingClientRect();
    // The box around some runs. (Of the runs themselves: a range over a line with Hebrew in it
    // does not measure the same in every engine.)
    const box = (runs: Element[]): [number, number, number, number] => {
      const rects = runs.map((run) => run.getBoundingClientRect());
      const left = Math.min(...rects.map((rect) => rect.left));
      const top = Math.min(...rects.map((rect) => rect.top));
      return [
        left - (stage?.left ?? 0) - 2,
        top - (stage?.top ?? 0) - 2,
        Math.max(...rects.map((rect) => rect.right)) - left + 4,
        Math.max(...rects.map((rect) => rect.bottom)) - top + 4,
      ];
    };
    const lines: Record<string, Line> = {};
    for (const line of Array.from(sections[slide]?.querySelectorAll('[data-slidr-text] p') ?? [])) {
      const spans = Array.from(line.querySelectorAll('span'));
      const family = spans[0]?.textContent?.trim();
      const heavy = spans.find((span) => Number(getComputedStyle(span).fontWeight) >= 600);
      const light = spans.filter((span) => span !== heavy);
      if (!family || !light.length) continue;
      lines[family] = {
        width: spans.reduce((sum, span) => sum + span.getBoundingClientRect().width, 0),
        regular: box(light),
        bold: heavy ? box([heavy]) : undefined,
      };
    }
    return lines;
  }, slide);

async function open(engine: Browser, url: string): Promise<Page> {
  const page = await engine.newPage({ viewport: VIEW });
  await page.goto(url);
  await page.waitForSelector('html.slidr-ready');
  return page;
}

/** A slide at its end, once its fonts are in. */
async function shoot(page: Page, slide: number): Promise<Buffer> {
  await page.bringToFront();
  await page.evaluate(async (index) => {
    (window as ShowWindow).slidr?.setState({ slide: index, step: 999 });
    // A font is asked for when the text that needs it is laid out, not before.
    document.querySelector('.slidr-stage')?.getBoundingClientRect();
    await document.fonts.ready;
  }, slide);
  await page.waitForTimeout(400);
  return page.locator('.slidr-stage').screenshot();
}

/** The ink of the regular and of the bold run of every family, and the width of its line. */
async function weigh(page: Page, counter: Page) {
  const slide = await fontSlide(page);
  // The picture first: the runs are measured as it shows them, with the fonts loaded.
  const picture = await shoot(page, slide);
  const lines = await fontLines(page, slide);
  const families = Object.keys(lines);
  const regular = await ink(
    counter,
    picture,
    families.map((family) => lines[family]?.regular ?? [0, 0, 1, 1]),
  );
  const bold = await ink(
    counter,
    picture,
    families.map((family) => lines[family]?.bold ?? [0, 0, 1, 1]),
  );
  return Object.fromEntries(
    families.map((family, i) => [
      family,
      { width: lines[family]?.width ?? 0, regular: regular[i] ?? 0, bold: bold[i] ?? 0 },
    ]),
  );
}

test.describe('the fonts of the exported file in every engine', () => {
  test.describe.configure({ mode: 'serial' });
  let file: string;
  let wholeFonts: string;
  let slides: number;
  /** The families the file has a bold face of. A bold made up by an engine is its own affair. */
  let withBold: Set<string>;
  /** A page of Edge: it counts pixels, and what it draws is what the others are held to. */
  let edge: Page;
  let inEdge: Awaited<ReturnType<typeof weigh>>;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await openDeck(page, 'reference');
    const files = await page.evaluate(async () => {
      const dev = (window as ShowWindow).slidrDev;
      if (!dev) throw new Error('the dev page is not ready');
      const exported = await dev.exportDeck();
      // The font file behind each `@font-face` rule of the page, by what the rule says. The
      // weight is a range: of a variable font the export writes one weight to a rule.
      const key = (family: string, style: string, range: string) =>
        [family.replace(/"/g, ''), style.trim() || 'normal', range.trim()].join('|');
      const weights = (value: string) => {
        const [from = 400, to = from] = value.split(' ').map((word) => Number(word) || 400);
        return [from, to] as const;
      };
      const files: { key: string; weight: readonly [number, number]; url: string }[] = [];
      for (const sheet of Array.from(document.styleSheets)) {
        for (const rule of Array.from(sheet.cssRules)) {
          if (!(rule instanceof CSSFontFaceRule)) continue;
          const value = (name: string) => rule.style.getPropertyValue(name);
          const url = /url\("([^"]+)"\)/.exec(value('src'))?.[1];
          if (!url) continue;
          files.push({
            key: key(value('font-family'), value('font-style'), value('unicode-range')),
            weight: weights(value('font-weight')),
            url,
          });
        }
      }
      const dataUri = async (url: string) => {
        const blob = await (await fetch(url)).blob();
        return new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            const uri = typeof reader.result === 'string' ? reader.result : '';
            resolve(uri.replace(/^data:[^;]*/, 'data:font/woff2'));
          };
          reader.readAsDataURL(blob);
        });
      };
      // The same rules, every descriptor as the export wrote it, around the whole files.
      const rules = /<style data-slidr-fonts>([\s\S]*?)<\/style>/.exec(exported.html)?.[1] ?? '';
      const whole: string[] = [];
      for (const rule of rules.split('\n')) {
        const family = /font-family: "([^"]+)";/.exec(rule)?.[1] ?? '';
        const style = /font-style: ([^;]+);/.exec(rule)?.[1] ?? '';
        const range = /unicode-range: ([^;]+);/.exec(rule)?.[1] ?? '';
        const [from, to] = weights(/font-weight: ([^;]+);/.exec(rule)?.[1] ?? '');
        const file = files.find(
          (f) => f.key === key(family, style, range) && f.weight[0] <= from && to <= f.weight[1],
        );
        if (!file) throw new Error(`no font file for ${family} ${from}`);
        whole.push(rule.replace(/url\("data:[^"]+"\)/, `url("${await dataUri(file.url)}")`));
      }
      return {
        file: exported.html,
        wholeFonts: exported.html.replace(rules, () => whole.join('\n')),
        slides: exported.slides,
        fonts: exported.fonts.map((font) => ({ family: font.family, weight: font.weight })),
      };
    });
    await page.close();
    // With whole fonts the file is several times heavier: the two are not the same file.
    expect(files.wholeFonts.length).toBeGreaterThan(files.file.length + 500_000);
    mkdirSync(OUT, { recursive: true });
    const write = (name: string, html: string) => {
      writeFileSync(join(OUT, name), html);
      return pathToFileURL(join(OUT, name)).href;
    };
    file = write('reference-deck-fonts.html', files.file);
    wholeFonts = write('reference-deck-whole-fonts.html', files.wholeFonts);
    slides = files.slides;
    withBold = new Set(
      files.fonts
        .filter((font) => font.weight.split(/[ ,]+/).some((weight) => Number(weight) >= 600))
        .map((font) => font.family),
    );

    const context = await browser.newContext({ viewport: VIEW });
    edge = await context.newPage();
    await edge.goto(file);
    await edge.waitForSelector('html.slidr-ready');
    inEdge = await weigh(edge, edge);
    expect(Object.keys(inEdge)).toHaveLength(23);
    // Edge itself tells a bold run from a regular one by its ink.
    expect(withBold.size).toBeGreaterThan(15);
  });

  test.afterAll(async () => {
    await edge?.context().close();
  });

  for (const { name, type, channel, drawsVariableFonts } of engines) {
    test(`${name}: draws every family at its weights`, async () => {
      test.slow();
      let engine: Browser;
      try {
        // The channel of the config names the app's engine: it is not for the other two.
        engine = await type.launch({ channel });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        expect(message).toMatch(/Executable doesn't exist|playwright install/);
        test.skip(true, `${name} is not installed: pnpm exec playwright install ${name}`);
        return;
      }

      // For the record: does this engine draw the weights of a whole variable font?
      const weights = await engine.newPage({ viewport: { width: 1200, height: 400 } });
      await weights.setContent(weightsPage());
      await weights.evaluate(() => document.fonts.ready);
      const inks: number[] = [];
      for (const id of ['thin', 'regular', 'bold']) {
        inks.push(...(await ink(edge, await weights.locator(`#${id}`).screenshot())));
      }
      const [thin = 0, regular = 0, bold = 0] = inks;
      const variable = regular > thin * 1.5 && bold > regular * 1.5;
      test.info().annotations.push({
        type: 'a whole variable font',
        description: `${name} ${engine.version()}: ink at weights 100, 400, 700 = ${inks.join(', ')}: ${
          variable ? 'its weights are drawn' : 'NOT drawn, every weight is the default of the axis'
        }`,
      });
      if (drawsVariableFonts !== undefined) expect(variable).toBe(drawsVariableFonts);

      // 1. Every family of the file, as heavy and as wide as in Edge. Engines differ in how
      // they smooth an edge, by a tenth of the ink; a wrong weight is a third or more.
      const page = await open(engine, file);
      const here = await weigh(page, edge);
      for (const [family, there] of Object.entries(inEdge)) {
        const mine = here[family] ?? { width: 0, regular: 0, bold: 0 };
        expect(mine.width / there.width, `${family}: width`).toBeGreaterThan(0.98);
        expect(mine.width / there.width, `${family}: width`).toBeLessThan(1.02);
        expect(mine.regular / there.regular, `${family}: regular`).toBeGreaterThan(0.8);
        expect(mine.regular / there.regular, `${family}: regular`).toBeLessThan(1.25);
        if (!withBold.has(family)) continue;
        expect(mine.bold / there.bold, `${family}: bold`).toBeGreaterThan(0.8);
        expect(mine.bold / there.bold, `${family}: bold`).toBeLessThan(1.25);
      }

      // 2. Against the file with whole fonts, where the engine draws those right. Static fonts
      // cut from a variable one differ from it by a rounding. (Measured: 0.02% of the pixels.)
      if (variable) {
        const whole = await open(engine, wholeFonts);
        for (let slide = 0; slide < slides; slide++) {
          const a = await shoot(page, slide);
          const b = await shoot(whole, slide);
          expect(await differingShare(edge, a, b), `slide ${slide + 1}`).toBeLessThan(0.0005);
        }
      }
      await engine.close();
    });
  }
});
