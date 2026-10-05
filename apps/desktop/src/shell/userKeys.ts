import { setShownKeys } from '@slidr/ui';
import { loadSettings, replaceSection, sectionOf, useSettings } from '../settings';
import { normalizeKeys, registries, type ShortcutDefinition } from './registry';

/*
 * The user's own keys for the registered shortcuts (UI-06, WG3-T07): where they are kept, which
 * combination a shortcut answers to now, which shortcuts keep the key they came with, and what
 * a hint that names a key as text shows.
 *
 * They are the section `shortcuts` of the settings file: `{ "keys": { "<shortcut id>": "ctrl+j" } }`,
 * written as `normalizeKeys` writes a combination. Only what differs from the registration is
 * kept, so a default that changes in a later version reaches everyone who did not move it; an
 * empty string is a shortcut the user left without a key. An id nobody registered is kept and
 * does nothing: its area may register later, or in another version.
 */

const SECTION = 'shortcuts';

/** Shortcut id to combination; an empty combination is "no key". */
export type UserKeys = Readonly<Record<string, string>>;

const NONE: UserKeys = Object.freeze({});

function parse(section: unknown): UserKeys {
  const keys = sectionOf({ [SECTION]: section }, SECTION).keys;
  if (typeof keys !== 'object' || keys === null || Array.isArray(keys)) return NONE;
  const found = Object.entries(keys).flatMap(([id, value]) =>
    typeof value === 'string' ? [[id, normalizeKeys(value)] as const] : [],
  );
  return found.length > 0 ? Object.fromEntries(found) : NONE;
}

let last: { section: unknown; keys: UserKeys } = { section: undefined, keys: NONE };

/** The user's keys as the settings hold them now. Read at every key press: it must not wait. */
export function userKeys(): UserKeys {
  const section = useSettings.getState().sections[SECTION];
  if (section !== last.section) last = { section, keys: parse(section) };
  return last.keys;
}

/** The user's keys, for a component that shows them. */
export function useUserKeys(): UserKeys {
  useSettings((state) => state.sections[SECTION]);
  return userKeys();
}

let ready: Promise<void> | null = null;

/**
 * Resolves once the user's keys are known: the settings were read, or could not be, and then the
 * keys are the ones the shortcuts came with. The shell answers no shortcut before that.
 */
export function userKeysReady(): Promise<void> {
  ready ??= loadSettings().catch((error: unknown) => {
    console.error('The settings could not be read: every shortcut keeps its own key', error);
  });
  return ready;
}

/* ---------------------------------------------------------------- what keeps its key */

/**
 * Why a shortcut keeps the key it came with:
 *   - `text`: the slide's text editor has the same key in its own keymap (`text/TextEditor.tsx`),
 *     which does not read the user's keys. Moved here, the key would change on a selected box
 *     and stay as it was while typing in it.
 *   - `control`: a control reads the key itself (arrows, Tab, Enter, Esc, the clipboard), so
 *     there is no registration to point elsewhere.
 *   - `show`: a key of the show. It is the runtime's, which is also what an exported file runs,
 *     and there is no settings file there.
 */
export type Fixed = 'text' | 'control' | 'show';

/** The shortcuts the text editor's keymap repeats: bold, italic, underline, direction, undo, redo. */
const TEXT_EDITOR = ['text.bold', 'text.italic', 'text.underline', 'text.direction', 'shell.undo'];
const TEXT_EDITOR_REDO = 'shell.redo.';

/** Keys that move, confirm, leave or delete wherever the keyboard is. */
const NAMED = new Set([
  'enter',
  'tab',
  'space',
  'backspace',
  'delete',
  'insert',
  'home',
  'end',
  'pageup',
  'pagedown',
  'arrowleft',
  'arrowright',
  'arrowup',
  'arrowdown',
  'escape',
]);

export interface Combination {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  key: string;
}

/** A combination apart: its modifiers and its key, from what `normalizeKeys` wrote. */
export function combinationOf(keys: string): Combination {
  const parts = normalizeKeys(keys).split('+');
  const key = parts.pop() ?? '';
  return {
    ctrl: parts.includes('ctrl'),
    alt: parts.includes('alt'),
    shift: parts.includes('shift'),
    key,
  };
}

export const isNamedKey = (key: string): boolean => NAMED.has(key);

/** Whether the user can give a registered shortcut another key, and why not when they cannot. */
export function fixedReason(
  shortcut: Pick<ShortcutDefinition, 'id' | 'keys' | 'label'>,
): Fixed | null {
  if (TEXT_EDITOR.includes(shortcut.id) || shortcut.id.startsWith(TEXT_EDITOR_REDO)) return 'text';
  // A shortcut without a name is not in the map: it is a control's own way of hearing a key.
  if (!shortcut.label) return 'control';
  const { ctrl, alt, key } = combinationOf(shortcut.keys);
  return isNamedKey(key) && !ctrl && !alt ? 'control' : null;
}

