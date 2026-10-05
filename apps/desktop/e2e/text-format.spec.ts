import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import {
  addText,
  caret,
  edit,
  editingId,
  element,
  move,
  oneUndoStep,
  para,
  paragraphs,
  plain,
  select,
  setSelection,
  steps,
} from './text-helpers';

/*
 * Formatting text from row B and from the keyboard (WG4-T03, T04, T05; ADR-013), in the app:
 * for a selected text box (all of its text) and for a selection inside the text editor. Every
 * change is one undo step. The UI is Hebrew, the default.
 */

// Each test walks through several controls, and the dev server is shared with other test runs.
test.describe.configure({ timeout: 120_000 });

const ID = 'e_fmt';
const row = (page: Page) => page.getByTestId('top-tools-b');
const tool = (page: Page, name: string) => row(page).getByRole('button', { name, exact: true });
const editor = (page: Page) => page.locator('[data-text-editor]');

/**
 * Closes the colour picker with Esc, as a person would: a swatch that was clicked shows its
 * tooltip, the first Esc closes that, and the next one the picker. The pause lets the tooltip
 * finish closing; an Esc during it would be the tooltip's again.
 */
async function closePicker(page: Page) {
  const area = page.getByTestId('color-area');
  for (let i = 0; i < 3 && (await area.isVisible()); i++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }
  await expect(area).toHaveCount(0);
}

/** The marks of every run of the element, paragraph by paragraph. */
async function marks(page: Page): Promise<(Record<string, unknown> | undefined)[][]> {
  return (await paragraphs(page, ID)).map((p) => p.runs.map((r) => r.marks));
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('stage-frame')).toBeVisible();
  await addText(page, ID, [para('שלום עולם'), para('Hello world')]);
});

