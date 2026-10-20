import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { addShape, editor, onStage, open, tool } from './editor-text-helpers';
import { addText, edit, editingId, element, para, select, steps } from './text-helpers';

/*
 * Text effects (WG4-T10, TXT-11), in the app: a gradient fill, an outline and a shadow of all the
 * text of a box, kept as CSS of the element. Every change is one undo step, a drag too; and the
 * effects are drawn in the exported file.
 */

test.describe.configure({ timeout: 120_000 });

const ID = 'e_fx';

type Css = Record<string, string> | undefined;
const css = async (page: Page, id = ID): Promise<Css> =>
  ((await element(page, id)) as unknown as { css?: Record<string, string> }).css;

const effects = (page: Page) => tool(page, 'אפקטים לטקסט');
const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true });
const choice = (page: Page, name: string) => page.getByRole('radio', { name, exact: true });

/**
 * Closes the colour picker that is open over the effects popover, with Esc, as a person would: a
 * swatch that was clicked shows its tooltip, the first Esc closes that, and the next the picker.
 * The effects popover under it stays open.
 */
async function closePicker(page: Page) {
  const area = page.getByTestId('color-area');
  for (let i = 0; i < 3 && (await area.isVisible()); i++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }
  await expect(area).toHaveCount(0);
  await expect(tab(page, 'מילוי')).toBeVisible();
}

/** One undo step that Ctrl+Z takes back whole; returns the CSS the step left. */
async function oneStep(page: Page, action: () => Promise<void>, id = ID): Promise<Css> {
  const before = await css(page, id);
  const stepsBefore = await steps(page);
  await action();
  await expect.poll(() => steps(page)).toBe(stepsBefore + 1);
  const after = await css(page, id);
  expect(after).not.toEqual(before);
  await page.evaluate(() => window.slidr!.bus.undo());
  expect(await css(page, id)).toEqual(before);
  await page.evaluate(() => window.slidr!.bus.redo());
  expect(await css(page, id)).toEqual(after);
  return after;
}

const GRADIENT = {
  'background-image': 'linear-gradient(90deg, var(--color-primary), var(--color-accent))',
  'background-clip': 'text',
  '-webkit-background-clip': 'text',
  '-webkit-text-fill-color': 'transparent',
};

test.beforeEach(async ({ page }) => {
  await open(page);
  await addText(
    page,
    ID,
    [
      {
        dir: 'auto',
        align: 'center',
        runs: [{ text: 'כותרת גדולה', marks: { size: 140, weight: 800 } }],
      },
    ],
    { frame: { x: 160, y: 160, w: 1600, h: 260 } },
  );
  await select(page, ID);
});

test('a gradient fill: on, its colours and its angle, and off again', async ({ page }) => {
  await effects(page).click();
  await expect(tab(page, 'מילוי')).toHaveAttribute('aria-selected', 'true');
  await expect(choice(page, 'צבע הטקסט')).toBeChecked();

  expect(await oneStep(page, () => choice(page, 'מעבר צבע').click())).toEqual(GRADIENT);
  // On the Stage the letters are painted by the background of the box.
  const letters = onStage(page, ID).locator('p');
  expect(await letters.evaluate((p) => getComputedStyle(p).webkitTextFillColor)).toBe(
    'rgba(0, 0, 0, 0)',
  );
  expect(await onStage(page, ID).evaluate((box) => getComputedStyle(box).backgroundClip)).toBe(
    'text',
  );

  // A colour of the theme stays a token, so the fill follows the theme.
  const picked = await oneStep(page, async () => {
    await page.getByRole('button', { name: 'צבע שני', exact: true }).click();
    await page.getByRole('button', { name: 'משני', exact: true }).click();
  });
  expect(picked?.['background-image']).toBe(
    'linear-gradient(90deg, var(--color-primary), var(--color-secondary))',
  );
  await closePicker(page);

  // The angle: a drag of the slider is one undo step, however many values it passes.
  const thumb = page.getByRole('slider', { name: 'זווית' });
  const box = (await thumb.boundingBox())!;
  const dragged = await oneStep(page, async () => {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++)
      await page.mouse.move(box.x + box.width / 2 - i * 8, box.y + box.height / 2);
    await page.mouse.up();
  });
  const angle = Number(/linear-gradient\((\d+)deg/.exec(dragged?.['background-image'] ?? '')?.[1]);
  expect(angle).not.toBe(90);
  // And typed.
  const typed = await oneStep(page, async () => {
    const field = page.getByRole('textbox', { name: 'זווית' });
    await field.fill('45');
    await field.press('Enter');
  });
  expect(typed?.['background-image']).toContain('linear-gradient(45deg,');

  // Off: the element is left with no CSS at all. On again: what it was.
  expect(await oneStep(page, () => choice(page, 'צבע הטקסט').click())).toBeUndefined();
  await choice(page, 'מעבר צבע').click();
  expect((await css(page))?.['background-image']).toBe(typed?.['background-image']);
});

