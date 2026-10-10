import { expect, test, type Page } from '@playwright/test';
import type { Element, GroupElement, SvgElement, TextElement } from '@slidr/model';
import {
  currentSlide,
  onStage,
  openApp,
  pageProblems,
  selected,
  undo,
  undoDepth,
} from './objects-helpers';

async function drag(page: Page, handle: string, dx: number, dy: number) {
  const box = (await page.locator(`[data-handle="${handle}"]`).boundingBox())!;
  const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x + dx, at.y + dy, { steps: 8 });
  await page.mouse.up();
}

const find = (elements: Element[], id: string): Element | undefined => {
  for (const element of elements) {
    if (element.id === id) return element;
    const nested = element.type === 'group' && find(element.children, id);
    if (nested) return nested;
  }
};

for (const lang of ['he', 'en'] as const) {
  test(`a text plate stretches one axis, and its magnet lengthens the plate with its words (${lang})`, async ({
    page,
  }) => {
    await openApp(page, { lang });
    await page.getByTestId('activity-bar').locator('[data-panel="elements"]').click();
    const panel = page.getByTestId('elements-panel');
    await panel.locator('[data-collection="frames"]').click();
    await panel.getByTestId('frames-query').fill('pool');
    await panel.locator('[data-frame="frame:magnet-pool"]').click();
    const magnet = await selected<GroupElement>(page);
    const sign = magnet.children.find((child) =>
      child.name?.endsWith(':label:pool-sign'),
    ) as GroupElement;
    const plate = sign.children[0] as SvgElement;
    const words = sign.children[1] as TextElement;
    const read = async <T extends Element>(id: string) =>
      find((await currentSlide(page)).elements, id) as T;
    const pick = (id: string) =>
      page.evaluate(
        (elementId) => window.slidr!.selection.getState().selectElements([elementId]),
        id,
      );
    const drawn = onStage(page, plate.id).locator('[data-stretch-background]');
    await expect(drawn).toBeVisible();

    // The labelled plate is selected by clicking its border beside the text.
    const border = (await onStage(page, plate.id).boundingBox())!;
    await page.mouse.click(border.x + 10, border.y + border.height / 2);
    await expect
      .poll(() => page.evaluate(() => window.slidr!.selection.getState().selectedElementIds))
      .toEqual([sign.id]);
    const depth = await undoDepth(page);
    await drag(page, 'e', 100, 0);
    const wider = await read<GroupElement>(sign.id);
    expect(wider.frame.w).toBeGreaterThan(sign.frame.w + 100);
    expect(wider.frame.h).toBe(sign.frame.h);
    expect(wider.children[1]!.frame.w).toBeGreaterThan(words.frame.w + 100);
    expect((wider.children[1] as TextElement).content).toEqual(words.content);
    expect((await read<GroupElement>(magnet.id)).children[0]!.frame).toEqual(
      magnet.children[0]!.frame,
    );
    expect(await undoDepth(page)).toBe(depth + 1);
    await undo(page);
    expect(await read<GroupElement>(sign.id)).toEqual(sign);

    // The SVG alone also has independent edge handles; the top edge grows only its height.
    await pick(plate.id);
    await drag(page, 'n', 0, -70);
    const tall = await read<SvgElement>(plate.id);
    expect(tall.frame.w).toBe(plate.frame.w);
    expect(tall.frame.h).toBeGreaterThan(plate.frame.h + 50);
    expect(tall.stretch).toEqual(plate.stretch);
    await undo(page);

    // On a saved plate without the new metadata, the first drag upgrades it in the same step.
    await page.evaluate(
      ({ id }) => {
        const editor = window.slidr!;
        editor.bus.dispatch({
          type: 'element.update',
          slideId: editor.selection.getState().currentSlideId!,
          elementId: id,
          patch: { stretch: null },
        });
      },
      { id: plate.id },
    );
    await pick(plate.id);
    await drag(page, 'e', 90, 0);
    const upgraded = await read<SvgElement>(plate.id);
    expect(upgraded.frame.w).toBeGreaterThan(plate.frame.w);
    expect(upgraded.frame.h).toBe(plate.frame.h);
    expect(upgraded.stretch).toEqual(plate.stretch);
    await undo(page);
    expect((await read<SvgElement>(plate.id)).stretch).toBeUndefined();

    // Resizing the complete magnet grows the sign and its text area, with constant type,
    // sign height and sticker sizes. The tilted sign remains inside the card.
    await pick(magnet.id);
    await drag(page, 'e', 110, 0);
    const grown = await read<GroupElement>(magnet.id);
    const extended = await read<GroupElement>(sign.id);
    expect(grown.frame.w).toBeGreaterThan(magnet.frame.w + 100);
    expect(grown.frame.h).toBe(magnet.frame.h);
    expect(extended.frame.w).toBeGreaterThan(sign.frame.w + 50);
    expect(extended.frame.h).toBe(sign.frame.h);
    expect((extended.children[1] as TextElement).content).toEqual(words.content);
    for (const sticker of magnet.children.filter((child) => child.type === 'svg')) {
      const after = await read<SvgElement>(sticker.id);
      expect([after.frame.w, after.frame.h]).toEqual([sticker.frame.w, sticker.frame.h]);
    }
    expect(pageProblems(page)).toEqual([]);
  });
}
