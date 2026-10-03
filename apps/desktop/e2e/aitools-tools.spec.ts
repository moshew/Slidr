import { expect, test, type Page } from '@playwright/test';
import {
  addBody,
  addImage,
  addTitle,
  cards,
  chat,
  collectErrors,
  gallery,
  input,
  onStage,
  openApp,
  openTool,
  panel,
  runAction,
  say,
  select,
  textOf,
  TITLE,
  turns,
  undoDepth,
} from './aitools-helpers';

/*
 * The three AI tools in the shell (WG11-T04, T06, T07, T10), against the scripted mock agent:
 * every way into each tool, a chat for every slide and for every selection, the actions of each
 * tool as messages of its chat, and the controls that are not AI.
 */

const scopeChip = (page: Page) => page.getByTestId('scope-chip');

test('the three tools open from every entry point', async ({ page }) => {
  const errors = collectErrors(page);
  await openApp(page, { script: 'text-variations' });
  await addBody(page, 'להשיק את העורך החדש');
  await addTitle(page);
  await select(page, []);
  const bar = page.getByTestId('activity-bar');

  // The Activity Bar (SPEC 4.2).
  for (const id of ['ai.slide', 'ai.object', 'ai.deck'] as const) {
    await bar.locator(`[data-panel="${id}"]`).click();
    await expect(panel(page, id)).toBeVisible();
  }

  // Ctrl+1, Ctrl+2, Ctrl+3 (SPEC appendix A).
  await page.getByTestId('stage-surface').focus();
  await page.keyboard.press('Control+2');
  await expect(panel(page, 'ai.slide')).toBeVisible();
  await page.keyboard.press('Control+3');
  await expect(panel(page, 'ai.object')).toBeVisible();
  await page.keyboard.press('Control+1');
  await expect(panel(page, 'ai.deck')).toBeVisible();

  // Top Tools: "Slide AI" in row A, and in row B when nothing is selected.
  await page.getByTestId('top-tools-a').getByRole('button', { name: 'AI שקף' }).click();
  await expect(panel(page, 'ai.slide')).toBeVisible();
  await page.keyboard.press('Control+1');
  await page.getByTestId('top-tools-b').getByRole('button', { name: 'AI שקף' }).click();
  await expect(panel(page, 'ai.slide')).toBeVisible();

  // Row B of a selected object: "AI" opens the object tool on it.
  await select(page, ['e_title']);
  await page.getByTestId('top-tools-b').getByRole('button', { name: 'AI על האובייקט' }).click();
  await expect(panel(page, 'ai.object')).toBeVisible();
  await expect(scopeChip(page)).toContainText(TITLE);

  // A right click on an object selects it, and its menu opens the object tool on it.
  await page.keyboard.press('Control+1');
  await onStage(page, 'e_body').click({ button: 'right' });
  await page.getByTestId('stage-menu').getByRole('menuitem', { name: 'AI על האובייקט' }).click();
  await expect(panel(page, 'ai.object')).toBeVisible();
  await expect(scopeChip(page)).toContainText('להשיק את העורך החדש');
  await expect(chat(page)).toHaveAttribute('data-scope', 'object');

  // A right click on the slide itself clears the selection and offers the slide tool.
  await page.getByTestId('stage-frame').click({ button: 'right', position: { x: 40, y: 600 } });
  await page.getByTestId('stage-menu').getByRole('menuitem', { name: 'AI שקף' }).click();
  await expect(panel(page, 'ai.slide')).toBeVisible();
  await expect(chat(page)).toHaveAttribute('data-scope', 'slide');

  // The Filmstrip's menu, on a slide.
  await page.keyboard.press('Control+1');
  await page.getByTestId('filmstrip').getByRole('option').first().click({ button: 'right' });
  await page.getByTestId('slide-menu').getByRole('menuitem', { name: 'AI שקף' }).click();
  await expect(panel(page, 'ai.slide')).toBeVisible();

  // Ctrl+L puts the caret in the chat of the tool that is open, from the Actions tab too.
  await openTool(page, 'ai.slide', 'actions');
  await page.getByTestId('stage-surface').focus();
  await page.keyboard.press('Control+l');
  await expect(input(page)).toBeFocused();
  await expect(chat(page)).toHaveAttribute('data-scope', 'slide');
  expect(errors).toEqual([]);
});

