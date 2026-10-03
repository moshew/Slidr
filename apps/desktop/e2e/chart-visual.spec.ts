import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import {
  addChart,
  clickCell,
  dataEditor,
  gridCell,
  NAMES,
  openDataEditor,
  popover,
  selectChart,
  tool,
  type Lang,
} from './chart-helpers';
import { openApp, pageProblems, row } from './objects-helpers';

// Screenshots of the chart editor for the design gate (PLAN 1.2): both themes, both directions,
// and 1366x768. They are written to test-results/charts/editor/, outside Playwright's own output
// folder (which every run empties), to be looked at, not compared to a baseline.

const OUT = fileURLToPath(new URL('../test-results/charts/editor/', import.meta.url));
mkdirSync(OUT, { recursive: true });

const shot = (page: Page, name: string) => page.screenshot({ path: `${OUT}${name}.png` });

const HEBREW = {
  categories: ['רבעון 1', 'רבעון 2', 'רבעון 3', 'רבעון 4'],
  series: [
    { name: 'הכנסות', values: [420, 510, 480, 690] },
    { name: 'הוצאות', values: [310, 340, 390, 410] },
    { name: 'רווח', values: [110, 170, 90, 280] },
  ],
};
const ENGLISH = {
  categories: ['Q1 2026', 'Q2 2026', 'Q3 2026', 'Q4 2026'],
  series: [
    { name: 'Revenue', values: [420, 510, 480, 690] },
    { name: 'Costs', values: [310, 340, 390, 410] },
    { name: 'Profit', values: [110, 170, 90, 280] },
  ],
};

const OPTIONS = {
  he: { title: 'תוצאות 2026', axes: { x: { show: true }, y: { show: true, title: 'אלפי ₪' } } },
  en: { title: 'Results 2026', axes: { x: { show: true }, y: { show: true, title: 'USD k' } } },
};

test.afterEach(({ page }) => {
  expect(pageProblems(page)).toEqual([]);
});

/** Opens a popover of row B, takes its picture, and closes it. */
async function shootPopover(page: Page, button: string, name: string): Promise<void> {
  await tool(page, button).click();
  await expect(popover(page)).toBeVisible();
  await shot(page, name);
  await page.keyboard.press('Escape');
  await expect(popover(page)).toBeHidden();
}

for (const lang of ['he', 'en'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`the chart tools, ${lang}, ${theme}`, async ({ page }) => {
      await openApp(page, { lang, theme });
      const names = NAMES[lang];
      const name = `${lang}-${theme}`;

      // The gallery of row A, before there is a chart.
      await page
        .getByTestId('top-tools-a')
        .getByRole('button', { name: names.chart, exact: true })
        .click();
      await expect(page.locator('[data-chart-type="radar"]')).toBeVisible();
      await shot(page, `${name}-insert`);
      await page.keyboard.press('Escape');

      await addChart(page, { data: lang === 'he' ? HEBREW : ENGLISH, options: OPTIONS[lang] });
      await selectChart(page);
      await shot(page, `${name}-selected`);

      await shootPopover(page, names.type, `${name}-type`);
      await shootPopover(page, names.title, `${name}-title`);
      await shootPopover(page, names.legend, `${name}-legend`);
      await shootPopover(page, names.axes, `${name}-axes`);
      await shootPopover(page, names.colors, `${name}-colors`);

      // The colour picker of one series, over the colours popover.
      await tool(page, names.colors).click();
      await popover(page)
        .getByRole('button', { name: lang === 'he' ? 'הוצאות' : 'Costs', exact: true })
        .click();
      await expect(page.getByRole('dialog')).toHaveCount(2);
      await shot(page, `${name}-colors-picker`);
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);

      // The data editor: open, a cell selected, a cell being typed in, and a cell that was given
      // text that is no number.
      await openDataEditor(page, lang);
      await shot(page, `${name}-data`);
      await clickCell(page, 2, 2);
      await shot(page, `${name}-data-cell`);
      await page.keyboard.type('12');
      await expect(gridCell(page, 2, 2).locator('input')).toBeFocused();
      await shot(page, `${name}-data-typing`);
      await page.keyboard.press('Escape');
      await page.keyboard.type('abc');
      await page.keyboard.press('Enter');
      await expect(dataEditor(page).getByRole('status')).toContainText('abc');
      await shot(page, `${name}-data-invalid`);
      await page.keyboard.press('Escape');

      // The data editor stays open next to another tool of the row.
      await tool(page, names.legend).click();
      await expect(popover(page)).toBeVisible();
      await expect(dataEditor(page)).toBeVisible();
      await shot(page, `${name}-data-and-legend`);
      await page.keyboard.press('Escape');
    });
  }

  test(`a pie: the colours of its slices, and no axes, ${lang}`, async ({ page }) => {
    await openApp(page, { lang });
    const names = NAMES[lang];
    const data = lang === 'he' ? HEBREW : ENGLISH;
    await addChart(page, { chartType: 'pie', data: { ...data, series: data.series.slice(0, 1) } });
    await selectChart(page);
    await expect(tool(page, names.axes)).toHaveCount(0);
    await tool(page, names.colors).click();
    await expect(popover(page)).toBeVisible();
    await shot(page, `${lang}-pie-colors`);
  });

  test(`a scatter chart: both axes have a range, ${lang}`, async ({ page }) => {
    await openApp(page, { lang });
    await addChart(page, {
      chartType: 'scatter',
      data: {
        categories: ['1', '2', '3', '4', '5'],
        series: [{ name: lang === 'he' ? 'מדידות' : 'Readings', values: [12, 19, 15, 25, 22] }],
      },
    });
    await selectChart(page);
    await tool(page, NAMES[lang].axes).click();
    await expect(popover(page)).toBeVisible();
    await shot(page, `${lang}-scatter-axes`);
    await page.keyboard.press('Escape');
    await openDataEditor(page, lang);
    await shot(page, `${lang}-scatter-data`);
  });
}

