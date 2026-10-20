import { expect, test, type Page } from '@playwright/test';
import {
  addBoxes,
  copy,
  currentSlide,
  elements,
  expectOneStep,
  focusFilmstrip,
  focusStage,
  openApp,
  order,
  paste,
  select,
  selectedSlides,
  slideIds,
  SLIDR_MIME,
  THREE,
  thumb,
} from './arrange-helpers';

/*
 * Managing slides in the Filmstrip (WG5-T08, SLD-01, FLM-02, FLM-03): the slide menu on a
 * multi-selection, Ctrl+M and Ctrl+D, copy and paste of slides, and a new slide from a layout.
 */

/** Three more slides after the first, each with a box, so that a copy can be told from a blank. */
async function fourSlides(page: Page): Promise<string[]> {
  await page.evaluate(() => {
    const { bus } = window.slidr!;
    const slide = (n: number) => ({
      type: 'slide.add' as const,
      slide: {
        id: `s_${n}`,
        name: `Slide ${n}`,
        elements: [
          {
            id: `e_box_${n}`,
            type: 'shape' as const,
            frame: { x: 200 * n, y: 200, w: 300, h: 300 },
            rotation: 0,
            opacity: 1,
            geometry: { kind: 'preset' as const, preset: 'rect' },
            fill: { kind: 'solid' as const, color: { token: 'accent' as const } },
          },
        ],
        timeline: [],
      },
    });
    bus.batch([slide(2), slide(3), slide(4)]);
  });
  return slideIds(page);
}

const slides = (page: Page) =>
  page.evaluate(() =>
    window.slidr!.bus.deck.slides.map((s) => ({
      id: s.id,
      name: s.name,
      hidden: s.hidden,
      layoutId: s.layoutId,
      elements: s.elements.map((e) => ({ id: e.id, type: e.type, role: e.role })),
    })),
  );

async function menuItem(page: Page, slideId: string, name: string) {
  await thumb(page, slideId).click({ button: 'right' });
  return page.getByTestId('slide-menu').getByRole('menuitem', { name });
}

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test('the slide menu acts on the multi-selection: duplicate, hide and show, delete', async ({
  page,
}) => {
  test.slow();
  const ids = await fourSlides(page);
  await thumb(page, ids[1]!).click();
  await thumb(page, ids[2]!).click({ modifiers: ['Control'] });

  // Duplicate: the copies go in as a block after the last of the selection, and are selected.
  const duplicate = await menuItem(page, ids[2]!, 'שכפול');
  await expectOneStep(page, () => duplicate.click());
  let deck = await slides(page);
  expect(deck.map((s) => s.name)).toEqual([
    undefined,
    'Slide 2',
    'Slide 3',
    'Slide 2',
    'Slide 3',
    'Slide 4',
  ]);
  const copies = deck.slice(3, 5);
  expect(await selectedSlides(page)).toEqual(copies.map((s) => s.id));
  expect(new Set(deck.map((s) => s.id)).size).toBe(6);
  expect(new Set(deck.flatMap((s) => s.elements.map((e) => e.id))).size).toBe(5);

  // Hide: the slides stay in the strip, each with its mark; the same item then shows them.
  const hide = await menuItem(page, copies[0]!.id, 'הסתרה');
  await expectOneStep(page, () => hide.click());
  deck = await slides(page);
  expect(deck.map((s) => Boolean(s.hidden))).toEqual([false, false, false, true, true, false]);
  await expect(page.getByTestId('slide-hidden-mark')).toHaveCount(2);
  await expect(thumb(page, copies[0]!.id)).toHaveAttribute('aria-label', 'שקף 4, מוסתר');
  const show = await menuItem(page, copies[1]!.id, 'הצגה');
  await expectOneStep(page, () => show.click());
  expect((await slides(page)).some((s) => s.hidden)).toBe(false);
  await expect(page.getByTestId('slide-hidden-mark')).toHaveCount(0);

  // Delete.
  const remove = await menuItem(page, copies[0]!.id, 'מחיקה');
  await expectOneStep(page, () => remove.click());
  expect(await slideIds(page)).toEqual(ids);
});

