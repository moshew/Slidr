import type { ImportedSlide } from '@slidr/agent-tools';
import { createDeck, createElement, createSlide, type ChangeEvent, type Deck } from '@slidr/model';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '../shell';
import { importBrief } from './progress';
import { pageRecord, parseRecord, serializeRecord, type ImportRecord } from './record';
import {
  createImporter,
  endImport,
  importState,
  interruptImport,
  restoreImport,
  turnEnded,
  watchDocuments,
} from './session';

/*
 * The session of an import that is kept with its deck (IMP-07) and continued after it was cut
 * (IMP-09): the record that is written as slides come in and found again when the deck is
 * opened, and the state the panel offers to continue from. Without a page: what a page does is
 * in the browser suites.
 */

let decks = 0;

/** An editor as far as the session looks at one: a deck, and the word that another was opened. */
function editorOf(deck: Deck, flush?: () => Promise<void>) {
  const listeners = new Set<(event: ChangeEvent) => void>();
  const bus = {
    deck,
    subscribe(listener: (event: ChangeEvent) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    reset(next: Deck) {
      bus.deck = next;
      for (const listener of listeners) listener({ kind: 'reset' } as ChangeEvent);
    },
  };
  const editor = { bus, document: flush ? { flush } : null } as unknown as Editor;
  return { editor, bus };
}

const newDeck = () => createDeck({ id: `d_session_${++decks}`, lang: 'he', slides: [] });

function captured(id: string): ImportedSlide {
  return {
    slide: createSlide({
      id,
      elements: [
        createElement.text({ frame: { x: 0, y: 0, w: 10, h: 10 }, content: { paragraphs: [] } }),
      ],
    }),
    assets: [],
    editability: 0.75,
    textEditability: 1,
    faithful: true,
    exact: true,
    wholeSlideHtml: false,
    source: { width: 1280, height: 720, scale: 1 },
    notes: ['Kept as HTML (element e_9): a pseudo-element.', 'Something else.'],
  };
}

const kept = (deckId: string, over: Partial<ImportRecord> = {}): ImportRecord => ({
  version: 1,
  deckId,
  file: 'deck.html',
  startedAt: 5,
  planned: null,
  phase: 'idle',
  records: {},
  blocked: [],
  ...over,
});

const onDisk = async (deckId: string) => parseRecord(await pageRecord(deckId).read(), deckId);

beforeEach(async () => {
  await endImport(true);
});

describe('the record of an import, kept with its deck', () => {
  it('is found again when the deck is opened, without a page', async () => {
    const deck = newDeck();
    const { editor } = editorOf(deck);
    expect(await restoreImport(editor)).toBe(false);
    expect(importState.getState().file).toBeNull();

    const written = kept(deck.id, { planned: 6, blocked: ['https://a.example/x.css'] });
    await pageRecord(deck.id).write(serializeRecord(written));
    expect(await restoreImport(editor)).toBe(true);
    expect(importState.getState()).toMatchObject({
      file: 'deck.html',
      deckId: deck.id,
      open: false,
      stale: true,
      planned: 6,
      phase: 'idle',
      blocked: ['https://a.example/x.css'],
    });
  });

  it('is written as slides come in: the record first, and then the deck', async () => {
    const deck = newDeck();
    const order: string[] = [];
    const store = pageRecord(deck.id);
    await store.write(serializeRecord(kept(deck.id)));
    const { editor } = editorOf(deck, () => {
      order.push('deck');
      return Promise.resolve();
    });
    await restoreImport(editor);
    const importer = createImporter(editor);
    expect(createImporter(editor)).toBe(importer);

    importer.planned?.(3);
    importer.captured?.(captured('s_one'), { js: 'slides()[0]', before: 'show(0)' });
    order.push('captured');
    await vi.waitFor(() => expect(order).toEqual(['captured', 'deck']));
    // By the time the deck was flushed, the record on disk had the slide.
    const record = (await onDisk(deck.id))!;
    expect(record.planned).toBe(3);
    expect(record.phase).toBe('idle');
    expect(record.records.s_one).toEqual({
      faithful: true,
      exact: true,
      wholeSlideHtml: false,
      editability: 0.75,
      textEditability: 1,
      kept: ['a pseudo-element'],
      source: { width: 1280, height: 720 },
      elementIds: [expect.any(String)],
      from: { js: 'slides()[0]', before: 'show(0)' },
    });
  });

  it("does not take a capture that outlived its session into another deck's record", async () => {
    const first = newDeck();
    const { editor, bus } = editorOf(first);
    watchDocuments(editor, () => undefined);
    await pageRecord(first.id).write(serializeRecord(kept(first.id)));
    await restoreImport(editor);
    const importer = createImporter(editor);

    // Another document is opened while the page still works on a slide of the first.
    const other = newDeck();
    bus.reset(other);
    expect(importState.getState().file).toBeNull();
    importer.captured?.(captured('s_late'));
    await Promise.resolve();
    expect(importState.getState().records).toEqual({});
    expect(await onDisk(other.id)).toBeNull();
    expect((await onDisk(first.id))!.records).toEqual({});
  });

  it('comes back when its deck is opened again, and tells whoever watches', async () => {
    const first = newDeck();
    const { editor, bus } = editorOf(first);
    const restored = vi.fn();
    watchDocuments(editor, restored);
    await pageRecord(first.id).write(serializeRecord(kept(first.id, { phase: 'working' })));

    bus.reset(newDeck());
    await vi.waitFor(() => expect(importState.getState().file).toBeNull());
    expect(restored).not.toHaveBeenCalled();
    bus.reset(first);
    await vi.waitFor(() => expect(restored).toHaveBeenCalledTimes(1));
    // The app went away while the import was at work: it was cut.
    expect(restored.mock.calls[0]![0]).toMatchObject({ file: 'deck.html', phase: 'cut' });
    await vi.waitFor(async () => expect((await onDisk(first.id))!.phase).toBe('cut'));
  });

  it('leaves alone a session that began while the record was being read', async () => {
    const deck = newDeck();
    const { editor } = editorOf(deck);
    await pageRecord(deck.id).write(serializeRecord(kept(deck.id, { file: 'old.html' })));
    const reading = restoreImport(editor);
    importState.setState({ file: 'new.html', deckId: deck.id, open: true });
    expect(await reading).toBe(false);
    expect(importState.getState().file).toBe('new.html');
  });
});

describe('an import that was cut (IMP-09)', () => {
  async function session(phase: ImportRecord['phase'] = 'idle') {
    const deck = newDeck();
    const { editor } = editorOf(deck);
    await pageRecord(deck.id).write(serializeRecord(kept(deck.id, { phase })));
    await restoreImport(editor);
    return { deck, editor, importer: createImporter(editor) };
  }
  const phase = () => importState.getState().phase;

  it('is one whose turn was stopped or failed while the import was at work', async () => {
    await session();
    importState.setState({ phase: 'working' });
    turnEnded(false);
    expect(phase()).toBe('cut');
    // The turn that goes on with it, and ends as the agent meant it to, leaves nothing to continue.
    turnEnded(true);
    expect(phase()).toBe('idle');
  });

  it('is not one whose chat was stopped over something else, long after the import', async () => {
    await session();
    turnEnded(false);
    expect(phase()).toBe('idle');
  });

  it('stays cut through a turn that fails again', async () => {
    await session('cut');
    turnEnded(false);
    expect(phase()).toBe('cut');
  });

  it("stops the capture call the turn left running, and not the next turn's", async () => {
    const { importer } = await session();
    const running = importer.interruption!();
    expect(running.aborted).toBe(false);
    interruptImport();
    expect(running.aborted).toBe(true);
    // The call of the turn that goes on is not the one that was stopped.
    const next = importer.interruption!();
    expect(next.aborted).toBe(false);
    // A turn that ends, however it ends, takes its calls with it.
    turnEnded(true);
    expect(next.aborted).toBe(true);
  });

  it('tells the next turn what was captured, and that the page is a new one', async () => {
    const { deck, importer } = await session('cut');
    const slides = [createSlide({ id: 's_a', name: 'Cover' }), createSlide({ id: 's_mine' })];
    const now = { ...deck, slides };
    importer.planned?.(6);
    importState.setState({
      // As in the app, where the deck's file keeps the source; a page of the tests keeps none.
      kept: true,
      records: {
        s_a: {
          faithful: true,
          exact: true,
          wholeSlideHtml: false,
          editability: 1,
          textEditability: 1,
          kept: [],
          source: { width: 1280, height: 720 },
          elementIds: [],
          from: { selector: 'section:nth-of-type(1)' },
        },
      },
    });
    const brief = importBrief(importState.getState(), now, false);
    expect(brief).toContain('planned_slides: 6');
    expect(brief).toContain('deck_slides: 2');
    expect(brief).toContain(
      'captured: {"number":1,"id":"s_a","name":"Cover","from":{"selector":"section:nth-of-type(1)"}}',
    );
    expect(brief).not.toContain('s_mine');
    expect(brief).toMatch(/The isolated page was closed\./);
    expect(brief).toMatch(/Go on with the import from here/);

    // Nothing to say once the import goes well again in a page the agent's own calls made.
    importState.setState({ phase: 'working', open: true, stale: false });
    expect(importBrief(importState.getState(), now, false)).toBe('');
    // Nor to the chat of another deck.
    expect(importBrief(importState.getState(), newDeck(), true)).toBe('');
  });
});
