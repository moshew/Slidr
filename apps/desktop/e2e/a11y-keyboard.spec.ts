import { expect, test, type Page } from '@playwright/test';
import { addElement, shape } from './objects-helpers';
import { addText, edit, element, para, select } from './text-helpers';

/*
 * The keyboard alone (WG13-T06, UI-06): the ways that the walk of the audit cannot see, because
 * what the pointer does there is a hover or a second press and not a control. The audit itself
 * holds every surface to "nothing answers the pointer that the keyboard cannot be on"
 * (`a11y-audit.spec.ts`); the keys of the Stage, of a table and of the strip have specs of
 * their own (`a11y-stage-keys`, `a11y-table-keys`, `a11y-filmstrip`, `a11y-panes`).
 *
 * Every test here presses keys only, from the moment the app is set up.
 */

const surface = (page: Page) => page.getByTestId('stage-surface');
const rowB = (page: Page) => page.getByTestId('top-tools-b');

/** The accessible name of what has the keyboard. */
const at = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    return el?.getAttribute('aria-label') ?? el?.textContent?.trim() ?? '';
  });

/** Presses Tab until the keyboard is on the control of that name; fails if it never is. */
async function tabTo(page: Page, name: string | RegExp, limit = 45): Promise<void> {
  const is = (label: string) => (typeof name === 'string' ? label === name : name.test(label));
  for (let presses = 0; presses < limit; presses++) {
    if (is(await at(page))) return;
    await page.keyboard.press('Tab');
  }
  expect(await at(page), `Tab never reached "${String(name)}"`).toMatch(name);
}

/** An element of the deck as the model holds it, as text: whatever kind it is. */
const held = (page: Page, id: string) =>
  page.evaluate((elementId) => {
    const all = window.slidr!.bus.deck.slides.flatMap((slide) => slide.elements);
    return JSON.stringify(all.find((one) => one.id === elementId) ?? null);
  }, id);

async function open(page: Page) {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('slidr.language', 'en'));
  await page.goto('/');
  await expect(page.getByTestId('stage-frame')).toBeVisible();
}

test('the text of a shape gets a link and an effect without the pointer', async ({ page }) => {
  await open(page);
  await addElement(page, shape('rect', { id: 'e_shape' }));
  await page.evaluate(() => window.slidr!.selection.getState().selectElements([]));

  // To the Stage, to the shape, into its text.
  await page.keyboard.press('F6');
  await expect(surface(page)).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  const editor = surface(page).locator('[data-text-editor]');
  await expect(editor).toBeFocused();
  await page.keyboard.type('Bees');

  // A link on all of it: Ctrl+K opens the link at the address field.
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.type('https://example.com/bees');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(editor).toBeFocused();
  await expect.poll(() => held(page, 'e_shape')).toContain('https://example.com/bees');

  // An effect: the pane key reaches the tools of the text, Tab the tool, and the arrows and
  // Space work it. An outline, which the text had none of.
  await page.keyboard.press('Shift+F6');
  expect(
    await page.evaluate(() =>
      document.activeElement?.closest('[data-pane]')?.getAttribute('data-pane'),
    ),
  ).toBe('context');
  await tabTo(page, 'Text effects');
  await page.keyboard.press('Enter');
  const effects = page.getByRole('dialog');
  await expect(effects).toBeVisible();
  // What opens takes the keyboard a moment after it is drawn.
  await expect
    .poll(() => page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]'))))
    .toBe(true);
  await tabTo(page, 'Fill', 4);
  await page.keyboard.press('ArrowRight');
  await expect(effects.getByRole('tab', { name: 'Outline' })).toHaveAttribute(
    'data-state',
    'active',
  );
  // The panel of the tab, then its switch: off is where the keyboard lands, on is beside it.
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(effects.getByRole('radio').first()).toBeFocused();
  await page.keyboard.press('ArrowRight');
  // The arrow moves the keyboard a moment after the key; a machine's Space would beat it there.
  await expect(effects.getByRole('radio').nth(1)).toBeFocused();
  await page.keyboard.press('Space');
  await expect.poll(() => held(page, 'e_shape')).toContain('text-stroke');

  // Esc gives the keyboard back to the tool that opened the effects: it was reached with the
  // keyboard, so it keeps it and Tab goes on to the next tool (the rule of the tool rows). The
  // pane key goes back to the text, where typing goes on.
  await page.keyboard.press('Escape');
  if ((await effects.count()) > 0) await page.keyboard.press('Escape');
  await expect(effects).toHaveCount(0);
  expect(await at(page)).toBe('Text effects');
  await page.keyboard.press('F6');
  await expect(editor).toBeFocused();
});

