import { CommandBus, plainText, type Deck, type Layout } from '@slidr/model';
import { describe, expect, it } from 'vitest';
import { tzukTemplate } from './builtin/tzuk';
import { zeremTemplate } from './builtin/zerem';
import { applyTemplate, deckFromTemplate } from './deck';
import {
  deckFooter,
  footerLayouts,
  masterState,
  restoreMaster,
  setDeckFooter,
  showSlideNumber,
  slideNumberHidden,
  slideNumberLayouts,
} from './master';

const start = (): Deck => deckFromTemplate(tzukTemplate(), { lang: 'he' });
const footers = (deck: Deck) =>
  deck.layouts.flatMap((layout) => layout.decorations.filter((d) => d.role === 'footer'));
const numbers = (deck: Deck) =>
  deck.layouts.flatMap((layout) => layout.decorations.filter((d) => d.role === 'slideNumber'));
const seat = (layout: Layout) => layout.placeholders.find((p) => p.role === 'footer');

describe('the master components of a deck (SLD-04)', () => {
  it('a built-in template draws the slide number on its content layouts, and no footer yet', () => {
    const deck = start();
    expect(slideNumberLayouts(deck).map((l) => l.archetype)).toEqual([
      'bigNumber',
      'textImage',
      'cards',
      'timeline',
      'process',
      'comparison',
      'chart',
      'table',
      'team',
    ]);
    expect(slideNumberHidden(deck)).toBe(false);
    expect(deckFooter(deck)).toBe('');
    expect(masterState(deck)).toEqual({ footer: '', numberHidden: false });
  });

  it('hides the slide number on every layout and shows it again, each as one step', () => {
    const bus = new CommandBus(start(), { validate: true });
    const before = bus.deck;
    bus.batch(showSlideNumber(bus.deck, false));
    expect(slideNumberHidden(bus.deck)).toBe(true);
    expect(numbers(bus.deck).every((n) => n.hidden)).toBe(true);
    expect(bus.undoStack).toHaveLength(1);
    // Hiding what is hidden is no change at all.
    expect(showSlideNumber(bus.deck, false)).toEqual([]);
    bus.batch(showSlideNumber(bus.deck, true));
    expect(bus.deck.layouts).toEqual(before.layouts);
  });

  it('writes the footer of the deck where each layout seats a footer, in its style and side', () => {
    const bus = new CommandBus(start(), { validate: true });
    const seated = footerLayouts(bus.deck);
    expect(seated).toHaveLength(10);
    bus.batch(setDeckFooter(bus.deck, '  צוק רובוטיקה · 2026 '));
    expect(bus.undoStack).toHaveLength(1);
    expect(deckFooter(bus.deck)).toBe('צוק רובוטיקה · 2026');
    expect(footers(bus.deck)).toHaveLength(10);
    for (const layout of footerLayouts(bus.deck)) {
      const footer = layout.decorations.find((d) => d.role === 'footer')!;
      expect(footer.frame).toEqual(seat(layout)!.frame);
      expect(footer).toMatchObject({
        type: 'text',
        content: { paragraphs: [{ dir: 'rtl', align: 'end', styleRef: 'caption' }] },
      });
    }
    // Layouts with no place for a footer (the opening slide) are left as they were.
    expect(bus.deck.layouts[0]).toEqual(start().layouts[0]);
  });

  it('changes the words of a footer that is there, and takes it away for an empty text', () => {
    const bus = new CommandBus(start(), { validate: true });
    const before = bus.deck;
    bus.batch(setDeckFooter(bus.deck, 'First'));
    const first = footers(bus.deck);
    expect(setDeckFooter(bus.deck, 'First')).toEqual([]);
    bus.batch(setDeckFooter(bus.deck, 'Second'));
    expect(footers(bus.deck).map((f) => f.id)).toEqual(first.map((f) => f.id));
    expect(
      footers(bus.deck).every((f) => f.type === 'text' && plainText(f.content) === 'Second'),
    ).toBe(true);
    bus.batch(setDeckFooter(bus.deck, ''));
    expect(bus.deck.layouts).toEqual(before.layouts);
    expect(setDeckFooter(bus.deck, '  ')).toEqual([]);
  });

  it('gives the footer and a hidden number to the layouts of another template', () => {
    const bus = new CommandBus(start(), { validate: true });
    bus.batch([...setDeckFooter(bus.deck, 'Tzuk · 2026')]);
    bus.batch(showSlideNumber(bus.deck, false));
    const before = masterState(bus.deck);
    expect(before).toEqual({ footer: 'Tzuk · 2026', numberHidden: true });

    // A switch replaces the layouts: the new ones come as their template drew them.
    bus.batch(applyTemplate(bus.deck, zeremTemplate()));
    expect(masterState(bus.deck)).toEqual({ footer: '', numberHidden: false });
    const restore = restoreMaster(bus.deck, before);
    // One patch for each layout, though both components live in its decorations.
    const patched = restore.map((c) => (c.type === 'layout.update' ? c.layoutId : ''));
    expect(new Set(patched).size).toBe(patched.length);
    bus.batch(restore);
    expect(masterState(bus.deck)).toEqual(before);
    expect(restoreMaster(bus.deck, before)).toEqual([]);
  });
});
