import {
  alignElements,
  batchFitted,
  distributeElements,
  duplicateElements,
  findSlide,
  groupElements,
  reorderElements,
  updateElement,
  type AlignEdge,
  type ArrangeReference,
  type Command,
  type DistributeAxis,
  type Element,
  type Slide,
  type ZOrderMove,
} from '@slidr/model';
import { i18n } from '../i18n';
import type { Editor } from '../shell';
import { abilities, selectedElements } from './abilities';
import { pasteStyleCommands } from './style';

/*
 * The arrange operations (WG5-T06, ARR-01..05) on the editor's selection. Each one computes
 * commands with the pure helpers of `@slidr/model` (shared with the agent's Deck API) and sends
 * them as one batch, so it is one undo step. Each returns false when there was nothing to act on.
 */

/** How far a copy lands from its original, so that neither hides the other. */
export const COPY_OFFSET = 24;

const label = (key: string) => i18n.t(`arrange:${key}`);

interface Target {
  slide: Slide;
  elements: Element[];
  ids: string[];
}

/** The current slide and the selected elements that are on it. */
export function target(editor: Editor): Target | undefined {
  const { currentSlideId, selectedElementIds } = editor.selection.getState();
  const slide = currentSlideId ? findSlide(editor.bus.deck, currentSlideId) : undefined;
  const elements = selectedElements(slide, selectedElementIds);
  if (!slide || elements.length === 0) return undefined;
  return { slide, elements, ids: elements.map((e) => e.id) };
}

/**
 * One undo step. The elements may sit in a group, and nothing here goes through the Stage, which
 * fits a group to its children as a gesture goes: the fit is added to the step (ARR-01).
 */
function send(editor: Editor, commands: readonly Command[], name: string): void {
  if (commands.length > 0) batchFitted(editor.bus, commands, { label: name });
}

export function align(editor: Editor, edge: AlignEdge, relativeTo: ArrangeReference): boolean {
  const at = target(editor);
  if (!at) return false;
  const can = abilities(at.slide, at.ids);
  if (!(relativeTo === 'slide' ? can.toSlide : can.align)) return false;
  send(editor, alignElements(at.slide, at.ids, edge, relativeTo), label('history.align'));
  return true;
}

export function distribute(
  editor: Editor,
  axis: DistributeAxis,
  relativeTo: ArrangeReference,
): boolean {
  const at = target(editor);
  if (!at) return false;
  const can = abilities(at.slide, at.ids);
  if (!(relativeTo === 'slide' ? can.toSlide : can.distribute)) return false;
  send(editor, distributeElements(at.slide, at.ids, axis, relativeTo), label('history.distribute'));
  return true;
}

export function reorder(editor: Editor, to: ZOrderMove): boolean {
  const at = target(editor);
  if (!at) return false;
  send(editor, reorderElements(at.slide, at.ids, to), label('history.order'));
  return true;
}

/** Groups the selection and selects the group. */
export function group(editor: Editor): boolean {
  const at = target(editor);
  if (!at || !abilities(at.slide, at.ids).group) return false;
  const command = groupElements(editor.bus.deck, at.slide.id, at.ids);
  editor.bus.dispatch(command, { label: label('menu.group') });
  editor.selection.getState().selectElements([command.groupId]);
  return true;
}

/** Takes every selected group apart and selects what was in them. */
export function ungroup(editor: Editor): boolean {
  const at = target(editor);
  const groups = at?.elements.filter((e) => e.type === 'group') ?? [];
  if (!at || groups.length === 0) return false;
  send(
    editor,
    groups.map((g) => ({ type: 'element.ungroup', slideId: at.slide.id, groupId: g.id })),
    label('menu.ungroup'),
  );
  const freed = groups.flatMap((g) => g.children.map((child) => child.id));
  const others = at.ids.filter((id) => !groups.some((g) => g.id === id));
  editor.selection.getState().selectElements([...others, ...freed]);
  return true;
}

/** Locks or unlocks elements of the current slide (ARR-04). */
export function setLocked(editor: Editor, elementIds: readonly string[], locked: boolean): void {
  const slideId = editor.selection.getState().currentSlideId;
  if (!slideId) return;
  send(
    editor,
    elementIds.map((id) => updateElement(slideId, id, { locked: locked ? true : null })),
    label('history.lock'),
  );
}

/**
 * Hides or shows elements of the current slide (ARR-04). A hidden element leaves the selection:
 * there is nothing on the Stage to hold on to, and the Layers panel is where it comes back from.
 */
export function setHidden(editor: Editor, elementIds: readonly string[], hidden: boolean): void {
  const slideId = editor.selection.getState().currentSlideId;
  if (!slideId) return;
  send(
    editor,
    elementIds.map((id) => updateElement(slideId, id, { hidden: hidden ? true : null })),
    label('history.visibility'),
  );
  if (!hidden) return;
  const { selectedElementIds, selectElements } = editor.selection.getState();
  const gone = new Set(elementIds);
  if (selectedElementIds.some((id) => gone.has(id))) {
    selectElements(selectedElementIds.filter((id) => !gone.has(id)));
  }
}

/** Locks the selection, or unlocks it when all of it is locked. */
export function toggleLock(editor: Editor): boolean {
  const at = target(editor);
  if (!at) return false;
  setLocked(editor, at.ids, !abilities(at.slide, at.ids).allLocked);
  return true;
}

export function hide(editor: Editor): boolean {
  const at = target(editor);
  if (!at) return false;
  setHidden(editor, at.ids, true);
  return true;
}

/** Copies the selection next to itself and selects the copies (ARR-05, Ctrl+D). */
/**
 * Puts the look of `source` on the selected elements (ARR-06), as one undo step. False when
 * nothing would change: no selection, or the selection already looks like it.
 */
export function pasteStyle(editor: Editor, source: Element | undefined): boolean {
  const at = target(editor);
  if (!at || !source) return false;
  const commands = pasteStyleCommands(at.slide, at.ids, source);
  if (commands.length === 0) return false;
  send(editor, commands, label('history.pasteStyle'));
  return true;
}

export function duplicate(editor: Editor): boolean {
  const at = target(editor);
  if (!at) return false;
  const commands = duplicateElements(editor.bus.deck, at.slide.id, at.ids, {
    offset: { x: COPY_OFFSET, y: COPY_OFFSET },
  });
  send(editor, commands, label('menu.duplicate'));
  editor.selection.getState().selectElements(commands.map((c) => c.element.id));
  return true;
}

/** Deletes the selected elements that are not locked, as the Stage's Delete key does. */
export function remove(editor: Editor): boolean {
  const at = target(editor);
  const ids = at?.elements.filter((e) => !e.locked).map((e) => e.id) ?? [];
  if (!at || ids.length === 0) return false;
  send(
    editor,
    [{ type: 'element.remove', slideId: at.slide.id, elementIds: ids }],
    label('menu.delete'),
  );
  return true;
}

/** Gives an element a name, or takes it away with an empty one. */
export function rename(editor: Editor, elementId: string, name: string): void {
  const slideId = editor.selection.getState().currentSlideId;
  if (!slideId) return;
  editor.bus.dispatch(updateElement(slideId, elementId, { name: name.trim() || null }), {
    label: label('history.rename'),
  });
}
