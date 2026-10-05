import { expect, test, type Page } from '@playwright/test';
import type { AnimationStep } from '@slidr/model';
import {
  FHD,
  idle,
  LAPTOP,
  openApp,
  setCurrentSlide,
  shot,
  undoSteps,
} from './runtime-app-helpers';

// The Animations panel and the transition tool in the app (WG8-T04, T05), on the runtime's
// `probe` deck. The first slide has six clicks: two boxes, a list by paragraph, an emphasis and
// two exits (src/dev/runtime/decks.ts).

test.use({ viewport: FHD });

const timeline = (page: Page, slideId = 's_probe_a') =>
  page.evaluate(
    (id) =>
      JSON.parse(
        JSON.stringify(window.slidr!.bus.deck.slides.find((s) => s.id === id)?.timeline ?? []),
      ) as AnimationStep[],
    slideId,
  );

const transitionOf = (page: Page, slideId: string) =>
  page.evaluate(
    (id) => window.slidr!.bus.deck.slides.find((s) => s.id === id)?.transition ?? null,
    slideId,
  );

const select = (page: Page, ids: string[]) =>
  page.evaluate((list) => window.slidr!.selection.getState().selectElements(list), ids);

async function openPanel(page: Page, options: Parameters<typeof openApp>[1] = {}) {
  await openApp(page, { deck: 'probe', ...options });
  await page
    .getByTestId('activity-bar')
    .getByRole('button', { name: options.lang === 'en' ? 'Animations' : 'אנימציות' })
    .click();
  await expect(page.getByTestId('animations-panel')).toBeVisible();
}

/** The rows of the list by group: the labels of the groups, and how many rows each has. */
const groups = (page: Page) =>
  page
    .getByTestId('animation-list')
    .locator('[data-group]')
    .evaluateAll((nodes) =>
      nodes.map((node) => [
        node.getAttribute('aria-label'),
        node.querySelectorAll('[data-row]').length,
      ]),
    );

const stageVisibility = (page: Page, id: string) =>
  page.evaluate(
    (elementId) =>
      getComputedStyle(
        document.querySelector(
          `[data-testid="stage-frame"] [data-element-id="${elementId}"]`,
        ) as Element,
      ).visibility,
    id,
  );

test('the panel lists the timeline as the show plays it: one group per click', async ({ page }) => {
  await openPanel(page);
  // The list by paragraph takes three clicks, one per paragraph: the runtime says so.
  expect(await groups(page)).toEqual([
    ['עם פתיחת השקף', 1],
    ['לחיצה 1', 2],
    ['לחיצה 2', 1],
    ['לחיצה 3', 1],
    ['לחיצה 4', 1],
    ['לחיצה 5', 1],
    ['לחיצה 6', 2],
  ]);
  await expect(page.locator('[data-group="2"] [data-row]')).toContainText('פסקה 1 מתוך 3');
  // A row selects its element on the Stage and opens its settings.
  await page.locator('[data-group="1"] [data-row]').first().click();
  expect(await page.evaluate(() => window.slidr!.selection.getState().selectedElementIds)).toEqual([
    'p_box1',
  ]);
  await expect(page.getByTestId('animation-editor')).toBeVisible();
});

