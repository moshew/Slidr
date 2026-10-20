import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fontFacts } from './fontFile';

/*
 * What a font file says of itself (SPEC 5.7): read from real fonts (the fixtures the suites
 * add, see `scripts/fonts/make-fixtures.mjs`), and from tables written here for what those
 * fonts do not have: a weight axis, an italic bit, names in several languages.
 */

/** A font file of the suites' fixtures; a path, since the DOM of a test has a URL of its own. */
const fixturePath = (name: string) =>
  join(dirname(fileURLToPath(import.meta.url)), '../../e2e/fixtures/fonts', name);

const fixture = (name: string) => new Uint8Array(readFileSync(fixturePath(name)));

/** A bare font with the tables given: the directory, then each table. */
function font(tables: Record<string, Uint8Array>, version = 0x00010000): Uint8Array {
  const entries = Object.entries(tables);
  const directory = 12 + entries.length * 16;
  const size = entries.reduce((sum, [, table]) => sum + table.length, directory);
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, version);
  view.setUint16(4, entries.length);
  let offset = directory;
  entries.forEach(([name, table], i) => {
    const record = 12 + i * 16;
    for (let c = 0; c < 4; c++) bytes[record + c] = name.charCodeAt(c);
    view.setUint32(record + 8, offset);
    view.setUint32(record + 12, table.length);
    bytes.set(table, offset);
    offset += table.length;
  });
  return bytes;
}

interface Name {
  id: number;
  text: string;
  platform?: number;
  language?: number;
}

function names(list: Name[]): Uint8Array {
  const header = 6 + list.length * 12;
  const table = new Uint8Array(header + list.reduce((sum, n) => sum + n.text.length * 2, 0));
  const view = new DataView(table.buffer);
  view.setUint16(2, list.length);
  view.setUint16(4, header);
  let offset = 0;
  list.forEach(({ id, text, platform = 3, language = 0x409 }, i) => {
    const record = 6 + i * 12;
    view.setUint16(record, platform);
    view.setUint16(record + 2, 1);
    view.setUint16(record + 4, language);
    view.setUint16(record + 6, id);
    view.setUint16(record + 8, text.length * 2);
    view.setUint16(record + 10, offset);
    for (let c = 0; c < text.length; c++) {
      view.setUint16(header + offset + c * 2, text.charCodeAt(c));
    }
    offset += text.length * 2;
  });
  return table;
}

function os2(weight: number, selection = 0): Uint8Array {
  const table = new Uint8Array(96);
  const view = new DataView(table.buffer);
  view.setUint16(4, weight);
  view.setUint16(62, selection);
  return table;
}

/** A `fvar` table with one axis. */
function axis(tag: string, min: number, max: number): Uint8Array {
  const table = new Uint8Array(16 + 20);
  const view = new DataView(table.buffer);
  view.setUint16(4, 16);
  view.setUint16(8, 1);
  view.setUint16(10, 20);
  for (let c = 0; c < 4; c++) table[16 + c] = tag.charCodeAt(c);
  view.setInt32(20, min * 65536);
  view.setInt32(24, 400 * 65536);
  view.setInt32(28, max * 65536);
  return table;
}

describe('the facts of a font file', () => {
  it('are read from a TrueType font: its family, its weight, its style', () => {
    expect(fontFacts(fixture('fixture-sans-bold.ttf'))).toEqual({
      family: 'Slidr Fixture Sans',
      weight: '700',
      style: 'normal',
      hebrew: false,
    });
  });

  it('say that a font has Hebrew when it has the letters', () => {
    expect(fontFacts(fixture('fixture-ivrit-regular.otf'))).toEqual({
      family: 'Slidr Fixture Ivrit',
      weight: '400',
      style: 'normal',
      hebrew: true,
    });
  });

  it('are none for a file that is not a font, or is one still packed', () => {
    expect(fontFacts(fixture('not-a-font.ttf'))).toBeNull();
    // A WOFF2 file is unpacked first (`bareFont`): its tables are not readable as they are.
    expect(fontFacts(fixture('fixture-sans-regular.woff2'))).toBeNull();
    expect(fontFacts(new Uint8Array(0))).toBeNull();
    expect(fontFacts(new Uint8Array([0, 1, 0, 0, 0, 9, 0, 0]))).toBeNull();
  });

  it('take the family a designer groups by before the one of four styles', () => {
    const table = names([
      { id: 1, text: 'Plex Condensed SemiBold' },
      { id: 16, text: 'Plex Condensed' },
    ]);
    expect(fontFacts(font({ name: table }))?.family).toBe('Plex Condensed');
    expect(fontFacts(font({ name: names([{ id: 1, text: 'Plex' }]) }))?.family).toBe('Plex');
  });

  it('take the English name when the font has names in several languages', () => {
    const table = names([
      { id: 1, text: 'אלף', language: 0x40d },
      { id: 1, text: 'Alef' },
      { id: 1, text: 'Alef Unicode', platform: 0, language: 0 },
    ]);
    expect(fontFacts(font({ name: table }))?.family).toBe('Alef');
    // Without one, whatever name it has.
    const hebrewOnly = names([{ id: 1, text: 'אלף', language: 0x40d }]);
    expect(fontFacts(font({ name: hebrewOnly }))?.family).toBe('אלף');
    // A font that names no family has nothing to be listed under.
    expect(fontFacts(font({ name: names([{ id: 4, text: 'Full name only' }]) }))).toBeNull();
  });

  it('give the two ends of the weight axis of a variable font', () => {
    const variable = font({
      name: names([{ id: 1, text: 'Heebo' }]),
      'OS/2': os2(400),
      fvar: axis('wght', 100, 900),
    });
    expect(fontFacts(variable)).toMatchObject({ family: 'Heebo', weight: '100 900' });
    // An axis that is not the weight leaves the weight of the file.
    const width = font({
      name: names([{ id: 1, text: 'Wide' }]),
      'OS/2': os2(600),
      fvar: axis('wdth', 75, 125),
    });
    expect(fontFacts(width)?.weight).toBe('600');
  });

  it('say italic when the font says so, and regular at 400 when it says nothing', () => {
    const italic = font({ name: names([{ id: 1, text: 'Slant' }]), 'OS/2': os2(300, 1) });
    expect(fontFacts(italic)).toMatchObject({ weight: '300', style: 'italic' });
    const bare = font({ name: names([{ id: 1, text: 'Bare' }]) }, 0x4f54544f);
    expect(fontFacts(bare)).toEqual({
      family: 'Bare',
      weight: '400',
      style: 'normal',
      hebrew: false,
    });
  });

  it('are none for a font whose tables point outside the file', () => {
    const broken = font({ name: names([{ id: 1, text: 'Cut' }]) });
    new DataView(broken.buffer).setUint32(12 + 8, 1_000_000);
    expect(fontFacts(broken)).toBeNull();
  });
});
