import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { HELD_BEYOND, Survey, type Found, type Seen } from './a11y-helpers';
import { addBoxes, openApp, select, THREE } from './arrange-helpers';
import { addChart } from './chart-helpers';
import { card } from './code-helpers';
import { importUntilCut, openForImport } from './import-helpers';
import { addElement, importPicture, line } from './objects-helpers';
import { addTable } from './table-helpers';
import { addText, edit, para } from './text-helpers';
import { addClip, testMedia } from './video-helpers';

/*
 * The accessibility audit (WG13-T06, UI-06, DSN-08): axe-core on the surfaces of the app, each in
 * the light and the dark scheme and in Hebrew and English, held to no fault of serious or critical
 * impact: names and roles of controls, contrast, `lang` and `dir`.
 *
 * A surface is the app brought to a state a person meets: a panel, the tools of a selection, an
 * open menu. What a surface opens (its menus, popovers, lists) is opened and audited too.
 *
 * A fault this finds is fixed in the app, not left out of the audit. A fault that is found and
 * not fixed is written in `OPEN` with its reason: a test holds its surfaces to exactly those and
 * no other, so a new fault fails it, and so does fixing one, until it is taken off the list.
 *
 * What axe-core does not judge, the same walk reads from the page (`beyond` in the helper), and
 * every surface is held to it too: nothing that answers the pointer and that the keyboard cannot
 * be on, no control that Tab and the arrows do not reach, none that hears a press and no key,
 * none named by the picture of a slide, no name on an element that cannot carry one. What stands
 * and is no fault is in `STANDS`, with why.
 *
 * Held elsewhere: focus kept in a layer and given back, and focus that can be seen, in
 * `a11y-focus.spec.ts`; the ways of the keyboard that this cannot see (a drag, a hover), in
 * `a11y-keyboard.spec.ts`; what a screen reader is told, in `a11y-reader.spec.ts`.
 */

/** A fault that is known and open: where, which rule, on what, and why it is still there. */
interface Open {
  surface: string | RegExp;
  rule: string;
  target?: string | RegExp;
  reason: string;
}

/** Known and open, with the reason for each. Empty is the aim. */
const OPEN: Open[] = [];

const isOpen = (fault: Found) =>
  OPEN.some(
    (open) =>
      open.rule === fault.rule &&
      (typeof open.surface === 'string'
        ? open.surface === fault.surface
        : open.surface.test(fault.surface)) &&
      (open.target === undefined ||
        (typeof open.target === 'string'
          ? open.target === fault.target
          : open.target.test(fault.target))),
  );

/** The faults as lines a person can act on. */
const lines = (faults: Found[]) =>
  faults
    .map(
      (f) =>
        `${f.surface}\n  [${f.impact}] ${f.rule}: ${f.help}\n  ${f.target}\n  ${f.html}\n  ${f.why}`,
    )
    .join('\n\n');

/** Something beyond axe-core's judgement that stands as it is, and why it is no fault. */
interface Stands {
  kind: Seen['kind'];
  what: RegExp;
  reason: string;
}

const STANDS: Stands[] = [
  {
    kind: 'pointer',
    what: /^span\[status\] 'Upscaling the picture/,
    reason:
      'Not a control: the progress of an upscale, with a tooltip that says the same words. The handlers are the tooltip\'s own. The progress is read as a status, and "Cancel" beside it is a button.',
  },
  {
    kind: 'pointer',
    what: /^div \.z-10 flex touch-none p-0\.5 select-none/,
    reason:
      'The bar of a scroll area. The area scrolls with the arrows, Page Up and Page Down while the keyboard is in it, and Tab brings into view whatever it stops at.',
  },
];

const stands = (thing: Seen) =>
  STANDS.some((entry) => entry.kind === thing.kind && entry.what.test(thing.what));

const DIR = 'test-results/a11y';

/**
 * Ends a test: what was found, less what is known and open, must be nothing; and every entry of
 * `OPEN` that names one of these surfaces must still be found, or it is stale. The whole finding
 * is also written beside the pictures of the design gate, for whoever reads a run.
 */
