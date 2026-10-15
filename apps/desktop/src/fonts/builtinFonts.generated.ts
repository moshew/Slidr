import { mediaUrl, readMediaJson } from '@slidr/media-library';

/*
 * The built-in fonts of decks (SPEC appendix B): the catalog of the media library
 * (`fonts/catalog.json`, written by `scripts/gen-builtin-fonts.mjs`) and its files, read as the
 * app starts. Without the library there are none: text is set in the fonts of the system, and
 * the font lists offer those and the user's own.
 */

export interface BuiltinFace {
  family: string;
  style: string;
  weight: string;
  url: string;
  unicodeRange?: string;
}

interface MediaFace extends Omit<BuiltinFace, 'url'> {
  path: string;
}

interface Catalog {
  families: { family: string; scripts: string[] }[];
  faces: MediaFace[];
}

const read = await readMediaJson<Partial<Catalog>>('fonts/catalog.json');
const catalog: Catalog = {
  families: Array.isArray(read?.families) ? read.families : [],
  faces: Array.isArray(read?.faces) ? read.faces : [],
};

export const builtinFamilies = catalog.families;
export const builtinFaces: BuiltinFace[] = catalog.faces
  .filter((face) => typeof face.path === 'string')
  .map(({ path, ...face }) => ({ ...face, url: mediaUrl(path) }));