test.describe('a selected text box: the tools format all of its text', () => {
  test.beforeEach(async ({ page }) => {
    await select(page, ID);
    await expect(row(page)).toHaveAttribute('data-selection', 'text');
  });

  test('the row shows the values of the text style when no mark is set', async ({ page }) => {
    // The body style of the basic theme: Heebo for Hebrew, 30px, regular.
    await expect(tool(page, 'גופן')).toHaveText('Heebo');
    await expect(row(page).getByRole('textbox', { name: 'גודל גופן' })).toHaveValue('30');
    await expect(row(page).getByRole('combobox', { name: 'משקל' })).toHaveText('רגיל');
    await expect(tool(page, 'מודגש')).toHaveAttribute('aria-pressed', 'false');
    // Both paragraphs resolve to different directions, but the alignment is one: start.
    await expect(row(page).locator('[data-align="start"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('font, from the picker', async ({ page }) => {
    await oneUndoStep(page, ID, async () => {
      await tool(page, 'גופן').click();
      await page.getByRole('combobox', { name: 'חיפוש גופן' }).fill('rubik');
      await page.keyboard.press('Enter');
    });
    expect(await marks(page)).toEqual([[{ font: 'Rubik' }], [{ font: 'Rubik' }]]);
    await expect(tool(page, 'גופן')).toHaveText('Rubik');
    // The focus is back on the Stage: the keyboard still works on the selected box.
    await expect(page.getByTestId('stage-surface')).toBeFocused();
  });

  test('size: typed, stepped with the arrows, and from the presets', async ({ page }) => {
    const size = row(page).getByRole('textbox', { name: 'גודל גופן' });
    await oneUndoStep(page, ID, async () => {
      await size.fill('48');
      await size.press('Enter');
    });
    expect(await marks(page)).toEqual([[{ size: 48 }], [{ size: 48 }]]);
    await expect(page.getByTestId('stage-surface')).toBeFocused();

    // A run of arrow presses is one undo step (and a step of its own, after a pause).
    await page.waitForTimeout(900);
    const before = await steps(page);
    await size.focus();
    await size.press('ArrowUp');
    await size.press('ArrowUp');
    await size.press('ArrowUp');
    expect(await marks(page)).toEqual([[{ size: 51 }], [{ size: 51 }]]);
    expect(await steps(page)).toBe(before + 1);

    await tool(page, 'גדלים מוכנים').click();
    await page.getByRole('menuitemradio', { name: '72', exact: true }).click();
    expect(await marks(page)).toEqual([[{ size: 72 }], [{ size: 72 }]]);
    await expect(size).toHaveValue('72');
  });

  test('weight, and what "bold" means against it', async ({ page }) => {
    const weight = row(page).getByRole('combobox', { name: 'משקל' });
    await oneUndoStep(page, ID, async () => {
      await weight.click();
      await page.getByRole('option', { name: 'בינוני', exact: true }).click();
    });
    expect(await marks(page)).toEqual([[{ weight: 500 }], [{ weight: 500 }]]);
    await expect(page.getByTestId('stage-surface')).toBeFocused();

    // Bold on is 700; bold off on a regular style drops the mark altogether.
    await oneUndoStep(page, ID, () => tool(page, 'מודגש').click());
    expect(await marks(page)).toEqual([[{ weight: 700 }], [{ weight: 700 }]]);
    await expect(tool(page, 'מודגש')).toHaveAttribute('aria-pressed', 'true');
    await expect(weight).toHaveText('מודגש');
    await tool(page, 'מודגש').click();
    expect(await marks(page)).toEqual([[undefined], [undefined]]);
  });

  test('B, I, U from the buttons and from Ctrl+B, Ctrl+I, Ctrl+U', async ({ page }) => {
    await oneUndoStep(page, ID, () => tool(page, 'נטוי').click());
    await oneUndoStep(page, ID, () => tool(page, 'קו תחתון').click());
    expect(await marks(page)).toEqual([
      [{ italic: true, underline: true }],
      [{ italic: true, underline: true }],
    ]);
    await expect(tool(page, 'נטוי')).toHaveAttribute('aria-pressed', 'true');

    await oneUndoStep(page, ID, () => page.keyboard.press('Control+b'));
    await page.keyboard.press('Control+i');
    await page.keyboard.press('Control+u');
    expect(await marks(page)).toEqual([[{ weight: 700 }], [{ weight: 700 }]]);
    await expect(tool(page, 'מודגש')).toHaveAttribute('aria-pressed', 'true');
    await expect(tool(page, 'נטוי')).toHaveAttribute('aria-pressed', 'false');
  });

  test('a toggle is on only when all of the text has it, and then turns it off', async ({
    page,
  }) => {
    await addText(page, 'e_part', [
      {
        dir: 'auto',
        align: 'start',
        runs: [{ text: 'a', marks: { italic: true } }, { text: 'b' }],
      },
    ]);
    await select(page, 'e_part');
    await expect(tool(page, 'נטוי')).toHaveAttribute('aria-pressed', 'false');
    await tool(page, 'נטוי').click();
    expect((await paragraphs(page, 'e_part'))[0]?.runs).toEqual([
      { text: 'ab', marks: { italic: true } },
    ]);
    await tool(page, 'נטוי').click();
    expect((await paragraphs(page, 'e_part'))[0]?.runs).toEqual([{ text: 'ab' }]);
  });

  test('text colour and highlight: theme tokens, no colour, and a drag as one step', async ({
    page,
  }) => {
    await oneUndoStep(page, ID, async () => {
      await tool(page, 'צבע טקסט').click();
      await page.getByRole('button', { name: 'ראשי', exact: true }).click();
      await closePicker(page);
    });
    expect(await marks(page)).toEqual([
      [{ color: { token: 'primary' } }],
      [{ color: { token: 'primary' } }],
    ]);

    // A drag over the colour square is many changes and one undo step.
    const before = await steps(page);
    await tool(page, 'צבע טקסט').click();
    const area = await page.getByTestId('color-area').boundingBox();
    await page.mouse.move(area!.x + 20, area!.y + 20);
    await page.mouse.down();
    await page.mouse.move(area!.x + 60, area!.y + 40, { steps: 5 });
    await page.mouse.move(area!.x + area!.width - 4, area!.y + 4, { steps: 5 });
    await page.mouse.up();
    await closePicker(page);
    expect(await steps(page)).toBe(before + 1);
    const dragged = (await marks(page))[0]?.[0]?.color as { value: string };
    expect(dragged.value).toMatch(/^#[0-9a-f]{6}$/);
    await page.keyboard.press('Control+z');
    expect((await marks(page))[0]?.[0]?.color).toEqual({ token: 'primary' });

    await oneUndoStep(page, ID, async () => {
      await tool(page, 'צבע הדגשה').click();
      await page.getByRole('button', { name: 'הדגשה', exact: true }).click();
      await closePicker(page);
    });
    expect((await marks(page))[1]?.[0]?.highlight).toEqual({ token: 'accent' });
    await oneUndoStep(page, ID, async () => {
      await tool(page, 'צבע הדגשה').click();
      await page.getByRole('button', { name: 'ללא צבע', exact: true }).click();
      await closePicker(page);
    });
    expect((await marks(page))[1]?.[0]?.highlight).toBeUndefined();
  });

  test('more: strikethrough, super / subscript, case and letter spacing', async ({ page }) => {
    const toggle = async (name: string) => {
      await tool(page, 'עוד עיצוב תווים').click();
      await page.getByRole('button', { name, exact: true }).click();
      await page.keyboard.press('Escape');
    };
    await oneUndoStep(page, ID, () => toggle('קו חוצה'));
    await oneUndoStep(page, ID, () => toggle('כתב עילי'));
    await oneUndoStep(page, ID, () => toggle('אותיות גדולות'));
    expect((await marks(page))[1]).toEqual([{ strike: true, script: 'sup', case: 'upper' }]);
    // Subscript replaces superscript, lower case replaces upper case: one mark each.
    await toggle('כתב תחתי');
    await toggle('אותיות קטנות');
    expect((await marks(page))[1]).toEqual([{ strike: true, script: 'sub', case: 'lower' }]);
    await toggle('כתב תחתי');
    await toggle('אותיות קטנות');
    await toggle('קו חוצה');
    expect(await marks(page)).toEqual([[undefined], [undefined]]);

    await oneUndoStep(page, ID, async () => {
      await tool(page, 'עוד עיצוב תווים').click();
      const spacing = page.getByRole('textbox', { name: 'ריווח אותיות' });
      await spacing.fill('2.5');
      await spacing.press('Enter');
      await page.keyboard.press('Escape');
    });
    expect((await marks(page))[0]).toEqual([{ letterSpacing: 2.5 }]);
  });

  test('alignment and direction', async ({ page }) => {
    await oneUndoStep(page, ID, () => row(page).locator('[data-align="center"]').click());
    expect((await paragraphs(page, ID)).map((p) => p.align)).toEqual(['center', 'center']);
    await oneUndoStep(page, ID, () => row(page).locator('[data-align="justify"]').click());
    await row(page).locator('[data-align="end"]').click();
    expect((await paragraphs(page, ID)).map((p) => p.align)).toEqual(['end', 'end']);
    await expect(row(page).locator('[data-align="end"]')).toHaveAttribute('aria-pressed', 'true');

    await oneUndoStep(page, ID, async () => {
      await tool(page, 'כיוון הפסקה').click();
      await page.getByRole('menuitemradio', { name: 'משמאל לימין' }).click();
    });
    expect((await paragraphs(page, ID)).map((p) => p.dir)).toEqual(['ltr', 'ltr']);
    await expect(page.getByTestId('stage-surface')).toBeFocused();
    // Ctrl+Shift+X turns the text the other way (SPEC Appendix A).
    await oneUndoStep(page, ID, () => page.keyboard.press('Control+Shift+x'));
    expect((await paragraphs(page, ID)).map((p) => p.dir)).toEqual(['rtl', 'rtl']);
    await tool(page, 'כיוון הפסקה').click();
    await page.getByRole('menuitemradio', { name: 'אוטומטי, לפי הטקסט' }).click();
    expect((await paragraphs(page, ID)).map((p) => p.dir)).toEqual(['auto', 'auto']);
  });

  test('the alignment buttons show the side that start and end are on', async ({ page }) => {
    // The first paragraph is Hebrew: start is the right.
    await expect(row(page).locator('[data-align="start"]')).toHaveAccessibleName('יישור לימין');
    await expect(row(page).locator('[data-align="end"]')).toHaveAccessibleName('יישור לשמאל');
    await expect(tool(page, 'כיוון הפסקה')).toHaveAttribute('data-direction', 'rtl');
    const start = await row(page).locator('[data-align="start"]').boundingBox();
    const end = await row(page).locator('[data-align="end"]').boundingBox();
    expect(start!.x).toBeGreaterThan(end!.x);

    await page.keyboard.press('Control+Shift+x');
    await expect(row(page).locator('[data-align="start"]')).toHaveAccessibleName('יישור לשמאל');
    await expect(tool(page, 'כיוון הפסקה')).toHaveAttribute('data-direction', 'ltr');
    const startLtr = await row(page).locator('[data-align="start"]').boundingBox();
    const endLtr = await row(page).locator('[data-align="end"]').boundingBox();
    expect(startLtr!.x).toBeLessThan(endLtr!.x);
  });

  test('spacing: line height, space before and after, first-line indent', async ({ page }) => {
    const set = async (name: string, value: string) => {
      await tool(page, 'ריווח').click();
      const field = page.getByRole('textbox', { name, exact: true });
      await field.fill(value);
      await field.press('Enter');
      await page.keyboard.press('Escape');
    };
    await oneUndoStep(page, ID, () => set('גובה שורה', '1.2'));
    await oneUndoStep(page, ID, () => set('רווח לפני הפסקה', '10'));
    await oneUndoStep(page, ID, () => set('רווח אחרי הפסקה', '24'));
    await oneUndoStep(page, ID, () => set('הזחת שורה ראשונה', '40'));
    for (const p of await paragraphs(page, ID)) {
      expect(p).toMatchObject({ lineHeight: 1.2, spaceBefore: 10, spaceAfter: 24, indent: 40 });
    }
    // Zero is no spacing: the field goes from the paragraph, rather than staying as a zero.
    await set('רווח לפני הפסקה', '0');
    expect((await paragraphs(page, ID))[0]).not.toHaveProperty('spaceBefore');
  });

  test('lists: bullets, numbers, levels, a custom bullet and a marker colour', async ({ page }) => {
    await oneUndoStep(page, ID, () => tool(page, 'רשימת תבליטים').click());
    expect((await paragraphs(page, ID)).map((p) => p.list)).toEqual([
      { kind: 'bullet', level: 0 },
      { kind: 'bullet', level: 0 },
    ]);
    await expect(tool(page, 'רשימת תבליטים')).toHaveAttribute('aria-pressed', 'true');

    const option = async (act: () => Promise<void>) => {
      await tool(page, 'אפשרויות רשימה').click();
      await act();
      await page.keyboard.press('Escape');
    };
    await oneUndoStep(page, ID, () =>
      option(() => page.getByRole('button', { name: 'רמה אחת פנימה' }).click()),
    );
    await oneUndoStep(page, ID, () =>
      option(() => page.getByRole('button', { name: '★', exact: true }).click()),
    );
    await oneUndoStep(page, ID, () =>
      option(async () => {
        await page.getByRole('button', { name: 'צבע הסימון' }).click();
        await page.getByRole('button', { name: 'ראשי', exact: true }).click();
        await closePicker(page);
      }),
    );
    expect((await paragraphs(page, ID))[0]?.list).toEqual({
      kind: 'bullet',
      level: 1,
      glyph: '★',
      color: { token: 'primary' },
    });
    // The Stage draws it: the marker of the first item is the star.
    await expect(
      page.getByTestId('stage-surface').locator(`[data-element-id="${ID}"] [data-slidr-marker]`),
    ).toHaveText(['★', '★']);

    await option(async () => {
      const custom = page.getByRole('textbox', { name: 'תבליט אחר' });
      await custom.fill('»');
      await custom.press('Enter');
    });
    expect((await paragraphs(page, ID))[0]?.list?.glyph).toBe('»');

    // Numbers keep the level and the colour, and drop the bullet that would replace the numbers.
    await oneUndoStep(page, ID, () => tool(page, 'רשימה ממוספרת').click());
    expect((await paragraphs(page, ID))[1]?.list).toEqual({
      kind: 'number',
      level: 1,
      color: { token: 'primary' },
    });
    await option(() => page.getByRole('button', { name: 'רמה אחת החוצה' }).click());
    expect((await paragraphs(page, ID))[1]?.list?.level).toBe(0);
    await tool(page, 'רשימה ממוספרת').click();
    expect((await paragraphs(page, ID)).map((p) => p.list)).toEqual([undefined, undefined]);
  });

  test('the text box: auto-fit, vertical alignment and padding', async ({ page }) => {
    const box = async (act: () => Promise<void>) => {
      await tool(page, 'תיבת הטקסט').click();
      await act();
      await page.keyboard.press('Escape');
    };
    await oneUndoStep(page, ID, () =>
      box(() => page.getByRole('button', { name: 'לאמצע', exact: true }).click()),
    );
    expect((await element(page, ID)).vAlign).toBe('middle');

    await oneUndoStep(page, ID, () =>
      box(async () => {
        const all = page.getByRole('textbox', { name: 'ריפוד מכל הצדדים' });
        await all.fill('24');
        await all.press('Enter');
      }),
    );
    expect((await element(page, ID)).padding).toEqual({ top: 24, right: 24, bottom: 24, left: 24 });
    await box(async () => {
      const top = page.getByRole('textbox', { name: 'ריפוד עליון' });
      await top.fill('8');
      await top.press('Enter');
    });
    expect((await element(page, ID)).padding).toEqual({ top: 8, right: 24, bottom: 24, left: 24 });

    // Growing with the text: the frame takes the height of the content, in the same undo step.
    const grown = await oneUndoStep(page, ID, async () => {
      await box(async () => {
        await page.getByRole('combobox', { name: 'התאמה לתוכן' }).click();
        await page.getByRole('option', { name: 'הגדלת הגובה' }).click();
      });
      await expect.poll(async () => (await element(page, ID)).frame.h).toBeLessThan(400);
    });
    expect(grown.autoFit).toBe('growHeight');
    // Two lines of 30px body text at 1.45, and the padding above and below.
    expect(grown.frame.h).toBe(Math.round(2 * 30 * 1.45) + 8 + 24);

    // A change that makes the text taller makes the frame taller, still in one step.
    const size = row(page).getByRole('textbox', { name: 'גודל גופן' });
    const bigger = await oneUndoStep(page, ID, async () => {
      await size.fill('60');
      await size.press('Enter');
      await expect.poll(async () => (await element(page, ID)).frame.h).toBeGreaterThan(150);
    });
    expect(bigger.frame.h).toBe(Math.round(2 * 60 * 1.45) + 8 + 24);
  });

  test('a shape has no text box settings; its text is formatted like any other', async ({
    page,
  }) => {
    await page.evaluate(() => {
      const { bus, selection } = window.slidr!;
      bus.dispatch({
        type: 'element.add',
        slideId: selection.getState().currentSlideId!,
        element: {
          id: 'e_shape',
          type: 'shape',
          frame: { x: 600, y: 600, w: 600, h: 300 },
          rotation: 0,
          opacity: 1,
          geometry: { kind: 'preset', preset: 'rect' },
          fill: { kind: 'solid', color: { token: 'surface' } },
          content: { paragraphs: [{ dir: 'auto', align: 'center', runs: [{ text: 'צורה' }] }] },
        },
      });
    });
    await edit(page, 'e_shape');
    await expect(row(page)).toHaveAttribute('data-selection', 'text');
    await expect(tool(page, 'מודגש')).toBeVisible();
    await expect(tool(page, 'תיבת הטקסט')).toHaveCount(0);
    await page.keyboard.press('Control+a');
    await tool(page, 'מודגש').click();
    expect((await paragraphs(page, 'e_shape'))[0]?.runs).toEqual([
      { text: 'צורה', marks: { weight: 700 } },
    ]);
  });
});

test.describe('inside the text editor: the tools format the selection', () => {
  /** Edits the box and selects the first paragraph: "שלום עולם". */
  async function editFirstLine(page: Page) {
    await edit(page, ID);
    await setSelection(page, 1, 10);
    await expect(row(page)).toHaveAttribute('data-selection', 'text');
  }

  /** The toolbar did not end editing, the selection is what it was, and the caret is in the text. */
  async function expectStillEditing(page: Page, range = { from: 1, to: 10 }) {
    expect(await editingId(page)).toBe(ID);
    await expect(editor(page)).toBeFocused();
    expect(await caret(page)).toMatchObject(range);
  }

  test('character tools change the selected text only, one undo step each', async ({ page }) => {
    await editFirstLine(page);

    await oneUndoStep(page, ID, () => tool(page, 'מודגש').click());
    await expectStillEditing(page);
    await oneUndoStep(page, ID, () => page.keyboard.press('Control+i'));
    await oneUndoStep(page, ID, () => page.keyboard.press('Control+u'));
    expect(await marks(page)).toEqual([
      [{ weight: 700, italic: true, underline: true }],
      [undefined],
    ]);
    await expect(tool(page, 'נטוי')).toHaveAttribute('aria-pressed', 'true');

    await oneUndoStep(page, ID, async () => {
      await tool(page, 'גופן').click();
      await page.getByRole('combobox', { name: 'חיפוש גופן' }).fill('rubik');
      await page.keyboard.press('Enter');
    });
    await expectStillEditing(page);

    const size = row(page).getByRole('textbox', { name: 'גודל גופן' });
    await oneUndoStep(page, ID, async () => {
      await size.click();
      await size.fill('48');
      await size.press('Enter');
    });
    await expectStillEditing(page);

    await oneUndoStep(page, ID, async () => {
      await row(page).getByRole('combobox', { name: 'משקל' }).click();
      await page.getByRole('option', { name: 'דק', exact: true }).click();
      await expect(editor(page)).toBeFocused();
    });
    await expectStillEditing(page);

    await oneUndoStep(page, ID, async () => {
      await tool(page, 'צבע טקסט').click();
      await page.getByRole('button', { name: 'משני', exact: true }).click();
      await closePicker(page);
    });
    await expectStillEditing(page);

    await oneUndoStep(page, ID, async () => {
      await tool(page, 'עוד עיצוב תווים').click();
      await page.getByRole('button', { name: 'קו חוצה', exact: true }).click();
      await page.keyboard.press('Escape');
    });
    await expectStillEditing(page);

    expect(await marks(page)).toEqual([
      [
        {
          font: 'Rubik',
          size: 48,
          weight: 300,
          italic: true,
          underline: true,
          strike: true,
          color: { token: 'secondary' },
        },
      ],
      [undefined],
    ]);
    // The row shows the selection's values.
    await expect(tool(page, 'גופן')).toHaveText('Rubik');
    await expect(size).toHaveValue('48');
  });

  test('the tools inside popovers change the selection too, one undo step each', async ({
    page,
  }) => {
    await editFirstLine(page);
    const inPopover = async (name: string, act: () => Promise<void>) => {
      await tool(page, name).click();
      await act();
      await page.keyboard.press('Escape');
      await expectStillEditing(page);
    };
    const field = async (name: string, value: string) => {
      const input = page.getByRole('textbox', { name, exact: true });
      await input.fill(value);
      await input.press('Enter');
    };
    const press = (name: string) => page.getByRole('button', { name, exact: true }).click();

    await oneUndoStep(page, ID, () => inPopover('עוד עיצוב תווים', () => press('כתב עילי')));
    await oneUndoStep(page, ID, () => inPopover('עוד עיצוב תווים', () => press('אותיות גדולות')));
    await oneUndoStep(page, ID, () =>
      inPopover('עוד עיצוב תווים', () => field('ריווח אותיות', '3')),
    );
    await oneUndoStep(page, ID, () => inPopover('ריווח', () => field('רווח לפני הפסקה', '12')));
    await oneUndoStep(page, ID, () => inPopover('ריווח', () => field('רווח אחרי הפסקה', '16')));
    await oneUndoStep(page, ID, () => inPopover('ריווח', () => field('הזחת שורה ראשונה', '48')));
    await oneUndoStep(page, ID, () => tool(page, 'רשימת תבליטים').click());
    await oneUndoStep(page, ID, () => inPopover('אפשרויות רשימה', () => press('רמה אחת פנימה')));
    await oneUndoStep(page, ID, () => inPopover('אפשרויות רשימה', () => press('✓')));
    await oneUndoStep(page, ID, () =>
      inPopover('אפשרויות רשימה', async () => {
        await press('צבע הסימון');
        await press('הדגשה');
        await closePicker(page);
      }),
    );
    await oneUndoStep(page, ID, () => inPopover('תיבת הטקסט', () => press('למטה')));

    const [first, second] = await paragraphs(page, ID);
    expect(first).toEqual({
      dir: 'auto',
      align: 'start',
      spaceBefore: 12,
      spaceAfter: 16,
      indent: 48,
      list: { kind: 'bullet', level: 1, glyph: '✓', color: { token: 'accent' } },
      runs: [{ text: 'שלום עולם', marks: { letterSpacing: 3, script: 'sup', case: 'upper' } }],
    });
    // The paragraph the selection does not touch is as it was.
    expect(second).toEqual({ dir: 'auto', align: 'start', runs: [{ text: 'Hello world' }] });
    expect((await element(page, ID)).vAlign).toBe('bottom');
  });

  test('a drag in the colour picker is one undo step, and the text follows it live', async ({
    page,
  }) => {
    await editFirstLine(page);
    const before = await steps(page);
    await tool(page, 'צבע טקסט').click();
    const area = await page.getByTestId('color-area').boundingBox();
    await page.mouse.move(area!.x + 30, area!.y + 30);
    await page.mouse.down();
    await page.mouse.move(area!.x + 90, area!.y + 60, { steps: 4 });
    // Mid-drag the text already has a colour of the drag, and it is still one step.
    expect((await marks(page))[0]?.[0]?.color).toMatchObject({ value: expect.any(String) });
    expect(await steps(page)).toBe(before + 1);
    await page.mouse.move(area!.x + area!.width - 4, area!.y + 4, { steps: 4 });
    await page.mouse.up();
    await closePicker(page);
    await expectStillEditing(page);
    expect(await steps(page)).toBe(before + 1);
    // The editor shows the colour: no longer the text colour of the theme.
    await expect(editor(page).locator('p').first().locator('span')).not.toHaveCSS(
      'color',
      'rgb(21, 23, 26)',
    );
    await page.keyboard.press('Control+z');
    expect(await marks(page)).toEqual([[undefined], [undefined]]);
    expect(await steps(page)).toBe(before);
  });

  test('a mixed selection shows as mixed', async ({ page }) => {
    await editFirstLine(page);
    await setSelection(page, 1, 5);
    await tool(page, 'מודגש').click();
    const size = row(page).getByRole('textbox', { name: 'גודל גופן' });
    await size.fill('60');
    await size.press('Enter');
    await page.keyboard.press('Control+a');
    await expect(size).toHaveValue('');
    await expect(row(page).getByRole('combobox', { name: 'משקל' })).toHaveText('מעורב');
    await expect(tool(page, 'מודגש')).toHaveAttribute('aria-pressed', 'false');
    // Bold on a part-bold selection makes all of it bold.
    await tool(page, 'מודגש').click();
    expect((await marks(page)).flat().every((m) => m?.weight === 700)).toBe(true);
  });

  test('paragraph tools change the paragraphs the selection touches', async ({ page }) => {
    await edit(page, ID);
    // The caret is at the end: in the second paragraph, "Hello world".
    await oneUndoStep(page, ID, () => row(page).locator('[data-align="center"]').click());
    expect((await paragraphs(page, ID)).map((p) => p.align)).toEqual(['start', 'center']);
    await expect(editor(page)).toBeFocused();

    await oneUndoStep(page, ID, () => page.keyboard.press('Control+Shift+x'));
    expect((await paragraphs(page, ID)).map((p) => p.dir)).toEqual(['auto', 'rtl']);
    await oneUndoStep(page, ID, async () => {
      await tool(page, 'כיוון הפסקה').click();
      await page.getByRole('menuitemradio', { name: 'משמאל לימין' }).click();
    });
    await expect(editor(page)).toBeFocused();

    await oneUndoStep(page, ID, () => tool(page, 'רשימה ממוספרת').click());
    await oneUndoStep(page, ID, async () => {
      await tool(page, 'ריווח').click();
      const lineHeight = page.getByRole('textbox', { name: 'גובה שורה' });
      await lineHeight.fill('2');
      await lineHeight.press('Enter');
      await page.keyboard.press('Escape');
    });
    await expect(editor(page)).toBeFocused();
    const [first, second] = await paragraphs(page, ID);
    expect(first).toEqual({ dir: 'auto', align: 'start', runs: [{ text: 'שלום עולם' }] });
    expect(second).toMatchObject({
      dir: 'ltr',
      align: 'center',
      lineHeight: 2,
      list: { kind: 'number', level: 0 },
    });

    // A selection across both paragraphs changes both.
    await page.keyboard.press('Control+a');
    await row(page).locator('[data-align="end"]').click();
    expect((await paragraphs(page, ID)).map((p) => p.align)).toEqual(['end', 'end']);
  });

  test('with a caret, a character format applies to what is typed next', async ({ page }) => {
    await edit(page, ID);
    const before = await steps(page);
    await page.keyboard.type(' ab', { delay: 20 });
    // Setting the format changes no text, so it is no undo step; it ends the typing burst.
    await tool(page, 'מודגש').click();
    await expect(tool(page, 'מודגש')).toHaveAttribute('aria-pressed', 'true');
    expect(await steps(page)).toBe(before + 1);
    await page.keyboard.type('cd', { delay: 20 });
    expect(await steps(page)).toBe(before + 2);
    expect((await paragraphs(page, ID))[1]?.runs).toEqual([
      { text: 'Hello world ab' },
      { text: 'cd', marks: { weight: 700 } },
    ]);
    // Undo takes the bold text, and leaves the text typed before the format.
    await page.keyboard.press('Control+z');
    expect(await plain(page, ID)).toBe('שלום עולם\nHello world ab');
  });

  test('a format change is not merged into the typing around it', async ({ page }) => {
    await edit(page, ID);
    const before = await steps(page);
    await page.keyboard.type('!', { delay: 20 });
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Control+b');
    await move(page, 'End');
    await page.keyboard.type('?', { delay: 20 });
    // Typing, the format, typing: three steps, though all within the 650ms of one burst.
    expect(await steps(page)).toBe(before + 3);
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+z');
    expect(await plain(page, ID)).toBe('שלום עולם\nHello world!');
    expect(await marks(page)).toEqual([[undefined], [undefined]]);
  });

  test('undo of a format change shows in the editor and keeps the selection', async ({ page }) => {
    await editFirstLine(page);
    await page.keyboard.press('Control+b');
    const bold = editor(page).locator('p').first().locator('span');
    await expect(bold).toHaveCSS('font-weight', '700');
    await page.keyboard.press('Control+z');
    await expect(bold).toHaveCount(0);
    await expect(editor(page).locator('p').first()).toHaveText('שלום עולם');
    await expectStillEditing(page);
    await page.keyboard.press('Control+y');
    await expect(bold).toHaveCSS('font-weight', '700');
    await expectStillEditing(page);
  });

  test('the selection stays on show while a field or a popover has the focus', async ({ page }) => {
    await editFirstLine(page);
    const shown = editor(page).locator('[data-blurred-selection]');
    await expect(shown).toHaveCount(0);

    // A field of the row takes the focus; the selection is drawn as it was.
    const size = row(page).getByRole('textbox', { name: 'גודל גופן' });
    await size.click();
    await expect(shown.first()).toHaveText('שלום עולם');
    expect(await editingId(page)).toBe(ID);
    // Esc in the field gives the focus back without a change.
    await size.press('Escape');
    await expectStillEditing(page);
    await expect(shown).toHaveCount(0);

    // A popover: the colour picker.
    await tool(page, 'צבע הדגשה').click();
    await expect(page.getByTestId('color-area')).toBeVisible();
    await expect(shown.first()).toHaveText('שלום עולם');
    await page.getByRole('button', { name: 'הדגשה', exact: true }).click();
    // The text takes the colour while the picker is still open.
    expect((await marks(page))[0]).toEqual([{ highlight: { token: 'accent' } }]);
    await closePicker(page);
    await expectStillEditing(page);
    await expect(shown).toHaveCount(0);

    // Typing replaces exactly what was selected.
    await page.keyboard.type('היי');
    expect(await plain(page, ID)).toBe('היי\nHello world');
  });

  test('an empty line keeps the format it is given, and types in it', async ({ page }) => {
    await edit(page, ID);
    await page.keyboard.press('Enter');
    const size = row(page).getByRole('textbox', { name: 'גודל גופן' });
    await oneUndoStep(page, ID, async () => {
      await size.fill('60');
      await size.press('Enter');
    });
    await tool(page, 'נטוי').click();
    // The model keeps the format of an empty line on an empty run.
    expect((await paragraphs(page, ID))[2]?.runs).toEqual([
      { text: '', marks: { size: 60, italic: true } },
    ]);
    // The line is as tall as its text will be.
    const line = await editor(page).locator('p').nth(2).boundingBox();
    const stage = await page.getByTestId('stage-frame').boundingBox();
    expect(line!.height / (stage!.width / 1920)).toBeCloseTo(60 * 1.45, 0);

    await page.keyboard.type('גדול');
    expect((await paragraphs(page, ID))[2]?.runs).toEqual([
      { text: 'גדול', marks: { size: 60, italic: true } },
    ]);
    // Emptied again, the line still has its format.
    for (let i = 0; i < 4; i++) await page.keyboard.press('Backspace');
    expect((await paragraphs(page, ID))[2]?.runs).toEqual([
      { text: '', marks: { size: 60, italic: true } },
    ]);
    await expect(size).toHaveValue('60');
  });

  test('Enter carries the format of the line to the next one', async ({ page }) => {
    await edit(page, ID);
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Control+b');
    await move(page, 'Control+End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('x');
    expect((await paragraphs(page, ID))[2]?.runs).toEqual([{ text: 'x', marks: { weight: 700 } }]);
  });
});

test.describe('inserting a text box', () => {
  const texts = (page: Page) =>
    page.evaluate(() =>
      window.slidr!.bus.deck.slides[0]!.elements.filter((e) => e.type === 'text').map((e) => e.id),
    );

  test('the Text button of row A adds a box in the middle and starts editing it', async ({
    page,
  }) => {
    const before = await steps(page);
    await page.getByTestId('top-tools-a').getByRole('button', { name: 'טקסט' }).click();
    await expect(editor(page)).toBeFocused();
    const ids = await texts(page);
    expect(ids).toHaveLength(2);
    const id = ids[1]!;
    expect(await editingId(page)).toBe(id);
    expect(await steps(page)).toBe(before + 1);
    const added = await element(page, id);
    expect(added).toMatchObject({
      autoFit: 'growHeight',
      content: { paragraphs: [{ dir: 'auto', align: 'start', runs: [] }] },
    });
    // In the middle of the slide.
    expect(added.frame.x + added.frame.w / 2).toBe(960);
    expect(Math.abs(added.frame.y + added.frame.h / 2 - 540)).toBeLessThan(1);

    // The deck is Hebrew: the caret of the empty box starts on the right.
    await expect(editor(page).locator('p')).toHaveAttribute('dir', 'rtl');
    await page.keyboard.type('טקסט חדש');
    expect(await plain(page, id)).toBe('טקסט חדש');
    expect(await steps(page)).toBe(before + 2);
    await page.keyboard.press('Escape');
    // Undo takes the typing, then the box.
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+z');
    expect(await texts(page)).toEqual([ID]);
  });

  test('T inserts a text box; a box left empty is taken away again', async ({ page }) => {
    await page.getByTestId('stage-surface').focus();
    const before = await steps(page);
    await page.keyboard.press('t');
    await expect(editor(page)).toBeFocused();
    expect(await texts(page)).toHaveLength(2);
    // While typing, T is a letter.
    await page.keyboard.type('tt');
    expect(await texts(page)).toHaveLength(2);
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Escape');
    expect(await texts(page)).toEqual([ID]);
    // The box leaves no trace in the history, and neither does what was typed into it and
    // deleted again (`editor-text-new-box.spec.ts` has the rest of the cases).
    expect(await steps(page)).toBe(before);

    // The same with nothing typed at all.
    await page.keyboard.press('t');
    await expect(editor(page)).toBeFocused();
    await page.keyboard.press('Escape');
    expect(await texts(page)).toEqual([ID]);
    expect(await steps(page)).toBe(before);
  });
});

/* ---------------------------------------------------------------- how it looks */

const out = (name: string) =>
  fileURLToPath(new URL(`../test-results/text/${name}.png`, import.meta.url));

const themes = ['light', 'dark'] as const;
const languages = [
  { lang: 'he', dir: 'rtl' },
  { lang: 'en', dir: 'ltr' },
] as const;
const viewports = [
  { width: 1920, height: 1032 },
  { width: 1366, height: 768 },
] as const;

test.describe('row B for text, for the design gate', () => {
  for (const theme of themes) {
    for (const { lang, dir } of languages) {
      for (const viewport of viewports) {
        const name = `${theme}-${dir}-${viewport.width}`;
        test(`row B ${name}: nothing overflows`, async ({ page }) => {
          await page.setViewportSize(viewport);
          await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
          await page.addInitScript(
            (language) => localStorage.setItem('slidr.language', language),
            lang,
          );
          await page.goto('/');
          await expect(page.getByTestId('stage-frame')).toBeVisible();
          await addText(page, 'e_shot', [
            para('סיכום Sprint 14 (גרסה 2.3)'),
            para('ה-API החדש עלה ל-production ב-12.10.', { list: { kind: 'bullet', level: 0 } }),
          ]);
          await edit(page, 'e_shot');
          await setSelection(page, 1, 13);
          await page.keyboard.press('Control+b');
          await page.evaluate(() => document.fonts.ready);
          await page.waitForTimeout(250);

          // Every tool of the row is inside the row, at both widths.
          const bar = await row(page).boundingBox();
          const children = await row(page).evaluate((el) =>
            Array.from(el.children, (child) => {
              const rect = child.getBoundingClientRect();
              return [rect.left, rect.right];
            }),
          );
          for (const [left, right] of children) {
            expect(left).toBeGreaterThanOrEqual(bar!.x);
            expect(right).toBeLessThanOrEqual(bar!.x + bar!.width);
          }

          const tools = await page.getByTestId('top-tools-a').boundingBox();
          const clip = { x: bar!.x, y: tools!.y, width: bar!.width, height: 440 };
          await page.screenshot({ path: out(`row-b-${name}`), clip });

          const he = lang === 'he';
          const compact = viewport.width < 1500;
          const popovers = [
            ['more', he ? 'עוד עיצוב תווים' : 'More character formatting'],
            [
              'list',
              he ? (compact ? 'רשימה' : 'אפשרויות רשימה') : compact ? 'List' : 'List options',
            ],
            ['spacing', he ? 'ריווח' : 'Spacing'],
            ['box', he ? 'תיבת הטקסט' : 'Text box'],
            ['color', he ? 'צבע טקסט' : 'Text colour'],
            ['font', he ? 'גופן' : 'Font'],
          ] as const;
          for (const [key, label] of popovers) {
            await tool(page, label).click();
            await page.waitForTimeout(200);
            await page.screenshot({ path: out(`row-b-${name}-${key}`), clip });
            await page.keyboard.press('Escape');
            await expect(editor(page)).toBeFocused();
          }
        });
      }
    }
  }
});
