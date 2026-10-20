import { readFileSync } from 'node:fs';
import { expect, test, type Locator } from '@playwright/test';
import {
  addElement,
  currentSlide,
  deck,
  dragBy,
  importPicture,
  onStage,
  openApp,
  pageProblems,
  pngBytes,
  row,
  selected,
  switchLanguage,
  undo,
  undoDepth,
} from './objects-helpers';
import type {
  GroupElement,
  ImageElement,
  ShapeElement,
  SvgElement,
  TableElement,
  TextElement,
} from '@slidr/model';
import { shapePresets } from '@slidr/renderer';

/*
 * Elements: the collections of everything that goes on a slide. The first screen offers them by
 * kind; a collection opens in its place, and what it holds lands in the middle of the slide,
 * selected, as one undo step.
 */

const COLLECTIONS = ['cards', 'shapes', 'graphics', 'emoji', 'icons', 'frames', 'tables'];

/** The groups of photo frames, in the order the collection shows them. */
const FRAME_GROUPS = [
  'basic',
  'photo',
  'framed',
  'magnets',
  'devices',
  'arches',
  'organic',
  'brush',
  'composed',
  'hebrew',
  'latin',
  'digits',
  'nature',
  'bubbles',
  'labels',
];

test.afterEach(({ page }) => {
  expect(pageProblems(page)).toEqual([]);
});

async function openElements(page: Parameters<typeof openApp>[0], lang: 'he' | 'en' = 'en') {
  await openApp(page, { lang });
  await page.getByTestId('activity-bar').locator('[data-panel="elements"]').click();
  const panel = page.getByTestId('elements-panel');
  await expect(panel).toBeVisible();
  return panel;
}

/** The Ready slides panel: the designs, each a whole slide, out of Elements (ADR-106). */
async function openDesigns(page: Parameters<typeof openApp>[0]) {
  await openApp(page, { lang: 'en' });
  await page.getByTestId('activity-bar').locator('[data-panel="designs"]').click();
  const panel = page.getByTestId('designs-panel');
  await expect(panel).toBeVisible();
  return panel;
}

test('the first screen offers the collections by kind, each with a name', async ({ page }) => {
  const panel = await openElements(page);
  const tiles = panel.locator('[data-collection]');
  await expect(tiles).toHaveCount(COLLECTIONS.length);
  expect(
    await tiles.evaluateAll((all) => all.map((tile) => tile.getAttribute('data-collection'))),
  ).toEqual(COLLECTIONS);
  for (const name of ['Card sets', 'Shapes', 'Graphics', 'Emoji', 'Icons', 'Frames', 'Tables']) {
    await expect(panel.getByRole('button', { name, exact: true })).toBeVisible();
  }
  // Nothing was used yet, so nothing is offered again.
  await expect(panel.getByTestId('elements-recent')).toHaveCount(0);
});

test('designs are shown by group, found by name, and add an editable slide', async ({ page }) => {
  const panel = await openDesigns(page);
  await expect(page.locator('[data-panel="designs"] h2')).toHaveText('Ready slides');
  // The first screen: the nineteen groups, each with its first four designs, as finished slides.
  const designs = panel.locator('[data-design]');
  await expect(panel.locator('[data-group]')).toHaveCount(19);
  await expect(designs).toHaveCount(76);
  await expect(designs.first().locator('[data-slide-id]')).toBeVisible();

  // One group in full, under its own name alone, and back to all of them.
  await panel.locator('[data-group="deck"]').getByRole('button', { name: 'Show all' }).click();
  await expect(panel.getByTestId('design-results').locator('[data-design]')).toHaveCount(32);
  await expect(panel.getByRole('heading', { level: 3 })).toHaveText('Presentation slides');
  await panel.getByRole('button', { name: 'Back to Ready slides' }).click();
  await expect(panel.getByRole('heading', { level: 3 })).toHaveCount(0);
  await expect(designs).toHaveCount(76);

  // A search of the names, in every group at once.
  await panel.getByTestId('designs-query').fill('invitation');
  await expect(panel.locator('[data-design="barmitzvah"]')).toBeVisible();
  await expect(panel.locator('[data-design="cover"]')).toHaveCount(0);
  await panel.getByTestId('designs-query').fill('');

  const before = await undoDepth(page);
  await panel.locator('[data-design="wedding"]').click();
  await expect.poll(async () => (await currentSlide(page)).elements.length).toBeGreaterThan(5);
  const slide = await currentSlide(page);
  expect(slide.elements.filter((element) => element.type === 'text').length).toBeGreaterThan(4);
  expect(slide.elements.some((element) => element.type === 'shape')).toBe(true);
  const image = slide.elements.find((element) => element.type === 'image');
  expect(image?.type).toBe('image');
  if (image?.type === 'image') {
    expect((await deck(page)).assets[image.assetId!]).toBeDefined();
    await expect(onStage(page, image.id).locator('img')).toBeVisible();
  }
  expect(await undoDepth(page)).toBe(before + 1);

  // A design whose subject is a cut-out over a photograph brings both pictures, in one step.
  await panel.getByTestId('designs-query').fill('concert');
  await panel.locator('[data-design="concert"]').click();
  await expect
    .poll(async () => (await currentSlide(page)).elements.filter((e) => e.type === 'image').length)
    .toBe(2);
  const pictures = (await currentSlide(page)).elements.filter((e) => e.type === 'image');
  const assets = (await deck(page)).assets;
  for (const picture of pictures) {
    expect(picture.type === 'image' && assets[picture.assetId!]).toBeTruthy();
    await expect(onStage(page, picture.id).locator('img')).toBeVisible();
  }
  expect(new Set(pictures.map((p) => (p.type === 'image' ? p.assetId : ''))).size).toBe(2);
  expect(await undoDepth(page)).toBe(before + 2);
});

test('a level that is opened comes in from the end, the one gone back to from the start', async ({
  page,
}) => {
  const panel = await openElements(page);
  const levels = panel.locator('.elements-drill');
  // The first screen is there with the panel: it does not move in.
  await expect(levels.first()).not.toHaveAttribute('data-way');

  await panel.locator('[data-collection="frames"]').click();
  await expect(levels.first()).toHaveAttribute('data-way', 'deeper');
  await panel.locator('[data-group="composed"]').getByRole('button', { name: 'Show all' }).click();
  await expect(levels.last()).toHaveAttribute('data-way', 'deeper');
  await panel.getByRole('button', { name: 'Back to Frames' }).click();
  await expect(levels.last()).toHaveAttribute('data-way', 'back');
  await panel.getByRole('button', { name: 'Back to collections' }).click();
  await expect(levels).toHaveCount(1);
  await expect(levels.first()).toHaveAttribute('data-way', 'back');
});

