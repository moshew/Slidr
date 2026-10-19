import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  CommandBus,
  CONTENT_LANGUAGES,
  createDeck,
  createSelectionStore,
  createSlide,
  languageDir,
  plainText,
  Slide,
} from '@slidr/model';
import { describe, expect, it } from 'vitest';
import next33Source from '../../scripts/design-locales/next-33/source.json';
import next50Source from '../../scripts/design-locales/next-50/source.json';
import next50bSource from '../../scripts/design-locales/next-50b/source.json';
import { builtinFaces, builtinFamilies } from '../fonts/builtinFonts.generated';
import { previewAsset, previewBackdrop } from './designAssets';
import { familyIn, fontShelf } from './designFonts';
import {
  DESIGN_GROUPS,
  DESIGN_IDS,
  DESIGN_SUBJECTS,
  designGroupName,
  designIn,
  designLanguages,
  designName,
  designsIn,
  designsOf,
  designSlide,
  insertDesign,
  MANAGED_DESIGN_IDS,
} from './designs';

/** The designs of `elements/designs/index.json`, and those the management tool publishes. */
const AUTHORED = DESIGN_IDS.filter((id) => !MANAGED_DESIGN_IDS.has(id));
const MANAGED = DESIGN_IDS.filter((id) => MANAGED_DESIGN_IDS.has(id));
/** The groups of the authored catalog: those with an authored design. */
const AUTHORED_GROUPS = DESIGN_GROUPS.filter((group) =>
  designsOf(group).some((id) => !MANAGED_DESIGN_IDS.has(id)),
);
const has = (id: string) => DESIGN_IDS.includes(id);
/** Every design in every language it is drawn in. */
const DRAWN = DESIGN_IDS.flatMap((id) => designLanguages(id).map((lang) => [lang, id] as const));

