import { expect, test, type Page } from '@playwright/test';
import {
  addBoxes,
  elements,
  expectOneStep,
  focusStage,
  frames,
  openApp,
  select,
  selected,
  THREE,
  undo,
  undoSteps,
} from './arrange-helpers';
import { addElement, importPicture, line } from './objects-helpers';

/*
 * The keyboard pass on the Stage (WG13-T06, UI-06): what ADR-060 listed as the pointer's alone.
 * Lock and hide have keys; several elements that are not the whole slide are selected without
 * the pointer; a zoomed slide is moved in its view; the points of a line and the handles of a
 * crop are reached with Tab and moved with the arrows. Every key here is a shortcut of the
 * shell's registry, so the shortcut map lists it.
 */

const surface = (page: Page) => page.getByTestId('stage-surface');
const said = (page: Page) => page.getByTestId('stage-keyboard');

interface LineModel {
  frame: { x: number; y: number; w: number; h: number };
  points: { x: number; y: number }[];
}
interface ImageModel {
  frame: { x: number; y: number; w: number; h: number };
  crop?: { x: number; y: number; w: number; h: number };
}

const element = async <T>(page: Page, id: string) =>
  (await elements(page)).find((e) => e.id === id) as unknown as T | undefined;

test.describe('lock and hide', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page, { lang: 'en' });
    await addBoxes(page, THREE);
  });

  test('Ctrl+Shift+L locks the selection and unlocks it, each press one undo step', async ({
    page,
  }) => {
    await select(page, ['e_b']);
    await focusStage(page);
    await expectOneStep(page, () => page.keyboard.press('Control+Shift+L'));
    expect((await element<{ locked?: boolean }>(page, 'e_b'))?.locked).toBe(true);
    // Still selected, so the same key takes the lock off again.
    expect(await selected(page)).toEqual(['e_b']);
    await expectOneStep(page, () => page.keyboard.press('Control+Shift+L'));
    expect((await element<{ locked?: boolean }>(page, 'e_b'))?.locked).toBeUndefined();
  });

  test('Ctrl+Shift+H hides the selection, which leaves the Stage', async ({ page }) => {
    await select(page, ['e_a', 'e_c']);
    await focusStage(page);
    const steps = await undoSteps(page);
    await page.keyboard.press('Control+Shift+H');
    expect((await element<{ hidden?: boolean }>(page, 'e_a'))?.hidden).toBe(true);
    expect((await element<{ hidden?: boolean }>(page, 'e_c'))?.hidden).toBe(true);
    expect((await element<{ hidden?: boolean }>(page, 'e_b'))?.hidden).toBeUndefined();
    expect(await selected(page)).toEqual([]);
    expect(await undoSteps(page)).toBe(steps + 1);
    await undo(page);
    expect((await element<{ hidden?: boolean }>(page, 'e_a'))?.hidden).toBeUndefined();
  });

  test('without a selection the keys do nothing', async ({ page }) => {
    await focusStage(page);
    const steps = await undoSteps(page);
    await page.keyboard.press('Control+Shift+L');
    await page.keyboard.press('Control+Shift+H');
    expect(await undoSteps(page)).toBe(steps);
  });
});

