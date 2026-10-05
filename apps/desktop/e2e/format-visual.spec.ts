import { expect, test, type Page } from '@playwright/test';
import { coords } from './editor-text-helpers';
import {
  addSelected,
  box,
  fakeClipboard,
  menu,
  menuItem,
  openSub,
  rect,
  shot,
} from './format-helpers';
import { openApp, row, type OpenOptions } from './objects-helpers';
import { addTable, selectTable } from './table-helpers';
import { addText, edit, para, setSelection } from './text-helpers';

/*
 * Pictures for the design gate of the format track: every new surface, in Hebrew and in English,
 * in the light and the dark scheme. They are written to test-results/format/ to be looked at, and
 * compared with nothing.
 */

test.describe.configure({ timeout: 90_000 });

const LAPTOP = { width: 1366, height: 768 };

/** The words of the UI in the two languages, for the buttons the pictures open. */
const WORDS = {
  he: {
    fold: 'עיצוב הטקסט',
    more: 'עוד עיצוב תווים',
    fill: 'מילוי',
    outline: 'קו מתאר',
    solid: 'רציף',
    weight: 'משקל',
    pasteAs: 'הדבקה מיוחדת',
    pasteText: 'הדבקת טקסט',
    paste: 'הדבקה',
    link: 'קישור',
  },
  en: {
    fold: 'Text formatting',
    more: 'More character formatting',
    fill: 'Fill',
    outline: 'Outline',
    solid: 'Solid',
    weight: 'Weight',
    pasteAs: 'Paste special',
    pasteText: 'Paste text',
    paste: 'Paste',
    link: 'Link',
  },
};

type Look = Required<OpenOptions>;
const HE_LIGHT: Look = { lang: 'he', theme: 'light' };
const HE_DARK: Look = { lang: 'he', theme: 'dark' };
const EN_LIGHT: Look = { lang: 'en', theme: 'light' };
const EN_DARK: Look = { lang: 'en', theme: 'dark' };
const name = (base: string, { lang, theme }: Look) => `${base}-${lang}-${theme}`;

const tool = (page: Page, label: string) =>
  row(page).getByRole('button', { name: label, exact: true });

const texts = (lang: 'he' | 'en') => [
  box('t_title', 160, [
    {
      dir: 'auto',
      align: 'start',
      styleRef: 'title',
      runs: [{ text: lang === 'he' ? 'כותרת השקף' : 'The slide title' }],
    },
  ]),
  box('t_bold', 360, [
    {
      dir: 'auto',
      align: 'start',
      runs: [
        { text: lang === 'he' ? 'שורה מודגשת' : 'A bold line', marks: { weight: 700, size: 48 } },
      ],
    },
  ]),
  box('t_plain', 520, [
    para(lang === 'he' ? 'שורה רגילה, ממורכזת' : 'A plain line, centred', { align: 'center' }),
  ]),
];

const shapes = [
  rect('s_one', 160),
  rect('s_two', 560, {
    fill: { kind: 'solid', color: { token: 'accent' } },
    stroke: { color: { value: '#e5484d' }, width: 2 },
    opacity: 0.5,
  }),
  rect('s_three', 960, {
    geometry: { kind: 'preset', preset: 'ellipse' },
    stroke: { color: { token: 'text' }, width: 8, dash: 'dotted' },
  }),
];

for (const look of [HE_LIGHT, EN_DARK]) {
  test(`several text boxes: the row at 1920 (${look.lang}, ${look.theme})`, async ({ page }) => {
    await openApp(page, look);
    await addSelected(page, texts(look.lang));
    await tool(page, WORDS[look.lang].more).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.screenshot({ path: shot(name('several-text-row', look)) });
  });
}

for (const look of [HE_DARK, EN_LIGHT]) {
  test(`several text boxes: folded at 1366 (${look.lang}, ${look.theme})`, async ({ page }) => {
    await page.setViewportSize(LAPTOP);
    await openApp(page, look);
    await addSelected(page, texts(look.lang));
    await tool(page, WORDS[look.lang].fold).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.screenshot({ path: shot(name('several-text-fold-1366', look)) });
  });
}

test('several shapes: fills that differ (he, light)', async ({ page }) => {
  await openApp(page, HE_LIGHT);
  await addSelected(page, shapes);
  await tool(page, WORDS.he.fill).click();
  await expect(page.getByTestId('fill-editor')).toBeVisible();
  await page.screenshot({ path: shot(name('several-fill-mixed', HE_LIGHT)) });
});