test('adds an animation to the selected objects, in one undo step', async ({ page }) => {
  await openPanel(page);
  await setCurrentSlide(page, 's_probe_c');
  await expect(page.getByTestId('animations-panel')).toContainText('אין אנימציות בשקף');
  // Nothing selected: nothing to add to.
  await expect(page.getByTestId('animation-add')).toBeDisabled();
  await select(page, ['r_title', 'r_home']);
  const steps = await undoSteps(page);
  await page.getByTestId('animation-add').click();
  const kind = page.getByRole('menuitem', { name: 'כניסה', exact: true });
  await kind.hover();
  const item = page.getByRole('menuitem', { name: 'עלייה' });
  await expect(item).toBeInViewport();
  // As a hand moves: along the row and into the submenu, then to the item. The submenu stays
  // open for a pointer that travels towards it, not for one that jumps.
  const row = (await kind.boundingBox())!;
  const box = (await item.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, row.y + row.height / 2, { steps: 8 });
  await item.click();
  const added = await timeline(page, 's_probe_c');
  expect(added.map((s) => [s.elementId, s.category, s.preset, s.trigger])).toEqual([
    ['r_title', 'entrance', 'rise', 'onClick'],
    ['r_home', 'entrance', 'rise', 'withPrevious'],
  ]);
  expect(await undoSteps(page)).toBe(steps + 1);
  expect(await groups(page)).toEqual([['לחיצה 1', 2]]);
  await page.evaluate(() => window.slidr!.bus.undo());
  expect(await timeline(page, 's_probe_c')).toEqual([]);
  await page.evaluate(() => window.slidr!.bus.redo());
  expect(await timeline(page, 's_probe_c')).toEqual(added);
});

test('the settings of a step write through to the model', async ({ page }) => {
  await openPanel(page);
  await page.locator('[data-group="1"] [data-row]').first().click();
  const editor = page.getByTestId('animation-editor');
  const first = async () => (await timeline(page))[1]!;
  expect(await first()).toMatchObject({ preset: 'flyIn', direction: 'start', duration: 300 });

  // The deck reads left to right: the arrow that points right is `end`.
  await editor.getByRole('radio', { name: 'ימינה' }).click();
  expect((await first()).direction).toBe('end');
  await editor.getByRole('combobox', { name: 'אפקט' }).click();
  await page.getByRole('option', { name: 'זום' }).click();
  // A zoom has no direction: the field goes, and so does the value.
  expect(await first()).toMatchObject({ preset: 'zoom' });
  expect('direction' in (await first())).toBe(false);
  await expect(editor.getByRole('radio', { name: 'ימינה' })).toHaveCount(0);

  await editor.getByRole('textbox', { name: 'משך' }).fill('1.2');
  await editor.getByRole('textbox', { name: 'משך' }).press('Enter');
  await editor.getByRole('textbox', { name: 'השהיה' }).fill('0.25');
  await editor.getByRole('textbox', { name: 'השהיה' }).press('Enter');
  await editor.getByRole('combobox', { name: 'התחלה' }).click();
  await page.getByRole('option', { name: 'אחרי הקודמת' }).click();
  expect(await first()).toMatchObject({ duration: 1200, delay: 250, trigger: 'afterPrevious' });
  // After the title now: the boxes are part of the lead-in, and a click is gone.
  expect((await groups(page))[0]).toEqual(['עם פתיחת השקף', 3]);

  await editor.getByRole('radio', { name: 'יציאה' }).click();
  expect(await first()).toMatchObject({ category: 'exit', preset: 'zoom' });
});

test('text comes in by paragraph, word or letter, for elements that have text', async ({
  page,
}) => {
  await openPanel(page);
  // The list: by paragraph, three clicks.
  await page.locator('[data-group="2"] [data-row]').click();
  const editor = page.getByTestId('animation-editor');
  await editor.getByRole('combobox', { name: 'טקסט' }).click();
  await page.getByRole('option', { name: 'מילה אחר מילה' }).click();
  expect((await timeline(page))[3]).toMatchObject({ elementId: 'p_list', textBy: 'word' });
  // By word it is one step: two clicks fewer.
  expect((await groups(page)).length).toBe(5);
  await editor.getByRole('combobox', { name: 'טקסט' }).click();
  await page.getByRole('option', { name: 'הכול יחד' }).click();
  expect('textBy' in (await timeline(page))[3]!).toBe(false);
  // A box has no text to split.
  await page.locator('[data-group="1"] [data-row]').first().click();
  await expect(
    page.getByTestId('animation-editor').getByRole('combobox', { name: 'טקסט' }),
  ).toHaveCount(0);
});

