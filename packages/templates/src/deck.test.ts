import {
  CommandBus,
  createElement,
  findElementInDeck,
  richText,
  type AssetMeta,
  type Command,
  type Deck,
  type Element,
  type TextElement,
} from '@slidr/model';
import { hebrewDeck } from '@slidr/model/fixtures';
import { describe, expect, it } from 'vitest';
import { applyTemplate, changeDirection, deckFromTemplate } from './deck';
import { nightTemplate, paperTemplate } from './fixtures';
import { mirrorLayout } from './mirror';
import { matchLayout } from './relayout';
import { layoutsFor } from './template';

const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });

/** A deck on `paper` with its sample slides: everything on it follows the template. */
const paperDeck = (lang = 'en') => deckFromTemplate(paperTemplate(), { lang, sample: true });

/** Applies commands as one batch through a validating bus. */
function run(deck: Deck, commands: Command[]): CommandBus {
  const bus = new CommandBus(deck, { validate: true });
  bus.batch(commands);
  return bus;
}

const slideOf = (deck: Deck, layoutId: string) => deck.slides.find((s) => s.layoutId === layoutId)!;
const element = (deck: Deck, id: string) => findElementInDeck(deck, id)!.element;
const text = (deck: Deck, id: string) => element(deck, id) as TextElement;

