import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { input, openChat, turns } from './agent-helpers';
import { addBoxes, openApp, THREE, undo } from './arrange-helpers';

/*
 * What the Stage shows that is not the slide's own: the mark on the elements the agent is
 * changing (STG-11), and what an empty placeholder says (ADR-040).
 */

const out = (name: string) =>
  fileURLToPath(new URL(`../test-results/editor/${name}.png`, import.meta.url));

const marks = (page: Page) => page.getByTestId('stage-surface').locator('[data-agent-mark]');
const hints = (page: Page) => page.getByTestId('stage-frame').locator('[data-placeholder-hint]');

/** Moves an element as a turn of the agent would: with its actor and its transaction. */
const agentMoves = (page: Page, elementId: string, x: number) =>
  page.evaluate(
    ([id, to]) => {
      const editor = window.slidr!;
      const slideId = editor.selection.getState().currentSlideId!;
      const slide = editor.bus.deck.slides.find((s) => s.id === slideId)!;
      const element = slide.elements.find((e) => e.id === id)!;
      editor.bus.dispatch(
        {
          type: 'element.update',
          slideId,
          elementId: id as string,
          patch: { frame: { ...element.frame, x: to as number } },
        },
        { actor: 'agent:s_test:t_1', txId: 'tx_agent_turn' },
      );
    },
    [elementId, x] as const,
  );

test('an element the agent changes is marked, for a moment after the change', async ({ page }) => {
  await openApp(page);
  await addBoxes(page, THREE);
  await expect(marks(page)).toHaveCount(0);

  await agentMoves(page, 'e_b', 500);
  const mark = page.locator('[data-agent-mark="e_b"]');
  await expect(mark).toBeVisible();
  // The mark is around the element where it is now.
  const element = page.getByTestId('stage-frame').locator('[data-element-id="e_b"]');
  await expect
    .poll(async () => {
      const [a, b] = [(await element.boundingBox())!, (await mark.boundingBox())!];
      return Math.abs(a.x - b.x) < 2 && Math.abs(a.width - b.width) < 2;
    })
    .toBe(true);

  // A run of changes keeps it up; then it goes.
  await page.waitForTimeout(900);
  await agentMoves(page, 'e_b', 520);
  await page.waitForTimeout(900);
  await expect(mark).toBeVisible();
  await expect(marks(page)).toHaveCount(0, { timeout: 4000 });
});

test('the user’s own changes, and an undo of the agent’s, are not marked', async ({ page }) => {
  await openApp(page);
  await addBoxes(page, THREE);
  await page.evaluate(() => {
    const editor = window.slidr!;
    const slideId = editor.selection.getState().currentSlideId!;
    editor.bus.dispatch({
      type: 'element.update',
      slideId,
      elementId: 'e_a',
      patch: { frame: { x: 300, y: 100, w: 100, h: 100 } },
    });
  });
  await expect(marks(page)).toHaveCount(0);

  await agentMoves(page, 'e_c', 1000);
  await expect(marks(page)).toHaveCount(1);
  await expect(marks(page)).toHaveCount(0, { timeout: 4000 });
  await undo(page);
  await page.waitForTimeout(200);
  await expect(marks(page)).toHaveCount(0);
});

test('a slide the agent builds is marked as a whole while it is built', async ({ page }) => {
  await openChat(page, { script: 'deck-build', speed: 1 });
  await input(page).fill('צור שקף פתיחה');
  await input(page).press('Enter');
  await expect(marks(page).first()).toBeVisible({ timeout: 20_000 });
  // One mark, around the slide: the Stage followed the agent to the slide it made.
  const slideId = await page.evaluate(() => window.slidr!.selection.getState().currentSlideId);
  await expect(marks(page)).toHaveCount(1);
  await expect(marks(page)).toHaveAttribute('data-agent-mark', slideId!);
  await page.screenshot({ path: out('stage-agent-mark') });
  await expect(turns(page).first()).toHaveAttribute('data-outcome', /.+/, { timeout: 30_000 });
  // The turn is over: the marks go a moment after its last change.
  await expect(marks(page)).toHaveCount(0, { timeout: 5000 });
});

/* ---------------------------------------------------------------- empty placeholders */

async function deckOnTemplate(page: Page, lang: 'he' | 'en', theme: 'light' | 'dark' = 'light') {
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
  await page.addInitScript((language) => localStorage.setItem('slidr.language', language), lang);
  await page.goto('/?welcome');
  await page.locator('[data-welcome-template]').nth(1).click();
  await expect(page.getByTestId('stage-frame')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

test('an empty placeholder says what it is for, until something is typed in it', async ({
  page,
}) => {
  await deckOnTemplate(page, 'he');
  const title = hints(page).and(page.locator('[data-placeholder-hint="title"]'));
  await expect(title).toHaveText('כותרת');
  const count = await hints(page).count();
  expect(count).toBeGreaterThan(1);
  // Each of them has a frame on the Stage, so the empty box can be seen and clicked.
  await expect(page.getByTestId('stage-surface').locator('[data-placeholder]')).toHaveCount(count);
  // The hint is the Stage's: a thumbnail of the slide does not carry it.
  await expect(page.getByTestId('filmstrip').locator('[data-placeholder-hint]')).toHaveCount(0);
  await page.screenshot({ path: out('stage-placeholders-he') });

  await title.dblclick();
  await expect(page.locator('[data-text-editor]')).toBeFocused();
  // While the box is edited the caret stands where the hint was.
  await expect(title).toHaveCount(0);
  await page.keyboard.type('תוכנית הרבעון');
  await page.keyboard.press('Escape');
  await expect(title).toHaveCount(0);
  await expect(hints(page)).toHaveCount(count - 1);
  await expect(page.getByTestId('stage-frame')).toContainText('תוכנית הרבעון');

  // Emptied again, it says what it is for again.
  await undo(page);
  await expect(title).toHaveText('כותרת');
});

test('a placeholder speaks the language of the deck', async ({ page }) => {
  await deckOnTemplate(page, 'en', 'dark');
  await expect(hints(page).and(page.locator('[data-placeholder-hint="title"]'))).toHaveText(
    'Title',
  );
  await page.screenshot({ path: out('stage-placeholders-en-dark') });
});
