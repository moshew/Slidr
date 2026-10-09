import { expect, test, type Page } from '@playwright/test';
import type { ShapeElement, SvgElement } from '@slidr/model';
import {
  addIcon,
  addShape,
  addTitle,
  cards,
  chips,
  collectErrors,
  element,
  gallery,
  ICON_MARKUP,
  lastSent,
  openApp,
  openTool,
  runAction,
  undoDepth,
} from './aitools-helpers';

/*
 * The AI actions of a shape and of an icon (AIO-06), against the scripted mock agent: another
 * shape, a colouring from the theme and another icon are each a choice, offered as cards that
 * draw the element as the option would leave it, tried on the Stage and applied as one undo step.
 */

const action = (page: Page, id: string) => page.locator(`[data-action="${id}"]`);
const undo = (page: Page) => page.evaluate(() => window.slidr!.bus.undo());
const shape = (page: Page) => element<ShapeElement>(page, 'e_shape');
const icon = (page: Page) => element<SvgElement>(page, 'e_icon');

test('a shape: other shapes and colourings from the theme, as cards and one undo step each', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openApp(page, { script: 'shape-actions' });
  await addTitle(page, 'שלבי העבודה');
  await addShape(page);
  await openTool(page, 'actions');
  // A shape with words in it has the actions of its text, and its own beside them.
  await expect(action(page, 'text.shorten')).toBeEnabled();
  await expect(action(page, 'shape.suggest')).toBeEnabled();
  await expect(action(page, 'shape.colour')).toBeEnabled();
  await expect(action(page, 'icon.replace')).toHaveCount(0);

  await runAction(page, 'shape.suggest');
  await expect(page.getByTestId('chat-user')).toHaveText('3 צורות אחרות');
  // The agent is told the names of the shapes the app draws.
  const sent = await lastSent(page);
  expect(sent).toContain('ui_present_options, kind "element"');
  expect(sent).toMatch(/^shapes: \["rect","roundRect","ellipse",/m);
  await expect(gallery(page)).toHaveAttribute('data-kind', 'element');
  await expect(cards(page)).toHaveCount(3);
  await expect(cards(page).nth(0)).toContainText('שברון: שלב שמוביל הלאה');
  // Each card draws the shape itself, with its words.
  await expect(cards(page).nth(0).locator('[data-element-id="e_shape"]')).toContainText('תכנון');

  const before = await shape(page);
  const depth = await undoDepth(page);
  await cards(page).nth(0).hover();
  await expect(page.getByTestId('stage-preview')).toBeVisible();
  expect(await shape(page)).toEqual(before);
  await cards(page).nth(0).click();
  expect((await shape(page)).geometry).toEqual({ kind: 'preset', preset: 'chevron' });
  expect((await shape(page)).fill).toEqual(before.fill);
  expect((await shape(page)).content).toEqual(before.content);
  expect(await undoDepth(page)).toBe(depth + 1);

  // The colourings are tokens of the theme, and one of them brings an outline with it.
  await openTool(page, 'actions');
  await runAction(page, 'shape.colour');
  await expect(page.getByTestId('chat-user').nth(1)).toHaveText('צביעה לפי התבנית · 3 חלופות');
  await expect(cards(page)).toHaveCount(3);
  await cards(page).nth(1).click();
  expect(await shape(page)).toMatchObject({
    fill: { kind: 'solid', color: { token: 'surface' } },
    stroke: { color: { token: 'muted' }, width: 2 },
    // The shape picked a moment ago stays.
    geometry: { kind: 'preset', preset: 'chevron' },
  });
  expect(await undoDepth(page)).toBe(depth + 2);
  await undo(page);
  expect((await shape(page)).fill).toEqual(before.fill);
  expect((await shape(page)).stroke).toBeUndefined();
  // Neither turn wrote to the deck: the picks are the user's own steps.
  await expect(page.getByTestId('undo-turn')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('an icon: icons of the library are offered in its place, and colourings from the theme', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openApp(page, { script: 'icon-actions' });
  await addTitle(page, 'היעד שלנו');
  await addIcon(page);
  // Row B keeps the icon's shape tools without a selection type label.
  await expect(page.getByTestId('top-tools-b')).toHaveAttribute('data-selection', 'shape');
  await expect(page.getByTestId('selection-label')).toHaveCount(0);
  await openTool(page);
  await expect(page.getByTestId('focus-chip')).toHaveText(/^אייקון/);
  await openTool(page, 'actions');
  await expect(action(page, 'icon.replace')).toBeEnabled();
  await expect(action(page, 'shape.colour')).toBeEnabled();
  await expect(action(page, 'shape.suggest')).toHaveCount(0);

  const turn = await runAction(page, 'icon.replace');
  await expect(page.getByTestId('chat-user')).toHaveText('4 אייקונים מתאימים יותר');
  await expect(chips(page).filter({ hasText: 'חיפוש אייקונים' })).toHaveCount(1);
  await expect(turn).toHaveAttribute('data-outcome', 'completed');
  await expect(cards(page)).toHaveCount(3);
  for (const index of [0, 1, 2]) {
    await expect(cards(page).nth(index)).toHaveAttribute('data-state', 'ready');
    await expect(cards(page).nth(index).locator('[data-element-id="e_icon"] svg')).toBeVisible();
  }

  const before = await icon(page);
  const depth = await undoDepth(page);
  await cards(page).nth(1).hover();
  await expect(page.getByTestId('stage-preview')).toBeVisible();
  expect((await icon(page)).markup).toBe(ICON_MARKUP);
  await cards(page).nth(1).click();
  const picked = await icon(page);
  expect(picked.markup).not.toBe(ICON_MARKUP);
  expect(picked.markup).toContain('<svg');
  expect(picked.frame).toEqual(before.frame);
  expect(picked.colorOverrides).toEqual(before.colorOverrides);
  expect(await undoDepth(page)).toBe(depth + 1);

  await openTool(page, 'actions');
  await runAction(page, 'shape.colour');
  await expect(cards(page)).toHaveCount(2);
  await cards(page).nth(0).click();
  expect((await icon(page)).colorOverrides).toEqual({ currentColor: { token: 'primary' } });
  expect((await icon(page)).markup).toBe(picked.markup);
  await undo(page);
  await undo(page);
  expect(await icon(page)).toEqual(before);
  expect(errors).toEqual([]);
});

test('the actions of a shape and of an icon in English', async ({ page }) => {
  await openApp(page, { script: 'shape-actions', lang: 'en' });
  await addShape(page);
  await openTool(page);
  await expect(page.getByTestId('focus-chip')).toHaveText(/^Shape/);
  await openTool(page, 'actions');
  await expect(action(page, 'shape.suggest')).toHaveText('Suggest a shape');
  await expect(action(page, 'shape.colour')).toHaveText('Colour by the template');
  await runAction(page, 'shape.suggest');
  await expect(page.getByTestId('chat-user')).toHaveText('3 other shapes');
  await expect(gallery(page)).toHaveAttribute('aria-label', 'Pick an option');
  await addIcon(page);
  await openTool(page);
  await expect(page.getByTestId('focus-chip')).toHaveText(/^Icon/);
  await openTool(page, 'actions');
  await expect(action(page, 'icon.replace')).toHaveText('A more fitting icon');
});
