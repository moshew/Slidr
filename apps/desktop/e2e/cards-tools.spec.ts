import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import type { GroupElement, ShapeElement, TextElement } from '@slidr/model';
import { shapePresets } from '@slidr/renderer';
import {
  addElement,
  currentSlide,
  dragSlider,
  onStage,
  openApp,
  pageProblems,
  row,
  selected,
  shape,
  steps,
  undo,
  undoDepth,
} from './objects-helpers';

/*
 * The editor's tools for a card (ADR-073): the coloured side of a box (its accent) in row B, the
 * same tools for a card that is selected as the group it is, and the card of the shape library.
 * Every control writes the model through the bus, and every gesture is one undo step. The last
 * tests write pictures for the design gate to test-results/cards/; nothing is compared.
 */

const out = (name: string) =>
  fileURLToPath(new URL(`../test-results/cards/${name}.png`, import.meta.url));

async function openShapes(page: Page) {
  await page.getByTestId('top-tools-a').locator('[data-tool="insert.elements"]').click();
  const collection = page.getByTestId('elements-panel').locator('[data-collection="shapes"]');
  if (await collection.isVisible()) await collection.click();
  return page.getByTestId('elements-shapes');
}

const surface = { kind: 'solid', color: { token: 'surface' } };

/** A card as a converted slide has it: a group of the box and of what lies on it. */
const card = (box: Record<string, unknown> = {}) => ({
  id: 'e_card',
  type: 'group',
  frame: { x: 640, y: 380, w: 560, h: 280 },
  children: [
    {
      id: 'e_box',
      type: 'shape',
      rotation: 0,
      opacity: 1,
      frame: { x: 0, y: 0, w: 560, h: 280 },
      geometry: { kind: 'preset', preset: 'rect' },
      fill: surface,
      effects: { radius: 24 },
      ...box,
    },
    {
      id: 'e_words',
      type: 'text',
      rotation: 0,
      opacity: 1,
      frame: { x: 40, y: 48, w: 480, h: 180 },
      autoFit: 'none',
      vAlign: 'top',
      content: {
        paragraphs: [
          { dir: 'auto', align: 'start', styleRef: 'heading', runs: [{ text: 'שלוש דקות' }] },
          { dir: 'auto', align: 'start', styleRef: 'body', runs: [{ text: 'מהבקשה ועד התשובה' }] },
        ],
      },
    },
  ],
});

const shapeOf = (page: Page) => selected<ShapeElement>(page);
const groupOf = (page: Page) => selected<GroupElement>(page);
const boxOf = async (page: Page) => (await groupOf(page)).children[0] as ShapeElement;

/** The popover a row B button opened; a colour picker opened from inside it is the last one. */
const popover = (page: Page) => page.getByRole('dialog').last();