test.describe('the selection walk', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page, { lang: 'en' });
    await addBoxes(page, THREE);
    await focusStage(page);
  });

  test('Alt with Down goes on without selecting, and Alt+Enter adds or takes out', async ({
    page,
  }) => {
    await page.keyboard.press('Tab');
    expect(await selected(page)).toEqual(['e_a']);

    // On to B: it is walked to, and not selected.
    await page.keyboard.press('Alt+ArrowDown');
    await expect(surface(page).locator('[data-walk="e_b"]')).toBeVisible();
    expect(await selected(page)).toEqual(['e_a']);
    await expect(said(page)).toHaveText('Shape · B: not in the selection');

    // Past B to C, which joins the selection: A and C, and not B between them.
    await page.keyboard.press('Alt+ArrowDown');
    await page.keyboard.press('Alt+Enter');
    expect(await selected(page)).toEqual(['e_a', 'e_c']);
    await expect(surface(page).locator('[data-walk="e_c"]')).toBeVisible();
    await expect(said(page)).toHaveText('Shape · C: in the selection');
    await expect(page.getByTestId('top-tools-b')).toHaveAttribute('data-selection', 'multiple');

    // Back to B, in, and out again.
    await page.keyboard.press('Alt+ArrowUp');
    await page.keyboard.press('Alt+Enter');
    expect(await selected(page)).toEqual(['e_a', 'e_c', 'e_b']);
    await page.keyboard.press('Alt+Enter');
    expect(await selected(page)).toEqual(['e_a', 'e_c']);
    await expect(surface(page)).toBeFocused();

    // Esc leaves the walk first, and the selection after it.
    await page.keyboard.press('Escape');
    await expect(surface(page).locator('[data-walk]')).toHaveCount(0);
    await expect(said(page)).toHaveText('');
    expect(await selected(page)).toEqual(['e_a', 'e_c']);
    await page.keyboard.press('Escape');
    expect(await selected(page)).toEqual([]);
  });

  test('the walk goes round, starts without a selection, and ends when Tab selects', async ({
    page,
  }) => {
    // Nothing selected: back from the start is the top element.
    await page.keyboard.press('Alt+ArrowUp');
    await expect(surface(page).locator('[data-walk="e_c"]')).toBeVisible();
    await page.keyboard.press('Alt+ArrowDown');
    await expect(surface(page).locator('[data-walk="e_a"]')).toBeVisible();
    expect(await selected(page)).toEqual([]);
    await page.keyboard.press('Alt+Enter');
    expect(await selected(page)).toEqual(['e_a']);
    // Tab is a selection of its own: the walk is over.
    await page.keyboard.press('Tab');
    expect(await selected(page)).toEqual(['e_b']);
    await expect(surface(page).locator('[data-walk]')).toHaveCount(0);
  });

  test('Alt with the side arrows still turns the selection', async ({ page }) => {
    await select(page, ['e_b']);
    await page.keyboard.press('Alt+ArrowRight');
    const turned = await element<{ rotation: number }>(page, 'e_b');
    expect(turned?.rotation).toBe(1);
    await expect(surface(page).locator('[data-walk]')).toHaveCount(0);
  });
});

test.describe('the view of a zoomed slide', () => {
  test('Ctrl+Alt and an arrow moves the view, and a fitted slide stays where it is', async ({
    page,
  }) => {
    await openApp(page, { lang: 'en' });
    await addBoxes(page, THREE);
    await select(page, ['e_b']);
    await focusStage(page);
    const frame = page.getByTestId('stage-frame');
    const fitted = (await frame.boundingBox())!;
    const before = await frames(page, ['e_b']);

    // Fitted: all of the slide is in view, and there is nowhere to go.
    await page.keyboard.press('Control+Alt+ArrowRight');
    expect((await frame.boundingBox())!.x).toBe(fitted.x);

    // Two steps in, each waited for: the view is read only once the zoom has settled.
    const width = async () => (await frame.boundingBox())!.width;
    await page.keyboard.press('Control+=');
    await expect.poll(width).toBeGreaterThan(fitted.width);
    const once = await width();
    await page.keyboard.press('Control+=');
    await expect.poll(width).toBeGreaterThan(once);
    const zoomed = (await frame.boundingBox())!;
    // Towards the right of the slide: the slide goes left in its view.
    await page.keyboard.press('Control+Alt+ArrowRight');
    await expect.poll(async () => (await frame.boundingBox())!.x).toBe(zoomed.x - 64);
    await page.keyboard.press('Control+Alt+ArrowDown');
    await page.keyboard.press('Control+Alt+ArrowDown');
    await expect.poll(async () => (await frame.boundingBox())!.y).toBe(zoomed.y - 128);
    await page.keyboard.press('Control+Alt+ArrowLeft');
    await page.keyboard.press('Control+Alt+ArrowUp');
    await expect.poll(async () => (await frame.boundingBox())!.x).toBe(zoomed.x);
    await expect.poll(async () => (await frame.boundingBox())!.y).toBe(zoomed.y - 64);

    // The selection was with the keyboard all along, and was neither moved nor turned.
    expect(await selected(page)).toEqual(['e_b']);
    expect(await frames(page, ['e_b'])).toEqual(before);
    expect((await element<{ rotation: number }>(page, 'e_b'))?.rotation).toBe(0);
  });
});

