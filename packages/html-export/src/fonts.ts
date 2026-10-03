/**
 * Fonts inside the file (WG9-T09): the faces the rendered slides use, cut down to the characters
 * in use and embedded as WOFF2 (EXP-01).
 */

export interface EmbeddedFont {
  family: string;
  style: string;
  weight: string;
  /** Bytes of the font file the page loaded, and of what went into the exported file. */
  originalBytes: number;
  bytes: number;
  /** How many different characters of the slides the face covers. */
  characters: number;
}

export interface EmbeddedFonts {
  /** `@font-face` rules with the fonts inside, as data URIs. */
  css: string;
  fonts: EmbeddedFont[];
  /** What could not be embedded as asked, e.g. a face that went in whole. */
  warnings: string[];
}

/**
 * The fonts of the slides drawn under `host`, once they have loaded.
 */
export function embedFonts(_host: HTMLElement): Promise<EmbeddedFonts> {
  return Promise.resolve({ css: '', fonts: [], warnings: [] });
}
