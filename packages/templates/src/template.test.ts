import { Deck, type Slide } from '@slidr/model';
import { describe, expect, it } from 'vitest';
import { deckFromTemplate } from './deck';
import { nightTemplate, paperTemplate } from './fixtures';
import { mirrorLayout } from './mirror';
import { sitsOn } from './relayout';
import { layoutsFor, Template } from './template';

describe('Template', () => {
  it('accepts the fixture templates, which are the same on every call', () => {
    for (const make of [paperTemplate, nightTemplate]) {
      const parsed = Template.safeParse(make());
      expect(parsed.error?.issues).toBeUndefined();
      expect(make()).toEqual(make());
    }
  });

  it('rejects a layout id used twice, and a hand-drawn layout or a sample slide of no layout', () => {
    const template = nightTemplate();
    const issues = (broken: Template) =>
      Template.safeParse(broken).error?.issues.map((issue) => issue.path.join('.'));

    expect(issues({ ...template, layouts: [...template.layouts, template.layouts[0]!] })).toEqual([
      `layouts.${template.layouts.length}.id`,
    ]);
    expect(issues({ ...template, flipped: [{ ...template.flipped![0]!, id: 'l_other' }] })).toEqual(
      ['flipped.0.id'],
    );
    const stray: Slide = { ...template.sample![0]!, layoutId: 'l_other' };
    expect(issues({ ...template, sample: [stray] })).toEqual(['sample.0.layoutId']);
  });
});

describe('layoutsFor', () => {
  it('gives the layouts as drawn for their own direction, as copies', () => {
    const paper = paperTemplate();
    const layouts = layoutsFor(paper, 'ltr');
    expect(layouts).toEqual(paper.layouts);
    expect(layouts[0]).not.toBe(paper.layouts[0]);
  });

  it('mirrors them for the other direction, except where the template drew one by hand', () => {
    const night = nightTemplate();
    const layouts = layoutsFor(night, 'ltr');
    expect(layouts.map((l) => l.id)).toEqual(night.layouts.map((l) => l.id));
    for (const [i, layout] of layouts.entries()) {
      const drawn = layout.id === 'l_night_text_image';
      expect(layout).toEqual(drawn ? night.flipped![0] : mirrorLayout(night.layouts[i]!));
    }
    // The hand-drawn one is not what mirroring gives: its picture runs to the edge.
    const byHand = layouts.find((l) => l.id === 'l_night_text_image')!;
    expect(byHand).not.toEqual(mirrorLayout(night.layouts[2]!));
    expect(byHand.placeholders[2]!.frame).toEqual({ x: 1100, y: 0, w: 820, h: 1080 });
  });
});

describe('deckFromTemplate', () => {
  it('makes a valid deck in either direction, with the layouts of that direction', () => {
    for (const make of [paperTemplate, nightTemplate]) {
      for (const lang of ['he', 'en']) {
        const template = make();
        const empty = deckFromTemplate(template, { lang });
        expect(Deck.safeParse(empty).error?.issues).toBeUndefined();
        expect(empty.theme).toEqual(template.theme);
        expect(empty.layouts).toEqual(layoutsFor(template, empty.meta.dir));
        expect(empty.slides).toEqual([]);

        const deck = deckFromTemplate(template, { lang, sample: true });
        expect(Deck.safeParse(deck).error?.issues).toBeUndefined();
        expect(deck.meta.dir).toBe(lang === 'he' ? 'rtl' : 'ltr');
        expect(deck.layouts).toEqual(empty.layouts);
        expect(deck.slides.map((s) => s.layoutId)).toEqual(template.sample!.map((s) => s.layoutId));
      }
    }
  });

  it('turns the sample round with the layouts: every element still sits on its placeholder', () => {
    const night = nightTemplate();
    const deck = deckFromTemplate(night, { lang: 'en', sample: true });
    for (const slide of deck.slides) {
      const layout = deck.layouts.find((l) => l.id === slide.layoutId)!;
      const seats = layout.placeholders.filter((p) => p.role !== 'slideNumber');
      expect(slide.elements).toHaveLength(seats.length);
      slide.elements.forEach((element, i) => expect(sitsOn(element, seats[i]!)).toBe(true));
    }
    // The text went with its box; nothing in it changed.
    const title = deck.slides[0]!.elements[0]!;
    expect(title).toMatchObject({
      frame: { x: 96, y: 300, w: 1100, h: 300 },
      content: { paragraphs: [{ dir: 'rtl', runs: [{ text: 'סיכום הרבעון' }] }] },
    });
  });
});
