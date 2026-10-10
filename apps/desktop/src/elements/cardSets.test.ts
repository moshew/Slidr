import {
  CommandBus,
  createDeck,
  createSelectionStore,
  createSlide,
  plainText,
  Slide,
  walkElements,
  type Element,
  type GroupElement,
  type TextElement,
} from '@slidr/model';
import { describe, expect, it } from 'vitest';
import { builtinFamilies } from '../fonts/builtinFonts.generated';
import { cardBox } from '../objects/card';
import {
  CARD_SETS,
  cardKinds,
  cardPicture,
  cardSetOf,
  cardsOf,
  mostCards,
  newCardSet,
  readingOf,
  roomOn,
  rowsOf,
  sampleCard,
  withCard,
  withoutCard,
  type CardSetId,
  type Reading,
} from './cardSets';

const SLIDE = { w: 1920, h: 1080 };
/** The slide between its top and bottom margins, with nothing else on it. */
const ROOM = { top: 80, bottom: 1000 };
const HE: Reading = { he: true, rtl: true };
const EN: Reading = { he: false, rtl: false };
const READINGS = { he: HE, en: EN };

/** A new set where the app puts it: between the side margins, under the room of a title. */
function onSlide(id: CardSetId, reading: Reading, y = 250): GroupElement {
  const set = newCardSet(id, reading);
  return { ...set, frame: { ...set.frame, x: 96, y } };
}

/** A set after cards were added to it, kind after kind, until it has `count`. */
function grown(id: CardSetId, reading: Reading, count: number): GroupElement {
  let set = onSlide(id, reading);
  while (cardsOf(set).length < count) {
    set = withCard(set, cardsOf(set).length % cardKinds(id), reading, ROOM)!;
  }
  return set;
}

const texts = (element: Element): string[] =>
  [...walkElements([element])].flatMap((inside) =>
    (inside.type === 'text' || inside.type === 'shape') && inside.content
      ? [plainText(inside.content)]
      : [],
  );

const overlap = (a: GroupElement, b: GroupElement) =>
  a.frame.x < b.frame.x + b.frame.w - 0.01 &&
  b.frame.x < a.frame.x + a.frame.w - 0.01 &&
  a.frame.y < b.frame.y + b.frame.h - 0.01 &&
  b.frame.y < a.frame.y + a.frame.h - 0.01;

/** Every card inside the set, none over another, and each still a card with its box. */
function expectLaidOut(set: GroupElement, label: string) {
  const cards = cardsOf(set);
  for (const card of cards) {
    expect(cardBox(card), `${label}: a card keeps its box`).toBeDefined();
    expect(card.frame.x, label).toBeGreaterThanOrEqual(-0.01);
    expect(card.frame.y, label).toBeGreaterThanOrEqual(-0.01);
    expect(card.frame.x + card.frame.w, label).toBeLessThanOrEqual(set.frame.w + 0.01);
    expect(card.frame.y + card.frame.h, label).toBeLessThanOrEqual(set.frame.h + 0.01);
    for (const part of card.children) {
      expect(part.frame.w, `${label}: no part is squeezed away`).toBeGreaterThan(0);
      expect(part.frame.x, label).toBeGreaterThanOrEqual(-0.01);
      expect(part.frame.x + part.frame.w, label).toBeLessThanOrEqual(card.frame.w + 0.01);
      expect(part.frame.y + part.frame.h, label).toBeLessThanOrEqual(card.frame.h + 0.01);
    }
  }
  for (const [index, card] of cards.entries()) {
    for (const other of cards.slice(index + 1)) {
      expect(overlap(card, other), `${label}: two cards overlap`).toBe(false);
    }
  }
}