test('every slide has a chat of its own, and its options stay with it', async ({ page }) => {
  await openApp(page, { script: 'slide-redesign' });
  await addTitle(page, 'שלושת היעדים של 2027');
  await openTool(page, 'ai.slide', 'chat');
  await expect(chat(page)).toContainText('מה לשנות בשקף?');
  await say(page, 'עצב מחדש את השקף');
  await expect(cards(page)).toHaveCount(3);
  const [first] = await page.evaluate(() => window.slidr!.bus.deck.slides.map((s) => s.id));

  // A second slide: an empty chat, and no options.
  await page.evaluate(() => {
    const { bus, selection } = window.slidr!;
    bus.dispatch({
      type: 'slide.add',
      slide: { id: 's_second', elements: [], timeline: [] },
    });
    selection.getState().setCurrentSlide('s_second');
  });
  await expect(scopeChip(page)).toContainText('שקף 2');
  await expect(turns(page)).toHaveCount(0);
  await expect(gallery(page)).toHaveCount(0);
  await say(page, 'עצב מחדש גם את זה');
  await expect(page.getByTestId('chat-user')).toHaveText('עצב מחדש גם את זה');

  // Back on the first slide, its conversation and its options are there.
  await page.evaluate((id) => window.slidr!.selection.getState().setCurrentSlide(id), first!);
  await expect(page.getByTestId('chat-user')).toHaveText('עצב מחדש את השקף');
  await expect(cards(page)).toHaveCount(3);
});

test('the slide tool: actions as messages, what is not for it goes to the deck chat, and the controls that are not AI', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openApp(page, { script: 'slide-redesign' });
  await addTitle(page, 'שלושת היעדים של 2027');
  await openTool(page, 'ai.slide', 'actions');
  const actions = page.getByTestId('ai-actions');
  for (const id of [
    'slide.redesign',
    'slide.visual',
    'slide.image',
    'slide.animate',
    'slide.fix',
    'slide.shorten',
    'slide.split',
    'slide.notes',
    'slide.translate',
  ]) {
    await expect(actions.locator(`[data-action="${id}"]`)).toBeEnabled();
  }

  // The first turn of the script offers designs; the second writes speaker notes.
  await runAction(page, 'slide.redesign');
  await openTool(page, 'ai.slide', 'actions');
  const turn = await runAction(page, 'slide.notes');
  await expect(page.getByTestId('chat-user').nth(1)).toHaveText('הערות דובר לשקף');
  await expect(turn).toContainText('עדכון שקף · שקף 1');
  const notes = await page.evaluate(() => window.slidr!.bus.deck.slides[0]!.notes);
  expect(JSON.stringify(notes)).toContain('לפתוח בכך שכל שלושת היעדים נמדדים');
  // The whole turn is one undo step.
  await turn.getByTestId('undo-turn').click();
  expect(await page.evaluate(() => window.slidr!.bus.deck.slides[0]!.notes)).toBeUndefined();

  // The controls that are not AI (AIS-04): the background and the transition, as in row B.
  await openTool(page, 'ai.slide', 'actions');
  await actions.getByRole('button', { name: 'רקע' }).click();
  await expect(page.getByTestId('background-editor')).toBeVisible();
  await page.keyboard.press('Escape');
  await actions.getByTestId('transition-tool').click();
  await expect(page.getByRole('radio', { name: 'עמעום' })).toBeVisible();
  await page.getByRole('radio', { name: 'עמעום' }).click();
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.slidr!.bus.deck.slides[0]!.transition?.type)).toBe(
    'fade',
  );

  // A slide session cannot add a slide, so splitting is asked of the deck chat.
  await actions.locator('[data-action="slide.split"]').click();
  await expect(panel(page, 'ai.deck')).toBeVisible();
  await expect(chat(page)).toHaveAttribute('data-scope', 'deck');
  await expect(page.getByTestId('chat-user')).toHaveAttribute('data-action', 'slide.split');
  await expect(page.getByTestId('chat-user')).toHaveText('פיצול שקף 1 לשניים');
  expect(errors).toEqual([]);
});

