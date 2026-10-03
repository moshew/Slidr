import { expect, test, type Page } from '@playwright/test';
import {
  addBoxes,
  copy,
  elements,
  expectOneStep,
  focusStage,
  openApp,
  order,
  paste,
  select,
  selected,
  SLIDR_MIME,
  THREE,
  undo,
  type ClipData,
} from './arrange-helpers';

/*
 * Copy, cut and paste of elements (WG5-T06, ARR-05): within a slide, across slides and into
 * another deck. The clipboard events are sent to the page with their own data (see the helpers),
 * except in the one test that goes through the real keys and the system clipboard.
 */

const WITH_TEXT = [
  ...THREE.slice(0, 2),
  { ...THREE[2]!, text: 'שלום עולם' },
  { id: 'e_d', x: 1200, y: 200, w: 300, h: 100, text: 'Second line' },
];

/** Replaces the open deck by an empty one with another id: "another deck" in the same window. */
async function openAnotherDeck(page: Page): Promise<void> {
  await page.evaluate(() => {
    const { bus } = window.slidr!;
    bus.reset({
      ...structuredClone(bus.deck),
      id: '01K6ANOTHERDECK00000000000',
      slides: [{ id: 's_other', elements: [], timeline: [] }],
      assets: {},
    });
  });
}

test.beforeEach(async ({ page }) => {
  await openApp(page);
  await addBoxes(page, WITH_TEXT);
});

test('copy puts a Slidr payload and the text on the clipboard, and leaves the slide alone', async ({
  page,
}) => {
  await select(page, ['e_c', 'e_d', 'e_a']);
  await focusStage(page);
  const clip = await copy(page);
  expect(Object.keys(clip).sort()).toEqual([SLIDR_MIME, 'text/plain']);
  expect(clip['text/plain']).toBe('שלום עולם\nSecond line');
  const payload = JSON.parse(clip[SLIDR_MIME]!) as {
    kind: string;
    cut: boolean;
    elements: { id: string }[];
    assets: unknown[];
  };
  expect(payload).toMatchObject({ slidr: 1, kind: 'elements', cut: false, assets: [] });
  // In z-order, whatever the order of selecting.
  expect(payload.elements.map((e) => e.id)).toEqual(['e_a', 'e_c', 'e_d']);
  expect(await order(page)).toHaveLength(4);

  // With nothing selected a copy is not the app's: the clipboard is left as it is.
  await select(page, []);
  expect(await copy(page)).toEqual({});
});

test('paste within a slide: new ids, on top, selected, each paste a step further', async ({
  page,
}) => {
  await select(page, ['e_a', 'e_b']);
  await focusStage(page);
  const clip = await copy(page);

  await expectOneStep(page, () => paste(page, clip));
  let tree = await elements(page);
  expect(tree.map((e) => e.id).slice(0, 4)).toEqual(['e_a', 'e_b', 'e_c', 'e_d']);
  let copies = tree.slice(4);
  expect(copies.map((e) => e.frame)).toEqual([
    { x: 124, y: 124, w: 100, h: 100 },
    { x: 424, y: 324, w: 200, h: 100 },
  ]);
  expect(await selected(page)).toEqual(copies.map((e) => e.id));

  await expectOneStep(page, () => paste(page, clip));
  tree = await elements(page);
  copies = tree.slice(6);
  expect(copies.map((e) => [e.frame.x, e.frame.y])).toEqual([
    [148, 148],
    [448, 348],
  ]);
  expect(new Set(tree.map((e) => e.id)).size).toBe(8);
  expect(await selected(page)).toEqual(copies.map((e) => e.id));
});

test('paste on another slide keeps the position; a second paste there steps aside', async ({
  page,
}) => {
  await select(page, ['e_b']);
  await focusStage(page);
  const clip = await copy(page);
  await page.evaluate(() => {
    const { bus, selection } = window.slidr!;
    bus.dispatch({ type: 'slide.add', slide: { id: 's_two', elements: [], timeline: [] } });
    selection.getState().setCurrentSlide('s_two');
  });

  await expectOneStep(page, () => paste(page, clip));
  let tree = await elements(page);
  expect(tree.map((e) => e.frame)).toEqual([{ x: 400, y: 300, w: 200, h: 100 }]);
  expect(tree[0]!.id).not.toBe('e_b');
  expect(await selected(page)).toEqual([tree[0]!.id]);

  await paste(page, clip);
  tree = await elements(page);
  expect(tree.map((e) => e.frame.x)).toEqual([400, 424]);
});

