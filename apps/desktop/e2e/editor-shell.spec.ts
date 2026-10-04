import { expect, test, type Page } from '@playwright/test';
import { addBoxes, openApp, select, selected, THREE, undo, undoSteps } from './arrange-helpers';

/*
 * The shell's P1 work (WG3-T07, T09, T11): the shortcut map (UI-06), the welcome screen (DOC-05),
 * the speaker notes panel, the split Present button, and a key that a shortcut did not take.
 */

const map = (page: Page) => page.getByTestId('shortcut-map');
const row = (page: Page, id: string) => map(page).locator(`[data-shortcut="${id}"]`);
const welcome = (page: Page) => page.getByTestId('welcome');
const stage = (page: Page) => page.getByTestId('stage-surface');

async function fileItem(page: Page, name: string) {
  await page.getByTestId('top-tools-a').getByRole('button', { name: 'קובץ' }).click();
  return page.getByRole('menuitem').filter({ has: page.getByText(name, { exact: true }) });
}

/* ---------------------------------------------------------------- the shortcut map */

test('Ctrl+/ opens the shortcut map, with every section and the keys of Appendix A', async ({
  page,
}) => {
  await openApp(page);
  await stage(page).focus();
  await page.keyboard.press('Control+/');
  await expect(map(page)).toBeVisible();
  const sections = await map(page)
    .locator('[data-shortcut-section]')
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-shortcut-section')));
  expect(sections).toEqual([
    'file',
    'edit',
    'insert',
    'text',
    'arrange',
    'table',
    'slides',
    'view',
    'ai',
    'present',
  ]);
  // Appendix A, as the app registers it: the keys are read from the registrations.
  const expected: [string, string][] = [
    ['shell.undo', 'Ctrl Z'],
    ['shell.save', 'Ctrl S'],
    ['shell.saveAs', 'Ctrl Shift S'],
    ['arrange.duplicate', 'Ctrl D'],
    ['arrange.group', 'Ctrl G'],
    ['arrange.ungroup', 'Ctrl Shift G'],
    ['arrange.order.forward', 'Ctrl ]'],
    ['arrange.order.backward', 'Ctrl ['],
    ['arrange.newSlide', 'Ctrl M'],
    ['text.insert', 'T'],
    ['shell.zoomFit', 'Ctrl 0'],
    ['present.fromStart', 'F5'],
    ['present.fromCurrent', 'Shift F5'],
    ['shell.ai.deck', 'Ctrl 1'],
    ['shell.ai.slide', 'Ctrl 2'],
    ['shell.ai.object', 'Ctrl 3'],
    ['ai.focusChat', 'Ctrl L'],
    ['text.direction', 'Ctrl Shift X'],
  ];
  for (const [id, keys] of expected) {
    const shown = await row(page, id)
      .locator('kbd')
      .evaluateAll((caps) => caps.map((c) => c.textContent).join(' '));
    expect(shown, id).toContain(keys);
  }
  // Redo is one line with both of its keys.
  await expect(map(page).locator('[data-shortcut^="shell.redo"]')).toHaveCount(1);

  await page.keyboard.press('Escape');
  await expect(map(page)).toBeHidden();
});

test('the map is searched by what a key does and by the key itself', async ({ page }) => {
  await openApp(page);
  await (await fileItem(page, 'קיצורי מקלדת')).click();
  await expect(map(page)).toBeVisible();
  const search = map(page).getByRole('searchbox');
  await expect(search).toBeFocused();

  await search.fill('קיבוץ');
  await expect(map(page).locator('[data-shortcut]')).toHaveCount(1);
  await expect(row(page, 'arrange.group')).toBeVisible();

  await search.fill('f5');
  await expect(row(page, 'present.fromStart')).toBeVisible();
  await expect(row(page, 'arrange.group')).toHaveCount(0);

  await search.fill('אין דבר כזה בכלל');
  await expect(map(page).getByRole('status')).toBeVisible();
});

test('the map is in English in the English UI', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  await stage(page).focus();
  await page.keyboard.press('Control+/');
  await expect(row(page, 'arrange.group')).toContainText('Group');
  await expect(map(page).locator('[data-shortcut-section="arrange"]')).toHaveText(
    'Arrange objects',
  );
});

/* ---------------------------------------------------------------- shortcuts */

test('zoom in and out from the keyboard', async ({ page }) => {
  await openApp(page);
  await stage(page).focus();
  const zoom = () => page.getByTestId('status-zoom').textContent();
  expect(await zoom()).toBe('64%');
  await page.keyboard.press('Control+=');
  expect(await zoom()).toBe('80%');
  await page.keyboard.press('Control+-');
  await page.keyboard.press('Control+-');
  expect(await zoom()).toBe('51%');
  await page.keyboard.press('Control+0');
  expect(await zoom()).toBe('64%');
});

