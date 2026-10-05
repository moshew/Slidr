// Makes the font files the suites of the user's fonts add (`e2e/fixtures/fonts/`): three small
// fonts under family names no library has, so a test can tell them from the built-in fonts.
//
//   node apps/desktop/scripts/fonts/make-fixtures.mjs
//
// Each is a face of IBM Plex Sans Hebrew (SIL Open Font License 1.1, as the built-in library
// ships it through fontsource), with another `name` table: a WOFF2 file, a TrueType file and an
// OpenType file, which are the three kinds a user can add. The licence asks that a changed font
// goes under another name and keeps its notice: the names are ours, the notice is in the `name`
// table, and the licence is copied beside the files (`OFL.txt`). The files are committed; this
// script is how they were made.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '../../e2e/fixtures/fonts');
const fromApp = createRequire(join(here, '../../package.json'));
// The codec is a dependency of the export package, which is where the app unpacks WOFF2 too.
const fromExport = createRequire(join(here, '../../../../packages/html-export/package.json'));
const { compress, decompress } = await import(
  pathToFileURL(fromExport.resolve('woff2-encoder')).href
);

const source = (file) =>
  readFileSync(
    join(dirname(fromApp.resolve('@fontsource/ibm-plex-sans-hebrew/package.json')), 'files', file),
  );

/** The tables of a bare font, by tag. */
function tablesOf(sfnt) {
  const view = new DataView(sfnt.buffer, sfnt.byteOffset, sfnt.byteLength);
  const tables = new Map();
  for (let i = 0; i < view.getUint16(4); i++) {
    const record = 12 + i * 16;
    const tag = String.fromCharCode(...sfnt.subarray(record, record + 4));
    const offset = view.getUint32(record + 8);
    tables.set(tag, sfnt.slice(offset, offset + view.getUint32(record + 12)));
  }
  return { version: view.getUint32(0), tables };
}

/** A `name` table with the names given, for Windows in English: what every reader looks at. */
function nameTable(names) {
  const records = Object.entries(names).map(([id, text]) => {
    const bytes = new Uint8Array(text.length * 2);
    for (let i = 0; i < text.length; i++) {
      new DataView(bytes.buffer).setUint16(i * 2, text.charCodeAt(i));
    }
    return { id: Number(id), bytes };
  });
  const header = 6 + records.length * 12;
  const table = new Uint8Array(header + records.reduce((sum, r) => sum + r.bytes.length, 0));
  const view = new DataView(table.buffer);
  view.setUint16(2, records.length);
  view.setUint16(4, header);
  let offset = 0;
  records.forEach(({ id, bytes }, i) => {
    const record = 6 + i * 12;
    view.setUint16(record, 3);
    view.setUint16(record + 2, 1);
    view.setUint16(record + 4, 0x409);
    view.setUint16(record + 6, id);
    view.setUint16(record + 8, bytes.length);
    view.setUint16(record + 10, offset);
    table.set(bytes, header + offset);
    offset += bytes.length;
  });
  return table;
}

const padded = (length) => (length + 3) & ~3;

function checksum(bytes) {
  const whole = new Uint8Array(padded(bytes.length));
  whole.set(bytes);
  const view = new DataView(whole.buffer);
  let sum = 0;
  for (let i = 0; i < whole.length; i += 4) sum = (sum + view.getUint32(i)) >>> 0;
  return sum;
}

/** A bare font from its tables: the directory, each table on a four-byte boundary. */
function build(version, tables) {
  const tags = [...tables.keys()].sort();
  const head = tables.get('head');
  // The checksum of the file is taken with this field at zero, and written into it.
  new DataView(head.buffer).setUint32(8, 0);
  const directory = 12 + tags.length * 16;
  const size = tags.reduce((sum, tag) => sum + padded(tables.get(tag).length), directory);
  const font = new Uint8Array(size);
  const view = new DataView(font.buffer);
  const power = 2 ** Math.floor(Math.log2(tags.length));
  view.setUint32(0, version);
  view.setUint16(4, tags.length);
  view.setUint16(6, power * 16);
  view.setUint16(8, Math.log2(power));
  view.setUint16(10, tags.length * 16 - power * 16);
  let offset = directory;
  let headAt = 0;
  tags.forEach((tag, i) => {
    const table = tables.get(tag);
    const record = 12 + i * 16;
    for (let c = 0; c < 4; c++) font[record + c] = tag.charCodeAt(c);
    view.setUint32(record + 4, checksum(table));
    view.setUint32(record + 8, offset);
    view.setUint32(record + 12, table.length);
    font.set(table, offset);
    if (tag === 'head') headAt = offset;
    offset += padded(table.length);
  });
  view.setUint32(headAt + 8, (0xb1b0afba - checksum(font)) >>> 0);
  return font;
}

/** A face of the source font under other names. */
async function renamed(file, family, style) {
  const { version, tables } = tablesOf(await decompress(source(file)));
  const postscript = `${family}-${style}`.replaceAll(' ', '');
  tables.set(
    'name',
    nameTable({
      0: 'Copyright 2019 IBM Corp. All rights reserved. Renamed for the tests of Slidr.',
      1: family,
      2: style,
      3: `${postscript};fixture`,
      4: `${family} ${style}`,
      5: 'Version 1.0',
      6: postscript,
      13: 'SIL Open Font License, Version 1.1',
    }),
  );
  return build(version, tables);
}

mkdirSync(out, { recursive: true });
copyFileSync(
  join(dirname(fromApp.resolve('@fontsource/ibm-plex-sans-hebrew/package.json')), 'LICENSE'),
  join(out, 'OFL.txt'),
);
const regular = await renamed(
  'ibm-plex-sans-hebrew-latin-400-normal.woff2',
  'Slidr Fixture Sans',
  'Regular',
);
const bold = await renamed(
  'ibm-plex-sans-hebrew-latin-700-normal.woff2',
  'Slidr Fixture Sans',
  'Bold',
);
const ivrit = await renamed(
  'ibm-plex-sans-hebrew-hebrew-400-normal.woff2',
  'Slidr Fixture Ivrit',
  'Regular',
);
const files = {
  'fixture-sans-regular.woff2': await compress(regular),
  'fixture-sans-bold.ttf': bold,
  'fixture-ivrit-regular.otf': ivrit,
  // Not a font at all, under the name of one.
  'not-a-font.ttf': new TextEncoder().encode('This is a text file with the name of a font.\n'),
};
for (const [name, bytes] of Object.entries(files)) {
  writeFileSync(join(out, name), bytes);
  console.log(`${name}: ${bytes.length} bytes`);
}
