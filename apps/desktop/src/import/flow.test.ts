// @vitest-environment happy-dom
import { createSlide } from '@slidr/model';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Where an import starts (SPEC 13.3 steps 1 to 3): in a plain deck of its own. The session and
 * the chat are stand-ins here; the editor, the document flow of File > New and the template
 * library are the real ones.
 */

const session = vi.hoisted(() => ({
  openImport: vi.fn(() => Promise.resolve('deck.html')),
  interruptImport: vi.fn(),
  turnEnded: vi.fn(),
}));
vi.mock('./session', () => session);
const sent: string[] = [];
/** Whose conversation the AI chat was put on. */
const shown: string[] = [];
vi.mock('../ai/runtime', () => ({
  aiOf: () => ({
    sessions: {
      chat: { setState: (chat: string) => void shown.push(chat) },
      thread: () => ({
        send: (text: string) => Promise.resolve(void sent.push(text)),
        store: {
          getState: () => ({ busy: false, stopping: false, entries: [] }),
          subscribe: () => () => undefined,
        },
      }),
    },
  }),
}));

import { answer, pendingDialog } from '../shell/dialogs';
import { createEditor, setNewDeck } from '../shell/editor';
import { PanelId } from '../shell/registry';
import { setWelcome, useShell } from '../shell/store';
import { startDeck } from '../templates/actions';
import { library } from '../templates/app';
import { importOpening, startImport } from './flow';

const SOURCE = { path: 'C:\\in\\deck.html' };

/** Sets the template new decks start on, as the Templates panel does; null for none. */
function defaultTemplate(set: boolean): void {
  const builtIn = library.entries().find((entry) => !entry.personal);
  expect(builtIn).toBeDefined();
  library.setDefault(set ? builtIn!.template.theme.id : null);
  // What templates/register.tsx does when the app starts.
  setNewDeck((lang) => startDeck(library, lang));
}

beforeEach(() => {
  session.openImport.mockClear();
  session.openImport.mockImplementation(() => Promise.resolve('deck.html'));
  sent.length = 0;
  shown.length = 0;
  sessionStorage.clear();
});

describe('startImport', () => {
  it('uses the deck that is open when nobody has put anything into it', async () => {
    defaultTemplate(false);
    const editor = createEditor({ lang: 'he', storage: null });
    const open = editor.bus.deck.id;
    expect(await startImport(editor, SOURCE, { confirm: false })).toBe(true);
    expect(editor.bus.deck.id).toBe(open);
    expect(session.openImport).toHaveBeenCalledTimes(1);
    expect(sent).toHaveLength(1);
  });

  it('starts in a plain deck for a user whose new decks start on a template', async () => {
    defaultTemplate(true);
    const editor = createEditor({ lang: 'he', storage: null });
    // The deck the app started with is the template's: a slide of its first layout.
    const started = editor.bus.deck;
    expect(started.slides[0]!.elements.length).toBeGreaterThan(0);
    expect(started.layouts.length).toBeGreaterThan(0);
    expect(editor.file.getState().dirty).toBe(false);

    expect(await startImport(editor, SOURCE, { confirm: true })).toBe(true);
    expect(session.openImport).toHaveBeenCalledTimes(1);
    expect(sent).toHaveLength(1);
    // The import got a deck of its own, with nothing of the template in it: the first captured
    // slide takes the place of its one empty slide (`import_capture`).
    const deck = editor.bus.deck;
    expect(deck.id).not.toBe(started.id);
    expect(deck.layouts).toEqual([]);
    expect(deck.slides).toHaveLength(1);
    expect(deck.slides[0]).toMatchObject({ elements: [] });
    expect(deck.slides[0]!.layoutId).toBeUndefined();
    expect(deck.theme.id).not.toBe(started.theme.id);
  });

  it('asks about unsaved work first, and does not start when the user keeps it', async () => {
    defaultTemplate(true);
    const editor = createEditor({ lang: 'he', storage: null });
    editor.bus.dispatch({ type: 'slide.add', slide: createSlide({ name: 'Mine' }) });
    const mine = editor.bus.deck.id;

    const kept = startImport(editor, SOURCE, { confirm: false });
    await vi.waitFor(() => expect(pendingDialog()).not.toBeNull());
    answer('cancel');
    expect(await kept).toBe(false);
    expect(editor.bus.deck.id).toBe(mine);
    expect(session.openImport).not.toHaveBeenCalled();
    expect(sent).toEqual([]);

    // Dropping the work lets the import go on, in a plain deck.
    const dropped = startImport(editor, SOURCE, { confirm: false });
    await vi.waitFor(() => expect(pendingDialog()).not.toBeNull());
    answer('discard');
    expect(await dropped).toBe(true);
    expect(editor.bus.deck.layouts).toEqual([]);
    expect(editor.bus.deck.slides.map((slide) => slide.name)).toEqual([undefined]);
    expect(session.openImport).toHaveBeenCalledTimes(1);
  });

  it('puts the request in the AI chat: the editor, the chat open, on the conversation of the import', async () => {
    defaultTemplate(false);
    const editor = createEditor({ lang: 'he', storage: null });
    setWelcome(true);
    useShell.setState({ activePanel: 'templates', panelOpen: false, aiTab: 'actions' });
    // While the file loads the chat says so, and no request is in it yet.
    let loaded!: (file: string) => void;
    session.openImport.mockImplementation(() => new Promise<string>((done) => (loaded = done)));

    const started = startImport(editor, SOURCE, { confirm: true });
    await vi.waitFor(() => expect(importOpening.getState()).toBe(true));
    expect(useShell.getState()).toMatchObject({
      welcome: false,
      activePanel: PanelId.ai,
      panelOpen: true,
      aiTab: 'chat',
    });
    expect(shown).toEqual([]);
    expect(sent).toEqual([]);

    loaded('deck.html');
    expect(await started).toBe(true);
    expect(importOpening.getState()).toBe(false);
    expect(shown).toEqual(['import']);
    // The strings are the app's to register: here a message is the keys it is made of.
    expect(sent).toEqual(['message.import message.confirm']);
  });

  it('says nothing is loading any more when the file could not be opened', async () => {
    defaultTemplate(false);
    const editor = createEditor({ lang: 'he', storage: null });
    session.openImport.mockImplementation(() => Promise.reject(new Error('no such file')));
    await expect(startImport(editor, SOURCE, { confirm: true })).rejects.toThrow('no such file');
    expect(importOpening.getState()).toBe(false);
    expect(shown).toEqual([]);
    expect(sent).toEqual([]);
  });
});
