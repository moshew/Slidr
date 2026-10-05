import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import type { Deck } from '@slidr/model';
import type * as Export from '../src/export/exportDeck';
import { openApp } from './arrange-helpers';
import { addText, para } from './text-helpers';

/*
 * The fonts' part of the settings screen (SPEC 4.2, 5.7): which fonts the app offers and where
 * they come from, and a font file of the user's own, which then is in the font picker, and in
 * the file of a deck that uses it and in what is exported from that deck.
 */

const out = (name: string) =>
  fileURLToPath(new URL(`../test-results/shell/${name}.png`, import.meta.url));
const fixture = (name: string) =>
  fileURLToPath(new URL(`./fixtures/fonts/${name}`, import.meta.url));

const SANS = 'Slidr Fixture Sans';
const IVRIT = 'Slidr Fixture Ivrit';
const THREE = [
  fixture('fixture-sans-regular.woff2'),
  fixture('fixture-sans-bold.ttf'),
  fixture('fixture-ivrit-regular.otf'),
];

const section = (page: Page) => page.getByTestId('settings-fonts');
const source = (page: Page, id: string) => section(page).locator(`[data-font-source="${id}"]`);
const mine = (page: Page) => source(page, 'mine').locator('[data-user-font]');

async function openFonts(page: Page) {
  await page.getByTestId('activity-bar').locator('[data-panel="settings"]').click();
  await expect(section(page)).toBeVisible();
  await section(page).scrollIntoViewIfNeeded();
}

/** Adds font files through the file dialog of the section. */
async function addFonts(page: Page, files: string[]) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('font-add').click();
  await (await chooser).setFiles(files);
  // The button is busy while the files are read.
  await expect(page.getByTestId('font-add')).not.toHaveAttribute('aria-busy', 'true');
}

const deck = (page: Page) =>
  page.evaluate(() => window.slidr!.bus.deck as unknown) as Promise<Deck>;
const fontAssets = async (page: Page) =>
  Object.values((await deck(page)).assets).filter((asset) => asset.kind === 'font');
const undoSteps = (page: Page) => page.evaluate(() => window.slidr!.bus.undoStack.length);

/** A text box on the slide, selected, so row B shows the text tools. */
async function textBox(page: Page, text = 'Hamburgefonstiv שלום') {
  await addText(page, 'e_text', [para(text)]);
  await page.evaluate(() => window.slidr!.selection.getState().selectElements(['e_text']));
  await page.getByTestId('stage-surface').focus();
}

/** Opens the font picker of row B and returns its card. */
async function openPicker(page: Page) {
  await page.getByTestId('top-tools-b').getByRole('button', { name: 'גופן', exact: true }).click();
  const search = page.getByRole('combobox', { name: 'חיפוש גופן' });
  await expect(search).toBeVisible();
  return search;
}

test('the section says where the fonts come from, and how many each source has', async ({
  page,
}) => {
  await openApp(page);
  await openFonts(page);
  const order = await section(page)
    .locator('[data-font-source]')
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-font-source')));
  expect(order).toEqual(['mine', 'deck', 'library', 'system']);
  // Nothing added yet, and a deck that carries no font; the library is the 23 of appendix B.
  await expect(source(page, 'mine')).toHaveAttribute('data-count', '0');
  await expect(source(page, 'mine')).toContainText('עוד לא הוספתם גופן.');
  await expect(source(page, 'deck')).toHaveAttribute('data-count', '0');
  await expect(source(page, 'library')).toHaveAttribute('data-count', '23');

  // A source opens to its fonts, and says what being from there means.
  await source(page, 'library')
    .getByRole('button', { name: /ספריית Slidr/ })
    .click();
  await expect(source(page, 'library')).toContainText('נטמעים בכל קובץ מיוצא');
  await expect(source(page, 'library').getByRole('listitem').first()).toBeVisible();
  await expect(source(page, 'library')).toContainText('Heebo');
  await source(page, 'system')
    .getByRole('button', { name: /במחשב הזה/ })
    .click();
  await expect(source(page, 'system')).toContainText('אינם נטמעים בקובץ מיוצא');
  // One source is open at a time.
  await expect(source(page, 'library').getByRole('listitem')).toHaveCount(0);
});