test.describe('the points of a line', () => {
  const point = (page: Page, i: number) => surface(page).locator(`[data-line-point="${i}"]`);
  const model = async (page: Page) => (await element<LineModel>(page, 'e_line'))!;

  test.beforeEach(async ({ page }) => {
    await openApp(page, { lang: 'en' });
    await addElement(page, line());
    await focusStage(page);
  });

  test('Enter goes into them, the arrows move one, Tab goes to the next', async ({ page }) => {
    await expect(point(page, 0)).not.toHaveAttribute('data-active');
    await page.keyboard.press('Enter');
    await expect(point(page, 0)).toHaveAttribute('data-active', 'true');
    await expect(said(page)).toHaveText('Point 1 of 2. The arrows move it.');

    // A burst of arrows is one undo step; the other end stays where it was on the slide.
    await expectOneStep(page, async () => {
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('Shift+ArrowDown');
    });
    expect(await model(page)).toMatchObject({
      frame: { x: 563, y: 410, w: 477, h: 190 },
      points: [
        { x: 0, y: 0 },
        { x: 477, y: 190 },
      ],
    });

    await page.keyboard.press('Tab');
    await expect(point(page, 1)).toHaveAttribute('data-active', 'true');
    await expect(said(page)).toHaveText('Point 2 of 2. The arrows move it.');
    await expect(surface(page)).toBeFocused();
    await page.waitForTimeout(900);
    await expectOneStep(page, () => page.keyboard.press('ArrowUp'));
    expect((await model(page)).frame).toEqual({ x: 563, y: 410, w: 477, h: 189 });
    // Back to the first, and on to the second again.
    await page.keyboard.press('Shift+Tab');
    await expect(point(page, 0)).toHaveAttribute('data-active', 'true');
    await page.keyboard.press('Tab');
    await expect(point(page, 1)).toHaveAttribute('data-active', 'true');

    // Esc leaves the points; the line is still selected, and the arrows move all of it again.
    await page.keyboard.press('Escape');
    await expect(point(page, 1)).not.toHaveAttribute('data-active');
    await expect(said(page)).toHaveText('');
    expect(await selected(page)).toEqual(['e_line']);
    await page.keyboard.press('ArrowRight');
    expect((await model(page)).frame).toEqual({ x: 564, y: 410, w: 477, h: 189 });
  });

  test('past the last point, and before the first, Tab leaves the points and the Stage', async ({
    page,
  }) => {
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await expect(point(page, 1)).toHaveAttribute('data-active', 'true');
    // As past the last crop handle and past the last element of the slide: the key is the
    // browser's again, so the points are no trap for the keyboard. The line stays selected.
    await page.keyboard.press('Tab');
    await expect(surface(page)).not.toBeFocused();
    expect(await selected(page)).toEqual(['e_line']);
    await expect(surface(page).locator('[data-line-point][data-active]')).toHaveCount(0);
    await expect(said(page)).toHaveText('');

    // Before the first point the keyboard goes back, to the tools of the line in row B: the
    // line is still the selection there, and the tools are its own.
    await surface(page).focus();
    await page.keyboard.press('Enter');
    await expect(point(page, 0)).toHaveAttribute('data-active', 'true');
    await page.keyboard.press('Shift+Tab');
    await expect(surface(page)).not.toBeFocused();
    expect(
      await page.evaluate(() =>
        Boolean(document.activeElement?.closest('[data-testid="top-tools-b"]')),
      ),
    ).toBe(true);
    expect(await selected(page)).toEqual(['e_line']);
    await expect(surface(page).locator('[data-line-point][data-active]')).toHaveCount(0);
  });

  test('Insert adds a point after the one the keyboard is on, and Delete removes one', async ({
    page,
  }) => {
    await page.keyboard.press('Enter');
    await expectOneStep(page, () => page.keyboard.press('Insert'));
    // Halfway along the line, and the keyboard is on the new point.
    expect((await model(page)).points).toEqual([
      { x: 0, y: 0 },
      { x: 240, y: 100 },
      { x: 480, y: 200 },
    ]);
    await expect(point(page, 1)).toHaveAttribute('data-active', 'true');
    await expect(said(page)).toHaveText('Point 2 of 3. The arrows move it.');
    // The new point bends the line where it is moved to.
    await page.keyboard.press('Shift+ArrowUp');
    expect((await model(page)).points[1]).toEqual({ x: 240, y: 90 });

    await page.waitForTimeout(900);
    await expectOneStep(page, () => page.keyboard.press('Delete'));
    expect((await model(page)).points).toHaveLength(2);
    // A line keeps its two ends: Delete among the points never deletes the line.
    const steps = await undoSteps(page);
    await page.keyboard.press('Delete');
    await page.keyboard.press('Backspace');
    expect((await model(page)).points).toHaveLength(2);
    expect(await undoSteps(page)).toBe(steps);

    // The key marked + does what Insert does, for a keyboard without Insert.
    await page.keyboard.press('Shift+Equal');
    expect((await model(page)).points).toHaveLength(3);

    // Out of the points, Delete is the line's again.
    await page.keyboard.press('Escape');
    await page.keyboard.press('Delete');
    expect(await element(page, 'e_line')).toBeUndefined();
  });

  test('the menu of a line leads to its points, and Enter comes out of them', async ({ page }) => {
    await page.keyboard.press('Shift+F10');
    await page.getByTestId('stage-menu').getByRole('menuitem', { name: 'Edit points' }).click();
    await expect(point(page, 0)).toHaveAttribute('data-active', 'true');
    await expect(surface(page)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(point(page, 0)).not.toHaveAttribute('data-active');
    expect(await selected(page)).toEqual(['e_line']);
  });
});

test.describe('the handles of a crop', () => {
  const handle = (page: Page, name: string) =>
    surface(page).locator(`[data-crop-handle="${name}"]`);
  const model = async (page: Page) => (await element<ImageModel>(page, 'e_picture'))!;

  test.beforeEach(async ({ page }) => {
    await openApp(page, { lang: 'en' });
    const assetId = await importPicture(page, 'picture.png', ['#2f5bea', '#f59e0b'], [1200, 800]);
    await addElement(page, {
      id: 'e_picture',
      type: 'image',
      frame: { x: 660, y: 340, w: 600, h: 400 },
      assetId,
      fit: 'cover',
    });
    await focusStage(page);
    await page.keyboard.press('Enter');
    await expect(surface(page)).toHaveAttribute('data-cropping', 'e_picture');
  });

  test('Tab goes to a handle, and the arrows crop with it', async ({ page }) => {
    await expect(said(page)).toHaveText(
      'Crop: the arrows move the picture. Ctrl+Up or Down scales it. Tab goes to the handles.',
    );
    await page.keyboard.press('Tab');
    await expect(handle(page, 'nw')).toHaveAttribute('data-active', 'true');
    await expect(said(page)).toHaveText('Crop handle: top left corner. The arrows move it.');
    await expect(surface(page)).toBeFocused();

    // The corner goes right and down; the picture stays where it is on the slide.
    await expectOneStep(page, async () => {
      await page.keyboard.press('Shift+ArrowRight');
      await page.keyboard.press('ArrowDown');
    });
    const cropped = await model(page);
    expect(cropped.frame).toEqual({ x: 670, y: 341, w: 590, h: 399 });
    expect(cropped.crop!.x).toBeCloseTo(10 / 600, 5);
    expect(cropped.crop!.y).toBeCloseTo(1 / 400, 5);
    expect(cropped.crop!.w).toBeCloseTo(590 / 600, 5);
    expect(cropped.crop!.h).toBeCloseTo(399 / 400, 5);

    // On to the right edge, which the arrows move in and out; up and down are not its way.
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(handle(page, 'e')).toHaveAttribute('data-active', 'true');
    await expect(said(page)).toHaveText('Crop handle: right edge. The arrows move it.');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('ArrowUp');
    expect((await model(page)).frame).toEqual({ x: 670, y: 341, w: 580, h: 399 });

    // Back to the picture: the arrows move it under the frame, and the frame stays.
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(surface(page).locator('[data-crop-handle][data-active]')).toHaveCount(0);
    const before = await model(page);
    await page.keyboard.press('ArrowLeft');
    const after = await model(page);
    expect(after.frame).toEqual(before.frame);
    expect(after.crop!.x).toBeCloseTo(before.crop!.x + 1 / 600, 5);
  });

  test('Ctrl with Up or Down scales the picture while the frame stays fixed', async ({ page }) => {
    const before = await model(page);
    await expectOneStep(page, () => page.keyboard.press('Control+ArrowUp'));
    const grown = await model(page);
    expect(grown.frame).toEqual(before.frame);
    expect(grown.crop!.w).toBeLessThan(1);

    await page.keyboard.press('Control+ArrowDown');
    expect((await model(page)).crop).toBeUndefined();
  });

  test('Tab goes through the eight handles, and past the last one it leaves the Stage', async ({
    page,
  }) => {
    for (const name of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) {
      await page.keyboard.press('Tab');
      await expect(handle(page, name)).toHaveAttribute('data-active', 'true');
      await expect(surface(page).locator('[data-crop-handle][data-active]')).toHaveCount(1);
      await expect(surface(page)).toBeFocused();
    }
    // Past the last handle the key is the browser's again, as it is past the last element of the
    // slide: the Stage is no trap for the keyboard. The crop goes on.
    await page.keyboard.press('Tab');
    await expect(surface(page)).not.toBeFocused();
    await expect(surface(page).locator('[data-crop-handle][data-active]')).toHaveCount(0);
    await expect(surface(page)).toHaveAttribute('data-cropping', 'e_picture');
    // Back on the Stage the arrows are on the picture, and Enter leaves the crop.
    await page.keyboard.press('Shift+Tab');
    await expect(surface(page)).toBeFocused();
    await expect(surface(page).locator('[data-crop-handle][data-active]')).toHaveCount(0);
    await page.keyboard.press('Tab');
    await expect(handle(page, 'nw')).toHaveAttribute('data-active', 'true');
    await page.keyboard.press('Enter');
    await expect(surface(page)).not.toHaveAttribute('data-cropping');
    // The next crop starts on the picture again.
    await page.keyboard.press('Enter');
    await expect(surface(page)).toHaveAttribute('data-cropping', 'e_picture');
    await expect(surface(page).locator('[data-crop-handle][data-active]')).toHaveCount(0);
  });

  test('from a crop the keyboard reaches the crop tools of row B, and they work', async ({
    page,
  }) => {
    const rowB = page.getByTestId('top-tools-b');
    /** Shift+Tab until the tool of that name has the keyboard; every stop on the way is in row B. */
    const backTo = async (name: string) => {
      for (let presses = 0; presses < 12; presses++) {
        await page.keyboard.press('Shift+Tab');
        const at = await page.evaluate(() => {
          const el = document.activeElement;
          return {
            inRowB: Boolean(el?.closest('[data-testid="top-tools-b"]')),
            name: el?.getAttribute('aria-label') ?? el?.textContent?.trim() ?? '',
          };
        });
        expect(at.inRowB, `stop ${presses + 1}: "${at.name}"`).toBe(true);
        if (at.name === name) return;
      }
      throw new Error(`"${name}" was not reached from the Stage with Shift+Tab`);
    };

    // A crop to take back: the top left corner, ten pixels in.
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+ArrowRight');
    expect((await model(page)).crop).toBeDefined();
    await page.keyboard.press('Shift+Tab');
    await expect(surface(page).locator('[data-crop-handle][data-active]')).toHaveCount(0);

    // Back from the picture the keyboard leaves the Stage for the tools before it, and the crop
    // goes on: its tools are there only while it does.
    await backTo('Reset crop');
    await expect(surface(page)).toHaveAttribute('data-cropping', 'e_picture');
    await expect(rowB.getByRole('button', { name: 'Reset crop' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await model(page)).crop).toBeUndefined();
    expect((await model(page)).frame).toEqual({ x: 660, y: 340, w: 600, h: 400 });

    // Done remains reachable from the Stage after the crop tools changed.
    await surface(page).focus();
    await backTo('Done');
    await page.keyboard.press('Enter');
    await expect(surface(page)).not.toHaveAttribute('data-cropping', /./);
  });
});

for (const lang of ['he', 'en'] as const) {
  test(`the shortcut map lists the keys of the keyboard pass, ${lang}`, async ({ page }) => {
    await openApp(page, { lang });
    await page.keyboard.press('Control+/');
    const map = page.getByTestId('shortcut-map');
    await expect(map).toBeVisible();
    const rows = {
      'stage.lock': lang === 'he' ? 'נעילה וביטול נעילה' : 'Lock and unlock',
      'stage.hide': lang === 'he' ? 'הסתרה' : 'Hide',
      'stage.pan.left':
        lang === 'he' ? 'הזזת התצוגה של שקף מוגדל' : 'Move the view of a zoomed slide',
      'stage.walk.next':
        lang === 'he'
          ? 'מעבר לאובייקט הבא או הקודם, וב-Filmstrip לשקף, בלי לבחור בו'
          : 'Go to the next or the previous object, or slide in the Filmstrip, without selecting it',
      // Keys a part of the Stage and a table read themselves: listed, and not to be given away.
      'arrange.part':
        lang === 'he'
          ? 'הזזת הנקודה של קו, או ידית החיתוך, שהמקלדת עליה (עם Shift: בעשרה פיקסלים)'
          : 'Move the point of a line, or the crop handle, the keyboard is on (with Shift: by ten pixels)',
      'table.rule':
        lang === 'he'
          ? 'רוחב העמודה וגובה השורה של התא (עם Shift: בעשרה פיקסלים)'
          : 'The width of the column and the height of the row of the cell (with Shift: by ten pixels)',
      'stage.walk.toggle':
        lang === 'he' ? 'הוספה לבחירה או הסרה ממנה' : 'Add to the selection, or take out of it',
      'stage.points':
        lang === 'he'
          ? 'כניסה לנקודות של קו, ויציאה מהן'
          : 'Into the points of a line, and out of them',
      'stage.point.add': lang === 'he' ? 'הוספת נקודה לקו' : 'Add a point to the line',
      'stage.point.remove': lang === 'he' ? 'הסרת נקודה מקו' : 'Remove a point from the line',
    };
    for (const [id, label] of Object.entries(rows)) {
      const row = map.locator(`[data-shortcut="${id}"]`);
      await expect(row.locator('dt')).toHaveText(label);
      await expect(row.locator('kbd').first()).toBeVisible();
    }
    // No string is missing: a missing one would show as its key.
    await expect(map).not.toContainText('stage:');
    await expect(map).not.toContainText('a11y:');
  });
}
