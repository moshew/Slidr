import { createDeckApi, startTurn } from '@slidr/agent-tools';
import { CommandBus, createDeck, createElement, createSlide, newId } from '@slidr/model';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '../shell';

/*
 * A capture that is in flight when another document is opened (File > New, File > Open, a
 * recent file). The page goes on working: Rust closes the import window only after the running
 * job has had its turn, so the job answers. The slide it answers with is of the document that
 * was being imported, and must not reach the one that took its place.
 *
 * Everything on the editor's side is the real thing: the import service of the session, which
 * follows the documents of the window, and `import_capture` of the Deck API over a real command
 * bus. Only the isolated page is a stand-in: the jobs Rust would carry to it are answered here.
 */

const core = vi.hoisted(() => ({
  isTauri: () => true,
  invoke: vi.fn<(command: string, args?: { job?: { kind: string } }) => Promise<unknown>>(),
}));
vi.mock('@tauri-apps/api/core', () => core);

import { createImporter, endImport, importState, watchDocuments } from './session';

/** What the page answers a capture with (`ImportCapture`), as JSON. */
function answer(): unknown {
  return {
    slide: createSlide({
      id: newId('s'),
      elements: [
        createElement.text({ frame: { x: 0, y: 0, w: 100, h: 50 }, content: { paragraphs: [] } }),
      ],
    }),
    assets: [],
    editability: 1,
    textEditability: 1,
    notes: [],
    guard: { faithful: true, exact: true, rounds: 1, wholeSlide: false, diffPixels: 0 },
    source: { width: 1280, height: 720, scale: 1 },
    ms: 400,
  };
}

const IMPORT = { kind: 'import', file: 'deck.html' } as const;

/** An editor with a real bus, and an import session that is open on its deck. */
function importing() {
  const deck = createDeck({ lang: 'he', slides: [createSlide()] });
  const bus = new CommandBus(deck, { validate: true });
  const editor = { bus, document: null } as unknown as Editor;
  // What the import area does when the app starts (`register.tsx`).
  watchDocuments(editor, () => undefined);
  importState.setState({
    file: 'deck.html',
    deckId: deck.id,
    open: true,
    kept: true,
    phase: 'working',
    startedAt: 0,
  });
  const api = createDeckApi(bus, { importer: createImporter(editor) });
  return { bus, api, deck };
}

/** Holds every capture job until the test lets it answer. */
function heldCaptures() {
  const waiting: (() => void)[] = [];
  let asked = 0;
  core.invoke.mockImplementation((command, args) => {
    if (command === 'import_run_job' && args?.job?.kind === 'capture') {
      asked++;
      return new Promise((resolve) => waiting.push(() => resolve(answer())));
    }
    // The lists of what the page was refused, and the window being closed.
    return Promise.resolve(command === 'import_close' ? null : []);
  });
  return {
    get asked() {
      return asked;
    },
    async inFlight() {
      await vi.waitFor(() => expect(waiting).toHaveLength(1));
    },
    release() {
      waiting.shift()?.();
    },
  };
}

beforeEach(async () => {
  core.invoke.mockReset();
  core.invoke.mockResolvedValue([]);
  await endImport(true);
});

describe('a capture in flight when another document is opened', () => {
  it('adds nothing to the document that replaced the one being imported', async () => {
    const { bus, api } = importing();
    const page = heldCaptures();
    const other = createDeck({
      lang: 'he',
      slides: [createSlide({ name: 'My own first slide' }), createSlide({ name: 'My own second' })],
    });

    const running = api.call(startTurn('sess', IMPORT), 'import_capture', {
      slides: [
        { selector: 'section:nth-of-type(1)', name: 'Imported' },
        { selector: 'section:nth-of-type(2)' },
        { selector: 'section:nth-of-type(3)' },
      ],
    });
    await page.inFlight();
    // The user opens another document while the page works on the first slide.
    bus.reset(other);
    page.release();
    const result = await running;

    expect(bus.deck.id).toBe(other.id);
    expect(bus.deck.slides.map((slide) => slide.name)).toEqual([
      'My own first slide',
      'My own second',
    ]);
    // Nothing was written to it: not a slide, not an asset, and no undo step of a turn it
    // never had.
    expect(bus.deck).toBe(other);
    expect(bus.canUndo).toBe(false);
    // The call ends with its document: the slide the page finished stays out, and no other
    // slide of the call is asked of a page that is being closed.
    expect(page.asked).toBe(1);
    expect(result.ok && result.data).toMatchObject({
      captured: [],
      notCaptured: 'The turn was stopped: the last 3 of this call were not captured.',
    });
    // The session went with its document, so it keeps no record of the slide either.
    expect(importState.getState()).toMatchObject({ file: null, records: {} });
  });

  it('adds nothing to a new blank document either, whose one empty slide it would replace', async () => {
    const { bus, api } = importing();
    const page = heldCaptures();
    const blank = createDeck({ lang: 'he', slides: [createSlide()] });

    const running = api.call(startTurn('sess', IMPORT), 'import_capture', {
      slides: [{ selector: 'section' }],
    });
    await page.inFlight();
    bus.reset(blank);
    page.release();
    await running;

    expect(bus.deck).toBe(blank);
    expect(bus.deck.slides).toHaveLength(1);
    expect(bus.deck.slides[0]!.elements).toEqual([]);
  });

  it('goes into the deck being imported when nothing else was opened (the control)', async () => {
    const { bus, api, deck } = importing();
    const page = heldCaptures();
    const running = api.call(startTurn('sess', IMPORT), 'import_capture', {
      slides: [{ selector: 'section', name: 'Imported' }],
    });
    await page.inFlight();
    page.release();
    const result = await running;

    expect(result.ok).toBe(true);
    expect(bus.deck.id).toBe(deck.id);
    // The slide a new deck starts with made way for it.
    expect(bus.deck.slides.map((slide) => slide.name)).toEqual(['Imported']);
    expect(Object.keys(importState.getState().records)).toEqual([bus.deck.slides[0]!.id]);
  });
});
