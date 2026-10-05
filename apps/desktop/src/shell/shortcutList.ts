import type { ShortcutDefinition, ShortcutSection } from './registry';
import { normalizeKeys, shortcutSections } from './registry';
import {
  combinationOf,
  drawnKeys,
  fixedReason,
  isNamedKey,
  keysOf,
  type Fixed,
  type UserKeys,
} from './userKeys';

/*
 * What the shortcut map lists (UI-06, SPEC Appendix A), and what a key the user wants for a
 * shortcut runs into. Two kinds of key reach the app:
 *
 *   - a shortcut an area registered with a label of its own: it is listed as it is, with the
 *     key it answers to now (the user's, else the registration's), so the map cannot show a key
 *     the app no longer listens to; a shortcut registered without a label works and is not
 *     listed. The user can give it another key, unless `fixedReason` says why not;
 *   - a key a component handles itself (the arrows on the Stage, the keys of a table, of the
 *     Filmstrip, of the show): there is no registration to read, so the key is written here,
 *     and it stays what it is.
 *
 * A label is an i18n key of the shell's namespace (`keys.*`) unless it names another one.
 */

/** One key of a line of the map. */
export interface Binding {
  /** As it is drawn: `Ctrl+Shift+G`. Empty when the user left the shortcut without a key. */
  keys: string;
  /** The registered shortcut that answers to it; absent for a key a component handles itself. */
  shortcut?: string;
  /** Why the key cannot be changed; absent for one that can. */
  fixed?: Fixed;
  /** The key the shortcut came with, drawn, when the user's is another. */
  original?: string;
}

/** A line of the map: what a key does, and the keys that do it. */
export interface MapRow {
  id: string;
  section: ShortcutSection;
  /** An i18n key. */
  label: string;
  /**
   * Alternatives, each as `registerShortcut` writes one. A part in braces is a word and not a
   * key (`{wheel}`, `{drag}`, `{number}`): it is shown in the language of the UI.
   */
  keys: string[];
  /** The same keys, each with what stands behind it. */
  bindings: Binding[];
}

interface HandledRow extends Omit<MapRow, 'bindings'> {
  /**
   * The line says again, under another heading, what a registered shortcut does: it shows that
   * shortcut's key, and changes with it.
   */
  of?: string;
}

