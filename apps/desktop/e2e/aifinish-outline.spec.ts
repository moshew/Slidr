import { expect, test } from '@playwright/test';
import {
  collectErrors,
  deck,
  messages,
  openApp,
  outline,
  say,
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
