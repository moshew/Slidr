import {
  CommandBus,
  createElement,
  duplicateSlide,
  richText,
  slideFromLayout,
  walkElements,
  type Deck,
  type Element,
  type Frame,
} from '@slidr/model';
import { describe, expect, it } from 'vitest';
import { mifgashTemplate, tzukTemplate } from './builtin';
import { changeLayout } from './changeLayout';
import { createSlide } from './createSlide';
import { applyTemplate, changeDirection, deckFromTemplate } from './deck';
import { mirrorLayout } from './mirror';
import { sameDrawing } from './objects';
import type { Template } from './template';

/* The objects of a layout (`Layout.objects`): what a slide of the layout starts with as its own. */

const box = (x: number, y: number, w: number, h: number): Frame => ({ x, y, w, h });

/** A card with the corner of the business template, which a switch of theme would follow. */
const card = (id: string, x: number): Element =>
  createElement.shape({
    id,
    frame: box(x, 300, 400, 500),
    fill: { kind: 'solid', color: { token: 'surface' } },
    effects: { radius: 4 },
  });

/** Lanes of a drawing, as a group. */
const lanes = (id: string): Element =>
  createElement.group({
    id,
    frame: box(0, 0, 300, 1080),
    children: [
      createElement.shape({
        id: `${id}_1`,
        frame: box(10, 100, 200, 14),
        fill: { kind: 'solid', color: { token: 'primary' } },
      }),
      createElement.shape({
        id: `${id}_2`,
        frame: box(60, 160, 120, 14),
        fill: { kind: 'solid', color: { token: 'accent' } },
      }),
    ],
  });

function withObjects(template: Template, objects: Record<string, Element[]>): Template {
  return {
    ...template,
    layouts: template.layouts.map((layout) =>
      objects[layout.id] ? { ...layout, objects: objects[layout.id] } : layout,
    ),
  };
}

const tzuk = () =>
  withObjects(tzukTemplate(), {
    l_tzuk_cards: [lanes('o_lanes'), card('o_card1', 200), card('o_card2', 700)],
    l_tzuk_timeline: [card('o_axis', 96)],
  });
const mifgash = () => withObjects(mifgashTemplate(), { l_mifgash_cards: [card('o_m_card', 900)] });

/** A deck on a template with one slide of the given layout, its texts filled in. */
function deckWith(template: Template, layoutId: string): Deck {
  const deck = deckFromTemplate(template, { lang: 'he' });
  const { slide } = slideFromLayout(deck, layoutId);
  for (const element of walkElements(slide.elements)) {
    if (element.type === 'text') element.content = richText(`${element.role}`);
    // The objects are named after the slide, which is renamed here.
    if (element.id.startsWith(`${slide.id}_`))
      element.id = `s_one${element.id.slice(slide.id.length)}`;
  }
  return { ...deck, slides: [{ ...slide, id: 's_one' }] };
}
const objectsOf = (deck: Deck, layoutId: string) =>
  deck.layouts.find((layout) => layout.id === layoutId)!.objects!;
const ids = (elements: readonly Element[]) => [...walkElements(elements)].map((e) => e.id);
const drawsAs = (elements: readonly Element[], objects: readonly Element[]) =>
  elements.length === objects.length && elements.every((e, i) => sameDrawing(e, objects[i]!));