/** The keys components handle themselves, in the order the map shows them. */
const handled: readonly HandledRow[] = [
  // Cut, copy and paste are clipboard events of the window, not keys the shell hears.
  { id: 'edit.cut', section: 'edit', label: 'keys.cut', keys: ['Ctrl+X'] },
  { id: 'edit.copy', section: 'edit', label: 'keys.copy', keys: ['Ctrl+C'] },
  { id: 'edit.paste', section: 'edit', label: 'keys.paste', keys: ['Ctrl+V'] },
  { id: 'edit.delete', section: 'edit', label: 'keys.delete', keys: ['Del'] },
  { id: 'edit.selectAll', section: 'edit', label: 'keys.selectAll', keys: ['Ctrl+A'] },
  { id: 'edit.next', section: 'edit', label: 'keys.nextObject', keys: ['Tab', 'Shift+Tab'] },
  { id: 'edit.deselect', section: 'edit', label: 'keys.deselect', keys: ['Esc'] },
  { id: 'edit.menu', section: 'edit', label: 'keys.menu', keys: ['Shift+F10'] },

  { id: 'text.edit', section: 'text', label: 'keys.editText', keys: ['Enter'] },
  { id: 'text.leave', section: 'text', label: 'keys.leaveText', keys: ['Esc'] },
  { id: 'text.pastePlain', section: 'text', label: 'keys.pastePlain', keys: ['Ctrl+Shift+V'] },
  { id: 'text.lineBreak', section: 'text', label: 'keys.lineBreak', keys: ['Shift+Enter'] },
  { id: 'text.level', section: 'text', label: 'keys.listLevel', keys: ['Tab', 'Shift+Tab'] },

  { id: 'arrange.move', section: 'arrange', label: 'keys.move', keys: ['{arrows}'] },
  { id: 'arrange.moveFar', section: 'arrange', label: 'keys.moveFar', keys: ['Shift+{arrows}'] },
  { id: 'arrange.resize', section: 'arrange', label: 'keys.resize', keys: ['Ctrl+{arrows}'] },
  { id: 'arrange.rotate', section: 'arrange', label: 'keys.rotate', keys: ['Alt+←', 'Alt+→'] },
  { id: 'arrange.enter', section: 'arrange', label: 'keys.enterGroup', keys: ['Enter'] },
  { id: 'arrange.leave', section: 'arrange', label: 'keys.leaveGroup', keys: ['Esc'] },
  { id: 'arrange.axis', section: 'arrange', label: 'keys.dragAxis', keys: ['Shift+{drag}'] },
  { id: 'arrange.copy', section: 'arrange', label: 'keys.dragCopy', keys: ['Alt+{drag}'] },
  { id: 'arrange.free', section: 'arrange', label: 'keys.dragFree', keys: ['Ctrl+{drag}'] },

  { id: 'table.next', section: 'table', label: 'keys.nextCell', keys: ['Tab', 'Shift+Tab'] },
  { id: 'table.type', section: 'table', label: 'keys.typeCell', keys: ['Enter', 'F2'] },
  { id: 'table.move', section: 'table', label: 'keys.moveCell', keys: ['{arrows}'] },
  { id: 'table.extend', section: 'table', label: 'keys.extendCells', keys: ['Shift+{arrows}'] },
  { id: 'table.clear', section: 'table', label: 'keys.clearCells', keys: ['Del'] },
  { id: 'table.leave', section: 'table', label: 'keys.leaveTable', keys: ['Esc'] },

  { id: 'slides.walk', section: 'slides', label: 'keys.walkSlides', keys: ['←', '→'] },
  { id: 'slides.ends', section: 'slides', label: 'keys.endSlides', keys: ['Home', 'End'] },
  {
    id: 'slides.move',
    section: 'slides',
    label: 'keys.moveSlides',
    keys: ['Ctrl+←', 'Ctrl+→', 'Ctrl+Home', 'Ctrl+End'],
  },
  // With the keyboard in the Filmstrip, the shortcut that duplicates objects duplicates slides.
  {
    id: 'slides.duplicate',
    section: 'slides',
    label: 'keys.duplicateSlide',
    keys: ['Ctrl+D'],
    of: 'arrange.duplicate',
  },
  { id: 'slides.delete', section: 'slides', label: 'keys.deleteSlide', keys: ['Del'] },

  { id: 'view.zoom', section: 'view', label: 'keys.zoom', keys: ['Ctrl+{wheel}'] },
  { id: 'view.pan', section: 'view', label: 'keys.pan', keys: ['Space+{drag}'] },

  { id: 'present.next', section: 'present', label: 'keys.showNext', keys: ['→', 'Space'] },
  { id: 'present.prev', section: 'present', label: 'keys.showPrev', keys: ['←', 'Backspace'] },
  { id: 'present.goto', section: 'present', label: 'keys.showGoto', keys: ['{number}+Enter'] },
  { id: 'present.screen', section: 'present', label: 'keys.showScreen', keys: ['F'] },
  { id: 'present.black', section: 'present', label: 'keys.showBlack', keys: ['B', '.'] },
  { id: 'present.white', section: 'present', label: 'keys.showWhite', keys: ['W', ','] },
  { id: 'present.end', section: 'present', label: 'keys.showEnd', keys: ['Esc'] },
];

/** The key of a registered shortcut, as the map draws it. */
function bindingOf(shortcut: ShortcutDefinition, user: UserKeys): Binding {
  const fixed = fixedReason(shortcut);
  const now = keysOf(shortcut, user);
  const original = normalizeKeys(shortcut.keys);
  return {
    keys: drawnKeys(now),
    shortcut: shortcut.id,
    ...(fixed ? { fixed } : {}),
    ...(now === original ? {} : { original: drawnKeys(original) }),
  };
}

/**
 * The lines of the map, by section, in the order of `shortcutSections`. Within a section: the
 * shortcuts that name themselves, the shell's own first (undo and redo open "edit", whichever
 * area the registry heard from first) and then the areas' as they were registered; then the
 * keys components handle. Lines of one section that say the same
 * thing become one line with both keys (redo is Ctrl+Y and Ctrl+Shift+Z).
 */
export function mapRows(registered: readonly ShortcutDefinition[], user: UserKeys = {}): MapRow[] {
  const rows: MapRow[] = [];
  const add = (row: Omit<MapRow, 'keys'>) => {
    const same = rows.find((r) => r.section === row.section && r.label === row.label);
    if (!same) {
      rows.push({ ...row, keys: [], bindings: [...row.bindings] });
      return;
    }
    for (const binding of row.bindings) {
      // A key a component handles, written here too, is the key that is already on the line.
      const there = same.bindings.some(
        (b) => b.keys === binding.keys && (!binding.shortcut || b.shortcut === binding.shortcut),
      );
      if (!there) same.bindings.push(binding);
    }
  };
  const own = registered.filter(({ id }) => id.startsWith('shell.'));
  const areas = registered.filter(({ id }) => !id.startsWith('shell.'));
  for (const shortcut of [...own, ...areas]) {
    const { id, label, section = 'edit' } = shortcut;
    if (label) add({ id, section, label, bindings: [bindingOf(shortcut, user)] });
  }
  for (const { of, keys, ...row } of handled) {
    const behind = of ? registered.find(({ id }) => id === of) : undefined;
    const fixed: Fixed = row.section === 'present' ? 'show' : 'control';
    add({
      ...row,
      bindings: behind ? [bindingOf(behind, user)] : keys.map((drawn) => ({ keys: drawn, fixed })),
    });
  }
  for (const row of rows) row.keys = row.bindings.flatMap(({ keys }) => (keys ? [keys] : []));
  return shortcutSections.flatMap((section) => rows.filter((row) => row.section === section));
}

