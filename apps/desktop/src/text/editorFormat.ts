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

/** A stretch of the document, in its positions. */
export interface TextRange {
  from: number;
  to: number;
}

/**
 * The paragraphs the selection touches, or a range given in its place. A selection that only
 * reaches the start of its last paragraph (Shift+Down from a line above) does not touch it.
 */
export function selectedParagraphs(
  state: EditorState,
  range: TextRange = state.selection,
): SelectedParagraph[] {
  const { from, to } = range;
  const out: SelectedParagraph[] = [];
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name !== 'paragraph') return true;
    if (from === to || out.length === 0 || to > pos + 1) out.push({ node, pos });
    return false;
  });
  return out;
}

/** All the text of the paragraphs the selection touches: what a change to a paragraph's style covers. */
export function paragraphsRange(state: EditorState): TextRange {
  const selected = selectedParagraphs(state);
  const first = selected[0];
  const last = selected.at(-1);
  if (!first || !last) return state.selection;
  return { from: first.pos + 1, to: last.pos + last.node.nodeSize - 1 };
}

/**
 * The word the caret is in or beside, by the browser's own word breaking (Hebrew and Latin
 * alike). Null when the selection is not a caret, or the caret is not at a word.
 */
export function wordRange(state: EditorState): TextRange | null {
  const { $from, empty } = state.selection;
  if (!empty || !$from.parent.isTextblock) return null;
  // One character for a line break, as it has one position.
  const text = $from.parent.textBetween(0, $from.parent.content.size, undefined, '\n');
  const offset = $from.parentOffset;
  for (const part of new Intl.Segmenter(undefined, { granularity: 'word' }).segment(text)) {
    const end = part.index + part.segment.length;
    if (part.isWordLike && offset >= part.index && offset <= end)
      return { from: $from.start() + part.index, to: $from.start() + end };
  }
  return null;
}

/**
 * The whole link the caret is in, or at an edge of: its stretch of text, and where it goes. Null
 * when the selection is not a caret, or the caret is not at a link.
 */
export function linkAt(state: EditorState): (TextRange & { link: string }) | null {
  const { $from, empty } = state.selection;
  if (!empty) return null;
  // The links of the paragraph. A link whose text is formatted in parts is several nodes.
  const links: (TextRange & { link: string })[] = [];
  $from.parent.forEach((child, offset) => {
    const link = marksOf(child.marks).link;
    if (!link) return;
    const last = links.at(-1);
    if (last?.link === link && last.to === offset) last.to = offset + child.nodeSize;
    else links.push({ link, from: offset, to: offset + child.nodeSize });
  });
  const caret = $from.parentOffset;
  const at = links.find(({ from, to }) => caret >= from && caret <= to);
  return at ? { link: at.link, from: $from.start() + at.from, to: $from.start() + at.to } : null;
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

/**
 * A transaction that makes a marks change to the selection, or to what is typed next. With
 * `range` the change goes to that stretch of the text instead (a whole link, the paragraphs of a
 * text style); `tr` adds it to a transaction that already holds another change of the same step.
 */
export function changeMarksTr(
  state: EditorState,
  change: MarksChange,
  range: TextRange = state.selection,
  tr: Transaction = state.tr,
): Transaction {
  const { schema, selection } = state;
  const apply = (marks: Marks, paragraph: ParagraphProps) =>
    cleanMarks(change(marks, paragraph)) ?? {};

  if (selection.empty) {
    // The caret too: what is typed next takes the change, and so does the empty line it is on.
    const { $from } = selection;
    const node = $from.parent;
    const next = apply(caretMarks(state), paragraphProps(node));
    tr.setStoredMarks(toPmMarks(schema, next));
    if (node.content.size === 0)
      tr.setNodeAttribute($from.before(), 'emptyMarks', Object.keys(next).length ? next : null);
    if (range.from === range.to) return tr;
  }

  const { from, to } = range;
  for (const { node, pos } of selectedParagraphs(state, range)) {
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
export function changeParagraphsTr(
  state: EditorState,
  change: ParagraphChange,
  range: TextRange = state.selection,
  tr: Transaction = state.tr,
): Transaction {
  for (const { node, pos } of selectedParagraphs(state, range)) {
    const next = change(paragraphProps(node)) as Record<string, unknown>;
    const attrs = node.attrs as Record<string, unknown>;
    for (const key of PARAGRAPH_ATTRS) {
      const value = next[key] ?? null;
      if (!sameValue(attrs[key] ?? null, value)) tr.setNodeAttribute(pos, key, value);
    }
  }
  return tr;
}