test('the style of a paragraph, from its menu in row B, without the pointer', async ({ page }) => {
  await open(page);
  await addText(page, 'e_text', [para('Bees')], { frame: { x: 200, y: 200, w: 800, h: 200 } });
  await edit(page, 'e_text');
  await page.keyboard.press('Shift+F6');
  await tabTo(page, /^Text style/);
  const before = await at(page);
  await page.keyboard.press('Enter');
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  // A menu opened with a key puts the keyboard on its first item, a moment after it is drawn.
  const items = menu.getByRole('menuitemradio');
  await expect(items.first()).toBeFocused();
  // Another style than the one it has: the first item of the menu, or the one after it.
  if ((await items.first().getAttribute('aria-checked')) === 'true') {
    await page.keyboard.press('ArrowDown');
    await expect(items.nth(1)).toBeFocused();
  }
  await page.keyboard.press('Enter');
  await expect(menu).toHaveCount(0);
  await expect
    .poll(() =>
      rowB(page)
        .getByRole('button', { name: /^Text style/ })
        .getAttribute('aria-label'),
    )
    .not.toBe(before);
  // The keyboard is not lost. Where it is, is the rule of the two rows and not this test's: on
  // the tool that was pressed, so that Tab goes on along the row, or back in the text.
  expect(
    await page.evaluate(() =>
      document.activeElement?.closest('[data-pane]')?.getAttribute('data-pane'),
    ),
  ).toMatch(/^(context|stage)$/);
});

test('an option of the gallery shows on the slide while the keyboard is on it, and Enter takes it', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(
    (agent) => {
      localStorage.setItem('slidr.language', 'en');
      localStorage.setItem('slidr.agent', agent);
    },
    JSON.stringify({ harnessId: 'mock', model: 'text-variations', mockSpeed: 0 }),
  );
  await page.goto('/');
  await expect(page.getByTestId('stage-frame')).toBeVisible();
  await addText(page, 'e_title', [para('The plan for 2027')], {
    frame: { x: 160, y: 140, w: 1600, h: 200 },
    role: 'title',
  });
  await select(page, 'e_title');
  // The chat is the panel the app opens on (ADR-072), and Enter on the button of the open panel
  // closes it: the button is pressed only when the panel is not the one that shows.
  await page.locator('[data-testid="activity-bar"] button[data-panel="ai"]').focus();
  if ((await page.getByTestId('chat-input').count()) === 0) await page.keyboard.press('Enter');
  await expect(page.getByTestId('tool-panel')).toHaveAttribute('data-open', 'true');
  const input = page.getByTestId('chat-input');
  await input.focus();
  await expect(input).toBeFocused();
  await page.keyboard.type('Four other wordings for the title');
  await page.keyboard.press('Enter');
  const cards = page.getByTestId('option-card');
  await expect(cards).toHaveCount(4);
  await expect(page.getByTestId('chat-working')).toHaveCount(0);

  // Tab from the field of the chat, back to the options above it.
  const onStage = surface(page).locator('[data-element-id="e_title"]');
  await expect(onStage).toHaveText('The plan for 2027');
  for (
    let presses = 0;
    presses < 20 && !(await cards.nth(1).evaluate((n) => n === document.activeElement));
    presses++
  ) {
    await page.keyboard.press('Shift+Tab');
  }
  await expect(cards.nth(1)).toBeFocused();
  // What the pointer gets by hovering: the option, drawn on the slide in place of what is there.
  await expect(surface(page)).toHaveAttribute('data-previewing', /.+/);
  await expect(onStage).not.toHaveText('The plan for 2027');
  const shown = (await onStage.textContent()) ?? '';
  // Moving off it puts the slide back.
  await page.keyboard.press('Shift+Tab');
  await expect(cards.nth(0)).toBeFocused();
  await expect(onStage).not.toHaveText(shown);
  // Enter takes the option the keyboard is on.
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(cards.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect
    .poll(async () =>
      (await element(page, 'e_title'))
        .content!.paragraphs.map((p) => p.runs.map((r) => r.text).join(''))
        .join('\n'),
    )
    .toBe(shown);
});