/* ---------------------------------------------------------------- a new key for a shortcut */

/** What giving a shortcut a combination would run into. */
export type Verdict =
  /** Nobody has it. */
  | { kind: 'free' }
  /** It is the key the shortcut has now. */
  | { kind: 'same' }
  /** Other shortcuts answer to it, and can be left without it. */
  | { kind: 'taken'; by: readonly ShortcutDefinition[] }
  /** It is a key that cannot move: `label` is the i18n key of what it does, when it has a name. */
  | { kind: 'fixed'; label?: string }
  /**
   * No shortcut can have it (`key`), or this one cannot: a key that types, for a shortcut that
   * also answers while the user types (`typing`).
   */
  | { kind: 'unusable'; why: 'key' | 'typing' };

const ARROWS = ['arrowleft', 'arrowright', 'arrowup', 'arrowdown'];
/** The keys of the table above that are drawn in another way than a key press names them. */
const WRITTEN: Record<string, string> = {
  del: 'delete',
  esc: 'escape',
  '←': 'arrowleft',
  '→': 'arrowright',
  '↑': 'arrowup',
  '↓': 'arrowdown',
};

/** The combinations a line of the table above stands for, as a key press is written. */
function combinations(keys: string): string[] {
  // The wheel, a drag and "a number" are not keys.
  if (/\{(?!arrows\})\w+\}/.test(keys)) return [];
  const each = keys.includes('{arrows}')
    ? ARROWS.map((arrow) => keys.replace('{arrows}', arrow))
    : [keys];
  return each.map((one) => {
    const parts = normalizeKeys(one).split('+');
    const key = parts.pop() ?? '';
    return [...parts, WRITTEN[key] ?? key].join('+');
  });
}

/**
 * The keys the editor's controls read themselves, each with the label of what it does. The keys
 * of the show are not among them: they answer in the show only, where the editor's do not.
 */
const controls = new Map<string, string>();
for (const row of handled) {
  if (row.section === 'present' || row.of) continue;
  for (const keys of row.keys) {
    for (const one of combinations(keys)) if (!controls.has(one)) controls.set(one, row.label);
  }
}

/** A key that types a character: a letter, a digit, or one of the six signs read by their place. */
const CHARACTER = /^[a-z0-9[\]/\\=-]$/;
const FUNCTION = /^f(?:[1-9]|1\d|2[0-4])$/;

/**
 * What giving `shortcut` the combination `keys` would run into. The rules of a key that can be
 * given:
 *   - a letter, a digit, one of `[ ] / \ = -`, a function key, or a named key (Enter, an arrow);
 *     these are the keys a key press is read the same way on every layout (`eventKeys`);
 *   - not a key a control reads itself, nor one of a shortcut that keeps its key;
 *   - a named key only with Ctrl or Alt; never Esc, which leaves and cancels everywhere;
 *   - a key that types only with Ctrl or Alt, when the shortcut also answers inside text.
 * `restore` asks about the key the shortcut came with, which needs no permission: only who has
 * it now is looked at.
 */
export function verdict(
  shortcut: ShortcutDefinition,
  keys: string,
  registered: readonly ShortcutDefinition[],
  user: UserKeys,
  { restore = false }: { restore?: boolean } = {},
): Verdict {
  const wanted = normalizeKeys(keys);
  const others = registered.filter((other) => other.id !== shortcut.id);
  if (!restore) {
    const control = controls.get(wanted);
    if (control) return { kind: 'fixed', label: control };
    const kept = others.find((other) => fixedReason(other) && keysOf(other, user) === wanted);
    if (kept) return { kind: 'fixed', ...(kept.label ? { label: kept.label } : {}) };
    const { ctrl, alt, key } = combinationOf(wanted);
    const character = CHARACTER.test(key);
    const named = isNamedKey(key);
    if (!character && !named && !FUNCTION.test(key)) return { kind: 'unusable', why: 'key' };
    if (key === 'escape' || wanted === 'alt+f4') return { kind: 'unusable', why: 'key' };
    if (named && !ctrl && !alt) return { kind: 'unusable', why: 'key' };
    if (character && !ctrl && !alt && shortcut.inText) return { kind: 'unusable', why: 'typing' };
  }
  if (keysOf(shortcut, user) === wanted) return { kind: 'same' };
  const by = others.filter((other) => !fixedReason(other) && keysOf(other, user) === wanted);
  return by.length > 0 ? { kind: 'taken', by } : { kind: 'free' };
}