test('a group of designs comes in from the end, and a search takes the place of the list', async ({
  page,
}) => {
  const panel = await openDesigns(page);
  const levels = panel.locator('.elements-drill');
  await expect(levels.first()).not.toHaveAttribute('data-way');
  await panel.locator('[data-group="deck"]').getByRole('button', { name: 'Show all' }).click();
  await expect(levels.last()).toHaveAttribute('data-way', 'deeper');

  // What a search found, and the group again once it is cleared, take the place of the list
  // where it is: no level was opened or left.
  await panel.getByTestId('designs-query').fill('invitation');
  await expect(levels).toHaveCount(0);
  await panel.getByTestId('designs-query').fill('');
  await expect(panel.getByTestId('design-results').locator('[data-design]')).toHaveCount(32);
  await expect(levels.last()).not.toHaveAttribute('data-way');

  await panel.getByRole('button', { name: 'Back to Ready slides' }).click();
  await expect(levels.last()).toHaveAttribute('data-way', 'back');
});

test('a group opens at the top of the panel, and the groups are back where they were left', async ({
  page,
}) => {
  const panel = await openElements(page);
  const scroller = page.locator('[data-panel="elements"] [data-radix-scroll-area-viewport]');
  const scrolled = () => scroller.evaluate((element) => Math.round(element.scrollTop));
  await panel.locator('[data-collection="frames"]').click();
  const composed = panel.locator('[data-group="composed"]');
  await composed.scrollIntoViewIfNeeded();
  const left = await scrolled();
  expect(left).toBeGreaterThan(0);

  await composed.getByRole('button', { name: 'Show all' }).click();
  await expect(panel.getByRole('heading', { level: 3 })).toHaveText('Compositions');
  expect(await scrolled()).toBe(0);
  await scroller.evaluate((element) => element.scrollBy(0, 200));

  // The groups fill their rows again once they have measured them: the panel waits for that.
  await panel.getByRole('button', { name: 'Back to Frames' }).click();
  await expect(composed).toBeVisible();
  await expect.poll(scrolled).toBe(left);
});

test('graphics are one collection, in four styles, and a click adds one', async ({ page }) => {
  const panel = await openElements(page);
  await panel.locator('[data-collection="graphics"]').click();
  for (const style of ['glossy', 'illustrated', 'outlined', 'handdrawn']) {
    await expect(panel.locator(`[data-group="${style}"] [data-sticker]`).first()).toBeVisible();
  }

  const before = await undoDepth(page);
  await panel.locator('[data-sticker="graphic:glossy:trophy-48"]').click();
  const graphic = await selected<SvgElement>(page);
  expect(graphic.type).toBe('svg');
  expect(graphic.name).toBe('graphic:glossy:trophy-48');
  expect(graphic.markup).toMatch(
    /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 48 48">/,
  );
  await expect(onStage(page, graphic.id)).toBeVisible();
  expect(await undoDepth(page)).toBe(before + 1);

  // One style in full: more of it comes as the list is scrolled.
  await panel.getByRole('radio', { name: 'Outlined' }).click();
  const results = panel.getByTestId('graphic-results').locator('[data-sticker]');
  await expect(results.first()).toBeVisible();
  const shown = await results.count();
  expect(shown).toBeLessThan(400);
  await results.last().scrollIntoViewIfNeeded();
  await expect.poll(() => results.count()).toBeGreaterThan(shown);

  // The search looks in the style that is shown.
  await panel.getByTestId('graphics-query').fill('trophy');
  await expect(panel.locator('[data-sticker="graphic:outlined:award-trophy-1"]')).toBeVisible();
  await expect(panel.locator('[data-sticker^="graphic:glossy:"]')).toHaveCount(0);
  await panel.getByTestId('graphics-query').fill('qqqzzz');
  await expect(panel.getByText('Nothing found')).toBeVisible();

  await panel.getByTestId('graphics-query').fill('');
  await panel.getByRole('radio', { name: 'Sketch' }).click();
  await panel.locator('[data-sticker="graphic:handdrawn:camera"]').click();
  const sketch = await selected<SvgElement>(page);
  expect(sketch.name).toBe('graphic:handdrawn:camera');
  expect(sketch.markup).toContain('viewBox="0 0 24 24"');
  await expect(onStage(page, sketch.id)).toBeVisible();
  expect(await undoDepth(page)).toBe(before + 2);
});

test('every emoji is in one list by group, found in Hebrew, and added with a click', async ({
  page,
}) => {
  const panel = await openElements(page, 'he');
  await panel.locator('[data-collection="emoji"]').click();
  await expect(panel.locator('[data-group]')).toHaveCount(9);
  await expect(panel.locator('[data-sticker="emoji:grinning-face"]')).toBeVisible();

  // A group far down the list is drawn once it is reached.
  await expect(panel.locator('[data-sticker="emoji:flag-israel"]')).toHaveCount(0);
  await panel.getByRole('button', { name: 'דגלים' }).click();
  await expect(panel.locator('[data-sticker="emoji:flag-israel"]')).toBeVisible();

  await panel.getByTestId('emoji-query').fill('טיל');
  const rocket = panel.locator('[data-sticker="emoji:rocket"]');
  await expect(rocket).toHaveAccessibleName('הוספת טיל לשקף');
  await rocket.click();
  const emoji = await selected<SvgElement>(page);
  expect(emoji.name).toBe('emoji:rocket');
  expect(emoji.markup).toContain('viewBox="0 0 36 36"');
  await expect(onStage(page, emoji.id)).toBeVisible();
});