test.describe('at 1366x768', () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  /**
   * Nothing of a box is outside the window. A popover is placed a moment after it is shown, and
   * until then it sits above the window: the check waits for it to come to rest inside.
   */
  async function expectInWindow(page: Page, lang: Lang, what: 'data' | 'popover'): Promise<void> {
    const outside = async () => {
      const box = await (what === 'data' ? dataEditor(page) : popover(page)).boundingBox();
      if (!box) return 'no box';
      const sides = {
        left: -box.x,
        top: -box.y,
        right: box.x + box.width - 1366,
        bottom: box.y + box.height - 768,
      };
      return Object.entries(sides)
        .filter(([, by]) => by > 0)
        .map(([side, by]) => `${side} by ${Math.round(by)}`)
        .join(', ');
    };
    await expect.poll(outside, { message: `${lang} ${what}` }).toBe('');
  }

  for (const lang of ['he', 'en'] as const) {
    for (const theme of ['light', 'dark'] as const) {
      test(`the chart tools fit the row, and the popovers the window, ${lang}, ${theme}`, async ({
        page,
      }) => {
        await openApp(page, { lang, theme });
        const names = NAMES[lang];
        const name = `${lang}-${theme}-1366`;

        await page
          .getByTestId('top-tools-a')
          .getByRole('button', { name: names.chart, exact: true })
          .click();
        await expect(page.locator('[data-chart-type="radar"]')).toBeVisible();
        await shot(page, `${name}-insert`);
        await page.keyboard.press('Escape');

        await addChart(page, { data: lang === 'he' ? HEBREW : ENGLISH, options: OPTIONS[lang] });
        await selectChart(page);
        await shot(page, `${name}-selected`);

        // Nothing of row B is cut off: its last control ends inside the row.
        const toolbar = await row(page).boundingBox();
        const boxes = await row(page)
          .locator('button')
          .evaluateAll((buttons) =>
            buttons.map((button) => {
              const box = button.getBoundingClientRect();
              return { left: box.left, right: box.right };
            }),
          );
        expect(boxes.length).toBeGreaterThan(8);
        for (const box of boxes) {
          expect(box.left).toBeGreaterThanOrEqual(toolbar!.x - 0.5);
          expect(box.right).toBeLessThanOrEqual(toolbar!.x + toolbar!.width + 0.5);
        }

        const popovers = {
          type: names.type,
          title: names.title,
          legend: names.legend,
          axes: names.axes,
          colors: names.colors,
        };
        for (const [key, button] of Object.entries(popovers)) {
          await tool(page, button).click();
          await expect(popover(page)).toBeVisible();
          await expectInWindow(page, lang, 'popover');
          await shot(page, `${name}-${key}`);
          await page.keyboard.press('Escape');
          await expect(popover(page)).toBeHidden();
        }

        await openDataEditor(page, lang);
        await expectInWindow(page, lang, 'data');
        await clickCell(page, 1, 1);
        await shot(page, `${name}-data`);
      });
    }

    test(`a wide and long data grid scrolls inside the editor, ${lang}`, async ({ page }) => {
      await openApp(page, { lang });
      const series = Array.from({ length: 9 }, (_, s) => ({
        name: `${lang === 'he' ? 'סדרה' : 'Series'} ${s + 1}`,
        values: Array.from({ length: 16 }, (_, r) => (s + 1) * 100 + r),
      }));
      const categories = Array.from(
        { length: 16 },
        (_, r) => `${lang === 'he' ? 'חודש' : 'Month'} ${r + 1}`,
      );
      await addChart(page, { chartType: 'line', data: { categories, series } });
      await selectChart(page);
      await openDataEditor(page, lang);
      await expectInWindow(page, lang, 'data');
      // The last cell is reached with the keyboard, and scrolls into sight.
      await clickCell(page, 1, 1);
      await page.keyboard.press('End');
      for (let i = 0; i < 15; i++) await page.keyboard.press('ArrowDown');
      await expect(gridCell(page, 16, 9)).toBeFocused();
      await expect(gridCell(page, 16, 9)).toBeInViewport();
      await shot(page, `${lang}-1366-data-large`);
    });
  }
});
