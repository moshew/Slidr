import { CommandBus, CommandError, richText, type AssetMeta, type Deck } from '@slidr/model';
import { describe, expect, it } from 'vitest';
import { createSlide } from './createSlide';
import { deckFromTemplate } from './deck';
import { nightTemplate, paperTemplate } from './fixtures';

const PHOTO: AssetMeta = {
  id: 'a'.repeat(64),
  file: `${'a'.repeat(64)}.jpg`,
  mime: 'image/jpeg',
  kind: 'image',
  bytes: 1024,
  origin: 'upload',
};

function paperDeck(lang = 'en'): Deck {
  const deck = deckFromTemplate(paperTemplate(), { lang });
  deck.assets[PHOTO.id] = PHOTO;
  return deck;
}

/** Adds the slide through a validating bus: its ids are free and it is a valid slide. */
function add(deck: Deck, slide: ReturnType<typeof createSlide>['slide']): Deck {
  const bus = new CommandBus(deck, { validate: true });
  bus.dispatch({ type: 'slide.add', slide });
  return bus.deck;
}

describe('createSlide', () => {
  it('fills each role, with the look of its placeholder', () => {
    const deck = paperDeck();
    const { slide, unplaced } = createSlide(deck, {
      layoutId: 'l_paper_hero',
      name: 'Opening',
      content: {
        title: richText('Plan for the quarter', { dir: 'ltr', align: 'end', styleRef: 'body' }),
        subtitle: richText('What we build\nand when', { dir: 'ltr' }),
        image: { assetId: PHOTO.id },
      },
    });
    expect(unplaced).toEqual([]);
    expect(slide).toMatchObject({ name: 'Opening', layoutId: 'l_paper_hero' });
    const [title, subtitle, image] = slide.elements;
    // The layout decides the text style; it states no alignment here, so the text keeps its own.
    expect(title).toMatchObject({
      type: 'text',
      role: 'title',
      frame: { x: 96, y: 320, w: 1100, h: 260 },
      vAlign: 'bottom',
      content: {
        paragraphs: [
          {
            dir: 'ltr',
            align: 'end',
            styleRef: 'display',
            runs: [{ text: 'Plan for the quarter' }],
          },
        ],
      },
    });
    expect(subtitle).toMatchObject({
      role: 'subtitle',
      content: {
        paragraphs: [
          { styleRef: 'heading', runs: [{ text: 'What we build' }] },
          { styleRef: 'heading', runs: [{ text: 'and when' }] },
        ],
      },
    });
    expect(image).toMatchObject({ type: 'image', role: 'image', assetId: PHOTO.id });
    expect(add(deck, slide).slides).toHaveLength(1);
  });

  it('takes the alignment of a placeholder that states one, and keeps lists and marks', () => {
    const deck = paperDeck();
    const { slide } = createSlide(deck, {
      layoutId: 'l_paper_section',
      content: {
        number: richText('01', { dir: 'ltr' }),
        title: {
          paragraphs: [
            {
              dir: 'ltr',
              align: 'start',
              list: { kind: 'bullet', level: 0 },
              runs: [{ text: 'Results', marks: { italic: true } }],
            },
          ],
        },
      },
    });
    expect(slide.elements[1]).toMatchObject({
      vAlign: 'middle',
      content: {
        paragraphs: [
          {
            align: 'center',
            styleRef: 'display',
            list: { kind: 'bullet', level: 0 },
            runs: [{ text: 'Results', marks: { italic: true } }],
          },
        ],
      },
    });
  });

  it('fills the placeholders of a repeated role in order, and a single value goes to the first', () => {
    const deck = paperDeck();
    const texts = (slide: ReturnType<typeof createSlide>['slide']) =>
      slide.elements.map((e) => (e.type === 'text' ? e.content.paragraphs[0]!.runs[0]?.text : '?'));

    const cards = createSlide(deck, {
      layoutId: 'l_paper_cards3',
      content: {
        title: richText('How it works'),
        body: [richText('Plan'), richText('Build'), richText('Look')],
      },
    });
    expect(cards.unplaced).toEqual([]);
    expect(texts(cards.slide)).toEqual(['How it works', 'Plan', 'Build', 'Look']);
    expect(cards.slide.elements.map((e) => e.frame.x)).toEqual([96, 128, 720, 1312]);

    const one = createSlide(deck, {
      layoutId: 'l_paper_cards3',
      content: { body: richText('Plan') },
    });
    expect(one.unplaced).toEqual([]);
    expect(texts(one.slide)).toEqual([undefined, 'Plan', undefined, undefined]);
  });

  it('makes the slide without content the layout has no place for, and says which roles', () => {
    const deck = paperDeck();
    // No such role in the layout; more values than placeholders; content of the wrong kind.
    const { slide, unplaced } = createSlide(deck, {
      layoutId: 'l_paper_cards3',
      content: {
        quote: richText('It just works.'),
        body: [richText('1'), richText('2'), richText('3'), richText('4')],
        title: { imagePrompt: 'A title cannot be a picture' },
      },
    });
    expect(unplaced.sort()).toEqual(['body', 'quote', 'title']);
    expect(slide.elements.map((e) => e.role)).toEqual(['title', 'body', 'body', 'body']);
    // The title stays the empty box of its placeholder.
    expect(slide.elements[0]).toMatchObject({
      type: 'text',
      content: { paragraphs: [{ styleRef: 'title', runs: [] }] },
    });
    expect(add(deck, slide).slides).toHaveLength(1);

    const picture = createSlide(deck, {
      layoutId: 'l_paper_text_image',
      content: { image: richText('A picture cannot be text') },
    });
    expect(picture.unplaced).toEqual(['image']);
  });

  it('gives a chart placeholder its element, an image prompt its frame, and nothing for the number', () => {
    const deck = paperDeck();
    const chart = createSlide(deck, { layoutId: 'l_paper_chart', content: {} });
    expect(chart.slide.elements.map((e) => [e.type, e.role])).toEqual([
      ['text', 'title'],
      ['chart', 'chart'],
      ['text', 'body'],
    ]);
    // Text after a placeholder that gives no element still lands in its own box.
    const withBody = createSlide(deck, {
      layoutId: 'l_paper_chart',
      content: { body: richText('Growth held.'), slideNumber: richText('7') },
    });
    expect(withBody.unplaced).toEqual(['slideNumber']);
    expect(withBody.slide.elements[2]).toMatchObject({
      role: 'body',
      frame: { x: 1244, y: 260, w: 580, h: 740 },
      content: { paragraphs: [{ runs: [{ text: 'Growth held.' }] }] },
    });

    const hero = createSlide(deck, {
      layoutId: 'l_paper_hero',
      content: { image: { imagePrompt: 'A sunlit desk' } },
    });
    expect(hero.slide.elements[2]).toMatchObject({ type: 'image', prompt: 'A sunlit desk' });
    expect(hero.slide.elements[2]).not.toHaveProperty('assetId');
  });

  it("uses the layout of the deck's direction: in a Hebrew deck the text is on the right", () => {
    const deck = paperDeck('he');
    const { slide } = createSlide(deck, {
      layoutId: 'l_paper_hero',
      content: { title: richText('תוכנית לרבעון', { dir: 'rtl' }) },
    });
    expect(slide.elements.map((e) => e.frame.x)).toEqual([724, 724, 0]);
    expect(slide.elements[0]).toMatchObject({
      content: { paragraphs: [{ dir: 'rtl', align: 'start', styleRef: 'display' }] },
    });

    // A template drawn right-to-left is used as drawn, with its table in the deck's direction.
    const night = deckFromTemplate(nightTemplate(), { lang: 'he' });
    const table = createSlide(night, { layoutId: 'l_night_table' }).slide.elements[1];
    expect(table).toMatchObject({ type: 'table', dir: 'rtl', frame: { x: 96, w: 1728 } });
  });

  it('gives new ids on every call, changes nothing, and reports what is missing', () => {
    const deck = paperDeck();
    const before = JSON.stringify(deck);
    const first = createSlide(deck, { layoutId: 'l_paper_hero' }).slide;
    const second = createSlide(add(deck, first), { layoutId: 'l_paper_hero' }).slide;
    const ids = [first, second].flatMap((s) => [s.id, ...s.elements.map((e) => e.id)]);
    expect(new Set(ids).size).toBe(8);
    expect(JSON.stringify(deck)).toBe(before);

    expect(() => createSlide(deck, { layoutId: 'l_gone' })).toThrow(CommandError);
    expect(() =>
      createSlide(deck, { layoutId: 'l_paper_hero', content: { image: { assetId: 'nope' } } }),
    ).toThrow(/Asset "nope" is not in the deck/);
  });
});