describe('the card sets of Elements', () => {
  it('ships five sets of three or four cards, valid and in their own words, in both languages', () => {
    expect(CARD_SETS).toHaveLength(5);
    for (const [lang, reading] of Object.entries(READINGS)) {
      for (const id of CARD_SETS) {
        const set = onSlide(id, reading);
        const label = `${lang}/${id}`;
        expect(Slide.safeParse(createSlide({ elements: [set] })).success, label).toBe(true);
        expect(cardSetOf(set), label).toBe(id);
        expect(cardsOf(set).length, label).toBe(id === 'pop' ? 4 : 3);
        expect(set.frame.w, label).toBe(1728);
        expectLaidOut(set, label);
        // The cards of a set are of different kinds: no two say the same thing.
        const said = cardsOf(set).map((card) => texts(card).join('|'));
        expect(new Set(said).size, label).toBe(said.length);
        const copy = said.join(' ');
        expect(copy).not.toMatch(/lorem ipsum|placeholder|add your text|טקסט לדוגמה/i);
        expect(/[א-ת]/.test(copy), `${label}: the words are in the deck's language`).toBe(
          reading.he,
        );
      }
    }
  });

  it('sets every line in a bundled typeface, at a size the design check accepts', () => {
    const families = builtinFamilies.map(({ family }) => family);
    for (const reading of Object.values(READINGS)) {
      for (const id of CARD_SETS) {
        for (let kind = 0; kind < cardKinds(id); kind++) {
          for (const element of walkElements([sampleCard(id, kind, reading)])) {
            if (element.type !== 'text' && element.type !== 'shape') continue;
            for (const paragraph of element.content?.paragraphs ?? []) {
              for (const run of paragraph.runs) {
                expect(families, `${id}: "${run.text}"`).toContain(run.marks?.font);
                expect(run.marks?.size, `${id}: "${run.text}"`).toBeGreaterThanOrEqual(24);
              }
            }
          }
        }
      }
    }
  });

  it('starts its cards on the side the deck reads from', () => {
    for (const id of CARD_SETS) {
      const [firstHe] = cardsOf(newCardSet(id, HE));
      const [firstEn] = cardsOf(newCardSet(id, EN));
      expect(firstEn!.frame.x, id).toBe(0);
      expect(firstHe!.frame.x + firstHe!.frame.w, id).toBeCloseTo(1728, 1);
    }
  });

  it('fills rows as evenly as the design allows', () => {
    expect(rowsOf(3, 4)).toEqual([3]);
    expect(rowsOf(4, 4)).toEqual([4]);
    expect(rowsOf(5, 4)).toEqual([3, 2]);
    expect(rowsOf(7, 4)).toEqual([4, 3]);
    expect(rowsOf(4, 3)).toEqual([2, 2]);
    expect(rowsOf(5, 2)).toEqual([2, 2, 1]);
  });

  it('adds a card of any kind until the set is full, laid out again in the same width', () => {
    for (const [lang, reading] of Object.entries(READINGS)) {
      for (const id of CARD_SETS) {
        let set = onSlide(id, reading);
        const ids = new Set<string>();
        while (cardsOf(set).length < mostCards(id)) {
          const before = cardsOf(set);
          const kind = before.length % cardKinds(id);
          const next = withCard(set, kind, reading, ROOM)!;
          const label = `${lang}/${id} with ${before.length + 1} cards`;
          expect(next, label).toBeDefined();
          expect(next.id, label).toBe(set.id);
          expect(next.frame.x, label).toBe(set.frame.x);
          expect(next.frame.w, label).toBe(set.frame.w);
          // The cards that were there are there, in their order, and the new one is the last.
          expect(
            cardsOf(next)
              .slice(0, -1)
              .map((card) => card.id),
            label,
          ).toEqual(before.map((card) => card.id));
          expect(texts(cardsOf(next).at(-1)!), label).toEqual(texts(sampleCard(id, kind, reading)));
          expect(Slide.safeParse(createSlide({ elements: [next] })).success, label).toBe(true);
          expectLaidOut(next, label);
          // The whole set stays between the margins of the slide.
          expect(next.frame.y, label).toBeGreaterThanOrEqual(80);
          expect(next.frame.y + next.frame.h, label).toBeLessThanOrEqual(1000);
          set = next;
        }
        for (const element of walkElements([set])) {
          expect(ids.has(element.id), `${lang}/${id}: every element has its own id`).toBe(false);
          ids.add(element.id);
        }
        expect(withCard(set, 0, reading, ROOM), `${lang}/${id}: a full set`).toBeUndefined();
      }
    }
  });

  it('makes the cards of a row narrower for one more, each still drawn as its design draws it', () => {
    const three = onSlide('steps', HE);
    const four = withCard(three, 3, HE, ROOM)!;
    expect(cardsOf(four).map((card) => card.frame.y)).toEqual([0, 0, 0, 0]);
    expect(cardsOf(four)[0]!.frame.w).toBeCloseTo((1728 - 3 * 32) / 4, 2);
    // A card that was made narrower has the frames of a card drawn at that width.
    const narrowed = cardsOf(four)[0]!;
    const drawn = cardsOf(grown('steps', HE, 4))[0]!;
    expect(narrowed.children.map((part) => part.frame)).toEqual(
      drawn.children.map((part) => part.frame),
    );
    // Its round mark stays round, which a stretch would not keep.
    const dot = narrowed.children.find(
      (part) => part.type === 'shape' && part.geometry.kind === 'preset' && part.frame.w < 20,
    )!;
    expect(dot.frame.w).toBe(dot.frame.h);
  });

  it('keeps what was typed and painted in a card when the set is laid out again', () => {
    const set = onSlide('stats', EN);
    const [first, ...others] = cardsOf(set);
    const box = first!.children[0]!;
    const label = first!.children.find((part) => part.type === 'text') as TextElement;
    const mine: GroupElement = {
      ...first!,
      children: first!.children.map((part) =>
        part.id === box.id
          ? { ...part, fill: { kind: 'solid', color: { value: '#123456' } } }
          : part.id === label.id
            ? {
                ...label,
                content: {
                  paragraphs: [{ ...label.content.paragraphs[0]!, runs: [{ text: '61%' }] }],
                },
              }
            : part,
      ),
    };
    const next = withCard({ ...set, children: [mine, ...others] }, 3, EN, ROOM)!;
    const kept = cardsOf(next)[0]!;
    expect(kept.frame.w).toBeLessThan(first!.frame.w);
    expect(kept.children[0]).toMatchObject({
      fill: { kind: 'solid', color: { value: '#123456' } },
    });
    expect(texts(kept)).toContain('61%');
  });

  it('stretches a card whose parts were changed by hand, in place of drawing it again', () => {
    const set = onSlide('voices', HE);
    const [first, ...others] = cardsOf(set);
    // The card lost its quotation mark: it is no longer the card the design drew.
    const changed = { ...first!, children: first!.children.filter((part) => part.type !== 'svg') };
    const next = withCard({ ...set, children: [changed, ...others] }, 3, HE, ROOM)!;
    expect(cardsOf(next)[0]!.children).toHaveLength(changed.children.length);
    expectLaidOut(next, 'a changed card');
  });

  it('takes a card out and closes the others up; the last card is not taken', () => {
    const set = grown('pop', HE, 5);
    const [first, second] = cardsOf(set);
    const next = withoutCard(set, first!.id, HE, ROOM)!;
    expect(cardsOf(next).map((card) => card.id)).toEqual(
      cardsOf(set)
        .slice(1)
        .map((card) => card.id),
    );
    expect(next.frame.h).toBeLessThan(set.frame.h);
    // The second card is now the first: where the first one was.
    expect(cardsOf(next)[0]!.id).toBe(second!.id);
    expect(cardsOf(next)[0]!.frame).toEqual(first!.frame);
    expectLaidOut(next, 'without a card');

    expect(withoutCard(set, 'no-such-card', HE, ROOM)).toBeUndefined();
    let one = set;
    while (cardsOf(one).length > 1) one = withoutCard(one, cardsOf(one)[0]!.id, HE, ROOM)!;
    expect(withoutCard(one, cardsOf(one)[0]!.id, HE, ROOM)).toBeUndefined();
  });

  it('moves up for a new row when the set would pass the bottom margin, and no further', () => {
    const low = onSlide('pop', EN, 480);
    const next = withCard(low, 4, EN, ROOM)!;
    expect(next.frame.h).toBeGreaterThan(low.frame.h);
    expect(next.frame.y + next.frame.h).toBe(1000);
    // A set that fits where it is stays where it is.
    const high = onSlide('pop', EN, 120);
    expect(withCard(high, 4, EN, ROOM)!.frame.y).toBe(120);
  });

  it('does not move up over what lies above it on the slide, a title for one', () => {
    const set = onSlide('steps', EN, 250);
    const title = sampleCard('steps', 0, EN).children.find((part) => part.type === 'text')!;
    const slide = createSlide({
      elements: [{ ...title, id: 'e_title', frame: { x: 96, y: 80, w: 1728, h: 110 } }, set],
    });
    const room = roomOn(slide, set, SLIDE)!;
    expect(room).toEqual({ top: 214, bottom: 1000 });
    // Five steps are two rows, taller than the room under the title: the set goes up to the
    // title and no further, and what does not fit shows below the margin.
    const five = withCard(withCard(set, 3, EN, room)!, 4, EN, room)!;
    expect(cardsOf(five).map((card) => card.frame.y)).toEqual([0, 0, 0, 448, 448]);
    expect(five.frame.y).toBe(214);
    // Inside another group a set has no room of its own on the slide, and stays where it is.
    const nested = createSlide({
      elements: [{ ...set, id: 'e_outer', name: undefined, children: [set] }],
    });
    expect(roomOn(nested, set, SLIDE)).toBeUndefined();
    expect(withCard(withCard(set, 3, EN)!, 4, EN)!.frame.y).toBe(250);
  });

  it('keeps the height the user gave the cards, and what else they put in the group', () => {
    const set = onSlide('steps', EN);
    const note = sampleCard('steps', 0, EN).children.find((part) => part.type === 'text')!;
    const taller: GroupElement = {
      ...set,
      frame: { ...set.frame, h: 480 },
      children: [
        { ...note, id: 'e_note' },
        ...cardsOf(set).map((card) => ({ ...card, frame: { ...card.frame, h: 480 } })),
      ],
    };
    const next = withCard(taller, 3, EN, ROOM)!;
    expect(cardsOf(next).map((card) => card.frame.h)).toEqual([480, 480, 480, 480]);
    expect(next.children.some((child) => child.id === 'e_note')).toBe(true);
  });

  it('is told from any other group by its name, and only for a design that exists', () => {
    const set = newCardSet('plans', EN);
    expect(cardSetOf(set)).toBe('plans');
    expect(cardSetOf({ ...set, name: 'cards:unknown' })).toBeUndefined();
    expect(cardSetOf({ ...set, name: undefined })).toBeUndefined();
    expect(cardSetOf(cardsOf(set)[0])).toBeUndefined();
    expect(withCard(cardsOf(set)[0]!, 0, EN, ROOM)).toBeUndefined();
    expect(withCard(set, 99, EN, ROOM)).toBeUndefined();
  });

  it('draws a set alone on a slide with room for its shadow, for its picture in the panel', () => {
    const set = newCardSet('pop', HE);
    const meta = { lang: 'he', dir: 'rtl' as const };
    const { deck, slide, size } = cardPicture(set, meta, createDeck().theme, 40);
    expect(readingOf(deck.meta)).toEqual(HE);
    expect(size).toEqual({ w: set.frame.w + 80, h: set.frame.h + 80 });
    expect(slide.elements[0]!.frame).toEqual({ x: 40, y: 40, w: set.frame.w, h: set.frame.h });
    expect(slide.background?.fill.kind).toBe('none');
  });

  it('goes onto the slide and takes a card as one undo step each', () => {
    const slide = createSlide();
    const bus = new CommandBus(createDeck({ slides: [slide] }), { validate: true });
    const selection = createSelectionStore(bus);
    const reading = readingOf(bus.deck.meta);
    const set = onSlide('plans', reading);
    bus.dispatch({ type: 'element.add', slideId: slide.id, element: set });
    selection.getState().selectElements([set.id]);
    const next = withCard(set, 3, reading, roomOn(bus.deck.slides[0]!, set, bus.deck.size))!;
    bus.dispatch({
      type: 'element.replace',
      slideId: slide.id,
      elementId: set.id,
      elements: [next],
    });
    const now = bus.deck.slides[0]!.elements[0] as GroupElement;
    expect(cardsOf(now)).toHaveLength(4);
    expect(selection.getState().selectedElementIds).toEqual([set.id]);
    bus.undo();
    expect(cardsOf(bus.deck.slides[0]!.elements[0] as GroupElement)).toHaveLength(3);
    bus.undo();
    expect(bus.deck.slides[0]!.elements).toHaveLength(0);
  });
});
