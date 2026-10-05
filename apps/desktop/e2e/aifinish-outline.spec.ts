import { expect, test, type Page } from '@playwright/test';
import {
  collectErrors,
  deck,
  lastSent,
  messages,
  openApp,
  outline,
  say,
  tab,
  turnEnds,
  turns,
  undoDepth,
} from './aifinish-helpers';

/*
 * The outline flow (AID-03, WG11-T05), against the scripted mock: a request that gives only a
 * subject gets an outline and nothing else; approving it builds the deck; turning it down
 * changes nothing.
 */

const REQUEST = 'מצגת על תוכנית העבודה שלנו לשנת 2027';

test('a request with a subject only shows an outline, and builds nothing', async ({ page }) => {
  const errors = collectErrors(page);
  await openApp(page, { script: 'outline' });
  const before = await deck(page);
  await say(page, REQUEST);

  // The outline is a card of its own, not a chip: its slides, each with its kind.
  await expect(outline(page)).toHaveAttribute('data-state', 'open');
  await expect(outline(page).getByTestId('outline-slide')).toHaveCount(4);
  await expect(outline(page)).toContainText('תוכנית העבודה לשנת 2027');
  await expect(outline(page).getByTestId('outline-slide').nth(1)).toContainText('מספר גדול');
  await expect(outline(page).getByTestId('outline-slide').nth(1)).toContainText(
    'המספר של השנה שעברה',
  );
  await expect(page.locator('[data-testid="tool-chip"][data-tool="outline_propose"]')).toHaveCount(
    0,
  );
  // Nothing was built: the deck is the deck that was, and there is nothing to undo.
  expect(await deck(page)).toEqual(before);
  expect(await undoDepth(page)).toBe(0);
  await expect(page.getByTestId('undo-turn')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('approving the outline builds the deck, as one step that can be undone', async ({ page }) => {
  await openApp(page, { script: 'outline' });
  const before = await deck(page);
  await say(page, REQUEST);
  await outline(page).getByTestId('outline-approve').click();

  // The approval is a message of the user's, by its name; the turn that answers it builds.
  await expect(messages(page).nth(1)).toHaveAttribute('data-action', 'outline.approve');
  await expect(messages(page).nth(1)).toContainText('אישור המתווה');
  await turnEnds(page, 2);
  await expect(outline(page)).toHaveAttribute('data-state', 'answered');
  await expect(outline(page).getByTestId('outline-approve')).toHaveCount(0);

  const built = await deck(page);
  expect(built.slides.map((slide) => slide.archetype)).toEqual(['hero', 'bigNumber']);
  // The first slide of the outline went into the empty slide the deck opened with.
  expect(built.slides[0]!.id).toBe(before.slides[0]!.id);
  expect(await undoDepth(page)).toBe(1);
  await turns(page).nth(1).getByTestId('undo-turn').click();
  expect(await deck(page)).toEqual(before);
});

test('turning the outline down changes nothing, and says so', async ({ page }) => {
  await openApp(page, { script: 'outline' });
  const before = await deck(page);
  await say(page, REQUEST);
  await outline(page).getByTestId('outline-reject').click();

  await expect(outline(page)).toHaveAttribute('data-state', 'rejected');
  await expect(outline(page)).toContainText('המתווה נדחה, ושום דבר לא נבנה.');
  await expect(outline(page).getByTestId('outline-approve')).toHaveCount(0);
  // No message went out, no turn began, and the deck is as it was.
  await expect(messages(page)).toHaveCount(1);
  await expect(turns(page)).toHaveCount(1);
  await expect(page.getByTestId('chat-working')).toHaveCount(0);
  expect(await deck(page)).toEqual(before);
  expect(await undoDepth(page)).toBe(0);
});

const titles = (page: Page) => outline(page).getByTestId('outline-title');
/** The titles of the outline in its card, while it is edited. */
const typed = (page: Page) =>
  titles(page).evaluateAll((fields) => fields.map((field) => (field as HTMLInputElement).value));
/** The control of the card the keyboard is on, and the title of its row. */
const focused = (page: Page) =>
  page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    const row = active?.closest('[data-row]');
    return {
      control: active?.getAttribute('data-control') ?? null,
      title: row?.querySelector<HTMLInputElement>('[data-control="title"]')?.value ?? null,
    };
  });

const PROPOSED = [
  'תוכנית העבודה לשנת 2027',
  'איפה אנחנו היום',
  'שלושת היעדים',
  'מה עושים ברבעון הראשון',
];

test('the outline is edited in its card, and approved as the user left it', async ({ page }) => {
  const errors = collectErrors(page);
  await openApp(page, { script: 'outline' });
  await say(page, REQUEST);
  const card = outline(page);
  // The card opens as it did: the outline to read, and an answer that needs no typing.
  await expect(titles(page)).toHaveCount(0);
  await expect(card).not.toHaveAttribute('data-edited', 'true');
  await card.getByTestId('outline-edit').click();
  expect(await typed(page)).toEqual(PROPOSED);
  // The ends of the list hold.
  await expect(card.getByTestId('outline-up').first()).toBeDisabled();
  await expect(card.getByTestId('outline-down').last()).toBeDisabled();

  // A title is reworded; its kind and its note stay beside it.
  await titles(page).nth(1).fill('איפה אנחנו עומדים');
  await expect(card.getByTestId('outline-slide').nth(1)).toContainText('המספר של השנה שעברה');
  await expect(card).toHaveAttribute('data-edited', 'true');
  await expect(card.getByTestId('outline-edited')).toContainText('המתווה נערך');

  // A slide moves, and the keyboard stays on its row: at the end, on the button that still moves.
  await card.getByTestId('outline-up').nth(3).click();
  expect(await typed(page)).toEqual([PROPOSED[0], 'איפה אנחנו עומדים', PROPOSED[3], PROPOSED[2]]);
  expect(await focused(page)).toEqual({ control: 'up', title: PROPOSED[3] });
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  expect(await typed(page)).toEqual([PROPOSED[3], PROPOSED[0], 'איפה אנחנו עומדים', PROPOSED[2]]);
  expect(await focused(page)).toEqual({ control: 'down', title: PROPOSED[3] });
  // Alt with an arrow moves the slide whose title has the keyboard, which stays in the title.
  await titles(page).nth(0).focus();
  await page.keyboard.press('Alt+ArrowDown');
  expect(await typed(page)).toEqual([PROPOSED[0], PROPOSED[3], 'איפה אנחנו עומדים', PROPOSED[2]]);
  expect(await focused(page)).toEqual({ control: 'title', title: PROPOSED[3] });

  // A slide goes, and the keyboard is on the one that took its place.
  await card.getByTestId('outline-remove').nth(0).click();
  expect(await typed(page)).toEqual([PROPOSED[3], 'איפה אנחנו עומדים', PROPOSED[2]]);
  expect(await focused(page)).toEqual({ control: 'remove', title: PROPOSED[3] });
  await expect(card).toContainText('שקפים: 3');

  // A slide is added: a title to type, and until it has one it is not counted.
  await card.getByTestId('outline-add').click();
  await expect(titles(page)).toHaveCount(4);
  await expect(titles(page).nth(3)).toBeFocused();
  await expect(card).toContainText('שקפים: 3');
  await page.keyboard.insertText('מה מבקשים מההנהלה');
  await expect(card).toContainText('שקפים: 4');

  // What was edited is not lost when the panel shows something else for a moment.
  await tab(page, 'actions');
  await tab(page, 'chat');
  await expect(outline(page)).toHaveAttribute('data-edited', 'true');
  await outline(page).getByTestId('outline-edit').click();
  const edited = [PROPOSED[3], 'איפה אנחנו עומדים', PROPOSED[2], 'מה מבקשים מההנהלה'];
  expect(await typed(page)).toEqual(edited);
  await outline(page).getByTestId('outline-edit').click();
  await expect(titles(page)).toHaveCount(0);
  await expect(outline(page).getByTestId('outline-slide')).toHaveText([
    /מה עושים ברבעון הראשון/,
    /איפה אנחנו עומדים/,
    /שלושת היעדים/,
    /מה מבקשים מההנהלה/,
  ]);

  // Approving sends the outline as it is in the card, and says that it was edited.
  await outline(page).getByTestId('outline-approve').click();
  await expect(messages(page).nth(1)).toHaveAttribute('data-action', 'outline.approve');
  await expect(messages(page).nth(1)).toHaveText('אישור המתווה, כפי שנערך');
  const sent = await lastSent(page);
  const line = sent.split('\n').find((text) => text.startsWith('outline: '))!;
  expect(JSON.parse(line.slice('outline: '.length))).toEqual([
    { title: PROPOSED[3], archetype: 'timeline' },
    { title: 'איפה אנחנו עומדים', archetype: 'bigNumber', note: 'המספר של השנה שעברה' },
    { title: PROPOSED[2], archetype: 'cards' },
    { title: 'מה מבקשים מההנהלה' },
  ]);
  expect(sent).toContain('`outline` is the outline as they left it');
  expect(sent).toContain('a slide that is not in `outline` is not built');

  // The answered card shows what was approved, not what was proposed.
  await turnEnds(page, 2);
  await expect(outline(page)).toHaveAttribute('data-state', 'answered');
  await expect(outline(page).getByTestId('outline-slide')).toHaveCount(4);
  await expect(outline(page).getByTestId('outline-slide').first()).toContainText(PROPOSED[3]!);
  await expect(outline(page).getByTestId('outline-edit')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('an outline that was not edited is approved as proposed, and carries itself', async ({
  page,
}) => {
  await openApp(page, { script: 'outline' });
  await say(page, REQUEST);
  // Edited and put back: it is the proposal again.
  await outline(page).getByTestId('outline-edit').click();
  await outline(page).getByTestId('outline-remove').nth(2).click();
  await expect(outline(page)).toHaveAttribute('data-edited', 'true');
  await outline(page).getByTestId('outline-reset').click();
  expect(await typed(page)).toEqual(PROPOSED);
  await expect(outline(page)).not.toHaveAttribute('data-edited', 'true');
  await expect(outline(page).getByTestId('outline-reset')).toHaveCount(0);

  await outline(page).getByTestId('outline-approve').click();
  await expect(messages(page).nth(1)).toHaveText('אישור המתווה');
  const sent = await lastSent(page);
  // A session that could not resume the conversation still gets the outline it builds.
  expect(sent).toContain('it is in `outline`, as its card showed it');
  expect(sent).toContain('"title":"שלושת היעדים","archetype":"cards"');
  expect(sent).not.toContain('as they left it');
});

test('an outline with no slide left cannot be approved', async ({ page }) => {
  await openApp(page, { script: 'outline' });
  await say(page, REQUEST);
  await outline(page).getByTestId('outline-edit').click();
  for (let left = 4; left > 0; left--) {
    await outline(page).getByTestId('outline-remove').first().click();
  }
  await expect(titles(page)).toHaveCount(0);
  await expect(outline(page).getByTestId('outline-approve')).toBeDisabled();
  await expect(outline(page)).toContainText('לא נשארו שקפים במתווה.');
  // It can still be turned down, added to, or put back.
  await outline(page).getByTestId('outline-reset').click();
  await expect(outline(page).getByTestId('outline-approve')).toBeEnabled();
});