test('the object tool follows the selection, and offers the actions of its kind', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openApp(page, { script: 'text-variations' });
  await openTool(page, 'ai.object', 'chat');
  // Nothing selected: the tool says what to do (SPEC 4.2).
  await expect(panel(page, 'ai.object')).toContainText('בחרו אובייקט בשקף');
  await expect(input(page)).toHaveCount(0);

  await addTitle(page);
  await expect(chat(page)).toContainText('מה לעשות עם מה שבחרתם?');
  await expect(scopeChip(page)).toContainText(TITLE);

  // Text: the wording actions and the editing ones.
  await openTool(page, 'ai.object', 'actions');
  const actions = page.getByTestId('ai-actions');
  for (const id of [
    'variations',
    'title',
    'shorten',
    'expand',
    'fix',
    'bullets',
    'tone',
    'translate',
  ]) {
    await expect(actions.locator(`[data-action="text.${id}"]`)).toBeEnabled();
  }
  await actions.getByRole('radio', { name: '6' }).click();
  await runAction(page, 'text.variations');
  await expect(page.getByTestId('chat-user')).toHaveText('6 ניסוחים אחרים');
  await expect(cards(page)).toHaveCount(4);

  // A direct instruction is applied by the agent, as one undo step of its turn.
  await openTool(page, 'ai.object', 'actions');
  const depth = await undoDepth(page);
  const turn = await runAction(page, 'text.shorten');
  expect(await textOf(page, 'e_title')).toBe('תוכנית 2027');
  expect(await undoDepth(page)).toBe(depth + 1);
  await turn.getByTestId('undo-turn').click();
  expect(await textOf(page, 'e_title')).toBe(TITLE);

  // An image: its own actions, and the state of the image provider.
  await addImage(page);
  await openTool(page, 'ai.object', 'actions');
  await expect(actions.locator('[data-action="image.alternatives"]')).toBeEnabled();
  await expect(actions.locator('[data-action^="text."]')).toHaveCount(0);
  await expect(page.getByTestId('image-provider')).toHaveAttribute('data-state', 'ready');

  // Several objects: a chat, and no ready-made actions.
  await select(page, ['e_title', 'e_picture']);
  await expect(actions).toContainText('אין עדיין פעולות מוכנות לסוג הזה');
  await openTool(page, 'ai.object', 'chat');
  await expect(input(page)).toBeVisible();
  expect(errors).toEqual([]);
});

test('the deck tool: its actions, and the look of the deck beside them', async ({ page }) => {
  const errors = collectErrors(page);
  await openApp(page, { script: 'deck-build' });
  await openTool(page, 'ai.deck', 'actions');
  const actions = page.getByTestId('ai-actions');
  for (const id of ['translate', 'shorten', 'notes', 'improve', 'fix']) {
    await expect(actions.locator(`[data-action="deck.${id}"]`)).toBeEnabled();
  }
  // The template gallery, the palettes and the font pairs (aifinish-look.spec.ts drives them).
  for (const name of ['template', 'palette', 'fonts']) {
    await expect(actions.locator(`section[data-look="${name}"]`)).toBeVisible();
  }

  // The language of a translation is chosen beside its button.
  await actions.getByRole('combobox', { name: 'שפת היעד' }).click();
  await page.getByRole('option', { name: 'ערבית' }).click();
  await runAction(page, 'deck.translate');
  await expect(page.getByTestId('chat-user')).toHaveAttribute('data-action', 'deck.translate');
  await expect(page.getByTestId('chat-user')).toHaveText('תרגום המצגת לערבית');
  expect(errors).toEqual([]);
});

test('the status bar says what the agent is doing, and the actions wait for it', async ({
  page,
}) => {
  await openApp(page, { script: 'text-variations', speed: 1 });
  await addTitle(page);
  const status = page.getByTestId('status-agent');
  await expect(status).toHaveAttribute('data-state', 'idle');
  await expect(status).toHaveText('ה-Agent לא פעיל');

  await openTool(page, 'ai.object', 'chat');
  await input(page).fill('ניסוחים אחרים');
  await input(page).press('Enter');
  await expect(status).toHaveAttribute('data-state', 'working');
  await expect(status).toContainText('ה-Agent עובד');
  // While the turn runs, the tool's actions are off.
  await openTool(page, 'ai.object', 'actions');
  await expect(page.locator('[data-action="text.shorten"]')).toBeDisabled();
  await expect(page.getByTestId('ai-actions')).toContainText('ה-Agent באמצע תור');

  await expect(status).toHaveAttribute('data-state', 'idle', { timeout: 15_000 });
  await expect(page.locator('[data-action="text.shorten"]')).toBeEnabled();
});