test('a right click outside the selection acts on that slide alone; "new slide" appends', async ({
  page,
}) => {
  const ids = await fourSlides(page);
  await thumb(page, ids[1]!).click();
  await thumb(page, ids[2]!).click({ modifiers: ['Control'] });
  const add = await menuItem(page, ids[0]!, 'שקף חדש');
  expect(await selectedSlides(page)).toEqual([ids[0]]);
  await expectOneStep(page, () => add.click());
  const after = await slideIds(page);
  expect(after).toHaveLength(5);
  expect(after.slice(0, -1)).toEqual(ids);
  expect(await currentSlide(page)).toBe(after.at(-1));
});

test('the new-slide button appends even when a middle slide is selected', async ({ page }) => {
  const ids = await fourSlides(page);
  await thumb(page, ids[1]!).click();
  await expectOneStep(page, () => page.getByTestId('new-slide').click());
  const after = await slideIds(page);
  expect(after.slice(0, -1)).toEqual(ids);
  expect(await currentSlide(page)).toBe(after.at(-1));
});

test('Ctrl+M appends a slide; Ctrl+D in the Filmstrip duplicates slides', async ({ page }) => {
  const ids = await fourSlides(page);
  await thumb(page, ids[1]!).click();
  await expectOneStep(page, () => page.keyboard.press('Control+m'));
  let now = await slideIds(page);
  expect(now).toHaveLength(5);
  expect(now.slice(0, -1)).toEqual(ids);
  expect(await currentSlide(page)).toBe(now.at(-1));

  // The focus is in the Filmstrip: Ctrl+D is about slides.
  await thumb(page, ids[3]!).click();
  await expectOneStep(page, () => page.keyboard.press('Control+d'));
  const deck = await slides(page);
  expect(deck.map((s) => s.name).slice(3, 5)).toEqual(['Slide 4', 'Slide 4']);
  expect(await currentSlide(page)).toBe(deck[4]!.id);

  // On the Stage it is about the selected element, and the slides stay as they are.
  await thumb(page, ids[1]!).click();
  now = await slideIds(page);
  await select(page, ['e_box_2']);
  await focusStage(page);
  await page.keyboard.press('Control+d');
  expect(await slideIds(page)).toEqual(now);
  expect(await order(page)).toHaveLength(2);
});

test('copy and paste of slides from the menu: after the current slide, with new ids', async ({
  page,
}) => {
  const ids = await fourSlides(page);
  // Nothing was copied yet.
  await expect(await menuItem(page, ids[1]!, 'הדבקה')).toHaveAttribute('data-disabled', '');
  await page.keyboard.press('Escape');

  await thumb(page, ids[1]!).click();
  await thumb(page, ids[2]!).click({ modifiers: ['Shift'] });
  await (await menuItem(page, ids[2]!, 'העתקה')).click();
  expect(await slideIds(page)).toEqual(ids);

  await thumb(page, ids[3]!).click();
  const pasteItem = await menuItem(page, ids[3]!, 'הדבקה');
  await expectOneStep(page, () => pasteItem.click());
  const deck = await slides(page);
  expect(deck.map((s) => s.name)).toEqual([
    undefined,
    'Slide 2',
    'Slide 3',
    'Slide 4',
    'Slide 2',
    'Slide 3',
  ]);
  expect(new Set(deck.map((s) => s.id)).size).toBe(6);
  expect(new Set(deck.flatMap((s) => s.elements.map((e) => e.id))).size).toBe(5);
  expect(await selectedSlides(page)).toEqual(deck.slice(4).map((s) => s.id));
});