test('a row is dragged to another place, removed with its button, and moved with Alt+arrow', async ({
  page,
}) => {
  await openPanel(page);
  const ids = async () => (await timeline(page)).map((s) => s.id);
  expect(await ids()).toEqual(['a_0', 'a_1', 'a_2', 'a_3', 'a_4', 'a_5', 'a_6']);

  // The pulse (click 5) is dragged to the top of the list.
  const handle = page.locator('[data-group="5"] [data-testid="animation-drag"]');
  const target = await page.locator('[data-group="0"] [data-row]').boundingBox();
  const from = await handle.boundingBox();
  const steps = await undoSteps(page);
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(from!.x + 4, from!.y - 40, { steps: 4 });
  await expect(page.getByTestId('animation-drop-line')).toBeVisible();
  await page.mouse.move(from!.x + 4, target!.y + 2, { steps: 6 });
  await page.mouse.up();
  expect(await ids()).toEqual(['a_4', 'a_0', 'a_1', 'a_2', 'a_3', 'a_5', 'a_6']);
  expect(await undoSteps(page)).toBe(steps + 1);
  await expect(page.getByTestId('animation-drop-line')).toHaveCount(0);

  // Alt+Down on the focused row takes it one place down.
  const row = page.locator('[data-step="a_4"] [data-row]');
  await row.focus();
  await page.keyboard.press('Alt+ArrowDown');
  expect(await ids()).toEqual(['a_0', 'a_4', 'a_1', 'a_2', 'a_3', 'a_5', 'a_6']);
  await page.locator('[data-step="a_4"] [data-row]').focus();
  await page.keyboard.press('Alt+ArrowUp');
  expect((await ids())[0]).toBe('a_4');

  await page.locator('[data-step="a_4"] [data-row]').hover();
  await page.locator('[data-step="a_4"]').getByRole('button', { name: 'הסרת האנימציה' }).click();
  expect(await ids()).toEqual(['a_0', 'a_1', 'a_2', 'a_3', 'a_5', 'a_6']);
  await page.locator('[data-step="a_6"] [data-row]').focus();
  await page.keyboard.press('Delete');
  expect(await ids()).toEqual(['a_0', 'a_1', 'a_2', 'a_3', 'a_5']);
});

test('the preview plays on the Stage, and leaves the slide as it was', async ({ page }) => {
  await openPanel(page);
  const untouched = await page.evaluate(
    () => document.querySelector('[data-testid="stage-frame"] [data-slide-id]')?.innerHTML,
  );
  await page.getByTestId('animations-preview').click();
  await expect(page.getByTestId('animations-preview')).toHaveText('עצירה');
  // The lead-in: the title fades in while everything that waits for a click is out of sight.
  await expect.poll(() => stageVisibility(page, 'p_box1')).toBe('hidden');
  await expect.poll(() => stageVisibility(page, 'p_box1'), { timeout: 10_000 }).toBe('visible');
  // It plays through to the exits and ends by itself.
  await expect(page.getByTestId('animations-preview')).toHaveText('תצוגה מקדימה', {
    timeout: 20_000,
  });
  const after = await page.evaluate(() => ({
    html: document.querySelector('[data-testid="stage-frame"] [data-slide-id]')?.innerHTML,
    animations: document.getAnimations().filter((a) => {
      const target = (a.effect as KeyframeEffect | null)?.target;
      return target?.closest('[data-testid="stage-frame"]') != null;
    }).length,
  }));
  expect(after).toEqual({ html: untouched, animations: 0 });
});