function conclude(survey: Survey, name: string, expectAtLeast: number): void {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(
    `${DIR}/audit-${name.replace(/[^a-z0-9]+/gi, '-')}.json`,
    JSON.stringify(
      { surfaces: survey.surfaces, found: survey.found, stuck: survey.stuck, seen: survey.seen },
      null,
      1,
    ),
  );
  // The test reached its surfaces: an audit of nothing would pass too.
  expect(survey.surfaces.length, 'surfaces audited').toBeGreaterThanOrEqual(expectAtLeast);
  expect(lines(survey.found.filter((fault) => !isOpen(fault))), 'accessibility faults').toBe('');
  const beyond = survey.seen.filter((thing) => HELD_BEYOND.includes(thing.kind) && !stands(thing));
  expect(
    beyond.map((t) => `${t.surface}\n  [${t.kind}] ${t.what}\n  ${t.detail}`).join('\n\n'),
    'beyond axe-core: the keyboard cannot reach it, or a screen reader is not told',
  ).toBe('');
}

const PANEL = '[data-testid="tool-panel"]';
const ROW_A = '[data-pane="tools"]';
const ROW_B = '[data-pane="context"]';

/** Opens a panel from the Activity Bar by its id. */
async function openPanel(page: Page, id: string) {
  const button = page.locator(`[data-testid="activity-bar"] button[data-panel="${id}"]`);
  if ((await button.getAttribute('aria-pressed')) !== 'true') await button.click();
  await expect(page.locator(PANEL)).toHaveAttribute('data-open', 'true');
  await expect(page.locator(`${PANEL} [data-panel="${id}"]`)).toBeVisible();
}

/** A slide with one element of every kind the Stage and row B know. */
async function fillSlide(page: Page) {
  await addBoxes(page, THREE);
  await addText(page, 'e_text', [para('Bees and flowers')], {
    frame: { x: 1100, y: 80, w: 700, h: 160 },
  });
  const assetId = await importPicture(page, 'picture.png', ['#2f5bea', '#f59e0b'], [1200, 800]);
  await addElement(page, {
    id: 'e_picture',
    type: 'image',
    frame: { x: 1200, y: 300, w: 480, h: 320 },
    assetId,
    fit: 'cover',
  });
  await addElement(page, line({ frame: { x: 200, y: 900, w: 480, h: 100 } }));
  await addTable(page, {
    texts: [
      ['a', 'b'],
      ['c', 'd'],
    ],
    frame: { x: 700, y: 820, w: 600, h: 160 },
  });
  await addChart(page, { frame: { x: 1350, y: 680, w: 500, h: 360 } });
  await addElement(page, card({ frame: { x: 60, y: 420, w: 300, h: 200 } }));
  const media = await testMedia(page);
  await addClip(page, 'video', media.video, { frame: { x: 420, y: 60, w: 320, h: 180 } });
  await addClip(page, 'audio', media.sound, { frame: { x: 420, y: 260, w: 320, h: 80 } });
  await page.evaluate(() => {
    const { bus, selection } = window.slidr!;
    bus.dispatch({
      type: 'element.group',
      slideId: selection.getState().currentSlideId!,
      elementIds: ['e_a', 'e_b'],
      groupId: 'e_group',
    });
    selection.getState().clearSelection();
  });
}

/** The selections row B has tools for: its name, and how the app is brought to it. */
const SELECTIONS: { name: string; kind: string; make: (page: Page) => Promise<void> }[] = [
  { name: 'nothing selected', kind: 'none', make: (page) => select(page, []) },
  { name: 'a text box', kind: 'text', make: (page) => select(page, ['e_text']) },
  { name: 'text being edited', kind: 'text', make: (page) => edit(page, 'e_text') },
  { name: 'an image', kind: 'image', make: (page) => select(page, ['e_picture']) },
  { name: 'a shape', kind: 'shape', make: (page) => select(page, ['e_c']) },
  { name: 'a line', kind: 'shape', make: (page) => select(page, ['e_line']) },
  { name: 'a table', kind: 'table', make: (page) => select(page, ['e_table']) },
  { name: 'a chart', kind: 'chart', make: (page) => select(page, ['e_chart']) },
  { name: 'a video', kind: 'media', make: (page) => select(page, ['e_video']) },
  { name: 'a sound', kind: 'media', make: (page) => select(page, ['e_audio']) },
  { name: 'an html object', kind: 'html', make: (page) => select(page, ['e_html']) },
  { name: 'a group', kind: 'group', make: (page) => select(page, ['e_group']) },
  {
    name: 'several objects',
    kind: 'multiple',
    make: (page) => select(page, ['e_text', 'e_c']),
  },
];