test('several shapes: outlines of three widths and two colours (en, dark)', async ({ page }) => {
  await openApp(page, EN_DARK);
  await addSelected(page, shapes);
  await tool(page, WORDS.en.outline).click();
  const editor = page.getByRole('dialog');
  await page.screenshot({ path: shot(name('several-outline-some', EN_DARK)) });
  await editor.getByRole('radio', { name: WORDS.en.solid }).click();
  await expect(editor.getByText('Mixed')).toBeVisible();
  await page.screenshot({ path: shot(name('several-outline-mixed', EN_DARK)) });
});

for (const look of [HE_LIGHT, EN_DARK]) {
  test(`the weights of a font of two faces (${look.lang}, ${look.theme})`, async ({ page }) => {
    await openApp(page, look);
    await addSelected(page, [
      box('t_weight', 200, [
        {
          dir: 'auto',
          align: 'start',
          runs: [
            {
              text: look.lang === 'he' ? 'משקלים של גופן' : 'The weights of a font',
              marks: { font: 'Alef', weight: 600, size: 72 },
            },
          ],
        },
      ]),
    ]);
    await row(page).getByRole('combobox', { name: WORDS[look.lang].weight }).click();
    await expect(page.getByRole('option').first()).toBeVisible();
    await page.screenshot({ path: shot(name('weights-of-the-font', look)) });
  });
}

for (const look of [HE_LIGHT, EN_DARK]) {
  test(`the menu of text that is being edited (${look.lang}, ${look.theme})`, async ({ page }) => {
    await openApp(page, look);
    await addText(page, 'e_text', [
      para(look.lang === 'he' ? 'טקסט שנערך בשקף' : 'Text that is being edited'),
    ]);
    await edit(page, 'e_text');
    await setSelection(page, 1, 5);
    const at = await coords(page, 3);
    await page.mouse.click(at.x, at.y, { button: 'right' });
    await expect(menu(page)).toBeVisible();
    await openSub(page, WORDS[look.lang].pasteAs, 'text-menu-paste');
    await page.screenshot({ path: shot(name('text-menu', look)) });
  });
}

test('the menu of the slide: paste text (he, dark)', async ({ page }) => {
  await openApp(page, HE_DARK);
  const frame = (await page.getByTestId('stage-frame').boundingBox())!;
  await page.mouse.click(frame.x + frame.width / 2, frame.y + frame.height / 2, {
    button: 'right',
  });
  await expect(menu(page)).toBeVisible();
  await openSub(page, WORDS.he.pasteText, 'stage-menu-paste-text');
  await page.screenshot({ path: shot(name('slide-menu-paste-text', HE_DARK)) });
});

test('nothing to paste (en, light)', async ({ page }) => {
  await openApp(page, EN_LIGHT);
  await addText(page, 'e_text', [para('Text that is being edited')]);
  await edit(page, 'e_text');
  await fakeClipboard(page, null);
  const at = await coords(page, 3);
  await page.mouse.click(at.x, at.y, { button: 'right' });
  await menuItem(page, WORDS.en.paste).click();
  await expect(page.getByRole('dialog', { name: 'Nothing was pasted' })).toBeVisible();
  await page.screenshot({ path: shot(name('paste-nothing', EN_LIGHT)) });
});

test('the link of a selected shape (en, light)', async ({ page }) => {
  await openApp(page, EN_LIGHT);
  await addSelected(page, [
    rect('s_text', 660, {
      frame: { x: 660, y: 400, w: 600, h: 280 },
      content: { paragraphs: [para('Read more', { align: 'center' })] },
    }),
  ]);
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('textbox', { name: 'Address' })).toBeFocused();
  await page.keyboard.type('slidr.dev/docs');
  await page.screenshot({ path: shot(name('link-on-shape', EN_LIGHT)) });
});

test('the link of a table at 1366, where the row has no button for it (he, light)', async ({
  page,
}) => {
  await page.setViewportSize(LAPTOP);
  await openApp(page, HE_LIGHT);
  await addTable(page, {
    dir: 'rtl',
    texts: [
      ['אתר', 'דואר'],
      ['האתר שלנו', 'כתבו לנו'],
    ],
  });
  await selectTable(page);
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('textbox', { name: 'כתובת' })).toBeFocused();
  await page.screenshot({ path: shot(name('link-on-table-1366', HE_LIGHT)) });
});