test('an edge of an emoji moves alone, as an edge of a picture does; a corner sizes it whole', async ({
  page,
}) => {
  const panel = await openElements(page);
  await panel.locator('[data-collection="emoji"]').click();
  await panel.locator('[data-sticker="emoji:grinning-face"]').click();
  const emoji = await selected<SvgElement>(page);
  const { x, y, w, h } = emoji.frame;
  const scale = (await page.getByTestId('stage-frame').boundingBox())!.width / 1920;
  // Ctrl keeps the edge off the guides: it goes exactly as far as the pointer.
  const drag = async (handle: string, dx: number, dy: number, shift = false) => {
    const grip = await page
      .getByTestId('stage-surface')
      .locator(`[data-handle="${handle}"]`)
      .boundingBox();
    const from = { x: grip!.x + grip!.width / 2, y: grip!.y + grip!.height / 2 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.keyboard.down('Control');
    if (shift) await page.keyboard.down('Shift');
    await page.mouse.move(from.x + dx * scale, from.y + dy * scale, { steps: 8 });
    await page.mouse.up();
    if (shift) await page.keyboard.up('Shift');
    await page.keyboard.up('Control');
  };
  const frame = async () => (await selected<SvgElement>(page)).frame;
  /** The drawing is scaled alike on both axes: the face is not stretched with its frame. */
  const drawnEvenly = () =>
    onStage(page, emoji.id)
      .locator('svg')
      .first()
      .evaluate((svg) => {
        const m = (svg as SVGSVGElement).getScreenCTM()!;
        return Math.abs(m.a - m.d) < 1e-6;
      });

  const depth = await undoDepth(page);
  await drag('e', 100, 0);
  expect(await frame()).toEqual({ x, y, w: w + 100, h });
  expect(await drawnEvenly()).toBe(true);
  await drag('n', 0, -60);
  expect(await frame()).toEqual({ x, y: y - 60, w: w + 100, h: h + 60 });
  expect(await drawnEvenly()).toBe(true);
  expect(await undoDepth(page)).toBe(depth + 2);
  await undo(page);
  await undo(page);
  expect(await frame()).toEqual(emoji.frame);

  // With Shift an edge sizes it whole, around the middle of the other side; so does a corner.
  await drag('e', 100, 0, true);
  expect(await frame()).toEqual({ x, y: y - 50, w: w + 100, h: h + 100 });
  await drag('se', 40, 0);
  expect(await frame()).toEqual({ x, y: y - 50, w: w + 140, h: h + 140 });
});

test('what was used is offered again on the first screen', async ({ page }) => {
  const panel = await openElements(page);
  await panel.locator('[data-collection="emoji"]').click();
  await panel.locator('[data-sticker="emoji:grinning-face"]').click();
  await panel.getByRole('button', { name: 'Back to collections' }).click();
  await panel.locator('[data-collection="graphics"]').click();
  await panel.locator('[data-sticker="graphic:glossy:trophy-48"]').click();
  await panel.getByRole('button', { name: 'Back to collections' }).click();

  const recent = panel.getByTestId('elements-recent').locator('[data-sticker]');
  expect(
    await recent.evaluateAll((all) => all.map((one) => one.getAttribute('data-sticker'))),
  ).toEqual(['graphic:glossy:trophy-48', 'emoji:grinning-face']);
  await recent.last().click();
  expect((await selected<SvgElement>(page)).name).toBe('emoji:grinning-face');
  expect((await currentSlide(page)).elements).toHaveLength(3);
});

/** Twelve emoji used lately, as an earlier session left them. */
async function rememberTwelve(page: Parameters<typeof openApp>[0]) {
  await page.addInitScript(() => {
    const stickers = Array.from({ length: 12 }, (_, index) => ({
      id: `emoji:recent-${index}`,
      label: { en: `Recent ${index}`, he: `אחרון ${index}` },
      markup: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#e89645"/></svg>`,
    }));
    localStorage.setItem(
      'slidr.elements.recent',
      JSON.stringify({ state: { stickers }, version: 2 }),
    );
  });
}

test('the recent stickers are in place in the first frame the panel paints', async ({ page }) => {
  await rememberTwelve(page);
  await openApp(page, { lang: 'he' });
  // Looks at every frame before it is painted: a row that shows empty and fills a frame later
  // pushes the collections down, and the panel flickers.
  await page.evaluate(() => {
    const look = () => {
      const grid = document.querySelector('[data-testid="elements-recent"]');
      if (grid)
        document.body.dataset.firstRecent = String(grid.querySelectorAll('[data-sticker]').length);
      else requestAnimationFrame(look);
    };
    requestAnimationFrame(look);
  });
  await page.getByTestId('activity-bar').locator('[data-panel="elements"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-first-recent', '8');
});

for (const lang of ['en', 'he'] as const) {
  test(`recent stickers use two rows and open the full list in ${lang}`, async ({ page }) => {
    await rememberTwelve(page);
    const panel = await openElements(page, lang);
    const preview = panel.getByTestId('elements-recent');
    await expect(preview.locator('[data-sticker]')).toHaveCount(8);
    const geometry = await preview.evaluate((grid) => ({
      rows: new Set(
        Array.from(
          grid.querySelectorAll('[data-sticker]'),
          (item) => item.getBoundingClientRect().top,
        ),
      ).size,
      hasHorizontalOverflow: grid.scrollWidth > grid.clientWidth,
    }));
    expect(geometry).toEqual({ rows: 2, hasHorizontalOverflow: false });
    await page.setViewportSize({ width: 1366, height: 768 });
    await expect(preview.locator('[data-sticker]')).toHaveCount(6);
    expect(await preview.evaluate((grid) => grid.scrollWidth > grid.clientWidth)).toBe(false);

    await panel.getByRole('button', { name: lang === 'he' ? 'הצגת הכול' : 'Show all' }).click();
    await expect(panel.locator('[data-collection-view="recent"] [data-sticker]')).toHaveCount(12);
    await panel.locator('[data-sticker="emoji:recent-11"]').click();
    expect((await selected<SvgElement>(page)).name).toBe('emoji:recent-11');
    await panel
      .getByRole('button', { name: lang === 'he' ? 'חזרה לאוספים' : 'Back to collections' })
      .click();
    await expect(preview.locator('[data-sticker]')).toHaveCount(6);
  });
}

test('one search on the first screen finds shapes, graphics, frames, emoji, icons and card sets', async ({
  page,
}) => {
  const panel = await openElements(page, 'he');
  await panel.getByTestId('elements-query').fill('לב');
  const found = panel.getByTestId('elements-found');
  // The shapes come first: a query that names one wants it.
  await expect(found.locator('[data-group]').first()).toHaveAttribute('data-group', 'shapes');
  await expect(found.locator('[data-group="shapes"] [data-shape="shape:heart"]')).toBeVisible();
  await expect(found.locator('[data-group="graphics"] [data-sticker]').first()).toBeVisible();
  await expect(found.locator('[data-group="frames"] [data-frame="frame:heart"]')).toBeVisible();
  // A group is drawn once it comes into view: with nine frames found, the emoji are a scroll away.
  await found.locator('[data-group="emoji"]').scrollIntoViewIfNeeded();
  await expect(
    found.locator('[data-group="emoji"] [data-sticker="emoji:red-heart"]'),
  ).toBeVisible();
  await expect(found.locator('[data-group="icons"] [data-icon="lucide:heart"]')).toBeVisible();

  await found.locator('[data-icon="lucide:heart"]').click();
  expect((await selected<SvgElement>(page)).name).toBe('lucide:heart');
  await found.locator('[data-shape="shape:heart"]').click();
  expect((await selected<ShapeElement>(page)).geometry).toEqual({
    kind: 'preset',
    preset: 'heart',
  });

  // A card set is found by its name, and goes on the slide as the collection puts it there.
  await panel.getByTestId('elements-query').fill('שלבים');
  await expect(found.locator('[data-group="cards"] [data-card-set="steps"]')).toBeVisible();

  await panel.getByTestId('elements-query').fill('');
  await expect(panel.locator('[data-collection]')).toHaveCount(COLLECTIONS.length);
});

test('shapes, icons and tables are added from their collections', async ({ page }) => {
  const panel = await openElements(page);
  const back = () => panel.getByRole('button', { name: 'Back to collections' }).click();

  await panel.locator('[data-collection="shapes"]').click();
  await expect(panel.locator('[data-preset]')).toHaveCount(shapePresets.length);
  await expect(panel.locator('[data-preset="rect"] path')).toHaveAttribute('fill', '#111111');
  await panel.locator('[data-preset="ellipse"]').click();
  expect((await selected<ShapeElement>(page)).geometry).toEqual({
    kind: 'preset',
    preset: 'ellipse',
  });
  await panel.locator('[data-preset="gear12"]').click();
  expect((await selected<ShapeElement>(page)).geometry).toEqual({
    kind: 'preset',
    preset: 'gear12',
  });
  await expect(panel.getByRole('group', { name: 'Lines' }).locator('[data-line]')).toHaveCount(5);

  await back();
  await panel.locator('[data-collection="icons"]').click();
  await expect(panel.getByTestId('elements-icons')).toBeVisible();
  await panel.getByTestId('icon-query').fill('rocket');
  await panel.locator('[data-icon="lucide:rocket"]').click();
  expect((await selected<SvgElement>(page)).name).toBe('lucide:rocket');

  await back();
  await panel.locator('[data-collection="tables"]').click();
  await panel.getByRole('button', { name: '3 rows by 4 columns' }).click();
  const table = (await currentSlide(page)).elements.find(
    (element): element is TableElement => element.type === 'table',
  );
  expect(table?.rows).toHaveLength(3);
  expect(table?.cols).toHaveLength(4);
});

test('the icon collection offers 585 line and 585 filled icons', async ({ page }) => {
  const panel = await openElements(page);
  await panel.locator('[data-collection="icons"]').click();
  const icons = panel.getByTestId('icon-results').locator('[data-icon]');
  const listEnd = panel.getByTestId('elements-icons').locator('div[aria-hidden].h-px');
  await expect(icons.first()).toHaveAttribute('data-icon', 'lucide:chart-line');

  for (let pageNumber = 0; pageNumber < 10 && (await icons.count()) < 585; pageNumber++) {
    const previous = await icons.count();
    await listEnd.scrollIntoViewIfNeeded();
    await expect.poll(() => icons.count()).toBeGreaterThan(previous);
  }
  await expect(icons).toHaveCount(585);

  await panel.getByRole('radio', { name: 'Filled' }).click();
  await expect(icons.first()).toHaveAttribute('data-icon', 'tabler:presentation-analytics-filled');
  for (let pageNumber = 0; pageNumber < 10 && (await icons.count()) < 585; pageNumber++) {
    const previous = await icons.count();
    await listEnd.scrollIntoViewIfNeeded();
    await expect.poll(() => icons.count()).toBeGreaterThan(previous);
  }
  await expect(icons).toHaveCount(585);
  await icons.last().click();
  const filled = await selected<SvgElement>(page);
  expect(filled.name).toMatch(/^tabler:.+-filled$/);
  expect(filled.markup).toContain('fill="currentColor"');
});

test('frames are one collection in groups, and a click adds an empty frame', async ({ page }) => {
  const panel = await openElements(page);
  await panel.locator('[data-collection="frames"]').click();
  const groups = panel.getByTestId('frame-groups');
  // Twenty frames first, then every group with its first rows.
  const featured = groups.locator('[data-group="featured"]');
  await expect(featured.locator('[data-frame]')).toHaveCount(20);
  // An English interface has the English letters, not the Hebrew ones.
  const inEnglish = FRAME_GROUPS.filter((group) => group !== 'hebrew');
  expect(
    await groups
      .locator('[data-group]')
      .evaluateAll((all) => all.map((one) => one.getAttribute('data-group'))),
  ).toEqual(['featured', ...inEnglish]);
  for (const group of inEnglish) {
    await expect(groups.locator(`[data-group="${group}"] [data-frame]`).first()).toBeVisible();
  }

  // A plain frame is a picture with no photograph yet, cut to its outline. Nothing in the
  // collection asks to fill it.
  const before = await undoDepth(page);
  await featured.locator('[data-frame="frame:circle"]').click();
  const circle = await selected<ImageElement>(page);
  expect(circle).toMatchObject({
    type: 'image',
    name: 'frame:circle',
    mask: { kind: 'ellipse' },
    frame: { w: 480, h: 480 },
  });
  expect(circle.assetId).toBeUndefined();
  await expect(onStage(page, circle.id)).toBeVisible();
  await expect(panel.getByTestId('frames-hint')).toHaveCount(0);
  expect(await undoDepth(page)).toBe(before + 1);

  // A decorated frame carries its artwork, around an opening for the photograph. The frame
  // added before it is empty, so it stays as it is and this one is added beside it.
  await featured.locator('[data-frame="frame:instant"]').click();
  const instant = await selected<ImageElement>(page);
  expect(instant.id).not.toBe(circle.id);
  expect(instant.smartFrame?.opening).toEqual({ x: 26, y: 26, w: 348, h: 348 });
  await expect(
    onStage(page, instant.id).locator('[data-frame-artwork] [data-decoration-id]'),
  ).toHaveCount(1);
  expect((await currentSlide(page)).elements).toHaveLength(2);

  // One group in full, under its own name alone, and back to all of them.
  await groups.locator('[data-group="latin"]').getByRole('button', { name: 'Show all' }).click();
  await expect(panel.getByTestId('frame-results').locator('[data-frame]')).toHaveCount(26);
  await expect(panel.getByRole('heading')).toHaveText(['English letters']);
  // A search is of every group, so the collection has its name back while it is shown.
  await panel.getByTestId('frames-query').fill('heart');
  await expect(panel.getByRole('heading')).toHaveText(['Frames']);
  await panel.getByTestId('frames-query').fill('');
  await expect(panel.getByRole('heading')).toHaveText(['English letters']);
  await panel.getByRole('button', { name: 'Back to Frames' }).click();
  await expect(groups).toBeVisible();
  await expect(panel.getByRole('heading', { level: 3 })).toHaveText('Frames');
  // From the collection, the same button goes to the first screen.
  await panel.getByRole('button', { name: 'Back to collections' }).click();
  await expect(panel.getByTestId('element-collections')).toBeVisible();
});

/** The groups a collection shows, in their order. */
const shownGroups = (within: Locator) =>
  within
    .locator('[data-group]')
    .evaluateAll((all) => all.map((one) => one.getAttribute('data-group')));

test('a switch of the language leaves only what is in the new one, and what has none', async ({
  page,
}) => {
  const panel = await openElements(page, 'he');
  await panel.locator('[data-collection="frames"]').click();
  const groups = panel.getByTestId('frame-groups');
  await expect(groups.locator('[data-group="hebrew"]')).toBeVisible();
  expect(await shownGroups(groups)).toEqual([
    'featured',
    ...FRAME_GROUPS.filter((group) => group !== 'latin'),
  ]);
  // The Hebrew letters open in full as the interface is switched to English: they are gone.
  await groups.locator('[data-group="hebrew"]').getByRole('button', { name: 'הצגת הכול' }).click();
  await expect(panel.getByRole('heading')).toHaveText(['אותיות בעברית']);
  await switchLanguage(page, 'en');
  await expect(panel.getByRole('heading', { level: 3 })).toHaveText('Frames');
  expect(await shownGroups(groups)).toEqual([
    'featured',
    ...FRAME_GROUPS.filter((group) => group !== 'hebrew'),
  ]);
  await page.screenshot({ path: 'test-results/elements/language-frames-en.png' });

  // German: the magnets and the card sets have Hebrew and English words only. Shapes, graphics,
  // emoji, icons and tables have no language.
  await switchLanguage(page, 'de');
  expect(await shownGroups(groups)).toEqual([
    'featured',
    ...FRAME_GROUPS.filter((group) => group !== 'hebrew' && group !== 'magnets'),
  ]);
  await panel.getByRole('button', { name: 'Zurück zu den Sammlungen' }).click();
  const tiles = panel.locator('[data-collection]');
  expect(
    await tiles.evaluateAll((all) => all.map((tile) => tile.getAttribute('data-collection'))),
  ).toEqual(COLLECTIONS.filter((id) => id !== 'cards'));
  await page.screenshot({ path: 'test-results/elements/language-home-de.png' });
  // A few designs are drawn in German, in their own panel: each as the slide it adds, in German.
  await page.getByTestId('activity-bar').locator('[data-panel="designs"]').click();
  const ready = page.getByTestId('designs-panel');
  const designs = ready.locator('[data-design]');
  await expect(designs.first().locator('[data-slide-id]')).toBeVisible();
  const shown = await designs.count();
  expect(shown).toBeGreaterThan(0);
  for (const design of await designs.all()) {
    await design.scrollIntoViewIfNeeded();
    await expect(design.locator('[data-slide-id]')).toHaveAttribute('lang', 'de');
  }
  await page.screenshot({ path: 'test-results/elements/language-designs-de.png' });

  // Back in Hebrew, everything Hebrew is there again.
  await switchLanguage(page, 'he');
  await expect(ready.locator('[data-group="deck"] [data-design]')).toHaveCount(4);
  await page.getByTestId('activity-bar').locator('[data-panel="elements"]').click();
  await expect(tiles).toHaveCount(COLLECTIONS.length);
});

test('frames are found in Hebrew, and an empty frame takes a picture from the computer', async ({
  page,
}) => {
  const panel = await openElements(page, 'he');
  await panel.locator('[data-collection="frames"]').click();
  const results = panel.getByTestId('frame-results');
  await panel.getByTestId('frames-query').fill('פולרואיד');
  await expect(results.locator('[data-frame="frame:instant"]')).toHaveAccessibleName(
    'הוספת תצלום מיידי לשקף',
  );
  await panel.getByTestId('frames-query').fill('א');
  await expect(results.locator('[data-frame]').first()).toHaveAttribute(
    'data-frame',
    'frame:he-alef',
  );
  await panel.getByTestId('frames-query').fill('qqqzzz');
  await expect(panel.getByText('לא נמצאו תוצאות')).toBeVisible();

  await panel.getByTestId('frames-query').fill('טלפון');
  await results.locator('[data-frame="frame:phone"]').click();
  const phone = await selected<ImageElement>(page);
  expect(phone.assetId).toBeUndefined();
  // The new frame is selected and empty. Nothing in the collection asks to fill it: the picture
  // comes as it does for any empty picture, from row B or from the placeholder on the slide.
  await expect(panel.getByTestId('frames-hint')).toHaveCount(0);
  const file = await pngBytes(page);
  const chooser = page.waitForEvent('filechooser');
  await row(page).getByRole('button', { name: 'החלפת תמונה' }).click();
  await (await chooser).setFiles({ name: 'view.png', mimeType: 'image/png', buffer: file });
  await expect.poll(async () => (await selected<ImageElement>(page)).assetId).toBeTruthy();
  const filled = await selected<ImageElement>(page);
  expect(filled.id).toBe(phone.id);
  expect(filled.smartFrame).toEqual(phone.smartFrame);
  expect(filled.mask).toEqual(phone.mask);
  await expect(onStage(page, phone.id).locator('[data-image-opening] img')).toBeVisible();
});

test('a selected photograph takes the frame that is clicked, and keeps what it shows', async ({
  page,
}) => {
  const panel = await openElements(page);
  const assetId = await importPicture(page, 'view.png');
  const crop = { x: 0.1, y: 0, w: 0.8, h: 1 };
  await addElement(page, {
    id: 'e_photo',
    type: 'image',
    frame: { x: 400, y: 200, w: 800, h: 400 },
    assetId,
    fit: 'cover',
    crop,
  });
  await panel.locator('[data-collection="frames"]').click();
  await expect(panel.getByTestId('frames-hint')).toContainText('A click on a frame puts');
  const featured = panel.locator('[data-group="featured"]');
  const heart = featured.locator('[data-frame="frame:heart"]');
  await expect(heart).toHaveAccessibleName('Put the selected picture in the frame Heart');

  // The picture takes the proportions of the frame, inside the box it had.
  const before = await undoDepth(page);
  await heart.click();
  const framed = await selected<ImageElement>(page);
  expect(framed).toMatchObject({ id: 'e_photo', assetId, crop, mask: { kind: 'path' } });
  expect(framed.frame).toEqual({ x: 582, y: 200, w: 437, h: 400 });
  expect(await undoDepth(page)).toBe(before + 1);
  expect((await currentSlide(page)).elements).toHaveLength(1);

  // Another frame takes the place of the first: its artwork comes, the heart's outline goes.
  await featured.locator('[data-frame="frame:instant"]').click();
  const instant = await selected<ImageElement>(page);
  expect(instant).toMatchObject({ id: 'e_photo', assetId, crop });
  expect(instant.mask).toBeUndefined();
  expect(instant.smartFrame?.decorations).toHaveLength(1);
  await expect(onStage(page, 'e_photo').locator('[data-image-opening] img')).toBeVisible();

  await undo(page);
  await undo(page);
  const back = (await currentSlide(page)).elements[0] as ImageElement;
  expect(back.frame).toEqual({ x: 400, y: 200, w: 800, h: 400 });
  expect(back.mask).toBeUndefined();
  expect(back.smartFrame).toBeUndefined();
});

for (const lang of ['he', 'en'] as const) {
  test(`magnets are shown at once, from pictures made ahead (${lang})`, async ({ page }) => {
    const panel = await openElements(page, lang);
    await panel.locator('[data-collection="frames"]').click();
    const showAll = panel
      .locator('[data-group="magnets"]')
      .getByRole('button', { name: lang === 'he' ? 'הצגת הכול' : 'Show all' });
    await expect(showAll).toBeVisible();
    await showAll.click();

    // No loading state: every set is there under its name, with a button for every magnet.
    const magnets = panel.getByTestId('frame-results');
    await expect(magnets.getByRole('heading')).toHaveCount(8);
    await expect(magnets.getByRole('button')).toHaveCount(100);
    await expect(panel.getByRole('status')).toHaveCount(0);
    // A magnet is a picture of its design, with its words in the language of the deck. The
    // renderer draws none of the hundred: the four that follow the deck's theme are far below.
    const pictures = magnets.locator('[data-frame] img');
    await expect(pictures).toHaveCount(96);
    await expect(pictures.first()).toBeVisible();
    await expect(pictures.first()).toHaveAttribute(
      'src',
      new RegExp(`/images/frames/${lang}/magnet-[\\w-]+\\.webp`),
    );
    await expect(magnets.locator('[data-slide-id]')).toHaveCount(0);
    await expect
      .poll(() =>
        pictures.evaluateAll((images) =>
          images.every(
            (image) =>
              image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
          ),
        ),
      )
      .toBe(true);
    // The panel's actual pixels in both reading directions.
    await page.getByTestId('tool-panel').screenshot({
      path: `test-results/frames/magnets-gallery-${lang}.png`,
    });

    // A magnet in the colours and the type of the deck has no picture: the renderer draws it,
    // around a stand-in photograph, once it is near the visible part of the panel.
    const company = magnets.locator('[data-frame="frame:magnet-company"]');
    await company.scrollIntoViewIfNeeded();
    await expect(company.locator('[data-element-type="image"] img')).toBeVisible();
    await expect(company.locator('[data-element-type="text"]').first()).toBeVisible();
    await page.getByTestId('tool-panel').screenshot({
      path: `test-results/frames/magnets-gallery-work-${lang}.png`,
    });
  });
}

test('a magnet of an event is a group: its picture, with stickers and a caption of its own', async ({
  page,
}) => {
  const panel = await openElements(page);
  await panel.locator('[data-collection="frames"]').click();
  // The first rows of the group show a magnet of every set, not the first set alone.
  const preview = panel.locator('[data-group="magnets"] [data-frame]');
  await expect(preview).toHaveCount(4);
  await panel.locator('[data-group="magnets"]').getByRole('button', { name: 'Show all' }).click();
  // All hundred magnets appear under their set headings, with no extra filter row.
  const magnets = panel.getByTestId('frame-results');
  await expect(magnets.getByRole('heading')).toHaveText([
    'Family celebrations',
    'Birthdays',
    'Children',
    'School and army',
    'Work',
    'Leisure and trips',
    'Holidays',
    'Styles',
  ]);
  await expect(magnets.locator('[data-magnet-set]')).toHaveCount(0);
  await expect(magnets.locator('[data-group="magnets-family"] [data-frame]')).toHaveCount(13);
  await expect(magnets.locator('section')).toHaveCount(8);
  await expect(magnets.locator('[data-frame]')).toHaveCount(100);
  // A magnet is shown from a picture of its design, made ahead with its words in English.
  const summer = magnets.locator('[data-frame="frame:magnet-summer"]');
  await expect(summer.locator('img')).toHaveAttribute(
    'src',
    /\/images\/frames\/en\/magnet-summer\.webp/,
  );

  // It lands as large as the safe margins allow: the card, the picture on it, three stickers and
  // the caption.
  const before = await undoDepth(page);
  await summer.click();
  const added = await selected<GroupElement>(page);
  expect(added).toMatchObject({
    type: 'group',
    name: 'frame:magnet-summer',
    frame: { x: 316, y: 80, w: 1288, h: 920 },
  });
  expect(added.children.map((child) => child.type)).toEqual([
    'svg',
    'image',
    'svg',
    'svg',
    'svg',
    'text',
  ]);
  expect(await undoDepth(page)).toBe(before + 1);
  const [card, picture, sun] = added.children as [SvgElement, ImageElement, SvgElement];
  const caption = added.children.at(-1) as TextElement;
  expect(card).toMatchObject({ name: 'frame:magnet-summer:card', frame: { x: 0, y: 0 } });
  await expect(onStage(page, sun.id).locator('[data-slidr-svg]')).toBeVisible();

  // The picture is empty, and nothing in the collection asks to fill it. Its placeholder is an
  // object of its own on the card: a double click takes it, and it is moved and sized alone,
  // its window with it. The card stays as it is.
  expect(picture.assetId).toBeUndefined();
  await expect(panel.getByTestId('frames-hint')).toHaveCount(0);
  const placeholder = onStage(page, picture.id).locator('[data-slidr-placeholder="image"]');
  await expect(placeholder).toBeVisible();
  await page.evaluate(() => window.slidr!.selection.getState().clearSelection());
  const spot = (await onStage(page, picture.id).boundingBox())!;
  await page.mouse.dblclick(spot.x + spot.width * 0.5, spot.y + spot.height * 0.7);
  const chosen = () =>
    page.evaluate(() => window.slidr!.selection.getState().selectedElementIds.join(','));
  await expect.poll(chosen).toBe(picture.id);
  const inMagnet = async (id: string) =>
    ((await currentSlide(page)).elements[0] as GroupElement).children.find((c) => c.id === id)!;
  const corner = (await page.locator('[data-handle="se"]').first().boundingBox())!;
  await dragBy(page, corner, -150);
  const smaller = await inMagnet(picture.id);
  expect(smaller.frame.w).toBeLessThan(picture.frame.w - 100);
  expect(Math.abs(smaller.frame.x - picture.frame.x)).toBeLessThan(1);
  await dragBy(page, (await onStage(page, picture.id).boundingBox())!, 120);
  const shifted = await inMagnet(picture.id);
  expect(shifted.frame.x).toBeGreaterThan(smaller.frame.x + 100);
  expect(Math.abs(shifted.frame.w - smaller.frame.w)).toBeLessThan(1);
  expect(await inMagnet(card.id)).toEqual(card);
  expect(await chosen()).toBe(picture.id);
  await undo(page);
  await undo(page);
  expect((await inMagnet(picture.id)).frame).toEqual(picture.frame);
  // Once a photograph is in it, a click on another magnet changes the frame around it.
  await page.evaluate(() => window.slidr!.selection.getState().clearSelection());
  const photo = await importPicture(page, 'view.png');
  const slideId = (await currentSlide(page)).id;
  await page.evaluate(
    ({ slideId, elementId, assetId }) =>
      window.slidr!.bus.dispatch({
        type: 'element.update',
        slideId,
        elementId,
        patch: { assetId },
      }),
    { slideId, elementId: picture.id, assetId: photo },
  );
  await page.evaluate((id) => window.slidr!.selection.getState().selectElements([id]), added.id);
  await expect(panel.getByTestId('frames-hint')).toBeVisible();

  // The caption is a text of the slide: a double click goes into it.
  await onStage(page, caption.id).dblclick();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Sales Kickoff');
  await page.keyboard.press('Escape');
  const select = (id: string) =>
    page.evaluate((id) => window.slidr!.selection.getState().selectElements([id]), id);
  await select(added.id);
  /** The words a magnet says: its captions, and those on its labels. */
  const words = (group: GroupElement): string[] =>
    group.children.flatMap((child) =>
      child.type === 'text'
        ? [child.content.paragraphs.flatMap((p) => p.runs.map((run) => run.text)).join('')]
        : child.type === 'group'
          ? words(child)
          : [],
    );
  expect(words(await selected<GroupElement>(page))).toEqual(['Sales Kickoff']);

  // Another magnet for the same photograph: the group takes its place, with the words typed.
  await magnets.locator('[data-frame="frame:magnet-trip"]').click();
  const trip = await selected<GroupElement>(page);
  expect(trip).toMatchObject({ id: added.id, name: 'frame:magnet-trip', frame: added.frame });
  expect(words(trip)).toEqual(['Sales Kickoff']);
  expect(trip.children[1]).toMatchObject({ id: picture.id, type: 'image', assetId: photo });
  expect(trip.children[0]).toMatchObject({ type: 'svg', name: 'frame:magnet-trip:card' });
  expect(trip.children.some((child) => child.name?.startsWith('frame:magnet-summer:'))).toBe(false);
  await expect(onStage(page, trip.children[0]!.id).locator('[data-slidr-svg]')).toBeVisible();

  // A magnet that says its words on a ribbon: the ribbon is a label, a group of its own in the
  // magnet, and the words typed are on it. No ribbon is drawn on the card.
  await magnets.locator('[data-frame="frame:magnet-birthday"]').click();
  const birthday = await selected<GroupElement>(page);
  expect(birthday).toMatchObject({ id: added.id, name: 'frame:magnet-birthday' });
  expect(words(birthday)).toEqual(['Sales Kickoff']);
  const ribbon = birthday.children.at(-1) as GroupElement;
  expect(ribbon).toMatchObject({ type: 'group', name: 'frame:magnet-birthday:label:ribbon-rose' });
  expect(ribbon.children.map((child) => child.type)).toEqual(['svg', 'text']);
  await expect(onStage(page, ribbon.children[0]!.id).locator('[data-slidr-svg]')).toBeVisible();
  // A click on the plate beside its words takes the label, and a drag then moves it as one
  // thing, its words with it: the card and the photograph stay.
  const tail = async () => {
    const box = (await onStage(page, ribbon.children[0]!.id).boundingBox())!;
    return { x: box.x + 14, y: box.y + box.height / 2 };
  };
  /** What is selected, by id: the label is inside the magnet, not an element of the slide. */
  const picked = () =>
    page.evaluate(() => window.slidr!.selection.getState().selectedElementIds.join(','));
  const labelNow = async () =>
    ((await currentSlide(page)).elements[0] as GroupElement).children.at(-1) as GroupElement;
  const at = await tail();
  await page.mouse.click(at.x, at.y);
  expect(await picked()).toBe(ribbon.id);
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x, at.y - 20, { steps: 4 });
  await page.mouse.move(at.x, at.y - 40, { steps: 4 });
  await page.mouse.up();
  const moved = await labelNow();
  expect(await picked()).toBe(ribbon.id);
  expect(moved.frame.y).toBeLessThan(ribbon.frame.y - 20);
  expect(moved.children.map((child) => child.frame)).toEqual(
    ribbon.children.map((child) => child.frame),
  );
  const magnet = (await currentSlide(page)).elements[0] as GroupElement;
  expect(magnet.children[0]).toEqual(birthday.children[0]);
  expect(magnet.children[1]).toMatchObject({ id: picture.id, frame: birthday.children[1]!.frame });
  // A click on its words goes into them: they are typed over where they stand.
  await select(added.id);
  await onStage(page, ribbon.children[1]!.id).click();
  await expect
    .poll(() => page.evaluate(() => window.slidr!.selection.getState().editingElementId))
    .toBe(ribbon.children[1]!.id);
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Happy 30th, Roni!');
  await page.keyboard.press('Escape');
  await select(added.id);
  expect(words(await selected<GroupElement>(page))).toEqual(['Happy 30th, Roni!']);
  // All of them were selected and typed over, and they are still set as the ribbon sets them.
  const typed = ((await selected<GroupElement>(page)).children.at(-1) as GroupElement)
    .children[1] as TextElement;
  expect(typed.content.paragraphs).toHaveLength(1);
  expect(typed.content.paragraphs[0]).toMatchObject({
    align: 'center',
    runs: [{ marks: { font: 'Poppins', weight: 800, color: { value: '#ffffff' } } }],
  });

  // A frame that is a picture alone takes the photograph out of the group.
  await panel.getByRole('button', { name: 'Back to Frames' }).click();
  await panel.locator('[data-group="featured"] [data-frame="frame:circle"]').click();
  const alone = await selected<ImageElement>(page);
  expect(alone).toMatchObject({ id: picture.id, type: 'image', mask: { kind: 'ellipse' } });
  expect(alone.smartFrame).toBeUndefined();
  expect((await currentSlide(page)).elements).toHaveLength(1);
});

