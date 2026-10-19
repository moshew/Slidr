import { expect, test } from '@playwright/test';
import { openApp } from './arrange-helpers';
import { addText, caret, editingId, para, plain } from './text-helpers';

test('repro', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  await addText(page, 'e_t', [para('Welcome')], { frame: { x: 400, y: 300, w: 600, h: 200 } });
  const surface = page.getByTestId('stage-surface');
  const root = surface.locator('[data-element-id="e_t"]');
  const p = (await root.locator('p').boundingBox())!;
  await page.mouse.click(p.x + 10, p.y + p.height / 2);
  await expect(page.locator('[data-text-editor]')).toBeFocused();
  const box = (await root.boundingBox())!;
  const off = { x: box.x + box.width - 30, y: p.y + p.height / 2 };
  await page.mouse.move(off.x, off.y, { steps: 5 });
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(off.x + i * 10, off.y + i * 8);
    await page.waitForTimeout(30);
  }
  await page.mouse.up();
  const state = await page.evaluate(() => ({
    active: document.activeElement?.outerHTML.slice(0, 80),
    sel: window.slidr!.selection.getState().selectedElementIds,
    domSel: getSelection()?.rangeCount,
  }));
  console.log(JSON.stringify(state), await editingId(page), JSON.stringify(await caret(page)));
  await page.keyboard.type('XY');
  console.log('text:', await plain(page, 'e_t'));
});
