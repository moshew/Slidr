import { CommandBus, createDeck, type AssetMeta, type Deck } from '@slidr/model';
import { deckFromTemplate, layoutsFor, type Template } from '@slidr/templates';
import { nightTemplate, paperTemplate } from '@slidr/templates/fixtures';
import { describe, expect, it } from 'vitest';
import type { Editor } from '../shell';
import {
  applyLibraryTemplate,
  logoAsset,
  logoHidden,
  logoLayouts,
  saveAsTemplate,
  setLogo,
  showLogo,
  startDeck,
  supplyAssets,
  turnDeck,
} from './actions';
import { TemplateLibrary } from './library';
import { memoryTemplateStore } from './store';

const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });

/** A template with a logo on two of its layouts, as the built-in ones have. */
function withLogo(template: Template): Template {
  for (const layout of template.layouts.slice(0, 2)) {
    layout.decorations.push({
      id: `d_${layout.id}_logo`,
      type: 'shape',
      role: 'logo',
      frame: box(1780, 80, 44, 32),
      rotation: 0,
      opacity: 1,
      geometry: { kind: 'preset', preset: 'rect' },
      fill: { kind: 'solid', color: { token: 'primary' } },
    });
  }
  return template;
}

/** The parts of an editor the actions use: the bus, and asset files kept in memory. */
function editorOn(deck: Deck) {
  const bus = new CommandBus(deck, { validate: true });
  const files = new Map<string, Uint8Array>();
  const imported: string[] = [];
  const editor = {
    bus,
    assets: {
      import: async (file: File, origin: AssetMeta['origin'] = 'upload') => {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const id = `hash-${Array.from(bytes).join('-')}`;
        files.set(id, bytes);
        imported.push(file.name);
        return {
          id,
          file: `${id}.png`,
          mime: file.type || 'image/png',
          kind: 'image' as const,
          bytes: bytes.length,
          width: 400,
          height: 100,
          origin,
          name: file.name,
        };
      },
      url: (asset: AssetMeta) => {
        const bytes = files.get(asset.id);
        return bytes
          ? `data:${asset.mime};base64,${btoa(String.fromCharCode(...bytes))}`
          : undefined;
      },
    },
  } as unknown as Editor;
  return { editor, bus, imported };
}

const libraryOf = (...builtIn: Template[]) =>
  new TemplateLibrary(memoryTemplateStore(), { builtIn });

describe('a new deck', () => {
  it('is one empty slide when there is no default template', () => {
    const deck = startDeck(libraryOf(paperTemplate()), 'he');
    expect(deck.layouts).toEqual([]);
    expect(deck.slides).toHaveLength(1);
    expect(deck.slides[0]!.elements).toEqual([]);
    expect(deck.theme.id).toBe('basic');
  });

  it('opens on the default template: its theme, its layouts for the deck, and its opening slide', () => {
    const library = libraryOf(paperTemplate());
    library.setDefault('test_paper');
    const deck = startDeck(library, 'he');
    expect(deck.meta).toMatchObject({ lang: 'he', dir: 'rtl' });
    expect(deck.theme.id).toBe('test_paper');
    expect(deck.layouts).toEqual(layoutsFor(paperTemplate(), 'rtl'));
    expect(deck.slides).toHaveLength(1);
    expect(deck.slides[0]).toMatchObject({ layoutId: 'l_paper_hero' });
    expect(deck.slides[0]!.elements.map((e) => e.role)).toEqual(['title', 'subtitle', 'image']);
    // The sample slides of the template are not part of a new deck.
    expect(startDeck(library, 'en').meta.dir).toBe('ltr');
  });
});