/*
 * Every surface is reached once, in English and the light scheme, and judged in the four
 * combinations where it stands: the app changes its language without a reload, and follows the
 * scheme of the system. So a test here is one page load, however many surfaces it walks.
 */
const IN_ALL = { languages: ['en', 'he'], schemes: ['light', 'dark'] } as const;
const open = (page: Page) => openApp(page, { lang: 'en', theme: 'light' });

test('the editor as it opens', async ({ page }) => {
  await open(page);
  const survey = new Survey(page, IN_ALL);
  await survey.audit('the editor as it opens');
  conclude(survey, 'editor', 1);
});

test('every panel of the Activity Bar, tab by tab, on a slide with every kind of object', async ({
  page,
}) => {
  test.setTimeout(8 * 60_000);
  await open(page);
  await fillSlide(page);
  await page.evaluate(() => {
    const { bus, selection } = window.slidr!;
    const slideId = selection.getState().currentSlideId!;
    const step = (id: string, elementId: string, category: string) => ({
      id,
      elementId,
      trigger: 'onClick',
      category,
      preset: 'fade',
      duration: 400,
      delay: 0,
      easing: 'ease',
    });
    bus.batch([
      {
        type: 'slide.setTimeline',
        slideId,
        timeline: [step('a_1', 'e_text', 'entrance'), step('a_2', 'e_c', 'exit')],
      },
      {
        type: 'slide.update',
        slideId,
        patch: {
          transition: { type: 'fade', duration: 400, easing: 'ease', advance: { onClick: true } },
        },
      },
    ] as never);
  });
  await select(page, ['e_text']);
  const survey = new Survey(page, IN_ALL);
  const ids = await page
    .locator('[data-testid="activity-bar"] button[data-panel]')
    .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('data-panel') ?? ''));
  // Eleven since the three AI tools became one chat (ADR-072); thirteen before it.
  expect(ids.length).toBeGreaterThanOrEqual(11);
  for (const id of ids) {
    // The Code panel is about an html object; every other panel, about the text box.
    await select(page, [id === 'code' ? 'e_html' : 'e_text']);
    await openPanel(page, id);
    const tabs = page.locator(`${PANEL} [role="tab"]`);
    const count = await tabs.count();
    if (count === 0) {
      await survey.audit(`panel ${id}`, { within: PANEL });
      await survey.popups(PANEL, `panel ${id}`);
      continue;
    }
    for (let i = 0; i < count; i++) {
      await tabs.nth(i).click();
      await expect(tabs.nth(i)).toHaveAttribute('aria-selected', 'true');
      const name = `panel ${id}, tab ${i + 1}`;
      await survey.audit(name, { within: PANEL });
      await survey.popups(PANEL, name);
    }
  }
  conclude(survey, 'panels', 13);
});

test('row A, and what it opens', async ({ page }) => {
  test.setTimeout(3 * 60_000);
  await open(page);
  const survey = new Survey(page, IN_ALL);
  await survey.audit('row A', { within: ROW_A });
  await survey.popups(ROW_A, 'row A');
  conclude(survey, 'row-a', 6);
});

test('row B for every kind of selection, and what its tools open', async ({ page }) => {
  test.setTimeout(15 * 60_000);
  await open(page);
  await fillSlide(page);
  const survey = new Survey(page, IN_ALL);
  for (const { name, kind, make } of SELECTIONS) {
    await make(page);
    await expect(page.locator(ROW_B), name).toHaveAttribute('data-selection', kind);
    await survey.audit(`row B, ${name}`, { within: ROW_B });
    await survey.popups(ROW_B, `row B, ${name}`);
    // Out of whatever the selection was being edited in, for the next one.
    await page.keyboard.press('Escape');
  }
  conclude(survey, 'row-b', SELECTIONS.length);
});

