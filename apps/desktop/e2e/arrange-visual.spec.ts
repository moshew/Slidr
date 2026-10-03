import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { addBoxes, openApp, select, thumb, slideIds } from './arrange-helpers';

/*
 * Screenshots for the design gate (DSN-09) of arranging and of managing slides: row B for a
 * multiple selection, the Arrange menu, the Layers panel and the slide menu, in both themes, both
 * directions and both target resolutions. Written to test-results/arrange/ to be looked at;
 * nothing is compared.
 */

const out = (name: string) =>
  fileURLToPath(new URL(`../test-results/arrange/${name}.png`, import.meta.url));

const themes = ['light', 'dark'] as const;
const languages = [
  { lang: 'he', dir: 'rtl' },
  { lang: 'en', dir: 'ltr' },
] as const;
const viewports = [
  { width: 1920, height: 1032 },
  { width: 1366, height: 768 },
] as const;

const text = {
  he: { layers: 'שכבות', toSlide: 'יישור לשקף', title: 'תוכנית הרבעון', note: 'הערה' },
  en: { layers: 'Layers', toSlide: 'Align to slide', title: 'Quarterly plan', note: 'Note' },
};

/** A slide with a few things on it: a title, three cards, a group and a locked and a hidden box. */
async function populate(page: Page, lang: 'he' | 'en') {
  await addBoxes(page, [
    {
      id: 'e_back',
      name: lang === 'he' ? 'רקע' : 'Backdrop',
      x: 0,
      y: 760,
      w: 1920,
      h: 320,
      token: 'surface',
    },
    { id: 'e_a', x: 200, y: 360, w: 360, h: 260, token: 'primary', text: text[lang].title },
    { id: 'e_b', x: 760, y: 420, w: 360, h: 200, token: 'secondary' },
    { id: 'e_c', x: 1320, y: 300, w: 360, h: 320, token: 'accent' },
    { id: 'e_g1', x: 200, y: 820, w: 200, h: 140, token: 'muted' },
    { id: 'e_g2', x: 440, y: 820, w: 200, h: 140, token: 'primary', text: text[lang].note },
    { id: 'e_hidden', x: 1500, y: 820, w: 200, h: 140, token: 'accent' },
  ]);
  await page.evaluate(() => {
    const editor = window.slidr!;
    const slideId = editor.selection.getState().currentSlideId!;
    editor.bus.batch([
      { type: 'element.group', slideId, elementIds: ['e_g1', 'e_g2'], groupId: 'e_group' },
      { type: 'element.update', slideId, elementId: 'e_back', patch: { locked: true } },
      { type: 'element.update', slideId, elementId: 'e_hidden', patch: { hidden: true } },
    ]);
  });
}

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
}

for (const theme of themes) {
  for (const { lang, dir } of languages) {
    for (const viewport of viewports) {
      const name = `${theme}-${dir}-${viewport.width}`;

      test(`row B, the Arrange menu and the Layers panel: ${name}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await openApp(page, { lang, theme });
        await populate(page, lang);
        await page.getByRole('button', { name: text[lang].layers, exact: true }).click();
        const editor = (await page.getByTestId('editor').boundingBox())!;

        await select(page, ['e_group']);
        await expect(page.getByTestId('top-tools-b')).toHaveAttribute('data-selection', 'group');
        await settle(page);
        await page.screenshot({
          path: out(`rowb-group-${name}`),
          clip: { x: editor.x, y: editor.y, width: editor.width, height: 92 },
        });

        await select(page, ['e_a', 'e_b', 'e_c']);
        await expect(page.getByTestId('top-tools-b')).toHaveAttribute('data-selection', 'multiple');
        await settle(page);
        await page.screenshot({
          path: out(`rowb-multiple-${name}`),
          clip: { x: editor.x, y: editor.y, width: editor.width, height: 92 },
        });

        const panel = (await page.getByTestId('tool-panel').boundingBox())!;
        await page.screenshot({
          path: out(`layers-${name}`),
          clip: { x: panel.x, y: panel.y, width: panel.width, height: 420 },
        });

        await page.getByTestId('arrange-menu').click();
        await page.getByRole('menuitem', { name: text[lang].toSlide }).hover();
        await expect(page.getByTestId('align-to-slide')).toBeVisible();
        await settle(page);
        await page.screenshot({
          path: out(`arrange-menu-${name}`),
          clip: { x: editor.x, y: editor.y, width: editor.width, height: 660 },
        });
      });

      test(`the slide menu and the hidden mark: ${name}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await openApp(page, { lang, theme });
        await populate(page, lang);
        await page.evaluate(() => {
          const { bus } = window.slidr!;
          const blank = (id: string, hidden?: boolean) => ({
            type: 'slide.add' as const,
            slide: { id, elements: [], timeline: [], ...(hidden ? { hidden } : {}) },
          });
          bus.batch([blank('s_two'), blank('s_three', true), blank('s_four')]);
        });
        const ids = await slideIds(page);
        await thumb(page, ids[1]!).click();
        await thumb(page, ids[2]!).click({ modifiers: ['Control'] });
        await thumb(page, ids[2]!).click({ button: 'right' });
        await expect(page.getByTestId('slide-menu')).toBeVisible();
        await settle(page);
        const editor = (await page.getByTestId('editor').boundingBox())!;
        await page.screenshot({
          path: out(`slide-menu-${name}`),
          clip: { x: editor.x, y: viewport.height - 480, width: editor.width, height: 480 },
        });
      });
    }
  }
}