describe('switching the deck to a template of the library', () => {
  it('is one undo step, and undo gives the deck back', async () => {
    const deck = deckFromTemplate(paperTemplate(), { lang: 'he', sample: true });
    const { editor, bus } = editorOn(deck);
    const library = libraryOf(paperTemplate(), nightTemplate());
    expect(await applyLibraryTemplate(editor, library, 'test_night', 'החלפת תבנית')).toBe(true);
    expect(bus.deck.theme.id).toBe('test_night');
    expect(bus.undoStack).toHaveLength(1);
    expect(bus.undo()).toBe(true);
    expect(bus.deck).toEqual(deck);
    expect(bus.redo()).toBe(true);
    expect(bus.deck.theme.id).toBe('test_night');
  });

  it('does nothing for a template that is not there, or the one the deck is on', async () => {
    const deck = deckFromTemplate(paperTemplate(), { lang: 'en' });
    const { editor, bus } = editorOn(deck);
    const library = libraryOf(paperTemplate());
    expect(await applyLibraryTemplate(editor, library, 'nope')).toBe(false);
    expect(await applyLibraryTemplate(editor, library, 'test_paper')).toBe(true);
    expect(bus.undoStack).toHaveLength(0);
  });

  it('stores the files of a personal template with the deck before naming its assets', async () => {
    const library = libraryOf(paperTemplate());
    // A personal template made from a deck with a logo of the user.
    const source = editorOn(deckFromTemplate(withLogo(paperTemplate()), { lang: 'en' }));
    await setLogo(source.editor, new File([new Uint8Array([7, 7])], 'logo.png'));
    const saved = await saveAsTemplate(source.editor, library, 'Mine');
    const logo = Object.values(saved.assets ?? {})[0]!;

    const { editor, bus, imported } = editorOn(createDeck({ lang: 'en' }));
    await applyLibraryTemplate(editor, library, saved.theme.id);
    expect(imported).toEqual([logo.file]);
    expect(bus.deck.assets[logo.id]).toEqual(logo);
    expect(logoAsset(bus.deck)).toEqual(logo);
    expect(bus.undoStack).toHaveLength(1);
  });
});

describe('a deck that starts on a personal template', () => {
  it('gets the files of the template into its document', async () => {
    const library = libraryOf(paperTemplate());
    const source = editorOn(deckFromTemplate(withLogo(paperTemplate()), { lang: 'he' }));
    await setLogo(source.editor, new File([new Uint8Array([9])], 'logo.png'));
    const saved = await saveAsTemplate(source.editor, library, 'שלי', { setDefault: true });

    const fresh = editorOn(startDeck(library, 'he'));
    expect(fresh.bus.deck.theme.id).toBe(saved.theme.id);
    await supplyAssets(fresh.editor, library);
    expect(fresh.imported).toEqual([Object.values(saved.assets!)[0]!.file]);
    // A deck on a built-in template has nothing to store.
    const plain = editorOn(deckFromTemplate(paperTemplate(), { lang: 'he' }));
    await supplyAssets(plain.editor, library);
    expect(plain.imported).toEqual([]);
  });
});

describe('turning the deck', () => {
  it('turns layouts and slides in one step, with the hand-drawn layouts of the template', () => {
    const night = nightTemplate();
    const deck = deckFromTemplate(night, { lang: 'he', sample: true });
    const { editor, bus } = editorOn(deck);
    const library = libraryOf(night);
    turnDeck(editor, library, 'ltr', 'כיוון');
    expect(bus.deck.meta.dir).toBe('ltr');
    expect(bus.deck.layouts).toEqual(layoutsFor(night, 'ltr'));
    expect(bus.undoStack).toHaveLength(1);
    bus.undo();
    expect(bus.deck).toEqual(deck);
    // The same direction again is no step at all.
    turnDeck(editor, library, 'rtl');
    expect(bus.undoStack).toHaveLength(0);
  });
});

