// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CommandBus,
  createDeck,
  createElement,
  createSlide,
  richText,
  type AssetMeta,
  type Command,
  type Deck,
} from '@slidr/model';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssetService } from '../document/assets';
import { namesFamily, watchUserFonts } from './embed';
import { addUserFont, memoryFontStore, removeUserFont, setUserFontStore } from './userFonts';

/*
 * A deck that uses one of the user's fonts carries it (SPEC 5.7): the files become font assets
 * of the deck with the change that named the family, as one undo step where the change has a
 * transaction to join.
 */

/** A font file of the suites' fixtures; a path, since the DOM of a test has a URL of its own. */
const fixturePath = (name: string) =>
  join(dirname(fileURLToPath(import.meta.url)), '../../e2e/fixtures/fonts', name);

const FAMILY = 'Slidr Fixture Sans';

const fixture = (name: string) => new File([readFileSync(fixturePath(name))], name);
const asItIs = (bytes: Uint8Array) => Promise.resolve(bytes);

/** How many files are being stored at this moment, in any store of the tests. */
let storing = 0;

/** The asset store of a document: what it stored, as the app's does, by content. */
function assetStore(): AssetService & { stored: string[] } {
  const stored: string[] = [];
  const store = async (file: File, origin: AssetMeta['origin']): Promise<AssetMeta> => {
    const bytes = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const id = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
    const extension = file.name.split('.').pop() ?? 'bin';
    stored.push(file.name);
    return {
      id,
      file: `${id}.${extension}`,
      mime: `font/${extension}`,
      kind: 'font',
      bytes: file.size,
      origin,
      name: file.name,
    };
  };
  return {
    stored,
    import: async (file, origin = 'upload') => {
      storing += 1;
      try {
        return await store(file, origin);
      } finally {
        storing -= 1;
      }
    },
    url: () => undefined,
  };
}

function deckWith(text = 'שלום'): Deck {
  return createDeck({
    slides: [
      createSlide({
        id: 's_1',
        elements: [
          createElement.text({
            id: 'e_text',
            frame: { x: 0, y: 0, w: 400, h: 100 },
            content: richText(text),
          }),
        ],
      }),
    ],
  });
}

const setFont = (family: string): Command => ({
  type: 'text.set',
  slideId: 's_1',
  elementId: 'e_text',
  content: richText('שלום', { marks: { font: family } }),
});

const fonts = (bus: CommandBus): AssetMeta[] =>
  Object.values(bus.deck.assets).filter((asset) => asset.kind === 'font');

const turn = () => new Promise((resolve) => setTimeout(resolve, 5));

/**
 * Lets the files reach the deck: a turn of the event loop for the change to reach the watcher,
 * then for as long as a file is being stored (on a busy machine that is longer than any fixed
 * wait), and a turn more for the stored files to enter the deck.
 */
async function settled(): Promise<void> {
  do await turn();
  while (storing > 0);
  await turn();
}

let bus: CommandBus;
let assets: ReturnType<typeof assetStore>;
let stop: () => void;

beforeEach(async () => {
  setUserFontStore(memoryFontStore());
  await addUserFont(fixture('fixture-sans-bold.ttf'), asItIs);
  bus = new CommandBus(deckWith(), { validate: true });
  assets = assetStore();
  stop = watchUserFonts({ bus, assets, label: (family) => `store ${family}` });
  await settled();
});

afterEach(() => stop());

describe('where a deck names a font family', () => {
  it('is a field that holds a family, in any case of its letters', () => {
    const wanted = 'my font';
    expect(namesFamily({ marks: { font: 'My Font' } }, wanted)).toBe(true);
    expect(namesFamily({ fonts: { heading: { he: 'Heebo', latin: 'MY FONT' } } }, wanted)).toBe(
      true,
    );
    expect(namesFamily([{ runs: [{ text: 'x', marks: { font: 'my font' } }] }], wanted)).toBe(true);
    expect(namesFamily('My Font', wanted, 'font')).toBe(true);
  });

  it('is a declaration in free CSS or HTML', () => {
    const wanted = 'my font';
    expect(namesFamily({ css: { 'font-family': '"My Font", serif' } }, wanted)).toBe(true);
    expect(namesFamily({ css: 'h1 { font-family: My Font; }' }, wanted)).toBe(true);
    expect(namesFamily({ html: '<p style="font: 12px \'My Font\'">x</p>' }, wanted)).toBe(true);
  });

  it('is not text that happens to say the name, nor another family', () => {
    const wanted = 'my font';
    expect(namesFamily({ runs: [{ text: 'Set in My Font' }] }, wanted)).toBe(false);
    expect(namesFamily({ name: 'My Font' }, wanted)).toBe(false);
    expect(namesFamily({ marks: { font: 'Heebo' } }, wanted)).toBe(false);
    expect(namesFamily({ size: 12, hidden: true, nothing: null }, wanted)).toBe(false);
  });
});