describe('the objects of a layout', () => {
  it('are on a new slide as its own elements, under its placeholders and under new ids', () => {
    const deck = deckFromTemplate(tzuk(), { lang: 'he' });
    const { slide } = slideFromLayout(deck, 'l_tzuk_cards');
    const objects = objectsOf(deck, 'l_tzuk_cards');
    expect(drawsAs(slide.elements.slice(0, 3), objects)).toBe(true);
    expect(slide.elements.slice(0, 3).every((e) => e.role === undefined)).toBe(true);
    expect(slide.elements.slice(3).every((e) => e.role !== undefined)).toBe(true);
    // Every one of them, and what is inside the group, has an id of its own.
    const given = ids(slide.elements.slice(0, 3));
    expect(new Set([...given, ...ids(objects)]).size).toBe(given.length * 2);
  });

  it('leave the placeholders to the content of a slide made by role', () => {
    const deck = deckFromTemplate(tzuk(), { lang: 'he' });
    const { slide, unplaced } = createSlide(deck, {
      layoutId: 'l_tzuk_cards',
      content: { title: richText('שלושה עקרונות'), subtitle: [richText('א'), richText('ב')] },
    });
    expect(unplaced).toEqual([]);
    const title = slide.elements.find((e) => e.role === 'title');
    expect(title?.type === 'text' && title.content.paragraphs[0]!.runs[0]!.text).toBe(
      'שלושה עקרונות',
    );
    expect(drawsAs(slide.elements.slice(0, 3), objectsOf(deck, 'l_tzuk_cards'))).toBe(true);
  });

  it('go with their layout when the slide changes layout, and the new ones come in under all', () => {
    const start = deckWith(tzuk(), 'l_tzuk_cards');
    const bus = new CommandBus(start, { validate: true });
    bus.batch(changeLayout(bus.deck, 's_one', 'l_tzuk_timeline'));
    const slide = bus.deck.slides[0]!;
    expect(drawsAs(slide.elements.slice(0, 1), objectsOf(bus.deck, 'l_tzuk_timeline'))).toBe(true);
    expect(slide.elements.slice(1).every((e) => e.role !== undefined)).toBe(true);
    bus.undo();
    expect(bus.deck).toEqual(start);
  });

  it('go with their layout though the user moved, resized or animated them', () => {
    const start = deckWith(tzuk(), 'l_tzuk_cards');
    const [stream, first, second] = start.slides[0]!.elements;
    const bus = new CommandBus(start, { validate: true });
    bus.batch([
      {
        type: 'element.update',
        slideId: 's_one',
        elementId: first!.id,
        patch: { frame: box(180, 300, 460, 520), opacity: 0.5 },
      },
      {
        type: 'slide.setTimeline',
        slideId: 's_one',
        timeline: [
          {
            id: 'a_in',
            elementId: stream!.id,
            trigger: 'onClick',
            category: 'entrance',
            preset: 'fade',
            duration: 400,
            delay: 0,
            easing: 'ease-out',
          },
        ],
      },
      // A duplicate the user made, and words the user wrote in a card, are the user's.
      {
        type: 'element.add',
        slideId: 's_one',
        element: { ...card('e_mine', 900), frame: box(900, 320, 400, 500) },
      },
      {
        type: 'element.update',
        slideId: 's_one',
        elementId: second!.id,
        patch: { content: richText('שלנו') },
      },
    ]);
    bus.batch(changeLayout(bus.deck, 's_one', 'l_tzuk_timeline'));
    const slide = bus.deck.slides[0]!;
    const after = slide.elements.map((e) => e.id);
    expect(after).not.toContain(stream!.id);
    expect(after).not.toContain(first!.id);
    expect(after).toContain(second!.id);
    expect(after).toContain('e_mine');
    expect(slide.timeline).toEqual([]);
    expect(after[0]).toBe('s_one_o_axis');
  });

  it('follow the switch to another template, and a switch to the same one changes nothing', () => {
    const start = deckWith(tzuk(), 'l_tzuk_cards');
    const moved = start.slides[0]!.elements[1]!;
    const bus = new CommandBus(start, { validate: true });
    bus.batch([
      {
        type: 'element.update',
        slideId: 's_one',
        elementId: moved.id,
        patch: { frame: box(250, 320, 400, 500) },
      },
    ]);
    // The corner of the business template is the theme's: a switch hands it over, and it
    // would be handed to the cards that went with their layout too, if that were still asked.
    bus.batch(applyTemplate(bus.deck, mifgash()));
    const slide = bus.deck.slides[0]!;
    expect(slide.layoutId).toBe('l_mifgash_cards');
    const objects = slide.elements.filter((e) => e.role === undefined);
    expect(drawsAs(objects, objectsOf(bus.deck, 'l_mifgash_cards'))).toBe(true);
    expect(applyTemplate(bus.deck, mifgash()).filter((c) => c.type.startsWith('element.'))).toEqual(
      [],
    );
  });

  it("stay their layout's on a copy of the slide", () => {
    const start = deckWith(tzuk(), 'l_tzuk_cards');
    const bus = new CommandBus(start, { validate: true });
    bus.batch([duplicateSlide(bus.deck, 's_one')]);
    const copy = bus.deck.slides[1]!;
    expect(copy.elements[1]!.id).toBe(`${copy.id}_o_card1`);
    bus.batch(applyTemplate(bus.deck, mifgash()));
    const objects = bus.deck.slides[1]!.elements.filter((e) => e.role === undefined);
    expect(objects.map((e) => e.id)).toEqual([`${copy.id}_o_m_card`]);
  });

  it('come back under their own ids: a deck switched away and back is the deck it was', () => {
    const start = deckWith(tzuk(), 'l_tzuk_cards');
    expect(start.slides[0]!.elements[1]!.id).toBe('s_one_o_card1');
    const bus = new CommandBus(start, { validate: true });
    bus.batch(applyTemplate(bus.deck, mifgash()));
    expect(bus.deck.slides[0]!.elements[0]!.id).toBe('s_one_o_m_card');
    bus.batch(applyTemplate(bus.deck, tzuk()));
    expect(bus.deck).toEqual(start);
  });

  it('turn with the deck, and turning it back gives the deck back', () => {
    const start = deckWith(tzuk(), 'l_tzuk_cards');
    const bus = new CommandBus(start, { validate: true });
    bus.batch(changeDirection(bus.deck, 'ltr', tzuk()));
    const slide = bus.deck.slides[0]!;
    expect(drawsAs(slide.elements.slice(0, 3), objectsOf(bus.deck, 'l_tzuk_cards'))).toBe(true);
    expect(slide.elements[1]!.frame.x).toBe(1920 - 200 - 400);
    bus.batch(changeDirection(bus.deck, 'rtl', tzuk()));
    expect(bus.deck).toEqual(start);
  });

  it('drawn by hand for the other direction are what a turned slide takes', () => {
    const template = tzuk();
    const cards = template.layouts.find((layout) => layout.id === 'l_tzuk_cards')!;
    template.flipped = [
      ...(template.flipped ?? []),
      { ...mirrorLayout(cards), objects: [lanes('o_lanes'), card('o_card1', 1100)] },
    ];
    const start = deckWith(template, 'l_tzuk_cards');
    const bus = new CommandBus(start, { validate: true });
    bus.batch(changeDirection(bus.deck, 'ltr', template));
    const slide = bus.deck.slides[0]!;
    // The first card is the one drawn for this direction; the lanes are their mirror, and the
    // second card has none drawn for it, so it is the slide's own now and turns where it stands.
    expect(slide.elements[1]!.frame.x).toBe(1100);
    expect(slide.elements[2]!.frame.x).toBe(1920 - 700 - 400);
    expect(slide.elements.length).toBe(start.slides[0]!.elements.length);
  });
});
