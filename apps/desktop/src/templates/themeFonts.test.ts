// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CommandBus, createDeck, createSlide, type AssetMeta } from '@slidr/model';
import { paperTemplate } from '@slidr/templates/fixtures';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyLook, fontChoices } from '../ai/look';
import type { AssetService } from '../document/assets';
import { watchUserFonts } from '../fonts/embed';
import { addUserFont, memoryFontStore, setUserFontStore } from '../fonts/userFonts';
import type { Editor } from '../shell';
import { applyLibraryTemplate, setThemeFont } from './actions';
import { TemplateLibrary } from './library';
import { memoryTemplateStore } from './store';

/*
 * A font of the user's that the theme comes to name, from the Templates panel or from the deck
 * tool's gallery of looks. The deck carries the font's files (SPEC 5.7), and they are added by
 * the watcher of `fonts/embed.ts`, which joins the undo step of the change that named the family
 * only when that change has a transaction. These changes have one, so choosing a font is one
 * step to undo, not two.
 */

const FAMILY = 'Slidr Fixture Sans';
const fixture = (name: string) => {
  const path = join(dirname(fileURLToPath(import.meta.url)), '../../e2e/fixtures/fonts', name);
  return new File([readFileSync(path)], name);
};

/** The asset store of a document, by content, as the app's is. */
function assetStore(): AssetService {
  return {
    import: async (file, origin = 'upload') => {
      const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      const id = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join(
        '',
      );
      return {
        id,
        file: `${id}.ttf`,
        mime: 'font/ttf',
        kind: 'font',
        bytes: file.size,
        origin,
        name: file.name,
      };
    },
    url: () => undefined,
  };
}

const fontsOf = (bus: CommandBus): AssetMeta[] =>
  Object.values(bus.deck.assets).filter((asset) => asset.kind === 'font');
/** Lets the files reach the deck: storing them takes a few turns of the event loop. */
const settled = () => new Promise((resolve) => setTimeout(resolve, 20));

let bus: CommandBus;
let editor: Editor;
let stop: () => void;

beforeEach(async () => {
  setUserFontStore(memoryFontStore());
  await addUserFont(fixture('fixture-sans-bold.ttf'), (bytes) => Promise.resolve(bytes));
  bus = new CommandBus(createDeck({ slides: [createSlide({ id: 's_1' })] }), { validate: true });
  const assets = assetStore();
  editor = { bus, assets } as unknown as Editor;
  stop = watchUserFonts({ bus, assets, label: (family) => `store ${family}` });
  await settled();
});

afterEach(() => stop());

describe("a font of the user's that the theme comes to name", () => {
  it('chosen for the headings: the font and its files are one step, and one undo takes both back', async () => {
    const before = bus.deck;
    setThemeFont(editor, 'heading', { he: 'Heebo', latin: FAMILY }, 'Font');
    await settled();
    expect(bus.deck.theme.fonts.heading.latin).toBe(FAMILY);
    expect(fontsOf(bus).map((asset) => asset.font?.family)).toEqual([FAMILY]);
    // Before, the files were a second step: the first Ctrl+Z changed nothing one could see.
    expect(bus.undoStack.map((entry) => entry.label)).toEqual(['Font']);
    bus.undo();
    expect(bus.deck).toEqual(before);
    bus.redo();
    expect(fontsOf(bus)).toHaveLength(1);
    expect(bus.deck.theme.fonts.heading.latin).toBe(FAMILY);
  });

  it('named by a personal template the deck is switched to: one step as well', async () => {
    const template = paperTemplate();
    template.theme = {
      ...template.theme,
      id: 'personal_fonts',
      fonts: { ...template.theme.fonts, body: { he: 'Heebo', latin: FAMILY } },
    };
    const library = new TemplateLibrary(memoryTemplateStore());
    await library.save(template, []);
    const before = bus.deck;
    expect(await applyLibraryTemplate(editor, library, 'personal_fonts', 'Apply')).toBe(true);
    await settled();
    expect(bus.deck.theme.id).toBe('personal_fonts');
    expect(fontsOf(bus)).toHaveLength(1);
    expect(bus.undoStack.map((entry) => entry.label)).toEqual(['Apply']);
    bus.undo();
    expect(bus.deck).toEqual(before);
  });

  it("chosen as a font pair in the deck tool's gallery of looks: one step as well", async () => {
    // The gallery lists the font pairs of the library's templates, a personal one among them,
    // and a personal template can name a font of the user's.
    const template = paperTemplate();
    const fonts = { ...template.theme.fonts, body: { he: 'Heebo', latin: FAMILY } };
    template.theme = { ...template.theme, id: 'personal_fonts', fonts };
    const library = new TemplateLibrary(memoryTemplateStore());
    await library.save(template, []);
    expect(fontChoices(library).map((choice) => choice.fonts)).toContainEqual(fonts);
    const before = bus.deck;
    expect(await applyLook(editor, library, { kind: 'fonts', fonts }, 'Fonts')).toBe(true);
    await settled();
    expect(bus.deck.theme.fonts).toEqual(fonts);
    expect(fontsOf(bus).map((asset) => asset.font?.family)).toEqual([FAMILY]);
    expect(bus.undoStack.map((entry) => entry.label)).toEqual(['Fonts']);
    bus.undo();
    expect(bus.deck).toEqual(before);
  });
});