/* ---------------------------------------------------------------- the key of a shortcut now */

/**
 * The combination a shortcut answers to now: the user's when they chose one, else the one it was
 * registered with. Empty when the user left it without a key.
 */
export function keysOf(
  shortcut: Pick<ShortcutDefinition, 'id' | 'keys' | 'label'>,
  user: UserKeys = userKeys(),
): string {
  const own = user[shortcut.id];
  return own === undefined || fixedReason(shortcut) ? normalizeKeys(shortcut.keys) : own;
}

/**
 * The registered shortcuts that answer to a combination now, the latest registration first: the
 * order `shortcutsFor` gives for the keys they were registered with.
 */
export function shortcutsOn(keys: string): ShortcutDefinition[] {
  const wanted = normalizeKeys(keys);
  if (!wanted) return [];
  const user = userKeys();
  return registries.shortcuts
    .getState()
    .items.filter((shortcut) => keysOf(shortcut, user) === wanted)
    .reverse();
}

/* ---------------------------------------------------------------- changing them */

function write(keys: Record<string, string>): Promise<void> {
  const { keys: _, ...rest } = sectionOf(useSettings.getState().sections, SECTION);
  const some = Object.keys(keys).length > 0;
  if (!some && Object.keys(rest).length === 0) return replaceSection(SECTION, null);
  return replaceSection(SECTION, some ? { ...rest, keys } : rest);
}

/**
 * Gives shortcuts another key, in one write: a combination, an empty string for "no key", or
 * `null` for the key the shortcut came with. The change holds from the next key press; the
 * promise is the settings file's, and rejects when it could not be written.
 */
export function changeKeys(changes: Readonly<Record<string, string | null>>): Promise<void> {
  const registered = new Map(
    registries.shortcuts.getState().items.map((shortcut) => [shortcut.id, shortcut]),
  );
  const next = new Map(Object.entries(userKeys()));
  for (const [id, keys] of Object.entries(changes)) {
    if (keys === null) next.delete(id);
    else next.set(id, normalizeKeys(keys));
  }
  // A key that says what the registration says is not the user's own.
  for (const [id, keys] of next) {
    const shortcut = registered.get(id);
    if (shortcut && normalizeKeys(shortcut.keys) === keys) next.delete(id);
  }
  return write(Object.fromEntries(next));
}

/** Every shortcut back on the key it came with. */
export function resetKeys(): Promise<void> {
  return write({});
}

/* ---------------------------------------------------------------- how a key is drawn */

const DRAWN: Record<string, string> = {
  escape: 'Esc',
  delete: 'Del',
  arrowleft: '←',
  arrowright: '→',
  arrowup: '↑',
  arrowdown: '↓',
  pageup: 'PgUp',
  pagedown: 'PgDn',
};

/** How a combination is shown: the modifiers in one order, each key with a capital. */
export function drawnKeys(keys: string): string {
  return normalizeKeys(keys)
    .split('+')
    .map((key) => DRAWN[key] ?? (key[0]?.toUpperCase() ?? '') + key.slice(1))
    .join('+');
}

/**
 * What a hint that names a key as text shows now. Tooltips and menus across the app write the
 * key a shortcut came with (`shortcut="Ctrl+G"`); when the user moved that shortcut the hint
 * shows where it went, and nothing when it was left without a key. A combination is not an id:
 * of two shortcuts that came with one key and were both moved, the hint follows the one that
 * was registered last, which is also the one the key asked first.
 */
export function shownKeys(keys: string): string {
  const user = userKeys();
  if (user === NONE) return keys;
  const wanted = normalizeKeys(keys);
  const moved = registries.shortcuts
    .getState()
    .items.filter(
      (shortcut) =>
        shortcut.id in user && normalizeKeys(shortcut.keys) === wanted && !fixedReason(shortcut),
    )
    .at(-1);
  return moved ? drawnKeys(keysOf(moved, user)) : keys;
}

// Every `Kbd` of the app draws through `shownKeys`, and again when the user's keys change or a
// shortcut is registered.
setShownKeys(shownKeys);
useSettings.subscribe((state, before) => {
  if (state.sections[SECTION] !== before.sections[SECTION]) setShownKeys(shownKeys);
});
registries.shortcuts.subscribe(() => {
  if (userKeys() !== NONE) setShownKeys(shownKeys);
});