test('a plain key that no shortcut took still does what it does', async ({ page }) => {
  await openApp(page);
  // A shortcut on Enter that has nothing to act on, as the chart area once had (ADR-048).
  await page.evaluate(async (path) => {
    const registry = (await import(/* @vite-ignore */ path)) as {
      registerShortcut: (shortcut: unknown) => void;
    };
    registry.registerShortcut({ id: 't.enter', keys: 'Enter', run: () => false });
  }, '/src/shell/registry.ts');
  await page.getByTestId('top-tools-a').getByRole('button', { name: 'קובץ' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu')).toBeVisible();
});

test('a character typed with AltGr is text, not a shortcut', async ({ page }) => {
  await openApp(page);
  await stage(page).focus();
  // On Windows AltGr reports Ctrl and Alt both. AltGr+C is a letter on a Polish layout, and must
  // not be the Ctrl+Alt+C that picks up the format of a text.
  const taken = (altGraph: boolean) =>
    page.evaluate((withAltGraph) => {
      const event = new KeyboardEvent('keydown', {
        key: withAltGraph ? 'ć' : 'c',
        code: 'KeyC',
        ctrlKey: true,
        altKey: true,
        modifierAltGraph: withAltGraph,
        bubbles: true,
        cancelable: true,
      });
      document.activeElement?.dispatchEvent(event);
      return event.defaultPrevented;
    }, altGraph);
  expect(await taken(false)).toBe(true);
  expect(await taken(true)).toBe(false);
});

/* ---------------------------------------------------------------- Present */

test('"Present" is a split button: the arrow offers the two ways to start', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const editor = window.slidr!;
    editor.bus.dispatch({ type: 'slide.add', slide: { id: 's_two', elements: [], timeline: [] } });
    editor.selection.getState().setCurrentSlide('s_two');
  });
  const button = page.getByTestId('present-button');
  await button.getByRole('button', { name: 'מאיפה להתחיל' }).click();
  const menu = page.getByTestId('present-menu');
  await expect(menu.getByRole('menuitem')).toHaveCount(2);
  await menu.getByRole('menuitem').filter({ hasText: 'הצגה מההתחלה' }).click();
  const show = page.getByTestId('present');
  await expect(show).toBeVisible();
  // From the start: the first slide is the one shown, whatever slide was current.
  await expect(show).toHaveAttribute('data-slide', '0');
  await page.keyboard.press('Escape');
  await expect(show).toHaveCount(0);

  // The show ended on the first slide, and the editor is on it now: back to the second.
  await page.evaluate(() => window.slidr!.selection.getState().setCurrentSlide('s_two'));
  await button.getByRole('button', { name: 'מאיפה להתחיל' }).click();
  await menu.getByRole('menuitem').filter({ hasText: 'הצגה מהשקף הנוכחי' }).click();
  await expect(show).toHaveAttribute('data-slide', '1');
  await page.keyboard.press('Escape');
});

/* ---------------------------------------------------------------- speaker notes */

const notes = (page: Page) => page.getByTestId('notes-field');
const slideNotes = (page: Page, index = 0) =>
  page.evaluate(
    (i) =>
      (
        window.slidr!.bus.deck.slides[i] as unknown as {
          notes?: { paragraphs: { runs: { text: string; marks?: object }[] }[] };
        }
      ).notes,
    index,
  );

test('the Notes panel writes the notes of the current slide, a burst of typing as one step', async ({
  page,
}) => {
  await openApp(page);
  await page.getByTestId('activity-bar').locator('[data-panel="notes"]').click();
  await expect(notes(page)).toBeVisible();
  const steps = await undoSteps(page);
  await notes(page).click();
  await page.keyboard.type('לפתוח בשאלה');
  await page.keyboard.press('Enter');
  await page.keyboard.type('שלוש נקודות');
  expect((await slideNotes(page))!.paragraphs.map((p) => p.runs[0]?.text)).toEqual([
    'לפתוח בשאלה',
    'שלוש נקודות',
  ]);
  expect(await undoSteps(page)).toBe(steps + 1);

  // Another slide has its own notes; coming back shows the first slide's again.
  await page.evaluate(() => {
    const editor = window.slidr!;
    editor.bus.dispatch({ type: 'slide.add', slide: { id: 's_two', elements: [], timeline: [] } });
    editor.selection.getState().setCurrentSlide('s_two');
  });
  await expect(notes(page)).toHaveValue('');
  const first = await page.evaluate(() => window.slidr!.bus.deck.slides[0]!.id);
  await page.evaluate((id) => window.slidr!.selection.getState().setCurrentSlide(id), first);
  await expect(notes(page)).toHaveValue('לפתוח בשאלה\nשלוש נקודות');

  // Emptying the field removes the notes.
  await notes(page).fill('');
  expect(await slideNotes(page)).toBeUndefined();
  await undo(page);
  await expect(notes(page)).toHaveValue('לפתוח בשאלה\nשלוש נקודות');
});

