import {
  CommandBus,
  createElement,
  createSlide,
  richText,
  slideFromLayout,
  type Deck,
  type Element,
} from '@slidr/model';
import { describe, expect, it } from 'vitest';
import { tzukTemplate } from './builtin/tzuk';
import { zeremTemplate } from './builtin/zerem';
import { changeLayout } from './changeLayout';
import { deckFromTemplate } from './deck';

/** A deck on the business template with one slide of the given layout, its texts filled in. */
function deckWith(layoutId: string): Deck {
  const deck = deckFromTemplate(tzukTemplate(), { lang: 'he' });
  const { slide } = slideFromLayout(deck, layoutId);
  for (const element of slide.elements) {
    if (element.type === 'text') element.content = richText(`${element.role}`);
  }
  return { ...deck, slides: [{ ...slide, id: 's_one' }] };
}
const layout = (deck: Deck, id: string) => deck.layouts.find((l) => l.id === id)!;
const seats = (deck: Deck, id: string, role: string) =>
  layout(deck, id).placeholders.filter((p) => p.role === role);

describe('moving a slide to another layout (SLD-02)', () => {
  it('takes the content along by role, as one step that undo takes back', () => {
    const start = deckWith('l_tzuk_cards');
    const bus = new CommandBus(start, { validate: true });
    bus.batch(changeLayout(bus.deck, 's_one', 'l_tzuk_timeline'));
    expect(bus.undoStack).toHaveLength(1);
    const slide = bus.deck.slides[0]!;
    expect(slide.layoutId).toBe('l_tzuk_timeline');
    // The title and the three card names sit on the seats of the timeline.
    const title = slide.elements.find((e) => e.role === 'title')!;
    expect(title.frame).toEqual(seats(bus.deck, 'l_tzuk_timeline', 'title')[0]!.frame);
    const names = slide.elements.filter((e) => e.role === 'subtitle');
    expect(names.slice(0, 3).map((e) => e.frame)).toEqual(
      seats(bus.deck, 'l_tzuk_timeline', 'subtitle')
        .slice(0, 3)
        .map((p) => p.frame),
    );
    // Nothing was deleted: every text held words. The seats of the timeline that the cards
    // have nothing for (four dates and the name of a fourth step) got empty elements, on top.
    const added = slide.elements.slice(start.slides[0]!.elements.length);
    expect(added.map((e) => e.role)).toEqual(['number', 'number', 'number', 'number', 'subtitle']);
    expect(added.map((e) => e.frame)).toEqual([
      ...seats(bus.deck, 'l_tzuk_timeline', 'number').map((p) => p.frame),
      seats(bus.deck, 'l_tzuk_timeline', 'subtitle')[3]!.frame,
    ]);
    expect(slide.elements.slice(0, -5).map((e) => e.id)).toEqual(
      start.slides[0]!.elements.map((e) => e.id),
    );
    bus.undo();
    expect(bus.deck).toEqual(start);
  });

  it('leaves alone what the user moved by hand', () => {
    const start = deckWith('l_tzuk_cards');
    const title = start.slides[0]!.elements.find((e) => e.role === 'title')!;
    title.frame = { x: 300, y: 300, w: 800, h: 120 };
    const bus = new CommandBus(start, { validate: true });
    bus.batch(changeLayout(bus.deck, 's_one', 'l_tzuk_timeline'));
    expect(bus.deck.slides[0]!.elements.find((e) => e.role === 'title')!.frame).toEqual({
      x: 300,
      y: 300,
      w: 800,
      h: 120,
    });
  });

  describe('a slide nobody has written on', () => {
    /** What a slide is, apart from the ids its elements were given. */
    const drawn = (elements: readonly Element[]) => elements.map(({ id: _id, ...rest }) => rest);

    it.each([
      ['hero', 'cards'],
      ['cards', 'quote'],
      ['cards', 'timeline'],
      ['section', 'timeline'],
      ['team', 'chart'],
      ['table', 'hero'],
    ])('%s to %s: becomes what "new slide" makes of the layout', (from, to) => {
      const template = deckFromTemplate(zeremTemplate(), { lang: 'he' });
      const made = slideFromLayout(template, `l_zerem_${from}`).slide;
      const start: Deck = { ...template, slides: [{ ...made, id: 's_one' }] };
      const bus = new CommandBus(start, { validate: true });
      bus.batch(changeLayout(bus.deck, 's_one', `l_zerem_${to}`));
      expect(bus.undoStack).toHaveLength(1);
      const slide = bus.deck.slides[0]!;
      const fresh = slideFromLayout(bus.deck, `l_zerem_${to}`).slide;
      // Nothing of the old layout stays behind, every seat of the new one has its element, and
      // they stand in the order of the layout's placeholders.
      expect(slide.layoutId).toBe(fresh.layoutId);
      expect(drawn(slide.elements)).toEqual(drawn(fresh.elements));
      bus.undo();
      expect(bus.deck).toEqual(start);
    });
  });

  it('on a slide with content, drops the empty placeholders that have no seat and fills the free seats', () => {
    const template = deckFromTemplate(zeremTemplate(), { lang: 'he' });
    const made = slideFromLayout(template, 'l_zerem_cards').slide;
    const write = (role: string, nth: number, words: string) => {
      const element = made.elements.filter((e) => e.role === role)[nth]!;
      if (element.type === 'text') element.content = richText(words);
      return element.id;
    };
    const title = write('title', 0, 'שלושה עקרונות');
    const secondCard = write('subtitle', 1, 'פשוט');
    const kicker = made.elements.find((e) => e.role === 'caption')!.id;
    // An empty placeholder the user made taller by its top edge: no longer as the layout made it.
    const resized = made.elements.filter((e) => e.role === 'body')[2]!;
    resized.frame = { ...resized.frame, y: resized.frame.y - 20, h: resized.frame.h + 20 };
    const start: Deck = { ...template, slides: [{ ...made, id: 's_one' }] };
    const bus = new CommandBus(start, { validate: true });

    bus.batch(changeLayout(bus.deck, 's_one', 'l_zerem_quote'));
    expect(bus.undoStack).toHaveLength(1);
    const slide = bus.deck.slides[0]!;
    const quote = layout(bus.deck, 'l_zerem_quote');
    // The quote layout seats a quote, an attribution, a caption and a footer.
    const at = (role: string) => slide.elements.filter((e) => e.role === role);
    expect(at('quote').map((e) => e.frame)).toEqual(
      seats(bus.deck, quote.id, 'quote').map((p) => p.frame),
    );
    expect(at('attribution')).toHaveLength(1);
    expect(at('footer').map((e) => e.frame)).toEqual(
      seats(bus.deck, quote.id, 'footer').map((p) => p.frame),
    );
    // The first caption of the cards (the line over the title) went to the caption's seat, and
    // the three notes of the cards, which the quote has no seat for and nobody wrote, are gone.
    expect(at('caption').map((e) => e.id)).toEqual([kicker]);
    expect(at('caption')[0]!.frame).toEqual(seats(bus.deck, quote.id, 'caption')[0]!.frame);
    // What holds words stays, where it was; so does the box the user resized.
    const kept = slide.elements.filter((e) => !quote.placeholders.some((p) => p.role === e.role));
    expect(kept.map((e) => e.id)).toEqual([title, secondCard, resized.id]);
    for (const element of kept) {
      expect(element.frame).toEqual(made.elements.find((e) => e.id === element.id)!.frame);
    }
    // The new elements are on top, in the order of the layout's placeholders.
    expect(slide.elements.slice(-2).map((e) => e.role)).toEqual(['quote', 'attribution']);
    expect(slide.elements).toHaveLength(7);
    bus.undo();
    expect(bus.deck).toEqual(start);
    bus.redo();
    expect(bus.deck.slides[0]).toEqual(slide);
  });

  it('gives an empty slide the elements "new slide" would have made', () => {
    const deck = { ...deckWith('l_tzuk_cards'), slides: [createSlide({ id: 's_one' })] };
    const bus = new CommandBus(deck, { validate: true });
    bus.batch(changeLayout(bus.deck, 's_one', 'l_tzuk_quote'));
    const slide = bus.deck.slides[0]!;
    expect(slide.layoutId).toBe('l_tzuk_quote');
    expect(slide.elements.map((e) => e.role)).toEqual([
      'quote',
      'attribution',
      'caption',
      'footer',
    ]);
    expect(bus.undoStack).toHaveLength(1);
  });

  it('seats the elements of a slide drawn without a layout by the roles they name', () => {
    const slide = createSlide({
      id: 's_one',
      elements: [
        createElement.text({
          id: 'e_title',
          role: 'title',
          frame: { x: 100, y: 100, w: 900, h: 100 },
          content: richText('Title'),
        }),
        createElement.shape({ id: 'e_free', frame: { x: 200, y: 400, w: 300, h: 200 } }),
      ],
    });
    const deck = { ...deckWith('l_tzuk_cards'), slides: [slide] };
    const bus = new CommandBus(deck, { validate: true });
    bus.batch(changeLayout(bus.deck, 's_one', 'l_tzuk_cards'));
    const after = bus.deck.slides[0]!;
    expect(after.layoutId).toBe('l_tzuk_cards');
    expect(after.elements[0]!.frame).toEqual(seats(bus.deck, 'l_tzuk_cards', 'title')[0]!.frame);
    // What names no role stays where it was.
    expect(after.elements[1]!.frame).toEqual({ x: 200, y: 400, w: 300, h: 200 });
  });

  it('is nothing for the layout the slide is on, or for one the deck does not have', () => {
    const deck = deckWith('l_tzuk_cards');
    expect(changeLayout(deck, 's_one', 'l_tzuk_cards')).toEqual([]);
    expect(changeLayout(deck, 's_one', 'l_nowhere')).toEqual([]);
    expect(changeLayout(deck, 's_gone', 'l_tzuk_quote')).toEqual([]);
  });
});
