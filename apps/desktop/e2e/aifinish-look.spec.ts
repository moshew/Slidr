import { expect, test } from '@playwright/test';
import { collectErrors, input, openTool, panel } from './aitools-helpers';
import {
  deck,
  fontCard,
  look,
  onFilmstrip,
  onStage,
  openLook,
  paletteCard,
  pointAway,
  previewLabel,
  templateCard,
  undoDepth,
} from './aifinish-look-helpers';

/*
 * The look of the deck in the Actions tab of the deck tool (WG11-T04, WG7-T11b; AID-05, THM-03):
 * the template gallery, the palettes and the font pairs. A hover, or the keyboard's focus, shows
 * a look on the Stage and changes nothing; a click applies it as one undo step.
 */

/** The curated pair with a serif for headings and a sans for the body. */
const SERIF = 'Noto Serif Hebrew|Playfair Display|Noto Sans Hebrew|DM Sans';

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAABCAYAAAD5PA/NAAAAEElEQVR42mNk+M9QzwAEAAmGAYCF+yOnAAAAAElFTkSuQmCC',
  'base64',
);

test('the template gallery: a hover shows the deck on the template, a click switches it', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openLook(page);
  const before = await deck(page);
  const depth = await undoDepth(page);
  expect(before.theme.id).toBe('zerem');
  expect(before.slides).toHaveLength(3);
  await expect(look(page, 'template').locator('[data-template]')).toHaveCount(10);
  await expect(templateCard(page, 'zerem')).toHaveAttribute('data-current', 'true');
  await expect(templateCard(page, 'zerem')).toHaveAttribute('aria-pressed', 'true');
  // A cover is the template's opening slide, with the photograph of one that opens with one.
  const photo = templateCard(page, 'shvil').locator('img').first();
  await expect
    .poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  expect(await onStage(page, '--color-bg')).toBe(before.theme.colors.bg);

  // The hover: the Stage draws the deck as the template would leave it, and nothing changed.
  await templateCard(page, 'shvil').hover();
  await expect(previewLabel(page)).toBeVisible();
  await expect.poll(() => onStage(page, '--color-bg')).not.toBe(before.theme.colors.bg);
  const shown = await onStage(page, '--color-bg');
  expect(await deck(page)).toEqual(before);
  expect(await undoDepth(page)).toBe(depth);
  // The Filmstrip keeps showing the deck itself.
  expect(await onFilmstrip(page, '--color-bg')).toBe(before.theme.colors.bg);

  await pointAway(page);
  await expect(previewLabel(page)).toHaveCount(0);
  expect(await onStage(page, '--color-bg')).toBe(before.theme.colors.bg);

  // The click: one undo step, and the deck is on the template, slides and layouts with it.
  await templateCard(page, 'shvil').click();
  await expect(templateCard(page, 'shvil')).toHaveAttribute('data-current', 'true');
  await expect(templateCard(page, 'zerem')).not.toHaveAttribute('data-current');
  await expect(previewLabel(page)).toHaveCount(0);
  const after = await deck(page);
  expect(after.theme.id).toBe('shvil');
  expect(after.theme.colors.bg).toBe(shown);
  expect(after.slides.map((slide) => slide.layoutId)).toEqual([
    'l_shvil_hero',
    'l_shvil_cards',
    'l_shvil_big_number',
  ]);
  expect(await undoDepth(page)).toBe(depth + 1);

  await page.keyboard.press('Control+z');
  expect(await deck(page)).toEqual(before);
  expect(await undoDepth(page)).toBe(depth);
  // The pointer is still on the card: the Stage shows the deck, not the look that was undone.
  await expect(previewLabel(page)).toHaveCount(0);
  expect(await onStage(page, '--color-bg')).toBe(before.theme.colors.bg);
  await page.keyboard.press('Control+y');
  expect(await deck(page)).toEqual(after);
  expect(errors).toEqual([]);
});

