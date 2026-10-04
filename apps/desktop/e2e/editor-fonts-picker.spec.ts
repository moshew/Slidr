import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { addText, paragraphs, para, select } from './text-helpers';

/*
 * The fonts of the computer in the font picker (WG2-T02, SPEC appendix B). A plain browser page
 * has no system to ask, so the list of installed fonts is handed to the app the way the Rust
 * command would hand it: `setSystemFontSource`. The names are of fonts that Windows ships, so
 * each is drawn in its own face here too.
 */

const ID = 'e_fonts';

interface SystemFont {
  family: string;
  hebrew: boolean;
  symbol: boolean;
}

const font = (family: string, hebrew = false, symbol = false): SystemFont => ({
  family,
  hebrew,
  symbol,
});

const installed: SystemFont[] = [
  font('Arial', true),
  font('Calibri'),
  font('Comic Sans MS'),
  font('Courier New', true),
  font('David', true),
  font('Georgia'),
  // What the library has too, in another case: one font, listed once, as the library's.
  font('heebo', true),
  font('Inter'),
  font('Segoe UI', true),
  font('Tahoma', true),
  font('Times New Roman', true),
  font('Verdana'),
  font('Wingdings', false, true),
];

async function install(page: Page, fonts: SystemFont[]): Promise<void> {
  await page.evaluate(
    async ({ fonts, path }) => {
      const module = (await import(/* @vite-ignore */ path)) as {
        setSystemFontSource(source: () => Promise<unknown>): Promise<unknown>;
      };
      await module.setSystemFontSource(() => Promise.resolve(fonts));
    },
    { fonts, path: '/src/fonts/systemFonts.ts' },
  );
}

const language = (page: Page, lang: 'he' | 'en') =>
  page.addInitScript((value) => localStorage.setItem('slidr.language', value), lang);

async function start(page: Page, fonts: SystemFont[] | null): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('stage-frame')).toBeVisible();
  await addText(page, ID, [para('שלום עולם'), para('Hello world')]);
  if (fonts) await install(page, fonts);
  await select(page, ID);
}

const button = (page: Page, name = 'גופן') =>
  page.getByTestId('top-tools-b').getByRole('button', { name, exact: true });
const list = (page: Page, name = 'כל הגופנים') => page.getByRole('listbox', { name });
const search = (page: Page, name = 'חיפוש גופן') => page.getByRole('combobox', { name });
const options = (page: Page) => list(page).getByRole('option');

/** Scrolls the list to a line, as the wheel would. Every line has the height of a control. */
async function scrollToLine(page: Page, line: number, name?: string): Promise<void> {
  await list(page, name).evaluate((ul, at) => {
    const viewport = ul.closest('[data-radix-scroll-area-viewport]');
    if (!viewport) throw new Error('the list has no scroll area');
    viewport.scrollTop = at * 32;
  }, line);
}

test('a plain page has no system fonts: the list is the library, with no heading', async ({
  page,
}) => {
  await start(page, null);
  await button(page).click();
  await expect(options(page).first()).toHaveText(/Heebo/);
  await expect(options(page).first()).toHaveAttribute('aria-setsize', '23');
  await expect(list(page).getByText('ספריית Slidr')).toHaveCount(0);
  await expect(list(page).getByText('במחשב הזה')).toHaveCount(0);
});

test('the fonts of the computer are a section after the library, each listed once', async ({
  page,
}) => {
  await start(page, installed);
  await button(page).click();

  // 23 of the library and 11 of the computer: `heebo` and `Inter` are the library's.
  await expect(options(page).first()).toHaveAttribute('aria-setsize', '34');
  await expect(list(page).locator('li').first()).toHaveText('ספריית Slidr');
  await expect(options(page).first()).toHaveText(/Heebo/);

  await scrollToLine(page, 20);
  const heading = list(page).getByText('במחשב הזה');
  await expect(heading).toBeVisible();
  const after = heading.locator('xpath=following-sibling::li[@role="option"]');
  await expect(after.first()).toHaveText(/Arial/);
  await expect(after.first()).toHaveAttribute('aria-posinset', '24');
  await expect(heading.locator('xpath=preceding-sibling::li[1]')).toHaveText('JetBrains Mono');

  await search(page).fill('heebo');
  await expect(options(page)).toHaveCount(1);
  await search(page).fill('inter');
  await expect(options(page)).toHaveCount(1);
});

test('every name is drawn in its own font, but that of a symbol font; Hebrew is marked', async ({
  page,
}) => {
  await start(page, installed);
  await button(page).click();
  const name = (family: string) =>
    options(page).filter({ hasText: family }).locator('span').first();

  await search(page).fill('georgia');
  await expect(name('Georgia')).toHaveCSS('font-family', 'Georgia');
  await expect(options(page).getByRole('img')).toHaveCount(0);

  await search(page).fill('times');
  await expect(name('Times New Roman')).toHaveCSS('font-family', '"Times New Roman"');
  const mark = options(page).getByRole('img', { name: 'תומך בעברית' });
  await expect(mark).toHaveText('אבג');
  await expect(mark).toHaveCSS('font-family', '"Times New Roman"');

  // Wingdings would draw its own name as pictures: it is set in the font of the UI.
  await search(page).fill('wingdings');
  await expect(name('Wingdings')).toHaveCSS('font-family', /^"Inter Variable"/);
});