async function open(page: Page, name: string): Promise<Locator> {
  await row(page).getByRole('button', { name, exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  return page.getByRole('dialog');
}

/** A choice of the side control. Its segments are icons, named by what they choose. */
const side = (popover: Locator, name: string) => popover.getByRole('radio', { name, exact: true });

test.afterEach(({ page }) => {
  expect(pageProblems(page)).toEqual([]);
});

test.describe('the accent of a box', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
  });

  test('side, colour, thickness and corners of a rounded rectangle; undo restores', async ({
    page,
  }) => {
    await addElement(page, shape('roundRect', { fill: surface }));
    const before = await undoDepth(page);
    const accent = await open(page, 'פס צבע');
    await expect(side(accent, 'ללא פס')).toHaveAttribute('aria-checked', 'true');
    // Without an accent there is nothing more to set.
    await expect(accent.getByRole('slider')).toHaveCount(0);
    // The sides are icons, and none of them shows its name over the others as the popover opens.
    await expect(accent).toBeFocused();
    await expect(page.getByRole('tooltip')).toHaveCount(0);

    // A side: a new accent, thin and in the theme's primary colour.
    expect(await steps(page, () => side(accent, 'למעלה').click())).toBe(1);
    expect((await shapeOf(page)).accent).toEqual({
      side: 'top',
      size: 8,
      fill: { kind: 'solid', color: { token: 'primary' } },
    });
    await expect(side(accent, 'למעלה')).toHaveAttribute('aria-checked', 'true');

    // The deck reads from the right: its start side is the right side of the box.
    expect(await steps(page, () => side(accent, 'בצד ההתחלה').click())).toBe(1);
    expect((await shapeOf(page)).accent?.side).toBe('right');
    await side(accent, 'בצד הסוף').click();
    expect((await shapeOf(page)).accent?.side).toBe('left');
    await side(accent, 'בצד ההתחלה').click();

    // Its colour is the fill editor's: a theme colour is stored as its token.
    await accent.getByRole('button', { name: 'צבע' }).click();
    expect(
      await steps(page, () => popover(page).getByRole('button', { name: 'הדגשה' }).click()),
    ).toBe(1);
    await page.keyboard.press('Escape');
    expect((await shapeOf(page)).accent?.fill).toEqual({
      kind: 'solid',
      color: { token: 'accent' },
    });
    // A stripe is too thin for a picture, and "none" is a side, not a colour.
    await expect(accent.getByRole('radio', { name: 'תמונה' })).toHaveCount(0);
    await expect(accent.getByRole('radio', { name: 'ללא', exact: true })).toHaveCount(0);

    // Thickness: typed, and dragged as one step.
    const size = accent.getByRole('textbox', { name: 'עובי' });
    await size.fill('20');
    expect(await steps(page, () => size.press('Enter'))).toBe(1);
    expect((await shapeOf(page)).accent?.size).toBe(20);
    expect(
      await steps(page, () => dragSlider(page, accent.getByRole('slider', { name: 'עובי' }), -40)),
    ).toBe(1);
    expect((await shapeOf(page)).accent?.size).toBeGreaterThan(20);
    await undo(page);
    expect((await shapeOf(page)).accent?.size).toBe(20);

    // Around the rounded corners, as a border goes: the renderer draws it as one.
    const around = accent.getByRole('switch', { name: 'עוקף את הפינות המעוגלות' });
    await expect(around).toHaveAttribute('aria-checked', 'false');
    expect(await steps(page, () => around.click())).toBe(1);
    expect((await shapeOf(page)).accent).toEqual({
      side: 'right',
      size: 20,
      fill: { kind: 'solid', color: { token: 'accent' } },
      corners: 'follow',
    });
    const drawn = onStage(page, 'e_roundrect').locator('div');
    await expect
      .poll(() =>
        drawn.evaluateAll((layers) =>
          layers.some((layer) => getComputedStyle(layer).borderRightWidth === '20px'),
        ),
      )
      .toBe(true);

    // A gradient cannot go around them: the accent is cut again, and the switch says why.
    expect(await steps(page, () => accent.getByRole('radio', { name: 'הדרגתי' }).click())).toBe(1);
    const striped = (await shapeOf(page)).accent;
    expect(striped?.fill).toMatchObject({ kind: 'linear' });
    expect(striped).not.toHaveProperty('corners');
    await expect(around).toBeDisabled();
    await expect(accent.getByText('רק פס בצבע אחד יכול לעקוף את הפינות.')).toBeVisible();
    await undo(page);
    await expect(around).toBeEnabled();
    await expect(around).toHaveAttribute('aria-checked', 'true');

    // None takes the field away, and a side brings the accent back as it was.
    expect(await steps(page, () => side(accent, 'ללא פס').click())).toBe(1);
    expect(await shapeOf(page)).not.toHaveProperty('accent');
    await side(accent, 'למטה').click();
    expect((await shapeOf(page)).accent).toEqual({
      side: 'bottom',
      size: 20,
      fill: { kind: 'solid', color: { token: 'accent' } },
      corners: 'follow',
    });

    // Undo, step by step, back to the bare shape.
    while ((await undoDepth(page)) > before) await undo(page);
    expect(await shapeOf(page)).not.toHaveProperty('accent');
    await expect(side(accent, 'ללא פס')).toHaveAttribute('aria-checked', 'true');
  });

  test('is offered for a box only, and its corners only where they are rounded', async ({
    page,
  }) => {
    await addElement(page, shape('star5'));
    await expect(row(page).getByRole('button', { name: 'קו מתאר' })).toBeVisible();
    await expect(row(page).getByRole('button', { name: 'פס צבע' })).toHaveCount(0);

    // A new shape is filled with the primary colour, so its accent starts from another one.
    await addElement(page, shape('rect'));
    const accent = await open(page, 'פס צבע');
    await side(accent, 'למעלה').click();
    expect((await shapeOf(page)).accent?.fill).toEqual({
      kind: 'solid',
      color: { token: 'accent' },
    });
    await expect(accent.getByRole('slider', { name: 'עובי' })).toBeVisible();
    await expect(accent.getByRole('switch')).toHaveCount(0);
  });
});