test('a frame that is made larger keeps its artwork, and the photograph has the rest', async ({
  page,
}) => {
  const panel = await openElements(page);
  await panel.locator('[data-collection="frames"]').click();
  const groups = panel.getByTestId('frame-groups');
  /** Drags a handle of the selection by a distance on the screen. */
  const drag = async (handle: string, dx: number, dy: number) => {
    const box = (await page.locator(`[data-handle="${handle}"]`).boundingBox())!;
    const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 4 });
    await page.mouse.move(x + dx, y + dy, { steps: 4 });
    await page.mouse.up();
  };

  // An instant photo: a card 26 wide around the photograph, and 106 below it.
  await groups.locator('[data-group="featured"] [data-frame="frame:instant"]').click();
  const added = await selected<ImageElement>(page);
  expect(added).toMatchObject({ frame: { w: 400, h: 480 }, smartFrame: { scale: 1 } });
  const opening = onStage(page, added.id).locator('[data-image-opening]');
  const artwork = onStage(page, added.id).locator('[data-frame-artwork]');
  /** The card around the photograph, in slide pixels: left, above, right and below. */
  const card = async () => {
    const { frame } = await selected<ImageElement>(page);
    const [x, y, w, h] = await opening.evaluate((el: HTMLElement) =>
      [el.style.left, el.style.top, el.style.width, el.style.height].map(parseFloat),
    );
    return [x, y, frame.w - x! - w!, frame.h - y! - h!];
  };
  expect(await card()).toEqual([26, 26, 26, 106]);

  // An edge moves alone: the frame is wider, as high as it was, and the card is as it was.
  const before = await undoDepth(page);
  await drag('e', 180, 0);
  const wider = await selected<ImageElement>(page);
  expect(wider.frame.w).toBeGreaterThan(600);
  expect(wider.frame.h).toBe(480);
  expect(await card()).toEqual([26, 26, 26, 106]);
  await expect(artwork).toHaveCSS('width', `${wider.frame.w}px`);
  expect(await artwork.evaluate((el: HTMLElement) => el.style.transform)).toBe('scale(1, 1)');
  expect(await undoDepth(page)).toBe(before + 1);

  // A corner sizes the frame in its proportions, and the card is still as wide.
  await drag('se', 90, 90);
  const larger = await selected<ImageElement>(page);
  expect(larger.frame.w).toBeGreaterThan(wider.frame.w);
  expect(larger.frame.w / larger.frame.h).toBeCloseTo(wider.frame.w / wider.frame.h, 1);
  expect(await card()).toEqual([26, 26, 26, 106]);

  // Narrower than the card was drawn, the card is drawn smaller, whole: nothing is squeezed.
  await drag('e', -500, 0);
  const narrow = await selected<ImageElement>(page);
  expect(narrow.frame.w).toBeLessThan(400);
  const [left, , right] = await card();
  expect(left).toBeCloseTo((26 * narrow.frame.w) / 400, 1);
  expect(right).toBeCloseTo(left!, 1);

  // A magnet: what stands beside its picture keeps its size, on the corner it stands on.
  await page.evaluate(() => window.slidr!.selection.getState().selectElements([]));
  await groups.locator('[data-group="magnets"]').getByRole('button', { name: 'Show all' }).click();
  const magnets = panel.getByTestId('frame-results');
  await magnets.locator('[data-frame="frame:magnet-summer"]').click();
  const magnet = await selected<GroupElement>(page);
  const [, photo, sun] = magnet.children as [SvgElement, ImageElement, SvgElement];
  const caption = magnet.children.at(-1) as TextElement;
  await drag('e', 120, 0);
  const grown = await selected<GroupElement>(page);
  const [cardAfter, picture, sunAfter] = grown.children as [SvgElement, ImageElement, SvgElement];
  const captionAfter = grown.children.at(-1) as TextElement;
  expect(grown.frame.w).toBeGreaterThan(magnet.frame.w + 100);
  expect(grown.frame.h).toBe(magnet.frame.h);
  // The card takes the whole of the group; the photograph on it grows with its opening, the
  // card's margins around it as wide as they were.
  expect(cardAfter.frame).toMatchObject({ x: 0, y: 0, w: grown.frame.w, h: grown.frame.h });
  expect(picture.frame.x).toBeCloseTo(photo.frame.x, 1);
  expect(picture.frame.h).toBeCloseTo(photo.frame.h, 1);
  expect(grown.frame.w - picture.frame.x - picture.frame.w).toBeCloseTo(
    magnet.frame.w - photo.frame.x - photo.frame.w,
    1,
  );
  const fromEnd = (group: GroupElement, child: { frame: { x: number; w: number } }) =>
    group.frame.w - child.frame.x - child.frame.w;
  expect([sunAfter.frame.w, sunAfter.frame.h]).toEqual([sun.frame.w, sun.frame.h]);
  expect(fromEnd(grown, sunAfter)).toBeCloseTo(fromEnd(magnet, sun), 1);
  // The caption reaches as far as it did towards both sides of the card, in type of its size.
  expect(captionAfter.frame.x).toBeCloseTo(caption.frame.x, 1);
  expect(fromEnd(grown, captionAfter)).toBeCloseTo(fromEnd(magnet, caption), 1);
  expect(captionAfter.frame.h).toBe(caption.frame.h);
  expect(captionAfter.content).toEqual(caption.content);

  // A label crossing the card lengthens with it; its height and type remain the same.
  await page.evaluate(() => window.slidr!.selection.getState().selectElements([]));
  await magnets.locator('[data-frame="frame:magnet-birthday"]').click();
  const birthday = await selected<GroupElement>(page);
  const ribbon = birthday.children.at(-1) as GroupElement;
  await drag('e', 120, 0);
  const wide = await selected<GroupElement>(page);
  const ribbonAfter = wide.children.at(-1) as GroupElement;
  expect(wide.frame.w).toBeGreaterThan(birthday.frame.w + 100);
  expect(ribbonAfter.frame.w).toBeGreaterThan(ribbon.frame.w);
  expect(ribbonAfter.frame.h).toBe(ribbon.frame.h);
  expect(ribbonAfter.children[1]!.frame.w).toBeGreaterThan(ribbon.children[1]!.frame.w);
  expect((ribbonAfter.children[1] as TextElement).content).toEqual(
    (ribbon.children[1] as TextElement).content,
  );
});

