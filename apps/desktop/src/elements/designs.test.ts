import {
  CommandBus,
  createDeck,
  createSelectionStore,
  createSlide,
  plainText,
  Slide,
} from '@slidr/model';
import { describe, expect, it } from 'vitest';
import { DESIGN_IDS, designSlide, insertDesign } from './designs';

describe('Elements designs', () => {
  it('ships ten valid slides with real, editable copy in both languages', () => {
    expect(DESIGN_IDS).toHaveLength(10);
    for (const lang of ['he', 'en']) {
      for (const id of DESIGN_IDS) {
        const slide = designSlide(id, lang, 'test-image');
        expect(Slide.safeParse(slide).success, `${lang}/${id}`).toBe(true);
        expect(slide.elements.filter((element) => element.type === 'image')).toHaveLength(1);
        const texts = slide.elements.filter((element) => element.type === 'text');
        expect(texts.length, `${lang}/${id}`).toBeGreaterThanOrEqual(3);
        const copy = texts.map((element) => plainText(element.content)).join(' ');
        expect(copy).not.toMatch(/lorem ipsum|placeholder|add your text|טקסט לדוגמה/i);
        expect(copy.length, `${lang}/${id}`).toBeGreaterThan(25);
      }
    }
  });

  it('adds a fresh slide after the current one and undoes it in one step', () => {
    const first = createSlide();
    const last = createSlide();
    const bus = new CommandBus(createDeck({ slides: [first, last] }), { validate: true });
    const selection = createSelectionStore(bus);
    const asset = {
      id: 'a'.repeat(64),
      file: `${'a'.repeat(64)}.webp`,
      mime: 'image/webp',
      kind: 'image' as const,
      bytes: 100,
      origin: 'import' as const,
    };
    const added = insertDesign(bus, selection, 'webinar', 'Webinar', 'Add designed slide', asset);
    expect(bus.deck.slides.map((slide) => slide.id)).toEqual([first.id, added.id, last.id]);
    expect(selection.getState().currentSlideId).toBe(added.id);
    expect(bus.deck.slides[1]!.elements.length).toBeGreaterThan(5);
    expect(bus.deck.assets[asset.id]).toEqual(asset);
    bus.undo();
    expect(bus.deck.slides.map((slide) => slide.id)).toEqual([first.id, last.id]);
  });
});
