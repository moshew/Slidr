import { occurrenceAt, type TextSelection } from '@slidr/agent-tools';
import type { Node as PmNode } from '@tiptap/pm/model';
import { useStore } from 'zustand';
import { activeEditor, type ActiveEditor } from './activeEditor';

/*
 * The words the user selected in the text being edited (ADR-072), for the AI chat: it shows them
 * beside the composer, and sends them to the agent with the message. The editor stays open while
 * the focus is in the chat, and draws its selection as it was, so what the chat quotes is what
 * the user still sees selected on the slide.
 */

/** A line break inside a paragraph reads as the model writes it: `\n` in the run's text. */
const leafText = (node: PmNode) => (node.type.name === 'hardBreak' ? '\n' : '');

/**
 * The selection of an editor, in the terms of `text_replace`: the selected characters, and which
 * appearance of them in the text they are. Paragraphs are joined by `\n`, as `plainText` joins
 * them, so the count is the tool's. Null for a caret, or for a selection of nothing but spaces.
 */
export function textSelectionOf(active: ActiveEditor | null): TextSelection | null {
  if (!active || active.editor.isDestroyed) return null;
  const { doc, selection } = active.editor.state;
  if (selection.empty) return null;
  const text = doc.textBetween(selection.from, selection.to, '\n', leafText);
  if (!text.trim()) return null;
  const before = doc.textBetween(0, selection.from, '\n', leafText).length;
  const all = doc.textBetween(0, doc.content.size, '\n', leafText);
  return {
    slideId: active.slideId,
    elementId: active.elementId,
    ...(active.cell ? { cell: { row: active.cell.row, col: active.cell.col } } : {}),
    text,
    occurrence: occurrenceAt(all, text, before),
  };
}

/** What is selected in the text being edited now; null when nothing is. */
export function selectedText(): TextSelection | null {
  return textSelectionOf(activeEditor.getState().active);
}

/** The same, for a component: it draws again as the selection changes. */
export function useSelectedText(): TextSelection | null {
  useStore(activeEditor, (state) => state.version);
  return selectedText();
}
