import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import {
  choose,
  draft,
  input,
  LOGO,
  openApp,
  outline,
  say,
  settle,
  tab,
  turnEnds,
} from './aifinish-helpers';

/*
 * Screenshots of the rest of the AI side for the design gate (PLAN 1.2): the chat's own
 * controls, the outline, and a template made by the agent, in both themes, both directions and
 * both target resolutions. They are written to test-results/ai-finish/ to be looked at; nothing
 * is compared. The scripts of the mock are written in Hebrew, so in the English window the
 * agent's own words, and what it drew, stay Hebrew: what is looked at there is the app's side.
 */

const out = (name: string) =>
  fileURLToPath(new URL(`../test-results/ai-finish/${name}.png`, import.meta.url));

const themes = ['light', 'dark'] as const;
const languages = [
  { lang: 'he', dir: 'rtl' },
  { lang: 'en', dir: 'ltr' },
] as const;
// What the window of a maximized app gives at 1920 × 1080, and the smallest supported screen.
const viewports = [
  { width: 1920, height: 1032 },
  { width: 1366, height: 768 },
] as const;

const words = {
  he: {
    first: 'בנה שקף פתיחה למצגת על תוכנית העבודה',
    second: 'ועכשיו שקף על היעדים של הרבעון',
    subject: 'מצגת על תוכנית העבודה שלנו לשנת 2027',
    template: 'חם ונקי, לחברת קרמיקה קטנה',
  },
  en: {
    first: 'Build an opening slide for a deck about our work plan',
    second: 'And now a slide about the goals of the quarter',
    subject: 'A deck about our work plan for 2027',
    template: 'Warm and clean, for a small ceramics company',
  },
} as const;

/** Fills the form of "Make a template with AI" as a user would, without sending it. */
async function fillTemplateForm(page: Page, lang: 'he' | 'en') {
  await tab(page, 'actions');
  await page.locator('[data-action="template.create"]').click();
  await page.getByTestId('template-description').fill(words[lang].template);
  await page.getByTestId('template-url').fill('https://example.com/');
  await choose(page, () => page.getByTestId('template-logo').click(), LOGO.path);
  await expect(page.locator('[data-testid="template-file"][data-use="logo"]')).toHaveCount(1);
  await page.getByTestId('template-form').scrollIntoViewIfNeeded();
}

for (const theme of themes) {
  for (const { lang, dir } of languages) {
    for (const viewport of viewports) {
      const name = `${theme}-${dir}-${viewport.width}`;

      test(`the chat and its controls ${name}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await openApp(page, { script: 'deck-build', lang, theme });
        // An empty chat: its openings, and a message being written with a file on it.
        await expect(page.getByTestId('chat-suggestions')).toBeVisible();
        await choose(page, () => page.getByTestId('chat-attach').click(), LOGO.path);
        await input(page).fill(words[lang].first);
        await settle(page);
        await page.screenshot({ path: out(`chat-${name}-empty`) });

        // A completed turn, and the picker of the model and the effort open.
        await say(page, words[lang].first);
        await expect(page.getByTestId('turn-usage')).toHaveCount(0);
        await expect(page.getByTestId('chat-cost')).toHaveCount(0);
        await page.getByTestId('model-picker').click();
        await expect(page.getByRole('menu')).toBeVisible();
        await settle(page);
        await page.screenshot({ path: out(`chat-${name}-picker`) });
        await page.keyboard.press('Escape');

        // A second conversation, and the list of both.
        await page.getByTestId('conversation-new').click();
        await say(page, words[lang].second);
        await page.getByTestId('conversations').click();
        await expect(page.getByRole('menu')).toBeVisible();
        await settle(page);
        await page.screenshot({ path: out(`chat-${name}-conversations`) });
      });

      test(`the outline ${name}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await openApp(page, { script: 'outline', lang, theme });
        await say(page, words[lang].subject);
        await expect(outline(page)).toHaveAttribute('data-state', 'open');
        await settle(page);
        await page.screenshot({ path: out(`outline-${name}`) });
      });

      test(`a template made by the agent ${name}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await openApp(page, { script: 'template-create', lang, theme });
        await fillTemplateForm(page, lang);
        await settle(page);
        await page.screenshot({ path: out(`template-${name}-form`) });

        await page.getByTestId('template-create').click();
        await turnEnds(page, 1);
        await expect(draft(page).getByTestId('draft-layout')).toHaveCount(3);
        await draft(page).scrollIntoViewIfNeeded();
        await settle(page);
        await page.screenshot({ path: out(`template-${name}-draft`) });
      });
    }
  }
}

test.describe('states', () => {
  test('an outline that was approved, and one that was turned down', async ({ page }) => {
    await openApp(page, { script: 'outline' });
    await say(page, words.he.subject);
    await outline(page).getByTestId('outline-approve').click();
    await turnEnds(page, 2);
    await expect(outline(page)).toHaveAttribute('data-state', 'answered');
    await settle(page);
    await page.screenshot({ path: out('outline-approved') });

    await page.getByTestId('conversation-new').click();
    await say(page, words.he.subject);
    await outline(page).getByTestId('outline-reject').click();
    await expect(outline(page)).toHaveAttribute('data-state', 'rejected');
    await settle(page);
    await page.screenshot({ path: out('outline-rejected') });
  });

  test('a draft that was saved, tried on the open deck from its card', async ({ page }) => {
    await openApp(page, { script: 'template-create', theme: 'dark' });
    await fillTemplateForm(page, 'he');
    await page.getByTestId('template-create').click();
    await turnEnds(page, 1);
    await draft(page).getByTestId('draft-save').click();
    await expect(draft(page)).toHaveAttribute('data-saved', /^personal_/);
    await settle(page);
    await page.screenshot({ path: out('template-saved') });

    // The saved template is tried on the deck by pointing at its button: the Stage shows it.
    await draft(page).getByTestId('draft-apply').hover();
    await settle(page);
    await page.screenshot({ path: out('template-saved-hovered') });
  });

  test('the draft and the outline in the narrowest panel', async ({ page }) => {
    // The splitter keeps the panel between a quarter and 45% of the window (UI-01).
    await page.setViewportSize({ width: 1366, height: 768 });
    await openApp(page, { script: 'template-create' });
    await page.getByTestId('panel-splitter').focus();
    await page.keyboard.press('Home');
    await fillTemplateForm(page, 'he');
    await settle(page);
    await page.screenshot({ path: out('template-narrowest-1366-form') });
    await page.getByTestId('template-create').click();
    await turnEnds(page, 1);
    await draft(page).scrollIntoViewIfNeeded();
    await settle(page);
    await page.screenshot({ path: out('template-narrowest-1366-draft') });
  });
});
