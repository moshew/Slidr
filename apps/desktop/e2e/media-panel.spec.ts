import { expect, test, type Page } from '@playwright/test';
import type { Element } from '@slidr/model';
import {
  addPlaceholders,
  collectErrors,
  deck,
  elements,
  openApp,
  openMedia,
  redo,
  undo,
  undoDepth,
} from './media-helpers';

/*
 * The media panel (WG5-T11, T13, WG12-T04 to T07): stock photos, icons, the deck's own pictures
 * and AI images. The photo library and the image provider are the page's stand-ins; the icon
 * library is the real one.
 */

const results = (page: Page) => page.getByTestId('stock-results').locator('button');
const icons = (page: Page) => page.getByTestId('icon-results').locator('button');

async function searchStock(page: Page, query: string): Promise<void> {
  await page.getByTestId('stock-query').fill(query);
  await page.keyboard.press('Enter');
}

/** The colour the Stage draws an element's icon in. */
function drawnColor(page: Page, elementId: string): Promise<string> {
  return page.evaluate((id) => {
    // The picture of an `svg` element is in a shadow root of its own.
    const svg = document
      .querySelector(`[data-testid="stage-surface"] [data-element-id="${id}"] [data-slidr-svg]`)
      ?.shadowRoot?.querySelector('svg');
    return svg ? getComputedStyle(svg).color : '';
  }, elementId);
}

/** A CSS colour as the browser computes it. */
function computed(page: Page, color: string): Promise<string> {
  return page.evaluate((value) => {
    const probe = document.createElement('span');
    probe.style.color = value;
    document.body.append(probe);
    const result = getComputedStyle(probe).color;
    probe.remove();
    return result;
  }, color);
}

test('a stock photo is found, added with its credit, and is one undo step', async ({ page }) => {
  const errors = collectErrors(page);
  await openApp(page);
  await openMedia(page, 'stock');

  // A Hebrew query goes to the library in English, and the panel says what it searched for.
  await searchStock(page, 'שדה חיטה');
  await expect(results(page)).toHaveCount(20);
  await expect(page.getByTestId('stock-translated')).toContainText('field wheat');
  // The libraries' terms: the photographer under every photo, and the library named.
  await expect(page.getByTestId('stock-results').locator('figcaption').first()).toContainText(
    'Dana Levi',
  );
  await expect(page.getByTestId('stock-provided-by')).toContainText('Mock photos');

  const before = await undoDepth(page);
  await results(page).first().click();
  await expect.poll(() => elements(page).then((list) => list.length)).toBe(1);

  const [image] = await elements(page);
  expect(image?.type).toBe('image');
  const assetId = (image as Extract<Element, { type: 'image' }>).assetId ?? '';
  const asset = (await deck(page)).assets[assetId];
  expect(asset).toMatchObject({
    origin: 'stock',
    attribution: { author: 'Dana Levi', license: 'Mock License' },
  });
  expect(asset?.attribution?.url).toMatch(/^https:\/\/example\.com\/mock-photos\//);
  // The asset and the element came in together.
  expect(await undoDepth(page)).toBe(before + 1);
  await expect(page.getByTestId('stock-credits')).toContainText('Dana Levi');

  await undo(page);
  expect(await elements(page)).toEqual([]);
  expect((await deck(page)).assets).not.toHaveProperty(assetId);
  await expect(page.getByTestId('stock-credits')).toHaveCount(0);
  await redo(page);
  expect((await deck(page)).assets).toHaveProperty(assetId);
  expect(await elements(page)).toHaveLength(1);

  // More results, and the search survives a look at another tab.
  await page.getByRole('button', { name: 'עוד תמונות' }).click();
  await expect(results(page)).toHaveCount(40);
  await openMedia(page, 'uploads');
  await openMedia(page, 'stock');
  await expect(results(page)).toHaveCount(40);
  expect(errors).toEqual([]);
});

test('a search that finds nothing, or fails, says so', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  await openMedia(page, 'stock');
  await searchStock(page, 'mock:empty');
  await expect(page.getByText('No photos found')).toBeVisible();
  await searchStock(page, 'mock:rate_limit');
  await expect(page.getByRole('alert')).toContainText('request limit was reached');
  await searchStock(page, 'mock:offline');
  await expect(page.getByRole('alert')).toContainText('could not be reached');
  // A shape narrows the search that is on screen.
  await searchStock(page, 'tower');
  await expect(results(page)).toHaveCount(20);
  await page.getByRole('radio', { name: 'Tall' }).click();
  await expect
    .poll(() =>
      results(page).evaluateAll((tiles) =>
        tiles.every((tile) => {
          const { width, height } = tile.getBoundingClientRect();
          return height > width;
        }),
      ),
    )
    .toBe(true);
});

