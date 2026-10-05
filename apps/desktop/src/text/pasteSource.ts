import type { Color, Deck } from '@slidr/model';
import { toHex } from '@slidr/ui';
// By file: the index of the controls loads the shell, and the text editor is loaded by it.
import { cssToRgba, hexToColor } from '../controls/colors';
import { loadSystemFonts, type SystemFont } from '../fonts/systemFonts';
import type { SourceContext } from './paste';

/*
 * What a paste that keeps the source's formatting asks of the page it runs in: which font
 * families can be drawn here, and what a CSS colour is. `paste.ts` reads the clipboard without
 * knowing either.
 */

/** A browser page has 1280 pixels across the 13⅓ inches a slide stands for. */
const PAGE_WIDTH = 1280;

/** Values of `color` that are not a colour of the text's own: it then takes the destination's. */
const NO_COLOUR = new Set([
  'inherit',
  'initial',
  'unset',
  'revert',
  'currentcolor',
  'transparent',
  // "Automatic" in a word processor: the text colour of wherever the text is.
  'canvastext',
  'windowtext',
]);

/** A CSS colour as an explicit colour of the model. */
export function sourceColor(css: string): Color | undefined {
  if (NO_COLOUR.has(css.trim().toLowerCase())) return undefined;
  const rgba = cssToRgba(css);
  return rgba && rgba.a > 0 ? hexToColor(toHex(rgba)) : undefined;
}

let installed: readonly SystemFont[] = [];

/**
 * Asks for the fonts of the computer. A paste is answered at once, so the list has to be there
 * before it: the editor asks when it opens. The list is asked for once in the app's life
 * (`loadSystemFonts`), so this costs nothing after the first time.
 */
export function knowInstalledFonts(): void {
  void loadSystemFonts().then((fonts) => {
    installed = fonts;
  });
}

/** The families the page has registered faces for; a face of one script only is not a family. */
function registeredFamilies(): string[] {
  if (typeof document === 'undefined' || !document.fonts) return [];
  return Array.from(document.fonts, (face) => face.family.replace(/^["']|["']$/g, '')).filter(
    (family) => !family.includes('::'),
  );
}

/**
 * The context of a paste into a deck: text keeps the physical size it had in its source, and a
 * font it names is kept when the deck can be drawn in it here: a font the deck carries, one the
 * page registered (the built-in library), or one installed on this computer. The first family of
 * a list that is one of these is the one the source itself was drawn in on this computer.
 */
export function sourceContext(deck: Deck): SourceContext {
  const known = new Map<string, string>();
  const add = (family: string) => {
    const name = family.trim().toLowerCase();
    if (name && !known.has(name)) known.set(name, family);
  };
  for (const asset of Object.values(deck.assets)) if (asset.font) add(asset.font.family);
  registeredFamilies().forEach(add);
  for (const font of installed) add(font.family);
  return {
    scale: deck.size.w / PAGE_WIDTH,
    font: (families) => {
      for (const family of families) {
        const own = known.get(family.trim().toLowerCase());
        if (own) return own;
      }
      return undefined;
    },
    color: sourceColor,
  };
}
