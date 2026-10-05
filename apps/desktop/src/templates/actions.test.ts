import {
  CommandBus,
  createDeck,
  slideFromLayout,
  type AssetMeta,
  type Deck,
  type Layout,
} from '@slidr/model';
import {
  deckFooter,
  deckFromTemplate,
  layoutsFor,
  masterState,
  slideNumberHidden,
  type Template,
} from '@slidr/templates';
import { builtInTemplates, zeremTemplate } from '@slidr/templates/builtin';
import { nightTemplate, paperTemplate } from '@slidr/templates/fixtures';
import { describe, expect, it } from 'vitest';
import type { Editor } from '../shell';
import {
  applyLibraryTemplate,
  followDirection,
  logoAsset,
  logoHidden,
  logoLayouts,
  renameTemplate,
  saveAsTemplate,
  setFooter,
  setLogo,
  showLogo,
  showNumber,
  startDeck,
  supplyAssets,
  switchCommands,
  turnDeck,
  updateTemplate,
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
    const logo = Object.values(saved.assets!)[0]!;
    expect(await supplyAssets(fresh.editor, library)).toEqual([logo]);
    expect(fresh.imported).toEqual([logo.file]);
    // A deck on a built-in template has nothing to store.
    const plain = editorOn(deckFromTemplate(paperTemplate(), { lang: 'he' }));
    expect(await supplyAssets(plain.editor, library)).toEqual([]);
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

  it('lets the layouts follow a direction that was set on the field alone, as the agent sets it', () => {
    const night = nightTemplate();
    const deck = deckFromTemplate(night, { lang: 'he', sample: true });
    // A slide the agent wrote for the direction it meant: on no layout.
    deck.slides.push({
      id: 's_free',
      elements: [{ ...deck.slides[0]!.elements[0]!, id: 'e_free' }],
      timeline: [],
    });
    const { bus } = editorOn(deck);
    const library = libraryOf(night);
    expect(followDirection(bus.deck, 'rtl', library)).toEqual([]);

    // One transaction, as the agent's turn is: the field, and what follows it.
    bus.dispatch({ type: 'deck.setMeta', patch: { dir: 'ltr', lang: 'en' } }, { txId: 'tx_turn' });
    bus.batch(followDirection(bus.deck, 'rtl', library), { txId: 'tx_turn' });
    // The layouts are the template's own for the new direction, and a slide on a layout went
    // with its placeholders: the deck is what turning it by the control gives.
    expect(bus.deck.layouts).toEqual(layoutsFor(night, 'ltr'));
    const turned = editorOn(deck);
    turnDeck(turned.editor, library, 'ltr');
    expect(bus.deck.slides.slice(0, -1)).toEqual(turned.bus.deck.slides.slice(0, -1));
    // The slide on no layout was left as it was written.
    expect(bus.deck.slides.at(-1)).toEqual(deck.slides.at(-1));
    expect(turned.bus.deck.slides.at(-1)).not.toEqual(deck.slides.at(-1));
    // Undoing the turn takes the field and the layouts back together.
    bus.undoTransaction('tx_turn');
    expect(bus.deck).toEqual(deck);
  });

  describe('a direction that differs from what it was, with the layouts already turned', () => {
    // The wrapper around a tool call of the agent reads the direction before the call and after
    // it, and asks what has to follow. All it knows is that the two differ.
    const library = () =>
      new TemplateLibrary(memoryTemplateStore(), {
        layoutName: (archetype, lang) => `${lang}: ${archetype}`,
      });
    const onTzuk = (lib: TemplateLibrary) => {
      const template = lib.forDeck('tzuk', 'he')!;
      const deck = deckFromTemplate(template, { lang: 'he' });
      deck.slides = [slideFromLayout(deck, deck.layouts[0]!.id).slide];
      return { template, ...editorOn(deck) };
    };

    it('follows nothing when the user turned the deck during the call', () => {
      const lib = library();
      const { editor, bus, template } = onTzuk(lib);
      const from = bus.deck.meta.dir;
      turnDeck(editor, lib, 'ltr');
      expect(bus.deck.layouts).toEqual(layoutsFor(template, 'ltr'));
      // Before, this was 19 commands that mirrored every layout back.
      expect(followDirection(bus.deck, from, lib)).toEqual([]);
    });

    it('follows nothing when the deck has a footer and a logo of its own, either', async () => {
      const lib = library();
      const { editor, bus } = onTzuk(lib);
      setFooter(editor, 'ACME 2026');
      await setLogo(editor, new File([new Uint8Array([7])], 'logo.png'));
      turnDeck(editor, lib, 'ltr');
      expect(followDirection(bus.deck, 'rtl', lib)).toEqual([]);
    });

    it('follows nothing when an undo took a turn back during the call', () => {
      const lib = library();
      const { editor, bus } = onTzuk(lib);
      turnDeck(editor, lib, 'ltr');
      const from = bus.deck.meta.dir;
      bus.undo();
      expect(bus.deck.meta.dir).toBe('rtl');
      expect(followDirection(bus.deck, from, lib)).toEqual([]);
    });

    it('follows nothing when another document, of the other direction, was opened during the call', () => {
      const lib = library();
      const { bus } = onTzuk(lib);
      const from = bus.deck.meta.dir;
      bus.reset(deckFromTemplate(lib.forDeck('zerem', 'en')!, { lang: 'en' }));
      expect(bus.deck.meta.dir).toBe('ltr');
      expect(followDirection(bus.deck, from, lib)).toEqual([]);
    });

    it('still follows a direction the agent set on the field alone, with the language', () => {
      const lib = library();
      const { bus, template } = onTzuk(lib);
      const names = bus.deck.layouts.map((layout) => layout.name);
      bus.dispatch({ type: 'deck.setMeta', patch: { dir: 'ltr', lang: 'en' } }, { txId: 'tx' });
      const follow = followDirection(bus.deck, 'rtl', lib);
      bus.batch(follow, { txId: 'tx' });
      // The layouts are the template's own for the direction, the quote drawn by hand among
      // them, under the names the deck had: the library names them in English now.
      const theirs = layoutsFor(template, 'ltr');
      expect(bus.deck.layouts.map(({ name: _name, ...rest }) => rest)).toEqual(
        theirs.map(({ name: _name, ...rest }) => rest),
      );
      expect(bus.deck.layouts.map((layout) => layout.name)).toEqual(names);
      expect(lib.forDeck('tzuk', 'en')!.layouts[0]!.name).not.toBe(names[0]);
      // Asked again, there is nothing more to follow.
      expect(followDirection(bus.deck, 'rtl', lib)).toEqual([]);
      expect(bus.undoStack).toHaveLength(1);
    });

    it('takes the field at its word where no template can tell', () => {
      // A deck whose theme is not in the library: nothing says what its layouts are drawn for.
      const lib = library();
      const { bus } = onTzuk(lib);
      bus.dispatch({ type: 'theme.update', patch: { name: 'Mine' } });
      const unknown = { ...bus.deck, theme: { ...bus.deck.theme, id: 'somewhere_else' } };
      const turned = { ...unknown, meta: { ...unknown.meta, dir: 'ltr' as const } };
      expect(followDirection(turned, 'rtl', lib).length).toBeGreaterThan(0);
    });
  });

  describe('a deck with a footer, a logo and a hidden number of its own', () => {
    const builtIn = () => new TemplateLibrary(memoryTemplateStore());
    /** A deck on a built-in template with all three master components set, as the panel sets them. */
    async function withMaster(id: string, library: TemplateLibrary) {
      const template = library.forDeck(id, 'he')!;
      const made = editorOn(deckFromTemplate(template, { lang: 'he' }));
      setFooter(made.editor, 'ACME 2026');
      showNumber(made.editor, false);
      await setLogo(made.editor, new File([new Uint8Array([7])], 'logo.png'));
      return { ...made, template };
    }
    const drawing = ({ background, placeholders, decorations }: Layout) => ({
      background,
      placeholders,
      decorations: decorations.filter(
        (d) => d.role !== 'footer' && d.role !== 'logo' && d.role !== 'slideNumber',
      ),
    });

    // The four that draw something by hand for the other direction in different ways: a
    // quotation mark (tzuk, shvil, lavan), and backgrounds of free CSS (zerem).
    it.each(['tzuk', 'zerem', 'shvil', 'lavan'])(
      '%s: turns onto the layouts its template drew by hand, with what it set, and back',
      async (id) => {
        const library = builtIn();
        const { editor, bus, template } = await withMaster(id, library);
        const set = bus.deck;
        turnDeck(editor, library, 'ltr');
        expect(bus.undoStack).toHaveLength(4);

        const theirs = layoutsFor(template, 'ltr');
        expect(template.flipped!.length).toBeGreaterThan(0);
        expect(bus.deck.layouts.map(drawing)).toEqual(theirs.map(drawing));
        // What the deck set is still there, on the side the turned layouts have for it.
        expect(masterState(bus.deck)).toEqual({ footer: 'ACME 2026', numberHidden: true });
        const logo = logoAsset(bus.deck)!;
        for (const [i, layout] of bus.deck.layouts.entries()) {
          const mine = layout.decorations.find((d) => d.role === 'logo');
          const mark = theirs[i]!.decorations.find((d) => d.role === 'logo');
          if (!mark) continue;
          // As tall as the template's mark and on its side of the slide; the picture, not the mark.
          expect(mine).toMatchObject({ type: 'image', assetId: logo.id });
          expect(mine!.frame.y).toBe(mark.frame.y);
          expect(mine!.frame.x + mine!.frame.w / 2 < 960).toBe(
            mark.frame.x + mark.frame.w / 2 < 960,
          );
        }

        turnDeck(editor, library, 'rtl');
        expect(bus.deck).toEqual(set);
      },
    );

    it.each(['tzuk', 'zerem'])(
      '%s: saved as a personal template, gives a deck of the other direction what turning gives',
      async (id) => {
        const library = builtIn();
        const turned = await withMaster(id, library);
        turnDeck(turned.editor, library, 'ltr');

        const { editor } = await withMaster(id, library);
        const saved = await saveAsTemplate(editor, library, 'Mine');
        expect(layoutsFor(saved, 'ltr')).toEqual(turned.bus.deck.layouts);
      },
    );

    it('a personal template of a deck that set nothing has the layouts of its template in both directions', async () => {
      const library = builtIn();
      for (const id of ['tzuk', 'zerem']) {
        const template = library.forDeck(id, 'he')!;
        const { editor } = editorOn(deckFromTemplate(template, { lang: 'he' }));
        const saved = await saveAsTemplate(editor, library, `Mine ${id}`);
        expect(layoutsFor(saved, 'rtl')).toEqual(layoutsFor(template, 'rtl'));
        expect(layoutsFor(saved, 'ltr')).toEqual(layoutsFor(template, 'ltr'));
      }
    });
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

describe('the master components of the deck (SLD-04)', () => {
  const library = () => libraryOf(...builtInTemplates());
  const png = (name: string) => new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' });

  it('hides and shows the slide number, and sets and clears the footer, each as one step', () => {
    const { editor, bus } = editorOn(deckFromTemplate(tzukTemplate(), { lang: 'he' }));
    showNumber(editor, false, 'מספר');
    expect(slideNumberHidden(bus.deck)).toBe(true);
    setFooter(editor, 'צוק · 2026', 'כותרת תחתונה');
    expect(deckFooter(bus.deck)).toBe('צוק · 2026');
    expect(bus.undoStack.map((step) => step.label)).toEqual(['מספר', 'כותרת תחתונה']);
    // What is already so is no step.
    setFooter(editor, 'צוק · 2026');
    showNumber(editor, false);
    expect(bus.undoStack).toHaveLength(2);
    bus.undo();
    bus.undo();
    expect(masterState(bus.deck)).toEqual({ footer: '', numberHidden: false });
  });

  it('a switch of template keeps the footer, the hidden number and the logo, as one step', async () => {
    const start = deckFromTemplate(tzukTemplate(), { lang: 'he', sample: true });
    const { editor, bus } = editorOn(start);
    setFooter(editor, 'צוק · 2026');
    showNumber(editor, false);
    await setLogo(editor, png('logo.png'));
    const before = bus.deck;
    const steps = bus.undoStack.length;

    expect(await applyLibraryTemplate(editor, library(), 'zerem', 'החלפת תבנית')).toBe(true);
    expect(bus.undoStack).toHaveLength(steps + 1);
    expect(bus.deck.theme.id).toBe('zerem');
    expect(masterState(bus.deck)).toEqual({ footer: 'צוק · 2026', numberHidden: true });
    // The user's picture stands where the new template drew its mark.
    expect(logoAsset(bus.deck)?.name).toBe('logo.png');
    expect(logoLayouts(bus.deck).every((layout) => layout.id.startsWith('l_zerem_'))).toBe(true);
    bus.undo();
    expect(bus.deck).toEqual(before);
  });

  it('a deck that set none of them gets the template as it was drawn', async () => {
    const { editor, bus } = editorOn(deckFromTemplate(tzukTemplate(), { lang: 'he' }));
    await applyLibraryTemplate(editor, library(), 'zerem');
    expect(bus.deck.layouts).toEqual(layoutsFor(zeremTemplate(), 'rtl'));
    expect(switchCommands(bus.deck, zeremTemplate())).toEqual([]);
  });

  it('a hidden logo stays hidden on the new template', async () => {
    const { editor, bus } = editorOn(deckFromTemplate(tzukTemplate(), { lang: 'he' }));
    showLogo(editor, false);
    await applyLibraryTemplate(editor, library(), 'zerem');
    expect(logoHidden(bus.deck)).toBe(true);
  });
});

const tzukTemplate = () => builtInTemplates().find((template) => template.theme.id === 'tzuk')!;

describe('a personal template that exists (THM-05)', () => {
  async function saved() {
    const night = withLogo(nightTemplate());
    const library = libraryOf(night, paperTemplate());
    const { editor, bus } = editorOn(deckFromTemplate(night, { lang: 'he', sample: true }));
    await setLogo(editor, new File([new Uint8Array([5, 5, 5])], 'logo.png'));
    const template = await saveAsTemplate(editor, library, 'החברה שלי', { setDefault: true });
    return { library, editor, bus, id: template.theme.id };
  }

  it('takes another name, and keeps its id, its files and its place as the default', async () => {
    const { library, bus, id } = await saved();
    const logo = logoAsset(bus.deck)!;
    expect(await renameTemplate(library, id, '  המותג החדש ')).toBe(true);
    const entry = library.find(id)!;
    expect(entry.template.theme).toMatchObject({ id, name: 'המותג החדש' });
    expect(library.entries().filter((e) => e.personal)).toHaveLength(1);
    expect(library.state.getState().defaultId).toBe(id);
    expect(await library.assetBytes(id, logo)).toEqual(new Uint8Array([5, 5, 5]));
    // The same name, an empty name and a built-in template are no change.
    expect(await renameTemplate(library, id, 'המותג החדש')).toBe(false);
    expect(await renameTemplate(library, id, '   ')).toBe(false);
    expect(await renameTemplate(library, 'test_paper', 'Mine')).toBe(false);
  });

  it('is updated in place from the open deck: the same id and name, the new look', async () => {
    const { library, editor, bus, id } = await saved();
    bus.dispatch({ type: 'theme.update', patch: { colors: { primary: '#aa0033' } } });
    const steps = bus.undoStack.length;
    const updated = await updateTemplate(editor, library, id, 'שמירה');
    expect(updated?.theme).toMatchObject({ id, name: 'החברה שלי' });
    expect(updated?.theme.colors.primary).toBe('#aa0033');
    expect(library.entries().filter((e) => e.personal)).toHaveLength(1);
    expect(library.find(id)?.template.theme.colors.primary).toBe('#aa0033');
    expect(library.state.getState().defaultId).toBe(id);
    // The deck was already on the template and already looks like it: no step is added.
    expect(bus.undoStack).toHaveLength(steps);
    // A new deck opens with the new look.
    expect(startDeck(library, 'he').theme.colors.primary).toBe('#aa0033');
  });

  it('takes the look of a deck that is on another template, and puts the deck on it', async () => {
    const { library, id } = await saved();
    const { editor, bus } = editorOn(deckFromTemplate(paperTemplate(), { lang: 'he' }));
    await updateTemplate(editor, library, id);
    expect(library.find(id)?.template.layouts.map((l) => l.id)).toEqual(
      bus.deck.layouts.map((l) => l.id),
    );
    expect(bus.deck.theme).toMatchObject({ id, name: 'החברה שלי' });
    expect(bus.undoStack).toHaveLength(1);
    expect(await updateTemplate(editor, library, 'test_paper')).toBeUndefined();
  });
});
