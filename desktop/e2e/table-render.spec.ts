import { expect, test, type Page } from '@playwright/test';
import type { Deck } from '@slidr/model';

/*
 * A table looks the same in the Stage, in the thumbnail and in the capture (RND-01, TBL-04).
 *
 * The slide renderer is one component, drawn at different sizes: the Stage scales it to the
 * window, the Filmstrip to a thumbnail, and the capture window to half size, which Rust then
 * screenshots for the exports and for the agent. This spec measures the table of the reference
 * deck in each of them (the box of every cell and of every line of text, in slide pixels from the
 * corner of the slide) and compares them with the slide at 1:1.
 */

const SLIDE = 's_ref_table';
const TABLE = 'e_tbl';
/** The slide's place in the reference deck. */
const INDEX = 7;

/** Slide pixels. A thumbnail is a tenth of the slide: a hundredth of a screen pixel is 0.1 here. */
const CLOSE = 0.5;
const CLOSE_SMALL = 1.5;

type Box = [x: number, y: number, w: number, h: number];

interface Drawn {
  /** "row,col" in the model; "table" for the whole table, which comes first. */
  cell: string;
  text: string;
  box: Box;
  /** The boxes of the lines of text, one per line of each paragraph. */
  lines: Box[];
}

/** The slide as a renderer drew it somewhere on the page. */
const SLIDE_ROOT = `.slidr-slide[data-slide-id="${SLIDE}"]`;

/**
 * The cells of the table under a slide root, in slide pixels: what the screen shows, divided by
 * the scale the slide is drawn at there.
 */
function measure(page: Page, root: string): Promise<{ scale: number; cells: Drawn[] }> {
  return page.locator(root).evaluate((slide, tableId) => {
    const origin = slide.getBoundingClientRect();
    // The slide is laid out at its own size and scaled by a transform around it.
    const scale = origin.width / (slide as HTMLElement).offsetWidth;
    const box = (rect: DOMRect): [number, number, number, number] => [
      (rect.left - origin.left) / scale,
      (rect.top - origin.top) / scale,
      rect.width / scale,
      rect.height / scale,
    ];
    const table = slide.querySelector(`[data-element-id="${tableId}"]`);
    if (!table) throw new Error(`No table ${tableId} in this slide`);
    const element = table.querySelector('table');
    if (!element) throw new Error('The table is not drawn as a table');
    const whole = { cell: 'table', text: '', box: box(element.getBoundingClientRect()), lines: [] };
    const cells = Array.from(table.querySelectorAll('td'), (td) => ({
      cell: `${td.getAttribute('data-row')},${td.getAttribute('data-col')}`,
      text: td.textContent ?? '',
      box: box(td.getBoundingClientRect()),
      lines: Array.from(td.querySelectorAll('p, li')).flatMap((block) => {
        const range = document.createRange();
        range.selectNodeContents(block);
        return Array.from(range.getClientRects(), box);
      }),
    }));
    return { scale, cells: [whole, ...cells] };
  }, TABLE);
}

/** The table at 1:1, on the page the visual regression suite screenshots. */
async function atFullSize(page: Page): Promise<Drawn[]> {
  await page.goto(`/dev/slides.html?deck=reference&slide=${INDEX}`);
  await page.waitForSelector('html[data-ready="true"]');
  const drawn = await measure(page, SLIDE_ROOT);
  expect(drawn.scale).toBe(1);
  return drawn.cells;
}

function expectSame(actual: Drawn[], expected: Drawn[], close: number, where: string): void {
  expect(
    actual.map((c) => `${c.cell} ${c.text}`),
    where,
  ).toEqual(expected.map((c) => `${c.cell} ${c.text}`));
  const sides = ['left', 'top', 'width', 'height'];
  for (const [i, cell] of actual.entries()) {
    const reference = expected[i]!;
    cell.box.forEach((value, k) =>
      expect(
        Math.abs(value - reference.box[k]!),
        `${where}: ${sides[k]} of cell ${cell.cell}`,
      ).toBeLessThan(close),
    );
    // The same lines of text, in the same places: nothing wrapped differently.
    expect(cell.lines.length, `${where}: lines of cell ${cell.cell}`).toBe(reference.lines.length);
    cell.lines.forEach((line, n) =>
      line.forEach((value, k) =>
        expect(
          Math.abs(value - reference.lines[n]![k]!),
          `${where}: ${sides[k]} of line ${n} of cell ${cell.cell}`,
        ).toBeLessThan(close),
      ),
    );
  }
}

const problems = new WeakMap<Page, string[]>();

test.use({ viewport: { width: 1920, height: 1080 } });

test.beforeEach(({ page }) => {
  const list: string[] = [];
  problems.set(page, list);
  // Uncaught errors only, as in renderer.spec.ts: the dev pages log the media files that the
  // reference deck names and they do not have.
  page.on('pageerror', (error) => list.push(error.message));
});

test.afterEach(({ page }) => {
  expect(problems.get(page)).toEqual([]);
});

