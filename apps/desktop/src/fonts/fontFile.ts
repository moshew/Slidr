/*
 * What a font file says of itself (SPEC 5.7): the family it belongs to, its weight, its style,
 * and whether it has Hebrew letters. Read from the tables of the bare font, which is all a
 * deck's asset needs to register the face (`AssetMeta.font`): the name a deck writes is the
 * family's, and the browser picks the file by weight and style.
 */

export interface FontFacts {
  /** The family's name, as text is set in it: "Heebo". */
  family: string;
  /** As CSS `font-weight`: one weight, or the two ends of a variable font's range. */
  weight: string;
  style: 'normal' | 'italic';
  /** The font has the Hebrew alphabet. */
  hebrew: boolean;
}

const tag = (name: string): number =>
  ((name.charCodeAt(0) << 24) |
    (name.charCodeAt(1) << 16) |
    (name.charCodeAt(2) << 8) |
    name.charCodeAt(3)) >>>
  0;

/** A bare font: TrueType outlines, or OpenType with CFF outlines. Not a collection of fonts. */
const SFNT = new Set([0x00010000, tag('OTTO'), tag('true')]);

interface Table {
  offset: number;
  length: number;
}

function tablesOf(view: DataView): Map<number, Table> {
  const tables = new Map<number, Table>();
  const count = view.getUint16(4);
  for (let i = 0; i < count; i++) {
    const record = 12 + i * 16;
    tables.set(view.getUint32(record), {
      offset: view.getUint32(record + 8),
      length: view.getUint32(record + 12),
    });
  }
  return tables;
}

/** Name ids: the family a designer groups by comes before the one of four-style systems. */
const FAMILY = [16, 1];
const WINDOWS = 3;
const UNICODE = 0;
const ENGLISH_US = 0x409;

function utf16(view: DataView, offset: number, length: number): string {
  let text = '';
  for (let i = 0; i + 1 < length; i += 2) text += String.fromCharCode(view.getUint16(offset + i));
  return text;
}

/** The name with an id, in English when the font has it there, else in whatever it has. */
function nameOf(view: DataView, table: Table, id: number): string | undefined {
  const count = view.getUint16(table.offset + 2);
  const strings = table.offset + view.getUint16(table.offset + 4);
  let best: { rank: number; text: string } | undefined;
  for (let i = 0; i < count; i++) {
    const record = table.offset + 6 + i * 12;
    if (view.getUint16(record + 6) !== id) continue;
    const platform = view.getUint16(record);
    // The two platforms whose names are UTF-16; the old Macintosh ones are in other encodings.
    if (platform !== WINDOWS && platform !== UNICODE) continue;
    const english = platform === WINDOWS && view.getUint16(record + 4) === ENGLISH_US;
    const rank = english ? 0 : platform === WINDOWS ? 1 : 2;
    if (best && best.rank <= rank) continue;
    const text = utf16(
      view,
      strings + view.getUint16(record + 10),
      view.getUint16(record + 8),
    ).trim();
    if (text) best = { rank, text };
  }
  return best?.text;
}

/** The ends of the weight axis of a variable font, when it has one. */
function weightAxis(view: DataView, table: Table): [number, number] | undefined {
  const axes = table.offset + view.getUint16(table.offset + 4);
  const count = view.getUint16(table.offset + 8);
  const size = view.getUint16(table.offset + 10);
  for (let i = 0; i < count; i++) {
    const axis = axes + i * size;
    if (view.getUint32(axis) !== tag('wght')) continue;
    // Fixed 16.16: the whole part is the weight.
    return [view.getInt32(axis + 4) / 65536, view.getInt32(axis + 12) / 65536];
  }
  return undefined;
}

/** The character a font must have to be a Hebrew font: alef. */
const ALEF = 0x5d0;

/** Whether the font maps a character, by the Unicode tables of its `cmap` (formats 4 and 12). */
function hasCharacter(view: DataView, table: Table, code: number): boolean {
  const count = view.getUint16(table.offset + 2);
  for (let i = 0; i < count; i++) {
    const record = table.offset + 4 + i * 8;
    const platform = view.getUint16(record);
    if (platform !== WINDOWS && platform !== UNICODE) continue;
    const sub = table.offset + view.getUint32(record + 4);
    const format = view.getUint16(sub);
    if (format === 4) {
      const segments = view.getUint16(sub + 6) / 2;
      const ends = sub + 14;
      const starts = ends + segments * 2 + 2;
      for (let s = 0; s < segments; s++) {
        if (code <= view.getUint16(ends + s * 2)) {
          if (code >= view.getUint16(starts + s * 2)) return true;
          break;
        }
      }
    } else if (format === 12) {
      const groups = view.getUint32(sub + 12);
      for (let g = 0; g < groups; g++) {
        const group = sub + 16 + g * 12;
        if (code >= view.getUint32(group) && code <= view.getUint32(group + 4)) return true;
      }
    }
  }
  return false;
}

/**
 * The facts of a bare font. Null when the bytes are not one, or it names no family: there is
 * nothing to list such a file under.
 */
export function fontFacts(sfnt: Uint8Array): FontFacts | null {
  try {
    const view = new DataView(sfnt.buffer, sfnt.byteOffset, sfnt.byteLength);
    if (!SFNT.has(view.getUint32(0))) return null;
    const tables = tablesOf(view);
    const name = tables.get(tag('name'));
    const family = name && FAMILY.map((id) => nameOf(view, name, id)).find(Boolean);
    if (!family) return null;

    const os2 = tables.get(tag('OS/2'));
    const head = tables.get(tag('head'));
    const fvar = tables.get(tag('fvar'));
    const cmap = tables.get(tag('cmap'));
    const axis = fvar && weightAxis(view, fvar);
    const single = os2 ? view.getUint16(os2.offset + 4) : 400;
    // `fsSelection` bit 0 and `macStyle` bit 1 both say italic; a font may set either.
    const italic =
      (os2 !== undefined && (view.getUint16(os2.offset + 62) & 1) === 1) ||
      (head !== undefined && (view.getUint16(head.offset + 44) & 2) === 2);
    return {
      family,
      weight: axis ? `${Math.round(axis[0])} ${Math.round(axis[1])}` : String(single || 400),
      style: italic ? 'italic' : 'normal',
      hebrew: cmap !== undefined && hasCharacter(view, cmap, ALEF),
    };
  } catch {
    // A table that points outside the file: not a font that can be read.
    return null;
  }
}