test('a frame of an earlier catalogue takes its artwork of now when it is resized', async ({
  page,
}) => {
  const panel = await openElements(page);
  // The frames are at hand once the collection was shown.
  await panel.locator('[data-collection="frames"]').click();
  await expect(panel.getByTestId('frame-groups')).toBeVisible();
  // An instant photo as the frames once made it: artwork of one size, stretched with it.
  await addElement(page, {
    id: 'e_old',
    type: 'image',
    name: 'frame:instant',
    frame: { x: 200, y: 200, w: 400, h: 480 },
    fit: 'cover',
    smartFrame: {
      viewBox: { w: 400, h: 480 },
      opening: { x: 26, y: 26, w: 348, h: 348 },
      decorations: [
        {
          id: 'e_old_card',
          type: 'shape',
          rotation: 0,
          opacity: 1,
          frame: { x: 0, y: 0, w: 400, h: 480 },
          geometry: { kind: 'path', d: 'M0 0L400 0L400 480L0 480Z', viewBox: { w: 400, h: 480 } },
          fill: { kind: 'solid', color: { value: '#ffffff' } },
        },
      ],
    },
  });
  const artwork = onStage(page, 'e_old').locator('[data-frame-artwork]');
  await expect(artwork.locator('[data-decoration-id="e_old_card"]')).toBeVisible();

  const before = await undoDepth(page);
  const handle = (await page.locator('[data-handle="e"]').boundingBox())!;
  await dragBy(page, handle, 150);
  const resized = await selected<ImageElement>(page);
  // Wider, as high as it was, in the artwork that keeps its size: the card is 26 wide still.
  expect(resized.frame.w).toBeGreaterThan(550);
  expect(resized.frame.h).toBe(480);
  expect(resized.smartFrame).toMatchObject({ scale: 1, decorations: [{ type: 'svg' }] });
  await expect(artwork.locator('[data-slidr-svg]')).toBeVisible();
  const opening = onStage(page, 'e_old').locator('[data-image-opening]');
  await expect(opening).toHaveCSS('left', '26px');
  await expect(opening).toHaveCSS('width', `${resized.frame.w - 52}px`);
  // One step, and undo brings the picture back as it was.
  expect(await undoDepth(page)).toBe(before + 1);
  await undo(page);
  expect((await selected<ImageElement>(page)).smartFrame).not.toHaveProperty('scale');
});

