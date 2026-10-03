import { hebrewFaces } from '@slidr/renderer';
import { builtinFaces, builtinFamilies, type BuiltinFace } from './builtinFonts.generated';

export { builtinFamilies };

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

/**
 * Registers the built-in font library (SPEC appendix B) under the family names decks use. Nothing
 * is downloaded until text uses a face: browsers load `@font-face` files on demand, per
 * `unicode-range` subset (RND-05). The Hebrew subsets are registered again as Hebrew-only faces,
 * which the renderer puts first in a font pair, so Hebrew text gets the pair's Hebrew font even
 * when the Latin one has Hebrew letters too (SPEC 5.5).
 */
export function registerBuiltinFonts(doc: Document = document): void {
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
