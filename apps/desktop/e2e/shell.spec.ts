import { expect, test, type Page } from '@playwright/test';

/*
 * WG3 acceptance (PLAN): the FHD layout and its numbers, mirroring by UI language, live
 * language and theme switches, the splitter limits, collapsing the Tool Panel, undo / redo and
 * the contextual row. Against the Vite page, so there is no Tauri core and no files.
 */

async function box(page: Page, testId: string) {
  const rect = await page.getByTestId(testId).boundingBox();
  if (!rect) throw new Error(`${testId} is not visible`);
  return rect;
}

async function openSettings(page: Page, name: 'הגדרות' | 'Settings') {
  await page.getByRole('button', { name, exact: true }).click();
}

async function waitForPanelWidth(page: Page, width: number) {
  await expect.poll(async () => Math.round((await box(page, 'tool-panel')).width)).toBe(width);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('stage-frame')).toBeVisible();
});

test('FHD: the refreshed regions and the slide fitted below its floating tools', async ({
  page,
}) => {
  expect((await box(page, 'title-bar')).height).toBe(56);
  await expect(page.getByTestId('top-tools-a')).toHaveCount(0);
  expect((await box(page, 'top-tools-b')).height).toBe(44);
  expect((await box(page, 'filmstrip')).height).toBe(132);
  expect((await box(page, 'status-bar')).height).toBe(32);
  expect((await box(page, 'activity-bar')).width).toBe(76);
  expect((await box(page, 'tool-panel')).width).toBe(360);

  const stage = await box(page, 'stage');
  expect([stage.width, stage.height]).toEqual([1484, 812]);
  const surface = await box(page, 'stage-surface');
  const tools = await box(page, 'top-tools-b');
  expect(surface.y).toBeGreaterThanOrEqual(tools.y + tools.height);
  const frame = await box(page, 'stage-frame');
  const scale = Math.min((surface.width - 48) / 1920, (surface.height - 48) / 1080);
  expect(frame.width).toBeCloseTo(1920 * scale, 0);
  expect(frame.height).toBeCloseTo(1080 * scale, 0);
  expect(frame.x - surface.x).toBeCloseTo((surface.width - frame.width) / 2, 0);
  await expect(page.getByTestId('status-zoom')).toHaveText(`${Math.round(scale * 100)}%`);
});

test('the AI area is on the right in Hebrew and moves left in English, live', async ({ page }) => {
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'he');
  let bar = await box(page, 'activity-bar');
  let panel = await box(page, 'tool-panel');
  expect(bar.x + bar.width).toBe(1920);
  expect(panel.x + panel.width).toBe(bar.x);

  // A marker on the window survives only if the page is not reloaded.
  await page.evaluate(() => ((window as unknown as { marker: number }).marker = 7));
  await openSettings(page, 'הגדרות');
  await page.getByRole('radio', { name: 'English' }).click();

  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  // By its whole name: the settings screen, which is open, has "Add a font file" in it too.
  await expect(page.getByRole('button', { name: 'File', exact: true })).toBeVisible();
  await expect(page.getByTestId('status-slide')).toHaveText('Slide 1 of 1');
  bar = await box(page, 'activity-bar');
  panel = await box(page, 'tool-panel');
  expect(bar.x).toBe(0);
  expect(panel.x).toBe(76);
  expect((await box(page, 'stage')).x).toBe(76 + 360);
  expect(await page.evaluate(() => (window as unknown as { marker?: number }).marker)).toBe(7);

  await page.getByRole('radio', { name: 'עברית' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('button', { name: 'קובץ', exact: true })).toBeVisible();
  expect((await box(page, 'activity-bar')).x).toBe(1920 - 76);
});