test('icons are found in Hebrew and in English, and an inserted icon takes the theme colour', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openApp(page);
  await openMedia(page, 'icons');
  // Before a query: the common icons.
  await expect(icons(page).first()).toHaveAttribute('data-icon', 'lucide:star');

  await page.getByTestId('icon-query').fill('רקטה');
  await expect(icons(page).first()).toHaveAttribute('data-icon', 'lucide:rocket');
  await page.getByTestId('icon-query').fill('rocket');
  await expect(icons(page).first()).toHaveAttribute('data-icon', 'lucide:rocket');
  await expect(icons(page).nth(1)).toHaveAttribute('data-icon', 'tabler:rocket');
  await page.getByTestId('icon-query').fill('חץ ימינה');
  await expect(icons(page).first()).toHaveAttribute('data-icon', 'lucide:arrow-right');

  await page.getByTestId('icon-query').fill('רקטה');
  await expect(icons(page).first()).toHaveAttribute('data-icon', 'lucide:rocket');
  const before = await undoDepth(page);
  await icons(page).first().click();
  const [icon] = await elements(page);
  expect(icon).toMatchObject({
    type: 'svg',
    name: 'lucide:rocket',
    colorOverrides: { currentColor: { token: 'primary' } },
  });
  expect(await undoDepth(page)).toBe(before + 1);

  // Drawn in the theme's primary colour, and it follows the theme when that changes.
  const primary = (await deck(page)).theme.colors.primary;
  expect(await drawnColor(page, icon!.id)).toBe(await computed(page, primary));
  await page.evaluate(() =>
    window.slidr!.bus.dispatch({ type: 'theme.update', patch: { colors: { primary: '#C2185B' } } }),
  );
  await expect.poll(() => drawnColor(page, icon!.id)).toBe(await computed(page, '#C2185B'));

  // Row B has the icon's colour: another theme colour is another token.
  await page.getByRole('button', { name: 'צבע האייקון' }).click();
  await page.getByRole('button', { name: 'הדגשה' }).click();
  await expect
    .poll(() =>
      elements(page).then(([first]) => (first as { colorOverrides?: unknown }).colorOverrides),
    )
    .toEqual({ currentColor: { token: 'accent' } });
  await page.keyboard.press('Escape');

  // Three steps back: the colour, the theme, the icon.
  await undo(page);
  await undo(page);
  await undo(page);
  expect(await elements(page)).toEqual([]);

  // The filled style is a set of its own.
  await page.getByRole('radio', { name: 'מלא' }).click();
  await page.getByTestId('icon-query').fill('כוכב');
  await expect(icons(page).first()).toHaveAttribute('data-icon', 'tabler:star-filled');
  await page.getByTestId('icon-query').fill('qqqzzz');
  await expect(page.getByText('לא נמצאו אייקונים')).toBeVisible();
  expect(errors).toEqual([]);
});

test('the icon button of row A opens the library', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  await page.getByRole('button', { name: 'Icon', exact: true }).click();
  await expect(page.getByTestId('media-icons')).toBeVisible();
  await expect(icons(page).first()).toBeVisible();
});