test('a font file the user adds is listed with what the file says of itself', async ({ page }) => {
  await openApp(page);
  await openFonts(page);
  await addFonts(page, THREE);

  // Two families: one of two files, by weight, and one that has Hebrew.
  await expect(source(page, 'mine')).toHaveAttribute('data-count', '2');
  await expect(mine(page)).toHaveCount(3);
  const listed = await mine(page).evaluateAll((rows) =>
    rows.map((row) => [row.getAttribute('data-user-font'), row.getAttribute('data-weight')]),
  );
  expect(listed).toEqual([
    [IVRIT, '400'],
    [SANS, '400'],
    [SANS, '700'],
  ]);
  await expect(mine(page).nth(1)).toContainText('משקל 400 · fixture-sans-regular.woff2');
  await expect(mine(page).nth(2)).toContainText('משקל 700 · fixture-sans-bold.ttf');
  // The app can draw text in it at once.
  expect(await page.evaluate(() => document.fonts.check('700 20px "Slidr Fixture Sans"'))).toBe(
    false,
  );
  await page.evaluate(() => document.fonts.load('700 20px "Slidr Fixture Sans"'));
  expect(await page.evaluate(() => document.fonts.check('700 20px "Slidr Fixture Sans"'))).toBe(
    true,
  );
});

test('a file that is not a font is turned back by name, and the others are added', async ({
  page,
}) => {
  await openApp(page);
  await openFonts(page);
  await addFonts(page, [fixture('not-a-font.ttf'), fixture('fixture-sans-bold.ttf')]);
  await expect(section(page).getByRole('alert')).toHaveText('לא ניתן לקרוא כגופן: not-a-font.ttf');
  await expect(mine(page)).toHaveCount(1);
  // The next time files are added, the message of the last time is gone.
  await addFonts(page, [fixture('fixture-ivrit-regular.otf')]);
  await expect(section(page).getByRole('alert')).toHaveCount(0);
  await expect(mine(page)).toHaveCount(2);
});

test("the user's fonts are in the font picker, and a deck that uses one carries its files", async ({
  page,
}) => {
  await openApp(page);
  await openFonts(page);
  await addFonts(page, THREE);
  await textBox(page);
  const before = await undoSteps(page);

  const search = await openPicker(page);
  // Under a heading of their own, above the library; a search finds them like any font.
  await expect(page.getByRole('listbox').getByText('הגופנים שלי', { exact: true })).toBeVisible();
  await expect(page.getByRole('option', { name: IVRIT })).toBeVisible();
  await search.fill('fixture');
  const option = page.getByRole('option', { name: SANS });
  await expect(option).toBeVisible();
  await option.click();

  // The text is set in the family, and the deck got both files of it, with what registers them.
  await expect.poll(async () => (await fontAssets(page)).length).toBe(2);
  const carried = await fontAssets(page);
  expect(
    carried.map((asset) => asset.font).sort((a, b) => a!.weight.localeCompare(b!.weight)),
  ).toEqual([
    { family: SANS, weight: '400', style: 'normal' },
    { family: SANS, weight: '700', style: 'normal' },
  ]);
  expect(carried.map((asset) => asset.name).sort()).toEqual([
    'fixture-sans-bold.ttf',
    'fixture-sans-regular.woff2',
  ]);
  const run = (await deck(page)).slides[0]!.elements.find((e) => e.id === 'e_text');
  expect(JSON.stringify(run)).toContain(`"font":"${SANS}"`);
  // One step: undo takes the font of the text and the files back together.
  expect(await undoSteps(page)).toBe(before + 1);
  await page.evaluate(() => window.slidr!.bus.undo());
  expect(await fontAssets(page)).toHaveLength(0);
  await page.evaluate(() => window.slidr!.bus.redo());
  expect(await fontAssets(page)).toHaveLength(2);

  // The settings screen lists the family under the deck now, and the picker does too.
  await expect(source(page, 'deck')).toHaveAttribute('data-count', '1');
  // The other family of the user's was not used, and is not in the deck.
  expect((await fontAssets(page)).some((asset) => asset.font?.family === IVRIT)).toBe(false);
});