test('the theme follows the OS and switches live', async ({ page }) => {
  const html = page.locator('html');
  const panelColor = () =>
    page.getByTestId('tool-panel').evaluate((el) => getComputedStyle(el).backgroundColor);

  await page.emulateMedia({ colorScheme: 'light' });
  await expect(html).toHaveAttribute('data-theme', 'light');
  const light = await panelColor();
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(html).toHaveAttribute('data-theme', 'dark');
  const dark = await panelColor();
  expect(dark).not.toBe(light);

  await openSettings(page, 'הגדרות');
  await page.getByRole('radio', { name: 'בהירה' }).click();
  await expect(html).toHaveAttribute('data-theme', 'light');
  expect(await panelColor()).toBe(light);
  await page.getByRole('radio', { name: 'כהה' }).click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  expect(await panelColor()).toBe(dark);
});

test('the splitter keeps the Tool Panel between 280 px and 45% of the window', async ({ page }) => {
  const splitter = page.getByTestId('panel-splitter');
  const grip = await splitter.boundingBox();
  if (!grip) throw new Error('no splitter');
  const y = grip.y + grip.height / 2;

  // In Hebrew the panel is on the right, so dragging left widens it.
  await page.mouse.move(grip.x + grip.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(100, y, { steps: 5 });
  await page.mouse.up();
  await waitForPanelWidth(page, 864);
  await expect(splitter).toHaveAttribute('aria-valuenow', '864');

  const wide = await splitter.boundingBox();
  if (!wide) throw new Error('no splitter');
  await page.mouse.move(wide.x + wide.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(1900, y, { steps: 5 });
  await page.mouse.up();
  await waitForPanelWidth(page, 280);

  // The keyboard reaches the same limits; a double click restores the default.
  await splitter.focus();
  await page.keyboard.press('End');
  await waitForPanelWidth(page, 864);
  await page.keyboard.press('Home');
  await waitForPanelWidth(page, 280);
  await splitter.dblclick();
  await waitForPanelWidth(page, 360);
});

test('an old saved panel width resets to the compact default once', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem(
      'slidr.shell',
      JSON.stringify({
        state: { activePanel: 'ai', panelOpen: true, panelShare: 0.35, theme: 'system' },
        version: 3,
      }),
    );
  });
  await page.reload();
  await waitForPanelWidth(page, 360);
  expect(
    await page.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem('slidr.shell')!);
      return { version: saved.version, share: saved.state.panelShare };
    }),
  ).toEqual({ version: 4, share: null });

  const splitter = page.getByTestId('panel-splitter');
  await splitter.focus();
  await page.keyboard.press('End');
  await waitForPanelWidth(page, 864);
  await page.reload();
  await waitForPanelWidth(page, 864);
});

test('the Tool Panel collapses, the Activity Bar stays and the Stage grows', async ({ page }) => {
  const fittedWidth = (await box(page, 'stage-frame')).width;
  await page.getByTestId('panel-collapse').click();
  await waitForPanelWidth(page, 0);
  await expect(page.getByTestId('tool-panel')).toHaveAttribute('data-open', 'false');
  await expect(page.getByTestId('activity-bar')).toBeVisible();
  await expect(page.getByTestId('panel-splitter')).toHaveCount(0);
  expect((await box(page, 'stage')).width).toBe(1920 - 76);
  await expect
    .poll(async () => (await box(page, 'stage-frame')).width)
    .toBeGreaterThanOrEqual(fittedWidth);

  // The Activity Bar opens it again, on the panel that was clicked.
  await page.getByRole('button', { name: 'שכבות' }).click();
  await waitForPanelWidth(page, 360);
  await expect(page.getByRole('heading', { name: 'שכבות' })).toBeVisible();
  // Clicking the open panel's button collapses it.
  await page.getByRole('button', { name: 'שכבות' }).click();
  await waitForPanelWidth(page, 0);
});

test('Ctrl+1 and Ctrl+L open the one AI chat (ADR-072)', async ({ page }) => {
  await page.getByRole('button', { name: 'שכבות' }).click();
  await expect(page.getByRole('heading', { name: 'שכבות' })).toBeVisible();
  await page.keyboard.press('Control+1');
  await expect(page.getByRole('heading', { name: "צ'אט AI" })).toBeVisible();
  // What the next message is about: the slide on the Stage, as nothing is selected.
  await expect(page.getByTestId('focus-chip')).toContainText('שקף 1');
  await page.getByRole('button', { name: 'שכבות' }).click();
  await expect(
    page.getByTestId('top-tools-a').getByRole('button', { name: "צ'אט AI" }),
  ).toHaveCount(0);
  await page.keyboard.press('Control+l');
  await expect(page.getByRole('heading', { name: "צ'אט AI" })).toBeVisible();
  await expect(page.getByTestId('chat-input')).toBeFocused();
});

