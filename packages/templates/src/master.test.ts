import { CommandBus, plainText, type Deck, type Element, type Layout } from '@slidr/model';
import { describe, expect, it } from 'vitest';
import { tzukTemplate } from './builtin/tzuk';
import { zeremTemplate } from './builtin/zerem';
import { applyTemplate, changeDirection, deckFromTemplate } from './deck';
import {
  deckFooter,
  footerLayouts,
  isMaster,
  masterState,
  restoreMaster,
  setDeckFooter,
  showSlideNumber,
  slideNumberHidden,
  slideNumberLayouts,
} from './master';
import { mirrorLayout } from './mirror';
import { layoutsFor } from './template';

const start = (): Deck => deckFromTemplate(tzukTemplate(), { lang: 'he' });
const footers = (deck: Deck) =>
  deck.layouts.flatMap((layout) => layout.decorations.filter((d) => d.role === 'footer'));
const numbers = (deck: Deck) =>
  deck.layouts.flatMap((layout) => layout.decorations.filter((d) => d.role === 'slideNumber'));
const seat = (layout: Layout) => layout.placeholders.find((p) => p.role === 'footer');

describe('the master components of a deck (SLD-04)', () => {
  it('a built-in template draws the slide number on its content layouts, and no footer yet', () => {
    const deck = start();
    // Every layout that seats a footer: the layouts with a foot.
    expect(slideNumberLayouts(deck).map((l) => l.archetype)).toEqual([
      'bigNumber',
      'quote',
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

  it.each([
    ['tzuk', tzukTemplate],
    ['zerem', zeremTemplate],
  ])(
    '%s: a deck that set them still turns onto the layouts its template drew by hand',
    (_id, template) => {
      const bus = new CommandBus(deckFromTemplate(template(), { lang: 'he' }), { validate: true });
      bus.batch(setDeckFooter(bus.deck, 'ACME 2026'));
      bus.batch(showSlideNumber(bus.deck, false));
      const set = bus.deck;

      bus.batch(changeDirection(bus.deck, 'ltr', template()));
      // What the template draws is its own drawing for the direction, by hand where it has one
      // (the quotation mark of tzuk, the glow in the corners of zerem), not the plain mirror.
      const theirs = layoutsFor(template(), 'ltr');
      expect(template().flipped!.length).toBeGreaterThan(0);
      bus.deck.layouts.forEach((layout, i) => {
        expect(layout.background, layout.id).toEqual(theirs[i]!.background);
        expect(layout.placeholders, layout.id).toEqual(theirs[i]!.placeholders);
        expect(
          layout.decorations.filter((d) => !isMaster(d)),
          layout.id,
        ).toEqual(theirs[i]!.decorations.filter((d) => !isMaster(d)));
      });
      // And what the deck set is still set, each footer on the seat its turned layout has.
      expect(masterState(bus.deck)).toEqual({ footer: 'ACME 2026', numberHidden: true });
      for (const layout of footerLayouts(bus.deck)) {
        const footer = layout.decorations.find((d) => d.role === 'footer')!;
        expect(footer.frame, layout.id).toEqual(seat(layout)!.frame);
      }
      // The mark of the template, which the deck left alone, is the template's own there.
      for (const [i, layout] of bus.deck.layouts.entries()) {
        const mark = (decorations: readonly Element[]) =>
          decorations.filter((d) => d.role === 'logo');
        expect(mark(layout.decorations), layout.id).toEqual(mark(theirs[i]!.decorations));
      }

      bus.batch(changeDirection(bus.deck, 'rtl', template()));
      expect(bus.deck).toEqual(set);
    },
  );

  it('a deck whose layouts are named in another language is still on the drawing of its template', () => {
    // The app names the layouts of a built-in template in the deck's language when the deck
    // takes it; the template it later compares with may be named in another.
    const template = tzukTemplate();
    const deck = deckFromTemplate(template, { lang: 'he' });
    for (const layout of deck.layouts) layout.name = `פריסה ${layout.archetype}`;
    const bus = new CommandBus(deck, { validate: true });
    bus.batch(changeDirection(bus.deck, 'ltr', template));
    const quote = bus.deck.layouts.find((l) => l.archetype === 'quote')!;
    const theirs = layoutsFor(template, 'ltr').find((l) => l.id === quote.id)!;
    expect(quote.decorations).toEqual(theirs.decorations);
    expect(quote.decorations).not.toEqual(
      mirrorLayout(deck.layouts.find((l) => l.id === quote.id)!).decorations,
    );
    // The name is the deck's.
    expect(quote.name).toBe('פריסה quote');
  });
});