test('a preview stops before the text of the slide is edited, and on any change', async ({
  page,
}) => {
  await openPanel(page);
  await setCurrentSlide(page, 's_probe_b');
  const parts = () => page.locator('[data-testid="stage-frame"] [data-slidr-part]').count();
  // The title comes in word by word: its text is wrapped while that plays.
  await page.locator('[data-group="0"]').getByRole('button', { name: 'ניגון השלב הזה' }).click();
  await expect.poll(parts).toBeGreaterThan(0);
  await page.evaluate(() => window.slidr!.selection.getState().startEditing('q_title'));
  expect(await parts()).toBe(0);
  await expect(page.getByTestId('animations-preview')).toHaveText('תצוגה מקדימה');
  await page.evaluate(() => window.slidr!.selection.getState().stopEditing());

  await page.locator('[data-group="0"]').getByRole('button', { name: 'ניגון השלב הזה' }).click();
  await expect.poll(parts).toBeGreaterThan(0);
  await page.evaluate(() =>
    window.slidr!.bus.dispatch({
      type: 'slide.update',
      slideId: 's_probe_b',
      patch: { name: 'Renamed' },
    }),
  );
  expect(await parts()).toBe(0);
  // Another slide takes the Stage: nothing of the preview goes with it.
  await page.locator('[data-group="1"]').getByRole('button', { name: 'ניגון השלב הזה' }).click();
  await setCurrentSlide(page, 's_probe_a');
  expect(await page.evaluate(() => document.querySelectorAll('[data-slidr-part]').length)).toBe(0);
  await idle(page);
});

