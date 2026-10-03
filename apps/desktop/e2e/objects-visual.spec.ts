import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { addElement, importPicture, line, openApp, row, shape } from './objects-helpers';

/*
 * Screenshots of the objects area for the design gate (DSN-09): row B for a shape, a line, an
 * image and no selection, and the open popovers, in both themes, both directions and both target
 * resolutions. Written to test-results/objects/ to be looked at; nothing is compared.
 */

const out = (name: string) =>
  fileURLToPath(new URL(`../test-results/objects/${name}.png`, import.meta.url));

const themes = ['light', 'dark'] as const;
const languages = [
  { lang: 'he', dir: 'rtl' },
  { lang: 'en', dir: 'ltr' },
] as const;
const viewports = [
  { width: 1920, height: 1032 },
  { width: 1366, height: 768 },
] as const;

const names = {
  he: {
    shape: 'צורה',
    line: 'קו',
    fill: 'מילוי',
    color: 'צבע',
    outline: 'קו מתאר',
    lineStyle: 'סגנון הקו',
    shadow: 'צל',
    heads: 'ראשי חץ',
    corners: 'פינות',
    background: 'רקע',
    gradient: 'הדרגתי',
    on: 'צל',
    border: 'מסגרת',
    effects: 'אפקטים',
  },
  en: {
    shape: 'Shape',
    line: 'Line',
    fill: 'Fill',
    color: 'Colour',
    outline: 'Outline',
    lineStyle: 'Line style',
    shadow: 'Shadow',
    heads: 'Line ends',
    corners: 'Corners',
    background: 'Background',
    gradient: 'Gradient',
    on: 'Shadow',
    border: 'Border',
    effects: 'Effects',
  },
} as const;

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
}

/** The top of the window: the two tool rows and whatever popover hangs from them. */
async function shot(page: Page, name: string, height = 620) {
  await settle(page);
  const { width } = page.viewportSize()!;
  await page.screenshot({ path: out(name), clip: { x: 0, y: 0, width, height } });
}

const gradient = {
  kind: 'linear',
  angle: 90,
  stops: [
    { color: { token: 'primary' }, at: 0 },
    { color: { value: '#8e4ec6' }, at: 0.45 },
    { color: { token: 'accent' }, at: 1 },
  ],
};

for (const theme of themes) {
  for (const { lang, dir } of languages) {
    for (const viewport of viewports) {
      const id = `${theme}-${dir}-${viewport.width}`;
      const n = names[lang];

      test.describe(id, () => {
        test.use({ viewport });

        test.beforeEach(async ({ page }) => {
          await openApp(page, { lang, theme });
        });

        test('shape: row B, fill editor with a gradient, outline, shadow', async ({ page }) => {
          await addElement(
            page,
            shape('roundRect', {
              fill: gradient,
              stroke: { color: { token: 'text' }, width: 6, dash: 'dashed' },
              effects: {
                shadow: { x: 0, y: 12, blur: 32, color: { value: '#000000', alpha: 0.3 } },
              },
            }),
          );
          await expect(row(page)).toHaveAttribute('data-selection', 'shape');
          await shot(page, `row-shape-${id}`, 420);

          await row(page).getByRole('button', { name: n.fill, exact: true }).click();
          await expect(page.getByTestId('fill-editor')).toBeVisible();
          await shot(page, `popover-fill-gradient-${id}`);
          await page.keyboard.press('Escape');

          await row(page).getByRole('button', { name: n.outline, exact: true }).click();
          await shot(page, `popover-stroke-${id}`);
          await page.keyboard.press('Escape');

          await row(page).getByRole('button', { name: n.shadow, exact: true }).click();
          await shot(page, `popover-shadow-${id}`);
        });

        test('fill editor: a colour with the picker open, and a picture', async ({ page }) => {
          const assetId = await importPicture(page, 'texture.png', ['#0f9d8a', '#8e4ec6']);
          await addElement(page, shape('ellipse'));
          await row(page).getByRole('button', { name: n.fill, exact: true }).click();
          const editor = page.getByTestId('fill-editor');
          await editor.getByRole('button', { name: n.color, exact: true }).click();
          await expect(page.getByTestId('color-area')).toBeVisible();
          await shot(page, `popover-fill-solid-picker-${id}`, 700);
          await page.keyboard.press('Escape');

          await page.evaluate((id) => {
            const editor = window.slidr!;
            const slideId = editor.selection.getState().currentSlideId ?? '';
            editor.bus.dispatch({
              type: 'element.update',
              slideId,
              elementId: 'e_ellipse',
              patch: { fill: { kind: 'image', assetId: id, fit: 'cover', opacity: 0.8 } },
            });
          }, assetId);
          await expect(editor.getByRole('combobox')).toBeVisible();
          await shot(page, `popover-fill-image-${id}`);
        });

        test('line: row B and its popovers', async ({ page }) => {
          await addElement(page, line({ endHead: 'triangle', curve: 'curved' }));
          await shot(page, `row-line-${id}`, 420);
          await row(page).getByRole('button', { name: n.lineStyle, exact: true }).click();
          await shot(page, `popover-line-stroke-${id}`);
          await page.keyboard.press('Escape');
          await row(page).getByRole('button', { name: n.heads, exact: true }).click();
          await shot(page, `popover-line-heads-${id}`);
        });

        test('image: row B and the border popover', async ({ page }) => {
          const assetId = await importPicture(page, 'harbour.png');
          await addElement(page, {
            id: 'e_picture',
            type: 'image',
            frame: { x: 560, y: 280, w: 640, h: 400 },
            fit: 'cover',
            assetId,
            border: { color: { token: 'accent' }, width: 8 },
            effects: { radius: 24 },
          });
          await expect(row(page)).toHaveAttribute('data-selection', 'image');
          await shot(page, `row-image-${id}`, 420);
          await row(page).getByRole('button', { name: n.border, exact: true }).click();
          await shot(page, `popover-image-border-${id}`);
        });

        test('no selection: the background popover; the shape and line libraries', async ({
          page,
        }) => {
          await shot(page, `row-none-${id}`, 420);
          await row(page).getByRole('button', { name: n.background, exact: true }).click();
          await expect(page.getByTestId('background-editor')).toBeVisible();
          await page
            .getByTestId('background-editor')
            .getByRole('radio', { name: n.gradient })
            .click();
          await shot(page, `popover-background-${id}`, 700);
          await page.keyboard.press('Escape');

          await page.getByTestId('top-tools-a').getByRole('button', { name: n.shape }).click();
          await expect(page.getByTestId('shape-library')).toBeVisible();
          await shot(page, `popover-shape-library-${id}`);
          await page.keyboard.press('Escape');

          await page
            .getByTestId('top-tools-a')
            .getByRole('button', { name: n.line, exact: true })
            .click();
          await expect(page.getByTestId('line-library')).toBeVisible();
          await shot(page, `popover-line-library-${id}`, 420);
        });

        test('text: the compact effects button', async ({ page }) => {
          await addElement(page, {
            id: 'e_text',
            type: 'text',
            frame: { x: 400, y: 300, w: 900, h: 200 },
            autoFit: 'none',
            vAlign: 'top',
            content: {
              paragraphs: [{ dir: 'auto', align: 'start', runs: [{ text: 'שלום Slidr' }] }],
            },
          });
          await row(page).getByRole('button', { name: n.effects, exact: true }).click();
          await shot(page, `popover-effects-${id}`);
        });
      });
    }
  }
}