test.describe('a card selected as a group', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
  });

  test('gets the tools of its box: they change the first child, and opacity the whole card', async ({
    page,
  }) => {
    await addElement(page, card());
    await expect(row(page)).toHaveAttribute('data-selection', 'group');
    for (const name of ['מילוי', 'קו מתאר', 'פס צבע', 'פינות', 'צל', 'אטימות']) {
      await expect(row(page).getByRole('button', { name, exact: true })).toBeVisible();
    }
    // They stand in for the one effects button of a group.
    await expect(row(page).getByRole('button', { name: 'אפקטים' })).toHaveCount(0);
    const before = await undoDepth(page);

    // Fill.
    const fill = (await open(page, 'מילוי')).getByTestId('fill-editor');
    await fill.getByRole('button', { name: 'צבע' }).click();
    expect(
      await steps(page, () =>
        popover(page).getByRole('button', { name: 'משני', exact: true }).click(),
      ),
    ).toBe(1);
    expect((await boxOf(page)).fill).toEqual({ kind: 'solid', color: { token: 'secondary' } });
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');

    // Outline.
    const stroke = await open(page, 'קו מתאר');
    expect(await steps(page, () => stroke.getByRole('radio', { name: 'רציף' }).click())).toBe(1);
    expect((await boxOf(page)).stroke).toEqual({ color: { token: 'text' }, width: 4 });
    await page.keyboard.press('Escape');

    // Accent: around the corners of the box, which are rounded.
    const accent = await open(page, 'פס צבע');
    expect(await steps(page, () => side(accent, 'למעלה').click())).toBe(1);
    await accent.getByRole('switch', { name: 'עוקף את הפינות המעוגלות' }).click();
    expect((await boxOf(page)).accent).toEqual({
      side: 'top',
      size: 8,
      fill: { kind: 'solid', color: { token: 'primary' } },
      corners: 'follow',
    });
    await page.keyboard.press('Escape');

    // Corners and shadow are the box's too.
    const corners = await open(page, 'פינות');
    const radius = corners.getByRole('textbox', { name: 'רדיוס' });
    await expect(radius).toHaveValue('24');
    await radius.fill('40');
    expect(await steps(page, () => radius.press('Enter'))).toBe(1);
    await page.keyboard.press('Escape');
    const shadow = await open(page, 'צל');
    await shadow.getByRole('radio', { name: 'צל' }).click();
    const themeShadow = await page.evaluate(() => window.slidr!.bus.deck.theme.shadow);
    expect((await boxOf(page)).effects).toEqual({ radius: 40, shadow: themeShadow });
    await page.keyboard.press('Escape');

    // The group itself was not painted, and it is still what is selected.
    let group = await groupOf(page);
    expect(group).toMatchObject({ id: 'e_card', type: 'group', opacity: 1 });
    expect(group).not.toHaveProperty('effects');
    expect(group.children[1]).toEqual(card().children[1]);

    // Opacity is the card's: the box and the text on it fade as one.
    const opacity = await open(page, 'אטימות');
    const field = opacity.getByRole('textbox', { name: 'אטימות' });
    await field.fill('50');
    expect(await steps(page, () => field.press('Enter'))).toBe(1);
    group = await groupOf(page);
    expect(group.opacity).toBe(0.5);
    expect(group.children[0]?.opacity).toBe(1);
    await expect(onStage(page, 'e_card')).toHaveCSS('opacity', '0.5');

    // Each change was one step, and undoing them all gives the card back as it was.
    while ((await undoDepth(page)) > before) await undo(page);
    expect(await groupOf(page)).toMatchObject({ rotation: 0, opacity: 1, ...card() });
  });

  test('a shadow that the group itself has is the one the shadow tool shows and takes away', async ({
    page,
  }) => {
    const own = { x: 0, y: 8, blur: 24, color: { value: '#000000', alpha: 0.3 } };
    await addElement(page, { ...card(), effects: { shadow: own } });
    const shadow = await open(page, 'צל');
    await expect(shadow.getByRole('radio', { name: 'צל' })).toHaveAttribute('aria-checked', 'true');
    await expect(shadow.getByRole('textbox', { name: 'היסט אנכי' })).toHaveValue('8');

    expect(await steps(page, () => shadow.getByRole('radio', { name: 'ללא' }).click())).toBe(1);
    expect(await groupOf(page)).not.toHaveProperty('effects');
    expect((await boxOf(page)).effects).toEqual({ radius: 24 });

    // Switched on again it is the box's, which is what casts it, and it is the same shadow.
    await shadow.getByRole('radio', { name: 'צל' }).click();
    expect(await groupOf(page)).not.toHaveProperty('effects');
    expect((await boxOf(page)).effects).toEqual({ radius: 24, shadow: own });
  });

  test('a group that is not a card keeps the one effects button', async ({ page }) => {
    // The box is only a part of this group: a badge hangs over its corner.
    const parts = card().children;
    await addElement(page, {
      id: 'e_group',
      type: 'group',
      frame: { x: 640, y: 360, w: 600, h: 300 },
      children: [
        { ...parts[0], frame: { x: 0, y: 20, w: 560, h: 280 } },
        { ...parts[1], frame: { x: 40, y: 68, w: 480, h: 180 } },
        {
          id: 'e_badge',
          type: 'shape',
          rotation: 0,
          opacity: 1,
          frame: { x: 520, y: 0, w: 80, h: 80 },
          geometry: { kind: 'preset', preset: 'ellipse' },
          fill: { kind: 'solid', color: { token: 'accent' } },
        },
      ],
    });
    await expect(row(page)).toHaveAttribute('data-selection', 'group');
    await expect(row(page).getByRole('button', { name: 'אפקטים' })).toBeVisible();
    for (const name of ['מילוי', 'קו מתאר', 'פס צבע', 'פינות']) {
      await expect(row(page).getByRole('button', { name, exact: true })).toHaveCount(0);
    }
  });
});

