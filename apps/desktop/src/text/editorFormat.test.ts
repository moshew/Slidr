import { createBaseTheme, walkElements, type Paragraph, type RichText } from '@slidr/model';
import { fixtureDecks } from '@slidr/model/fixtures';
import { referenceDeck } from '@slidr/renderer/fixtures';
import { getSchema, type JSONContent } from '@tiptap/core';
import { EditorState, TextSelection, type Transaction } from '@tiptap/pm/state';
import { describe, expect, it } from 'vitest';
import {
  caretMarks,
  changeMarksTr,
  changeParagraphsTr,
  sampleState,
  selectedParagraphs,
} from './editorFormat';
import {
  boldChange,
  listChange,
  mapMarks,
  mapParagraphs,
  patchMarks,
  patchParagraph,
  readFormat,
  sampleRichText,
  type FormatContext,
} from './format';
import { docToRichText, normalizeRichText, richTextToDoc } from './richTextDoc';
import { textExtensions } from './schema';

const theme = createBaseTheme();
const ctx: FormatContext = { theme, dir: 'rtl' };
const schema = getSchema(textExtensions({ getTheme: () => theme, styleRef: 'body', wrap: true }));

const p = (runs: Paragraph['runs'], extra: Partial<Paragraph> = {}): Paragraph => ({
  dir: 'auto',
  align: 'start',
  runs,
  ...extra,
});

/**
 * An editor state on a rich text. Positions: 0 is before the first paragraph, 1 the start of its
 * text; each paragraph takes its text length plus two.
 */
function stateOf(rich: RichText, from?: number, to = from): EditorState {
  const doc = schema.nodeFromJSON(richTextToDoc(rich));
  const end = doc.content.size - 1;
  return EditorState.create({
    doc,
    selection: TextSelection.create(doc, from ?? 1, to ?? end),
  });
}

const richOf = (state: EditorState) => docToRichText(state.doc.toJSON() as JSONContent);
const applied = (state: EditorState, tr: Transaction) => richOf(state.apply(tr));

const two: RichText = {
  paragraphs: [p([{ text: 'שלום עולם' }]), p([{ text: 'Hello world' }])],
};

describe('a marks change in the editor', () => {
  it('goes to the selected text only, splitting a run where the selection ends', () => {
    // "לום ע": from the second letter of the first word to the first of the second.
    const state = stateOf(two, 2, 7);
    expect(applied(state, changeMarksTr(state, patchMarks({ italic: true }))).paragraphs).toEqual([
      p([{ text: 'ש' }, { text: 'לום ע', marks: { italic: true } }, { text: 'ולם' }]),
      p([{ text: 'Hello world' }]),
    ]);
  });

  it('goes across paragraphs, each by its own text style', () => {
    const rich: RichText = {
      paragraphs: [p([{ text: 'Title' }], { styleRef: 'title' }), p([{ text: 'body' }])],
    };
    const state = stateOf(rich);
    // Not bold: the title style is 700, so it needs an explicit 400; the body needs nothing.
    const bold = state.apply(changeMarksTr(state, boldChange(true, ctx)));
    expect(richOf(bold).paragraphs.map((x) => x.runs)).toEqual([
      [{ text: 'Title' }],
      [{ text: 'body', marks: { weight: 700 } }],
    ]);
    expect(
      applied(bold, changeMarksTr(bold, boldChange(false, ctx))).paragraphs.map((x) => x.runs),
    ).toEqual([[{ text: 'Title', marks: { weight: 400 } }], [{ text: 'body' }]]);
  });

  it('replaces a mark of the same kind, and removes one given as null', () => {
    const rich: RichText = {
      paragraphs: [p([{ text: 'a', marks: { size: 40, underline: true } }, { text: 'b' }])],
    };
    const state = stateOf(rich);
    const tr = changeMarksTr(state, patchMarks({ size: 60, underline: null }));
    expect(applied(state, tr).paragraphs[0]?.runs).toEqual([{ text: 'ab', marks: { size: 60 } }]);
  });

  it('with a caret becomes the stored marks: the text does not change, typing takes them', () => {
    const state = stateOf(two, 5);
    const tr = changeMarksTr(state, patchMarks({ weight: 700 }));
    expect(tr.docChanged).toBe(false);
    const next = state.apply(tr);
    expect(caretMarks(next)).toEqual({ weight: 700 });
    expect(readFormat(sampleState(next), ctx).bold).toBe(true);
    expect(applied(next, next.tr.insertText('X')).paragraphs[0]?.runs).toEqual([
      { text: 'שלום' },
      { text: 'X', marks: { weight: 700 } },
      { text: ' עולם' },
    ]);
    // Turning a mark off at the caret stops it for what is typed next, too.
    const bold: RichText = { paragraphs: [p([{ text: 'ab', marks: { weight: 700 } }])] };
    const inBold = stateOf(bold, 2);
    const off = inBold.apply(changeMarksTr(inBold, boldChange(false, ctx)));
    expect(applied(off, off.tr.insertText('X')).paragraphs[0]?.runs).toEqual([
      { text: 'a', marks: { weight: 700 } },
      { text: 'X' },
      { text: 'b', marks: { weight: 700 } },
    ]);
  });

  it('on an empty line is written to the line, as the model keeps it', () => {
    const rich: RichText = { paragraphs: [p([{ text: 'a' }]), p([])] };
    const state = stateOf(rich, 4);
    const sized = state.apply(changeMarksTr(state, patchMarks({ size: 60 })));
    expect(richOf(sized).paragraphs[1]?.runs).toEqual([{ text: '', marks: { size: 60 } }]);
    expect(caretMarks(sized)).toEqual({ size: 60 });
    expect(readFormat(sampleState(sized), ctx).size).toBe(60);
    const plain = sized.apply(changeMarksTr(sized, patchMarks({ size: null })));
    expect(richOf(plain).paragraphs[1]?.runs).toEqual([]);
  });

  it('reaches the empty lines inside a selection', () => {
    const rich: RichText = { paragraphs: [p([{ text: 'a' }]), p([]), p([{ text: 'b' }])] };
    const state = stateOf(rich);
    expect(applied(state, changeMarksTr(state, patchMarks({ size: 60 }))).paragraphs).toEqual([
      p([{ text: 'a', marks: { size: 60 } }]),
      p([{ text: '', marks: { size: 60 } }]),
      p([{ text: 'b', marks: { size: 60 } }]),
    ]);
  });
});