test('the palettes: a hover shows the colours on the slide, a click sets them in one step', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openLook(page);
  const before = await deck(page);
  const depth = await undoDepth(page);
  // The palettes of the ten templates, then the seven curated ones; the deck's own is marked.
  await expect(look(page, 'palette').locator('[data-palette]')).toHaveCount(17);
  await expect(paletteCard(page, 'template:zerem')).toHaveAttribute('data-current', 'true');
  await expect(look(page, 'palette').locator('[data-current]')).toHaveCount(1);

  await paletteCard(page, 'forest').hover();
  await expect(previewLabel(page)).toBeVisible();
  await expect.poll(() => onStage(page, '--color-bg')).not.toBe(before.theme.colors.bg);
  const shown = {
    bg: await onStage(page, '--color-bg'),
    primary: await onStage(page, '--color-primary'),
    chart: await onStage(page, '--color-chart-1'),
  };
  expect(await deck(page)).toEqual(before);
  expect(await undoDepth(page)).toBe(depth);

  await pointAway(page);
  await expect(previewLabel(page)).toHaveCount(0);
  expect(await onStage(page, '--color-bg')).toBe(before.theme.colors.bg);

  await paletteCard(page, 'forest').click();
  await expect(paletteCard(page, 'forest')).toHaveAttribute('data-current', 'true');
  await expect(look(page, 'palette').locator('[data-current]')).toHaveCount(1);
  await expect(previewLabel(page)).toHaveCount(0);
  const after = await deck(page);
  expect(after.theme.colors).toMatchObject({ bg: shown.bg, primary: shown.primary });
  expect(after.theme.colors.chart[0]).toBe(shown.chart);
  // Only the colours changed: the deck stays on its template, with its fonts and its slides.
  expect({ ...after, theme: { ...after.theme, colors: before.theme.colors } }).toEqual(before);
  await expect(templateCard(page, 'zerem')).toHaveAttribute('data-current', 'true');
  expect(await undoDepth(page)).toBe(depth + 1);

  await page.keyboard.press('Control+z');
  expect(await deck(page)).toEqual(before);
  await expect(paletteCard(page, 'template:zerem')).toHaveAttribute('data-current', 'true');
  await expect(previewLabel(page)).toHaveCount(0);
  await page.keyboard.press('Control+y');
  expect(await deck(page)).toEqual(after);
  expect(errors).toEqual([]);
});

test('the font pairs: a hover shows the fonts on the slide, a click sets them in one step', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openLook(page);
  const before = await deck(page);
  const depth = await undoDepth(page);
  // The font pairs of the ten templates, then the seven curated ones.
  await expect(look(page, 'fonts').locator('[data-fonts]')).toHaveCount(17);
  await expect(look(page, 'fonts').locator('[data-current]')).toHaveCount(1);
  await expect(look(page, 'fonts').locator('[data-current]')).toHaveAttribute(
    'data-fonts',
    'IBM Plex Sans Hebrew|Space Grotesk|Heebo|Inter',
  );
  expect(await onStage(page, '--font-heading')).toContain('IBM Plex Sans Hebrew');

  await fontCard(page, SERIF).hover();
  await expect(previewLabel(page)).toBeVisible();
  await expect.poll(() => onStage(page, '--font-heading')).toContain('Noto Serif Hebrew');
  expect(await onStage(page, '--font-body')).toContain('DM Sans');
  expect(await deck(page)).toEqual(before);
  expect(await undoDepth(page)).toBe(depth);

  await pointAway(page);
  await expect(previewLabel(page)).toHaveCount(0);
  expect(await onStage(page, '--font-heading')).toContain('IBM Plex Sans Hebrew');

  await fontCard(page, SERIF).click();
  await expect(fontCard(page, SERIF)).toHaveAttribute('data-current', 'true');
  await expect(look(page, 'fonts').locator('[data-current]')).toHaveCount(1);
  await expect(previewLabel(page)).toHaveCount(0);
  const after = await deck(page);
  expect(after.theme.fonts).toEqual({
    heading: { he: 'Noto Serif Hebrew', latin: 'Playfair Display' },
    body: { he: 'Noto Sans Hebrew', latin: 'DM Sans' },
  });
  expect({ ...after, theme: { ...after.theme, fonts: before.theme.fonts } }).toEqual(before);
  expect(await undoDepth(page)).toBe(depth + 1);

  await page.keyboard.press('Control+z');
  expect(await deck(page)).toEqual(before);
  await expect(previewLabel(page)).toHaveCount(0);
  await page.keyboard.press('Control+y');
  expect(await deck(page)).toEqual(after);
  expect(errors).toEqual([]);
});

