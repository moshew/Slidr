import { expect, test } from '@playwright/test';
import {
  choose,
  collectErrors,
  deck,
  draft,
  draftColours,
  draftHeights,
  LOGO,
  messages,
  openApp,
  say,
  tab,
  turnEnds,
  undoDepth,
} from './aifinish-helpers';

/*
 * A template made by the agent (WG7-T11a, THM-06), against the scripted mock: the form of the
 * deck tool gathers a description and a logo, the agent drafts, the chat shows the draft with
 * every layout drawn, and only saving puts it in the library, where a new deck opens on it.
 */

/** Sends the form of "Make a template with AI" with a description and the logo. */
async function askForTemplate(page: Parameters<typeof tab>[0]) {
  await tab(page, 'actions');
  await page.locator('[data-action="template.create"]').click();
  await page.getByTestId('template-description').fill('חם ונקי, לחברת קרמיקה קטנה');
  await choose(page, () => page.getByTestId('template-logo').click(), LOGO.path);
  await expect(page.locator('[data-testid="template-file"][data-use="logo"]')).toHaveCount(1);
  await page.getByTestId('template-create').click();
}

test('a template from a description and a logo is previewed, saved, and a new deck opens on it', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openApp(page, { script: 'template-create' });
  const before = await deck(page);

  await askForTemplate(page);
  // The request is in the chat as the action it was, with the file that went with it.
  const sent = messages(page).first();
  await expect(sent).toHaveAttribute('data-action', 'template.create');
  await expect(sent.getByTestId('attachment')).toHaveAttribute('data-kind', 'image');
  await turnEnds(page, 1);

  // The draft, before anything is saved: every layout drawn, with its sample on it.
  await expect(draft(page)).toBeVisible();
  await expect(draft(page).getByTestId('draft-layout')).toHaveCount(3);
  await expect(draft(page).getByTestId('draft-layout').first()).toContainText('פתיחה');
  await expect(draft(page).getByTestId('draft-name')).toHaveValue('חימר');
  await expect(draft(page)).not.toHaveAttribute('data-saved', /.+/);
  // A placeholder has the room it was drawn with (310px for the body of a card), though its
  // sample is two lines: the HTML is measured as drawn, not as the conversion sizes its text.
  expect(await draftHeights(page, 'cards', 'body')).toEqual([310, 310, 310]);
  // The layouts draw the logo that was attached, by its asset.
  await expect(draft(page).getByTestId('draft-layout').first().locator('img')).toHaveCount(1);

  // Nothing of the deck changed but the picture the user sent, which joined its assets, and
  // the library has no template of the user's yet.
  const during = await deck(page);
  expect(during.theme).toEqual(before.theme);
  expect(during.layouts).toEqual(before.layouts);
  expect(during.slides).toEqual(before.slides);
  expect(Object.keys(during.assets)).toEqual([LOGO.assetId]);
  await page.locator('[data-panel="templates"]').click();
  await expect(page.locator('[data-template^="personal_"]')).toHaveCount(0);
  await page.getByTestId('activity-bar').locator('[data-panel="ai.deck"]').click();
  await tab(page, 'chat');

  // Saving, as the default for new decks.
  await draft(page).getByRole('checkbox', { name: 'לקבוע כברירת מחדל למצגות חדשות' }).click();
  await draft(page).getByTestId('draft-save').click();
  await expect(draft(page)).toHaveAttribute('data-saved', /^personal_/);
  const id = (await draft(page).getAttribute('data-saved'))!;

  // It is in the library, under its name, with a cover.
  await page.locator('[data-panel="templates"]').click();
  const card = page.locator(`[data-template="${id}"]`);
  await expect(card).toContainText('חימר');
  await expect(card).toContainText('ברירת מחדל');

  // File > New opens a deck on it: its theme, its layouts, an opening slide, and its logo.
  await page.getByTestId('top-tools-a').getByRole('button', { name: 'קובץ' }).click();
  await page.getByRole('menuitem', { name: 'מצגת חדשה' }).click();
  // The picture the user sent made the deck one with unsaved changes: the app asks first.
  await page.getByRole('button', { name: 'בלי לשמור' }).click();
  await expect.poll(async () => (await deck(page)).theme.id).toBe(id);
  const fresh = await deck(page);
  expect(fresh.theme.name).toBe('חימר');
  expect(fresh.theme.colors.primary).toBe('#b4552d');
  expect(fresh.layouts.map((layout) => layout.archetype)).toEqual(['hero', 'cards', 'closing']);
  expect(fresh.slides).toHaveLength(1);
  expect(fresh.slides[0]!.layoutId).toBe(fresh.layouts[0]!.id);
  expect(Object.keys(fresh.assets)).toEqual([LOGO.assetId]);
  // The logo is drawn on the Stage, from the file the template carries.
  const logo = page.getByTestId('stage-frame').locator('img').first();
  await expect.poll(() => logo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(160);
  expect(errors).toEqual([]);
});

test('a draft is improved in the chat, and saved when the user asks for it in words', async ({
  page,
}) => {
  await openApp(page, { script: 'template-create' });
  await askForTemplate(page);
  await turnEnds(page, 1);
  const first = await draft(page).getAttribute('data-testid');
  expect(first).toBe('template-draft');
  const depth = await undoDepth(page);

  // "Warmer": the next draft is the first with another palette, and takes its place.
  await say(page, 'הפוך את הפלטה לחמה יותר');
  await expect(draft(page).getByTestId('draft-layout')).toHaveCount(3);
  const colours = await draftColours(page);
  expect(colours).toEqual({ count: 2, shown: '#c2410c', first: '#b4552d' });

  // "Save it": the agent saves the latest draft, and the card says so.
  await say(page, 'שמור אותה');
  await expect(draft(page)).toHaveAttribute('data-saved', /^personal_/);
  await expect(draft(page)).toContainText('התבנית נשמרה בספרייה');
  // Drafting and saving changed nothing in the deck that undo would have to take back.
  expect(await undoDepth(page)).toBe(depth);

  // Trying it on the deck shows it on the Stage and changes nothing; a click applies it as
  // one undo step.
  const before = await deck(page);
  await draft(page).getByTestId('draft-apply').hover();
  await expect(page.getByTestId('stage-preview')).toBeVisible();
  expect((await deck(page)).theme.id).toBe(before.theme.id);
  await draft(page).getByTestId('draft-apply').click();
  await expect.poll(async () => (await deck(page)).theme.name).toBe('חימר');
  expect(await undoDepth(page)).toBe(depth + 1);
  await page.evaluate(() => window.slidr!.bus.undo());
  expect((await deck(page)).theme).toEqual(before.theme);
});

test('the draft can be closed, and the form asks for a source', async ({ page }) => {
  await openApp(page, { script: 'template-create', lang: 'en' });
  const errors = collectErrors(page);
  await tab(page, 'actions');
  await page.locator('[data-action="template.create"]').click();
  // Nothing to make a template from yet.
  await expect(page.getByTestId('template-create')).toBeDisabled();
  await expect(page.getByTestId('template-form')).toContainText('Give at least one source');
  await page.getByTestId('template-url').fill('https://example.com');
  await page.getByTestId('template-from-deck').click();
  await expect(page.getByTestId('template-create')).toBeEnabled();
  await page.getByTestId('template-create').click();
  await turnEnds(page, 1);
  await expect(messages(page).first()).toContainText('Make a template with AI');
  await expect(draft(page)).toContainText('Template draft');
  await expect(draft(page)).toContainText('3 layouts');
  await draft(page).getByTestId('draft-close').click();
  await expect(draft(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});
