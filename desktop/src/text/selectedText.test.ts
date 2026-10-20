import { replaceInText } from '@slidr/agent-tools';
import { createBaseTheme, type RichText } from '@slidr/model';
import { getSchema, type Editor } from '@tiptap/core';
import { Node as PmNode } from '@tiptap/pm/model';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { describe, expect, it } from 'vitest';
import type { ActiveEditor } from './activeEditor';
import { richTextToDoc } from './richTextDoc';
import { textExtensions } from './schema';
import { textSelectionOf } from './selectedText';

const theme = createBaseTheme();
const schema = getSchema(textExtensions({ getTheme: () => theme, styleRef: 'body', wrap: true }));

/** An editor open on `content`, with the characters `from` to `to` of its text selected. */
function editorOn(content: RichText, select: (doc: PmNode) => [number, number]): ActiveEditor {
  const doc = PmNode.fromJSON(schema, richTextToDoc(content));
  const [from, to] = select(doc);
  const state = EditorState.create({ doc, selection: TextSelection.create(doc, from, to) });
  return {
    editor: { isDestroyed: false, state } as unknown as Editor,
    slideId: 's_1',
    elementId: 'e_1',
  };
}

/** The document position of the `n`th appearance of `text`, counted from 1. */
function at(doc: PmNode, text: string, n = 1): [number, number] {
  const found: number[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText) return;
    for (let i = node.text!.indexOf(text); i >= 0; i = node.text!.indexOf(text, i + text.length)) {
      found.push(pos + i);
    }
  });
  const start = found[n - 1]!;
  return [start, start + text.length];
}

const p = (text: string) => ({ dir: 'rtl' as const, align: 'start' as const, runs: [{ text }] });

describe('the words selected in the text being edited (ADR-072)', () => {
  it('are quoted with the appearance text_replace finds them by', () => {
    const content = { paragraphs: [p('עוזר AI מציע תשובות'), p('תשובות בזמן אמת, תשובות')] };
    const second = editorOn(content, (doc) => at(doc, 'תשובות', 2));
    const selected = textSelectionOf(second)!;
    expect(selected).toEqual({ slideId: 's_1', elementId: 'e_1', text: 'תשובות', occurrence: 2 });
    // The tool, given what the chat quotes, changes the words the user selected and no others.
    const outcome = replaceInText(content, selected.text, selected.occurrence, { replace: 'X' });
    expect(outcome).toMatchObject({
      ok: true,
      content: { paragraphs: [p('עוזר AI מציע תשובות'), p('X בזמן אמת, תשובות')] },
    });
  });

  it('read a line break and the end of a paragraph as the model writes them', () => {
    const content = { paragraphs: [p('one\ntwo'), p('three')] };
    const across = editorOn(content, (doc) => [at(doc, 'two')[0], at(doc, 'three')[1]]);
    expect(textSelectionOf(across)).toMatchObject({ text: 'two\nthree', occurrence: 1 });
    const broken = editorOn(content, (doc) => [at(doc, 'one')[0], at(doc, 'two')[1]]);
    expect(textSelectionOf(broken)).toMatchObject({ text: 'one\ntwo', occurrence: 1 });
  });

  it('name the cell of a table, and are nothing for a caret, spaces, or no editor', () => {
    const content = { paragraphs: [p('a  b')] };
    const cell = { ...editorOn(content, (doc) => at(doc, 'b')), cell: { row: 1, col: 2 } };
    expect(textSelectionOf(cell)).toMatchObject({ cell: { row: 1, col: 2 }, text: 'b' });
    expect(textSelectionOf(editorOn(content, (doc) => [at(doc, 'b')[0], at(doc, 'b')[0]]))).toBe(
      null,
    );
    expect(textSelectionOf(editorOn(content, (doc) => [at(doc, '  ')[0], at(doc, '  ')[1]]))).toBe(
      null,
    );
    expect(textSelectionOf(null)).toBe(null);
  });
});