// The designs are content of the media library: without it there is nothing to test.
describe.skipIf(DESIGN_IDS.length === 0)('Elements designs', () => {
  it('offers every ready-made slide in every application language', () => {
    for (const id of DESIGN_IDS) {
      expect(designLanguages(id), id).toEqual(CONTENT_LANGUAGES);
      for (const lang of CONTENT_LANGUAGES) {
        expect(designIn(id, lang), `${id}/${lang}`).toBe(true);
      }
    }
  });
  it('offers the second batch of 50 expanded designs in every application language', () => {
    const ids = Object.keys(next50bSource);
    expect(ids).toHaveLength(50);
    for (const id of ids) {
      expect(has(id), id).toBe(true);
      expect(designLanguages(id), id).toEqual(CONTENT_LANGUAGES);
      for (const lang of CONTENT_LANGUAGES) expect(designIn(id, lang), `${id}/${lang}`).toBe(true);
    }
  });
  it('offers the next 50 expanded designs in every application language', () => {
    const ids = Object.keys(next50Source);
    expect(ids).toHaveLength(50);
    for (const id of ids) {
      expect(has(id), id).toBe(true);
      expect(designLanguages(id), id).toEqual(CONTENT_LANGUAGES);
      for (const lang of CONTENT_LANGUAGES) {
        expect(designIn(id, lang), `${id}/${lang}`).toBe(true);
      }
    }
  });
  it('offers the 33 expanded designs in every application language', () => {
    const ids = Object.keys(next33Source);
    expect(ids).toHaveLength(33);
    for (const id of ids) {
      expect(has(id), id).toBe(true);
      expect(designLanguages(id), id).toEqual(CONTENT_LANGUAGES);
      for (const lang of CONTENT_LANGUAGES) expect(designIn(id, lang), `${id}/${lang}`).toBe(true);
    }
  });
  it('ships valid slides with real, editable copy in each of their languages', () => {
    expect(new Set(DESIGN_IDS).size).toBe(DESIGN_IDS.length);
    for (const id of DESIGN_IDS) expect(designLanguages(id).slice(0, 2), id).toEqual(['he', 'en']);
    for (const [lang, id] of DRAWN) {
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
      expect(copy, `${lang}/${id}`).not.toMatch(
        /lorem ipsum|placeholder|add your text|טקסט לדוגמה|texte d'exemple|texto de ejemplo|beispieltext/i,
      );
      expect(copy.length, `${lang}/${id}`).toBeGreaterThan(25);
    }
  });

  it('files every design under one group, and every group has designs', () => {
    expect(DESIGN_GROUPS.flatMap(designsOf).sort()).toEqual([...DESIGN_IDS].sort());
    // The gallery opens on the first four designs of each group: no group has fewer.
    for (const group of DESIGN_GROUPS) {
      expect(designsOf(group).length, group).toBeGreaterThanOrEqual(4);
    }
  });

  it('offers an interface only the designs drawn in its language', () => {
    for (const lang of ['he', 'en']) {
      expect(
        DESIGN_IDS.filter((id) => designIn(id, lang)),
        lang,
      ).toEqual(DESIGN_IDS);
    }
    for (const lang of ['de', 'ar', 'ja', 'pt-BR']) {
      const drawn = DESIGN_IDS.filter((id) => designLanguages(id).some((one) => one === lang));
      expect(
        DESIGN_IDS.filter((id) => designIn(id, lang)),
        lang,
      ).toEqual(drawn);
      expect(
        DESIGN_GROUPS.flatMap((group) => designsIn(group, lang)),
        lang,
      ).toEqual(drawn);
    }
  });

  it.skipIf(AUTHORED.length === 0)('ships the 296 authored designs, in 19 groups', () => {
    expect(AUTHORED).toHaveLength(296);
    expect(new Set(AUTHORED).size).toBe(296);
    expect(AUTHORED_GROUPS).toHaveLength(19);
    for (const group of AUTHORED_GROUPS) {
      const authored = designsOf(group).filter((id) => !MANAGED_DESIGN_IDS.has(id));
      expect(authored.length, group).toBeGreaterThanOrEqual(4);
    }
  });

  it.skipIf(MANAGED.length === 0)('names the managed designs apart from the authored ones', () => {
    expect(new Set(MANAGED).size).toBe(MANAGED.length);
    for (const id of MANAGED) expect(id, id).toMatch(/^m-/);
    // A managed design and a group of its own are named in managed.json, in both languages.
    for (const lang of ['he', 'en']) {
      for (const id of MANAGED) expect(designName(id, lang), `${lang}/${id}`).toBeTruthy();
      for (const group of DESIGN_GROUPS.filter((group) => !AUTHORED_GROUPS.includes(group))) {
        expect(designGroupName(group, lang), `${lang}/${group}`).toBeTruthy();
      }
    }
  });

  it('knows the size of every picture, so the gallery can draw a cropped one', () => {
    for (const id of DESIGN_IDS) {
      expect(previewAsset(id).width, id).toBeGreaterThan(0);
      expect(previewBackdrop(id)?.width ?? 1, id).toBeGreaterThan(0);
    }
  });

  it.skipIf(AUTHORED.length === 0)('keeps sizes.json in step with the authored pictures', () => {
    // Fails when a picture was added or replaced without `node scripts/design-asset-sizes.mjs`.
    const script = fileURLToPath(new URL('../../scripts/design-asset-sizes.mjs', import.meta.url));
    expect(() =>
      execFileSync(process.execPath, [script, '--check'], { stdio: 'pipe' }),
    ).not.toThrow();
  });

  it.skipIf(!has('webinar'))(
    'adds a fresh slide after the current one and undoes it in one step',
    () => {
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
      const added = insertDesign(
        bus,
        selection,
        'webinar',
        'en',
        'Webinar',
        'Add designed slide',
        asset,
      );
      expect(bus.deck.slides.map((slide) => slide.id)).toEqual([first.id, added.id, last.id]);
      expect(selection.getState().currentSlideId).toBe(added.id);
      expect(bus.deck.slides[1]!.elements.length).toBeGreaterThan(5);
      expect(bus.deck.assets[asset.id]).toEqual(asset);
      // In the language the panel showed it in, not in the Hebrew of the deck.
      const words = (slide: Slide) =>
        slide.elements.flatMap((element) =>
          (element.type === 'text' || element.type === 'shape') && element.content
            ? [plainText(element.content)]
            : [],
        );
      expect(words(bus.deck.slides[1]!)).toEqual(words(designSlide('webinar', 'en', asset.id)));
      expect(words(bus.deck.slides[1]!)).not.toEqual(words(designSlide('webinar', 'he', asset.id)));
      bus.undo();
      expect(bus.deck.slides.map((slide) => slide.id)).toEqual([first.id, last.id]);
    },
  );

  it("sets every line in a typeface of the design, not in the deck's", () => {
    for (const [lang, id] of DRAWN) {
      for (const element of designSlide(id, lang, 'photo').elements) {
        if (element.type !== 'text' && element.type !== 'shape') continue;
        for (const paragraph of element.content?.paragraphs ?? []) {
          for (const run of paragraph.runs) {
            expect(run.marks?.font, `${lang}/${id}: "${run.text}"`).toBeTruthy();
          }
        }
      }
    }
  });

  it.skipIf(builtinFamilies.length === 0)(
    'sets each language but Hebrew and English in families of its own letters',
    () => {
      // What `scripts/design-fonts.mjs` leaves as it is: a family of the language, or a Latin one
      // for a text without the language's letters.
      const shelf = fontShelf({ families: builtinFamilies, faces: builtinFaces });
      for (const [lang, id] of DRAWN) {
        if (lang === 'he' || lang === 'en') continue;
        for (const element of designSlide(id, lang, 'photo').elements) {
          if (element.type !== 'text' && element.type !== 'shape') continue;
          for (const paragraph of element.content?.paragraphs ?? []) {
            for (const run of paragraph.runs) {
              const font = run.marks?.font ?? '';
              expect(familyIn(shelf, font, lang, run.text), `${lang}/${id}: "${run.text}"`).toBe(
                font,
              );
            }
          }
        }
      }
    },
  );

  it.skipIf(!has('concert'))(
    'adds the backdrop of a two-picture design with its subject, in the same undo step',
    () => {
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
      const added = insertDesign(
        bus,
        selection,
        'concert',
        'he',
        'Concert',
        'Add',
        subject,
        backdrop,
      );
      const images = added.elements.filter((element) => element.type === 'image');
      // The backdrop fills the slide and lies under the subject, which has a frame of its own.
      expect(images.map((image) => image.assetId)).toEqual([backdrop.id, subject.id]);
      expect(images[0]!.frame).toEqual({ x: 0, y: 0, w: 1920, h: 1080 });
      expect(images[1]!.frame.w).toBeLessThan(1920);
      expect(Object.keys(bus.deck.assets).sort()).toEqual([subject.id, backdrop.id]);
      bus.undo();
      expect(bus.deck.assets).toEqual({});
      expect(bus.deck.slides).toHaveLength(1);
    },
  );

  it.skipIf(!has('thumbnail'))('keeps decorative hit areas away from the thumbnail subject', () => {
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
    // twenty-five authored designs are listed here; a design of a pack, and a managed design,
    // names its own point.
    const listed: Record<string, [x: number, y: number]> = {
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
    const subjects = Object.fromEntries(
      Object.entries(listed).filter(([id]) => AUTHORED.includes(id)),
    );
    Object.assign(subjects, DESIGN_SUBJECTS);
    expect(Object.keys(subjects).sort()).toEqual([...DESIGN_IDS].sort());
    const under = (elements: Slide['elements'], at: number, y: number) =>
      elements.findLast(
        ({ frame }) =>
          at >= frame.x && at <= frame.x + frame.w && y >= frame.y && y <= frame.y + frame.h,
      );
    for (const [id, [x, y]] of Object.entries(subjects)) {
      for (const lang of designLanguages(id)) {
        // The point is on the English slide; a right-to-left slide is its mirror.
        const rtl = languageDir(lang) === 'rtl';
        let at = rtl ? 1920 - x : x;
        let down = y;
        const slide = designSlide(id, lang, 'photo');
        // A language whose slide moved the picture moves the point with it: the red ball of
        // `statement` closes its second line, wherever that line ends.
        const source = designSlide(id, rtl ? 'he' : 'en', 'photo').elements;
        const picture = under(source, at, down);
        if (picture?.type === 'image' && lang !== 'he' && lang !== 'en') {
          const images = (elements: Slide['elements']) =>
            elements.filter((e) => e.type === 'image');
          const moved =
            slide.elements.find((e) => e.id === picture.id) ??
            images(slide.elements)[images(source).indexOf(picture)];
          if (moved) {
            at += moved.frame.x - picture.frame.x;
            down += moved.frame.y - picture.frame.y;
          }
        }
        expect(under(slide.elements, at, down)?.type, `${lang}/${id}`).toBe('image');
      }
    }
  });
});