describe('the logo', () => {
  const deckWithLogo = (lang: string) => deckFromTemplate(withLogo(paperTemplate()), { lang });

  it('replaces the mark of every layout that has one, in one step', async () => {
    const deck = deckWithLogo('en');
    const { editor, bus } = editorOn(deck);
    expect(logoLayouts(deck)).toHaveLength(2);
    expect(logoAsset(deck)).toBeUndefined();

    await setLogo(editor, new File([new Uint8Array([1, 2, 3])], 'logo.png'), 'לוגו');
    expect(bus.undoStack).toHaveLength(1);
    const asset = logoAsset(bus.deck)!;
    expect(bus.deck.assets[asset.id]).toEqual(asset);
    for (const layout of logoLayouts(bus.deck)) {
      const logo = layout.decorations.find((d) => d.role === 'logo')!;
      // As tall as the mark and as wide as the picture asks (4:1). The mark sat by the right
      // edge, so the logo keeps its right edge and grows towards the middle.
      expect(logo).toMatchObject({
        type: 'image',
        assetId: asset.id,
        fit: 'contain',
        frame: { x: 1696, y: 80, w: 128, h: 32 },
      });
    }
    bus.undo();
    expect(bus.deck).toEqual(deck);
  });

  it('keeps its left edge when the mark sits by the left edge, as in the mirrored deck', async () => {
    const deck = deckWithLogo('he');
    const { editor, bus } = editorOn(deck);
    const before = logoLayouts(deck)[0]!.decorations.find((d) => d.role === 'logo')!.frame;
    expect(before.x).toBe(96);
    await setLogo(editor, new File([new Uint8Array([1])], 'logo.png'));
    const after = logoLayouts(bus.deck)[0]!.decorations.find((d) => d.role === 'logo')!.frame;
    expect(after).toEqual({ ...before, w: 128 });
  });

  it('is hidden and shown again without losing its place', () => {
    const deck = deckWithLogo('en');
    const { editor, bus } = editorOn(deck);
    showLogo(editor, false, 'לוגו');
    expect(logoHidden(bus.deck)).toBe(true);
    expect(bus.undoStack).toHaveLength(1);
    showLogo(editor, true);
    expect(logoHidden(bus.deck)).toBe(false);
    expect(bus.deck.layouts).toEqual(deck.layouts);
    bus.undo();
    bus.undo();
    expect(bus.deck).toEqual(deck);
  });

  it('has no place in a deck whose layouts draw none', () => {
    const { editor, bus } = editorOn(createDeck({ lang: 'he' }));
    expect(logoLayouts(bus.deck)).toEqual([]);
    showLogo(editor, false);
    expect(bus.undoStack).toHaveLength(0);
  });
});

describe('saving the deck as a personal template', () => {
  it('saves the theme, the layouts and the logo file, and puts the deck on the template', async () => {
    const night = withLogo(nightTemplate());
    const library = libraryOf(night);
    const deck = deckFromTemplate(night, { lang: 'he', sample: true });
    const { editor, bus } = editorOn(deck);
    bus.dispatch({ type: 'theme.update', patch: { colors: { primary: '#123456' } } });
    await setLogo(editor, new File([new Uint8Array([5, 5, 5])], 'logo.png'));
    const steps = bus.undoStack.length;

    const saved = await saveAsTemplate(editor, library, 'החברה שלי', { label: 'שמירה' });
    expect(saved.theme).toMatchObject({ name: 'החברה שלי' });
    expect(saved.theme.id).toMatch(/^personal_[0-9a-z]{26}$/);
    expect(saved.theme.colors.primary).toBe('#123456');
    expect(saved.dir).toBe('rtl');
    expect(saved.layouts).toEqual(bus.deck.layouts);
    // The layout the template drew by hand for the other direction comes along, logo included.
    expect(saved.flipped?.map((l) => l.id)).toEqual(night.flipped!.map((l) => l.id));
    // The sample slides do not: a template made from a deck holds no slides.
    expect(saved.sample).toBeUndefined();

    const logo = logoAsset(bus.deck)!;
    expect(saved.assets).toEqual({ [logo.id]: logo });
    expect(await library.assetBytes(saved.theme.id, logo)).toEqual(new Uint8Array([5, 5, 5]));
    expect(library.find(saved.theme.id)?.personal).toBe(true);

    // The deck is on the new template: one more step, which undo takes back.
    expect(bus.deck.theme.id).toBe(saved.theme.id);
    expect(bus.undoStack).toHaveLength(steps + 1);
    bus.undo();
    expect(bus.deck.theme.id).toBe('test_night');
    // The saved template is not undone with it.
    expect(library.find(saved.theme.id)).toBeDefined();
  });

  it('saves a plain deck as a template without layouts, and can make it the default', async () => {
    const library = libraryOf(paperTemplate());
    const { editor } = editorOn(createDeck({ lang: 'en' }));
    const saved = await saveAsTemplate(editor, library, 'Plain', { setDefault: true });
    expect(saved.layouts).toEqual([]);
    expect(saved.assets).toBeUndefined();
    expect(library.state.getState().defaultId).toBe(saved.theme.id);
    const next = startDeck(library, 'en');
    expect(next.theme.name).toBe('Plain');
    expect(next.slides).toHaveLength(1);
  });
});