test('notes the agent wrote keep their emphasis where the user did not type', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const editor = window.slidr!;
    const slideId = editor.selection.getState().currentSlideId!;
    editor.bus.dispatch({
      type: 'slide.update',
      slideId,
      patch: {
        notes: {
          paragraphs: [
            {
              dir: 'auto',
              align: 'start',
              runs: [{ text: 'להדגיש את ' }, { text: 'המספר', marks: { weight: 700 } }],
            },
            { dir: 'auto', align: 'start', runs: [{ text: 'ולסיים' }] },
          ],
        },
      },
    });
  });
  await page.getByTestId('activity-bar').locator('[data-panel="notes"]').click();
  await expect(notes(page)).toHaveValue('להדגיש את המספר\nולסיים');
  await notes(page).click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' בשאלה');
  const written = (await slideNotes(page))!;
  expect(written.paragraphs[0]!.runs[1]).toEqual({ text: 'המספר', marks: { weight: 700 } });
  expect(written.paragraphs[1]!.runs).toEqual([{ text: 'ולסיים בשאלה' }]);
});

/* ---------------------------------------------------------------- the welcome screen */

async function openWelcome(page: Page, lang: 'he' | 'en' = 'he') {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript((language) => localStorage.setItem('slidr.language', language), lang);
  await page.goto('/?welcome');
  await expect(welcome(page)).toBeVisible();
}

test('a plain page starts in the editor, and the welcome screen shows when it is asked for', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('stage-frame')).toBeVisible();
  await expect(welcome(page)).toHaveCount(0);

  await openWelcome(page);
  await expect(page.getByTestId('stage-frame')).toHaveCount(0);
  await expect(page.getByTestId('title-bar')).toBeVisible();
  // Without storage there are no files: "open" waits for the app itself.
  await expect(page.getByTestId('welcome-open')).toBeDisabled();
});

test('an empty deck leads to the editor', async ({ page }) => {
  await openWelcome(page);
  await page.getByTestId('welcome-blank').click();
  await expect(welcome(page)).toHaveCount(0);
  await expect(page.getByTestId('stage-frame')).toBeVisible();
});

test('"with AI" leads to the chat of the deck tool, ready for typing', async ({ page }) => {
  await openWelcome(page);
  await page.getByTestId('welcome-ai').click();
  await expect(page.getByTestId('stage-frame')).toBeVisible();
  await expect(page.locator('[data-panel="ai.deck"]').first()).toBeVisible();
  await expect(page.getByTestId('chat-input')).toBeFocused();
});

test('a template starts a deck that is set in it', async ({ page }) => {
  await openWelcome(page);
  const cards = welcome(page).locator('[data-welcome-template]');
  await expect(cards).toHaveCount(3);
  const id = await cards.nth(1).getAttribute('data-welcome-template');
  await cards.nth(1).click();
  await expect(page.getByTestId('stage-frame')).toBeVisible();
  const deck = await page.evaluate(() => {
    const { theme, slides, layouts } = window.slidr!.bus.deck;
    return { theme: theme.id, slides: slides.length, layouts: layouts.length };
  });
  expect(deck.theme).toBe(id);
  expect(deck.slides).toBe(1);
  expect(deck.layouts).toBeGreaterThan(3);
});

test('on the welcome screen only the File keys answer, and the File menu comes back to it', async ({
  page,
}) => {
  await openWelcome(page);
  // T would add a text box to a deck nobody is looking at.
  const before = await page.evaluate(() => window.slidr!.bus.deck.slides[0]!.elements.length);
  await page.keyboard.press('t');
  expect(await page.evaluate(() => window.slidr!.bus.deck.slides[0]!.elements.length)).toBe(before);
  await page.keyboard.press('Control+/');
  await expect(map(page)).toBeVisible();
  await page.keyboard.press('Escape');
  // Ctrl+N is a way in, like the cards.
  await page.keyboard.press('Control+n');
  await expect(page.getByTestId('stage-frame')).toBeVisible();

  await (await fileItem(page, 'מסך הפתיחה')).click();
  await expect(welcome(page)).toBeVisible();
});

test('the editor behind the welcome screen is the one the screen leads to', async ({ page }) => {
  await openApp(page);
  await addBoxes(page, THREE);
  await select(page, ['e_a']);
  await (await fileItem(page, 'מסך הפתיחה')).click();
  await expect(welcome(page)).toBeVisible();
  // The deck has changes: an empty deck asks before it replaces them.
  await page.getByTestId('welcome-blank').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'ביטול' }).click();
  await expect(welcome(page)).toBeVisible();
  expect(await selected(page)).toEqual(['e_a']);
});