test('with the keyboard: the focus shows a look, Enter and Space apply it, leaving takes it down', async ({
  page,
}) => {
  await openLook(page);
  const before = await deck(page);
  const depth = await undoDepth(page);

  await paletteCard(page, 'rose').focus();
  await expect(previewLabel(page)).toBeVisible();
  await expect.poll(() => onStage(page, '--color-bg')).not.toBe(before.theme.colors.bg);
  const rose = await onStage(page, '--color-bg');
  // Every card is a button, so Tab goes to the next one, and the Stage follows.
  await page.keyboard.press('Tab');
  await expect(paletteCard(page, 'graphite')).toBeFocused();
  await expect.poll(() => onStage(page, '--color-bg')).not.toBe(rose);
  const graphite = await onStage(page, '--color-bg');
  expect(await deck(page)).toEqual(before);

  await page.keyboard.press('Enter');
  await expect(paletteCard(page, 'graphite')).toHaveAttribute('data-current', 'true');
  await expect(previewLabel(page)).toHaveCount(0);
  expect((await deck(page)).theme.colors.bg).toBe(graphite);
  expect(await undoDepth(page)).toBe(depth + 1);

  await fontCard(page, SERIF).focus();
  await expect(previewLabel(page)).toBeVisible();
  await page.keyboard.press('Space');
  await expect(fontCard(page, SERIF)).toHaveAttribute('data-current', 'true');
  expect((await deck(page)).theme.fonts.heading.he).toBe('Noto Serif Hebrew');
  expect(await undoDepth(page)).toBe(depth + 2);

  // The focus leaves a card that was not applied: its look leaves the Stage with it.
  await templateCard(page, 'tzuk').focus();
  await expect(previewLabel(page)).toBeVisible();
  const applied = await deck(page);
  await templateCard(page, 'tzuk').blur();
  await expect(previewLabel(page)).toHaveCount(0);
  expect(await deck(page)).toEqual(applied);
});

test('a look that is being tried leaves the Stage when the panel turns to something else', async ({
  page,
}) => {
  await openLook(page);
  const before = await deck(page);
  await templateCard(page, 'tzuk').hover();
  await expect(previewLabel(page)).toBeVisible();
  // The slide tool takes the panel; the pointer has not moved.
  await page.keyboard.press('Control+2');
  await expect(panel(page, 'ai.slide')).toBeVisible();
  await expect(previewLabel(page)).toHaveCount(0);
  expect(await onStage(page, '--color-bg')).toBe(before.theme.colors.bg);

  await openTool(page, 'ai.deck', 'actions');
  await paletteCard(page, 'ocean').focus();
  await expect(previewLabel(page)).toBeVisible();
  // The Chat tab of the same tool, by the keyboard: Ctrl+L goes to the chat's field.
  await page.keyboard.press('Control+l');
  await expect(input(page)).toBeFocused();
  await expect(previewLabel(page)).toHaveCount(0);
  expect(await deck(page)).toEqual(before);
});

test('a personal template is offered with its colours, and trying it shows its logo', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openLook(page);
  // The user's own template, made in the Templates panel: the deck's look with a logo and a
  // colour of theirs.
  await page.getByTestId('activity-bar').locator('[data-panel="templates"]').click();
  const templates = page.getByTestId('templates-panel');
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('logo-choose').click();
  await (await chooser).setFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG_1X1 });
  await expect
    .poll(async () => Object.keys((await deck(page)).assets).length, { timeout: 10_000 })
    .toBe(1);
  await page.evaluate(() => {
    window.slidr!.bus.dispatch({
      type: 'theme.update',
      patch: { colors: { primary: '#ff5a36' } },
    });
  });
  await templates.getByRole('textbox', { name: 'שם התבנית' }).fill('המותג שלנו');
  await templates.getByRole('button', { name: 'שמירה', exact: true }).click();
  await expect(templates.getByRole('status')).toContainText('נשמרה');
  const mine = (await deck(page)).theme.id;
  expect(mine).toMatch(/^personal_/);

  // The deck tool offers it after the built-in ones, with its palette; its fonts are Zerem's.
  await openTool(page, 'ai.deck', 'actions');
  await expect(look(page, 'template').locator('[data-template]')).toHaveCount(11);
  await expect(templateCard(page, mine)).toHaveAttribute('data-current', 'true');
  await expect(templateCard(page, mine)).toContainText('המותג שלנו');
  await expect(templateCard(page, mine)).toContainText('אישית');
  await expect(look(page, 'palette').locator('[data-palette]')).toHaveCount(18);
  await expect(paletteCard(page, `template:${mine}`)).toHaveAttribute('data-current', 'true');
  await expect(look(page, 'fonts').locator('[data-fonts]')).toHaveCount(17);

  await templateCard(page, 'tzuk').click();
  await expect(templateCard(page, 'tzuk')).toHaveAttribute('data-current', 'true');
  const before = await deck(page);
  const depth = await undoDepth(page);

  // Trying it: the Stage draws the deck on the template, with the picture of its logo.
  await templateCard(page, mine).hover();
  await expect(previewLabel(page)).toBeVisible();
  expect(await onStage(page, '--color-primary')).toBe('#ff5a36');
  const logo = page.getByTestId('stage-frame').locator('img');
  await expect(logo).toHaveCount(1);
  await expect
    .poll(() => logo.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  expect(await deck(page)).toEqual(before);
  expect(await undoDepth(page)).toBe(depth);

  await templateCard(page, mine).click();
  await expect(templateCard(page, mine)).toHaveAttribute('data-current', 'true');
  expect((await deck(page)).theme.id).toBe(mine);
  expect(await undoDepth(page)).toBe(depth + 1);
  await page.keyboard.press('Control+z');
  expect(await deck(page)).toEqual(before);
  expect(errors).toEqual([]);
});