test('an outline and a shadow, beside the fill', async ({ page }) => {
  await effects(page).click();
  await choice(page, 'מעבר צבע').click();

  await tab(page, 'קו מתאר').click();
  await expect(choice(page, 'ללא')).toBeChecked();
  const outlined = await oneStep(page, () => choice(page, 'קו מתאר').click());
  expect(outlined).toEqual({
    ...GRADIENT,
    '-webkit-text-stroke': '2px var(--color-text)',
    'paint-order': 'stroke fill',
  });
  const wider = await oneStep(page, async () => {
    const width = page.getByRole('textbox', { name: 'עובי' });
    await width.fill('6');
    await width.press('Enter');
  });
  expect(wider?.['-webkit-text-stroke']).toBe('6px var(--color-text)');
  expect(
    await onStage(page, ID)
      .locator('p')
      .evaluate((p) => getComputedStyle(p).webkitTextStrokeWidth),
  ).toBe('6px');

  await tab(page, 'צל').click();
  const shadowed = await oneStep(page, () => choice(page, 'צל').click());
  expect(shadowed?.['text-shadow']).toMatch(/^-?[\d.]+px -?[\d.]+px [\d.]+px .+/);
  const moved = await oneStep(page, async () => {
    const x = page.getByRole('textbox', { name: 'היסט אופקי' });
    await x.fill('12');
    await x.press('Enter');
  });
  expect(moved?.['text-shadow']).toMatch(/^12px /);
  // The other effects are as they were.
  expect(moved).toMatchObject({ ...GRADIENT, '-webkit-text-stroke': '6px var(--color-text)' });
  expect(
    await onStage(page, ID)
      .locator('p')
      .evaluate((p) => getComputedStyle(p).textShadow),
  ).toContain('12px');

  // Esc closes the popover, and the Stage has the keyboard again.
  await page.keyboard.press('Escape');
  await expect(tab(page, 'צל')).toHaveCount(0);
  await expect(page.getByTestId('stage-surface')).toBeFocused();
});

test('while the text is edited the effects are the box’s, and the editor shows them', async ({
  page,
}) => {
  await edit(page, ID);
  await effects(page).click();
  await choice(page, 'מעבר צבע').click();
  expect(await css(page)).toEqual(GRADIENT);
  expect(
    await editor(page)
      .locator('p')
      .evaluate((p) => getComputedStyle(p).webkitTextFillColor),
  ).toBe('rgba(0, 0, 0, 0)');
  await page.keyboard.press('Escape');
  expect(await editingId(page)).toBe(ID);
  await expect(editor(page)).toBeFocused();
});