test('cut removes in one undo step, and the first paste lands where the elements were', async ({
  page,
}) => {
  await select(page, ['e_b', 'e_c']);
  await focusStage(page);
  let clip: ClipData = {};
  await expectOneStep(page, async () => {
    clip = await copy(page, 'cut');
  });
  expect(await order(page)).toEqual(['e_a', 'e_d']);
  expect(await selected(page)).toEqual([]);

  await expectOneStep(page, () => paste(page, clip));
  let tree = await elements(page);
  expect(tree.slice(2).map((e) => e.frame)).toEqual([
    { x: 400, y: 300, w: 200, h: 100 },
    { x: 900, y: 600, w: 100, h: 300 },
  ]);
  await paste(page, clip);
  tree = await elements(page);
  expect(tree.slice(4).map((e) => e.frame.x)).toEqual([424, 924]);
});

test('paste into another deck, after the bus was reset to it', async ({ page }) => {
  await select(page, ['e_a', 'e_c']);
  await focusStage(page);
  const clip = await copy(page);
  await openAnotherDeck(page);
  expect(await order(page)).toEqual([]);

  await expectOneStep(page, () => paste(page, clip));
  const tree = await elements(page);
  expect(tree.map((e) => e.frame)).toEqual([
    { x: 100, y: 100, w: 100, h: 100 },
    { x: 900, y: 600, w: 100, h: 300 },
  ]);
  expect(await selected(page)).toEqual(tree.map((e) => e.id));
  await expect(
    page.getByTestId('stage-surface').locator(`[data-element-id="${tree[1]!.id}"]`),
  ).toContainText('שלום עולם');
});