test('at 1:1 the table is where the model says, with its text inside its cells', async ({
  page,
}) => {
  const cells = await atFullSize(page);
  // Five rows of three, less the cell that a merged one covers.
  expect(cells.map((c) => c.cell)).toEqual([
    'table',
    ...['0,0', '0,1', '0,2'],
    ...['1,0', '1,1', '1,2'],
    ...['2,0', '2,1', '2,2'],
    ...['3,0', '3,1'],
    ...['4,0', '4,1', '4,2'],
  ]);
  // The frame of the table in the deck: x 60, y 60, 900 by 420. The whole table is the first
  // entry: it is drawn in its frame exactly, with the wide border of its last cell inside it.
  expect(cells[0]).toMatchObject({ cell: 'table', box: [60, 60, 900, 420] });
  // The table reads from the right: its first cell ends at its right edge.
  const first = cells.find((c) => c.cell === '0,0')!;
  expect(first.box[0] + first.box[2]).toBeCloseTo(960, 1);
  // The merged cell is as wide as two columns.
  const merged = cells.find((c) => c.cell === '3,1')!;
  expect(Math.abs(merged.box[2] - 600)).toBeLessThan(1);

  for (const cell of cells.slice(1)) {
    expect(cell.lines.length, `lines of ${cell.cell}`).toBeGreaterThanOrEqual(1);
    for (const [x, y, w, h] of cell.lines) {
      expect(x, `a line of ${cell.cell}`).toBeGreaterThanOrEqual(cell.box[0]);
      expect(x + w).toBeLessThanOrEqual(cell.box[0] + cell.box[2]);
      expect(y).toBeGreaterThanOrEqual(cell.box[1]);
      expect(y + h).toBeLessThanOrEqual(cell.box[1] + cell.box[3]);
    }
  }
});

test('the Stage draws the table as it is at 1:1', async ({ page }) => {
  const reference = await atFullSize(page);
  await page.goto(`/dev/stage.html?deck=reference&slide=${INDEX}`);
  const root = `[data-testid="stage-surface"] ${SLIDE_ROOT}`;
  await page.locator(`${root} [data-element-id="${TABLE}"]`).waitFor();
  await page.evaluate(() => document.fonts.ready);

  const fitted = await measure(page, root);
  // The slide is fitted to the window: smaller than it is.
  expect(fitted.scale).toBeGreaterThan(0.3);
  expect(fitted.scale).toBeLessThan(1);
  expectSame(fitted.cells, reference, CLOSE, 'the Stage, fitted');

  // And zoomed to 100%, where the Stage draws every slide pixel as a screen pixel.
  await page.getByRole('button', { name: '100%' }).click();
  await expect(page.getByTestId('zoom')).toHaveText('100%');
  const full = await measure(page, root);
  expect(full.scale).toBeCloseTo(1, 5);
  expectSame(full.cells, reference, CLOSE, 'the Stage, at 100%');

  // With the table selected, and with a cell of it being typed in: nothing moves.
  const cell = page.locator(`${root} [data-element-id="${TABLE}"] td[data-row="1"][data-col="1"]`);
  await cell.dblclick();
  await expect(cell.locator('[data-text-editor]')).toBeFocused();
  expectSame((await measure(page, root)).cells, reference, CLOSE, 'the Stage, typing in a cell');
});

test('the thumbnail of the slide draws the table as it is at 1:1', async ({ page }) => {
  const reference = await atFullSize(page);
  await page.goto(`/dev/stage.html?deck=reference&slide=${INDEX}`);
  const thumb = `[data-testid="filmstrip"] [role="option"][data-slide-id="${SLIDE}"]`;
  await page.locator(thumb).scrollIntoViewIfNeeded();
  const root = `${thumb} ${SLIDE_ROOT}`;
  await page.locator(`${root} [data-element-id="${TABLE}"]`).waitFor();
  await page.evaluate(() => document.fonts.ready);

  const small = await measure(page, root);
  expect(small.scale).toBeLessThan(0.2);
  expectSame(small.cells, reference, CLOSE_SMALL, 'the thumbnail');
});

test('the capture window draws the table as it is at 1:1', async ({ page }) => {
  const reference = await atFullSize(page);
  // The slide as a deck holds it, to hand to the capture page as Rust does.
  const deck = await page.evaluate(async () => {
    const { referenceDeck } = (await import(
      /* @vite-ignore */ `${location.origin}/@id/@slidr/renderer/fixtures`
    )) as { referenceDeck: () => unknown };
    return referenceDeck();
  });
  const slide = (deck as Deck).slides.find((s) => s.id === SLIDE)!;

  // The capture page talks to Rust: here its calls are recorded, and answered with nothing.
  await page.addInitScript(() => {
    const calls: { cmd: string; args: unknown }[] = [];
    Object.assign(window, {
      captureCalls: calls,
      __TAURI_INTERNALS__: {
        invoke: (cmd: string, args: unknown) => {
          calls.push({ cmd, args });
          return Promise.resolve(null);
        },
        convertFileSrc: (path: string) => path,
        transformCallback: () => 0,
      },
    });
  });
  // The surface Rust screenshots: 960 by 540.
  await page.setViewportSize({ width: 960, height: 540 });
  await page.goto('/capture.html');
  const calls = () =>
    page.evaluate(
      () => (window as unknown as { captureCalls: { cmd: string; args: unknown }[] }).captureCalls,
    );
  await expect.poll(async () => (await calls()).map((c) => c.cmd)).toContain('capture_page_loaded');
  await page.evaluate((request) => window.__slidrCapture!(1, request as never), {
    deck: { ...(deck as Deck), slides: [slide] },
    assetsDir: null,
  });
  // The page says when the slide has settled, and that is when Rust takes the picture.
  await expect
    .poll(async () => (await calls()).find((c) => c.cmd === 'capture_ready')?.args, {
      timeout: 20_000,
    })
    .toMatchObject({ id: 1, error: null });

  const captured = await measure(page, SLIDE_ROOT);
  expect(captured.scale).toBeCloseTo(0.5, 5);
  expectSame(captured.cells, reference, CLOSE, 'the capture window');
  await page.screenshot({ path: 'test-results/table/capture-window.png' });
});
