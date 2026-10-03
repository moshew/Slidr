import { createBaseTheme, walkElements, type Paragraph, type RichText } from '@slidr/model';
import { fixtureDecks } from '@slidr/model/fixtures';
import { referenceDeck } from '@slidr/renderer/fixtures';
import { getSchema } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import { docToRichText, normalizeRichText, richTextToDoc } from './richTextDoc';
import { cssText, textExtensions } from './schema';

const schema = getSchema(
  textExtensions({ getTheme: createBaseTheme, styleRef: 'body', wrap: true }),
);

/** Through the real ProseMirror schema and back, as the editor would. */
function roundTrip(rich: RichText): RichText {
  const node = schema.nodeFromJSON(richTextToDoc(rich));
  node.check();
  return docToRichText(node.toJSON() as Parameters<typeof docToRichText>[0]);
}

function allRichTexts(): RichText[] {
  const decks = [...Object.values(fixtureDecks).map((make) => make()), referenceDeck()];
  const out: RichText[] = [];
  for (const deck of decks) {
    for (const slide of deck.slides) {
      for (const e of walkElements(slide.elements)) {
        if (e.type === 'text') out.push(e.content);
        if (e.type === 'shape' && e.content) out.push(e.content);
        if (e.type === 'table')
          for (const row of e.cells) for (const cell of row) out.push(cell.content);
      }
      if (slide.notes) out.push(slide.notes);
    }
  }
  return out;
}

const p = (runs: Paragraph['runs'], extra: Partial<Paragraph> = {}): Paragraph => ({
  dir: 'rtl',
  align: 'start',
  runs,
  ...extra,
});

describe('RichText <-> editor document', () => {
  it('round-trips every text of the sample and reference decks', () => {
    const texts = allRichTexts();
    expect(texts.length).toBeGreaterThan(50);
    for (const rich of texts) expect(roundTrip(rich)).toEqual(normalizeRichText(rich));
  });

  it('keeps every paragraph attribute and every mark', () => {
    const rich: RichText = {
      paragraphs: [
        p(
          [
            {
              text: 'a',
              marks: {
                font: 'Rubik',
                size: 40,
                weight: 700,
                italic: true,
                underline: true,
                strike: true,
              },
            },
            {
              text: 'b',
              marks: { color: { token: 'primary', alpha: 0.5 }, highlight: { value: '#ff0' } },
            },
            {
              text: 'c',
              marks: { letterSpacing: 2, script: 'sup', case: 'upper', link: 'https://x.dev' },
            },
          ],
          {
            lineHeight: 1.3,
            spaceBefore: 4,
            spaceAfter: 8,
            indent: 12,
            styleRef: 'heading',
            align: 'justify',
          },
        ),
        p([{ text: 'item' }], {
          list: { kind: 'number', level: 2, glyph: '*', color: { token: 'accent' } },
        }),
      ],
    };
    expect(roundTrip(rich)).toEqual(rich);
  });

  it('turns a newline inside a run into a line break and back', () => {
    const rich: RichText = {
      paragraphs: [p([{ text: 'one\ntwo', marks: { weight: 700 } }, { text: '\n' }])],
    };
    const doc = richTextToDoc(rich);
    expect(doc.content?.[0]?.content?.map((n) => n.type)).toEqual([
      'text',
      'hardBreak',
      'text',
      'hardBreak',
    ]);
    expect(roundTrip(rich)).toEqual(rich);
  });

  it('keeps the formatting of an empty line', () => {
    const rich: RichText = { paragraphs: [p([{ text: '', marks: { size: 60 } }]), p([])] };
    expect(roundTrip(rich)).toEqual(rich);
  });

  it('merges adjacent runs with the same marks and drops empty ones', () => {
    const rich: RichText = {
      paragraphs: [
        p([
          { text: 'a' },
          { text: '' },
          { text: 'b', marks: {} },
          { text: 'c', marks: { italic: false } },
        ]),
      ],
    };
    expect(roundTrip(rich)).toEqual({ paragraphs: [p([{ text: 'abc' }])] });
  });

  it('gives an empty rich text one empty paragraph to type in', () => {
    expect(roundTrip({ paragraphs: [] })).toEqual({
      paragraphs: [{ dir: 'auto', align: 'start', runs: [] }],
    });
  });
});

describe('editor DOM', () => {
  it('writes React styles as CSS', () => {
    expect(
      cssText({
        fontSize: 30,
        lineHeight: 1.4,
        paddingInlineStart: '2em',
        WebkitBoxDecorationBreak: 'clone',
      }),
    ).toBe(
      'font-size: 30px; line-height: 1.4; padding-inline-start: 2em; -webkit-box-decoration-break: clone',
    );
  });

  it('draws a paragraph with the renderer style and marks as nested spans', () => {
    const node = schema.nodeFromJSON(
      richTextToDoc({
        paragraphs: [p([{ text: 'x', marks: { size: 40, script: 'sup' } }], { styleRef: 'title' })],
      }),
    );
    const spec = node.firstChild?.type.spec.toDOM?.(node.firstChild);
    expect(JSON.stringify(spec)).toContain('font-size: 72px');
    const marks = node.firstChild?.firstChild?.marks.map((m) => m.type.name);
    expect(marks).toEqual(['size', 'script']);
  });
});