test('a picture comes along into another deck: its file is imported there', async ({ page }) => {
  // A picture in the first deck, stored through the editor's asset service.
  const assetId = await page.evaluate(async () => {
    const editor = window.slidr!;
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 200;
    const g = canvas.getContext('2d')!;
    g.fillStyle = 'teal';
    g.fillRect(0, 0, 320, 200);
    const blob = await new Promise<Blob>((done) => canvas.toBlob((b) => done(b!), 'image/png'));
    const asset = await editor.assets.import(new File([blob], 'teal.png', { type: 'image/png' }));
    const slideId = editor.selection.getState().currentSlideId!;
    editor.bus.batch([
      { type: 'asset.add', asset },
      {
        type: 'element.add',
        slideId,
        element: {
          id: 'e_pic',
          type: 'image',
          frame: { x: 1300, y: 500, w: 320, h: 200 },
          rotation: 0,
          opacity: 1,
          fit: 'cover',
          assetId: asset.id,
        },
      },
    ]);
    // Count what the paste imports.
    const original = editor.assets.import.bind(editor.assets);
    const counter = window as unknown as { imports: number };
    counter.imports = 0;
    editor.assets.import = (...args) => {
      counter.imports++;
      return original(...args);
    };
    return asset.id;
  });

  await select(page, ['e_pic', 'e_a']);
  await focusStage(page);
  const clip = await copy(page);
  expect((JSON.parse(clip[SLIDR_MIME]!) as { assets: { id: string }[] }).assets).toMatchObject([
    { id: assetId, name: 'teal.png' },
  ]);

  // In the deck it came from, the asset is there already: nothing is imported.
  await paste(page, clip);
  await expect.poll(() => order(page)).toHaveLength(7);
  expect(await page.evaluate(() => (window as unknown as { imports: number }).imports)).toBe(0);

  await openAnotherDeck(page);
  await expectOneStep(page, () => paste(page, clip));
  const tree = await elements(page);
  expect(tree.map((e) => e.type)).toEqual(['shape', 'image']);
  expect(tree[1]!.assetId).toBe(assetId);
  expect(
    await page.evaluate(
      (id) => ({
        imports: (window as unknown as { imports: number }).imports,
        asset: window.slidr!.bus.deck.assets[id],
      }),
      assetId,
    ),
  ).toMatchObject({ imports: 1, asset: { id: assetId, name: 'teal.png', kind: 'image' } });
  const img = page.getByTestId('stage-surface').locator(`[data-element-id="${tree[1]!.id}"] img`);
  await expect(img).toBeVisible();
  expect(await img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(320);
});

test('a clip from another window pastes without the files this window does not have, and says so', async ({
  page,
}) => {
  // As another Slidr window would have written it: an asset this window never saw.
  const foreign = 'f'.repeat(64);
  const clip: ClipData = {
    [SLIDR_MIME]: JSON.stringify({
      slidr: 1,
      id: 'tx_foreign1',
      kind: 'elements',
      cut: false,
      deckId: '01K6SOMEOTHERDECK000000000',
      slideId: 's_elsewhere',
      elements: [
        {
          id: 'e_pic',
          type: 'image',
          frame: { x: 200, y: 200, w: 400, h: 300 },
          rotation: 0,
          opacity: 1,
          fit: 'cover',
          assetId: foreign,
        },
      ],
      assets: [
        {
          id: foreign,
          file: `${foreign}.png`,
          mime: 'image/png',
          kind: 'image',
          bytes: 1234,
          origin: 'upload',
          name: 'elsewhere.png',
        },
      ],
    }),
  };
  await focusStage(page);
  await paste(page, clip);
  await expect(page.getByRole('dialog')).toContainText('חלק מהקבצים לא הועברו');
  await page.getByRole('dialog').getByRole('button', { name: 'אישור' }).click();
  const tree = await elements(page);
  expect(tree.at(-1)).toMatchObject({ type: 'image', assetId: foreign });
  expect(tree.at(-1)!.frame).toEqual({ x: 200, y: 200, w: 400, h: 300 });
  expect(await page.evaluate((id) => window.slidr!.bus.deck.assets[id]?.name, foreign)).toBe(
    'elsewhere.png',
  );
  // The entry and the element went in together: one undo takes both out.
  await undo(page);
  expect(await order(page)).toHaveLength(4);
  expect(await page.evaluate((id) => id in window.slidr!.bus.deck.assets, foreign)).toBe(false);
});

test('text fields keep their own clipboard, and a broken payload is ignored', async ({ page }) => {
  await select(page, ['e_a']);
  await focusStage(page);
  const clip = await copy(page);

  await page.getByRole('button', { name: 'שכבות', exact: true }).click();
  await page.locator('[data-layer="e_a"]').dblclick();
  await expect(page.getByTestId('layer-name')).toBeFocused();
  // In the name field neither the copy nor the paste is the app's.
  expect(await copy(page)).toEqual({});
  expect(await paste(page, clip)).toBe(true);
  expect(await order(page)).toHaveLength(4);
  await page.getByTestId('layer-name').press('Escape');

  await focusStage(page);
  const broken = clip[SLIDR_MIME]!.replace('"type":"shape"', '"type":"nonsense"');
  expect(await paste(page, { [SLIDR_MIME]: broken })).toBe(true);
  expect(await paste(page, { [SLIDR_MIME]: '{"slidr":1' })).toBe(true);
  expect(
    await paste(page, { [SLIDR_MIME]: clip[SLIDR_MIME]!.replace('"slidr":1', '"slidr":9') }),
  ).toBe(true);
  expect(await order(page)).toHaveLength(4);
});

test('plain text pasted on the slide becomes a text box, as one undo step', async ({ page }) => {
  await focusStage(page);
  await expectOneStep(page, () => paste(page, { 'text/plain': 'שורה ראשונה\r\nשורה שנייה\n' }));
  const tree = await elements(page);
  expect(tree).toHaveLength(5);
  expect(tree.at(-1)).toMatchObject({ type: 'text', frame: { x: 480, w: 960 } });
  expect(await selected(page)).toEqual([tree.at(-1)!.id]);
  const box = page.getByTestId('stage-surface').locator(`[data-element-id="${tree.at(-1)!.id}"]`);
  await expect(box).toContainText('שורה ראשונה');
  await expect(box).toContainText('שורה שנייה');
});

test('a pasted file is still the Stage’s: one picture, and no text box beside it', async ({
  page,
}) => {
  await focusStage(page);
  await page.getByTestId('stage-surface').evaluate(async (surface) => {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 100;
    canvas.getContext('2d')!.fillRect(0, 0, 200, 100);
    const blob = await new Promise<Blob>((done) => canvas.toBlob((b) => done(b!), 'image/png'));
    const data = new DataTransfer();
    data.items.add(new File([blob], 'pasted.png', { type: 'image/png' }));
    data.setData('text/plain', 'pasted.png');
    surface.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    );
  });
  await expect.poll(() => order(page)).toHaveLength(5);
  const tree = await elements(page);
  expect(tree.at(-1)).toMatchObject({ type: 'image', frame: { w: 200, h: 100 } });
});

test.describe('through the keyboard and the system clipboard', () => {
  // Every program and every other test shares that clipboard: allow for a collision.
  test.describe.configure({ retries: 2 });

  test('Ctrl+C, Ctrl+V, Ctrl+X on the Stage', async ({ page }) => {
    await select(page, ['e_a']);
    await focusStage(page);
    await page.keyboard.press('Control+c');
    await page.keyboard.press('Control+v');
    await expect.poll(() => order(page)).toHaveLength(5);
    const tree = await elements(page);
    expect(tree.at(-1)!.frame).toEqual({ x: 124, y: 124, w: 100, h: 100 });
    expect(await selected(page)).toEqual([tree.at(-1)!.id]);

    await page.keyboard.press('Control+x');
    await expect.poll(() => order(page)).toHaveLength(4);
    await page.keyboard.press('Control+v');
    await expect.poll(() => order(page)).toHaveLength(5);
    expect((await elements(page)).at(-1)!.frame).toEqual({ x: 124, y: 124, w: 100, h: 100 });
  });
});