test('the look can be changed while the chat of the deck is in a turn', async ({ page }) => {
  await openLook(page, { speed: 1 });
  const before = await deck(page);
  const status = page.getByTestId('status-agent');
  await openTool(page, 'ai.deck', 'chat');
  await input(page).fill('ניסוחים אחרים');
  await input(page).press('Enter');
  await expect(status).toHaveAttribute('data-state', 'working');

  // The actions of the agent wait for the turn; the template, the palette and the fonts do not.
  await openTool(page, 'ai.deck', 'actions');
  await expect(page.locator('[data-action="deck.shorten"]')).toBeDisabled();
  await paletteCard(page, 'sage').hover();
  await expect(previewLabel(page)).toBeVisible();
  await paletteCard(page, 'sage').click();
  await expect(paletteCard(page, 'sage')).toHaveAttribute('data-current', 'true');
  expect((await deck(page)).theme.colors.bg).not.toBe(before.theme.colors.bg);
  await expect(status).toHaveAttribute('data-state', 'idle', { timeout: 15_000 });
});

test('in English, with no string missing', async ({ page }) => {
  const errors = collectErrors(page);
  await openLook(page, { lang: 'en' });
  const deckPanel = panel(page, 'ai.deck');
  // Exact: the form that asks for a new template is a region of the same tab.
  await expect(deckPanel.getByRole('region', { name: 'Template', exact: true })).toBeVisible();
  await expect(deckPanel.getByRole('region', { name: 'Colour palette' })).toBeVisible();
  await expect(deckPanel.getByRole('region', { name: 'Font pair' })).toBeVisible();
  await expect(look(page, 'template')).toContainText('Hover to see it on the slide');
  await expect(templateCard(page, 'zerem')).toContainText('Built-in');
  await expect(templateCard(page, 'zerem')).toContainText('In use in the deck');
  // A template's palette is named after the template; a curated one in the UI's language.
  await expect(deckPanel.getByRole('button', { name: 'Shvil', exact: true })).toHaveCount(2);
  await expect(deckPanel.getByRole('button', { name: 'Forest', exact: true })).toBeVisible();
  await expect(
    deckPanel.getByRole('button', {
      name: 'Headings: Rubik · Poppins · Body: Rubik · DM Sans',
      exact: true,
    }),
  ).toBeVisible();

  const depth = await undoDepth(page);
  await templateCard(page, 'tzuk').hover();
  await expect(previewLabel(page)).toHaveText('Preview');
  await templateCard(page, 'tzuk').click();
  await paletteCard(page, 'plum').hover();
  await expect(previewLabel(page)).toBeVisible();
  await paletteCard(page, 'plum').click();
  await fontCard(page, SERIF).hover();
  await expect(previewLabel(page)).toBeVisible();
  await fontCard(page, SERIF).click();
  await expect(fontCard(page, SERIF)).toHaveAttribute('data-current', 'true');
  expect(await undoDepth(page)).toBe(depth + 3);

  // The names of the three steps, as the Edit menu's history would show them.
  const labels = await page.evaluate(() =>
    window.slidr!.bus.undoStack.slice(-3).map((entry) => entry.label),
  );
  expect(labels).toEqual(['Switch template', 'Change the colour palette', 'Change the font pair']);
  expect(errors).toEqual([]);
});