describe('applyTemplate', () => {
  it('replaces the theme and the layouts and moves every slide, as one undo step', () => {
    const deck = paperDeck();
    const night = nightTemplate();
    const bus = run(deck, applyTemplate(deck, night));
    const after = bus.deck;

    expect(after.theme).toEqual(night.theme);
    // The template's layouts in its order, for the deck's direction; then the two layouts of
    // archetypes it does not have, which their slides keep.
    expect(after.layouts.slice(0, night.layouts.length)).toEqual(layoutsFor(night, 'ltr'));
    expect(after.layouts.slice(night.layouts.length).map((l) => l.id)).toEqual([
      'l_paper_timeline',
      'l_paper_chart',
    ]);
    expect(after.slides.map((s) => s.layoutId)).toEqual([
      'l_night_hero',
      'l_night_section',
      'l_night_text_image',
      'l_night_cards',
      'l_night_cards',
      'l_night_big_number',
      'l_night_quote',
      'l_paper_timeline',
      'l_paper_chart',
    ]);
    // Slides, elements and their text are the same ones.
    expect(after.slides.map((s) => s.id)).toEqual(deck.slides.map((s) => s.id));
    expect(after.slides.map((s) => s.elements.map((e) => e.id))).toEqual(
      deck.slides.map((s) => s.elements.map((e) => e.id)),
    );

    expect(bus.undoStack).toHaveLength(1);
    expect(bus.undo()).toBe(true);
    expect(bus.deck).toEqual(deck);
    expect(bus.redo()).toBe(true);
    expect(bus.deck).toEqual(after);
  });

  it('moves elements to the placeholder of their role, with its look', () => {
    const deck = paperDeck();
    const after = run(deck, applyTemplate(deck, nightTemplate())).deck;

    // The night hero is drawn right-to-left; in this deck its text is on the left.
    const [title, subtitle, image] = slideOf(after, 'l_night_hero').elements;
    expect(title).toMatchObject({
      frame: box(96, 300, 1100, 300),
      vAlign: 'middle',
      content: { paragraphs: [{ styleRef: 'display', runs: [{ text: 'A quarter in review' }] }] },
    });
    expect(subtitle).toMatchObject({
      frame: box(96, 620, 1100, 120),
      content: { paragraphs: [{ styleRef: 'title' }] },
    });
    expect(image).toMatchObject({
      frame: box(1280, 0, 640, 1080),
      prompt: 'A sunlit desk with paper and ink',
    });

    // Alignment and vertical alignment follow too: centred in `paper`, at the start in `night`.
    const [number, caption] = slideOf(after, 'l_night_big_number').elements;
    expect(number).toMatchObject({
      vAlign: 'bottom',
      content: { paragraphs: [{ align: 'start', styleRef: 'display' }] },
    });
    expect(caption).toMatchObject({
      content: { paragraphs: [{ align: 'start', styleRef: 'body' }] },
    });

    // The hand-drawn left-to-right layout is the one used, not the mirror of the other.
    const picture = slideOf(after, 'l_night_text_image').elements[2]!;
    expect(picture.frame).toEqual(box(1100, 0, 820, 1080));
    // A list keeps its bullets; only what the placeholder decides changes.
    expect(slideOf(after, 'l_night_text_image').elements[1]).toMatchObject({
      content: {
        paragraphs: [
          { list: { kind: 'bullet', level: 0 }, runs: [{ text: 'Ship the editor' }] },
          { list: { kind: 'bullet', level: 0 } },
          { list: { kind: 'bullet', level: 0 } },
        ],
      },
    });
  });

  it('leaves an element whose role has no placeholder where it was', () => {
    const deck = paperDeck();
    const after = run(deck, applyTemplate(deck, nightTemplate())).deck;

    // The section number, the attribution of the quote, and the fourth of four cards.
    const stay = [
      slideOf(deck, 'l_paper_section').elements[0]!,
      slideOf(deck, 'l_paper_quote').elements[1]!,
      slideOf(deck, 'l_paper_cards4').elements[4]!,
    ];
    expect(stay.map((e) => e.role)).toEqual(['number', 'attribution', 'body']);
    for (const before of stay) expect(element(after, before.id)).toBe(before);

    // The first three cards took the three placeholders, in order: the first is on the left.
    const cards = after.slides[4]!.elements;
    expect(cards.slice(1, 4).map((e) => e.frame)).toEqual([
      box(96, 320, 560, 600),
      box(680, 320, 560, 600),
      box(1264, 320, 560, 600),
    ]);
    // A slide of an archetype the template lacks is not touched, and neither is its layout.
    for (const id of ['l_paper_timeline', 'l_paper_chart']) {
      expect(slideOf(after, id).elements).toBe(slideOf(deck, id).elements);
      expect(after.layouts.find((l) => l.id === id)).toBe(deck.layouts.find((l) => l.id === id));
    }
  });

  it('does not touch what was set by hand', () => {
    const deck = paperDeck();
    const hero = slideOf(deck, 'l_paper_hero');
    const [title, subtitle, image] = hero.elements as [TextElement, TextElement, Element];
    // A title moved and resized; a subtitle with its own alignment, style, colour and vertical
    // alignment; and two elements that are not the layout's.
    title.frame = box(200, 100, 900, 300);
    subtitle.vAlign = 'bottom';
    subtitle.content = richText('What we built', {
      dir: 'ltr',
      align: 'end',
      styleRef: 'caption',
      marks: { color: { value: '#ff0000' }, font: 'Poppins', size: 40 },
    });
    const badge = createElement.shape({
      id: 'e_badge',
      frame: box(1500, 60, 200, 200),
      fill: { kind: 'solid', color: { value: '#123456' } },
    });
    const note = createElement.text({
      id: 'e_note',
      role: 'caption',
      frame: box(96, 960, 600, 60),
      content: richText('A caption the layout has no place for', { styleRef: 'caption' }),
    });
    hero.elements.push(badge, note);
    hero.background = { fill: { kind: 'solid', color: { value: '#000000' } } };

    const after = run(deck, applyTemplate(deck, nightTemplate())).deck;
    const moved = slideOf(after, 'l_night_hero');
    expect(moved.background).toEqual(hero.background);
    expect(element(after, 'e_badge')).toEqual(badge);
    expect(element(after, 'e_note')).toEqual(note);
    // The moved title keeps its frame; it still takes the text style of its role.
    expect(text(after, title.id).frame).toEqual(box(200, 100, 900, 300));
    expect(text(after, title.id).vAlign).toBe('middle');
    // The subtitle sat on its placeholder, so it goes to the new one; everything else is its own.
    expect(text(after, subtitle.id)).toEqual({ ...subtitle, frame: box(96, 620, 1100, 120) });
    expect(element(after, image.id).frame).toEqual(box(1280, 0, 640, 1080));
  });

  it('gives the deck back when switching there and back, in both directions', () => {
    for (const lang of ['en', 'he']) {
      const deck = paperDeck(lang);
      const night = nightTemplate();
      const there = run(deck, applyTemplate(deck, night)).deck;
      expect(there).not.toEqual(deck);
      const back = run(there, applyTemplate(there, paperTemplate())).deck;
      expect(back).toEqual(deck);

      // And the other way round, from the template drawn right-to-left.
      const dark = deckFromTemplate(night, { lang, sample: true });
      const light = run(dark, applyTemplate(dark, paperTemplate())).deck;
      // `paper` has no table and no closing layout: those two slides keep theirs.
      expect(light.layouts.slice(-2).map((l) => l.id)).toEqual([
        'l_night_table',
        'l_night_closing',
      ]);
      expect(run(light, applyTemplate(light, night)).deck).toEqual(dark);
    }
  });

  it('gives the deck back with what was set by hand still in place', () => {
    const deck = paperDeck();
    const [title, subtitle] = slideOf(deck, 'l_paper_hero').elements as [TextElement, TextElement];
    title.frame = box(200, 100, 900, 300);
    subtitle.content = richText('What we built', { dir: 'ltr', align: 'justify' });
    const there = run(deck, applyTemplate(deck, nightTemplate())).deck;
    expect(run(there, applyTemplate(there, paperTemplate())).deck).toEqual(deck);
  });

  it('has nothing to do for a deck that is on the template already', () => {
    const deck = paperDeck('he');
    expect(applyTemplate(deck, paperTemplate())).toEqual([]);
  });

  it('brings a layout back to the template when applied again', () => {
    const deck = paperDeck();
    const hero = deck.layouts.find((l) => l.id === 'l_paper_hero')!;
    hero.placeholders[0]!.frame = box(96, 96, 1100, 260);
    const commands = applyTemplate(deck, paperTemplate());
    const after = run(deck, commands).deck;
    expect(after.layouts).toEqual(paperTemplate().layouts);
    expect(after.slides.map((s) => s.layoutId)).toEqual(deck.slides.map((s) => s.layoutId));
    // The title was drawn for the template's placeholder, not for the edited one: it stays.
    expect(slideOf(after, 'l_paper_hero').elements).toEqual(slideOf(deck, 'l_paper_hero').elements);
  });

  it('only changes the theme and the layouts of a deck whose slides have no layout', () => {
    const deck = hebrewDeck();
    const night = nightTemplate();
    const commands = applyTemplate(deck, night);
    expect(commands.map((c) => c.type)).toEqual([
      'theme.replace',
      ...night.layouts.map(() => 'layout.add'),
    ]);
    const after = run(deck, commands).deck;
    expect(after.slides).toBe(deck.slides);
    expect(after.layouts).toEqual(night.layouts);
  });

  describe('a slide without a layout that knows its archetype', () => {
    /** A slide as HTML conversion leaves one: an archetype, roles, frames of its own. */
    const written = (elements: Element[]): Deck => ({
      ...hebrewDeck(),
      slides: [{ id: 's_html', archetype: 'quote', elements, timeline: [] }],
    });
    const quote = createElement.text({
      id: 'e_quote',
      role: 'quote',
      frame: box(200, 300, 900, 200),
      vAlign: 'top',
      content: richText('אמרה', { align: 'center', styleRef: 'title' }),
    });
    const who = createElement.text({
      id: 'e_who',
      role: 'attribution',
      frame: box(200, 600, 900, 60),
      content: richText('מי אמר'),
    });

    it('takes the layout of its archetype when everything on it has a place there', () => {
      const deck = written([quote, who]);
      const paper = paperTemplate();
      const target = layoutsFor(paper, 'rtl').find((l) => l.archetype === 'quote')!;
      const bus = run(deck, applyTemplate(deck, paper));
      const [slide] = bus.deck.slides;

      expect(slide!.layoutId).toBe(target.id);
      const seat = (role: string) => target.placeholders.find((p) => p.role === role)!;
      expect(text(bus.deck, 'e_quote')).toMatchObject({
        frame: seat('quote').frame,
        vAlign: seat('quote').vAlign ?? 'top',
      });
      expect(text(bus.deck, 'e_quote').content.paragraphs[0]).toMatchObject({
        align: seat('quote').align ?? 'start',
        styleRef: seat('quote').styleRef,
        runs: [{ text: 'אמרה' }],
      });
      expect(text(bus.deck, 'e_who').frame).toEqual(seat('attribution').frame);

      expect(bus.undoStack).toHaveLength(1);
      bus.undo();
      expect(bus.deck).toEqual(deck);
    });

    it('is left alone when something on it has no place in the layout', () => {
      // A card behind the text is part of the slide's own design: the text must not leave it.
      const card = createElement.shape({ id: 'e_card', frame: box(160, 260, 1000, 460) });
      const deck = written([card, quote, who]);
      const after = run(deck, applyTemplate(deck, paperTemplate())).deck;
      expect(after.slides).toBe(deck.slides);

      // And so is a slide with more elements of a role than the layout has placeholders:
      // two quotes for one place, or an attribution for a layout that has none.
      const second = { ...quote, id: 'e_quote2' };
      const crowded = written([quote, second, who]);
      expect(run(crowded, applyTemplate(crowded, paperTemplate())).deck.slides).toBe(
        crowded.slides,
      );
      const unseated = written([quote, who]);
      expect(run(unseated, applyTemplate(unseated, nightTemplate())).deck.slides).toBe(
        unseated.slides,
      );
    });

    it('stays without a layout when it has no archetype, or the template has none of it', () => {
      const plain = written([quote, who]);
      delete plain.slides[0]!.archetype;
      expect(run(plain, applyTemplate(plain, paperTemplate())).deck.slides).toBe(plain.slides);

      const timeline = written([quote, who]);
      timeline.slides[0]!.archetype = 'team';
      expect(run(timeline, applyTemplate(timeline, paperTemplate())).deck.slides).toBe(
        timeline.slides,
      );
    });
  });

  it("registers the template's assets the deck does not have", () => {
    const logo: AssetMeta = {
      id: 'b'.repeat(64),
      file: `${'b'.repeat(64)}.svg`,
      mime: 'image/svg+xml',
      kind: 'svg',
      bytes: 512,
      origin: 'upload',
    };
    const night = { ...nightTemplate(), assets: { [logo.id]: logo } };
    const deck = paperDeck();
    const commands = applyTemplate(deck, night);
    expect(commands[0]).toEqual({ type: 'asset.add', asset: logo });
    const after = run(deck, commands).deck;
    expect(after.assets[logo.id]).toEqual(logo);
    expect(applyTemplate(after, night)).toEqual([]);
  });
});

