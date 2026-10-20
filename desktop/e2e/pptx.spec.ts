import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import type { AssetMeta, Deck } from '@slidr/model';
import { importPptx } from '@slidr/pptx';
import { FHD, openApp } from './runtime-app-helpers';

// PowerPoint in the app (ADR-108): "Export to PowerPoint…" writes a .pptx that reads back as the
// deck, "Import PowerPoint…" opens one made elsewhere as a new document, and a file that is not
// one is refused. In a plain browser the file is a download and the chosen file is read whole;
// in the app they go through the save and open dialogs and the Rust commands.

test.use({ viewport: FHD });

const fixture = fileURLToPath(
  new URL('../../packages/pptx/src/fixtures/foreign.pptx', import.meta.url),
);

/** Screenshots for the design gate, outside Playwright's folder. */
const shot = (name: string) =>
  fileURLToPath(new URL(`../test-results/pptx/${name}.png`, import.meta.url));

/** The texts of a deck's slides, slide by slide. */
const texts = (deck: Deck) =>
  deck.slides.map((slide) =>
    slide.elements.flatMap((element) =>
      element.type === 'text'
        ? element.content.paragraphs.map((p) => p.runs.map((r) => r.text).join(''))
        : [],
    ),
  );

/** Reads a .pptx outside the app, as the tests of the package do. */
async function readBack(bytes: Uint8Array) {
  let n = 0;
  return importPptx(bytes, {
    storeAsset: ({ name, mime, bytes: data }): Promise<AssetMeta> =>
      Promise.resolve({
        id: `a_${++n}`,
        file: `a_${n}.${name.split('.').at(-1)}`,
        mime,
        kind: mime.startsWith('image/') ? 'image' : 'other',
        bytes: data.length,
        origin: 'import',
        name,
      }),
  });
}

async function exportFromMenu(page: Page) {
  await page.getByTestId('file-menu-trigger').click();
  await page.getByTestId('file-export-pptx').click();
  const dialog = page.getByTestId('pptx-export-dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Runs the export of the open dialog and returns the file the browser downloaded. */
async function exported(page: Page) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('pptx-export-run').click(),
  ]);
  const path = test.info().outputPath('exported.pptx');
  await download.saveAs(path);
  return { name: download.suggestedFilename(), path, bytes: new Uint8Array(readFileSync(path)) };
}

/** Imports a file through "Import PowerPoint…". */
async function importFromMenu(page: Page, file: string | { name: string; buffer: Buffer }) {
  await page.getByTestId('file-menu-trigger').click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByTestId('file-import-pptx').click(),
  ]);
  await chooser.setFiles(
    typeof file === 'string'
      ? file
      : { name: file.name, mimeType: 'application/octet-stream', buffer: file.buffer },
  );
}

const deckOf = (page: Page) => page.evaluate(() => window.slidr!.bus.deck);

