import { expect, test, type Page } from '@playwright/test';
import type { TextElement } from '@slidr/model';
import { addSelected, box, elementOf } from './format-helpers';
import { openApp, pageProblems, row, steps } from './objects-helpers';

/*
 * The weight list offers the weights the font of the text has (TXT-03; PLAN WG4 left it undone):
 * a built-in family, a font the deck carries and a font installed on the computer each know
 * their faces. A weight the font lacks is not offered, and text that asks for one shows the
 * weight it is drawn in.
 */

const ID = 't_weight';
const weight = (page: Page) => row(page).getByRole('combobox', { name: 'משקל' });
const options = (page: Page) => page.getByRole('option');

/** A selected text box in a font, with a weight of its own when one is given. */
async function textIn(page: Page, font: string, asked?: number): Promise<void> {
  const marks = asked === undefined ? { font } : { font, weight: asked };
  await addSelected(page, [
    box(ID, 200, [{ dir: 'auto', align: 'start', runs: [{ text: 'Weights משקלים', marks }] }]),
  ]);
}

/** The names the open weight list offers, in order. */
async function offered(page: Page): Promise<string[]> {
  await weight(page).click();
  await expect(options(page).first()).toBeVisible();
  const names = await options(page).allTextContents();
  await page.keyboard.press('Escape');
  return names;
}

const NINE = [
  'דקיק',
  'דק מאוד',
  'דק',
  'רגיל',
  'בינוני',
  'מודגש למחצה',
  'מודגש',
  'מודגש מאוד',
  'שחור',
];

test.afterEach(({ page }) => {
  expect(pageProblems(page)).toEqual([]);
});

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test('a built-in family of two faces is offered two weights; a variable one, all nine', async ({
  page,
}) => {
  await textIn(page, 'Alef');
  await expect(weight(page)).toHaveText('רגיל');
  expect(await offered(page)).toEqual(['רגיל', 'מודגש']);

  // The font is changed to one whose single file draws every weight.
  await page.evaluate((id) => {
    const { bus, selection } = window.slidr!;
    bus.dispatch({
      type: 'text.set',
      slideId: selection.getState().currentSlideId!,
      elementId: id,
      content: {
        paragraphs: [
          { dir: 'auto', align: 'start', runs: [{ text: 'Weights', marks: { font: 'Heebo' } }] },
        ],
      },
    });
  }, ID);
  expect(await offered(page)).toEqual(NINE);
});

test('text that asks for a weight the font lacks shows the weight it is drawn in', async ({
  page,
}) => {
  // Semibold, in a font of regular and bold: the browser draws it bold.
  await textIn(page, 'Alef', 600);
  await expect(weight(page)).toHaveText('מודגש');
  // The text really is drawn in the bold face, and not in a thickened regular one.
  const drawn = await page.evaluate(async () => {
    await document.fonts.ready;
    return Array.from(document.fonts)
      .filter((face) => face.family.replace(/"/g, '') === 'Alef' && face.status === 'loaded')
      .map((face) => face.weight);
  });
  expect(new Set(drawn)).toEqual(new Set(['700']));

  // A weight that is chosen is one the font has, and is written as it is.
  await weight(page).click();
  expect(await steps(page, () => options(page).filter({ hasText: 'רגיל' }).click())).toBe(1);
  const runs = (await elementOf<TextElement>(page, ID)).content.paragraphs[0]?.runs;
  expect(runs).toEqual([{ text: 'Weights משקלים', marks: { font: 'Alef', weight: 400 } }]);
  await expect(weight(page)).toHaveText('רגיל');
});

test('light text in a font of regular and bold shows as regular', async ({ page }) => {
  await textIn(page, 'Alef', 300);
  await expect(weight(page)).toHaveText('רגיל');
});

test('a font installed on the computer is offered the weights the system reports', async ({
  page,
}) => {
  await page.evaluate(
    async ({ path }) => {
      const module = (await import(/* @vite-ignore */ path)) as {
        setSystemFontSource(source: () => Promise<unknown>): Promise<unknown>;
      };
      await module.setSystemFontSource(() =>
        Promise.resolve([
          { family: 'Segoe UI', hebrew: true, symbol: false, weights: [300, 350, 400, 600, 700] },
          // A core that does not tell the weights: every weight is offered, as before.
          { family: 'Tahoma', hebrew: true, symbol: false },
        ]),
      );
    },
    { path: '/src/fonts/systemFonts.ts' },
  );
  await textIn(page, 'Segoe UI', 500);
  // 350 has no name: it is its number. Medium is not a face of the font: it is drawn regular.
  expect(await offered(page)).toEqual(['דק', '350', 'רגיל', 'מודגש למחצה', 'מודגש']);
  await expect(weight(page)).toHaveText('רגיל');

  await page.evaluate((id) => {
    const { bus, selection } = window.slidr!;
    bus.dispatch({
      type: 'text.set',
      slideId: selection.getState().currentSlideId!,
      elementId: id,
      content: {
        paragraphs: [
          { dir: 'auto', align: 'start', runs: [{ text: 'Weights', marks: { font: 'Tahoma' } }] },
        ],
      },
    });
  }, ID);
  expect(await offered(page)).toEqual(NINE);
});

test('a font the deck carries is offered the weights of its files', async ({ page }) => {
  await page.evaluate(() => {
    const { bus } = window.slidr!;
    for (const [id, weightOf] of [
      ['f_light', '300'],
      ['f_black', '900'],
    ] as const) {
      bus.dispatch({
        type: 'asset.add',
        asset: {
          id,
          file: `${id}.woff2`,
          mime: 'font/woff2',
          kind: 'font',
          bytes: 1,
          origin: 'import',
          font: { family: 'Deck Display', weight: weightOf, style: 'normal' },
        },
      });
    }
  });
  await textIn(page, 'Deck Display');
  expect(await offered(page)).toEqual(['דק', 'שחור']);
  // Regular is asked for; the font has light and black, and regular falls to the lighter one.
  await expect(weight(page)).toHaveText('דק');
});

test('a font nothing is known of is offered every weight', async ({ page }) => {
  await textIn(page, 'Nowhere Sans', 500);
  expect(await offered(page)).toEqual(NINE);
  await expect(weight(page)).toHaveText('בינוני');
});