test.describe('the card of the shape library', () => {
  test('inserts one group of a box and its text, selected; one undo removes it', async ({
    page,
  }) => {
    await openApp(page);
    await openShapes(page);
    // The shapes are all there as they were; the card is under them.
    await expect(page.getByTestId('elements-shapes').locator('[data-preset]')).toHaveCount(
      shapePresets.length,
    );
    const cards = page.getByRole('group', { name: 'כרטיסים' });
    await expect(cards.getByRole('button')).toHaveCount(1);

    const before = await undoDepth(page);
    await cards.getByRole('button', { name: 'כרטיס' }).click();
    await expect(page.getByTestId('elements-shapes')).toBeVisible();
    await expect(row(page)).toHaveAttribute('data-selection', 'group');
    expect(await undoDepth(page)).toBe(before + 1);

    const slide = await currentSlide(page);
    expect(slide.elements).toHaveLength(1);
    const group = await groupOf(page);
    expect(group.id).toBe(slide.elements[0]?.id);
    expect(group.children.map((child) => child.type)).toEqual(['shape', 'text']);
    const [box, words] = group.children as [ShapeElement, TextElement];
    expect(box).toMatchObject({
      frame: { x: 0, y: 0, w: group.frame.w, h: group.frame.h },
      fill: { kind: 'solid', color: { token: 'surface' } },
      accent: { side: 'top', fill: { kind: 'solid', color: { token: 'primary' } } },
    });
    // In the middle of the slide.
    expect(group.frame.x + group.frame.w / 2).toBe(960);
    expect(Math.abs(group.frame.y + group.frame.h / 2 - 540)).toBeLessThanOrEqual(0.5);
    // Its words are in the language of the deck.
    expect(words.content.paragraphs.map((p) => [p.styleRef, p.align, p.runs[0]?.text])).toEqual([
      ['heading', 'start', 'כותרת הכרטיס'],
      ['body', 'start', 'כמה מילים על הנושא של הכרטיס, בשורה או שתיים.'],
    ]);
    // It is drawn, the text inside the box, and the keyboard is the Stage's.
    await expect(onStage(page, group.id)).toBeVisible();
    await expect(onStage(page, words.id)).toContainText('כותרת הכרטיס');
    const outer = (await onStage(page, box.id).boundingBox())!;
    const inner = (await onStage(page, words.id).boundingBox())!;
    expect(inner.x).toBeGreaterThan(outer.x);
    expect(inner.x + inner.width).toBeLessThan(outer.x + outer.width);
    expect(inner.y + inner.height).toBeLessThan(outer.y + outer.height);
    await expect(page.getByTestId('stage-surface')).toBeFocused();
    // And it is a card to row B at once.
    await expect(row(page).getByRole('button', { name: 'פס צבע' })).toBeVisible();

    await undo(page);
    expect((await currentSlide(page)).elements).toHaveLength(0);
    await expect(row(page)).toHaveAttribute('data-selection', 'none');
  });

  test('speaks the language of the deck, and a second card steps aside', async ({ page }) => {
    await openApp(page, { lang: 'en' });
    await openShapes(page);
    await page.getByRole('group', { name: 'Cards' }).getByRole('button', { name: 'Card' }).click();
    const first = await groupOf(page);
    const words = first.children[1] as TextElement;
    expect(words.content.paragraphs.map((p) => p.runs[0]?.text)).toEqual([
      'Card title',
      'A few words about what this card is for, in a line or two.',
    ]);

    await openShapes(page);
    await page.getByRole('group', { name: 'Cards' }).getByRole('button', { name: 'Card' }).click();
    const second = await groupOf(page);
    expect(second.id).not.toBe(first.id);
    expect(second.frame).toMatchObject({ x: first.frame.x + 24, y: first.frame.y + 24 });
    expect((await currentSlide(page)).elements).toHaveLength(2);
  });
});

