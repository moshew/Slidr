import { expect, test } from '@playwright/test';
import {
  card,
  collectErrors,
  deck,
  openTemplates,
  panel,
  redo,
  undo,
  undoSteps,
} from './templates-helpers';

/*
 * The Templates panel in the app (WG7-T04 wiring, T09): the built-in library, switching the deck
 * to a template, the default template of new decks, the layouts of "New slide", the deck's
 * direction, editing the theme, the logo, and saving a personal template. In a plain browser
 * the personal templates live in memory; the app keeps them in files (see the Rust tests).
 */

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAABCAYAAAD5PA/NAAAAEElEQVR42mNk+M9QzwAEAAmGAYCF+yOnAAAAAElFTkSuQmCC',
  'base64',
);

test('the library offers the built-in templates, and switching to one is one undo step', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openTemplates(page);
  await expect(card(page, 'zerem')).toBeVisible();
  // A template that opens with a photograph shows it on its cover.
  for (const id of ['shvil', 'tzuk']) {
    const photo = card(page, id).locator('img').first();
    await expect
      .poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);
  }
  const before = await deck(page);
  expect(before.theme.id).toBe('basic');

  await card(page, 'zerem').getByRole('button', { name: 'החלה על המצגת' }).click();
  await expect(card(page, 'zerem')).toHaveAttribute('data-current', 'true');
  const after = await deck(page);
  expect(after.theme.id).toBe('zerem');
  expect(after.layouts).toHaveLength(14);
  // Layouts are named in the deck's language.
  expect(after.layouts.map((l) => l.name)).toContain('ציר זמן');
  expect(await undoSteps(page)).toBe(1);

  await undo(page);
  expect((await deck(page)).theme.id).toBe('basic');
  expect((await deck(page)).layouts).toHaveLength(0);
  await redo(page);
  expect((await deck(page)).theme.id).toBe('zerem');
  expect(errors).toEqual([]);
});

test('a new deck opens on the default template, and File > New does too', async ({ page }) => {
  await openTemplates(page);
  // Out of the box there is no default: the deck is plain.
  expect((await deck(page)).theme.id).toBe('basic');
  await card(page, 'zerem').getByRole('button', { name: 'קביעה כברירת מחדל למצגות חדשות' }).click();
  await expect(
    card(page, 'zerem').getByRole('button', { name: /ברירת המחדל למצגות חדשות/ }),
  ).toHaveAttribute('aria-pressed', 'true');

  // The next start of the app.
  await page.reload();
  const started = await deck(page);
  expect(started.theme.id).toBe('zerem');
  expect(started.slides).toHaveLength(1);
  expect(started.slides[0]!.layoutId).toBe('l_zerem_hero');
  expect(started.slides[0]!.elements.map((e) => e.role)).toEqual([
    'caption',
    'title',
    'subtitle',
    'caption',
  ]);

  // And File > New in the same window.
  await page.getByTestId('top-tools-a').getByRole('button', { name: 'קובץ' }).click();
  await page.getByRole('menuitem', { name: 'מצגת חדשה' }).click();
  const fresh = await deck(page);
  expect(fresh.id).not.toBe(started.id);
  expect(fresh.theme.id).toBe('zerem');
  expect(fresh.slides[0]!.layoutId).toBe('l_zerem_hero');
});

test('"New slide" offers the layouts of the template', async ({ page }) => {
  await openTemplates(page, { defaultTemplate: 'zerem' });
  await page.getByTestId('new-slide').click();
  const choices = page.getByTestId('layout-choices');
  await expect(choices).toBeVisible();
  // Blank, and the fourteen layouts.
  await expect(choices.locator('[data-layout]')).toHaveCount(15);
  await choices.locator('[data-layout="l_zerem_cards"]').click();
  const now = await deck(page);
  expect(now.slides).toHaveLength(2);
  expect(now.slides[1]!.layoutId).toBe('l_zerem_cards');
  expect(now.slides[1]!.elements.filter((e) => e.role === 'subtitle')).toHaveLength(3);
});

test('the direction control turns the deck, layouts and slides, in one step', async ({ page }) => {
  await openTemplates(page, { defaultTemplate: 'zerem' });
  const before = await deck(page);
  expect(before.meta.dir).toBe('rtl');
  const titleBefore = before.slides[0]!.elements.find((e) => e.role === 'title')!.frame;

  await panel(page).getByRole('radio', { name: 'שמאל לימין' }).click();
  const after = await deck(page);
  expect(after.meta.dir).toBe('ltr');
  const titleAfter = after.slides[0]!.elements.find((e) => e.role === 'title')!.frame;
  expect(titleAfter.x).toBe(1920 - titleBefore.x - titleBefore.w);
  // The glow of the opening layout is drawn by hand for each direction.
  const hero = (d: typeof after) => JSON.stringify(d.layouts[0]!.background);
  expect(hero(after)).not.toBe(hero(before));
  expect(await undoSteps(page)).toBe(1);

  await undo(page);
  expect(await deck(page)).toEqual(before);
});