test('undo and redo run the command bus, from the buttons and from Ctrl+Z / Ctrl+Y', async ({
  page,
}) => {
  const status = page.getByTestId('status-slide');
  const undo = page.getByRole('button', { name: 'ביטול פעולה' });
  await expect(undo).toBeDisabled();

  await page.getByTestId('new-slide').click();
  await expect(status).toHaveText('שקף 2 מתוך 2');
  await expect(page.getByTestId('status-save')).toHaveText('לא נשמר');
  await expect(undo).toBeEnabled();

  // Redo brings the slide back; the selection stays where it was.
  await page.keyboard.press('Control+z');
  await expect(status).toHaveText('שקף 1 מתוך 1');
  await page.keyboard.press('Control+y');
  await expect(status).toHaveText('שקף 1 מתוך 2');
  await undo.click();
  await expect(status).toHaveText('שקף 1 מתוך 1');
  await page.getByRole('button', { name: 'ביצוע חוזר' }).click();
  await expect(status).toHaveText('שקף 1 מתוך 2');
});

test('row B follows the kind of selection', async ({ page }) => {
  const row = page.getByTestId('top-tools-b');
  await expect(row).toHaveAttribute('data-selection', 'none');
  await expect(row.getByRole('button', { name: 'רקע' })).toBeVisible();

  await page.evaluate(() => {
    const editor = window.slidr;
    if (!editor) throw new Error('window.slidr is missing');
    const slideId = editor.selection.getState().currentSlideId ?? '';
    editor.bus.dispatch({
      type: 'element.add',
      slideId,
      element: {
        id: 'e_title001',
        type: 'text',
        name: 'כותרת',
        frame: { x: 160, y: 140, w: 1600, h: 160 },
        rotation: 0,
        opacity: 1,
        autoFit: 'none',
        vAlign: 'top',
        content: { paragraphs: [{ dir: 'auto', align: 'start', runs: [{ text: 'שלום' }] }] },
      },
    });
    editor.selection.getState().selectElements(['e_title001']);
  });
  await expect(row).toHaveAttribute('data-selection', 'text');
  await expect(page.getByTestId('selection-label')).toHaveCount(0);
  await expect(row.getByRole('button', { name: 'רקע' })).toHaveCount(0);

  await expect(row.getByRole('button', { name: 'שאלו את ה-AI על הבחירה' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: "צ'אט AI" })).toBeVisible();
  await expect(page.getByTestId('focus-chip')).toHaveText(/טקסט.*כותרת/);

  await page.evaluate(() => window.slidr?.selection.getState().clearSelection());
  await expect(row).toHaveAttribute('data-selection', 'none');
});

test('the File menu offers the document commands', async ({ page }) => {
  await page.getByRole('button', { name: 'קובץ' }).click();
  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitem', { name: /מצגת חדשה/ })).toBeVisible();
  // Without the Tauri core there are no files, so only "new" is on.
  await expect(menu.getByRole('menuitem', { name: /^פתיחה/ })).toHaveAttribute('data-disabled', '');
  const save = menu.getByRole('menuitem').filter({ has: page.getByText('שמירה', { exact: true }) });
  await expect(save).toHaveAttribute('data-disabled', '');
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
});

test.describe('at 1366 × 768', () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  test('the Tool Panel shrinks to 320 and the slide still fits', async ({ page }) => {
    expect((await box(page, 'tool-panel')).width).toBe(320);
    const stage = await box(page, 'stage');
    const frame = await box(page, 'stage-frame');
    expect(frame.width).toBeLessThanOrEqual(stage.width - 48);
    expect(frame.height).toBeLessThanOrEqual(stage.height - 48 + 1);
    expect(Math.round((frame.width / frame.height) * 9)).toBe(16);
  });
});
