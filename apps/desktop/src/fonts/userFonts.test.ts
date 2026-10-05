// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  addUserFont,
  loadUserFonts,
  memoryFontStore,
  removeUserFont,
  setUserFontStore,
  UserFontError,
  userFontFile,
  userFonts,
  type UserFontStore,
} from './userFonts';

/*
 * The user's own fonts (SPEC 4.2, 5.7): a file that is added is read for its family, kept by
 * its content, registered so text can be drawn in it, and listed for the font picker.
 */

/** A font file of the suites' fixtures; a path, since the DOM of a test has a URL of its own. */
const fixturePath = (name: string) =>
  join(dirname(fileURLToPath(import.meta.url)), '../../e2e/fixtures/fonts', name);

const fixture = (name: string, type = '') =>
  new File([readFileSync(fixturePath(name))], name, { type });

/** A bare font needs no unpacking; the codec that unpacks WOFF2 runs in a browser's worker. */
const asItIs = (bytes: Uint8Array) => Promise.resolve(bytes);
const registered = () => document.getElementById('slidr-user-fonts')?.textContent ?? '';

let store: UserFontStore;

beforeEach(() => {
  store = memoryFontStore();
  setUserFontStore(store);
});

describe("the user's fonts", () => {
  it('take a font file in under the family it names, and register it for drawing', async () => {
    const bold = await addUserFont(fixture('fixture-sans-bold.ttf', 'font/ttf'), asItIs);
    expect(bold).toMatchObject({
      name: 'fixture-sans-bold.ttf',
      family: 'Slidr Fixture Sans',
      weight: '700',
      style: 'normal',
      hebrew: false,
    });
    expect(bold.id).toMatch(/^[0-9a-f]{64}$/);
    expect(bold.bytes).toBeGreaterThan(10_000);
    expect(userFonts()).toEqual([bold]);
    expect(registered()).toContain('font-family: "Slidr Fixture Sans"; font-weight: 700;');
    expect(registered()).toContain('src: url("blob:');
  });

  it('list the files by family, and a family by weight', async () => {
    await addUserFont(fixture('fixture-sans-bold.ttf'), asItIs);
    await addUserFont(fixture('fixture-ivrit-regular.otf'), asItIs);
    expect(userFonts().map((font) => [font.family, font.weight, font.hebrew])).toEqual([
      ['Slidr Fixture Ivrit', '400', true],
      ['Slidr Fixture Sans', '700', false],
    ]);
  });

  it('keep one file once, however often it is added', async () => {
    const first = await addUserFont(fixture('fixture-sans-bold.ttf'), asItIs);
    const again = await addUserFont(fixture('fixture-sans-bold.ttf'), asItIs);
    expect(again.id).toBe(first.id);
    expect(userFonts()).toHaveLength(1);
    expect(await store.all()).toHaveLength(1);
  });

  it('turn back a file that is not a font, and keep nothing of it', async () => {
    const adding = addUserFont(fixture('not-a-font.ttf'), asItIs);
    await expect(adding).rejects.toBeInstanceOf(UserFontError);
    await expect(adding).rejects.toMatchObject({ problem: 'unreadable' });
    // What the codec cannot unpack is not a font either.
    await expect(
      addUserFont(fixture('fixture-sans-bold.ttf'), () => Promise.reject(new Error('no codec'))),
    ).rejects.toMatchObject({ problem: 'unreadable' });
    expect(userFonts()).toEqual([]);
    expect(await store.all()).toEqual([]);
  });

  it('say so when the app cannot keep the file', async () => {
    setUserFontStore({ ...store, put: () => Promise.reject(new Error('full')) });
    await expect(addUserFont(fixture('fixture-sans-bold.ttf'), asItIs)).rejects.toMatchObject({
      problem: 'storage',
    });
    expect(userFonts()).toEqual([]);
  });

  it('are there again the next time the app starts', async () => {
    const font = await addUserFont(fixture('fixture-sans-bold.ttf'), asItIs);
    // Another start: nothing in memory, the same store.
    setUserFontStore(store);
    expect(userFonts()).toEqual([]);
    expect(registered()).toBe('');
    await loadUserFonts();
    expect(userFonts()).toEqual([font]);
    expect(registered()).toContain('"Slidr Fixture Sans"');
  });

  it('hand over the file of a font, under its own name, for a deck to keep', async () => {
    const font = await addUserFont(fixture('fixture-sans-bold.ttf', 'font/ttf'), asItIs);
    const file = userFontFile(font)!;
    expect(file.name).toBe('fixture-sans-bold.ttf');
    expect(file.size).toBe(font.bytes);
    // Under the type of what it is, whatever the file dialog said of it.
    expect(file.type).toBe('font/ttf');
    const otf = await addUserFont(fixture('fixture-ivrit-regular.otf'), asItIs);
    expect(userFontFile(otf)!.type).toBe('font/ttf');
  });

  it('let go of a font that is removed', async () => {
    const font = await addUserFont(fixture('fixture-sans-bold.ttf'), asItIs);
    await removeUserFont(font.id);
    expect(userFonts()).toEqual([]);
    expect(registered()).toBe('');
    expect(userFontFile(font)).toBeUndefined();
    expect(await store.all()).toEqual([]);
  });
});
