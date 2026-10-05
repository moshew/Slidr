import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import type { SvgElement } from '@slidr/model';
import {
  addElement,
  currentSlide,
  deck,
  onStage,
  openApp,
  pageProblems,
  row,
  selected,
  undo,
  undoDepth,
} from './objects-helpers';

/*
 * Importing an SVG and recolouring it (WG5-T10: SHP-06, SEC-06). The file goes in as cleaned
 * markup; each of its colours can be replaced, and a replacement picked from the theme is its
 * token, so the drawing follows the theme.
 */

const out = (name: string) =>
  fileURLToPath(new URL(`../test-results/objects/${name}.png`, import.meta.url));

/** A logo as a designer's tool writes one: classes for the colours, and things that must not run. */
const LOGO = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200">
  <style>.a{fill:#e11d48}.b{fill:#0ea5e9} body{display:none}</style>
  <script>window.svgRan = true</script>
  <rect class="a" width="200" height="200" onclick="window.svgRan = true"/>
  <circle class="b" cx="300" cy="100" r="80"/>
  <image href="https://example.com/track.png" width="1" height="1"/>
</svg>`;

const rowA = (page: Page) => page.getByTestId('top-tools-a');

async function insertLogo(page: Page, name = 'התמונה') {
  const chooser = page.waitForEvent('filechooser');
  await rowA(page).getByRole('button', { name }).click();
  await (
    await chooser
  ).setFiles({ name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(LOGO) });
  await expect(row(page)).toHaveAttribute('data-selection', 'shape');
  return selected<SvgElement>(page);
}

/** The fill a shape of the drawing is painted in on the Stage. */
const painted = (page: Page, id: string, selector: string) =>
  onStage(page, id)
    .locator(selector)
    .evaluate((shape) => getComputedStyle(shape).fill);

test.afterEach(({ page }) => {
  expect(pageProblems(page)).toEqual([]);
});

test('an SVG file goes in as cleaned markup, and each colour can be tied to the theme', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  const steps = await undoDepth(page);
  const logo = await insertLogo(page, 'Image');
  // The markup is in the element; nothing of the file runs or reaches out, and its stylesheet,
  // which would have hidden the whole editor, is gone.
  expect(logo.assetId).toBeUndefined();
  expect(logo.markup).toContain('<rect');
  expect(logo.markup).not.toMatch(/script|onclick|example\.com|<style/);
  expect(logo).toMatchObject({ name: 'logo', frame: { w: 400, h: 200 } });
  expect(Object.keys((await deck(page)).assets)).toEqual([]);
  expect(await page.evaluate(() => (window as { svgRan?: boolean }).svgRan)).toBeUndefined();
  await expect(page.getByTestId('stage-frame')).toBeVisible();
  expect(await undoDepth(page)).toBe(steps + 1);
  expect(await painted(page, logo.id, 'rect')).toBe('rgb(225, 29, 72)');

  // Row B lists the two colours of the drawing; one is replaced by the theme's primary.
  await row(page).getByRole('button', { name: 'Colours of the graphic' }).click();
  const colours = page.getByTestId('svg-colours');
  await expect(colours.locator('[data-colour]')).toHaveCount(2);
  await colours.getByRole('button', { name: 'Replace #E11D48' }).click();
  await page.getByRole('button', { name: 'Primary', exact: true }).click();
  await expect
    .poll(async () => (await selected<SvgElement>(page)).colorOverrides)
    .toEqual({ '#e11d48': { token: 'primary' } });
  await page.keyboard.press('Escape');
  const primary = await page.evaluate(() => window.slidr!.bus.deck.theme.colors.primary);
  const asRgb = (hex: string) =>
    page.evaluate((value) => {
      const probe = document.createElement('i');
      probe.style.color = value;
      document.body.append(probe);
      const rgb = getComputedStyle(probe).color;
      probe.remove();
      return rgb;
    }, hex);
  expect(await painted(page, logo.id, 'rect')).toBe(await asRgb(primary));
  // The other colour is as it was.
  expect(await painted(page, logo.id, 'circle')).toBe('rgb(14, 165, 233)');

  // The drawing follows the theme.
  await page.evaluate(() => {
    const { bus } = window.slidr!;
    bus.dispatch({
      type: 'theme.update',
      patch: { colors: { ...bus.deck.theme.colors, primary: '#15803d' } },
    });
  });
  await expect.poll(() => painted(page, logo.id, 'rect')).toBe('rgb(21, 128, 61)');
  await undo(page);

  // Back to the colours of the file. (Escape closed the picker; the list may still be open.)
  if (!(await colours.isVisible())) {
    await row(page).getByRole('button', { name: 'Colours of the graphic' }).click();
  }
  await page.getByRole('button', { name: 'Back to the original colours' }).click();
  expect((await selected<SvgElement>(page)).colorOverrides).toBeUndefined();
  expect(await painted(page, logo.id, 'rect')).toBe('rgb(225, 29, 72)');
});

test('an SVG kept as a file is made editable from row B', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  // As a deck from before this version has it: the file is an asset, drawn as a picture.
  const assetId = await page.evaluate(async (text) => {
    const editor = window.slidr!;
    const asset = await editor.assets.import(
      new File([text], 'logo.svg', { type: 'image/svg+xml' }),
    );
    editor.bus.dispatch({ type: 'asset.add', asset });
    return asset.id;
  }, LOGO);
  await addElement(page, {
    id: 'e_logo',
    type: 'svg',
    frame: { x: 600, y: 400, w: 400, h: 200 },
    assetId,
  });
  await expect(onStage(page, 'e_logo').locator('img')).toBeVisible();
  const steps = await undoDepth(page);

  await row(page).getByRole('button', { name: 'Colours of the graphic' }).click();
  await page.getByTestId('svg-make-editable').click();
  await expect.poll(async () => (await selected<SvgElement>(page)).markup).toContain('<rect');
  const made = await selected<SvgElement>(page);
  expect(made.assetId).toBeUndefined();
  expect(made.markup).not.toMatch(/script|onclick|<style/);
  expect(await undoDepth(page)).toBe(steps + 1);
  await expect(page.getByTestId('svg-colours').locator('[data-colour]')).toHaveCount(2);
  await undo(page);
  expect((await currentSlide(page)).elements[0]).toMatchObject({ assetId });
});

test('a drop takes the files it can, and names the one it left out', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  const steps = await undoDepth(page);
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    canvas.getContext('2d')!.fillRect(0, 0, 64, 64);
    const png = await new Promise<Blob>((resolve) =>
      canvas.toBlob((blob) => resolve(blob!), 'image/png'),
    );
    // A drawing with the notes its program left in it: an element of another kind of markup
    // with a `style` attribute once made the whole drop fail, without a word.
    const drawing = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">
      <metadata><x:note xmlns:x="urn:example" style="color: red">made by a drawing program</x:note></metadata>
      <rect width="10" height="10" fill="#ff0000" mask="url(https://example.com/track.svg#m)"/></svg>`;
    // A scan: a TIFF, which the asset store calls a picture and the webview cannot draw.
    const tiff = new Uint8Array([
      0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x01, 0x03, 0x00, 0x01,
      0x00, 0x00, 0x00, 0x80, 0x02, 0x00, 0x00, 0x01, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00,
      0xe0, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);
    const data = new DataTransfer();
    data.items.add(new File([png], 'good.png', { type: 'image/png' }));
    data.items.add(new File([drawing], 'drawing.svg', { type: 'image/svg+xml' }));
    data.items.add(new File([tiff], 'scan.tif', { type: 'image/tiff' }));
    const stage = document.querySelector('[data-testid="stage-frame"]')!;
    const box = stage.getBoundingClientRect();
    const init = {
      bubbles: true,
      cancelable: true,
      clientX: box.left + box.width / 2,
      clientY: box.top + box.height / 2,
      dataTransfer: data,
    };
    stage.dispatchEvent(new DragEvent('dragover', init));
    stage.dispatchEvent(new DragEvent('drop', init));
  });
  const told = page.getByRole('dialog');
  await expect(told).toContainText('Some of the files were not added');
  await expect(told).toContainText('"scan.tif" cannot be shown as a picture');
  await told.getByRole('button', { name: 'OK' }).click();
  const added = (await currentSlide(page)).elements;
  expect(added.map((element) => element.type)).toEqual(['image', 'svg']);
  expect((added[1] as SvgElement).markup).not.toMatch(/example|note/);
  expect(await undoDepth(page)).toBe(steps + 1);
  // Both are drawn: neither is an empty frame.
  await expect
    .poll(() =>
      onStage(page, added[0]!.id)
        .locator('img')
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBe(64);
  expect(await painted(page, added[1]!.id, 'rect')).toBe('rgb(255, 0, 0)');
});

for (const theme of ['light', 'dark'] as const) {
  for (const { lang, dir, button } of [
    { lang: 'he', dir: 'rtl', button: 'צבעי הגרפיקה' },
    { lang: 'en', dir: 'ltr', button: 'Colours of the graphic' },
  ] as const) {
    test(`the colours of a graphic ${theme}-${dir}-1366`, async ({ page }) => {
      await page.setViewportSize({ width: 1366, height: 768 });
      await openApp(page, { lang, theme });
      await insertLogo(page, lang === 'he' ? 'תמונה' : 'Image');
      await row(page).getByRole('button', { name: button }).click();
      await expect(page.getByTestId('svg-colours')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(300);
      await page.screenshot({ path: out(`svg-colours-${theme}-${dir}-1366`) });
    });
  }
}