test("the deck's own pictures are added to a slide again with a click", async ({ page }) => {
  const errors = collectErrors(page);
  await openApp(page, { lang: 'en' });
  await openMedia(page, 'uploads');
  await expect(page.getByText('No images in the presentation yet')).toBeVisible();

  // A picture that reached the deck some other way: dropped, pasted, or uploaded.
  const assetId = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 200;
    canvas.getContext('2d')!.fillRect(0, 0, 320, 200);
    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b!), 'image/png'),
    );
    const editor = window.slidr!;
    const asset = await editor.assets.import(
      new File([blob], 'team photo.png', { type: 'image/png' }),
    );
    editor.bus.dispatch({ type: 'asset.add', asset });
    return asset.id;
  });
  const tile = page.getByTestId('media-uploads').locator(`[data-asset="${assetId}"]`);
  await expect(tile).toHaveAttribute('aria-label', 'Add to the slide: team photo');
  const before = await undoDepth(page);
  await tile.click();
  expect(await elements(page)).toMatchObject([{ type: 'image', assetId }]);
  expect(await undoDepth(page)).toBe(before + 1);
  expect(errors).toEqual([]);
});

test('a picture the deck no longer uses is taken out of it, and one it uses is not', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openApp(page, { lang: 'en' });
  await openMedia(page, 'uploads');
  // Two pictures in the deck: one on the slide, one not.
  const [used, free] = await page.evaluate(async () => {
    const editor = window.slidr!;
    const picture = async (name: string, shade: string) => {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 200;
      const context = canvas.getContext('2d')!;
      context.fillStyle = shade;
      context.fillRect(0, 0, 320, 200);
      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b!), 'image/png'),
      );
      const asset = await editor.assets.import(new File([blob], name, { type: 'image/png' }));
      editor.bus.dispatch({ type: 'asset.add', asset });
      return asset;
    };
    const one = await picture('on the slide.png', 'teal');
    const two = await picture('spare.png', 'gold');
    editor.bus.dispatch({
      type: 'element.add',
      slideId: editor.selection.getState().currentSlideId!,
      element: {
        id: 'e_photo',
        type: 'image',
        frame: { x: 100, y: 100, w: 320, h: 200 },
        rotation: 0,
        opacity: 1,
        fit: 'cover',
        assetId: one.id,
      },
    });
    return [one.id, two.id];
  });
  const panel = page.getByTestId('media-uploads');
  const removeOf = (id: string) => panel.locator(`[data-remove-asset="${id}"]`);
  await panel.locator(`[data-asset="${free}"]`).hover();
  await expect(removeOf(free)).toBeVisible();
  await expect(removeOf(free)).toHaveAccessibleName('Remove from the presentation: spare');

  const before = await undoDepth(page);
  await removeOf(free).click();
  await expect(panel.locator(`[data-asset="${free}"]`)).toHaveCount(0);
  expect(Object.keys((await deck(page)).assets)).toEqual([used]);
  expect(await undoDepth(page)).toBe(before + 1);
  await undo(page);
  await expect(panel.locator(`[data-asset="${free}"]`)).toBeVisible();

  // The one on the slide stays, and the user is told why.
  await panel.locator(`[data-asset="${used}"]`).hover();
  await removeOf(used).click();
  const dialog = page.getByRole('alertdialog').or(page.getByRole('dialog'));
  await expect(dialog).toContainText('The presentation uses this image');
  await page.keyboard.press('Escape');
  expect(Object.keys((await deck(page)).assets).sort()).toEqual([used, free].sort());

  // From the keyboard: Delete on a tile.
  await panel.locator(`[data-asset="${free}"]`).focus();
  await page.keyboard.press('Delete');
  await expect(panel.locator(`[data-asset="${free}"]`)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('AI images: the deck style, the placeholders that wait, and what was made', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openApp(page);
  const ids = await addPlaceholders(page, ['נמל דייגים קטן בזריחה', 'A lighthouse at dusk']);
  const ai = await openMedia(page, 'ai');

  // The image style is the deck's `meta.imageStyle`, saved when the field is left.
  const style = page.getByTestId('image-style');
  await style.fill('איור וקטורי שטוח, צבעים רכים');
  await style.blur();
  await expect
    .poll(() => deck(page).then((d) => d.meta.imageStyle))
    .toBe('איור וקטורי שטוח, צבעים רכים');
  await undo(page);
  await expect(style).toHaveValue('');
  await redo(page);
  await expect(style).toHaveValue('איור וקטורי שטוח, צבעים רכים');

  // Both placeholders wait, each with its prompt and its slide.
  const rows = ai.getByTestId('ai-placeholders').locator('li');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('נמל דייגים קטן בזריחה');
  await expect(rows.first()).toContainText('שקף 1');

  // One image: it lands in its placeholder, as one undo step, and joins the history.
  const before = await undoDepth(page);
  await rows.first().getByRole('button').last().click();
  await expect(page.locator(`[data-placeholder="${ids[0]}"]`)).toHaveAttribute(
    'data-state',
    'working',
  );
  await expect(rows).toHaveCount(1);
  expect(await undoDepth(page)).toBe(before + 1);
  const first = (await elements(page)).find((e) => e.id === ids[0]) as Extract<
    Element,
    { type: 'image' }
  >;
  expect(first.assetId).toBeTruthy();
  expect(first).not.toHaveProperty('prompt');
  expect((await deck(page)).assets[first.assetId ?? '']).toMatchObject({
    origin: 'ai',
    lineage: { provider: 'mock', prompt: 'נמל דייגים קטן בזריחה' },
  });
  const made = ai.locator(`[data-asset="${first.assetId}"]`);
  await expect(made).toBeVisible();

  // Undo empties the frame again, and the placeholder is back in the list.
  await undo(page);
  await expect(rows).toHaveCount(2);

  // All of them, side by side.
  await page.getByTestId('ai-fill-all').click();
  await expect(rows).toHaveCount(0);
  const filled = (await elements(page)).filter((e) => e.type === 'image' && e.assetId);
  expect(filled).toHaveLength(2);

  // An image of the history goes onto the slide with a click.
  await ai.locator('[data-asset]').first().click();
  expect(await elements(page)).toHaveLength(3);
  expect(errors).toEqual([]);
});

