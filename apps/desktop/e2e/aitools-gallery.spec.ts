import { expect, test } from '@playwright/test';
import {
  addBody,
  addImage,
  addTitle,
  cards,
  chips,
  collectErrors,
  currentSlide,
  deck,
  element,
  gallery,
  onStage,
  openApp,
  openTool,
  runAction,
  say,
  textOf,
  TITLE,
  undoDepth,
} from './aitools-helpers';

/*
 * The variations gallery (WG11-T08), against the scripted mock agent: the acceptance of WG11
 * (asking for four variations of a title shows four cards, hovering one shows it on the slide,
 * and a click applies it as one undo step), and the same for designs of a slide and for images.
 */

test('four variations of a title: four cards, a hover on the slide, a click as one undo step', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openApp(page, { script: 'text-variations' });
  await addTitle(page);
  await openTool(page, 'ai.object', 'chat');
  const depth = await undoDepth(page);

  await say(page, 'תן לי ארבעה ניסוחים אחרים לכותרת');
  await expect(chips(page)).toContainText('הצגת חלופות');
  await expect(gallery(page)).toHaveAttribute('data-kind', 'text');
  await expect(gallery(page)).toContainText('ארבעה ניסוחים לכותרת');
  await expect(cards(page)).toHaveCount(4);
  await expect(cards(page).nth(1)).toContainText('לאן אנחנו הולכים ב-2027?');
  await expect(cards(page).nth(1)).toContainText('שאלה');
  // Offering options changes nothing.
  expect(await textOf(page, 'e_title')).toBe(TITLE);
  expect(await undoDepth(page)).toBe(depth);

  // A hover shows the option on the slide; the deck stays as it is.
  await cards(page).nth(1).hover();
  await expect(page.getByTestId('stage-preview')).toBeVisible();
  await expect(onStage(page, 'e_title')).toHaveText('לאן אנחנו הולכים ב-2027?');
  expect(await textOf(page, 'e_title')).toBe(TITLE);
  expect(await undoDepth(page)).toBe(depth);

  // Leaving the card takes the preview down.
  await page.getByTestId('chat-input').hover();
  await expect(page.getByTestId('stage-preview')).toHaveCount(0);
  await expect(onStage(page, 'e_title')).toHaveText(TITLE);

  // A click applies it: one undo step, in the formatting of the text it replaces.
  await cards(page).nth(1).click();
  expect(await textOf(page, 'e_title')).toBe('לאן אנחנו הולכים ב-2027?');
  expect(await undoDepth(page)).toBe(depth + 1);
  await expect(cards(page).nth(1)).toHaveAttribute('data-picked', 'true');
  const title = await element(page, 'e_title');
  expect(title.type === 'text' && title.content.paragraphs[0]).toMatchObject({
    styleRef: 'heading',
    runs: [{ text: 'לאן אנחנו הולכים ב-2027?', marks: { color: { token: 'primary' } } }],
  });

  // Undo takes the pick back, and its mark with it; redo brings both.
  await page.evaluate(() => window.slidr!.bus.undo());
  expect(await textOf(page, 'e_title')).toBe(TITLE);
  await expect(cards(page).nth(1)).not.toHaveAttribute('data-picked', 'true');
  await page.evaluate(() => window.slidr!.bus.redo());
  expect(await textOf(page, 'e_title')).toBe('לאן אנחנו הולכים ב-2027?');
  await expect(cards(page).nth(1)).toHaveAttribute('data-picked', 'true');

  // Another card is another step. Markdown in an option becomes formatting.
  await cards(page).nth(3).click();
  expect(await textOf(page, 'e_title')).toBe('2027: צמיחה שמתחילה בתכנון');
  expect(await undoDepth(page)).toBe(depth + 2);

  await page.getByTestId('gallery-close').click();
  await expect(gallery(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the options belong to the element they were offered for', async ({ page }) => {
  await openApp(page, { script: 'text-variations' });
  await addBody(page, 'להשיק את העורך החדש ולהגיע לאלף משתמשים');
  await addTitle(page);
  await openTool(page, 'ai.object', 'chat');
  await say(page, 'ניסוחים אחרים');
  await expect(cards(page)).toHaveCount(4);

  // Another selection is another chat, with no options of its own.
  await page.evaluate(() => window.slidr!.selection.getState().selectElements(['e_body']));
  await expect(gallery(page)).toHaveCount(0);
  await expect(page.getByTestId('chat-user')).toHaveCount(0);

  // Back on the title, its chat and its options are there.
  await page.evaluate(() => window.slidr!.selection.getState().selectElements(['e_title']));
  await expect(page.getByTestId('chat-user')).toHaveText('ניסוחים אחרים');
  await expect(cards(page)).toHaveCount(4);

  // Options for an element that was deleted are gone.
  await page.evaluate(() => {
    const { bus, selection } = window.slidr!;
    const slideId = selection.getState().currentSlideId!;
    bus.dispatch({ type: 'element.remove', slideId, elementIds: ['e_title'] });
  });
  await expect(gallery(page)).toHaveCount(0);
});

test('three designs of a slide: thumbnails, a hover on the Stage, a click as one undo step', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openApp(page, { script: 'slide-redesign' });
  await addTitle(page, 'שלושת היעדים של 2027');
  await openTool(page, 'ai.slide', 'actions');
  const depth = await undoDepth(page);
  const before = await currentSlide(page);

  await runAction(page, 'slide.redesign');
  await expect(page.getByTestId('chat-user')).toHaveAttribute('data-action', 'slide.redesign');
  await expect(page.getByTestId('chat-user')).toContainText('עיצוב השקף מחדש · 3 חלופות');
  await expect(gallery(page)).toHaveAttribute('data-kind', 'layout');
  await expect(cards(page)).toHaveCount(3);
  for (const card of await cards(page).all()) {
    await expect(card).toHaveAttribute('data-state', 'ready');
  }
  await expect(cards(page).nth(2)).toContainText('מספר גדול');
  // The cards are slides: each draws its own design.
  await expect(cards(page).nth(1).locator('[data-element-id]').first()).toBeVisible();
  expect(await currentSlide(page)).toEqual(before);

  // The hover shows the whole design on the Stage, without the handles of the real elements.
  await cards(page).nth(2).hover();
  await expect(page.getByTestId('stage-surface')).toHaveAttribute('data-previewing', 'true');
  await expect(page.getByTestId('stage-frame')).toContainText('יעדים לשנת 2027');
  await expect(onStage(page, 'e_title')).toHaveCount(0);
  expect(await currentSlide(page)).toEqual(before);

  await cards(page).nth(2).click();
  await expect(page.getByTestId('stage-surface')).not.toHaveAttribute('data-previewing', 'true');
  const after = await currentSlide(page);
  expect(after.id).toBe(before.id);
  expect(after.elements.map((e) => e.id)).not.toContain('e_title');
  expect(after.elements.length).toBeGreaterThan(1);
  expect(await undoDepth(page)).toBe(depth + 1);

  // One step back is the slide as it was, to the last field.
  await page.evaluate(() => window.slidr!.bus.undo());
  expect(await currentSlide(page)).toEqual(before);
  await page.evaluate(() => window.slidr!.bus.redo());
  expect((await currentSlide(page)).elements).toEqual(after.elements);
  expect(errors).toEqual([]);
});