describe('matchLayout', () => {
  it('picks, among layouts of one archetype, the one with room for the slide', () => {
    const paper = paperTemplate();
    const night = nightTemplate();
    const from = night.layouts.find((l) => l.id === 'l_night_cards')!;
    const deck = paperDeck();
    const three = slideOf(deck, 'l_paper_cards3');
    const four = slideOf(deck, 'l_paper_cards4');
    expect(matchLayout(three, from, paper.layouts)?.id).toBe('l_paper_cards3');
    expect(matchLayout(four, from, paper.layouts)?.id).toBe('l_paper_cards4');
    // The same id is the same layout, whatever its archetype has become.
    const renamed = { ...paper.layouts[0]!, id: from.id };
    expect(matchLayout(three, from, [...paper.layouts, renamed])).toBe(renamed);
    expect(matchLayout(three, from, [paper.layouts[0]!])).toBeUndefined();
  });
});

describe('changeDirection', () => {
  /** A deck with what a real one has beside the layout's elements. */
  function workedDeck(lang: string): Deck {
    const deck = deckFromTemplate(nightTemplate(), { lang, sample: true });
    const hero = deck.slides[0]!;
    // A title moved by hand, a free arrow, a group, and a slide background with a gradient.
    hero.elements[0]!.frame = box(700, 80, 1000, 200);
    hero.elements.push(
      createElement.line({
        id: 'e_arrow',
        frame: box(100, 900, 300, 0),
        rotation: 20,
        points: [
          { x: 0, y: 0 },
          { x: 300, y: 0 },
        ],
        endHead: 'arrow',
      }),
      createElement.group({
        id: 'e_card',
        frame: box(1200, 760, 400, 200),
        children: [
          createElement.shape({ id: 'e_card_bg', frame: box(0, 0, 400, 200) }),
          createElement.text({
            id: 'e_card_text',
            frame: box(24, 24, 200, 60),
            padding: { top: 0, right: 12, bottom: 0, left: 4 },
            content: richText('חדש', { dir: 'rtl' }),
          }),
        ],
      }),
    );
    hero.background = {
      fill: {
        kind: 'linear',
        angle: 120,
        stops: [
          { color: { token: 'bg' }, at: 0 },
          { color: { token: 'secondary' }, at: 1 },
        ],
      },
    };
    return deck;
  }

  it('turns the deck round as one undo step, and back to what it was', () => {
    for (const lang of ['he', 'en']) {
      const deck = workedDeck(lang);
      const other = deck.meta.dir === 'rtl' ? 'ltr' : 'rtl';
      const bus = run(deck, changeDirection(deck, other));
      const there = bus.deck;
      expect(there.meta.dir).toBe(other);
      expect(there.layouts).toEqual(deck.layouts.map(mirrorLayout));
      expect(bus.undoStack).toHaveLength(1);

      expect(run(there, changeDirection(there, deck.meta.dir)).deck).toEqual(deck);
      bus.undo();
      expect(bus.deck).toEqual(deck);
      expect(changeDirection(deck, deck.meta.dir)).toEqual([]);
    }
  });

  it('takes elements with their placeholders, and mirrors the rest where it stands', () => {
    const deck = workedDeck('he');
    const there = run(deck, changeDirection(deck, 'ltr')).deck;
    const [title, subtitle, image] = there.slides[0]!.elements;
    // The subtitle and the picture sat on their placeholders; the title was moved by hand.
    expect(subtitle!.frame).toEqual(box(96, 620, 1100, 120));
    expect(image!.frame).toEqual(box(1280, 0, 640, 1080));
    expect(title!.frame).toEqual(box(220, 80, 1000, 200));
    // Text is not flipped and keeps the direction of its language.
    expect(title).toMatchObject({ content: { paragraphs: [{ dir: 'rtl' }] } });
    expect(title).not.toHaveProperty('flipH');

    expect(element(there, 'e_arrow')).toMatchObject({
      frame: box(1520, 900, 300, 0),
      rotation: -20,
      flipH: true,
    });
    expect(element(there, 'e_card')).toMatchObject({ frame: box(320, 760, 400, 200) });
    expect(element(there, 'e_card')).not.toHaveProperty('flipH');
    expect(element(there, 'e_card_bg')).toMatchObject({ frame: box(0, 0, 400, 200), flipH: true });
    expect(element(there, 'e_card_text')).toMatchObject({
      frame: box(176, 24, 200, 60),
      padding: { top: 0, right: 4, bottom: 0, left: 12 },
    });
    expect(there.slides[0]!.background?.fill).toMatchObject({ angle: -120 });
    // A table keeps the order of its columns: that is a choice of its own (TBL-07).
    expect(slideOf(there, 'l_night_table').elements[1]).toMatchObject({
      type: 'table',
      dir: 'rtl',
    });
  });

  it('takes the layout the template drew by hand, where the deck still has it as drawn', () => {
    const night = nightTemplate();
    // A second layout drawn by hand: the closing slide is the same in both directions, so its
    // logo stays in its corner instead of changing sides.
    const closing = night.layouts.find((l) => l.id === 'l_night_closing')!;
    night.flipped!.push(closing);
    const deck = deckFromTemplate(night, { lang: 'he', sample: true });
    // One layout was edited in the deck: that one is mirrored as it is.
    const cards = deck.layouts.find((l) => l.id === 'l_night_cards')!;
    cards.placeholders[0]!.frame = box(96, 60, 1728, 150);

    const there = run(deck, changeDirection(deck, 'ltr', night)).deck;
    const layout = (id: string) => there.layouts.find((l) => l.id === id)!;
    expect(layout('l_night_text_image')).toEqual(night.flipped![0]);
    expect(layout('l_night_closing')).toEqual(closing);
    expect(layout('l_night_cards')).toEqual(mirrorLayout(cards));
    // The picture went to the hand-drawn placeholder, not to the mirror of the old one, and the
    // logo stayed with a placeholder that did not move.
    expect(slideOf(there, 'l_night_text_image').elements[2]!.frame).toEqual(
      box(1100, 0, 820, 1080),
    );
    expect(slideOf(there, 'l_night_closing').elements[2]!.frame).toEqual(box(1620, 920, 204, 80));
    // Without the template the same layouts are simply mirrored.
    const plain = run(deck, changeDirection(deck, 'ltr')).deck;
    expect(slideOf(plain, 'l_night_text_image').elements[2]!.frame).toEqual(
      box(1052, 96, 772, 888),
    );
    expect(slideOf(plain, 'l_night_closing').elements[2]!.frame).toEqual(box(96, 920, 204, 80));

    expect(run(there, changeDirection(there, 'rtl', night)).deck).toEqual(deck);
  });
});
