import {
  CommandBus,
  createElement,
  createSlide,
  richText,
  slideFromLayout,
  type Deck,
} from '@slidr/model';
import { describe, expect, it } from 'vitest';
import { tzukTemplate } from './builtin/tzuk';
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
    expect(names.map((e) => e.frame)).toEqual(
      seats(bus.deck, 'l_tzuk_timeline', 'subtitle')
        .slice(0, 3)
        .map((p) => p.frame),
    );
    // Nothing was deleted or added: the fourth step of the timeline stays empty.
    expect(slide.elements).toHaveLength(start.slides[0]!.elements.length);
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