test('frames are in the exported file as they are on the slide', async ({ page }) => {
  const panel = await openElements(page);
  const assetId = await importPicture(page, 'view.png');
  await panel.locator('[data-collection="frames"]').click();
  const featured = panel.locator('[data-group="featured"]');

  // A heart with a photograph in it, and a phone that is still empty.
  await featured.locator('[data-frame="frame:heart"]').click();
  const heart = await selected<ImageElement>(page);
  await page.evaluate(
    ({ elementId, assetId }) => {
      const editor = window.slidr!;
      const slideId = editor.selection.getState().currentSlideId ?? '';
      editor.bus.dispatch({ type: 'element.update', slideId, elementId, patch: { assetId } });
      editor.selection.getState().selectElements([]);
    },
    { elementId: heart.id, assetId },
  );
  await featured.locator('[data-frame="frame:phone"]').click();
  const phone = await selected<ImageElement>(page);
  expect(phone.id).not.toBe(heart.id);

  await page.getByTestId('file-menu-trigger').click();
  await page.getByRole('menuitem', { name: 'Export HTML…', exact: true }).click();
  await expect(page.getByTestId('export-dialog')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByTestId('export-run').click();
  const html = readFileSync(await (await download).path(), 'utf8');

  // The file draws the slide with the renderer: the cut of the heart, the photograph inside
  // it, and the phone's artwork over its opening.
  const drawn = (id: string) => html.slice(html.indexOf(`data-element-id="${id}"`));
  expect(drawn(heart.id)).toMatch(/^[^>]*>\s*<div style="[^"]*clip-path: ?path\(/);
  expect(html.match(/<img /g)).toHaveLength(1);
  expect(html.match(/data-image-opening/g)).toHaveLength(1);
  expect(html.match(/data-frame-artwork/g)).toHaveLength(1);
  expect(drawn(phone.id)).toContain('data-decoration-id');
});