test('row B at 1366, where the tools of a text box and of several objects fold', async ({
  page,
}) => {
  test.setTimeout(6 * 60_000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await open(page);
  await fillSlide(page);
  const survey = new Survey(page, IN_ALL);
  for (const { name, kind, make } of SELECTIONS.filter(({ name: n }) =>
    ['a text box', 'several objects'].includes(n),
  )) {
    await make(page);
    await expect(page.locator(ROW_B), name).toHaveAttribute('data-selection', kind);
    await survey.audit(`row B at 1366, ${name}`, { within: ROW_B });
    await survey.popups(ROW_B, `row B at 1366, ${name}`);
  }
  conclude(survey, 'row-b-1366', 2);
});

/* ---------------------------------------------------------------- states a surface has to be brought to */

/** Opens the app with the scripted agent on a script, in English and the light scheme. */
async function openWithAgent(page: Page, script: string, speed = 0) {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(
    ([language, agent]) => {
      localStorage.setItem('slidr.language', language!);
      localStorage.setItem('slidr.agent', agent!);
    },
    ['en', JSON.stringify({ harnessId: 'mock', model: script, mockSpeed: speed })],
  );
  await page.goto('/');
  await expect(page.getByTestId('stage-frame')).toBeVisible();
}

/** Sends a message in the chat that is open, and waits for the turn it starts to end. */
async function say(page: Page, message: string) {
  const turns = page.getByTestId('chat-assistant');
  const before = await turns.count();
  await page.getByTestId('chat-input').fill(message);
  await page.getByTestId('chat-input').press('Enter');
  await expect(turns.nth(before)).toHaveAttribute('data-outcome', /.+/, { timeout: 30_000 });
  await expect(page.getByTestId('chat-working')).toHaveCount(0);
}

/** Opens an AI tool on one of its tabs: the first is the chat, the second the actions. */
async function openTool(page: Page, id: string, tab: 0 | 1) {
  await openPanel(page, id);
  await page.locator(`${PANEL} [role="tab"]`).nth(tab).click();
}

test('the welcome screen', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('slidr.language', 'en'));
  await page.goto('/?welcome');
  const welcome = page.getByTestId('welcome');
  await expect(welcome).toBeVisible();
  const survey = new Survey(page, IN_ALL);
  await survey.audit('the welcome screen');
  // With every template shown, not only the first row of them.
  const more = welcome.locator('button[aria-expanded="false"]');
  if ((await more.count()) > 0) {
    await more.first().click();
    await survey.audit('the welcome screen, all templates');
  }
  conclude(survey, 'welcome', 2);
});

test('the dialogs: the shortcut map and its editor, export, a question', async ({ page }) => {
  test.setTimeout(4 * 60_000);
  await open(page);
  const survey = new Survey(page, IN_ALL);

  await page.keyboard.press('Control+/');
  const map = page.getByTestId('shortcut-map');
  await expect(map).toBeVisible();
  await survey.audit('the shortcut map');
  // A shortcut that waits for its new key, and one that was offered a key another has.
  const binding = map.locator('[data-binding="arrange.group"]');
  await binding.click();
  await expect(binding).toHaveAttribute('data-state', 'listening');
  await survey.audit('the shortcut map, a shortcut waiting for its key');
  await page.keyboard.press('Control+D');
  await expect(page.getByTestId('shortcut-conflict')).toBeVisible();
  await survey.audit('the shortcut map, a key that is taken');
  await page.keyboard.press('Escape');
  // A search that finds nothing.
  await map.getByRole('searchbox').fill('zzzz');
  await survey.audit('the shortcut map, nothing found');
  await page.keyboard.press('Escape');
  await expect(map).toBeHidden();

  await page.getByTestId('file-menu-trigger').click();
  await page.getByRole('menuitem', { name: 'Export HTML…' }).click();
  await expect(page.getByTestId('export-dialog')).toBeVisible();
  await survey.audit('the export dialog');
  await survey.popups('[data-testid="export-dialog"]', 'the export dialog');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('export-dialog')).toBeHidden();

  // A question of the app, as "unsaved changes" asks it.
  await page.evaluate(async (path) => {
    const dialogs = (await import(/* @vite-ignore */ path)) as {
      ask: (request: unknown) => Promise<string>;
    };
    void dialogs.ask({
      title: 'Save the changes to "Bees"?',
      body: 'If you do not save, the changes will be lost.',
      actions: [
        { id: 'cancel', label: 'Cancel', variant: 'ghost' },
        { id: 'discard', label: 'Do not save', variant: 'secondary' },
        { id: 'save', label: 'Save', variant: 'primary' },
      ],
      cancelId: 'cancel',
    });
  }, '/src/shell/dialogs.tsx');
  await expect(page.getByRole('dialog')).toBeVisible();
  await survey.audit('a question of the app');
  await page.keyboard.press('Escape');
  conclude(survey, 'dialogs', 6);
});

