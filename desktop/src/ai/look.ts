/**
 * The look of the deck in the deck tool (WG11-T04, WG7-T11b; AID-05, THM-03): the templates of
 * the library, colour palettes and font pairs. Each can be tried on the Stage without changing
 * the deck (STG-10), and applying one is one undo step. None of them is AI: they are edits of
 * the user, like the controls of row B.
 *
 * No React here: the lists are what the panel draws, and the functions are what its cards do.
 */
import {
  ColorToken,
  CommandBus,
  newId,
  type AssetMeta,
  type Command,
  type Deck,
  type Theme,
} from '@slidr/model';
import { layoutAssets, layoutsFor, type Template } from '@slidr/templates';
import type { Editor } from '../shell';
import { showPreview } from '../stage/preview';
import { applyLibraryTemplate, copyAssets, switchTo } from '../templates/actions';
import {
  curatedFonts,
  curatedPalettes,
  type ThemeColors,
  type ThemeFonts,
} from '../templates/curated';
import type { TemplateLibrary } from '../templates/library';

/** A change of the deck's look: a template of the library, a palette, or a font pair. */
export type Look =
  | { kind: 'template'; id: string }
  | { kind: 'palette'; colors: ThemeColors }
  | { kind: 'fonts'; fonts: ThemeFonts };

export interface Palette {
  /** The id of a curated palette, or `template:<id>` for the palette of a library template. */
  id: string;
  /** The template the palette is of. A curated palette is named in the language of the UI. */
  name?: string;
  colors: ThemeColors;
}

export interface FontChoice {
  /** The four families, so a pair keeps its id while the list around it changes. */
  id: string;
  fonts: ThemeFonts;
}

const sameColor = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The seven tokens and the chart series: everything a palette sets. */
export function samePalette(a: ThemeColors, b: ThemeColors): boolean {
  return (
    ColorToken.options.every((token) => sameColor(a[token], b[token])) &&
    a.chart.length === b.chart.length &&
    a.chart.every((color, i) => sameColor(color, b.chart[i]!))
  );
}

export function sameFonts(a: ThemeFonts, b: ThemeFonts): boolean {
  return (['heading', 'body'] as const).every(
    (role) => a[role].he === b[role].he && a[role].latin === b[role].latin,
  );
}

/**
 * The palettes the deck tool offers: the ones of the library's templates, so the colours of a
 * personal template (a brand) are there, then the curated ones. A palette that repeats an
 * earlier one (a template saved from a deck on another) is listed once.
 */
export function palettes(library: TemplateLibrary): Palette[] {
  const all: Palette[] = [
    ...library.entries().map(({ template: { theme } }) => ({
      id: `template:${theme.id}`,
      name: theme.name,
      colors: theme.colors,
    })),
    ...Object.entries(curatedPalettes).map(([id, colors]) => ({ id, colors })),
  ];
  return all.filter(
    (palette, i) => !all.slice(0, i).some((earlier) => samePalette(earlier.colors, palette.colors)),
  );
}

/** The font pairs the deck tool offers: the library's own, then the curated ones, each once. */
export function fontChoices(library: TemplateLibrary): FontChoice[] {
  const all = [...library.entries().map((entry) => entry.template.theme.fonts), ...curatedFonts];
  return all
    .filter((fonts, i) => !all.slice(0, i).some((earlier) => sameFonts(earlier, fonts)))
    .map((fonts) => ({
      id: [fonts.heading.he, fonts.heading.latin, fonts.body.he, fonts.body.latin].join('|'),
      fonts,
    }));
}

/**
 * The deck's theme already has this look. For a template that is the template the deck is on,
 * as the library has it (the theme's id): what was changed since (a colour, the logo) is the
 * deck's own, and a click on the template it is on must not take it away.
 */
export function isCurrent(theme: Theme, look: Look): boolean {
  if (look.kind === 'template') return theme.id === look.id;
  if (look.kind === 'palette') return samePalette(theme.colors, look.colors);
  return sameFonts(theme.fonts, look.fonts);
}

/**
 * What applying a look does to the deck as it is now. Nothing for the look it already has.
 *
 * A template is the switch the Templates panel makes (`switchTo`): it keeps the footer the user
 * wrote, a slide number they hid and their logo (SLD-04). The preview is of the same switch, so
 * what is tried on the Stage is what a click gives.
 */