test('the search looks in every section, and a system font is written by its name', async ({
  page,
}) => {
  await start(page, installed);
  await button(page).click();

  await search(page).fill('man');
  await expect(options(page)).toHaveText([/^Manrope/, /^Times New Roman/]);
  await expect(list(page).locator('li[role="presentation"]')).toHaveText([
    'ספריית Slidr',
    'במחשב הזה',
  ]);

  // Down from the library's match to the computer's, and Enter.
  await search(page).press('ArrowDown');
  await expect(options(page).nth(1)).toHaveAttribute('data-active', 'true');
  await search(page).press('Enter');
  await expect(list(page)).toHaveCount(0);
  await expect(button(page)).toHaveText('Times New Roman');
  const runs = (await paragraphs(page, ID)).flatMap((p) => p.runs);
  expect(runs.map((run) => run.marks)).toEqual([
    { font: 'Times New Roman' },
    { font: 'Times New Roman' },
  ]);
  // The Stage draws it: the renderer finds an installed font by its family, as it finds any.
  await expect(
    page.getByTestId('stage-surface').locator(`[data-element-id="${ID}"] span`).first(),
  ).toHaveCSS('font-family', /^"Times New Roman"/);

  // It is one of the fonts used lately now, the first line of the list.
  await button(page).click();
  await expect(list(page).locator('li').first()).toHaveText('אחרונים');
  await expect(options(page).first()).toHaveText(/^Times New Roman/);
  await expect(options(page).first()).toHaveAttribute('aria-selected', 'true');
});

test('a font the deck carries has a section of its own, before the library', async ({ page }) => {
  await start(page, installed);
  await page.evaluate(() => {
    const editor = window.slidr;
    if (!editor) throw new Error('window.slidr is missing');
    editor.bus.dispatch({
      type: 'asset.add',
      asset: {
        id: 'a_brandfont',
        file: 'a_brandfont.woff2',
        mime: 'font/woff2',
        kind: 'font',
        bytes: 10,
        origin: 'import',
        name: 'brand.woff2',
        font: { family: 'Brand Sans', weight: '400', style: 'normal' },
      },
    });
  });
  await button(page).click();
  await expect(list(page).locator('li').nth(0)).toHaveText('במצגת הזאת');
  await expect(list(page).locator('li').nth(1)).toHaveText('Brand Sans');
  await expect(list(page).locator('li').nth(2)).toHaveText('ספריית Slidr');
});

test('hundreds of families: the list draws the lines in view, and the keys reach every one', async ({
  page,
}) => {
  const many = Array.from({ length: 400 }, (_, i) =>
    font(`Family ${String(i + 1).padStart(3, '0')}`, i % 3 === 0),
  );
  await start(page, many);
  await button(page).click();
  await expect(options(page).first()).toHaveAttribute('aria-setsize', '423');
  // Ten lines in view and four beyond: not four hundred.
  expect(await options(page).count()).toBeLessThan(25);

  // The whole list is there to scroll through: 423 fonts and two headings, 32px each.
  const height = await list(page).evaluate((ul) => ul.scrollHeight);
  expect(height).toBe(425 * 32);

  // Arrows walk past what is drawn; the active font stays in view and is the one Enter takes.
  for (let i = 0; i < 40; i++) await search(page).press('ArrowDown');
  const active = list(page).locator('[data-active]');
  await expect(active).toHaveText(/^Family 018/);
  await expect(active).toBeInViewport({ ratio: 1 });
  await expect(search(page)).toHaveAttribute(
    'aria-activedescendant',
    (await active.getAttribute('id'))!,
  );
  for (let i = 0; i < 40; i++) await search(page).press('ArrowUp');
  await expect(options(page).first()).toHaveText(/Heebo/);
  await expect(list(page).getByText('ספריית Slidr')).toBeInViewport();

  // The wheel to the end: the last family is drawn, the first is not.
  await scrollToLine(page, 425);
  await expect(options(page).last()).toHaveText(/^Family 400/);
  await expect(options(page).last()).toBeInViewport({ ratio: 1 });
  await expect(options(page).filter({ hasText: 'Heebo' })).toHaveCount(0);
  expect(await options(page).count()).toBeLessThan(25);

  // A search starts the list at its top again.
  await search(page).fill('family 39');
  await expect(options(page)).toHaveCount(10);
  await expect(options(page).first()).toBeInViewport({ ratio: 1 });
  await options(page).filter({ hasText: 'Family 395' }).click();
  await expect(button(page)).toHaveText('Family 395');
});

/* Screenshots for the design gate (DSN-09), written to test-results/editor/ to be looked at. */

const out = (name: string) =>
  fileURLToPath(new URL(`../test-results/editor/${name}.png`, import.meta.url));

const looks = [
  { lang: 'he', dir: 'rtl', tool: 'גופן', all: 'כל הגופנים', find: 'חיפוש גופן' },
  { lang: 'en', dir: 'ltr', tool: 'Font', all: 'All fonts', find: 'Search fonts' },
] as const;

for (const theme of ['light', 'dark'] as const) {
  for (const look of looks) {
    for (const viewport of [
      { width: 1920, height: 1032 },
      { width: 1366, height: 768 },
    ]) {
      const name = `${theme}-${look.dir}-${viewport.width}`;

      test(`the picker with the fonts of the computer ${name}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
        await language(page, look.lang);
        await start(page, installed);

        // Where the library ends and the computer's fonts begin.
        await button(page, look.tool).click();
        await scrollToLine(page, 20, look.all);
        await expect(list(page, look.all).getByText('Arial')).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(300);
        await page.screenshot({ path: out(`fonts-picker-${name}`) });

        // A search that finds fonts in both sections.
        await search(page, look.find).fill('ri');
        await expect(list(page, look.all).getByText('Arial')).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(300);
        await page.screenshot({ path: out(`fonts-search-${name}`) });
      });
    }
  }
}
