/**
 * What a turn of the agent may do to the deck beyond what its calls ask for, with the app's own
 * AI runtime (`aiOf(editor)`: the Deck API, its services, and the layouts that follow a deck's
 * direction), the scripted harness of a plain page, and the real conversion engine. The agent
 * is converting a slide of an English deck on a template when the deck is turned, or replaced.
 */
import { deckFromTemplate } from '@slidr/templates';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { aiOf } from '../ai/runtime';
import { createEditor } from '../shell/editor';
import { turnDeck } from '../templates/actions';
import { library } from '../templates/app';
import type { ChatThread } from './agentService';

beforeAll(async () => {
  await page.viewport(1920, 1080);
});

beforeEach(() => {
  // The scripted harness, on the script that builds an opening slide from HTML, at full speed.
  localStorage.setItem(
    'slidr.agent',
    JSON.stringify({ harnessId: 'mock', model: 'deck-build', mockSpeed: 0, qualityGate: false }),
  );
});

/** An editor on a left-to-right deck of a built-in template, and its deck chat at work. */
async function converting() {
  const editor = createEditor({ lang: 'en', storage: null });
  const template = library.entries()[0]!.template;
  editor.bus.reset(deckFromTemplate(template, { lang: 'en' }));
  expect(editor.bus.deck.meta.dir).toBe('ltr');
  const thread = aiOf(editor).sessions.thread({ kind: 'deck' });
  const back = callBack(thread);
  await thread.send('צור שקף פתיחה');
  await vi.waitFor(
    () =>
      expect(thread.store.getState().activity).toMatchObject({
        kind: 'tool',
        name: 'slide_create_from_html',
      }),
    { timeout: 20_000, interval: 1 },
  );
  return { editor, template, thread, back };
}

/** Resolves when the chat's next tool call has come back, whatever became of its turn. */
function callBack(thread: ChatThread): Promise<void> {
  return new Promise((resolve) => {
    const callTool = thread.callTool.bind(thread);
    thread.callTool = (name, input) => callTool(name, input).finally(resolve);
  });
}

it('leaves a deck that was opened in the meantime exactly as it was opened', async () => {
  const { editor, template, back } = await converting();

  // File > New or Open: a right-to-left deck on the same template replaces the document.
  const opened = deckFromTemplate(template, { lang: 'he' });
  editor.bus.reset(opened);
  expect(editor.bus.deck.meta.dir).toBe('rtl');

  // The conversion the old deck's turn was waiting for comes back.
  await back;
  await new Promise((resolve) => setTimeout(resolve, 0));

  // No slide of the old deck's turn, and no layout turned over because the two decks differ in
  // direction: the deck is the very object that was opened, with nothing to undo.
  expect(editor.bus.deck).toBe(opened);
  expect(editor.bus.undoStack).toHaveLength(0);
});

it('does not turn the layouts a second time when the user turns the deck', async () => {
  const { editor, thread } = await converting();

  // The user turns the deck right-to-left from the Design panel (THM-02): the direction, the
  // layouts and the slides on them, as one step of the user's.
  turnDeck(editor, library, 'rtl');
  expect(editor.bus.deck.meta.dir).toBe('rtl');
  const asTheUserLeftThem = editor.bus.deck.layouts;

  await vi.waitFor(() => expect(thread.store.getState().busy).toBe(false), { timeout: 30_000 });

  // The call that was running made its slide and turned nothing: the layouts are the objects
  // the user's own step left.
  expect(editor.bus.deck.layouts).toBe(asTheUserLeftThem);
  expect(editor.bus.undoStack.map((entry) => [entry.actor.split(':')[0], entry.commands])).toEqual([
    ['user', expect.arrayContaining(['deck.setMeta', 'layout.update'])],
    ['agent', ['slide.add']],
  ]);
});

it('turns the layouts with a deck the agent itself turns, in the step of its turn', async () => {
  const { editor, template, thread } = await converting();
  const before = editor.bus.deck.layouts;

  // The agent turns a deck by setting its direction, here in a call beside the conversion.
  const result = await thread.callTool('deck_apply_ops', {
    ops: [{ type: 'deck.setMeta', patch: { dir: 'rtl' } }],
  });
  expect(result).toMatchObject({ ok: true, data: { deck: ['meta', 'layouts'] } });
  expect(editor.bus.deck.meta.dir).toBe('rtl');
  // The layouts are the ones a user's own turn of the deck gives.
  const byHand = createEditor({ lang: 'en', storage: null });
  byHand.bus.reset(deckFromTemplate(template, { lang: 'en' }));
  turnDeck(byHand, library, 'rtl');
  const drawn = (layouts: typeof before) => layouts.map(({ id: _id, ...layout }) => layout);
  expect(editor.bus.deck.layouts).not.toBe(before);
  expect(drawn(editor.bus.deck.layouts)).toEqual(drawn(byHand.bus.deck.layouts));

  await vi.waitFor(() => expect(thread.store.getState().busy).toBe(false), { timeout: 30_000 });
  // One step of the agent's: the direction, the layouts, and the slide it was making.
  expect(editor.bus.undoStack).toHaveLength(1);
  expect(editor.bus.undoStack[0]!.commands).toEqual(
    expect.arrayContaining(['deck.setMeta', 'layout.update', 'slide.add']),
  );
});