test('image alternatives arrive one by one, and the pick keeps the frame and the crop', async ({
  page,
}) => {
  const errors = collectErrors(page);
  // The mock provider takes about two seconds an image; the script plays at its own pace.
  await openApp(page, { script: 'image-alternatives', speed: 0.2 });
  const first = await addImage(page);
  await openTool(page, 'ai.object', 'actions');
  await expect(page.getByTestId('image-provider')).toHaveAttribute('data-state', 'ready');
  const depth = await undoDepth(page);

  await page.locator('[data-action="image.alternatives"]').click();
  // The cards are there before the images: four of them, waiting.
  await expect(cards(page)).toHaveCount(4);
  await expect(gallery(page)).toContainText(/יוצר תמונות · \d מתוך 4/);
  await expect(cards(page).first()).toHaveAttribute('data-state', 'pending');
  // They fill in as each image is made, not all at the end.
  await expect(cards(page).first()).toHaveAttribute('data-state', 'ready', { timeout: 15_000 });
  await expect(cards(page).last()).toHaveAttribute('data-state', 'pending');
  await expect(cards(page).first().locator('img')).toBeVisible();

  // When the agent presents them, the cards carry its labels.
  await expect(cards(page).first()).toContainText('נמל בזריחה', { timeout: 30_000 });
  for (const card of await cards(page).all()) {
    await expect(card).toHaveAttribute('data-state', 'ready');
  }
  const picture = await element(page, 'e_picture');
  expect(picture.type === 'image' && picture.assetId).toBe(first);

  const src = await onStage(page, 'e_picture').locator('img').getAttribute('src');
  await cards(page).nth(2).hover();
  await expect(page.getByTestId('stage-preview')).toBeVisible();
  await expect(onStage(page, 'e_picture').locator('img')).not.toHaveAttribute('src', src!);

  const turnSteps = (await undoDepth(page)) - depth;
  await cards(page).nth(2).click();
  const picked = await element(page, 'e_picture');
  expect(picked.type === 'image' && picked.assetId).not.toBe(first);
  expect(picked).toMatchObject({
    frame: { x: 1000, y: 200, w: 760, h: 520 },
    crop: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 },
    fit: 'cover',
  });
  expect((await deck(page)).assets[(picked as { assetId: string }).assetId]).toMatchObject({
    origin: 'ai',
  });
  expect(await undoDepth(page)).toBe(depth + turnSteps + 1);
  await page.evaluate(() => window.slidr!.bus.undo());
  expect(await element(page, 'e_picture')).toEqual(picture);
  expect(errors).toEqual([]);
});