test('cut and paste of slides from the menu moves them', async ({ page }) => {
  const ids = await fourSlides(page);
  const cut = await menuItem(page, ids[1]!, 'גזירה');
  await expectOneStep(page, () => cut.click());
  expect(await slideIds(page)).toEqual([ids[0], ids[2], ids[3]]);

  const pasteItem = await menuItem(page, ids[3]!, 'הדבקה');
  await expectOneStep(page, () => pasteItem.click());
  expect((await slides(page)).map((s) => s.name)).toEqual([
    undefined,
    'Slide 3',
    'Slide 4',
    'Slide 2',
  ]);
});

test('copy and paste of slides through the clipboard events, also into another deck', async ({
  page,
}) => {
  const ids = await fourSlides(page);
  await thumb(page, ids[2]!).click();
  await focusFilmstrip(page);
  const clip = await copy(page);
  const payload = JSON.parse(clip[SLIDR_MIME]!) as { kind: string; slides: { id: string }[] };
  expect(payload.kind).toBe('slides');
  expect(payload.slides.map((s) => s.id)).toEqual([ids[2]]);

  // A slide clip pastes as slides wherever the focus is: here it is on the Stage.
  await thumb(page, ids[0]!).click();
  await focusStage(page);
  await expectOneStep(page, () => paste(page, clip));
  let deck = await slides(page);
  expect(deck.map((s) => s.name)).toEqual([undefined, 'Slide 3', 'Slide 2', 'Slide 3', 'Slide 4']);
  expect(await currentSlide(page)).toBe(deck[1]!.id);

  // Another deck in the same window.
  await page.evaluate(() => {
    const { bus } = window.slidr!;
    bus.reset({
      ...structuredClone(bus.deck),
      id: '01K6ANOTHERDECK00000000000',
      slides: [{ id: 's_other', elements: [], timeline: [] }],
    });
  });
  await focusFilmstrip(page);
  await expectOneStep(page, () => paste(page, clip));
  deck = await slides(page);
  expect(deck.map((s) => s.name)).toEqual([undefined, 'Slide 3']);
  expect(deck[1]!.elements).toHaveLength(1);
  await expect(
    page.getByTestId('stage-surface').locator(`[data-element-id="${deck[1]!.elements[0]!.id}"]`),
  ).toBeVisible();

  // Cut through the clipboard event removes the selected slides.
  await focusFilmstrip(page);
  await expectOneStep(page, () => copy(page, 'cut'));
  expect((await slides(page)).map((s) => s.id)).toEqual(['s_other']);
});

test('elements copied on one slide paste on another picked in the Filmstrip', async ({ page }) => {
  await addBoxes(page, THREE);
  const ids = await fourSlides(page);
  await select(page, ['e_a', 'e_b']);
  await focusStage(page);
  const clip = await copy(page);
  await thumb(page, ids[2]!).click();
  // The focus is in the Filmstrip now; the clip is of elements, so they go on the slide shown.
  await expectOneStep(page, () => paste(page, clip));
  expect((await elements(page)).map((e) => e.frame.x)).toEqual([600, 100, 400]);
  expect(await slideIds(page)).toEqual(ids);
});

