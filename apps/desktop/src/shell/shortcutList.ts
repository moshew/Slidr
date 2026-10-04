import type { ShortcutDefinition, ShortcutSection } from './registry';
import { normalizeKeys, shortcutSections } from './registry';

/*
 * What the shortcut map lists (UI-06, SPEC Appendix A). Three kinds of key reach the app:
 *
 *   - a shortcut an area registered with a label of its own: it is listed as it is;
 *   - a shortcut an area registered without one (its `register.tsx` came before the map): it is
 *     named here, by its id, and its keys are read from the registration, so the map cannot
 *     show a key the app no longer listens to;
 *   - a key a component handles itself (the arrows on the Stage, the keys of a table, of the
 *     Filmstrip, of the show): there is no registration to read, so the key is written here.
 *
 * A label is an i18n key of the shell's namespace (`keys.*`) unless it names another one.
 */

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
}

/** A registered shortcut that carries no label of its own, by its id. */
const named: Record<string, { section: ShortcutSection; label: string }> = {
  'arrange.duplicate': { section: 'edit', label: 'keys.duplicate' },
  'arrange.group': { section: 'arrange', label: 'keys.group' },
  'arrange.ungroup': { section: 'arrange', label: 'keys.ungroup' },
  'arrange.order.front': { section: 'arrange', label: 'keys.front' },
  'arrange.order.forward': { section: 'arrange', label: 'keys.forward' },
  'arrange.order.backward': { section: 'arrange', label: 'keys.backward' },
  'arrange.order.back': { section: 'arrange', label: 'keys.back' },
  'arrange.newSlide': { section: 'slides', label: 'keys.newSlide' },
  'ai.focusChat': { section: 'ai', label: 'keys.focusChat' },
  'present.fromStart': { section: 'present', label: 'keys.presentStart' },
  'present.fromCurrent': { section: 'present', label: 'keys.presentCurrent' },
};

/** The keys components handle themselves, in the order the map shows them. */
const handled: readonly MapRow[] = [
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
  { id: 'slides.duplicate', section: 'slides', label: 'keys.duplicateSlide', keys: ['Ctrl+D'] },
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

/** How a combination is shown: the modifiers in one order, each key with a capital. */
function shown(keys: string): string {
  return normalizeKeys(keys)
    .split('+')
    .map((key) => (key.length === 1 ? key.toUpperCase() : key[0]?.toUpperCase() + key.slice(1)))
    .join('+');
}

/**
 * The lines of the map, by section, in the order of `shortcutSections`. Within a section: the
 * shortcuts that name themselves, the shell's own first (undo and redo open "edit", whichever
 * area the registry heard from first) and then the areas' as they were registered; then the
 * ones named here; then the keys components handle. Lines of one section that say the same
 * thing become one line with both keys (redo is Ctrl+Y and Ctrl+Shift+Z).
 */
export function mapRows(registered: readonly ShortcutDefinition[]): MapRow[] {
  const rows: MapRow[] = [];
  const add = (row: MapRow) => {
    const same = rows.find((r) => r.section === row.section && r.label === row.label);
    if (!same) rows.push({ ...row, keys: [...row.keys] });
    else for (const keys of row.keys) if (!same.keys.includes(keys)) same.keys.push(keys);
  };
  const own = registered.filter(({ id }) => id.startsWith('shell.'));
  const areas = registered.filter(({ id }) => !id.startsWith('shell.'));
  for (const { id, label, section = 'edit', keys } of [...own, ...areas]) {
    if (label) add({ id, section, label, keys: [shown(keys)] });
  }
  for (const { id, label, keys } of registered) {
    const name = named[id];
    if (!label && name) add({ id, ...name, keys: [shown(keys)] });
  }
  for (const row of handled) add(row);
  return shortcutSections.flatMap((section) => rows.filter((row) => row.section === section));
}
