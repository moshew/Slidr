import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { card, collectErrors, deck, openTemplates, panel, settle } from './templates-helpers';

/* A personal template that exists (THM-05): another name, and an update in place. */

const out = (name: string) =>
  fileURLToPath(new URL(`../test-results/design/${name}.png`, import.meta.url));

test('a personal template is renamed, and updated in place from the open deck', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openTemplates(page, { defaultTemplate: 'zerem' });
  await panel(page).getByRole('textbox', { name: 'שם התבנית', exact: true }).fill('החברה שלי');
  await panel(page).getByRole('checkbox', { name: 'לקבוע כברירת מחדל למצגות חדשות' }).click();
  await panel(page).getByRole('button', { name: 'שמירה', exact: true }).click();
  await expect(panel(page).getByRole('status')).toContainText('התבנית "החברה שלי" נשמרה');
  const id = (await deck(page)).theme.id;
  const mine = card(page, id);

  // Another name: in the card itself, and the template stays the one it was.
  await mine.getByRole('button', { name: 'שינוי שם התבנית' }).click();
  const field = mine.getByRole('textbox', { name: 'שם התבנית' });
  await expect(field).toHaveValue('החברה שלי');
  await field.fill('המותג החדש');
  await field.press('Enter');
  await expect(mine).toContainText('המותג החדש');
  await expect(panel(page).locator('[data-template^="personal_"]')).toHaveCount(1);
  await expect(mine.getByRole('button', { name: /ברירת המחדל למצגות חדשות/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // Escape leaves the name as it is.
  await mine.getByRole('button', { name: 'שינוי שם התבנית' }).click();
  await mine.getByRole('textbox', { name: 'שם התבנית' }).fill('לא זה');
  await page.keyboard.press('Escape');
  await expect(mine).toContainText('המותג החדש');

  // The look of the deck changes, and the template takes it: asked first, then in place.
  await page.evaluate(() =>
    window.slidr!.bus.dispatch({ type: 'theme.update', patch: { colors: { primary: '#aa0033' } } }),
  );
  await mine.getByRole('button', { name: 'עדכון התבנית לפי המצגת הזו' }).click();
  await expect(page.getByRole('dialog')).toContainText(
    'לעדכן את התבנית "המותג החדש" לפי המצגת הזו?',
  );
  await page.getByRole('button', { name: 'עדכון', exact: true }).click();
  await expect(panel(page).locator('[data-template^="personal_"]')).toHaveCount(1);

  // A new deck opens on the template as it is now.
  await page.getByTestId('title-bar').getByRole('button', { name: 'קובץ' }).click();
  await page.getByRole('menuitem', { name: 'מצגת חדשה' }).click();
  await page.getByRole('button', { name: 'בלי לשמור' }).click();
  await expect.poll(async () => (await deck(page)).theme.colors.primary).toBe('#aa0033');
  const fresh = await deck(page);
  expect(fresh.theme).toMatchObject({ id, name: 'המותג החדש' });
  expect(errors).toEqual([]);
});

for (const { lang, theme, viewport, name } of [
  { lang: 'he', theme: 'light', viewport: { width: 1920, height: 1032 }, name: 'light-rtl-1920' },
  { lang: 'en', theme: 'dark', viewport: { width: 1366, height: 768 }, name: 'dark-ltr-1366' },
] as const) {
  test(`a personal template's card, while it is renamed ${name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openTemplates(page, { lang, theme, defaultTemplate: 'tzuk' });
    const he = lang === 'he';
    await panel(page)
      .getByRole('textbox', { name: he ? 'שם התבנית' : 'Template name', exact: true })
      .fill(he ? 'החברה שלי' : 'My company');
    await panel(page)
      .getByRole('button', { name: he ? 'שמירה' : 'Save', exact: true })
      .click();
    const mine = panel(page).locator('[data-template^="personal_"]');
    await expect(mine).toHaveCount(1);
    await mine.scrollIntoViewIfNeeded();
    await settle(page);
    await page.screenshot({ path: out(`personal-${name}`) });
    await mine
      .getByRole('button', { name: he ? 'שינוי שם התבנית' : 'Rename the template' })
      .click();
    await settle(page);
    await page.screenshot({ path: out(`personal-rename-${name}`) });
  });
}