test('the menus of the Stage for every kind of selection, and the menu of the Filmstrip', async ({
  page,
}) => {
  test.setTimeout(8 * 60_000);
  await open(page);
  await fillSlide(page);
  const survey = new Survey(page, IN_ALL);
  const stage = page.getByTestId('stage-surface');
  for (const { name, make } of SELECTIONS.filter(({ name: n }) => n !== 'text being edited')) {
    await make(page);
    await stage.focus();
    await page.keyboard.press('Shift+F10');
    const menu = page.getByTestId('stage-menu');
    await expect(menu, name).toBeVisible();
    await survey.audit(`the Stage's menu, ${name}`, { within: '[data-testid="stage-menu"]' });
    await survey.popups('[data-testid="stage-menu"]', `the Stage's menu, ${name}`, 0);
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
  }
  await page.getByTestId('filmstrip').getByRole('listbox').focus();
  await page.keyboard.press('Shift+F10');
  await expect(page.getByTestId('slide-menu')).toBeVisible();
  await survey.audit("the Filmstrip's menu", { within: '[data-testid="slide-menu"]' });
  await survey.popups('[data-testid="slide-menu"]', "the Filmstrip's menu", 0);
  await page.keyboard.press('Escape');
  conclude(survey, 'menus', SELECTIONS.length);
});

test('find and replace, with matches and with none', async ({ page }) => {
  await open(page);
  await fillSlide(page);
  const survey = new Survey(page, IN_ALL);
  await page.getByTestId('stage-surface').focus();
  await page.keyboard.press('Control+H');
  const bar = page.getByTestId('find-bar');
  await expect(bar).toBeVisible();
  await survey.audit('the find bar, empty', { within: '[data-testid="find-bar"]' });
  await page.getByTestId('find-query').fill('Bees');
  await page.getByTestId('find-query').press('Enter');
  await survey.audit('the find bar, a match', { within: '[data-testid="find-bar"]' });
  await page.getByTestId('find-query').fill('zzzz');
  await survey.audit('the find bar, no match', { within: '[data-testid="find-bar"]' });
  await survey.popups('[data-testid="find-bar"]', 'the find bar');
  conclude(survey, 'find', 3);
});

test('the show: a slide, its controls, and its end', async ({ page }) => {
  await open(page);
  await fillSlide(page);
  const survey = new Survey(page, IN_ALL);
  await page.getByTestId('stage-surface').focus();
  await page.keyboard.press('F5');
  const show = page.getByTestId('present');
  await expect(show).toHaveAttribute('data-ready', 'true');
  await survey.audit('the show, a slide', { within: '[data-testid="present"]' });
  // The bar of the show comes up when the pointer moves.
  await page.mouse.move(600, 600);
  await page.mouse.move(640, 620);
  await expect(page.getByTestId('present-controls')).toBeVisible();
  await survey.audit('the show, with its controls', { within: '[data-testid="present"]' });
  // Past the last step of the only slide is the end of the show.
  for (let presses = 0; presses < 12; presses++) {
    if ((await show.getAttribute('data-ended')) === 'true') break;
    await page.keyboard.press('ArrowRight');
  }
  await expect(show).toHaveAttribute('data-ended', 'true');
  await survey.audit('the show, its end', { within: '[data-testid="present"]' });
  conclude(survey, 'show', 3);
});

test('the AI chat: its messages, what the agent did, and a turn at work', async ({ page }) => {
  test.setTimeout(4 * 60_000);
  // Slowly, so the turn can be met while it is at work.
  await openWithAgent(page, 'deck-build', 1);
  await openTool(page, 'ai', 0);
  const survey = new Survey(page, IN_ALL);
  await page.getByTestId('chat-input').fill('A deck about our plan for 2027');
  await page.getByTestId('chat-input').press('Enter');
  await expect(page.getByTestId('chat-working')).toBeVisible();
  await survey.audit('the chat, a turn at work', { within: PANEL });
  await expect(page.getByTestId('chat-assistant').first()).toHaveAttribute('data-outcome', /.+/, {
    timeout: 120_000,
  });
  await expect(page.getByTestId('chat-working')).toHaveCount(0);
  await survey.audit('the chat, a turn that ended', { within: PANEL });
  await survey.popups(PANEL, 'the chat');
  // The status bar says what the agent is doing: it is part of what a turn changes.
  await survey.audit('the status bar after a turn', { within: '[data-pane="status"]' });
  conclude(survey, 'chat', 3);
});

