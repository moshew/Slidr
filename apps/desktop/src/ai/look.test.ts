import {
  ColorToken,
  CommandBus,
  createDeck,
  createSlide,
  type AssetMeta,
  type Deck,
} from '@slidr/model';
import { deckFromTemplate, type Template } from '@slidr/templates';
import { nightTemplate, paperTemplate } from '@slidr/templates/fixtures';
import { beforeEach, describe, expect, it } from 'vitest';
import { builtinFaces, builtinFamilies } from '../fonts/builtinFonts.generated';
import type { Editor } from '../shell';
import { showPreview, stagePreview } from '../stage/preview';
import { saveAsTemplate, setLogo } from '../templates/actions';
import { curatedFonts, curatedPalettes } from '../templates/curated';
import { TemplateLibrary } from '../templates/library';
import { memoryTemplateStore } from '../templates/store';
import {
  applyLook,
  fontChoices,
  isCurrent,
  lookCommands,
  lookPreview,
  palettes,
  previewLook,
  previewNeedsFiles,
  supplyPreview,
  type Look,
} from './look';
import { en, he } from './messages';

/*
 * The look of the deck without a panel: what the deck tool offers, what trying a look puts on
 * the Stage, and what applying one does to the deck and to the undo history.
 */

/** The parts of an editor a look uses: the bus, and asset files kept in memory. */
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

/** A deck on the paper template with its sample slides, and a library that has night too. */
function setup() {
  const deck = deckFromTemplate(paperTemplate(), { lang: 'he', sample: true });
  return { deck, library: libraryOf(paperTemplate(), nightTemplate()), ...editorOn(deck) };
}

const NIGHT: Look = { kind: 'template', id: 'test_night' };
const FOREST: Look = { kind: 'palette', colors: curatedPalettes.forest };
const SERIF: Look = { kind: 'fonts', fonts: curatedFonts[4]! };

beforeEach(() => showPreview(null));

describe('what the deck tool offers', () => {
  it('lists the palettes of the library first, then the curated ones', () => {
    const list = palettes(libraryOf(paperTemplate(), nightTemplate()));
    expect(list.map((palette) => palette.id)).toEqual([
      'template:test_paper',
      'template:test_night',
      ...Object.keys(curatedPalettes),
    ]);
    expect(list[0]).toMatchObject({ name: paperTemplate().theme.name });
    expect(list[0]!.colors).toEqual(paperTemplate().theme.colors);
    // A curated palette has no name of its own: the panel names it in the UI's language.
    expect(list.at(-1)!.name).toBeUndefined();
  });

  it('lists the font pairs of the library first, then the curated ones', () => {
    const list = fontChoices(libraryOf(paperTemplate(), nightTemplate()));
    expect(list.slice(0, 2).map((choice) => choice.fonts)).toEqual([
      paperTemplate().theme.fonts,
      nightTemplate().theme.fonts,
    ]);
    expect(list.slice(2).map((choice) => choice.fonts)).toEqual(curatedFonts);
    expect(new Set(list.map((choice) => choice.id)).size).toBe(list.length);
  });

  it('offers the palette and the fonts of a personal template, and each look once', async () => {
    const library = libraryOf(paperTemplate());
    const night = nightTemplate();
    await library.save({ ...night, theme: { ...night.theme, id: 'personal_brand' } }, []);
    // Saved from a deck that was on the paper template: the same colours and fonts again.
    const paper = paperTemplate();
    await library.save({ ...paper, theme: { ...paper.theme, id: 'personal_copy' } }, []);

    const colours = palettes(library).map((palette) => palette.id);
    expect(colours.slice(0, 2)).toEqual(['template:test_paper', 'template:personal_brand']);
    expect(colours).not.toContain('template:personal_copy');
    const fonts = fontChoices(library).map((choice) => choice.fonts);
    expect(fonts.filter((pair) => pair.heading.he === paper.theme.fonts.heading.he)).toHaveLength(
      // The paper template's own pair, and the curated pair with the same heading.
      2,
    );
    expect(fonts[1]).toEqual(night.theme.fonts);
  });

  it('offers the three built-in templates of the app, with every look listed once', () => {
    const library = new TemplateLibrary(memoryTemplateStore());
    const colours = palettes(library);
    expect(colours.slice(0, 3).map((palette) => palette.id)).toEqual([
      'template:zerem',
      'template:shvil',
      'template:tzuk',
    ]);
    expect(colours).toHaveLength(3 + Object.keys(curatedPalettes).length);
    expect(fontChoices(library)).toHaveLength(3 + curatedFonts.length);
  });
});