test('the transition tool of row B sets the kind, the direction and the duration', async ({
  page,
}) => {
  await openApp(page, { deck: 'probe' });
  await setCurrentSlide(page, 's_probe_b');
  await page.getByTestId('transition-tool').click();
  const editor = page.getByTestId('transition-editor');
  await expect(editor.getByRole('radio', { name: 'דחיפה' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  const steps = await undoSteps(page);
  await editor.getByRole('radio', { name: 'ניגוב' }).click();
  expect(await transitionOf(page, 's_probe_b')).toMatchObject({ type: 'wipe', direction: 'start' });
  // The preview plays the change with the runtime's own transition.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document
            .querySelector('[data-testid="transition-preview"]')
            ?.getAnimations({ subtree: true }).length,
      ),
    )
    .toBeGreaterThan(0);
  await editor.getByRole('radio', { name: 'ימינה' }).click();
  expect((await transitionOf(page, 's_probe_b'))?.direction).toBe('end');
  await editor.getByRole('radio', { name: 'עמעום' }).click();
  // A fade has no direction.
  expect('direction' in (await transitionOf(page, 's_probe_b'))!).toBe(false);
  await expect(editor.getByRole('radio', { name: 'ימינה' })).toHaveCount(0);

  await editor.getByRole('textbox', { name: 'משך' }).fill('1.5');
  await editor.getByRole('textbox', { name: 'משך' }).press('Enter');
  expect((await transitionOf(page, 's_probe_b'))?.duration).toBe(1500);
  // The slider moves it too: a key press is a whole gesture, so each is one undo step.
  const before = await undoSteps(page);
  const slider = editor.getByRole('slider', { name: 'משך' });
  await slider.focus();
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowUp');
  expect((await transitionOf(page, 's_probe_b'))?.duration).toBe(1700);
  expect(await undoSteps(page)).toBe(before + 4);

  await editor.getByRole('radio', { name: 'לבד' }).click();
  expect((await transitionOf(page, 's_probe_b'))?.advance).toEqual({
    onClick: true,
    afterMs: 3000,
  });
  await editor.getByRole('radio', { name: 'בלחיצה' }).click();
  expect((await transitionOf(page, 's_probe_b'))?.advance).toEqual({ onClick: true });
  expect(await undoSteps(page)).toBeGreaterThan(steps);

  await editor.getByRole('radio', { name: 'ללא' }).click();
  expect(await transitionOf(page, 's_probe_b')).toBeNull();
});

test('"apply to all" gives every slide the transition, in one undo step', async ({ page }) => {
  await openApp(page, { deck: 'probe' });
  await setCurrentSlide(page, 's_probe_b');
  await page.getByTestId('transition-tool').click();
  const steps = await undoSteps(page);
  await page.getByRole('button', { name: 'החלה על כל השקפים' }).click();
  const types = () =>
    page.evaluate(() => window.slidr!.bus.deck.slides.map((s) => s.transition?.type ?? null));
  expect(await types()).toEqual(['push', 'push', 'push', 'push']);
  expect(await undoSteps(page)).toBe(steps + 1);
  await expect(page.getByRole('button', { name: 'החלה על כל השקפים' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.slidr!.bus.undo());
  expect(await types()).toEqual([null, 'push', null, 'wipe']);
});

test('in an RTL deck the arrow that points right is `start`', async ({ page }) => {
  await openApp(page, { deck: 'probe-rtl' });
  await setCurrentSlide(page, 's_probe_b');
  await page.getByTestId('transition-tool').click();
  const editor = page.getByTestId('transition-editor');
  // The deck's push travels towards `start`, which is rightwards here.
  await expect(editor.getByRole('radio', { name: 'ימינה' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await editor.getByRole('radio', { name: 'שמאלה' }).click();
  expect((await transitionOf(page, 's_probe_b'))?.direction).toBe('end');
  // Left is on the left whatever the language of the UI.
  const left = await editor.getByRole('radio', { name: 'שמאלה' }).boundingBox();
  const right = await editor.getByRole('radio', { name: 'ימינה' }).boundingBox();
  expect(left!.x).toBeLessThan(right!.x);
});

for (const theme of ['light', 'dark'] as const) {
  for (const lang of ['he', 'en'] as const) {
    test(`the panel and the transition popover: ${theme}, ${lang}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await openPanel(page, { lang, theme });
      await page.locator('[data-group="1"] [data-row]').first().click();
      await expect(page.getByTestId('animation-editor')).toBeVisible();
      await page.screenshot({ path: shot(`panel-${theme}-${lang}`) });
      await page.keyboard.press('Escape');
      await setCurrentSlide(page, 's_probe_b');
      await page.getByTestId('transition-tool').click();
      await expect(page.getByTestId('transition-preview').first()).toBeVisible();
      await page.screenshot({ path: shot(`transition-${theme}-${lang}`) });
      expect(errors).toEqual([]);
    });
  }
}

test('the panel at 1366x768', async ({ page }) => {
  await page.setViewportSize(LAPTOP);
  await openPanel(page);
  await page.locator('[data-group="1"] [data-row]').first().click();
  await page.screenshot({ path: shot('panel-light-he-1366') });
  // The transition section under the timeline, scrolled into view.
  await page.getByTestId('transition-editor').scrollIntoViewIfNeeded();
  await page.screenshot({ path: shot('panel-transition-light-he-1366') });
});

test('Alt+arrow keeps the keyboard on the row it moves, and passes a step that does not play in one press (ADR-069, finding 14)', async ({
  page,
}) => {
  await openPanel(page);
  const ids = async () => (await timeline(page)).map((s) => s.id);
  const row = (id: string) => page.locator(`[data-step="${id}"] [data-row]`).first();
  // A motion path, which the runtime does not play, sits between the first two: the list shows
  // it apart.
  await page.evaluate(() => {
    const { bus } = window.slidr!;
    const slide = bus.deck.slides.find((s) => s.id === 's_probe_a')!;
    const [first, ...rest] = slide.timeline;
    bus.dispatch({
      type: 'slide.setTimeline',
      slideId: slide.id,
      timeline: [first!, { ...first!, id: 'a_gone', category: 'motion' }, ...rest],
    });
  });
  expect(await ids()).toEqual(['a_0', 'a_gone', 'a_1', 'a_2', 'a_3', 'a_4', 'a_5', 'a_6']);

  await row('a_0').focus();
  const steps = await undoSteps(page);
  await page.keyboard.press('Alt+ArrowDown');
  // One press, one place down among the steps that play, one undo step.
  expect((await ids()).filter((id) => id !== 'a_gone').slice(0, 2)).toEqual(['a_1', 'a_0']);
  expect(await undoSteps(page)).toBe(steps + 1);
  await expect(row('a_0')).toBeFocused();

  // And back up, from the keyboard it kept.
  await page.keyboard.press('Alt+ArrowUp');
  expect((await ids()).filter((id) => id !== 'a_gone').slice(0, 2)).toEqual(['a_0', 'a_1']);
  await expect(row('a_0')).toBeFocused();
});
