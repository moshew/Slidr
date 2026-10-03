import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { chips, input, openChat, say, turns } from './agent-helpers';

/*
 * Screenshots of the deck tool's chat for the design gate (PLAN 1.2): both themes, both
 * directions and both target resolutions. They are written to test-results/ai/ to be looked
 * at; nothing is compared (the baselines come with WG13's visual regression).
 */

const out = (name: string) =>
  fileURLToPath(new URL(`../test-results/ai/${name}.png`, import.meta.url));

const themes = ['light', 'dark'] as const;
const languages = [
  { lang: 'he', dir: 'rtl' },
  { lang: 'en', dir: 'ltr' },
] as const;
const viewports = [
  { width: 1920, height: 1032 },
  { width: 1366, height: 768 },
] as const;

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
}

for (const theme of themes) {
  for (const { lang, dir } of languages) {
    for (const viewport of viewports) {
      const name = `${theme}-${dir}-${viewport.width}`;

      test(`a deck being built ${name}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await openChat(page, { script: 'deck-build', lang, theme });
        await say(page, 'צור שקף פתיחה לתוכנית העבודה של 2027');
        await say(page, 'הוסף שקף עם המספר המרכזי');
        await say(page, 'מה כדאי להוסיף עכשיו?');
        await settle(page);
        await page.screenshot({ path: out(`build-${name}`) });
      });

      test(`the design check ${name}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await openChat(page, { script: 'gate-stuck', lang, theme });
        const turn = await say(page, 'צור שקף פתיחה');
        await turn.getByTestId('gate-line').first().getByRole('button').first().click();
        await settle(page);
        await page.screenshot({ path: out(`gate-${name}`) });
      });
    }
  }
}

test.describe('chat states', () => {
  test('empty, Hebrew light and English dark', async ({ page }) => {
    await openChat(page, { script: 'deck-build' });
    await settle(page);
    await page.screenshot({ path: out('state-empty-light-rtl') });
    await input(page).fill('צרו מצגת של חמישה שקפים על תוכנית העבודה לשנת 2027');
    await settle(page);
    await page.screenshot({ path: out('state-composing-light-rtl') });
  });

  test('working, with the stop button, English dark', async ({ page }) => {
    await openChat(page, { script: 'slide-chat', speed: 1, lang: 'en', theme: 'dark' });
    await say(page, 'Build an opening slide');
    await input(page).fill('Give me ten ideas for the next slides');
    await input(page).press('Enter');
    await expect(turns(page).nth(1)).toContainText('מפת הדרכים');
    await page.screenshot({ path: out('state-working-dark-ltr') });
    await page.getByTestId('chat-stop').click();
    await expect(turns(page).nth(1)).toHaveAttribute('data-outcome', 'interrupted');
    await settle(page);
    await page.screenshot({ path: out('state-stopped-dark-ltr') });
  });

  test('errors, Hebrew dark at 1366', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await openChat(page, { script: 'errors', theme: 'dark' });
    await say(page, 'עדכן את הכותרת בשקף 4');
    await say(page, 'נסה שוב');
    await say(page, 'ועוד פעם');
    await settle(page);
    await page.screenshot({ path: out('state-errors-dark-rtl-1366') });
  });

  test('a chip unfolded and the undo question, Hebrew light', async ({ page }) => {
    await openChat(page, { script: 'deck-build' });
    await say(page, 'צור שקף פתיחה');
    await chips(page).first().getByRole('button', { name: 'פרטים' }).click();
    await settle(page);
    await page.screenshot({ path: out('state-chip-details-light-rtl') });
    await page.evaluate(() => {
      const { bus } = window.slidr!;
      bus.dispatch({ type: 'slide.update', slideId: bus.deck.slides[1]!.id, patch: { name: 'x' } });
    });
    await page.getByTestId('undo-turn').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await settle(page);
    await page.screenshot({ path: out('state-undo-question-light-rtl') });
  });
});
