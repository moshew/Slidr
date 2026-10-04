import { expect, test, type Page } from '@playwright/test';
import {
  addShape,
  editor,
  FHD,
  LAPTOP,
  onStage,
  open,
  row,
  shot,
  tool,
} from './editor-text-helpers';
import { addText, edit, para, select, setSelection } from './text-helpers';

/*
 * The P1 text tools for the design gate (DSN-09): row B with the format painter, the text styles,
 * the link tool and the text effects, and each of them open, in both colour schemes, both
 * languages and both layouts of the row. The pictures go to test-results/editor/, outside
 * Playwright's own output; every run also checks that the row holds all of its tools.
 */

test.describe.configure({ timeout: 180_000 });

const ID = 'e_shot';

const WORDS = {
  he: {
    painter: 'מברשת עיצוב',
    more: 'עוד עיצוב תווים',
    link: 'קישור',
    slide: 'שקף',
    effects: 'אפקטים לטקסט',
    gradient: 'מעבר צבע',
    outline: 'קו מתאר',
    shadow: 'צל',
    align: 'יישור',
    shapeText: 'הוספת טקסט לצורה',
  },
  en: {
    painter: 'Format painter',
    more: 'More character formatting',
    link: 'Link',
    slide: 'Slide',
    effects: 'Text effects',
    gradient: 'Gradient',
    outline: 'Outline',
    shadow: 'Shadow',
    align: 'Alignment',
    shapeText: 'Add text to the shape',
  },
} as const;

/** Every tool of the row is inside the row. */
async function expectRowFits(page: Page) {
  const bar = (await row(page).boundingBox())!;
  const children = await row(page).evaluate((el) =>
    Array.from(el.children, (child) => {
      const rect = child.getBoundingClientRect();
      return [rect.left, rect.right];
    }),
  );
  for (const [left, right] of children) {
    expect(left).toBeGreaterThanOrEqual(bar.x);
    expect(right).toBeLessThanOrEqual(bar.x + bar.width);
  }
}

const themes = ['light', 'dark'] as const;
const languages = ['he', 'en'] as const;
const viewports = [FHD, LAPTOP] as const;

for (const theme of themes) {
  for (const lang of languages) {
    for (const viewport of viewports) {
      const name = `${theme}-${lang}-${viewport.width}`;
      test(`the text tools ${name}: the row holds them, and each opens`, async ({ page }) => {
        const words = WORDS[lang];
        const compact = viewport.width < 1500;
        await open(page, { lang, theme, viewport });
        await addText(
          page,
          ID,
          [
            {
              dir: 'auto',
              align: 'center',
              runs: [{ text: 'סיכום Sprint 14', marks: { size: 120, weight: 800 } }],
            },
            para('ראו את האתר שלנו ואת השקף הבא'),
          ],
          { frame: { x: 160, y: 420, w: 1600, h: 360 } },
        );
        await page.evaluate(() =>
          window.slidr!.bus.dispatch({
            type: 'slide.add',
            slide: { id: 's_next', name: 'מפת דרכים', elements: [], timeline: [] },
          }),
        );
        await select(page, ID);
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(250);
        await expectRowFits(page);

        const bar = (await row(page).boundingBox())!;
        const tools = (await page.getByTestId('top-tools-a').boundingBox())!;
        const clip = { x: bar.x, y: tools.y, width: bar.width, height: 470 };
        const picture = (key: string) => page.screenshot({ path: shot(`${key}-${name}`), clip });
        await picture('row');

        // The brush in hand.
        await tool(page, words.painter).click();
        await page.mouse.move(bar.x + bar.width / 2, bar.y + 300);
        await picture('painter');
        await page.keyboard.press('Escape');

        // The text styles: a menu of the row, or rows of the "more" popover.
        if (compact) {
          await tool(page, words.more).click();
          await page.waitForTimeout(200);
          await picture('more');
          await page.keyboard.press('Escape');
          await tool(page, words.align).click();
          await page.waitForTimeout(200);
          await picture('align');
          await page.keyboard.press('Escape');
        } else {
          await row(page).locator('[data-style]').click();
          await page.waitForTimeout(200);
          await picture('style');
          await page.keyboard.press('Escape');
          await tool(page, words.more).click();
          await page.waitForTimeout(200);
          await picture('more');
          await page.keyboard.press('Escape');
        }

        // The text effects, each tab with its effect on.
        await tool(page, words.effects).click();
        await page.getByRole('radio', { name: words.gradient, exact: true }).click();
        await page.waitForTimeout(200);
        await picture('effects-fill');
        await page.getByRole('tab', { name: words.outline, exact: true }).click();
        await page.getByRole('radio', { name: words.outline, exact: true }).click();
        await page.waitForTimeout(200);
        await picture('effects-outline');
        await page.getByRole('tab', { name: words.shadow, exact: true }).click();
        await page.getByRole('radio', { name: words.shadow, exact: true }).click();
        await page.waitForTimeout(200);
        await picture('effects-shadow');
        await page.keyboard.press('Escape');
        await expect(page.getByTestId('stage-surface')).toBeFocused();

        // The link tool, in the editor: an address that is refused, and the list of slides.
        await edit(page, ID);
        // "האתר שלנו" of the second line.
        await setSelection(page, 25, 34);
        await expectRowFits(page);
        await tool(page, words.link).click();
        await page.keyboard.type('javascript:alert(1)');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(200);
        await picture('link-refused');
        await page.getByRole('radio', { name: words.slide, exact: true }).click();
        await page.getByRole('combobox', { name: words.slide }).click();
        await page.waitForTimeout(200);
        await picture('link-slides');
        await page.getByRole('option').last().click();
        await page.getByRole('button', { name: lang === 'he' ? 'החלה' : 'Apply' }).click();
        await expect(editor(page)).toBeFocused();
        await page.waitForTimeout(200);
        await picture('link-set');
        await page.keyboard.press('Escape');

        // A selected shape: its own row, with the button into its text.
        await addShape(page, 'e_shape', { frame: { x: 700, y: 120, w: 520, h: 240 } });
        await select(page, 'e_shape');
        await expectRowFits(page);
        await tool(page, words.shapeText).hover();
        await page.waitForTimeout(700);
        await picture('shape');
        // And its text being typed: the row of text, without the text box's own settings.
        await page.keyboard.type('Go');
        await expect(editor(page)).toBeFocused();
        await expectRowFits(page);
        await picture('shape-text');
        await expect(onStage(page, 'e_shape')).toContainText('Go');
      });
    }
  }
}