test('the outline of a deck, as it is offered and as it is edited', async ({ page }) => {
  test.setTimeout(3 * 60_000);
  await openWithAgent(page, 'outline');
  await openTool(page, 'ai', 0);
  const survey = new Survey(page, IN_ALL);
  await say(page, 'A deck about our plan for 2027');
  const outline = page.getByTestId('outline');
  await expect(outline).toHaveAttribute('data-state', 'open');
  await survey.audit('the outline card', { within: PANEL });
  await page.getByTestId('outline-edit').first().click();
  await survey.audit('the outline card, being edited', { within: PANEL });
  await survey.popups('[data-testid="outline"]', 'the outline card');
  conclude(survey, 'outline', 2);
});

test('the options of the gallery, with the sets offered before', async ({ page }) => {
  test.setTimeout(3 * 60_000);
  await openWithAgent(page, 'text-variations');
  await addText(page, 'e_title', [para('The plan for 2027')], {
    frame: { x: 160, y: 140, w: 1600, h: 200 },
    role: 'title',
  });
  await select(page, ['e_title']);
  await openTool(page, 'ai', 0);
  const survey = new Survey(page, IN_ALL);
  await say(page, 'Four other wordings for the title');
  await expect(page.getByTestId('option-card')).toHaveCount(4);
  await survey.audit('the gallery, one set', { within: PANEL });
  // A second set for the same element: the first is a step back.
  await page.evaluate(async (path) => {
    const { aiOf } = (await import(/* @vite-ignore */ path)) as {
      aiOf: (editor: unknown) => {
        gallery: {
          noteToolCall: (scope: unknown, name: string, input: unknown) => void;
          service: { present: (request: unknown) => Promise<void> };
        };
      };
    };
    const editor = window.slidr!;
    const slideId = editor.selection.getState().currentSlideId!;
    const { gallery } = aiOf(editor);
    gallery.noteToolCall({ kind: 'deck' }, 'ui_present_options', { elementId: 'e_title' });
    await gallery.service.present({
      kind: 'text',
      target: { slideId, elementId: 'e_title' },
      prompt: 'Two short wordings',
      options: ['Plan 2027', 'Where to in 2027'].map((text, i) => ({ label: `${i + 1}`, text })),
    });
  }, '/src/ai/runtime.ts');
  await expect(page.getByTestId('gallery-place')).toBeVisible();
  await survey.audit('the gallery, with a set before it', { within: PANEL });
  conclude(survey, 'gallery', 2);
});

test('the actions of the selection for every kind it has actions for', async ({ page }) => {
  test.setTimeout(6 * 60_000);
  await open(page);
  await fillSlide(page);
  const survey = new Survey(page, IN_ALL);
  for (const [name, id] of [
    ['a text box', 'e_text'],
    ['an image', 'e_picture'],
    ['a shape', 'e_c'],
    ['a table', 'e_table'],
    ['a chart', 'e_chart'],
  ] as const) {
    await select(page, [id]);
    await openTool(page, 'ai', 1);
    await expect(page.getByTestId('ai-actions')).toBeVisible();
    await survey.audit(`the actions of ${name}`, { within: PANEL });
    await survey.popups(PANEL, `the actions of ${name}`);
  }
  conclude(survey, 'actions', 5);
});

