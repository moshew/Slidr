import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  CommandBus,
  createDeck,
  createSelectionStore,
  createSlide,
  plainText,
  Slide,
} from '@slidr/model';
import { describe, expect, it } from 'vitest';
import { previewAsset, previewBackdrop } from './designAssets';
import {
  DESIGN_GROUPS,
  DESIGN_IDS,
  DESIGN_SUBJECTS,
  designsOf,
  designSlide,
  insertDesign,
} from './designs';

describe('Elements designs', () => {
  it('ships 260 valid slides with real, editable copy in both languages', () => {
    expect(DESIGN_IDS).toHaveLength(260);
    expect(new Set(DESIGN_IDS).size).toBe(260);
    for (const lang of ['he', 'en']) {
      for (const id of DESIGN_IDS) {
        const slide = designSlide(id, lang, 'test-image', 'test-backdrop');
        const parsed = Slide.safeParse(slide);
        expect(parsed.success, `${lang}/${id}: ${parsed.error?.issues[0]?.message}`).toBe(true);
        // One picture file, or two where a photographic backdrop lies under a cut-out subject.
        // A design may show its one picture in several frames (four faces of one sheet).
        const pictures = slide.elements.flatMap((element) =>
          element.type === 'image' ? [element.assetId] : [],
        );
        expect([...new Set(pictures)].sort(), `${lang}/${id}`).toEqual(
          previewBackdrop(id) ? ['test-backdrop', 'test-image'] : ['test-image'],
        );
        // Words stand in text boxes and in shapes that carry their own (a button, a chip).
        const worded = slide.elements.flatMap((element) =>
          (element.type === 'text' || element.type === 'shape') && element.content
            ? [element.content]
            : [],
        );
        expect(worded.length, `${lang}/${id}`).toBeGreaterThanOrEqual(3);
        const copy = worded.map((content) => plainText(content)).join(' ');
        expect(copy).not.toMatch(/lorem ipsum|placeholder|add your text|טקסט לדוגמה/i);
        expect(copy.length, `${lang}/${id}`).toBeGreaterThan(25);
      }
    }
  });

  it('files every design under one group, and every group has designs', () => {
    expect(DESIGN_GROUPS).toHaveLength(16);
    expect(DESIGN_GROUPS.flatMap(designsOf).sort()).toEqual([...DESIGN_IDS].sort());
    for (const group of DESIGN_GROUPS) expect(designsOf(group).length).toBeGreaterThanOrEqual(9);
  });

  it('knows the size of every bundled picture, so the gallery can draw a cropped one', () => {
    // Fails when a picture was added or replaced without `node scripts/design-asset-sizes.mjs`.
    const script = fileURLToPath(new URL('../../scripts/design-asset-sizes.mjs', import.meta.url));
    expect(() =>
      execFileSync(process.execPath, [script, '--check'], { stdio: 'pipe' }),
    ).not.toThrow();
    for (const id of DESIGN_IDS) {
      expect(previewAsset(id).width, id).toBeGreaterThan(0);
      expect(previewBackdrop(id)?.width ?? 1, id).toBeGreaterThan(0);
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

  it("sets every line in a typeface of the design, not in the deck's", () => {
    for (const lang of ['he', 'en']) {
      for (const id of DESIGN_IDS) {
        for (const element of designSlide(id, lang, 'photo').elements) {
          if (element.type !== 'text' && element.type !== 'shape') continue;
          for (const paragraph of element.content?.paragraphs ?? []) {
            for (const run of paragraph.runs) {
              expect(run.marks?.font, `${lang}/${id}: "${run.text}"`).toBeTruthy();
            }
          }
        }
      }
    }
  });

  it('adds the backdrop of a two-picture design with its subject, in the same undo step', () => {
    const bus = new CommandBus(createDeck({ slides: [createSlide()] }), { validate: true });
    const selection = createSelectionStore(bus);
    const picture = (letter: string) => ({
      id: letter.repeat(64),
      file: `${letter.repeat(64)}.webp`,
      mime: 'image/webp',
      kind: 'image' as const,
      bytes: 100,
      origin: 'import' as const,
    });
    const [subject, backdrop] = [picture('a'), picture('b')];
    const added = insertDesign(bus, selection, 'concert', 'Concert', 'Add', subject, backdrop);
    const images = added.elements.filter((element) => element.type === 'image');
    // The backdrop fills the slide and lies under the subject, which has a frame of its own.
    expect(images.map((image) => image.assetId)).toEqual([backdrop.id, subject.id]);
    expect(images[0]!.frame).toEqual({ x: 0, y: 0, w: 1920, h: 1080 });
    expect(images[1]!.frame.w).toBeLessThan(1920);
    expect(Object.keys(bus.deck.assets).sort()).toEqual([subject.id, backdrop.id]);
    bus.undo();
    expect(bus.deck.assets).toEqual({});
    expect(bus.deck.slides).toHaveLength(1);
  });

  it('keeps decorative hit areas away from the thumbnail subject', () => {
    for (const lang of ['en', 'he']) {
      const thumbnail = designSlide('thumbnail', lang, 'photo');
      const arrows = thumbnail.elements.filter((element) => element.type === 'svg').slice(1);
      expect(arrows).toHaveLength(2);
      expect(arrows.map((arrow) => [arrow.frame.w, arrow.frame.h])).toEqual([
        [355, 142],
        [270, 215],
      ]);
    }
  });

  it('leaves the subject of every picture on top, so that a click selects the picture', () => {
    // A point on the subject of each picture, in left-to-right slide pixels. The first
    // twenty-five are listed here; a design of a pack names its own point.
    const subjects: Record<string, [x: number, y: number]> = {
      possibility: [1780, 500],
      momentum: [1650, 400],
      wedding: [1500, 600],
      webinar: [1480, 330],
      conference: [1700, 500],
      workshop: [1600, 500],
      product: [1450, 500],
      sale: [1500, 560],
      testimonial: [1491, 340],
      thumbnail: [450, 500],
      trek: [1690, 300],
      birthday: [215, 195],
      dinner: [1440, 540],
      teammate: [1470, 480],
      concert: [1481, 270],
      roshhashana: [462, 800],
      hiring: [1490, 500],
      // The title is set on the book's cover: the point is on the cover, below the words.
      book: [360, 780],
      podcast: [480, 500],
      opening: [1400, 470],
      openhouse: [640, 400],
      course: [1449, 420],
      milestone: [200, 200],
      yoga: [1487, 620],
      volunteer: [1410, 500],
    };
    Object.assign(subjects, DESIGN_SUBJECTS);
    expect(Object.keys(subjects).sort()).toEqual([...DESIGN_IDS].sort());
    for (const lang of ['en', 'he']) {
      for (const [id, [x, y]] of Object.entries(subjects)) {
        const at = lang === 'he' ? 1920 - x : x;
        const slide = designSlide(id, lang, 'photo');
        const top = slide.elements.findLast(
          ({ frame }) =>
            at >= frame.x && at <= frame.x + frame.w && y >= frame.y && y <= frame.y + frame.h,
        );
        expect(top?.type, `${lang}/${id}`).toBe('image');
      }
    }
  });
});