test.describe('for the design gate', () => {
  async function settle(page: Page) {
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(200);
  }

  test('Hebrew, right to left, light: the library, and the accent of a new card', async ({
    page,
  }) => {
    await openApp(page, { lang: 'he', theme: 'light' });
    await openShapes(page);
    await expect(page.getByRole('group', { name: 'כרטיסים' })).toBeVisible();
    await settle(page);
    await page.screenshot({ path: out('tools-library-light-rtl') });

    await page.getByRole('group', { name: 'כרטיסים' }).getByRole('button').click();
    const accent = await open(page, 'פס צבע');
    await expect(accent.getByRole('slider', { name: 'עובי' })).toBeVisible();
    await settle(page);
    await page.screenshot({ path: out('tools-accent-card-light-rtl') });
  });

  test('English, left to right, dark: the accent of a card around its corners', async ({
    page,
  }) => {
    await openApp(page, { lang: 'en', theme: 'dark' });
    await openShapes(page);
    await page.getByRole('group', { name: 'Cards' }).getByRole('button').click();
    const accent = await open(page, 'Colour stripe');
    await side(accent, 'Start side').click();
    const size = accent.getByRole('textbox', { name: 'Thickness' });
    await size.fill('16');
    await size.press('Enter');
    await accent.getByRole('switch', { name: 'Goes around the rounded corners' }).click();
    expect((await boxOf(page)).accent).toMatchObject({ side: 'left', size: 16, corners: 'follow' });
    await settle(page);
    await page.screenshot({ path: out('tools-accent-card-dark-ltr') });
  });
});