test('CSS that came with a deck shows as custom, and stays until that effect is changed', async ({
  page,
}) => {
  const imported = {
    'clip-path': 'inset(0 round 24px)',
    'text-shadow': '0 0 4px red, 0 0 12px blue',
  };
  await addText(page, 'e_imported', [para('Imported glow')], {
    frame: { x: 160, y: 520, w: 900, h: 140 },
    css: imported,
  });
  await select(page, 'e_imported');
  await effects(page).click();
  await tab(page, 'צל').click();
  await expect(page.getByText('עיצוב שהגיע עם המצגת')).toBeVisible();

  // Another effect leaves it alone.
  await tab(page, 'קו מתאר').click();
  await choice(page, 'קו מתאר').click();
  expect(await css(page, 'e_imported')).toEqual({
    ...imported,
    '-webkit-text-stroke': '2px var(--color-text)',
    'paint-order': 'stroke fill',
  });

  // Switching the shadow on replaces it; what is not a text effect is still there.
  await tab(page, 'צל').click();
  await choice(page, 'צל').click();
  const after = await css(page, 'e_imported');
  expect(after?.['text-shadow']).not.toBe(imported['text-shadow']);
  expect(after?.['clip-path']).toBe(imported['clip-path']);
  await expect(page.getByText('עיצוב שהגיע עם המצגת')).toHaveCount(0);
});

test('the effects follow the theme, and are drawn in the exported file, on a shape too', async ({
  page,
  context,
}) => {
  await addShape(page, 'e_shape', {
    content: {
      paragraphs: [
        {
          dir: 'auto',
          align: 'center',
          runs: [{ text: 'צורה', marks: { size: 96, weight: 800 } }],
        },
      ],
    },
  });
  await select(page, ID);
  await effects(page).click();
  await choice(page, 'מעבר צבע').click();
  await tab(page, 'קו מתאר').click();
  await choice(page, 'קו מתאר').click();
  await tab(page, 'צל').click();
  await choice(page, 'צל').click();
  await page.keyboard.press('Escape');

  // The text of a shape: its effects are set while it is being edited.
  await edit(page, 'e_shape');
  await effects(page).click();
  await choice(page, 'מעבר צבע').click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  expect(await css(page, 'e_shape')).toEqual(GRADIENT);

  // A new primary colour: the gradient on the Stage is drawn with it.
  await page.evaluate(() =>
    window.slidr!.bus.dispatch({
      type: 'theme.update',
      patch: { colors: { primary: '#ff0000' } },
    }),
  );
  await expect
    .poll(() => onStage(page, ID).evaluate((box) => getComputedStyle(box).backgroundImage))
    .toContain('rgb(255, 0, 0)');

  const html = await page.evaluate(async (path) => {
    // Through Vite, like every module of the page; not a path the compiler should resolve.
    const mod = (await import(/* @vite-ignore */ path)) as {
      exportDeck: (
        editor: unknown,
        deck: unknown,
        choices: { range: null; animations: boolean },
      ) => Promise<{ html: string }>;
    };
    const app = window.slidr!;
    return (await mod.exportDeck(app, app.bus.deck, { range: null, animations: true })).html;
  }, '/src/export/exportDeck.ts');
  const file = fileURLToPath(new URL('../test-results/editor/effects.html', import.meta.url));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);

  const exported = await context.newPage();
  await exported.goto(pathToFileURL(file).href);
  await exported.waitForSelector('html.slidr-ready');
  const drawn = await exported.evaluate(
    (ids) => {
      const read = (id: string) => {
        const box = document.querySelector(`[data-element-id="${id}"]`)!;
        const text = box.querySelector('p')!;
        const style = getComputedStyle(text);
        return {
          fill: style.webkitTextFillColor,
          stroke: style.webkitTextStrokeWidth,
          shadow: style.textShadow,
          boxImage: getComputedStyle(box).backgroundImage,
          boxClip: getComputedStyle(box).backgroundClip,
          // For a shape: the box of the text itself, over the shape's fill.
          textClip: getComputedStyle(text.closest('[data-slidr-text]')!.parentElement!)
            .backgroundClip,
        };
      };
      return { text: read(ids.text), shape: read(ids.shape) };
    },
    { text: ID, shape: 'e_shape' },
  );
  expect(drawn.text.fill).toBe('rgba(0, 0, 0, 0)');
  expect(drawn.text.boxClip).toBe('text');
  expect(drawn.text.boxImage).toContain('linear-gradient(90deg, rgb(255, 0, 0)');
  expect(drawn.text.stroke).toBe('2px');
  expect(drawn.text.shadow).not.toBe('none');
  expect(drawn.shape.fill).toBe('rgba(0, 0, 0, 0)');
  expect(drawn.shape.textClip).toBe('text');
});
