import { expect, test, type Page } from '@playwright/test';
import type { GroupElement } from '@slidr/model';
import { onStage, openApp, pageProblems, row, selected, undo, undoDepth } from './objects-helpers';

/*
 * Elements → Card sets (ADR-085): a set of cards goes onto the slide as one group, and row B
 * adds a card of any of its kinds, or takes the selected card out; the set lays its cards out
 * again either way, as one undo step.
 */

const SETS = ['pop', 'steps', 'stats', 'plans', 'voices'];

test.afterEach(({ page }) => {
  expect(pageProblems(page)).toEqual([]);
});

async function openCardSets(page: Page, lang: 'he' | 'en' = 'en') {
  await openApp(page, { lang });
  await page.getByTestId('activity-bar').locator('[data-panel="elements"]').click();
  const panel = page.getByTestId('elements-panel');
  await panel.locator('[data-collection="cards"]').click();
  await expect(panel.getByTestId('elements-cards')).toBeVisible();
  return panel;
}

/** The card set on the current slide, as the bus has it. */
function setOnSlide(page: Page): Promise<GroupElement> {
  return page.evaluate(() => {
    const editor = window.slidr!;
    const id = editor.selection.getState().currentSlideId;
    const slide = editor.bus.deck.slides.find((s) => s.id === id);
    return slide?.elements.find((element) => element.name?.startsWith('cards:'));
  }) as Promise<GroupElement>;
}

const cards = (set: GroupElement) =>
  set.children.filter((child): child is GroupElement => child.type === 'group');

test('the collection shows five sets as they are drawn, and a click puts one on the slide', async ({
  page,
}) => {
  const panel = await openCardSets(page);
  const sets = panel.locator('[data-card-set]');
  await expect(sets).toHaveCount(SETS.length);
  expect(
    await sets.evaluateAll((all) => all.map((set) => set.getAttribute('data-card-set'))),
  ).toEqual(SETS);
  // Each is a picture of the set itself: the renderer drew its cards and their words.
  for (const id of SETS) {
    await expect(
      panel.locator(`[data-card-set="${id}"] [data-element-type="text"]`).first(),
    ).toBeVisible();
  }

  const before = await undoDepth(page);
  await panel.locator('[data-card-set="steps"]').click();
  const set = await selected<GroupElement>(page);
  expect(set.name).toBe('cards:steps');
  expect(cards(set)).toHaveLength(3);
  // Between the side margins of the slide, and as one group on the Stage.
  expect(set.frame.x).toBe(96);
  expect(set.frame.w).toBe(1728);
  await expect(onStage(page, set.id)).toBeVisible();
  await expect(onStage(page, set.id).getByText('Listen and define')).toBeVisible();
  expect(await undoDepth(page)).toBe(before + 1);
  await undo(page);
  expect(await setOnSlide(page)).toBeUndefined();
});

test('row B adds cards to the selected set, one undo step each, until the set is full', async ({
  page,
}) => {
  const panel = await openCardSets(page);
  await panel.locator('[data-card-set="plans"]').click();
  const set = await selected<GroupElement>(page);
  const before = await undoDepth(page);

  await row(page).getByTestId('cards-add').click();
  const kinds = page.locator('[data-card-kind]');
  await expect(kinds).toHaveCount(4);
  await expect(kinds.first().locator('[data-element-type="shape"]').first()).toBeVisible();
  await kinds.nth(3).click();

  await expect.poll(async () => cards(await setOnSlide(page)).length).toBe(4);
  const grown = await setOnSlide(page);
  // The same group, in the same width: its cards are narrower, in one row, the new one last.
  expect(grown.id).toBe(set.id);
  expect(grown.frame.w).toBe(set.frame.w);
  expect(
    cards(grown)
      .slice(0, 3)
      .map((card) => card.id),
  ).toEqual(cards(set).map((card) => card.id));
  expect(cards(grown)[0]!.frame.w).toBeLessThan(cards(set)[0]!.frame.w);
  expect(new Set(cards(grown).map((card) => card.frame.y)).size).toBe(1);
  await expect(onStage(page, grown.id).getByText('Enterprise')).toBeVisible();
  expect(await undoDepth(page)).toBe(before + 1);
  expect((await selected<GroupElement>(page)).id).toBe(set.id);

  // The gallery stayed open, and a set of plans holds four: it offers no more.
  await expect(kinds.first()).toBeDisabled();
  await page.keyboard.press('Escape');
  await undo(page);
  expect(cards(await setOnSlide(page))).toHaveLength(3);
});

test('a selected card is taken out of its set, and the others close up', async ({ page }) => {
  const panel = await openCardSets(page, 'he');
  await panel.locator('[data-card-set="pop"]').click();
  const set = await selected<GroupElement>(page);
  expect(cards(set)).toHaveLength(4);
  // A set in a Hebrew deck starts from the right.
  expect(cards(set)[0]!.frame.x).toBeGreaterThan(cards(set)[1]!.frame.x);
  // The set itself has no card to take out.
  await expect(row(page).getByTestId('cards-remove')).toHaveCount(0);

  const first = cards(set)[0]!;
  await page.evaluate((id) => window.slidr!.selection.getState().selectElements([id]), first.id);
  await row(page).getByTestId('cards-remove').click();
  await expect.poll(async () => cards(await setOnSlide(page)).length).toBe(3);
  const smaller = await setOnSlide(page);
  expect(cards(smaller).map((card) => card.id)).toEqual(
    cards(set)
      .slice(1)
      .map((card) => card.id),
  );
  // The card that was second is where the first one was, and the set is selected again.
  expect(cards(smaller)[0]!.frame).toEqual(first.frame);
  expect((await selected<GroupElement>(page)).id).toBe(set.id);
  await undo(page);
  expect(cards(await setOnSlide(page))).toHaveLength(4);
});
