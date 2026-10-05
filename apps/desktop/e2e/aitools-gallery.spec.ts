import { expect, test, type Page } from '@playwright/test';
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
  await openTool(page, 'chat');
  const depth = await undoDepth(page);

  await say(page, 'תן לי ארבעה ניסוחים אחרים לכותרת');
  // The agent of the one chat reads what is selected, then offers the options for it.
  await expect(chips(page)).toHaveCount(2);
  await expect(chips(page).first()).toHaveAttribute('data-tool', 'selection_get');
  await expect(chips(page).nth(1)).toContainText('הצגת חלופות');
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

test('the options stay with their slide whatever is selected, and go with their element', async ({
  page,
}) => {
  await openApp(page, { script: 'text-variations' });
  await addBody(page, 'להשיק את העורך החדש ולהגיע לאלף משתמשים');
  await addTitle(page);
  await openTool(page, 'chat');
  await say(page, 'ניסוחים אחרים');
  await expect(cards(page)).toHaveCount(4);

  // Another selection is what the next message is about: the chat and its options stay.
  await page.evaluate(() => window.slidr!.selection.getState().selectElements(['e_body']));
  await expect(page.getByTestId('chat-user')).toHaveText('ניסוחים אחרים');
  await expect(cards(page)).toHaveCount(4);
  await page.evaluate(() => window.slidr!.selection.getState().clearSelection());
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
  await openTool(page, 'actions');
  const depth = await undoDepth(page);
  const before = await currentSlide(page);

  await runAction(page, 'slide.redesign');
  await expect(page.getByTestId('chat-user')).toHaveAttribute('data-action', 'slide.redesign');
  await expect(page.getByTestId('chat-user')).toContainText('עיצוב שקף 1 מחדש · 3 חלופות');
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
  await openTool(page, 'actions');
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

/** Offers a set of text options for the title in the AI chat, as `ui_present_options` would. */
function offer(page: Page, prompt: string, texts: string[]): Promise<void> {
  return page.evaluate(
    async ([path, prompt, texts]) => {
      const { aiOf } = (await import(/* @vite-ignore */ path)) as {
        aiOf: (editor: unknown) => {
          gallery: {
            noteToolCall: (scope: unknown, name: string, input: unknown) => void;
            service: { present: (request: unknown) => Promise<void> };
          };
        };
      };
      const editor = window.slidr!;
      const slideId = editor.selection.getState().currentSlideId!;
      const { gallery } = aiOf(editor);
      gallery.noteToolCall({ kind: 'deck' }, 'ui_present_options', { elementId: 'e_title' });
      await gallery.service.present({
        kind: 'text',
        target: { slideId, elementId: 'e_title' },
        prompt,
        options: texts.map((text, i) => ({ label: `${i + 1}`, text })),
      });
    },
    ['/src/ai/runtime.ts', prompt, texts] as const,
  );
}

test('the options offered before for the same element are a step back, and pick as the newest do (AIO-09)', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openApp(page, { script: 'text-variations' });
  await addTitle(page);
  await openTool(page, 'chat');
  await say(page, 'תן לי ארבעה ניסוחים אחרים לכותרת');
  await expect(cards(page)).toHaveCount(4);
  // One set: nothing to go back to.
  await expect(page.getByTestId('gallery-place')).toHaveCount(0);
  await cards(page).nth(1).click();
  const depth = await undoDepth(page);

  await offer(page, 'שני ניסוחים קצרים', ['תוכנית 2027', 'לאן ב-2027']);
  await expect(cards(page)).toHaveCount(2);
  await expect(gallery(page)).toContainText('שני ניסוחים קצרים');
  await expect(page.getByTestId('gallery-place')).toContainText('2 / 2');
  await expect(page.getByTestId('gallery-later')).toBeDisabled();

  // Back from the keyboard: the earlier set, with its pick marked, and the focus stays put.
  await page.getByTestId('gallery-earlier').focus();
  await page.keyboard.press('Enter');
  await expect(cards(page)).toHaveCount(4);
  await expect(gallery(page)).toContainText('ארבעה ניסוחים לכותרת');
  await expect(page.getByTestId('gallery-place')).toContainText('1 / 2');
  await expect(page.getByTestId('gallery-place')).toContainText('סט 1 מתוך 2');
  await expect(cards(page).nth(1)).toHaveAttribute('data-picked', 'true');
  await expect(page.getByTestId('gallery-earlier')).toBeFocused();

  // A card of the earlier set is tried on the Stage and picked as one undo step.
  await cards(page).nth(3).hover();
  await expect(page.getByTestId('stage-preview')).toBeVisible();
  await expect(onStage(page, 'e_title')).toHaveText('2027: צמיחה שמתחילה בתכנון');
  await cards(page).nth(3).click();
  expect(await textOf(page, 'e_title')).toBe('2027: צמיחה שמתחילה בתכנון');
  expect(await undoDepth(page)).toBe(depth + 1);
  await expect(cards(page).nth(3)).toHaveAttribute('data-picked', 'true');

  await page.getByTestId('gallery-later').click();
  await expect(cards(page)).toHaveCount(2);
  await expect(cards(page).nth(0)).not.toHaveAttribute('data-picked', 'true');

  // While the user is back on an earlier set, a new one shows itself.
  await page.getByTestId('gallery-earlier').click();
  await expect(cards(page)).toHaveCount(4);
  await offer(page, 'עוד ניסוח', ['תוכנית העבודה']);
  await expect(cards(page)).toHaveCount(1);
  await expect(page.getByTestId('gallery-place')).toContainText('3 / 3');

  // Closing the options ends the history of the element.
  await page.getByTestId('gallery-close').click();
  await expect(gallery(page)).toHaveCount(0);
  await offer(page, 'ניסוח אחר', ['תוכנית']);
  await expect(cards(page)).toHaveCount(1);
  await expect(page.getByTestId('gallery-place')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('in English, the step back points to the left', async ({ page }) => {
  await openApp(page, { script: 'text-variations', lang: 'en' });
  await addTitle(page, 'Team work plan for 2027');
  await openTool(page, 'chat');
  await offer(page, 'Two titles', ['Plan 2027', 'Where to in 2027']);
  await offer(page, 'One more', ['The plan']);
  await expect(page.getByTestId('gallery-place')).toContainText('Set 2 of 2');
  const earlier = page.getByTestId('gallery-earlier');
  const later = page.getByTestId('gallery-later');
  await expect(earlier).toHaveAccessibleName('Earlier options');
  // In a left-to-right panel, back is on the left; in Hebrew it is on the right.
  const [a, b] = await Promise.all([earlier.boundingBox(), later.boundingBox()]);
  expect(a!.x).toBeLessThan(b!.x);
});
