import { expect, test, type Locator, type Page } from '@playwright/test';
import type { LineElement, ShapeElement, SvgElement, TextElement } from '@slidr/model';
import {
  addElement,
  deck,
  dragBy,
  dragSlider,
  line,
  openApp,
  pageProblems,
  pngBytes,
  row,
  selected,
  shape,
  steps,
  undo,
  undoDepth,
} from './objects-helpers';

/*
 * Row B for shapes and lines (WG5-T04, T05: SHP-02, SHP-03, SHP-05), and the effects every element
 * has. Every control writes the model through the bus, and every gesture is one undo step: a
 * click, a typed number, and a whole drag of a slider, of the colour picker or of a gradient stop.
 */

const shapeOf = (page: Page) => selected<ShapeElement>(page);

/** The popover a row B button opened; a colour picker opened from inside it is the last one. */
const popover = (page: Page) => page.getByRole('dialog').last();

async function open(page: Page, name: string): Promise<Locator> {
  await row(page).getByRole('button', { name, exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  return page.getByRole('dialog');
}

test.afterEach(({ page }) => {
  expect(pageProblems(page)).toEqual([]);
});

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test.describe('fill', () => {
  test('a theme colour is stored as its token; a drag in the picker is one undo step', async ({
    page,
  }) => {
    await addElement(page, shape('rect'));
    const editor = (await open(page, 'מילוי')).getByTestId('fill-editor');
    await expect(editor.getByRole('radio', { name: 'מלא' })).toHaveAttribute('data-state', 'on');
    await expect(editor.getByText('ראשי')).toBeVisible();

    // A theme colour.
    await editor.getByRole('button', { name: 'צבע' }).click();
    expect(
      await steps(page, () => popover(page).getByRole('button', { name: 'הדגשה' }).click()),
    ).toBe(1);
    expect((await shapeOf(page)).fill).toEqual({ kind: 'solid', color: { token: 'accent' } });
    await expect(editor.getByText('הדגשה')).toBeVisible();

    // A free colour, dragged: many changes, one step.
    const area = popover(page).getByTestId('color-area');
    const box = (await area.boundingBox())!;
    const dragged = await steps(page, async () => {
      await page.mouse.move(box.x + 20, box.y + 20);
      await page.mouse.down();
      await page.mouse.move(box.x + 80, box.y + 40, { steps: 6 });
      await page.mouse.move(box.x + box.width - 10, box.y + 10, { steps: 6 });
      await page.mouse.up();
    });
    expect(dragged).toBe(1);
    const fill = (await shapeOf(page)).fill;
    expect(fill).toMatchObject({ kind: 'solid', color: { value: expect.stringMatching(/^#/) } });
    // The row B button shows the colour.
    await expect(
      row(page).getByRole('button', { name: 'מילוי' }).locator('span span').last(),
    ).toHaveCSS('background-color', /rgb\(/);

    await undo(page);
    expect((await shapeOf(page)).fill).toEqual({ kind: 'solid', color: { token: 'accent' } });
    await undo(page);
    expect((await shapeOf(page)).fill).toEqual({ kind: 'solid', color: { token: 'primary' } });
  });

  test('none, and back to the colour that was there', async ({ page }) => {
    await addElement(
      page,
      shape('ellipse', { fill: { kind: 'solid', color: { value: '#e5484d' } } }),
    );
    const editor = (await open(page, 'מילוי')).getByTestId('fill-editor');
    expect(await steps(page, () => editor.getByRole('radio', { name: 'ללא' }).click())).toBe(1);
    expect((await shapeOf(page)).fill).toEqual({ kind: 'none' });
    await expect(editor.getByRole('button', { name: 'צבע' })).toHaveCount(0);

    await editor.getByRole('radio', { name: 'מלא' }).click();
    expect((await shapeOf(page)).fill).toEqual({ kind: 'solid', color: { value: '#e5484d' } });
    await undo(page);
    await undo(page);
    expect((await shapeOf(page)).fill).toEqual({ kind: 'solid', color: { value: '#e5484d' } });
  });

  test('a gradient starts from the solid colour; type, angle and stops are edited', async ({
    page,
  }) => {
    await addElement(page, shape('rect'));
    const editor = (await open(page, 'מילוי')).getByTestId('fill-editor');

    // The solid colour becomes the first stop.
    expect(await steps(page, () => editor.getByRole('radio', { name: 'הדרגתי' }).click())).toBe(1);
    expect((await shapeOf(page)).fill).toEqual({
      kind: 'linear',
      angle: 90,
      stops: [
        { color: { token: 'primary' }, at: 0 },
        { color: { token: 'secondary' }, at: 1 },
      ],
    });

    // Type: the stops stay.
    expect(await steps(page, () => editor.getByRole('radio', { name: 'רדיאלי' }).click())).toBe(1);
    expect((await shapeOf(page)).fill).toMatchObject({ kind: 'radial' });
    await expect(editor.getByRole('slider', { name: 'זווית' })).toHaveCount(0);
    await editor.getByRole('radio', { name: 'קוני' }).click();
    expect((await shapeOf(page)).fill).toMatchObject({ kind: 'conic', angle: 0 });
    await editor.getByRole('radio', { name: 'קווי' }).click();
    expect((await shapeOf(page)).fill).toMatchObject({ kind: 'linear', angle: 0 });

    // Angle: typed, and dragged as one step.
    const angle = editor.getByRole('textbox', { name: 'זווית' });
    await angle.fill('45');
    expect(await steps(page, () => angle.press('Enter'))).toBe(1);
    expect((await shapeOf(page)).fill).toMatchObject({ angle: 45 });
    expect(
      await steps(page, () => dragSlider(page, editor.getByRole('slider', { name: 'זווית' }), -60)),
    ).toBe(1);
    const dragged = (await shapeOf(page)).fill as { angle: number };
    expect(dragged.angle).not.toBe(45);
    await undo(page);
    expect((await shapeOf(page)).fill).toMatchObject({ angle: 45 });

    // A click on the strip adds a stop in the colour the gradient has there.
    const strip = editor.getByTestId('gradient-strip');
    const box = (await strip.boundingBox())!;
    const added = await steps(page, () =>
      page.mouse.click(box.x + box.width / 2, box.y + box.height / 2),
    );
    expect(added).toBe(1);
    let stops = ((await shapeOf(page)).fill as { stops: { at: number; color: unknown }[] }).stops;
    expect(stops).toHaveLength(3);
    expect(stops[1]?.at).toBeGreaterThan(0.45);
    expect(stops[1]?.at).toBeLessThan(0.55);
    expect(stops[1]?.color).toMatchObject({ value: expect.stringMatching(/^#[0-9a-f]{6}$/) });
    await expect(strip.getByRole('slider')).toHaveCount(3);
    await expect(strip.getByRole('slider').nth(1)).toHaveAttribute('aria-current', 'true');

    // Its colour and its position.
    await editor.getByRole('button', { name: 'צבע הנקודה' }).click();
    await popover(page).getByRole('button', { name: 'הדגשה' }).click();
    await page.keyboard.press('Escape');
    stops = ((await shapeOf(page)).fill as typeof dragged & { stops: typeof stops }).stops;
    expect(stops[1]?.color).toEqual({ token: 'accent' });
    const position = editor.getByRole('textbox', { name: 'מיקום הנקודה' });
    await position.fill('25');
    expect(await steps(page, () => position.press('Enter'))).toBe(1);
    stops = ((await shapeOf(page)).fill as { stops: typeof stops }).stops;
    expect(stops.map((s) => s.at)).toEqual([0, 0.25, 1]);

    // Dragging a stop past another keeps them in order, and is one step.
    const first = (await strip.getByRole('slider').first().boundingBox())!;
    const moved = await steps(page, () => dragBy(page, first, box.width * 0.6));
    expect(moved).toBe(1);
    stops = ((await shapeOf(page)).fill as { stops: typeof stops }).stops;
    expect(stops.map((s) => s.color)).toEqual([
      { token: 'accent' },
      { token: 'primary' },
      { token: 'secondary' },
    ]);
    expect(stops[1]?.at).toBeGreaterThan(0.5);
    await expect(strip.getByRole('slider').nth(1)).toHaveAttribute('aria-current', 'true');
    await undo(page);
    stops = ((await shapeOf(page)).fill as { stops: typeof stops }).stops;
    expect(stops.map((s) => s.at)).toEqual([0, 0.25, 1]);

    // The keyboard moves the focused stop, and Delete removes it; two always stay.
    await strip.getByRole('slider').nth(1).focus();
    await page.keyboard.press('ArrowRight');
    stops = ((await shapeOf(page)).fill as { stops: typeof stops }).stops;
    expect(stops[1]?.at).toBe(0.26);
    expect(await steps(page, () => page.keyboard.press('Delete'))).toBe(1);
    stops = ((await shapeOf(page)).fill as { stops: typeof stops }).stops;
    expect(stops).toHaveLength(2);
    await expect(editor.getByRole('button', { name: 'הסרת הנקודה' })).toBeDisabled();
    await page.keyboard.press('Delete');
    expect(((await shapeOf(page)).fill as { stops: typeof stops }).stops).toHaveLength(2);
    // The element itself was not deleted by that key.
    expect((await deck(page)).slides[0]?.elements).toHaveLength(1);

    // Back to solid takes the first stop.
    await editor.getByRole('radio', { name: 'מלא' }).click();
    expect((await shapeOf(page)).fill).toEqual({ kind: 'solid', color: { token: 'primary' } });
  });

  test('a picture: chosen from a file, with fit and opacity', async ({ page }) => {
    await addElement(page, shape('rect'));
    const bytes = await pngBytes(page);
    const editor = (await open(page, 'מילוי')).getByTestId('fill-editor');

    const chooser = page.waitForEvent('filechooser');
    const before = await undoDepth(page);
    await editor.getByRole('radio', { name: 'תמונה' }).click();
    await (await chooser).setFiles({ name: 'texture.png', mimeType: 'image/png', buffer: bytes });
    await expect(editor.getByRole('combobox', { name: 'התאמה' })).toBeVisible();

    const fill = (await shapeOf(page)).fill as { kind: string; assetId: string; fit: string };
    expect(fill).toMatchObject({ kind: 'image', fit: 'cover' });
    expect((await deck(page)).assets[fill.assetId]).toMatchObject({ name: 'texture.png' });
    // The asset and the fill are one step.
    expect(await undoDepth(page)).toBe(before + 1);

    await editor.getByRole('combobox', { name: 'התאמה' }).click();
    await page.getByRole('option', { name: 'אריחים' }).click();
    expect((await shapeOf(page)).fill).toMatchObject({ fit: 'tile' });

    const opacity = editor.getByRole('textbox', { name: 'אטימות' });
    await opacity.fill('40');
    await opacity.press('Enter');
    expect((await shapeOf(page)).fill).toMatchObject({ opacity: 0.4 });
    expect(
      await steps(page, () => dragSlider(page, editor.getByRole('slider', { name: 'אטימות' }), 30)),
    ).toBe(1);

    // Going to a colour and back keeps the picture, without asking for a file again.
    await editor.getByRole('radio', { name: 'מלא' }).click();
    expect((await shapeOf(page)).fill).toMatchObject({ kind: 'solid' });
    await editor.getByRole('radio', { name: 'תמונה' }).click();
    expect((await shapeOf(page)).fill).toMatchObject({ kind: 'image', assetId: fill.assetId });

    // Undo all of it: the shape is solid again and the asset is gone.
    while ((await undoDepth(page)) > before) await undo(page);
    expect((await shapeOf(page)).fill).toEqual({ kind: 'solid', color: { token: 'primary' } });
    expect(Object.keys((await deck(page)).assets)).toHaveLength(0);
  });

  test('"image" without a picture changes nothing until one is chosen', async ({ page }) => {
    await addElement(page, shape('rect'));
    const editor = (await open(page, 'מילוי')).getByTestId('fill-editor');
    const chooser = page.waitForEvent('filechooser');
    const before = await undoDepth(page);
    await editor.getByRole('radio', { name: 'תמונה' }).click();
    await (await chooser).setFiles([]);
    await expect(editor.getByText('עוד לא נבחרה תמונה')).toBeVisible();
    await expect(editor.getByRole('button', { name: 'בחירת תמונה…' })).toBeVisible();
    expect(await undoDepth(page)).toBe(before);
    expect((await shapeOf(page)).fill).toMatchObject({ kind: 'solid' });
  });

  test('an imported css fill is shown as such and replaced by a choice', async ({ page }) => {
    await addElement(
      page,
      shape('rect', {
        fill: { kind: 'css', value: 'repeating-linear-gradient(45deg, #ddd 0 8px, #fff 8px 16px)' },
      }),
    );
    const editor = (await open(page, 'מילוי')).getByTestId('fill-editor');
    await expect(editor.getByText(/CSS/)).toBeVisible();
    await expect(editor.getByRole('radio', { checked: true })).toHaveCount(0);
    await editor.getByRole('radio', { name: 'מלא' }).click();
    expect((await shapeOf(page)).fill).toEqual({ kind: 'solid', color: { token: 'primary' } });
  });
});

test.describe('outline', () => {
  test('on and off, colour, width and dash', async ({ page }) => {
    await addElement(page, shape('rect'));
    const stroke = await open(page, 'קו מתאר');
    await expect(stroke.getByRole('radio', { name: 'ללא' })).toHaveAttribute('data-state', 'on');
    await expect(stroke.getByRole('slider')).toHaveCount(0);

    expect(await steps(page, () => stroke.getByRole('radio', { name: 'רציף' }).click())).toBe(1);
    expect((await shapeOf(page)).stroke).toEqual({ color: { token: 'text' }, width: 4 });

    await stroke.getByRole('radio', { name: 'מקווקו' }).click();
    expect((await shapeOf(page)).stroke).toMatchObject({ dash: 'dashed' });
    await stroke.getByRole('radio', { name: 'מנוקד' }).click();
    expect((await shapeOf(page)).stroke).toMatchObject({ dash: 'dotted' });

    const width = stroke.getByRole('textbox', { name: 'עובי' });
    await width.fill('12');
    expect(await steps(page, () => width.press('Enter'))).toBe(1);
    expect((await shapeOf(page)).stroke).toMatchObject({ width: 12 });
    expect(
      await steps(page, () => dragSlider(page, stroke.getByRole('slider', { name: 'עובי' }), -50)),
    ).toBe(1);
    expect((await shapeOf(page)).stroke?.width).toBeGreaterThan(12);
    await undo(page);
    expect((await shapeOf(page)).stroke).toMatchObject({ width: 12 });

    await stroke.getByRole('button', { name: 'צבע' }).click();
    expect(
      await steps(page, () =>
        popover(page).getByRole('button', { name: 'משני', exact: true }).click(),
      ),
    ).toBe(1);
    await page.keyboard.press('Escape');
    expect((await shapeOf(page)).stroke).toEqual({
      color: { token: 'secondary' },
      width: 12,
      dash: 'dotted',
    });
    // A rectangle's outline is a border: it has no ends and no joins to choose.
    await expect(stroke.getByRole('radiogroup', { name: 'קצוות' })).toHaveCount(0);

    // Off, and on again with what it had.
    expect(await steps(page, () => stroke.getByRole('radio', { name: 'ללא' }).click())).toBe(1);
    expect(await shapeOf(page)).not.toHaveProperty('stroke');
    await stroke.getByRole('radio', { name: 'רציף' }).click();
    expect((await shapeOf(page)).stroke).toEqual({ color: { token: 'secondary' }, width: 12 });
    await undo(page);
    await undo(page);
    expect((await shapeOf(page)).stroke).toMatchObject({ dash: 'dotted', width: 12 });
  });

  test('a drawn shape also has line ends and joins', async ({ page }) => {
    await addElement(
      page,
      shape('star5', { stroke: { color: { token: 'text' }, width: 8, dash: 'dashed' } }),
    );
    const stroke = await open(page, 'קו מתאר');
    const ends = stroke.getByRole('radiogroup', { name: 'קצוות' });
    const joins = stroke.getByRole('radiogroup', { name: 'חיבורים' });
    // What the renderer draws when the stroke names neither.
    await expect(ends.getByRole('radio', { name: 'שטוח' })).toHaveAttribute('data-state', 'on');
    await expect(joins.getByRole('radio', { name: 'חד' })).toHaveAttribute('data-state', 'on');

    expect(await steps(page, () => ends.getByRole('radio', { name: 'עגול' }).click())).toBe(1);
    expect(await steps(page, () => joins.getByRole('radio', { name: 'קטום' }).click())).toBe(1);
    expect((await shapeOf(page)).stroke).toEqual({
      color: { token: 'text' },
      width: 8,
      dash: 'dashed',
      cap: 'round',
      join: 'bevel',
    });
    await undo(page);
    expect((await shapeOf(page)).stroke).not.toHaveProperty('join');
  });
});

test.describe('corners, shadow and opacity', () => {
  test('a rectangle rounds in pixels, a rounded rectangle by its geometry, an ellipse not at all', async ({
    page,
  }) => {
    await addElement(page, shape('rect'));
    let corners = await open(page, 'פינות');
    const radius = corners.getByRole('textbox', { name: 'רדיוס' });
    await radius.fill('40');
    expect(await steps(page, () => radius.press('Enter'))).toBe(1);
    expect((await shapeOf(page)).effects).toEqual({ radius: 40 });
    expect(
      await steps(page, () =>
        dragSlider(page, corners.getByRole('slider', { name: 'רדיוס' }), -40),
      ),
    ).toBe(1);
    expect((await shapeOf(page)).effects?.radius).toBeGreaterThan(40);
    await undo(page);
    expect((await shapeOf(page)).effects).toEqual({ radius: 40 });
    await undo(page);
    expect(await shapeOf(page)).not.toHaveProperty('effects');
    await page.keyboard.press('Escape');

    await addElement(page, shape('roundRect'));
    corners = await open(page, 'פינות');
    const roundness = corners.getByRole('textbox', { name: 'עיגול' });
    await expect(roundness).toHaveValue('33');
    await roundness.fill('100');
    await roundness.press('Enter');
    expect((await shapeOf(page)).geometry).toEqual({
      kind: 'preset',
      preset: 'roundRect',
      adjust: [0.5],
    });
    await page.keyboard.press('Escape');

    await addElement(page, shape('ellipse'));
    await expect(row(page).getByRole('button', { name: 'צל', exact: true })).toBeVisible();
    await expect(row(page).getByRole('button', { name: 'פינות' })).toHaveCount(0);
  });

  test('shadow: the theme shadow when switched on, then offset, blur, spread and colour', async ({
    page,
  }) => {
    await addElement(page, shape('rect', { effects: { radius: 12 } }));
    const shadow = await open(page, 'צל');
    await expect(shadow.getByRole('radio', { name: 'ללא' })).toHaveAttribute('data-state', 'on');

    const themeShadow = (await deck(page)).theme.shadow;
    expect(await steps(page, () => shadow.getByRole('radio', { name: 'צל' }).click())).toBe(1);
    // The other effect stays.
    expect((await shapeOf(page)).effects).toEqual({ radius: 12, shadow: themeShadow });

    const x = shadow.getByRole('textbox', { name: 'היסט אופקי' });
    await x.fill('-8');
    expect(await steps(page, () => x.press('Enter'))).toBe(1);
    const y = shadow.getByRole('textbox', { name: 'היסט אנכי' });
    await y.fill('20');
    await y.press('Enter');
    expect(
      await steps(page, () => dragSlider(page, shadow.getByRole('slider', { name: 'טשטוש' }), 40)),
    ).toBe(1);
    const blurred = (await shapeOf(page)).effects?.shadow;
    expect(blurred).toMatchObject({ x: -8, y: 20 });
    expect(blurred?.blur).not.toBe(themeShadow.blur);

    // A rectangle is its own box, so its shadow can spread.
    const spread = shadow.getByRole('textbox', { name: 'התפשטות' });
    await spread.fill('6');
    await spread.press('Enter');
    expect((await shapeOf(page)).effects?.shadow).toMatchObject({ spread: 6 });
    await spread.fill('0');
    await spread.press('Enter');
    expect((await shapeOf(page)).effects?.shadow).not.toHaveProperty('spread');

    await shadow.getByRole('button', { name: 'צבע' }).click();
    await popover(page).getByRole('button', { name: 'ראשי', exact: true }).click();
    await page.keyboard.press('Escape');
    expect((await shapeOf(page)).effects?.shadow?.color).toEqual({ token: 'primary' });
    // It is drawn.
    const drawn = page.getByTestId('stage-frame').locator('[data-element-id="e_rect"]');
    await expect(drawn).toHaveCSS('filter', /drop-shadow/);

    expect(await steps(page, () => shadow.getByRole('radio', { name: 'ללא' }).click())).toBe(1);
    expect((await shapeOf(page)).effects).toEqual({ radius: 12 });
    await undo(page);
    expect((await shapeOf(page)).effects?.shadow?.color).toEqual({ token: 'primary' });
  });

  test('spread is not offered where the shadow follows the outline', async ({ page }) => {
    await addElement(
      page,
      shape('star5', { effects: { shadow: { x: 0, y: 8, blur: 16, color: { value: '#000' } } } }),
    );
    const shadow = await open(page, 'צל');
    await expect(shadow.getByRole('slider', { name: 'טשטוש' })).toBeVisible();
    await expect(shadow.getByRole('slider', { name: 'התפשטות' })).toHaveCount(0);
  });

  test('opacity: a drag of the slider is one undo step', async ({ page }) => {
    await addElement(page, shape('rect'));
    const opacity = await open(page, 'אטימות');
    const field = opacity.getByRole('textbox', { name: 'אטימות' });
    await expect(field).toHaveValue('100');
    expect(
      await steps(page, () =>
        dragSlider(page, opacity.getByRole('slider', { name: 'אטימות' }), 70),
      ),
    ).toBe(1);
    const dragged = (await shapeOf(page)).opacity;
    expect(dragged).toBeLessThan(1);
    expect(dragged).toBeGreaterThan(0);
    await expect(page.getByTestId('stage-frame').locator('[data-element-id="e_rect"]')).toHaveCSS(
      'opacity',
      String(dragged),
    );

    await field.fill('35');
    expect(await steps(page, () => field.press('Enter'))).toBe(1);
    expect((await shapeOf(page)).opacity).toBe(0.35);
    await undo(page);
    expect((await shapeOf(page)).opacity).toBe(dragged);
    await undo(page);
    expect((await shapeOf(page)).opacity).toBe(1);
  });
});

test.describe('lines', () => {
  const lineOf = (page: Page) => selected<LineElement>(page);

  test('stroke, heads and curve; a line has no fill and no "none"', async ({ page }) => {
    await addElement(page, line());
    await expect(row(page)).toHaveAttribute('data-selection', 'shape');
    await expect(row(page).getByRole('button', { name: 'מילוי' })).toHaveCount(0);
    await expect(row(page).getByRole('button', { name: 'פינות' })).toHaveCount(0);

    const stroke = await open(page, 'סגנון הקו');
    await expect(stroke.getByRole('radio', { name: 'ללא' })).toHaveCount(0);
    expect(await steps(page, () => stroke.getByRole('radio', { name: 'מקווקו' }).click())).toBe(1);
    const width = stroke.getByRole('textbox', { name: 'עובי' });
    await width.fill('9');
    await width.press('Enter');
    await stroke.getByRole('button', { name: 'צבע' }).click();
    await popover(page).getByRole('button', { name: 'ראשי', exact: true }).click();
    await page.keyboard.press('Escape');
    // A line's joins are round unless it says otherwise.
    const joins = stroke.getByRole('radiogroup', { name: 'חיבורים' });
    await expect(joins.getByRole('radio', { name: 'עגול' })).toHaveAttribute('data-state', 'on');
    await stroke
      .getByRole('radiogroup', { name: 'קצוות' })
      .getByRole('radio', { name: 'מרובע' })
      .click();
    expect((await lineOf(page)).stroke).toEqual({
      color: { token: 'primary' },
      width: 9,
      dash: 'dashed',
      cap: 'square',
    });
    await page.keyboard.press('Escape');

    const heads = await open(page, 'ראשי חץ');
    await heads.getByRole('combobox', { name: 'התחלה' }).click();
    expect(await steps(page, () => page.getByRole('option', { name: 'עיגול' }).click())).toBe(1);
    await heads.getByRole('combobox', { name: 'סוף' }).click();
    await expect(page.getByRole('option')).toHaveCount(6);
    await page.getByRole('option', { name: 'משולש' }).click();
    expect(await lineOf(page)).toMatchObject({ startHead: 'circle', endHead: 'triangle' });
    await undo(page);
    expect(await lineOf(page)).toMatchObject({ startHead: 'circle', endHead: 'none' });
    await page.keyboard.press('Escape');

    const curve = await open(page, 'צורת הקו');
    expect(await steps(page, () => curve.getByRole('radio', { name: 'מעוקל' }).click())).toBe(1);
    expect((await lineOf(page)).curve).toBe('curved');
    await curve.getByRole('radio', { name: 'זוויתי' }).click();
    expect((await lineOf(page)).curve).toBe('elbow');
    await undo(page);
    await undo(page);
    expect((await lineOf(page)).curve).toBe('straight');
  });

  test('a line has shadow and opacity too', async ({ page }) => {
    await addElement(page, line());
    const shadow = await open(page, 'צל');
    await shadow.getByRole('radio', { name: 'צל' }).click();
    expect((await lineOf(page)).effects?.shadow).toBeDefined();
    await expect(shadow.getByRole('slider', { name: 'התפשטות' })).toHaveCount(0);
  });
});

test.describe('other elements', () => {
  test('an svg gets the effects only', async ({ page }) => {
    await addElement(page, {
      id: 'e_svg',
      type: 'svg',
      frame: { x: 700, y: 300, w: 300, h: 300 },
      markup: '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#2f5bea"/></svg>',
    });
    await expect(row(page)).toHaveAttribute('data-selection', 'shape');
    for (const name of ['מילוי', 'קו מתאר', 'פינות', 'ראשי חץ']) {
      await expect(row(page).getByRole('button', { name, exact: true })).toHaveCount(0);
    }
    const opacity = await open(page, 'אטימות');
    const field = opacity.getByRole('textbox', { name: 'אטימות' });
    await field.fill('50');
    await field.press('Enter');
    expect((await selected<SvgElement>(page)).opacity).toBe(0.5);
  });

  test('a text box gets one compact effects button: opacity and shadow, no corners', async ({
    page,
  }) => {
    await addElement(page, {
      id: 'e_text',
      type: 'text',
      frame: { x: 400, y: 300, w: 900, h: 200 },
      autoFit: 'none',
      vAlign: 'top',
      content: { paragraphs: [{ dir: 'auto', align: 'start', runs: [{ text: 'שלום' }] }] },
    });
    await expect(row(page)).toHaveAttribute('data-selection', 'text');
    const effects = await open(page, 'אפקטים');
    await expect(effects.getByRole('slider', { name: 'רדיוס' })).toHaveCount(0);

    expect(
      await steps(page, () =>
        dragSlider(page, effects.getByRole('slider', { name: 'אטימות' }), 60),
      ),
    ).toBe(1);
    expect((await selected<TextElement>(page)).opacity).toBeLessThan(1);

    expect(await steps(page, () => effects.getByRole('radio', { name: 'צל' }).click())).toBe(1);
    expect((await selected<TextElement>(page)).effects?.shadow).toEqual(
      (await deck(page)).theme.shadow,
    );
    // The shadow of a text box follows its glyphs: no spread.
    await expect(effects.getByRole('slider', { name: 'התפשטות' })).toHaveCount(0);
    await undo(page);
    await undo(page);
    expect(await selected<TextElement>(page)).toMatchObject({ opacity: 1 });
    expect(await selected<TextElement>(page)).not.toHaveProperty('effects');
  });

  test('an html element rounds its corners from the compact effects', async ({ page }) => {
    await addElement(page, {
      id: 'e_html',
      type: 'html',
      frame: { x: 500, y: 300, w: 600, h: 300 },
      markup: '<div style="height:100%;background:var(--color-primary)">HTML</div>',
      hasScripts: false,
    });
    await expect(row(page)).toHaveAttribute('data-selection', 'html');
    const effects = await open(page, 'אפקטים');
    const radius = effects.getByRole('textbox', { name: 'רדיוס' });
    await radius.fill('30');
    await radius.press('Enter');
    expect((await selected(page)).effects).toEqual({ radius: 30 });
    await expect(effects.getByRole('slider', { name: 'אטימות' })).toBeVisible();
  });
});