test('editing the theme changes the deck, each edit one undo step', async ({ page }) => {
  await openTemplates(page, { defaultTemplate: 'zerem' });

  // A colour, typed as hex: one step however many keys it took.
  await panel(page).locator('[data-theme-color="primary"]').click();
  const hex = page.getByRole('textbox', { name: 'קוד הצבע' });
  await hex.fill('#ff3366');
  await hex.press('Enter');
  await expect.poll(async () => (await deck(page)).theme.colors.primary).toBe('#ff3366');
  await page.keyboard.press('Escape');
  expect(await undoSteps(page)).toBe(1);

  // A text style.
  const size = panel(page).getByRole('textbox', { name: 'גודל של כותרת', exact: true });
  await size.fill('80');
  await size.press('Enter');
  await expect.poll(async () => (await deck(page)).theme.textStyles.title.size).toBe(80);
  expect(await undoSteps(page)).toBe(2);

  // A font.
  await panel(page).getByRole('button', { name: 'גופן הכותרות בעברית' }).click();
  await page.getByRole('option', { name: 'Rubik' }).first().click();
  await expect.poll(async () => (await deck(page)).theme.fonts.heading.he).toBe('Rubik');
  expect((await deck(page)).theme.fonts.heading.latin).toBe('Space Grotesk');
  expect(await undoSteps(page)).toBe(3);

  await undo(page);
  await undo(page);
  await undo(page);
  const back = await deck(page);
  expect(back.theme.colors.primary).toBe('#2ee6d0');
  expect(back.theme.textStyles.title.size).toBe(72);
  expect(back.theme.fonts.heading.he).toBe('IBM Plex Sans Hebrew');
});

