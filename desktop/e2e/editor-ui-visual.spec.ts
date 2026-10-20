import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

/*
 * Screenshots for the design gate (DSN-09) of what the editor track added to the design system:
 * the checkbox and the switch in every state, `Field`, the growing text field, the fixed-width
 * font, a segmented control with a fixed direction, a number with a Hebrew unit, and the font
 * picker with its sections. Both themes, both directions and both target resolutions; written to
 * test-results/editor/ to be looked at.
 */

const out = (name: string) =>
  fileURLToPath(new URL(`../test-results/editor/${name}.png`, import.meta.url));

const themes = ['light', 'dark'] as const;
const dirs = ['rtl', 'ltr'] as const;
const viewports = [
  { width: 1920, height: 1032 },
  { width: 1366, height: 768 },
] as const;

/** The cards this track added or changed, by the title each has in the two languages. */
const cards = {
  options: { rtl: 'תיבת סימון ומתג', ltr: 'Checkbox and switch' },
  field: { rtl: 'שדה: תווית מעל פקד', ltr: 'Field: a label over a control' },
  fields: { rtl: 'שדות טקסט', ltr: 'Text fields' },
  segmented: { rtl: 'בורר מקטעים', ltr: 'Segmented control' },
  tokens: { rtl: 'צבעים, טיפוגרפיה ועומק', ltr: 'Colour, type and depth' },
  fontPicker: { rtl: 'בורר גופן', ltr: 'Font picker' },
} as const;

async function open(page: Page, theme: (typeof themes)[number], dir: (typeof dirs)[number]) {
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
  await page.goto(`/dev/gallery.html?theme=${theme}&dir=${dir}`);
  await expect(page.getByTestId(`gallery-${theme}-${dir}`)).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
}

const card = (page: Page, title: string) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: title, exact: true }) });

for (const theme of themes) {
  for (const dir of dirs) {
    for (const viewport of viewports) {
      const name = `${theme}-${dir}-${viewport.width}`;

      test(`the track's components ${name}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await open(page, theme, dir);
        for (const [key, title] of Object.entries(cards)) {
          const section = card(page, title[dir]);
          await section.scrollIntoViewIfNeeded();
          await section.screenshot({ path: out(`ui-${key}-${name}`) });
        }
      });
    }
  }
}
