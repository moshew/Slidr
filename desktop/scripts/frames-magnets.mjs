import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { magnetKit } from './frames-magnets/kit.mjs';

/*
 * The event magnets of the photo frames (`generate-frames-catalog.mjs`): frames as they are
 * printed on the magnets a photographer hands out at an event. A magnet is a card with a window
 * for the photograph, and around it stickers, captions and labels, which go onto the slide as
 * elements of their own beside the picture (`frames-magnets/kit.mjs`).
 *
 * The magnets are drawn in the files of `frames-magnets/`, about ten in each, and shown in the
 * panel by set: what the event is, or that the magnet is a style with no event.
 */

/** The sets of magnets, in the order the panel shows them. */
export const MAGNET_SETS = [
  'family',
  'birthdays',
  'kids',
  'school',
  'work',
  'leisure',
  'holidays',
  'styles',
];

/** The files of magnets, and the set the magnets of each are shown in unless one says its own. */
const FILES = {
  family: 'family',
  birthdays: 'birthdays',
  kids: 'kids',
  school: 'school',
  work: 'work',
  leisure: 'leisure',
  holidays: 'holidays',
  styles: 'styles',
  more: 'styles',
  // The first ten, each in its own set: they come last in it, after the magnets that were drawn
  // once a plate with words had become an element of its own.
  first: undefined,
};

/**
 * @param base The paths and the entries of the catalogue script.
 * @param only The files to draw, by name: all of them when none is named.
 */
export async function magnets(base, only) {
  const kit = magnetKit(base);
  const unknown = (only ?? []).filter((name) => !(name in FILES));
  if (unknown.length > 0) throw new Error(`No file of magnets is called ${unknown.join(', ')}`);
  const drawn = [];
  for (const [name, set] of Object.entries(FILES)) {
    if (only && !only.includes(name)) continue;
    const file = new URL(`./frames-magnets/${name}.mjs`, import.meta.url);
    // A file that is not written yet is left out of a whole run, and missed when it is asked for.
    if (!only && !existsSync(fileURLToPath(file))) continue;
    // A file is loaded when it is asked for, so one that is being written stops only itself.
    const { default: draw } = await import(file.href);
    for (const frame of draw(kit)) drawn.push({ ...frame, set: frame.set ?? set });
  }
  const lost = drawn.filter(({ set }) => !MAGNET_SETS.includes(set));
  if (lost.length > 0) {
    throw new Error(`In no set of the panel: ${lost.map(({ id }) => id).join(', ')}`);
  }
  return {
    // Set by set; in a set, in the order they were drawn.
    frames: MAGNET_SETS.flatMap((set) => drawn.filter((frame) => frame.set === set)),
    stickers: kit.stickers(),
  };
}
