import { expect, test } from '@playwright/test';
import { openApp } from './arrange-helpers';
import { addText, edit, paragraphs, para, steps } from './text-helpers';

/*
 * The keyboard pass (WG13-T06, UI-06): what ADR-060 listed as having no keyboard path, each
 * reached from the keyboard now.
 */

test('Shift+Enter breaks the line inside a paragraph, as one undo step with the typing', async ({
  page,
}) => {
  await openApp(page);
  await addText(page, 'e_text', [para('שורה ראשונה')]);
  await edit(page, 'e_text');
  const before = await steps(page);
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('שנייה');
  await expect.poll(async () => (await paragraphs(page, 'e_text')).length).toBe(1);
  await expect
    .poll(async () => (await paragraphs(page, 'e_text'))[0]!.runs.map((r) => r.text).join(''))
    .toBe('שורה ראשונה\nשנייה');
  // Still one paragraph on the slide, of two lines.
  const box = page.getByTestId('stage-frame').locator('[data-element-id="e_text"]');
  await expect(box.locator('p')).toHaveCount(1);
  await expect(box.locator('br')).toHaveCount(1);
  await page.keyboard.press('Escape');
  expect(await steps(page)).toBe(before + 1);
  // Enter is still a new paragraph.
  await edit(page, 'e_text');
  await page.keyboard.press('Enter');
  await page.keyboard.type('פסקה');
  await expect.poll(async () => (await paragraphs(page, 'e_text')).length).toBe(2);
});
