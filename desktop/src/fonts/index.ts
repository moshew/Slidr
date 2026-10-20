import { familyForLetters } from '@slidr/model';
import { hebrewFaces, setFontCounterparts } from '@slidr/renderer';
import { builtinFaces, builtinFamilies, type BuiltinFace } from './builtinFonts.generated';

export { builtinFamilies };
export { useUserFonts, type UserFont } from './userFonts';
export {
  loadSystemFonts,
  setSystemFontSource,
  useSystemFonts,
  type SystemFont,
  type SystemFontSource,
} from './systemFonts';

function faceRule(face: BuiltinFace): string {
  return [
    '@font-face {',
    `  font-family: "${face.family}";`,
    `  font-style: ${face.style};`,
    `  font-weight: ${face.weight};`,
    // `block` for a short moment rather than `swap`: a slide that swaps fonts after it is drawn
    // re-wraps its text, and thumbnails and captures would catch the wrong one.
    '  font-display: block;',
    `  src: url("${face.url}") format("woff2");`,
    face.unicodeRange ? `  unicode-range: ${face.unicodeRange};` : '',
    '}',
  ]
    .filter(Boolean)
    .join('\n');
}

const STYLE_ID = 'slidr-builtin-fonts';

/** The library's families by their name as CSS finds them, whatever its case. */
const families = new Map(builtinFamilies.map((entry) => [entry.family.toLowerCase(), entry]));

/**
 * Registers the built-in font library (SPEC appendix B) under the family names decks use. Nothing
 * is downloaded until text uses a face: browsers load `@font-face` files on demand, per
 * `unicode-range` subset (RND-05). The Hebrew subsets are registered again as Hebrew-only faces,
 * which the renderer puts first in a font pair, so Hebrew text gets the pair's Hebrew font even
 * when the Latin one has Hebrew letters too (SPEC 5.5). And the renderer is told the families'
 * counterparts, so a deck in a language its theme's fonts have no letters of draws them in the
 * family of those letters closest to the theme's (ADR-105).
 */
export function registerBuiltinFonts(doc: Document = document): void {
  setFontCounterparts((family, lang) => {
    const entry = families.get(family.toLowerCase());
    return entry && familyForLetters(entry, lang);
  });
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = [...builtinFaces, ...hebrewFaces(builtinFaces)].map(faceRule).join('\n');
  doc.head.append(style);
}

/**
 * Resolves once the fonts a rendered subtree uses have loaded, so a capture or a measurement sees
 * the final text (RND-05).
 */
export async function fontsReady(doc: Document = document): Promise<void> {
  await doc.fonts.ready;
}