describe("a deck that comes to use one of the user's fonts", () => {
  it('gets the files of the family with the change that named it, as one undo step', async () => {
    await addUserFont(fixture('fixture-sans-regular.woff2'), () =>
      Promise.resolve(new Uint8Array(readFileSync(fixturePath('fixture-sans-bold.ttf')))),
    );
    bus.dispatch(setFont(FAMILY), { txId: 'tx_font', label: 'Font' });
    await settled();
    expect(fonts(bus).map((asset) => asset.font)).toEqual([
      { family: FAMILY, weight: '700', style: 'normal' },
      { family: FAMILY, weight: '700', style: 'normal' },
    ]);
    expect(
      fonts(bus)
        .map((asset) => asset.name)
        .sort(),
    ).toEqual(['fixture-sans-bold.ttf', 'fixture-sans-regular.woff2']);
    expect(bus.undoStack).toHaveLength(1);
    expect(bus.undoStack[0]!.label).toBe('Font');

    // One undo takes the font and its files back together, and redo brings both.
    bus.undo();
    expect(fonts(bus)).toEqual([]);
    expect(bus.deck.slides[0]!.elements[0]).toMatchObject({ content: richText('שלום') });
    bus.redo();
    expect(fonts(bus)).toHaveLength(2);
    await settled();
    expect(bus.undoStack).toHaveLength(1);
  });

  it('gets them as a step of its own after a change that has no transaction', async () => {
    bus.dispatch({
      type: 'theme.update',
      patch: { fonts: { heading: { he: 'Heebo', latin: FAMILY } } },
    });
    await settled();
    expect(fonts(bus)).toHaveLength(1);
    expect(bus.undoStack.map((entry) => entry.label)).toEqual([undefined, `store ${FAMILY}`]);
  });

  it('is left alone by a change that names no font of the user, or one it already carries', async () => {
    bus.dispatch(setFont('Heebo'), { txId: 'tx_a' });
    bus.dispatch({ type: 'slide.update', slideId: 's_1', patch: { name: FAMILY } });
    await settled();
    expect(assets.stored).toEqual([]);

    bus.dispatch(setFont(FAMILY), { txId: 'tx_b' });
    await settled();
    expect(assets.stored).toEqual(['fixture-sans-bold.ttf']);
    // Named again: the deck has it.
    bus.dispatch(setFont('Heebo'), { txId: 'tx_c' });
    bus.dispatch(setFont(FAMILY), { txId: 'tx_d' });
    await settled();
    expect(assets.stored).toEqual(['fixture-sans-bold.ttf']);
    expect(fonts(bus)).toHaveLength(1);
  });

  it('gets them when HTML or CSS the agent wrote names the family', async () => {
    bus.dispatch(
      { type: 'slide.update', slideId: 's_1', patch: { css: `h1 { font-family: "${FAMILY}"; }` } },
      { actor: 'agent:session:turn', txId: 'tx_turn' },
    );
    await settled();
    expect(fonts(bus)).toHaveLength(1);
    // In the agent's own step, so "undo changes" of the turn takes them too.
    expect(bus.undoStack).toHaveLength(1);
    expect(bus.undoStack[0]!.actor).toBe('agent:session:turn');
  });

  it('does not answer an undo with a new step, and gets them back with its next change', async () => {
    bus.dispatch({
      type: 'theme.update',
      patch: { fonts: { body: { he: FAMILY, latin: FAMILY } } },
    });
    await settled();
    expect(bus.undoStack).toHaveLength(2);

    // The step of the files alone is undone: the deck still names the family.
    bus.undo();
    await settled();
    expect(fonts(bus)).toEqual([]);
    expect(bus.undoStack).toHaveLength(1);
    expect(bus.canRedo).toBe(true);

    // Whatever the user does next, the deck carries the font again.
    bus.dispatch(
      { type: 'slide.update', slideId: 's_1', patch: { name: 'פתיחה' } },
      { txId: 'tx_name' },
    );
    await settled();
    expect(fonts(bus)).toHaveLength(1);
    expect(bus.undoStack).toHaveLength(2);
  });

  it('is not changed by being opened, and gets them with its first change', async () => {
    const opened = new CommandBus(deckWith(), { validate: true });
    opened.dispatch(setFont(FAMILY));
    bus.reset(opened.deck);
    await settled();
    expect(fonts(bus)).toEqual([]);
    expect(bus.canUndo).toBe(false);

    bus.dispatch(
      { type: 'slide.update', slideId: 's_1', patch: { name: 'פתיחה' } },
      { txId: 'tx_name' },
    );
    await settled();
    expect(fonts(bus)).toHaveLength(1);
    expect(bus.undoStack).toHaveLength(1);
  });

  it('gets a font the user adds while the deck already names its family', async () => {
    bus.dispatch(setFont('Slidr Fixture Ivrit'), { txId: 'tx_font' });
    await settled();
    expect(fonts(bus)).toEqual([]);
    await addUserFont(fixture('fixture-ivrit-regular.otf'), asItIs);
    await settled();
    expect(fonts(bus).map((asset) => asset.font?.family)).toEqual(['Slidr Fixture Ivrit']);
    expect(bus.undoStack.at(-1)!.label).toBe('store Slidr Fixture Ivrit');
  });

  it('keeps its copy when the user takes the font out of their fonts', async () => {
    bus.dispatch(setFont(FAMILY), { txId: 'tx_font' });
    await settled();
    const [asset] = fonts(bus);
    await removeUserFont(asset!.id);
    await settled();
    expect(fonts(bus)).toEqual([asset]);
  });

  it('drops the files when another deck was opened while they were being stored', async () => {
    const slow = vi.spyOn(assets, 'import');
    slow.mockImplementationOnce(async (file, origin) => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      return assetStore().import(file, origin);
    });
    bus.dispatch(setFont(FAMILY), { txId: 'tx_font' });
    bus.reset(deckWith('מצגת אחרת'));
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(fonts(bus)).toEqual([]);
    expect(bus.canUndo).toBe(false);
  });
});