test('the exported file has the font inside', async ({ page }) => {
  await openApp(page);
  await openFonts(page);
  await addFonts(page, THREE);
  await textBox(page, 'Hamburgefonstiv');
  await (await openPicker(page)).fill('fixture sans');
  await page.getByRole('option', { name: SANS }).click();
  await expect.poll(async () => (await fontAssets(page)).length).toBe(2);

  const result = await page.evaluate(async (path) => {
    const { exportDeck } = (await import(/* @vite-ignore */ path)) as typeof Export;
    const editor = window.slidr!;
    const file = await exportDeck(editor, editor.bus.deck, {
      range: null,
      animations: true,
      media: 'inside',
    });
    return file.html.match(/@font-face\s*\{[^}]{0,200}/g) ?? [];
  }, '/src/export/exportDeck.ts');
  // Both files of the family are in the file itself, as a deck's own fonts are: whole, each
  // under the weight it has, so the file draws the text where the font is not installed.
  const faces = result.filter((rule) => rule.includes(`font-family: "${SANS}"`));
  expect(faces).toHaveLength(2);
  expect(faces[0]).toMatch(/font-weight: 400;.*src: url\("data:font\/woff2;base64,/);
  expect(faces[1]).toMatch(/font-weight: 700;.*src: url\("data:font\/ttf;base64,/);
});

test('a font is there again after the app starts again, and can be taken out', async ({ page }) => {
  await openApp(page);
  await openFonts(page);
  await addFonts(page, THREE);
  await expect(mine(page)).toHaveCount(3);

  // The window comes back on the panel it had: the settings.
  await page.reload();
  await expect(page.getByTestId('stage-frame')).toBeVisible();
  await expect(section(page)).toBeVisible();
  await expect(mine(page)).toHaveCount(3);

  await mine(page)
    .filter({ hasText: 'fixture-ivrit-regular.otf' })
    .getByRole('button', { name: /הסרת Slidr Fixture Ivrit/ })
    .click();
  await expect(mine(page)).toHaveCount(2);
  await expect(source(page, 'mine')).toHaveAttribute('data-count', '1');
  // The picker has what is left.
  await textBox(page);
  await (await openPicker(page)).fill('fixture');
  await expect(page.getByRole('option', { name: SANS })).toBeVisible();
  await expect(page.getByRole('option', { name: IVRIT })).toHaveCount(0);
});

/* ---------------------------------------------------------------- pictures for the design gate */

for (const theme of ['light', 'dark'] as const) {
  for (const lang of ['he', 'en'] as const) {
    test(`the fonts of the settings screen: ${lang}, ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: 1366, height: 768 });
      await openApp(page, { lang, theme });
      await openFonts(page);
      await addFonts(page, THREE);
      await expect(mine(page)).toHaveCount(3);
      await section(page).scrollIntoViewIfNeeded();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(250);
      await page.screenshot({ path: out(`fonts-settings-${lang}-${theme}`) });
    });
  }
}

test('the picker with fonts of the user: a picture', async ({ page }) => {
  await openApp(page);
  await openFonts(page);
  await addFonts(page, THREE);
  await textBox(page);
  await (await openPicker(page)).fill('fixture');
  await expect(page.getByRole('option', { name: SANS })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
  await page.screenshot({ path: out('fonts-picker-he-light') });
});