test.describe('with layouts in the deck', () => {
  test.beforeEach(async ({ page }) => {
    await page.evaluate(() => {
      const { bus } = window.slidr!;
      const bar = {
        id: 'e_layout_bar',
        type: 'shape' as const,
        frame: { x: 160, y: 100, w: 240, h: 16 },
        rotation: 0,
        opacity: 1,
        geometry: { kind: 'preset' as const, preset: 'rect' },
        fill: { kind: 'solid' as const, color: { token: 'accent' as const } },
      };
      bus.reset({
        ...structuredClone(bus.deck),
        layouts: [
          {
            id: 'l_title',
            name: 'כותרת וטקסט',
            archetype: 'textImage',
            placeholders: [
              {
                id: 'p_title',
                role: 'title',
                frame: { x: 160, y: 140, w: 1600, h: 160 },
                styleRef: 'title',
              },
              {
                id: 'p_body',
                role: 'body',
                frame: { x: 160, y: 340, w: 760, h: 600 },
                styleRef: 'body',
              },
              { id: 'p_image', role: 'image', frame: { x: 1000, y: 340, w: 760, h: 600 } },
            ],
            decorations: [bar],
          },
          {
            id: 'l_section',
            name: 'פתיח פרק',
            archetype: 'section',
            background: { fill: { kind: 'solid', color: { token: 'primary' } } },
            placeholders: [
              {
                id: 'p_section',
                role: 'title',
                frame: { x: 160, y: 400, w: 1600, h: 280 },
                styleRef: 'display',
                align: 'center',
                vAlign: 'middle',
              },
            ],
            decorations: [],
          },
        ],
      });
    });
  });

  test('the "new slide" button offers the layouts, and the slide is built from the one chosen', async ({
    page,
  }) => {
    await page.getByTestId('new-slide').click();
    const choices = page.getByTestId('layout-choices');
    await expect(choices.getByRole('button')).toHaveText(['שקף ריק', 'כותרת וטקסט', 'פתיח פרק']);
    await page.screenshot({ path: 'test-results/arrange/layout-choices.png' });

    await expectOneStep(page, () => choices.locator('[data-layout="l_title"]').click());
    await expect(choices).toHaveCount(0);
    let deck = await slides(page);
    expect(deck).toHaveLength(2);
    expect(deck[1]).toMatchObject({
      layoutId: 'l_title',
      elements: [
        { type: 'text', role: 'title' },
        { type: 'text', role: 'body' },
        { type: 'image', role: 'image' },
      ],
    });
    expect(await currentSlide(page)).toBe(deck[1]!.id);
    // The layout's decoration is drawn by the renderer, not copied into the slide.
    expect(deck[1]!.elements.some((e) => e.id === 'e_layout_bar')).toBe(false);

    // Ctrl+M takes the layout of the slide it is added after.
    await expectOneStep(page, () => page.keyboard.press('Control+m'));
    deck = await slides(page);
    expect(deck.map((s) => s.layoutId)).toEqual([undefined, 'l_title', 'l_title']);

    // "Blank" is the first choice.
    await page.getByTestId('new-slide').click();
    await expectOneStep(page, () =>
      page.getByTestId('layout-choices').locator('[data-layout=""]').click(),
    );
    deck = await slides(page);
    expect(deck).toHaveLength(4);
    expect(deck[3]).toMatchObject({ elements: [] });
    expect(deck[3]!.layoutId).toBeUndefined();
  });

  test('the slide menu offers the layouts too', async ({ page }) => {
    const [first] = await slideIds(page);
    const trigger = await menuItem(page, first!, 'שקף חדש');
    await trigger.hover();
    const item = page.getByRole('menuitem', { name: 'פתיח פרק' });
    await expect(item).toBeInViewport();
    // As a hand moves: along the row into the submenu, then to the item.
    const row = (await trigger.boundingBox())!;
    const box = (await item.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, row.y + row.height / 2, { steps: 8 });
    await expectOneStep(page, () => item.click());
    const deck = await slides(page);
    expect(deck[1]).toMatchObject({ layoutId: 'l_section', elements: [{ role: 'title' }] });
  });

  test('a copied slide brings its layout into a deck that lacks it', async ({ page }) => {
    await page.getByTestId('new-slide').click();
    await page.getByTestId('layout-choices').locator('[data-layout="l_section"]').click();
    await focusFilmstrip(page);
    const clip = await copy(page);
    await page.evaluate(() => {
      const { bus } = window.slidr!;
      bus.reset({
        ...structuredClone(bus.deck),
        id: '01K6ANOTHERDECK00000000000',
        layouts: [],
        slides: [{ id: 's_other', elements: [], timeline: [] }],
      });
    });
    await focusFilmstrip(page);
    await expectOneStep(page, () => paste(page, clip));
    expect((await slides(page))[1]!.layoutId).toBe('l_section');
    expect(await page.evaluate(() => window.slidr!.bus.deck.layouts.map((l) => l.id))).toEqual([
      'l_section',
    ]);
  });
});
