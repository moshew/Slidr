import { expect, test } from '@playwright/test';
import {
  agentSettings,
  chat,
  choose,
  collectErrors,
  deck,
  input,
  LOGO,
  messages,
  openApp,
  say,
  tab,
  turns,
} from './aifinish-helpers';

/*
 * The chat's own controls (WG11-T11, WG10-T10; CHT-U05 to U08), against the scripted mock: the
 * model of the next turn, the conversations of a tool, the files of a
 * message, and the openings of an empty chat. The mock's "models" are its scripts, so a turn
 * shows which model played it by what it says.
 */

test('the picker changes the model of the next turn, and keeps the conversation', async ({
  page,
}) => {
  await openApp(page, { script: 'deck-build' });
  const picker = page.getByTestId('model-picker');
  await expect(picker).toHaveAttribute('data-model', 'deck-build');

  // The first turn is deck-build's: it builds an opening slide.
  const first = await say(page, 'בנה שקף פתיחה');
  await expect(first).toContainText('בונה שקף פתיחה');
  expect((await deck(page)).slides.map((slide) => slide.archetype)).toContain('hero');

  // Another model, chosen between turns.
  await picker.click();
  await page.getByRole('menuitemradio', { name: 'slide-chat' }).click();
  await expect(picker).toHaveAttribute('data-model', 'slide-chat');
  // The choice is this conversation's own: the app's setting is what it was (AGT-04).
  expect((await agentSettings(page)).model).toBe('deck-build');

  // The next turn is slide-chat's first: the session was started again on the new model, and
  // the conversation on screen is still the one that was.
  const second = await say(page, 'ועכשיו?');
  await expect(second).toContainText("I'll build an opening slide");
  await expect(first).toContainText('בונה שקף פתיחה');
  await expect(messages(page)).toHaveCount(2);

  // The default again: the conversation gives its choice back, and shows the app's model.
  await picker.click();
  await page.getByRole('menuitemradio', { name: 'ברירת המחדל' }).first().click();
  await expect(picker).toHaveAttribute('data-model', 'deck-build');
  await expect(picker).toHaveAttribute('data-own', 'false');
  expect((await agentSettings(page)).model).toBe('deck-build');
});

test('completed turns show no usage metrics in the chat', async ({ page }) => {
  await openApp(page, { script: 'deck-build' });
  await say(page, 'Build an opening slide');
  await say(page, 'Add a second slide');
  await expect(messages(page)).toHaveCount(2);
  await expect(page.getByTestId('turn-usage')).toHaveCount(0);
  await expect(page.getByTestId('chat-cost')).toHaveCount(0);
});

test('a tool keeps several conversations: a new one, and the way back', async ({ page }) => {
  await openApp(page, { script: 'slide-chat' });
  // An empty conversation is not one to leave behind.
  await expect(page.getByTestId('conversation-new')).toBeDisabled();
  await say(page, 'שיחה ראשונה על המצגת');
  const first = (await chat(page).getAttribute('data-thread'))!;
  expect(first).toBe('deck');

  await page.getByTestId('conversation-new').click();
  await expect(chat(page)).not.toHaveAttribute('data-thread', first);
  await expect(messages(page)).toHaveCount(0);
  await expect(page.getByTestId('chat-suggestions')).toBeVisible();
  await say(page, 'שיחה שנייה, על משהו אחר');
  await expect(messages(page)).toHaveCount(1);
  const second = (await chat(page).getAttribute('data-thread'))!;

  // Both are in the list, each under the start of its first message.
  await page.getByTestId('conversations').click();
  const items = page.getByRole('menuitemradio');
  await expect(items).toHaveCount(2);
  await expect(page.locator(`[data-conversation="${second}"]`)).toContainText('שיחה שנייה');
  await expect(page.locator(`[data-conversation="${second}"]`)).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.locator(`[data-conversation="${first}"]`).click();

  // Back in the first: its message, its reply, and its own history.
  await expect(chat(page)).toHaveAttribute('data-thread', first);
  await expect(messages(page)).toHaveCount(1);
  await expect(messages(page).first()).toContainText('שיחה ראשונה על המצגת');
  await expect(turns(page).first()).toContainText("I'll build an opening slide");
});

test('a message takes files: they show in the composer and in the chat, and a picture joins the deck', async ({
  page,
}) => {
  await openApp(page, { script: 'deck-build' });
  await choose(page, () => page.getByTestId('chat-attach').click(), LOGO.path);
  const pending = page.getByTestId('composer-files').getByTestId('attachment');
  await expect(pending).toHaveCount(1);
  await expect(pending).toContainText('aifinish-logo.png');

  // A file can be taken out again before the message goes.
  await pending.getByRole('button').click();
  await expect(page.getByTestId('composer-files')).toHaveCount(0);
  await choose(page, () => page.getByTestId('chat-attach').click(), LOGO.path);

  // A pasted picture is a file too.
  await input(page).focus();
  await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    return new Promise<void>((resolve) =>
      canvas.toBlob((blob) => {
        const data = new DataTransfer();
        data.items.add(new File([blob!], 'image.png', { type: 'image/png' }));
        document.activeElement!.dispatchEvent(
          new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
        );
        resolve();
      }, 'image/png'),
    );
  });
  await expect(pending).toHaveCount(2);
  await expect(pending.nth(1)).toContainText('pasted-2.png');

  await say(page, 'שים את הלוגו בשקף הפתיחה');
  await expect(page.getByTestId('composer-files')).toHaveCount(0);
  const sent = messages(page).first().getByTestId('attachment');
  await expect(sent).toHaveCount(2);
  await expect(sent.first()).toHaveAttribute('data-kind', 'image');
  // The pictures are among the deck's assets, so the agent can place them by id.
  expect(Object.keys((await deck(page)).assets)).toContain(LOGO.assetId);
  expect(Object.keys((await deck(page)).assets)).toHaveLength(2);
});

test('an empty chat offers openings, and one puts its words in the composer', async ({ page }) => {
  const errors = collectErrors(page);
  await openApp(page, { script: 'deck-build', lang: 'en' });
  const openings = page.getByTestId('chat-suggestions').getByRole('button');
  await expect(openings).toHaveCount(3);
  await openings.first().click();
  await expect(input(page)).toHaveValue('Build a deck of 8 slides about ');
  await expect(input(page)).toBeFocused();

  // In English, with every menu of the chat opened: no string is missing.
  await page.getByTestId('model-picker').click();
  await expect(page.getByRole('menu')).toContainText('Model');
  await page.keyboard.press('Escape');
  await page.getByTestId('conversations').click();
  await expect(page.getByRole('menu')).toContainText('Conversations');
  await page.keyboard.press('Escape');
  await tab(page, 'actions');
  await page.locator('[data-action="template.create"]').click();
  await expect(page.getByTestId('template-form')).toContainText('Make a draft');
  expect(errors).toEqual([]);
});