describe('a paragraph change in the editor', () => {
  it('goes to the paragraph of the caret', () => {
    const state = stateOf(two, 14);
    const tr = changeParagraphsTr(state, patchParagraph({ align: 'center', lineHeight: 2 }));
    expect(applied(state, tr).paragraphs).toEqual([
      p([{ text: 'שלום עולם' }]),
      p([{ text: 'Hello world' }], { align: 'center', lineHeight: 2 }),
    ]);
  });

  it('goes to every paragraph the selection touches', () => {
    const state = stateOf(two, 5, 14);
    const tr = changeParagraphsTr(state, listChange('bullet', true));
    expect(applied(state, tr).paragraphs.map((x) => x.list)).toEqual([
      { kind: 'bullet', level: 0 },
      { kind: 'bullet', level: 0 },
    ]);
  });

  it('a selection that only reaches the start of the next line does not touch it', () => {
    // From inside the first paragraph to the very start of the second (Shift+Down).
    const state = stateOf(two, 5, 12);
    expect(selectedParagraphs(state)).toHaveLength(1);
    const tr = changeParagraphsTr(state, patchParagraph({ align: 'end' }));
    expect(applied(state, tr).paragraphs.map((x) => x.align)).toEqual(['end', 'start']);
    // One character further, and it does.
    expect(selectedParagraphs(stateOf(two, 5, 13))).toHaveLength(2);
  });

  it('changes nothing when the value is already there', () => {
    const state = stateOf(two);
    expect(changeParagraphsTr(state, patchParagraph({ align: 'start' })).docChanged).toBe(false);
    expect(changeMarksTr(state, patchMarks({ italic: null })).docChanged).toBe(false);
  });
});

describe('reading the format of a selection', () => {
  const rich: RichText = {
    paragraphs: [
      p([{ text: 'plain ' }, { text: 'bold', marks: { weight: 700 } }]),
      p([{ text: 'big', marks: { size: 60 } }], { align: 'center' }),
    ],
  };

  it('covers only what is selected', () => {
    // "bold" alone.
    const bold = readFormat(sampleState(stateOf(rich, 7, 11)), ctx);
    expect(bold).toMatchObject({ bold: true, weight: 700, size: 30, align: 'start' });
    // Everything.
    const all = readFormat(sampleState(stateOf(rich)), ctx);
    expect(all.bold).toBe(false);
    expect(typeof all.size).toBe('symbol');
    expect(typeof all.align).toBe('symbol');
  });

  it('at a caret is what typing there would take', () => {
    // Right after "bold": typing continues it.
    expect(readFormat(sampleState(stateOf(rich, 11)), ctx).bold).toBe(true);
    expect(readFormat(sampleState(stateOf(rich, 3)), ctx).bold).toBe(false);
    expect(readFormat(sampleState(stateOf(rich, 14)), ctx)).toMatchObject({
      size: 60,
      align: 'center',
    });
  });
});

describe('the two targets agree', () => {
  function allRichTexts(): RichText[] {
    const decks = [...Object.values(fixtureDecks).map((make) => make()), referenceDeck()];
    const out: RichText[] = [];
    for (const deck of decks) {
      for (const slide of deck.slides) {
        for (const e of walkElements(slide.elements)) {
          if (e.type === 'text') out.push(e.content);
          if (e.type === 'shape' && e.content) out.push(e.content);
        }
      }
    }
    return out.filter((rich) => rich.paragraphs.length > 0);
  }

  it('selecting all the text of a box and formatting it is formatting the box', () => {
    const marks = [
      patchMarks({ size: 44, color: { token: 'accent' } }),
      patchMarks({ italic: true, underline: null, font: 'Rubik' }),
      boldChange(true, ctx),
      boldChange(false, ctx),
    ];
    const paragraphs = [
      patchParagraph({ align: 'center', dir: 'rtl', lineHeight: 1.2, spaceAfter: 12 }),
      listChange('number', true),
      listChange('bullet', false),
    ];
    const texts = allRichTexts();
    expect(texts.length).toBeGreaterThan(40);
    for (const rich of texts) {
      const state = stateOf(rich);
      for (const change of marks)
        expect(applied(state, changeMarksTr(state, change))).toEqual(mapMarks(rich, change));
      for (const change of paragraphs)
        expect(applied(state, changeParagraphsTr(state, change))).toEqual(
          mapParagraphs(rich, change),
        );
      // And both read the same format.
      expect(readFormat(sampleState(state), ctx)).toEqual(
        readFormat(sampleRichText(normalizeRichText(rich)), ctx),
      );
    }
  });
});
