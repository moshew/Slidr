import type { Marks } from '@slidr/model';
import type { Mark as PmMark, Node as PmNode, Schema } from '@tiptap/pm/model';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import type { MarksChange, ParagraphChange, ParagraphProps, TextSample, TextSpan } from './format';
import {
  BOOLEAN_MARKS,
  cleanMarks,
  MARK_TYPES,
  PARAGRAPH_ATTRS,
  pmToMarks,
  sameValue,
} from './richTextDoc';

/*
 * Formatting the selection inside the text editor (WG4-T03, T04): the same changes as `format.ts`
 * makes to a whole rich text, made to what the caret or the selection covers.
 *
 * - With a selection, a marks change goes to the text it covers, and a paragraph change to the
 *   paragraphs it touches.
 * - With a caret, a marks change becomes the stored marks: what is typed next takes them. On an
 *   empty line they are also written to the paragraph (`emptyMarks`), as the model keeps them.
 */

/**
 * Marks a transaction as an undo step of its own, apart from the typing around it. `txId` joins it
 * to the other changes of one gesture (a drag in the colour picker).
 */
export const STEP_META = 'slidrStep';
export interface StepMeta {
  txId?: string;
  label?: string;
}

/** The model's marks for the editor's. */
export function marksOf(marks: readonly PmMark[]): Marks {
  return pmToMarks(marks.map((mark) => ({ type: mark.type.name, attrs: mark.attrs }))) ?? {};
}

/** The editor's marks for the model's. */
export function toPmMarks(schema: Schema, marks: Marks | null | undefined): PmMark[] {
  const out: PmMark[] = [];
  for (const type of MARK_TYPES) {
    const value = marks?.[type];
    const markType = schema.marks[type];
    if (value === undefined || value === false || !markType) continue;
    out.push(markType.create(BOOLEAN_MARKS.has(type) ? null : { value }));
  }
  return out;
}

/** The model's paragraph fields of a paragraph node. */
export function paragraphProps(node: PmNode): ParagraphProps {
  const attrs = node.attrs as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of PARAGRAPH_ATTRS) {
    if (attrs[key] !== null && attrs[key] !== undefined) out[key] = attrs[key];
  }
  return { dir: 'auto', align: 'start', ...out };
}

function emptyMarks(node: PmNode): Marks {
  return (node.attrs.emptyMarks as Marks | null) ?? {};
}

interface SelectedParagraph {
  node: PmNode;
  pos: number;
}

/**
 * The paragraphs the selection touches. A selection that only reaches the start of its last
 * paragraph (Shift+Down from a line above) does not touch it.
 */
export function selectedParagraphs(state: EditorState): SelectedParagraph[] {
  const { from, to, empty } = state.selection;
  const out: SelectedParagraph[] = [];
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name !== 'paragraph') return true;
    if (empty || out.length === 0 || to > pos + 1) out.push({ node, pos });
    return false;
  });
  return out;
}

/** The marks that typing at the caret would take. */
export function caretMarks(state: EditorState): Marks {
  const { $from } = state.selection;
  if (state.storedMarks) return marksOf(state.storedMarks);
  return $from.parent.content.size === 0 ? emptyMarks($from.parent) : marksOf($from.marks());
}

/** What the caret or the selection covers, for `readFormat`. */
export function sampleState(state: EditorState): TextSample {
  const { from, to, empty } = state.selection;
  const selected = selectedParagraphs(state);
  const paragraphs = selected.map(({ node }) => ({
    props: paragraphProps(node),
    text: node.textContent,
  }));
  const spans: TextSpan[] = [];
  if (!empty) {
    for (const { node, pos } of selected) {
      const paragraph = paragraphProps(node);
      if (node.content.size === 0) spans.push({ marks: emptyMarks(node), paragraph });
      node.forEach((child, offset) => {
        const start = pos + 1 + offset;
        if (start < to && start + child.nodeSize > from)
          spans.push({ marks: marksOf(child.marks), paragraph });
      });
    }
  }
  // A caret, or a selection that covers no text (from the end of one line to the start of the next).
  if (spans.length === 0) {
    spans.push({
      marks: caretMarks(state),
      paragraph: paragraphProps(state.selection.$from.parent),
    });
  }
  return { paragraphs, spans };
}

/** A transaction that makes a marks change to the selection, or to what is typed next. */
export function changeMarksTr(state: EditorState, change: MarksChange): Transaction {
  const { schema, selection } = state;
  const tr = state.tr;
  const apply = (marks: Marks, paragraph: ParagraphProps) =>
    cleanMarks(change(marks, paragraph)) ?? {};

  if (selection.empty) {
    const { $from } = selection;
    const node = $from.parent;
    const next = apply(caretMarks(state), paragraphProps(node));
    tr.setStoredMarks(toPmMarks(schema, next));
    if (node.content.size === 0)
      tr.setNodeAttribute($from.before(), 'emptyMarks', Object.keys(next).length ? next : null);
    return tr;
  }

  const { from, to } = selection;
  for (const { node, pos } of selectedParagraphs(state)) {
    const paragraph = paragraphProps(node);
    if (node.content.size === 0) {
      const next = apply(emptyMarks(node), paragraph);
      tr.setNodeAttribute(pos, 'emptyMarks', Object.keys(next).length ? next : null);
      continue;
    }
    node.forEach((child, offset) => {
      const start = Math.max(from, pos + 1 + offset);
      const end = Math.min(to, pos + 1 + offset + child.nodeSize);
      if (start >= end) return;
      const current = marksOf(child.marks);
      const next = apply(current, paragraph);
      for (const type of MARK_TYPES) {
        const markType = schema.marks[type];
        if (!markType || sameValue(current[type], next[type])) continue;
        const value = next[type];
        if (value === undefined) tr.removeMark(start, end, markType);
        else tr.addMark(start, end, markType.create(BOOLEAN_MARKS.has(type) ? null : { value }));
      }
    });
  }
  return tr;
}

/** A transaction that makes a paragraph change to the paragraphs the selection touches. */
export function changeParagraphsTr(state: EditorState, change: ParagraphChange): Transaction {
  const tr = state.tr;
  for (const { node, pos } of selectedParagraphs(state)) {
    const next = change(paragraphProps(node)) as Record<string, unknown>;
    const attrs = node.attrs as Record<string, unknown>;
    for (const key of PARAGRAPH_ATTRS) {
      const value = next[key] ?? null;
      if (!sameValue(attrs[key] ?? null, value)) tr.setNodeAttribute(pos, key, value);
    }
  }
  return tr;
}