test('exports the deck to a PowerPoint file that reads back as the deck', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openApp(page, { deck: 'probe' });
  const dialog = await exportFromMenu(page);
  // The choices are the HTML export's: four slides, one of them hidden.
  await expect(dialog.getByRole('group', { name: 'שקפים' })).toBeVisible();
  await expect(page.getByTestId('pptx-export-count')).toHaveText(
    'ייוצאו 3 שקפים. שקף מוסתר אחד לא ייכלל.',
  );
  const file = await exported(page);
  await expect(dialog).toHaveAttribute('data-phase', 'done');
  expect(file.name).toBe('Runtime probe.pptx');
  await expect(page.getByTestId('pptx-export-report')).toContainText('הקובץ ירד למחשב');
  await expect(page.getByTestId('pptx-export-summary')).toContainText('3 שקפים');
  await expect(page.getByTestId('pptx-export-media')).toHaveText('אין בקובץ תמונות או מדיה.');
  await expect(page.getByTestId('pptx-export-fonts')).toBeVisible();
  await page.screenshot({ path: shot('export-report-light-he') });

  // A ZIP package, whose slides are the deck's shown slides with their texts.
  expect([...file.bytes.slice(0, 2)]).toEqual([0x50, 0x4b]);
  const back = await readBack(file.bytes);
  expect(back.deck.slides).toHaveLength(3);
  expect(texts(back.deck)).toEqual([
    ['Probe slide one', 'First', 'Second', 'Third'],
    ['Words come in one by one', 'עברית עם two English words ו-123 באמצע.', 'שלום עולם'],
    ['Last slide'],
  ]);
  // The transitions and the clicks of the animations went with them.
  expect(back.deck.slides[1]!.transition?.type).toBe('push');
  expect(back.deck.slides[0]!.timeline.length).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('exports a range of slides without their animations', async ({ page }) => {
  await openApp(page, { deck: 'probe' });
  const dialog = await exportFromMenu(page);
  await dialog.getByRole('radio', { name: 'טווח' }).click();
  await dialog.getByRole('textbox', { name: 'משקף' }).fill('2');
  await dialog.getByRole('textbox', { name: 'עד שקף' }).fill('2');
  await dialog.getByRole('radio', { name: 'בלי' }).click();
  await expect(page.getByTestId('pptx-export-count')).toHaveText('ייוצא שקף אחד.');
  const back = await readBack((await exported(page)).bytes);
  expect(texts(back.deck)).toEqual([
    ['Words come in one by one', 'עברית עם two English words ו-123 באמצע.', 'שלום עולם'],
  ]);
  expect(back.deck.slides[0]!.transition).toBeUndefined();
  expect(back.deck.slides[0]!.timeline).toEqual([]);
});

test('imports a presentation made elsewhere as a new document, and reports it', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openApp(page);
  await importFromMenu(page, fixture);
  const report = page.getByTestId('pptx-import-report');
  await expect(report).toBeVisible({ timeout: 30_000 });
  // (The file name sits in the sentence between two invisible marks that keep it left to right.)
  await expect(report).toContainText(/6 שקפים יובאו מ-.foreign\.pptx.\./);
  await page.screenshot({ path: shot('import-report-light-he') });
  await report.getByRole('button', { name: 'סגירה' }).first().click();
  await expect(report).toBeHidden();

  const deck = await deckOf(page);
  expect(deck.slides).toHaveLength(6);
  expect(deck.meta.title).toBe('Quarterly review 2026');
  expect(texts(deck)[0]).toContain('Quarterly review 2026');
  // The table, the charts and the picture came in as objects of their own.
  const types = deck.slides.flatMap((slide) => slide.elements.map((element) => element.type));
  expect(types).toEqual(expect.arrayContaining(['table', 'chart', 'image', 'group', 'line']));
  // The picture's file is stored with the document, and the stage shows it.
  const image = deck.slides
    .flatMap((slide) => slide.elements)
    .find((element) => element.type === 'image');
  const assetId = image?.type === 'image' ? image.assetId : undefined;
  expect(assetId && deck.assets[assetId]).toBeTruthy();
  await expect(page.getByTestId('stage-frame')).toBeVisible();
  await page.screenshot({ path: shot('imported-light-he') });
  expect(errors).toEqual([]);
});

test('a deck goes to PowerPoint and comes back with its slides', async ({ page }) => {
  await openApp(page, { deck: 'probe' });
  await exportFromMenu(page);
  const file = await exported(page);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('pptx-export-dialog')).toBeHidden();

  await importFromMenu(page, file.path);
  // Where the open deck has changes nobody saved, the app asks before it puts another in its place.
  const report = page.getByTestId('pptx-import-report');
  const discard = page.getByRole('button', { name: 'בלי לשמור' });
  await expect(report.or(discard).first()).toBeVisible({ timeout: 30_000 });
  if (await discard.isVisible()) await discard.click();
  await expect(report).toBeVisible({ timeout: 30_000 });
  await expect(report).toContainText('3 שקפים יובאו מ-');
  await page.keyboard.press('Escape');

  const deck = await deckOf(page);
  expect(texts(deck)).toEqual([
    ['Probe slide one', 'First', 'Second', 'Third'],
    ['Words come in one by one', 'עברית עם two English words ו-123 באמצע.', 'שלום עולם'],
    ['Last slide'],
  ]);
  // The rotated, half-transparent box is where it was, as it was. PowerPoint has no opacity for
  // a shape: its colours carry it.
  const box = deck.slides[0]!.elements.find(
    (element) => element.type === 'shape' && Math.round(element.rotation) === 15,
  );
  expect(box?.frame).toEqual({ x: 560, y: 300, w: 300, h: 200 });
  const fill = box?.type === 'shape' ? box.fill : undefined;
  expect(fill?.kind === 'solid' && fill.color.alpha).toBeCloseTo(0.5, 2);
});

test('a file that is not a presentation is refused, and the open deck stays', async ({ page }) => {
  await openApp(page, { deck: 'probe' });
  const path = test.info().outputPath('notes.pptx');
  writeFileSync(path, 'Just some words, not a presentation at all.');
  await importFromMenu(page, path);
  const refusal = page.getByRole('dialog', { name: 'המצגת לא יובאה' });
  await expect(refusal).toBeVisible();
  await expect(refusal).toContainText('הקובץ אינו מצגת PowerPoint');
  await refusal.getByRole('button', { name: 'אישור' }).click();
  expect((await deckOf(page)).meta.title).toBe('Runtime probe');
});
