import { builtinFaces, type BuiltinFace } from '../../fonts/builtinFonts.generated';

/**
 * A stand-in for WG9-T09, so that a file exported from the dev page looks right on a machine
 * that does not have the fonts: the faces of the built-in library that the page has loaded, as
 * `@font-face` rules with the whole file inside. T09 replaces it with subsets of the glyphs in use.
 */

interface Descriptors {
  family: string;
  style: string;
  weight: string;
  unicodeRange: string;
}

const key = (face: Descriptors) =>
  [face.family.replace(/["']/g, ''), face.style, face.weight, face.unicodeRange].join('|');

/** The browser's own spelling of a face's descriptors, to compare with the faces it has loaded. */
const normalized = (face: BuiltinFace): Descriptors =>
  new FontFace(face.family, 'url(about:blank)', {
    style: face.style,
    weight: face.weight,
    ...(face.unicodeRange ? { unicodeRange: face.unicodeRange } : {}),
  });

function dataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('could not read a font'));
    reader.readAsDataURL(blob);
  });
}

export async function loadedFontCss(): Promise<string> {
  const loaded = new Set(
    Array.from(document.fonts)
      .filter((face) => face.status === 'loaded')
      .map(key),
  );
  const used = builtinFaces.filter((face) => loaded.has(key(normalized(face))));
  const rules = await Promise.all(
    used.map(async (face) => {
      const uri = await dataUri(await (await fetch(face.url)).blob());
      return [
        '@font-face {',
        `font-family: "${face.family}";`,
        `font-style: ${face.style};`,
        `font-weight: ${face.weight};`,
        'font-display: block;',
        `src: url("${uri}") format("woff2");`,
        face.unicodeRange ? `unicode-range: ${face.unicodeRange};` : '',
        '}',
      ].join(' ');
    }),
  );
  return rules.join('\n');
}