describe('the curated palettes', () => {
  const rgb = (hex: string) => {
    expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    return [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
  };
  /** Relative luminance and contrast ratio, as WCAG defines them. */
  const luminance = (hex: string) => {
    const [r, g, b] = rgb(hex).map((channel) => {
      const v = channel / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const contrast = (a: string, b: string) => {
    const [dark, light] = [luminance(a), luminance(b)].sort((x, y) => x - y);
    return (light! + 0.05) / (dark! + 0.05);
  };

  it('measures contrast as WCAG does', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
  });

  it.each(Object.entries(curatedPalettes))('%s reads on a slide', (_id, colors) => {
    // Body text on the slide and on a card, at AAA; captions on the slide, at AA.
    expect(contrast(colors.text, colors.bg)).toBeGreaterThanOrEqual(7);
    expect(contrast(colors.text, colors.surface)).toBeGreaterThanOrEqual(7);
    expect(contrast(colors.muted, colors.bg)).toBeGreaterThanOrEqual(4.5);
    // Layouts write in the primary colour too: a big number, a label.
    expect(contrast(colors.primary, colors.bg)).toBeGreaterThanOrEqual(4.5);
    for (const token of ColorToken.options) rgb(colors[token]);
    expect(colors.chart.length).toBeGreaterThanOrEqual(6);
    expect(colors.chart.slice(0, 3)).toEqual([colors.primary, colors.secondary, colors.accent]);
  });

  it('are light and dark, and each has a name in both languages', () => {
    const dark = Object.values(curatedPalettes).filter((colors) => luminance(colors.bg) < 0.2);
    expect(dark.length).toBeGreaterThanOrEqual(2);
    expect(dark.length).toBeLessThanOrEqual(Object.keys(curatedPalettes).length - 2);
    expect(Object.keys(he.look.palette.names)).toEqual(Object.keys(curatedPalettes));
    expect(Object.keys(en.look.palette.names)).toEqual(Object.keys(curatedPalettes));
  });
});

describe('the curated font pairs', () => {
  const family = (name: string) => builtinFamilies.find((entry) => entry.family === name);
  /** A face of the family that is drawn at 700 without the browser thickening it. */
  const hasBold = (name: string) =>
    builtinFaces.some((face) => {
      const [from, to = from] = face.weight.split(' ').map(Number);
      return face.family === name && face.style === 'normal' && from! <= 700 && to! >= 700;
    });

  it('name only families the app registers, with Hebrew where Hebrew is asked for', () => {
    expect(curatedFonts.length).toBeGreaterThanOrEqual(6);
    for (const fonts of curatedFonts) {
      for (const pair of [fonts.heading, fonts.body]) {
        expect(family(pair.he)?.scripts, pair.he).toContain('he');
        expect(family(pair.latin)?.scripts, pair.latin).toContain('latin');
      }
    }
  });

  it('give headings a family with a real bold face', () => {
    for (const { heading } of curatedFonts) {
      expect(hasBold(heading.he), heading.he).toBe(true);
      expect(hasBold(heading.latin), heading.latin).toBe(true);
    }
  });
});

describe('trying a look on the Stage', () => {
  it.each([
    ['a template', NIGHT],
    ['a palette', FOREST],
    ['a font pair', SERIF],
  ])('shows %s without touching the deck or its history', (_name, look) => {
    const { deck, library, bus } = setup();
    const before = bus.deck;
    previewLook(bus.deck, library, look);
    const shown = stagePreview.getState().deck!;
    expect(shown).not.toBeNull();
    expect(isCurrent(shown.theme, look)).toBe(true);
    // The slides are the deck's own slides, so the Stage finds the one it is on.
    expect(shown.slides.map((slide) => slide.id)).toEqual(deck.slides.map((slide) => slide.id));
    expect(bus.deck).toBe(before);
    expect(bus.deck).toEqual(deck);
    expect(bus.undoStack).toHaveLength(0);
    expect(bus.redoStack).toHaveLength(0);

    previewLook(bus.deck, library, null);
    expect(stagePreview.getState().deck).toBeNull();
  });

  it('shows what applying would leave', async () => {
    for (const look of [NIGHT, FOREST, SERIF]) {
      const { library, editor, bus } = setup();
      const preview = lookPreview(bus.deck, library, look);
      await applyLook(editor, library, look, 'look');
      expect(preview).toEqual(bus.deck);
    }
  });

  it('shows nothing for the look the deck already has, or a template that is gone', () => {
    const { library, bus } = setup();
    for (const look of [
      { kind: 'template', id: 'test_paper' },
      { kind: 'palette', colors: bus.deck.theme.colors },
      { kind: 'fonts', fonts: bus.deck.theme.fonts },
      { kind: 'template', id: 'nope' },
    ] satisfies Look[]) {
      expect(lookCommands(bus.deck, library, look)).toEqual([]);
      previewLook(bus.deck, library, look);
      expect(stagePreview.getState().deck).toBeNull();
    }
  });

  it('stores the logo of a personal template with the document first, and only that', async () => {
    const library = libraryOf(paperTemplate());
    const paper = paperTemplate();
    paper.layouts[0]!.decorations.push({
      id: 'd_logo',
      type: 'shape',
      role: 'logo',
      frame: { x: 1780, y: 80, w: 44, h: 32 },
      rotation: 0,
      opacity: 1,
      geometry: { kind: 'preset', preset: 'rect' },
      fill: { kind: 'solid', color: { token: 'primary' } },
    });
    const source = editorOn(deckFromTemplate(paper, { lang: 'en' }));
    await setLogo(source.editor, new File([new Uint8Array([7, 7])], 'logo.png'));
    const saved = await saveAsTemplate(source.editor, library, 'Mine');
    const logo = Object.values(saved.assets ?? {})[0]!;
    const mine: Look = { kind: 'template', id: saved.theme.id };

    const { editor, bus, imported } = editorOn(createDeck({ lang: 'en', slides: [createSlide()] }));
    const before = bus.deck;
    expect(previewNeedsFiles(bus.deck, library, mine)).toBe(true);
    expect(previewNeedsFiles(bus.deck, library, { kind: 'template', id: 'test_paper' })).toBe(
      false,
    );
    expect(previewNeedsFiles(bus.deck, library, FOREST)).toBe(false);
    await supplyPreview(editor, library, mine);
    expect(imported).toEqual([logo.file]);
    expect(bus.deck).toBe(before);
    expect(bus.undoStack).toHaveLength(0);
    // The preview names the asset; the deck does not, until the template is applied.
    expect(lookPreview(bus.deck, library, mine)!.assets[logo.id]).toEqual(logo);
    expect(bus.deck.assets).toEqual({});
  });
});

describe('applying a look', () => {
  it('switches the template in one undo step', async () => {
    const { deck, library, editor, bus } = setup();
    expect(await applyLook(editor, library, NIGHT, 'החלפת תבנית')).toBe(true);
    expect(bus.deck.theme.id).toBe('test_night');
    // The template's layouts, then the ones of archetypes it lacks, which their slides keep.
    const night = nightTemplate().layouts.map((layout) => layout.id);
    expect(bus.deck.layouts.map((layout) => layout.id).slice(0, night.length)).toEqual(night);
    expect(bus.undoStack).toHaveLength(1);
    expect(bus.undoStack[0]).toMatchObject({ actor: 'user', label: 'החלפת תבנית' });
    const applied = bus.deck;

    expect(bus.undo()).toBe(true);
    expect(bus.deck).toEqual(deck);
    expect(bus.redo()).toBe(true);
    expect(bus.deck).toEqual(applied);
  });

  it('sets the palette with one command, in one undo step', async () => {
    const { deck, library, editor, bus } = setup();
    expect(lookCommands(bus.deck, library, FOREST)).toEqual([
      { type: 'theme.update', patch: { colors: curatedPalettes.forest } },
    ]);
    expect(await applyLook(editor, library, FOREST, 'פלטה')).toBe(true);
    expect(bus.deck.theme.colors).toEqual(curatedPalettes.forest);
    // Only the colours: the rest of the theme, the layouts and the slides are as they were.
    expect({ ...bus.deck, theme: { ...bus.deck.theme, colors: deck.theme.colors } }).toEqual(deck);
    expect(bus.undoStack).toHaveLength(1);
    expect(bus.undoStack[0]).toMatchObject({ label: 'פלטה', commands: ['theme.update'] });
    const applied = bus.deck;

    expect(bus.undo()).toBe(true);
    expect(bus.deck).toEqual(deck);
    expect(bus.redo()).toBe(true);
    expect(bus.deck).toEqual(applied);
  });

  it('sets the font pair with one command, in one undo step', async () => {
    const { deck, library, editor, bus } = setup();
    expect(lookCommands(bus.deck, library, SERIF)).toEqual([
      { type: 'theme.update', patch: { fonts: curatedFonts[4] } },
    ]);
    expect(await applyLook(editor, library, SERIF, 'גופנים')).toBe(true);
    expect(bus.deck.theme.fonts).toEqual(curatedFonts[4]);
    expect({ ...bus.deck, theme: { ...bus.deck.theme, fonts: deck.theme.fonts } }).toEqual(deck);
    expect(bus.undoStack).toHaveLength(1);
    expect(bus.undoStack[0]).toMatchObject({ label: 'גופנים', commands: ['theme.update'] });
    const applied = bus.deck;

    expect(bus.undo()).toBe(true);
    expect(bus.deck).toEqual(deck);
    expect(bus.redo()).toBe(true);
    expect(bus.deck).toEqual(applied);
  });

  it('takes the preview down', async () => {
    const { library, editor, bus } = setup();
    previewLook(bus.deck, library, FOREST);
    expect(stagePreview.getState().deck).not.toBeNull();
    await applyLook(editor, library, FOREST, 'פלטה');
    expect(stagePreview.getState().deck).toBeNull();
  });

  it('does nothing for the look the deck already has', async () => {
    const { deck, library, editor, bus } = setup();
    for (const look of [NIGHT, FOREST, SERIF]) {
      expect(await applyLook(editor, library, look, 'look')).toBe(true);
      expect(await applyLook(editor, library, look, 'look')).toBe(false);
    }
    expect(bus.undoStack).toHaveLength(3);
    expect(await applyLook(editor, library, { kind: 'template', id: 'nope' }, 'look')).toBe(false);
    expect(bus.undoStack).toHaveLength(3);
    while (bus.undo());
    expect(bus.deck).toEqual(deck);
  });
});

describe('the look the deck has', () => {
  it('is the template the deck is on, also after its colours were changed', async () => {
    const { library, editor, bus } = setup();
    const paper: Look = { kind: 'template', id: 'test_paper' };
    expect(isCurrent(bus.deck.theme, paper)).toBe(true);
    expect(isCurrent(bus.deck.theme, NIGHT)).toBe(false);

    await applyLook(editor, library, FOREST, 'פלטה');
    expect(isCurrent(bus.deck.theme, paper)).toBe(true);
    // What the user changed since is the deck's own: the template it is on does not undo it.
    expect(lookCommands(bus.deck, library, paper)).toEqual([]);

    await applyLook(editor, library, NIGHT, 'תבנית');
    expect(isCurrent(bus.deck.theme, NIGHT)).toBe(true);
    expect(isCurrent(bus.deck.theme, paper)).toBe(false);
  });

  it('is the palette whose colours the theme has, all of them', async () => {
    const { library, editor, bus } = setup();
    const own = (deck: Deck) =>
      palettes(library)
        .filter((palette) => isCurrent(deck.theme, { kind: 'palette', colors: palette.colors }))
        .map((palette) => palette.id);
    expect(own(bus.deck)).toEqual(['template:test_paper']);

    await applyLook(editor, library, FOREST, 'פלטה');
    expect(own(bus.deck)).toEqual(['forest']);
    // Hex colours are the same colour in either case.
    bus.dispatch({
      type: 'theme.update',
      patch: { colors: { primary: curatedPalettes.forest.primary.toUpperCase() } },
    });
    expect(own(bus.deck)).toEqual(['forest']);

    bus.dispatch({ type: 'theme.update', patch: { colors: { accent: '#123456' } } });
    expect(own(bus.deck)).toEqual([]);
  });

  it('is the font pair whose four families the theme has', async () => {
    const { library, editor, bus } = setup();
    const own = (deck: Deck) =>
      fontChoices(library)
        .filter((choice) => isCurrent(deck.theme, { kind: 'fonts', fonts: choice.fonts }))
        .map((choice) => choice.fonts);
    expect(own(bus.deck)).toEqual([paperTemplate().theme.fonts]);

    await applyLook(editor, library, SERIF, 'גופנים');
    expect(own(bus.deck)).toEqual([curatedFonts[4]]);

    bus.dispatch({
      type: 'theme.update',
      patch: { fonts: { body: { he: 'Alef', latin: 'Inter' } } },
    });
    expect(own(bus.deck)).toEqual([]);
  });
});
