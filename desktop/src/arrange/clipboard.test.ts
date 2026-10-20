// @vitest-environment happy-dom
import {
  CommandBus,
  createDeck,
  createElement,
  createSelectionStore,
  createSlide,
  type AssetMeta,
  type Command,
  type Deck,
} from '@slidr/model';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { i18n, registerMessages } from '../i18n';
import type { Editor } from '../shell';
import { answer, pendingDialog } from '../shell/dialogs';
import { clipElements } from './clip';
import { paste } from './clipboard';
import { en, he } from './messages';

/*
 * A paste into the open deck, as the window's paste event and a menu's "Paste" make it: what
 * reaches the deck, and what the user is told when not everything did.
 */

/** An asset as a deck made elsewhere can carry it: its file is an address, not a file's name. */
const far: AssetMeta = {
  id: 'a_far',
  file: 'https://example.com/far.png',
  mime: 'image/png',
  kind: 'image',
  bytes: 1200,
  origin: 'import',
};

/** A deck that holds a picture of that asset, and a box beside it. */
function foreignDeck(): Deck {
  const deck = createDeck({
    slides: [
      createSlide({
        id: 's_far',
        elements: [
          createElement.image({
            id: 'e_far',
            frame: { x: 0, y: 0, w: 400, h: 300 },
            assetId: far.id,
          }),
          createElement.shape({ id: 'e_box', frame: { x: 500, y: 0, w: 200, h: 200 } }),
        ],
      }),
    ],
  });
  deck.assets = { [far.id]: far };
  return deck;
}

/** The parts of an editor a paste uses, on an empty deck that has no file of anybody's. */
function editorOn(deck: Deck) {
  const bus = new CommandBus(deck, { validate: true });
  const editor = {
    bus,
    selection: createSelectionStore(bus),
    assets: {
      import: () => Promise.reject(new Error('no file')),
      url: () => undefined,
    },
  } as unknown as Editor;
  return { editor, bus };
}

beforeAll(async () => {
  registerMessages('arrange', { he, en });
  await i18n.changeLanguage('en');
});

afterEach(() => {
  answer('ok');
  vi.restoreAllMocks();
});

describe('pasting a clip whose asset has no usable file name', () => {
  it('pastes the elements without the asset, and tells the user a file did not come along', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const clip = clipElements(foreignDeck(), 's_far', ['e_far', 'e_box'])!;
    const { editor, bus } = editorOn(createDeck({ slides: [createSlide({ id: 's1' })] }));

    await paste(editor, clip);

    // Both elements are on the slide, selected, in one undo step.
    const pasted = bus.deck.slides[0]!.elements;
    expect(pasted.map((element) => element.type)).toEqual(['image', 'shape']);
    expect(editor.selection.getState().selectedElementIds).toEqual(pasted.map((e) => e.id));
    expect(bus.undoStack).toHaveLength(1);
    // The asset `asset.add` would refuse is not in the deck: the picture is a frame without one.
    expect(bus.deck.assets).toEqual({});
    // And it is said on the screen, not in the console.
    expect(pendingDialog()).toMatchObject({
      title: en.clipboard.lostTitle,
      body: en.clipboard.lostBody,
    });
    expect(errors).not.toHaveBeenCalled();
    bus.undo();
    expect(bus.deck.slides[0]!.elements).toEqual([]);
  });

  it('pastes into the deck it was copied from without a word: the deck has the asset', async () => {
    const source = foreignDeck();
    const clip = clipElements(source, 's_far', ['e_far'])!;
    const { editor, bus } = editorOn(source);
    await paste(editor, clip);
    expect(bus.deck.slides[0]!.elements).toHaveLength(3);
    expect(pendingDialog()).toBeNull();
  });
});

describe('a paste the deck refuses', () => {
  it('is said on the screen, and leaves the deck as it was', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const clip = clipElements(foreignDeck(), 's_far', ['e_box'])!;
    const { editor, bus } = editorOn(createDeck({ slides: [createSlide({ id: 's1' })] }));
    const before = bus.deck;
    vi.spyOn(bus, 'batch').mockImplementation((_commands: readonly Command[]) => {
      throw new Error('refused');
    });

    await paste(editor, clip);

    expect(bus.deck).toBe(before);
    expect(pendingDialog()).toMatchObject({ title: en.clipboard.refusedTitle });
    // The reason is still written down for whoever looks into it.
    expect(errors).toHaveBeenCalledTimes(1);
  });
});
