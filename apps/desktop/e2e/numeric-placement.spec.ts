import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import {
  addBoxes,
  copy,
  elements,
  expectOneStep,
  focusStage,
  frames,
  openApp,
  select,
  THREE,
  undo,
} from './arrange-helpers';

/*
 * Paste style only, and position, size and rotation as numbers (WG5-T14: ARR-06, ARR-07), in
 * the app: the Arrange menu and its shortcut, and the fields of row B.
 */

const out = (name: string) =>
  fileURLToPath(new URL(`../test-results/objects/${name}.png`, import.meta.url));

const rowB = (page: Page) => page.getByTestId('top-tools-b');
const editor = (page: Page) => page.getByTestId('placement-editor');

const LABELS = { x: 'X', y: 'Y', w: 'Width', h: 'Height', rotation: 'Rotation' } as const;
/** A field of the placement editor, by the name it is read as. */
const field = (page: Page, name: keyof typeof LABELS) =>
  editor(page).getByRole('textbox', { name: LABELS[name], exact: true });

/** The fields of an element of the current slide, as the bus has them. */
const element = (page: Page, id: string) =>
  page.evaluate((elementId) => {
    const slidr = window.slidr!;
    const slide = slidr.bus.deck.slides.find(
      (s) => s.id === slidr.selection.getState().currentSlideId,
    )!;
    return slide.elements.find((e) => e.id === elementId) as unknown as Record<string, unknown>;
  }, id);

/** Types a number into a field of the placement editor and commits it. */
async function type(page: Page, name: keyof typeof LABELS, value: string) {
  await field(page, name).fill(value);
  await field(page, name).press('Enter');
}

async function style(page: Page, id: string, patch: Record<string, unknown>) {
  await page.evaluate(
    ([elementId, fields]) => {
      const slidr = window.slidr!;
      slidr.bus.dispatch({
        type: 'element.update',
        slideId: slidr.selection.getState().currentSlideId!,
        elementId: elementId,
        patch: fields,
      });
    },
    [id, patch] as const,
  );
}

test.beforeEach(async ({ page }) => {
  await openApp(page, { lang: 'en' });
  await addBoxes(page, THREE);
});

test('numbers move, size and turn the selected element, each as one undo step', async ({
  page,
}) => {
  await select(page, ['e_b']);
  await rowB(page).getByTestId('placement-tool').click();
  await expect(editor(page)).toBeVisible();
  await expect(field(page, 'x')).toHaveValue('400');

  await expectOneStep(page, () => type(page, 'x', '640'));
  await expectOneStep(page, () => type(page, 'y', '120'));
  expect((await frames(page, ['e_b'])).e_b).toEqual({ x: 640, y: 120, w: 200, h: 100 });

  // A shape's sides are free of each other until they are tied.
  await expectOneStep(page, () => type(page, 'w', '300'));
  expect((await frames(page, ['e_b'])).e_b).toEqual({ x: 640, y: 120, w: 300, h: 100 });
  await editor(page).getByTestId('placement-keep').click();
  await expectOneStep(page, () => type(page, 'h', '200'));
  expect((await frames(page, ['e_b'])).e_b).toEqual({ x: 640, y: 120, w: 600, h: 200 });

  await expectOneStep(page, () => type(page, 'rotation', '-30'));
  expect((await element(page, 'e_b')).rotation).toBe(330);
  await expect(field(page, 'rotation')).toHaveValue('-30');

  // The fields follow the element: an undo shows in them.
  await undo(page);
  await expect(field(page, 'rotation')).toHaveValue('0');
});

test('the fields are there for one element only, and closed to a locked one', async ({ page }) => {
  await select(page, ['e_a', 'e_b']);
  await expect(rowB(page).getByTestId('placement-tool')).toHaveCount(0);
  await style(page, 'e_a', { locked: true });
  await page.evaluate(() => window.slidr!.selection.getState().selectElements(['e_a']));
  await rowB(page).getByTestId('placement-tool').click();
  await expect(field(page, 'x')).toBeDisabled();
});

test('paste style puts the look of the copied object on the selection, and leaves its place', async ({
  page,
}) => {
  const look = {
    opacity: 0.5,
    fill: { kind: 'solid', color: { token: 'accent' } },
    stroke: { color: { token: 'text' }, width: 6 },
    effects: { radius: 24 },
  };
  await style(page, 'e_a', look);
  const before = await frames(page, ['e_b', 'e_c']);

  // Nothing copied yet: the menu's item has nothing to paste.
  await select(page, ['e_b']);
  await page.getByTestId('arrange-menu').click();
  await expect(page.getByTestId('paste-style')).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Escape');

  await select(page, ['e_a']);
  await focusStage(page);
  await copy(page);
  await select(page, ['e_b', 'e_c']);
  await expectOneStep(page, async () => {
    await page.getByTestId('arrange-menu').click();
    await page.getByTestId('paste-style').click();
  });
  for (const id of ['e_b', 'e_c']) expect(await element(page, id)).toMatchObject(look);
  expect(await frames(page, ['e_b', 'e_c'])).toEqual(before);
  // Nothing was added: a paste of style is not a paste.
  expect(await elements(page)).toHaveLength(3);

  // The shortcut does the same.
  await undo(page);
  expect((await element(page, 'e_b')).opacity).toBe(1);
  await focusStage(page);
  await expectOneStep(page, () => page.keyboard.press('Control+Alt+v'));
  expect((await element(page, 'e_c')).opacity).toBe(0.5);
});

for (const theme of ['light', 'dark'] as const) {
  for (const { lang, dir } of [
    { lang: 'he', dir: 'rtl' },
    { lang: 'en', dir: 'ltr' },
  ] as const) {
    test(`the placement fields and the arrange menu ${theme}-${dir}-1366`, async ({ page }) => {
      await page.setViewportSize({ width: 1366, height: 768 });
      await openApp(page, { lang, theme });
      await addBoxes(page, THREE);
      await select(page, ['e_b']);
      await focusStage(page);
      await copy(page);
      await rowB(page).getByTestId('placement-tool').click();
      await expect(editor(page)).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(300);
      await page.screenshot({ path: out(`placement-${theme}-${dir}-1366`) });
      await page.keyboard.press('Escape');
      await page.getByTestId('arrange-menu').click();
      await expect(page.getByTestId('paste-style')).toBeVisible();
      await page.waitForTimeout(200);
      await page.screenshot({ path: out(`paste-style-${theme}-${dir}-1366`) });
    });
  }
}