test('a logo replaces the mark on every layout, and a personal template keeps it', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openTemplates(page, { defaultTemplate: 'zerem' });

  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('logo-choose').click();
  await (await chooser).setFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG_1X1 });
  await expect
    .poll(async () => Object.keys((await deck(page)).assets).length, { timeout: 10_000 })
    .toBe(1);
  const withLogo = await deck(page);
  const logos = withLogo.layouts.flatMap((l) => l.decorations.filter((d) => d.role === 'logo'));
  // Every layout but the two that draw no mark: the section divider and the full image.
  expect(logos).toHaveLength(12);
  expect(logos.every((logo) => logo.type === 'image')).toBe(true);
  expect(await undoSteps(page)).toBe(1);

  // Save it all as a personal template, and make it the default.
  await panel(page).getByRole('textbox', { name: 'שם התבנית' }).fill('התבנית של החברה');
  await panel(page).getByRole('checkbox', { name: 'לקבוע כברירת מחדל למצגות חדשות' }).click();
  await panel(page).getByRole('button', { name: 'שמירה', exact: true }).click();
  await expect(panel(page).getByRole('status')).toContainText('התבנית "התבנית של החברה" נשמרה');

  const saved = await deck(page);
  expect(saved.theme.name).toBe('התבנית של החברה');
  expect(saved.theme.id).toMatch(/^personal_/);
  const mine = card(page, saved.theme.id);
  await expect(mine).toHaveAttribute('data-current', 'true');
  await expect(mine.getByRole('button', { name: /ברירת המחדל למצגות חדשות/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // A new deck opens on it, with its logo and the file behind it.
  await page.getByTestId('top-tools-a').getByRole('button', { name: 'קובץ' }).click();
  await page.getByRole('menuitem', { name: 'מצגת חדשה' }).click();
  // The deck has unsaved changes: the app asks before it replaces it.
  await page.getByRole('button', { name: 'בלי לשמור' }).click();
  await expect.poll(async () => (await deck(page)).id).not.toBe(saved.id);
  const fresh = await deck(page);
  expect(fresh.theme.id).toBe(saved.theme.id);
  expect(Object.keys(fresh.assets)).toEqual(Object.keys(saved.assets));
  await expect(page.getByTestId('stage-frame').locator('img')).toHaveCount(1);

  // Deleting the template clears the default; the deck stays as it is.
  await mine.getByRole('button', { name: 'מחיקת התבנית' }).click();
  await page.getByRole('button', { name: 'מחיקה', exact: true }).click();
  await expect(mine).toHaveCount(0);
  expect((await deck(page)).theme.id).toBe(saved.theme.id);
  await expect(panel(page)).toContainText('בלי ברירת מחדל, מצגת חדשה נפתחת ריקה.');
  expect(errors).toEqual([]);
});

test('the panel reads in English, with no missing string', async ({ page }) => {
  const errors = collectErrors(page);
  await openTemplates(page, { lang: 'en', defaultTemplate: 'zerem' });
  await expect(panel(page)).toContainText('Template library');
  await expect(panel(page)).toContainText('Save as a personal template');
  expect((await deck(page)).meta.dir).toBe('ltr');
  expect((await deck(page)).layouts.map((l) => l.name)).toContain('Timeline');
  expect(errors).toEqual([]);
});

test('the chart palette, line height, spacing, corners, shadow and backgrounds of the theme, each edit one undo step', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openTemplates(page, { defaultTemplate: 'zerem' });
  const before = (await deck(page)).theme;
  let steps = await undoSteps(page);
  const step = async () => {
    steps += 1;
    await expect.poll(() => undoSteps(page)).toBe(steps);
  };

  // A colour of the chart palette, typed as hex; then one more colour, and one less.
  await panel(page).getByTestId('chart-color').first().click();
  const hex = page.getByRole('textbox', { name: 'קוד הצבע' });
  await hex.fill('#123456');
  await hex.press('Enter');
  await expect.poll(async () => (await deck(page)).theme.colors.chart[0]).toBe('#123456');
  await page.keyboard.press('Escape');
  await step();
  await panel(page).getByTestId('chart-add').click();
  await expect
    .poll(async () => (await deck(page)).theme.colors.chart)
    .toHaveLength(before.colors.chart.length + 1);
  await step();
  await panel(page).getByTestId('chart-color').last().click();
  await page.getByTestId('chart-remove').click();
  await expect
    .poll(async () => (await deck(page)).theme.colors.chart)
    .toHaveLength(before.colors.chart.length);
  await page.keyboard.press('Escape');
  await step();

  // The line height and the letter spacing of a text style.
  const lineHeight = panel(page).getByRole('textbox', { name: 'גובה השורה של כותרת', exact: true });
  await lineHeight.fill('1.3');
  await lineHeight.press('Enter');
  await expect.poll(async () => (await deck(page)).theme.textStyles.title.lineHeight).toBe(1.3);
  await step();
  const spacing = panel(page).getByRole('textbox', { name: 'ריווח האותיות של כותרת', exact: true });
  await spacing.fill('2.5');
  await spacing.press('Enter');
  await expect.poll(async () => (await deck(page)).theme.textStyles.title.letterSpacing).toBe(2.5);
  await step();

  // The corners and the shadow.
  const radius = panel(page).getByRole('textbox', { name: 'עיגול פינות', exact: true });
  await radius.fill('20');
  await radius.press('Enter');
  await expect.poll(async () => (await deck(page)).theme.radius).toBe(20);
  await step();
  const down = panel(page).getByRole('textbox', { name: 'הזזת הצל לגובה' });
  await down.fill('8');
  await down.press('Enter');
  await expect.poll(async () => (await deck(page)).theme.shadow.y).toBe(8);
  expect((await deck(page)).theme.shadow.blur).toBe(before.shadow.blur);
  await step();

  // A variant of the background: a slide that picked it changes with it.
  const variants = before.backgroundVariants.length;
  await page.evaluate(() => {
    const { bus, selection } = window.slidr!;
    const slideId = selection.getState().currentSlideId!;
    bus.dispatch({
      type: 'slide.update',
      slideId,
      patch: { background: bus.deck.theme.backgroundVariants[0]! },
    });
  });
  steps += 1;
  // A variant is drawn as the slide will be, by the renderer itself (an empty slide that has
  // this background), not as its fill alone: a dimmed photo and a veiled ground show as they are.
  await expect(
    panel(page).getByTestId('theme-variant').first().locator('[data-slide-id="s_swatch"]'),
  ).toHaveCount(1);
  await panel(page).getByTestId('theme-variant').first().click();
  await page.getByTestId('theme-background-editor').getByRole('radio', { name: 'הדרגתי' }).click();
  await expect
    .poll(async () => (await deck(page)).theme.backgroundVariants[0]!.fill.kind)
    .toBe('linear');
  const shown = await deck(page);
  expect(shown.slides[0]!.background).toEqual(shown.theme.backgroundVariants[0]);
  await page.keyboard.press('Escape');
  await step();
  await panel(page).getByTestId('variant-add').click();
  await expect
    .poll(async () => (await deck(page)).theme.backgroundVariants)
    .toHaveLength(variants + 1);
  await step();
  await panel(page).getByTestId('theme-variant').last().click();
  await page.getByTestId('variant-remove').click();
  await expect.poll(async () => (await deck(page)).theme.backgroundVariants).toHaveLength(variants);
  await step();

  // Undone one by one, the theme is the template's again.
  while ((await undoSteps(page)) > 0) await undo(page);
  expect((await deck(page)).theme).toEqual(before);
  expect(errors).toEqual([]);
});

test('the new fields of the theme read in English', async ({ page }) => {
  const errors = collectErrors(page);
  await openTemplates(page, { lang: 'en', defaultTemplate: 'zerem' });
  await expect(panel(page)).toContainText('Chart palette');
  await expect(panel(page)).toContainText('Corners and shadow');
  await expect(panel(page)).toContainText('Background variants');
  await expect(panel(page).getByRole('textbox', { name: 'Line height of Title' })).toBeVisible();
  await expect(panel(page).getByRole('button', { name: 'Variant 1' })).toBeVisible();
  expect(errors).toEqual([]);
});