export function lookCommands(deck: Deck, library: TemplateLibrary, look: Look): Command[] {
  if (isCurrent(deck.theme, look)) return [];
  if (look.kind === 'template') return templateSwitch(deck, library, look.id)?.commands ?? [];
  return [
    {
      type: 'theme.update',
      patch: look.kind === 'palette' ? { colors: look.colors } : { fonts: look.fonts },
    },
  ];
}

/** The switch of the deck to a template of the library: its commands, and the deck they leave. */
function templateSwitch(deck: Deck, library: TemplateLibrary, id: string) {
  const template = library.forDeck(id, deck.meta.lang);
  return template ? switchTo(deck, template) : undefined;
}

/**
 * The deck as a look would leave it, for the Stage's preview layer; null when the look changes
 * nothing. The commands run on a bus of their own, so the deck and its history stay as they are.
 */
export function lookPreview(deck: Deck, library: TemplateLibrary, look: Look): Deck | null {
  try {
    if (look.kind === 'template') {
      if (isCurrent(deck.theme, look)) return null;
      // The switch is worked out on a bus of its own already, and the deck it leaves is the
      // preview: running its commands again took as long again on a large deck.
      const switched = templateSwitch(deck, library, look.id);
      return switched && switched.commands.length > 0 ? switched.deck : null;
    }
    const commands = lookCommands(deck, library, look);
    if (commands.length === 0) return null;
    const scratch = new CommandBus(deck);
    scratch.batch(commands);
    return scratch.deck;
  } catch (error) {
    // A look that cannot be drawn is not shown; applying it would say why.
    console.error('The look could not be previewed', error);
    return null;
  }
}

/** Shows a look on the Stage without changing the deck; `null` takes the preview down. */
export function previewLook(deck: Deck, library: TemplateLibrary, look: Look | null): void {
  showPreview(look ? lookPreview(deck, library, look) : null);
}

/**
 * The pictures a look brings: the ones the layouts of a personal template draw (a logo). The
 * layouts of a built-in template draw none.
 */
function picturesOf(
  deck: Deck,
  library: TemplateLibrary,
  look: Look,
): { template: Template; assets: AssetMeta[] } | undefined {
  if (look.kind !== 'template' || isCurrent(deck.theme, look)) return undefined;
  const template = library.forDeck(look.id, deck.meta.lang);
  if (!template) return undefined;
  const assets = layoutAssets(template, layoutsFor(template, deck.meta.dir));
  return assets.length > 0 ? { template, assets } : undefined;
}

/** A preview of the look has pictures to store with the document first (see `supplyPreview`). */
export function previewNeedsFiles(deck: Deck, library: TemplateLibrary, look: Look): boolean {
  return picturesOf(deck, library, look) !== undefined;
}

/**
 * Stores the pictures of a look with the open document, as applying it would: the Stage loads
 * pictures from the document, so a preview shows a logo only when its file is there. Assets are
 * addressed by content, so storing a file again changes nothing; the deck itself is not
 * touched, and a file the deck does not name is not saved with it.
 */
export async function supplyPreview(
  editor: Editor,
  library: TemplateLibrary,
  look: Look,
): Promise<void> {
  const pictures = picturesOf(editor.bus.deck, library, look);
  if (pictures) await copyAssets(editor, library, pictures.template, pictures.assets);
}

/**
 * Applies a look as one undo step, and takes the preview down. False when the deck already has
 * it, or the template is gone from the library.
 */
export async function applyLook(
  editor: Editor,
  library: TemplateLibrary,
  look: Look,
  label: string,
): Promise<boolean> {
  showPreview(null);
  if (isCurrent(editor.bus.deck.theme, look)) return false;
  // A template brings files: the library's own action stores them before the commands.
  if (look.kind === 'template') return applyLibraryTemplate(editor, library, look.id, label);
  // With a transaction, so the files of a font of the user's that a pair names join this step
  // and do not become a second one (see `setThemeFont`).
  editor.bus.batch(lookCommands(editor.bus.deck, library, look), { txId: newId('tx'), label });
  return true;
}