const SLIDE = `<div data-archetype="textImage" dir="rtl" lang="he" style="position:relative;width:1920px;height:1080px;background:var(--color-bg);font-family:var(--font-body)">
  <h1 data-role="title" style="position:absolute;right:120px;top:120px;width:800px;margin:0;font-size:72px;color:var(--color-text)">יוצאים לדרך</h1>
  <i data-icon="lucide:rocket" style="position:absolute;right:120px;top:320px;font-size:96px;color:var(--color-primary)"></i>
  <i data-icon="tabler:target" style="position:absolute;right:280px;top:320px;font-size:96px;color:var(--color-accent)"></i>
  <img data-image-prompt="A small fishing harbour at sunrise" style="position:absolute;left:120px;top:120px;width:800px;height:840px;object-fit:cover">
</div>`;

test('a slide written as HTML ends with real icons and a generated image', async ({ page }) => {
  const errors = collectErrors(page);
  await openApp(page);
  // The agent's two calls, through the Deck API the app gives it, with the page's stand-ins for
  // the capture window and the image provider (see media-page.ts).
  const [created, filled] = await page.evaluate(
    async ([html, path]) => {
      const { agentCalls } = (await import(/* @vite-ignore */ path!)) as {
        agentCalls: (
          editor: unknown,
          calls: { name: string; input: unknown }[],
        ) => Promise<
          { ok: boolean; data?: Record<string, unknown>; error?: { message: string } }[]
        >;
      };
      return agentCalls(window.slidr, [
        { name: 'slide_create_from_html', input: { html } },
        { name: 'image_fill_placeholders', input: {} },
      ]);
    },
    [SLIDE, '/e2e/media-page.ts'],
  );

  expect(created?.ok, created?.error?.message).toBe(true);
  expect(created?.data?.imagePlaceholders).toHaveLength(1);
  expect(filled?.ok, filled?.error?.message).toBe(true);
  expect(filled?.data).toMatchObject({ failed: [], remaining: 0 });

  const slide = (await deck(page)).slides.at(-1)!;
  const svgs = slide.elements.filter((e) => e.type === 'svg');
  expect(svgs.map((e) => e.name)).toEqual(['lucide:rocket', 'tabler:target']);
  expect(svgs[0]).toMatchObject({ colorOverrides: { currentColor: { token: 'primary' } } });
  const image = slide.elements.find((e) => e.type === 'image') as Extract<
    Element,
    { type: 'image' }
  >;
  expect(image.assetId).toBeTruthy();
  expect(image).not.toHaveProperty('prompt');
  expect((await deck(page)).assets[image.assetId ?? '']).toMatchObject({ origin: 'ai' });
  expect(errors).toEqual([]);
});