test('the design check with findings, and after a fix', async ({ page }) => {
  test.setTimeout(3 * 60_000);
  await open(page);
  // A slide with what the check finds: text out of its box, an object off the slide.
  await addText(page, 'e_small', [para('Small print '.repeat(40))], {
    frame: { x: 1700, y: 900, w: 400, h: 60 },
  });
  await addBoxes(page, [{ id: 'e_off', x: 1800, y: -80, w: 300, h: 200 }]);
  await openPanel(page, 'lint');
  const panel = page.getByTestId('design-check');
  await expect(panel).toBeVisible();
  const finding = panel.locator('[data-finding]').first();
  await expect(finding).toBeVisible();
  const survey = new Survey(page, IN_ALL);
  await survey.audit('the design check, with findings', { within: PANEL });
  // A finding opened: what to do about it, and the details under it.
  await finding.getByRole('button').first().click();
  await expect(finding).toHaveAttribute('data-open', 'true');
  await finding.locator('summary').click();
  await survey.audit('the design check, a finding opened to its details', { within: PANEL });
  await survey.popups(PANEL, 'the design check');
  await survey.audit('the status bar with findings', { within: '[data-pane="status"]' });
  conclude(survey, 'design-check', 3);
});

test('the tools of an image at work: a crop, and an upscale that is running', async ({ page }) => {
  test.setTimeout(4 * 60_000);
  await open(page);
  await fillSlide(page);
  const survey = new Survey(page, IN_ALL);
  await select(page, ['e_picture']);
  await page.getByTestId('stage-surface').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('stage-surface')).toHaveAttribute('data-cropping', 'e_picture');
  await survey.audit('row B, an image being cropped', { within: ROW_B });
  await survey.popups(ROW_B, 'row B, an image being cropped');
  await page.evaluate(() => window.slidr!.selection.getState().stopEditing());
  await expect(page.getByTestId('stage-surface')).not.toHaveAttribute('data-cropping');

  // An upscale that takes a while, met while it runs.
  await page.evaluate(async (path) => {
    const module = (await import(/* @vite-ignore */ path)) as {
      pageUpscaling: Record<string, unknown>;
    };
    Object.assign(module.pageUpscaling, { installed: true, tiles: 40, tileMs: 1000 });
  }, '/src/images/upscaler.ts');
  await select(page, ['e_picture']);
  await page.getByTestId('image-upscale').click();
  await page.getByRole('menuitem').first().click();
  await expect(page.getByTestId('image-upscale-work')).toBeVisible();
  await survey.audit('row B, an image being upscaled', { within: ROW_B });
  await survey.popups(ROW_B, 'row B, an image being upscaled');
  conclude(survey, 'image-work', 2);
});

test('a table from inside: the tools of its cells', async ({ page }) => {
  test.setTimeout(4 * 60_000);
  await open(page);
  await fillSlide(page);
  const survey = new Survey(page, IN_ALL);
  await select(page, ['e_table']);
  await page.getByTestId('stage-surface').focus();
  await page.keyboard.press('Enter');
  // The editor of the cell takes the keyboard a moment after it is drawn; an Esc sent by a
  // machine before that is the Stage's, and leaves the table instead of the text.
  await expect(
    page.locator('[data-testid="stage-surface"] td[data-cell-editing] [data-text-editor]'),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('stage-surface').locator('[data-table-selection]')).toBeVisible();
  await survey.audit('row B, the cells of a table', { within: ROW_B });
  await survey.popups(ROW_B, 'row B, the cells of a table');
  conclude(survey, 'table-cells', 1);
});

test('the window while its first document is on its way', async ({ page }) => {
  await open(page);
  // The state is another track's (the wrapper `app-body`, inert until the window's first
  // document has its workspace). Where that code is not there, there is nothing to judge.
  test.skip((await page.getByTestId('app-body').count()) === 0, 'no starting state in this code');
  await page.evaluate(() => window.slidr!.file.setState({ starting: true } as never));
  await expect(page.getByTestId('app-body')).toHaveAttribute('aria-busy', 'true');
  const survey = new Survey(page, IN_ALL);
  await survey.audit('the window while it starts');
  conclude(survey, 'starting', 1);
});

test('the import in the AI chat: an import that was cut short, and its report', async ({
  page,
}) => {
  test.setTimeout(5 * 60_000);
  await openForImport(page, { lang: 'en', script: 'import-cut' });
  const survey = new Survey(page, IN_ALL);
  await importUntilCut(page, { stop: false });
  await survey.audit('the import, an import to continue', { within: PANEL });
  await survey.popups(PANEL, 'the import, an import to continue');
  await page.getByTestId('import-report-toggle').click();
  await expect(page.getByTestId('import-report')).toBeVisible();
  await survey.audit('the import, the report and the source', { within: PANEL });
  conclude(survey, 'import', 2);
});
