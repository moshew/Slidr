import type { AssetMeta, CommandBus, Deck, DispatchOptions } from '@slidr/model';
import type { AssetService } from '../document/assets';
import {
  loadUserFonts,
  subscribeUserFonts,
  userFontFile,
  userFonts,
  type UserFont,
} from './userFonts';

/*
 * A deck that uses one of the user's fonts carries it (SPEC 5.7): the font's files become font
 * assets of the deck, so the deck's file has them, and so has what is exported from it. This
 * watches the open deck and hands a font over when a change names its family: a font chosen in
 * the picker, text pasted from another deck, HTML the agent wrote.
 *
 * The files join the change that named the family, as one undo step, whenever that change has a
 * transaction to join (every text tool and every agent turn has one). A change without one, such
 * as a font of the theme, gets them as a step of its own, right after it.
 *
 * A deck that is opened already naming one of the user's fonts, without carrying it, is not
 * changed by being opened: it gets the files with its next change.
 */

/** The fields of the model that hold a family's name and nothing else. */
const FAMILY_FIELD = /^(?:font|he|latin|family|fontfamily|font-family)$/i;
/** Free CSS and HTML name a family in a declaration: `font-family: ...`, `font: ...`. */
const DECLARATION = /font(?:-family)?\s*:/;

/**
 * Whether a value of a deck names a font family: in a field that holds a family, or in the CSS
 * of free text. `wanted` is in lower case; `field` is the name of the field the value sits in.
 */
export function namesFamily(value: unknown, wanted: string, field = ''): boolean {
  if (typeof value === 'string') {
    const text = value.toLowerCase();
    return text.includes(wanted) && (FAMILY_FIELD.test(field) || DECLARATION.test(text));
  }
  if (Array.isArray(value)) return value.some((item) => namesFamily(item, wanted, field));
  if (typeof value !== 'object' || value === null) return false;
  return Object.entries(value).some(([name, inner]) => namesFamily(inner, wanted, name));
}

/** The deck without its asset table: what can name a family. */
function content(deck: Deck): unknown {
  const { assets: _, ...rest } = deck;
  return rest;
}

/** The families a deck carries as font assets, in lower case. */
function carried(deck: Deck): Set<string> {
  const families = new Set<string>();
  for (const asset of Object.values(deck.assets)) {
    if (asset.kind === 'font' && asset.font) families.add(asset.font.family.toLowerCase());
  }
  return families;
}

export interface EmbedOptions {
  bus: CommandBus;
  assets: AssetService;
  /** The name of the step in the undo history, when the files are a step of their own. */
  label: (family: string) => string;
}

/**
 * Hands the user's fonts to the open deck as it comes to use them. Returns a function that
 * stops watching.
 */
export function watchUserFonts({ bus, assets, label }: EmbedOptions): () => void {
  /** Families whose files are on their way into the deck. */
  const busy = new Set<string>();
  /**
   * Families the deck names and does not carry, which it gets with its next change: those an
   * undo took the files of (at once would be a new step in answer to every undo), and those a
   * deck named when it was opened.
   */
  const owed = new Set<string>();

  /** The user's families the deck does not carry, each with its files. */
  const missing = (deck: Deck): Map<string, UserFont[]> => {
    const has = carried(deck);
    const families = new Map<string, UserFont[]>();
    for (const font of userFonts()) {
      const family = font.family.toLowerCase();
      if (has.has(family) || busy.has(family)) continue;
      families.set(family, [...(families.get(family) ?? []), font]);
    }
    return families;
  };

  const embed = async (family: string, fonts: readonly UserFont[], options: DispatchOptions) => {
    busy.add(family);
    const deckId = bus.deck.id;
    try {
      const stored: AssetMeta[] = [];
      for (const font of fonts) {
        const file = userFontFile(font);
        if (!file) continue;
        const asset = await assets.import(file, 'upload');
        const { weight, style } = font;
        stored.push({ ...asset, kind: 'font', font: { family: font.family, weight, style } });
      }
      // Another deck was opened meanwhile: the files went to a workspace that is not its own.
      if (bus.deck.id !== deckId) return;
      const fresh = stored.filter((asset) => !bus.deck.assets[asset.id]);
      if (fresh.length === 0) return;
      bus.batch(
        fresh.map((asset) => ({ type: 'asset.add', asset })),
        { ...options, label: label(fonts[0]?.family ?? family) },
      );
    } catch (error) {
      console.error(`The font "${family}" could not be stored with the deck`, error);
    } finally {
      busy.delete(family);
    }
  };

  const owe = (deck: Deck, families: Iterable<string>) => {
    const named = content(deck);
    for (const family of families) if (namesFamily(named, family)) owed.add(family);
  };

  const stopBus = bus.subscribe((event) => {
    if (event.kind === 'redo') return;
    if (event.kind === 'reset') owed.clear();
    const candidates = missing(event.deck);
    if (candidates.size === 0) return;
    if (event.kind === 'reset') return owe(event.deck, candidates.keys());
    if (event.kind === 'undo' || event.kind === 'rollback') {
      const before = carried(event.previous);
      for (const family of candidates.keys()) {
        if (before.has(family) && namesFamily(content(event.deck), family)) owed.add(family);
      }
      return;
    }
    const joined: DispatchOptions = {
      actor: event.actor,
      ...(event.txId === undefined ? {} : { txId: event.txId }),
    };
    for (const [family, fonts] of candidates) {
      const named = owed.has(family)
        ? namesFamily(content(event.deck), family)
        : event.patches.some((patch) =>
            namesFamily(patch.value, family, String(patch.path.at(-1) ?? '')),
          );
      owed.delete(family);
      if (named) void embed(family, fonts, joined);
    }
  });

  // The fonts are read as the app starts: a deck that was there before them is like one opened.
  let read = false;
  void loadUserFonts().then(() => {
    read = true;
    owe(bus.deck, missing(bus.deck).keys());
  });
  // A font the user adds while the open deck already names its family: the deck gets it then.
  const stopFonts = subscribeUserFonts(() => {
    if (!read) return;
    const deck = bus.deck;
    for (const [family, fonts] of missing(deck)) {
      if (namesFamily(content(deck), family)) void embed(family, fonts, {});
    }
  });

  return () => {
    stopBus();
    stopFonts();
  };
}
