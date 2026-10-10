import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  CommandBus,
  createDeck,
  createElement,
  createSlide,
  Element,
  ImageElement,
  imageOpening,
  plainText,
  richText,
  rotatedBounds,
  type GroupElement,
  type TextElement,
} from '@slidr/model';
import { presetPath } from '@slidr/renderer';
import { describe, expect, it } from 'vitest';
import {
  featuredFrames,
  FRAME_GROUPS,
  framedElement,
  framedPicture,
  frameElement,
  frameLook,
  frameOutline,
  framePatch,
  frameSizeOn,
  framesOf,
  freshFrame,
  MAGNET_SETS,
  reframe,
  searchFrames,
  type FramesCatalog,
  type PhotoFrame,
} from './frames';

/*
 * The catalogue of photo frames as it is checked in, and what a frame becomes on a slide. The
 * catalogue is read here from its file; the app reads the same file through the bundler, when
 * it first shows the frames (`frames.ts`).
 */

const catalog = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL('../../../../../Slidr-media/elements/catalogs/frames-catalog.json', import.meta.url),
    ),
    'utf8',
  ),
) as FramesCatalog;
const frames = framesOf(catalog);

const ids = (found: readonly { id: string }[]) => found.map(({ id }) => id);
const frame = (id: string): PhotoFrame => {
  const found = frames.find((one) => one.id === `frame:${id}`);
  if (!found) throw new Error(`no frame is called ${id}`);
  return found;
};

describe('the catalogue of frames', () => {
  it('has its groups in the order the panel shows them, none of them empty', () => {
    expect(catalog.groups.map(({ id }) => id)).toEqual([...FRAME_GROUPS]);
    for (const { frames: ofGroup } of catalog.groups) expect(ofGroup.length).toBeGreaterThan(5);
    expect(frames.length).toBeGreaterThan(250);
    expect(new Set(ids(frames)).size).toBe(frames.length);
  });

  it('names every frame in English and in Hebrew', () => {
    expect(ids(frames.filter((one) => !/[a-z]/i.test(one.label.en)))).toEqual([]);
    expect(ids(frames.filter((one) => !/\p{Script=Hebrew}/u.test(one.label.he)))).toEqual([]);
  });

  it('shows twenty frames first, plain ones and decorated ones, in the order it names them', () => {
    const featured = featuredFrames(frames);
    expect(ids(featured)).toEqual(catalog.featured.map((id) => `frame:${id}`));
    expect(featured).toHaveLength(20);
    expect(featured.filter((one) => one.art).length).toBeGreaterThan(5);
    expect(featured.filter((one) => !one.art).length).toBeGreaterThan(5);
  });

  it('has every letter of both alphabets, and every digit', () => {
    const count = (group: string) => frames.filter((one) => one.group === group).length;
    expect(count('hebrew')).toBe(27);
    expect(count('latin')).toBe(26);
    expect(ids(frames.filter((one) => /^frame:digit-\d$/.test(one.id)))).toHaveLength(10);
  });

  it('cuts by outlines that are whole, and by shapes the renderer draws', () => {
    for (const { id, mask, size } of frames) {
      if (mask?.kind === 'path') {
        expect(mask.d, id).toMatch(/^M[-\d. ]+[LC][-\d. LCMZ]+Z$/);
        expect(mask.viewBox, id).toEqual(size);
      }
      if (mask?.kind === 'shape') expect(presetPath(mask.preset, size.w, size.h), id).toBeDefined();
    }
    expect(frames.every((one) => frameOutline(one).length > 0)).toBe(true);
  });
});

describe('a frame on a slide', () => {
  const box = { x: 100, y: 100, w: 400, h: 400 };

  it('is a picture with no photograph yet, valid for the model, whatever the frame', () => {
    for (const one of frames) {
      const element = frameElement(one, { x: 0, y: 0, ...one.size });
      const parsed = ImageElement.safeParse(element);
      expect(parsed.success, `${one.id}: ${parsed.error?.message}`).toBe(true);
      expect(element.assetId).toBeUndefined();
      expect(element.name).toBe(one.id);
      expect(element.fit).toBe('cover');
    }
  });

  it('is cut by its outline, or by a mask of the model when the model has one for it', () => {
    expect(frameElement(frame('circle'), box).mask).toEqual({ kind: 'ellipse' });
    expect(frameElement(frame('hexagon'), box).mask).toEqual({ kind: 'shape', preset: 'hexagon' });
    expect(frameElement(frame('square'), box).mask).toBeUndefined();
    const heart = frameElement(frame('heart'), box);
    expect(heart.mask).toMatchObject({ kind: 'path', viewBox: frame('heart').size });
    expect(heart.smartFrame).toBeUndefined();
  });

  it('keeps the proportion of round corners in a box of another size', () => {
    const rounded = frame('rounded-square');
    expect(frameLook(rounded, rounded.size).mask).toEqual({ kind: 'rounded', radius: 72 });
    expect(frameLook(rounded, { w: 240, h: 240 }).mask).toEqual({ kind: 'rounded', radius: 36 });
  });

  it('carries the artwork of a decorated frame, around an opening for the photograph', () => {
    const instant = frameElement(frame('instant'), { x: 0, y: 0, w: 400, h: 480 });
    expect(instant.smartFrame?.viewBox).toEqual({ w: 400, h: 480 });
    expect(instant.smartFrame?.opening).toEqual({ x: 26, y: 26, w: 348, h: 348 });
    expect(instant.smartFrame?.decorations).toHaveLength(1);
    expect(instant.smartFrame?.decorations[0]).toMatchObject({
      type: 'svg',
      frame: { x: 0, y: 0, w: 400, h: 480 },
    });
    // The card casts its shadow as a whole, the photograph included: none falls on the photograph.
    expect(instant.effects?.shadow).toEqual(frame('instant').shadow);
    expect(instant.mask).toBeUndefined();
    // The body of a phone lies over the corners of its screen: the photograph is not cut.
    expect(frameElement(frame('phone'), { x: 0, y: 0, w: 300, h: 610 }).mask).toBeUndefined();
    // Where nothing lies over them, the frame cuts the photograph's corners itself.
    const soft = frameElement(frame('soft-line'), { x: 0, y: 0, w: 520, h: 400 });
    expect(soft.mask).toEqual({ kind: 'rounded', radius: 24 });
    const ring = frameElement(frame('round-ring'), { x: 0, y: 0, w: 480, h: 480 });
    expect(ring.mask).toMatchObject({ kind: 'path', viewBox: { w: 408, h: 408 } });
    // Artwork in the colours of the theme follows the theme.
    const corners = frameElement(frame('corners'), { x: 0, y: 0, w: 520, h: 400 });
    const [marks] = corners.smartFrame?.decorations ?? [];
    expect(marks?.type === 'svg' && marks.markup).toContain('fill:var(--color-primary)');
  });

  it('has artwork that lays itself out in a box of any size', () => {
    const decorated = frames.filter((one) => one.art);
    expect(decorated.length).toBeGreaterThan(40);
    for (const one of decorated) {
      // No `viewBox`: a unit of the drawing is a unit of the box it is drawn in.
      const root = /^<svg[^>]*>/.exec(one.art?.drawing ?? '')?.[0];
      expect(root, one.id).toBe('<svg xmlns="http://www.w3.org/2000/svg">');
      const { opening } = one.art!;
      expect(opening.x + opening.w, one.id).toBeLessThanOrEqual(one.size.w);
      expect(opening.y + opening.h, one.id).toBeLessThanOrEqual(one.size.h);
    }
  });

  it('draws the artwork as large as its box is when it is added, and no larger after', () => {
    const instant = frame('instant');
    expect(frameElement(instant, { x: 0, y: 0, w: 400, h: 480 }).smartFrame?.scale).toBe(1);
    // In a box twice the size the artwork is drawn twice as large.
    const large = frameElement(instant, { x: 0, y: 0, w: 800, h: 960 });
    expect(large.smartFrame?.scale).toBe(2);
    expect(imageOpening(large)).toEqual({ x: 52, y: 52, w: 696, h: 696 });
    // Made wider and higher by hand, the card around the photograph is as wide as it was.
    const wider = imageOpening({ ...large, frame: { x: 0, y: 0, w: 1200, h: 1000 } });
    expect(wider).toEqual({ x: 52, y: 52, w: 1096, h: 736 });
  });
});

describe('putting a picture in a frame', () => {
  const photo = (more: Partial<ImageElement> = {}) =>
    createElement.image({
      frame: { x: 200, y: 100, w: 800, h: 400 },
      assetId: 'a_photo',
      fit: 'contain',
      crop: { x: 0.1, y: 0, w: 0.8, h: 1 },
      ...more,
    });

  it('gives the picture the proportions of the frame, inside the box it had', () => {
    const patch = framePatch(frame('circle'), photo());
    // A circle as tall as the picture was, around the same centre.
    expect(patch.frame).toEqual({ x: 400, y: 100, w: 400, h: 400 });
    expect(patch).toMatchObject({ fit: 'cover', mask: { kind: 'ellipse' }, smartFrame: null });
    const tall = framePatch(frame('phone'), photo());
    expect(tall.frame).toEqual({ x: 502, y: 100, w: 197, h: 400 });
  });

  it('leaves the photograph, its crop and its adjustments as they are', () => {
    const patch = framePatch(frame('instant'), photo({ adjust: { brightness: 10 } }));
    expect(Object.keys(patch).sort()).toEqual(['effects', 'fit', 'frame', 'mask', 'smartFrame']);
  });

  it('gives the picture the shadow of its frame, and takes it away with the frame', () => {
    const shadow = frame('instant').shadow;
    expect(shadow).toBeDefined();
    const own = { x: 2, y: 2, blur: 4, color: { value: '#112233' } };
    // The frame's shadow comes in place of the picture's own; its other effects stay.
    const patch = framePatch(frame('instant'), photo({ effects: { shadow: own, radius: 8 } }));
    expect(patch.effects).toEqual({ shadow, radius: 8 });
    // In a frame that casts none, a bare picture keeps the shadow it was given.
    expect(framePatch(frame('line'), photo({ effects: { shadow: own } })).effects).toEqual({
      shadow: own,
    });
    // The shadow of the frame a picture was in goes with that frame.
    const framed = photo({
      ...(frameLook(frame('instant'), { w: 400, h: 480 }) as Partial<ImageElement>),
      effects: { shadow },
    });
    expect(framePatch(frame('line'), framed).effects).toBeNull();
    expect(framePatch(frame('circle'), framed).effects).toBeNull();
  });

  it('takes away what an earlier frame left', () => {
    const framed = photo(frameLook(frame('phone'), { w: 300, h: 610 }) as Partial<ImageElement>);
    expect(framed.smartFrame).toBeDefined();
    expect(framePatch(frame('square'), framed)).toMatchObject({ mask: null, smartFrame: null });
    const round = photo(frameLook(frame('soft-line'), { w: 520, h: 400 }) as Partial<ImageElement>);
    // The outline cut the photograph's corners round; the window of a card does not.
    expect(round.mask).toMatchObject({ kind: 'rounded' });
    expect(framePatch(frame('instant'), round)).toMatchObject({ mask: null });
  });
});

describe('a frame of an earlier catalogue on a slide', () => {
  /** A picture as the frames once made it: artwork of one size, with no scale. */
  const old = (id: string, more: Partial<ImageElement> = {}) => {
    const { size, art } = frame(id);
    return createElement.image({
      id: 'e_old',
      name: `frame:${id}`,
      frame: { x: 0, y: 0, ...size },
      mask: { kind: 'path', d: 'M0 0L10 0L10 10Z', viewBox: { w: 10, h: 10 } },
      smartFrame: { viewBox: { ...size }, opening: { ...art!.opening }, decorations: [] },
      ...more,
    });
  };
  /** What the fresh artwork changes of a picture: fields of the picture, `null` where one goes. */
  const look = (fresh: ReturnType<typeof freshFrame>, id = 'e_old') =>
    fresh?.get(id) as { [K in keyof ImageElement]?: ImageElement[K] | null } | undefined;

  it('takes the artwork its frame has now, as large as fits the box the picture has', () => {
    // Stretched to twice its width and three times its height: drawn twice as large.
    const stretched = old('instant', { frame: { x: 40, y: 40, w: 800, h: 1440 } });
    const fresh = look(freshFrame(stretched, frames));
    expect(fresh?.smartFrame).toMatchObject({ viewBox: { w: 400, h: 480 }, scale: 2 });
    expect(fresh?.smartFrame?.decorations).toMatchObject([{ type: 'svg' }]);
    // The card lies over the photograph's corners now: the old cut goes, and the card casts
    // the shadow that a layer of the old artwork did.
    expect(fresh?.mask).toBeNull();
    expect(fresh?.effects).toEqual({ shadow: frame('instant').shadow });
    expect(fresh).not.toHaveProperty('frame');
  });

  it('is told by its name, or by artwork that only one frame has', () => {
    // A picture of the user's own that was put into a frame keeps its own name.
    const named = (id: string) => freshFrame(old(id, { name: 'Holiday' }), frames);
    expect(look(named('phone'))?.smartFrame).toMatchObject({ scale: 1 });
    // The wooden frame and the gold one have one box and one opening: which it was is not known.
    expect(named('wood')).toBeUndefined();
    expect(look(freshFrame(old('wood'), frames))?.smartFrame).toBeDefined();
    // Nothing to do for artwork of the catalogue as it is, a bare picture, or without the frames.
    const current = frameElement(frame('instant'), { x: 0, y: 0, w: 400, h: 480 });
    expect(freshFrame(current, frames)).toBeUndefined();
    expect(freshFrame(createElement.image({ frame: { x: 0, y: 0, w: 9, h: 9 } }), frames)).toBe(
      undefined,
    );
    expect(freshFrame(old('instant'), [])).toBeUndefined();
  });

  it('gives a magnet its card again, and its stickers the size the frame draws them', () => {
    const summer = frame('magnet-summer');
    const added = framedElement(summer, { x: 0, y: 0, ...summer.size }, 'he') as GroupElement;
    const [picture, sun, ...rest] = added.children as [ImageElement, ...GroupElement['children']];
    // As the old code left it after a stretch to twice the width: the sun twice as wide.
    const wide = {
      ...added,
      frame: { x: 0, y: 0, w: 2100, h: 750 },
      children: [
        { ...old('magnet-summer', { id: picture.id }), frame: { x: 0, y: 0, w: 2100, h: 750 } },
        { ...sun!, frame: { x: 1696, y: 16, w: 368, h: 184 } },
        ...rest,
      ],
    } as GroupElement;
    const fresh = freshFrame(wide, frames);
    expect(look(fresh, picture.id)?.smartFrame).toMatchObject({ scale: 1 });
    // In a group the group casts the shadow, and the picture none.
    expect(look(fresh, picture.id)?.effects).toBeNull();
    // The sun is as large as the frame draws it, about the middle it had.
    expect(fresh?.get(sun!.id)).toEqual({ frame: { x: 1788, y: 16, w: 184, h: 184 } });
    // Every sticker is given its size, and the caption is left as it is.
    expect([...(fresh?.keys() ?? [])].sort()).toEqual(
      [picture.id, ...added.children.filter((c) => c.type === 'svg').map((c) => c.id)].sort(),
    );
  });

  it('leaves a magnet whose frame has since moved a part of its card onto a label', () => {
    // The birthday magnet once drew its ribbon on its card, under a caption of the group. Its
    // card has no ribbon now: the ribbon is a label. The earlier group keeps the card it has.
    const birthday = frame('magnet-birthday');
    const caption = createElement.text({
      name: 'frame:magnet-birthday:caption',
      frame: { x: 240, y: 634, w: 570, h: 64 },
      content: richText('יום הולדת שמח, נועה!'),
    });
    const earlier = createElement.group({
      name: birthday.id,
      frame: { x: 0, y: 0, ...birthday.size },
      children: [old('magnet-birthday'), caption],
    });
    expect(freshFrame(earlier, frames)).toBeUndefined();
    // With the label beside it, the picture is of the frame as it is now.
    const now = framedElement(birthday, { x: 0, y: 0, ...birthday.size }, 'he') as GroupElement;
    const aged = {
      ...now,
      children: now.children.map((child) =>
        child.type === 'image' ? { ...old('magnet-birthday'), id: child.id } : child,
      ),
    } as GroupElement;
    expect(freshFrame(aged, frames)).toBeDefined();
  });
});

describe('the magnets of events', () => {
  const magnets = frames.filter((one) => one.group === 'magnets');
  const group = (one: PhotoFrame, lang = 'he', box = { x: 0, y: 0, ...one.size }) =>
    framedElement(one, box, lang) as GroupElement;
  /** The lines of words of a magnet: its captions, and those on its labels. */
  const captions = (element: GroupElement) =>
    element.children
      .flatMap((child) => (child.type === 'group' ? child.children : [child]))
      .filter((child): child is TextElement => child.type === 'text');
  const said = (element: GroupElement) => captions(element).map((one) => plainText(one.content));
  const extras = magnets.flatMap((one) => (one.extras ?? []).map((extra) => ({ one, extra })));

  it('are a hundred, in the sets the panel shows them by', () => {
    expect(magnets).toHaveLength(100);
    expect(MAGNET_SETS.map((set) => magnets.filter((one) => one.set === set).length)).toEqual([
      13, 11, 11, 11, 12, 12, 14, 16,
    ]);
    // In the catalogue they are set by set, as the panel shows them.
    const order = magnets.map((one) => MAGNET_SETS.indexOf(one.set!));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    // Every one is 7 by 5, lying or upright.
    for (const one of magnets) {
      expect(
        [one.size.w, one.size.h].sort((a, b) => a - b),
        one.id,
      ).toEqual([750, 1050]);
    }
  });

  it('are each a card drawn whole, with words and drawings of its own beside its picture', () => {
    for (const one of magnets) {
      expect(one.art?.drawing, one.id).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
      expect(captions(group(one)).length, one.id).toBeGreaterThan(0);
      for (const extra of one.extras ?? []) {
        if (extra.kind !== 'caption') {
          expect(extra.markup, `${one.id} ${extra.art}`).toMatch(/^<svg/);
        }
      }
    }
    // The stickers are in the catalogue once, whatever number of magnets has them.
    expect(Object.keys(catalog.stickers ?? {}).length).toBeGreaterThan(20);
    // The three kinds of things a magnet puts beside its picture are all in use.
    expect(new Set(extras.map(({ extra }) => extra.kind))).toEqual(
      new Set(['sticker', 'caption', 'label']),
    );
  });

  it('go onto a slide as a group: the picture, and around it elements of their own', () => {
    for (const one of magnets) {
      const element = group(one);
      const parsed = Element.safeParse(element);
      expect(parsed.success, `${one.id}: ${parsed.error?.message}`).toBe(true);
      expect(element).toMatchObject({ type: 'group', name: one.id, frame: { ...one.size } });
      expect(element.effects?.shadow, one.id).toBeDefined();
      // The picture takes the whole of the group, and carries the card as its artwork.
      const picture = framedPicture(element)!;
      expect(picture).toMatchObject({ type: 'image', frame: { x: 0, y: 0, ...one.size } });
      expect(picture.assetId).toBeUndefined();
      expect(picture.smartFrame?.decorations.at(-1)?.type).toBe('svg');
      // What lies under the picture comes before it in the group, and the rest after it.
      const under = (one.extras ?? []).filter((extra) => extra.under).length;
      expect(element.children.indexOf(picture), one.id).toBe(under);
      const beside = element.children.filter((child) => child !== picture);
      expect(beside).toHaveLength(one.extras?.length ?? 0);
      for (const child of beside) {
        expect(['svg', 'text', 'group'], one.id).toContain(child.type);
        expect(child.name?.startsWith(`${one.id}:`), one.id).toBe(true);
        // Nothing reaches out of the card, so the group is as large as the card.
        const { x, y, w, h } = rotatedBounds(child.frame, child.rotation);
        expect(x, `${one.id} ${child.name}`).toBeGreaterThanOrEqual(0);
        expect(y, `${one.id} ${child.name}`).toBeGreaterThanOrEqual(0);
        expect(x + w, `${one.id} ${child.name}`).toBeLessThanOrEqual(one.size.w);
        expect(y + h, `${one.id} ${child.name}`).toBeLessThanOrEqual(one.size.h);
      }
    }
  });

  it('leave the middle of the photograph to the photograph', () => {
    for (const { one, extra } of extras) {
      if (extra.under) continue;
      const opening = one.art!.opening;
      const [mx, my] = [opening.x + opening.w / 2, opening.y + opening.h / 2];
      const { x, y, w, h } = rotatedBounds(extra, extra.rotation ?? 0);
      const over = mx > x && mx < x + w && my > y && my < y + h;
      const name = extra.kind === 'caption' ? extra.en.text : extra.art;
      expect(over, `${one.id} ${name}`).toBe(false);
    }
  });

  it('put a label on the slide as a group of its own: a plate, and its words on it', () => {
    const birthday = group(frame('magnet-birthday'));
    const ribbon = birthday.children.find(
      (child) => child.name === 'frame:magnet-birthday:label:ribbon-rose',
    ) as GroupElement;
    expect(ribbon).toMatchObject({ type: 'group', rotation: -3 });
    const [plate, words] = ribbon.children;
    // The plate is the whole of the label, and is no part of the card any more.
    expect(plate).toMatchObject({
      type: 'svg',
      name: 'frame:magnet-birthday:ribbon-rose',
      frame: { x: 0, y: 0, w: ribbon.frame.w, h: ribbon.frame.h },
    });
    expect(frame('magnet-birthday').art?.drawing).not.toContain('id="ribbon"');
    expect(words).toMatchObject({ type: 'text', name: 'frame:magnet-birthday:caption' });
    expect(said(birthday)).toEqual(['יום הולדת שמח, נועה!']);
    // The words of every label lie on its plate.
    for (const one of magnets) {
      for (const label of group(one).children) {
        if (label.type !== 'group') continue;
        expect(label.children[0]?.type, one.id).toBe('svg');
        expect(label.children.length, one.id).toBeGreaterThan(1);
        for (const line of label.children.slice(1)) {
          const { x, y, w, h } = line.frame;
          expect(line.type, `${one.id} ${label.name}`).toBe('text');
          expect(x >= 0 && y >= 0, `${one.id} ${label.name}`).toBe(true);
          expect(x + w, `${one.id} ${label.name}`).toBeLessThanOrEqual(label.frame.w);
          expect(y + h, `${one.id} ${label.name}`).toBeLessThanOrEqual(label.frame.h);
        }
      }
    }
  });

  it('say their captions in the language of the deck, each on one line that its box holds', () => {
    for (const one of magnets) {
      for (const caption of captions(group(one, 'he'))) {
        // A numeral, a time or a code is the same in both languages.
        const words = plainText(caption.content);
        if (/\p{L}/u.test(words.replace(/[A-Za-z]/g, ''))) {
          expect(words, one.id).toMatch(/\p{Script=Hebrew}/u);
        }
      }
      for (const lang of ['he', 'en']) {
        // On a slide a magnet is as large as the safe margins allow: no type there is too small.
        const landed = frameSizeOn(one, { w: 1920, h: 1080 });
        for (const caption of captions(group(one, lang, { x: 0, y: 0, ...landed }))) {
          const words = plainText(caption.content);
          if (lang === 'en') expect(words, one.id).not.toMatch(/\p{Script=Hebrew}/u);
          expect(caption).toMatchObject({ wrap: false, autoFit: 'shrink', vAlign: 'middle' });
          const [paragraph] = caption.content.paragraphs;
          const size = paragraph?.runs[0]?.marks?.size ?? 0;
          expect(size, `${one.id} ${lang} ${words}`).toBeGreaterThanOrEqual(24);
          expect(size * (paragraph?.lineHeight ?? 0), `${one.id} ${lang}`).toBeLessThanOrEqual(
            caption.frame.h + 1,
          );
        }
      }
    }
    // Letters painted in turn: one run for each, and the space between words takes no colour.
    const [painted] = captions(group(frame('magnet-kids'), 'en'));
    const runs = painted?.content.paragraphs[0]?.runs ?? [];
    expect(runs.map((run) => run.text).join('')).toBe('Kindergarten Party');
    expect(new Set(runs.map((run) => JSON.stringify(run.marks?.color))).size).toBeGreaterThan(3);
  });

  it('set a line to one side of its box, the same side in both languages', () => {
    const sided = extras.find(
      ({ extra }) =>
        extra.kind === 'caption' &&
        extra.align === 'left' &&
        !extra.under &&
        /\p{Script=Hebrew}/u.test(extra.he.text),
    );
    expect(sided).toBeDefined();
    const { one, extra } = sided!;
    const over = (one.extras ?? []).filter((each) => !each.under);
    const line = (lang: string) => {
      const element = group(one, lang);
      const picture = element.children.indexOf(framedPicture(element)!);
      return element.children[picture + 1 + over.indexOf(extra)] as TextElement;
    };
    // The left is the end of a line of Hebrew and the start of a line of English.
    expect(line('he').content.paragraphs[0]).toMatchObject({ dir: 'rtl', align: 'end' });
    expect(line('en').content.paragraphs[0]).toMatchObject({ dir: 'ltr', align: 'start' });
  });

  it('reads words with no Hebrew letter from the left in a Hebrew deck too', () => {
    const coded = extras.filter(
      ({ extra }) => extra.kind === 'caption' && !/\p{Script=Hebrew}/u.test(extra.he.text),
    );
    const lines = magnets.flatMap((one) => captions(group(one, 'he')));
    const bare = lines.filter((one) => !/\p{Script=Hebrew}/u.test(plainText(one.content)));
    expect(bare.length).toBeGreaterThanOrEqual(coded.length);
    for (const one of bare)
      expect(one.content.paragraphs[0]?.dir, plainText(one.content)).toBe('ltr');
    for (const one of lines) {
      if (bare.includes(one)) continue;
      expect(one.content.paragraphs[0]?.dir, plainText(one.content)).toBe('rtl');
    }
  });

  it('come as large as the safe margins of the slide allow, and scale with their box', () => {
    const slide = { w: 1920, h: 1080 };
    expect(frameSizeOn(frame('magnet-summer'), slide)).toEqual({ w: 1288, h: 920 });
    expect(frameSizeOn(frame('magnet-wedding'), slide)).toEqual({ w: 657, h: 920 });
    // A frame without a caption comes at its own size.
    expect(frameSizeOn(frame('instant'), slide)).toEqual({ w: 400, h: 480 });

    const summer = frame('magnet-summer');
    const [whole] = captions(group(summer, 'he'));
    const [half] = captions(group(summer, 'he', { x: 0, y: 0, w: 525, h: 375 }));
    const sizeOf = (caption?: TextElement) => caption?.content.paragraphs[0]?.runs[0]?.marks?.size;
    expect(sizeOf(whole)).toBe(100);
    expect(sizeOf(half)).toBe(50);
    expect(half?.frame.w).toBe(Math.round((whole?.frame.w ?? 0) / 2));
  });

  describe('around a picture of the slide', () => {
    const photo = () =>
      createElement.image({
        id: 'e_photo',
        frame: { x: 200, y: 100, w: 1050, h: 900 },
        assetId: 'a_photo',
        fit: 'contain',
        rotation: 10,
        crop: { x: 0.1, y: 0, w: 0.8, h: 1 },
      });
    const busOf = (...elements: Element[]) => {
      const slide = createSlide({ id: 's_one', elements });
      return new CommandBus(createDeck({ lang: 'he', slides: [slide] }));
    };
    const slideOf = (bus: CommandBus) => bus.deck.slides[0]!;
    /** Puts the picture of the slide in a frame, and gives back what is selected after it. */
    const put = (bus: CommandBus, id: string) => {
      const slide = slideOf(bus);
      const picture = slide.elements.map(framedPicture).find(Boolean)!;
      const { command, select } = reframe(slide, picture, frame(id), 'he', frames);
      bus.dispatch(command);
      return slideOf(bus).elements.find((one) => one.id === select)!;
    };

    it('puts the picture in a group of the magnet, in its place and at its turn', () => {
      const bus = busOf(photo());
      const made = put(bus, 'magnet-summer') as GroupElement;
      expect(slideOf(bus).elements).toHaveLength(1);
      // As large as fits the box the picture had, around the same centre.
      expect(made).toMatchObject({
        type: 'group',
        name: 'frame:magnet-summer',
        frame: { x: 200, y: 175, w: 1050, h: 750 },
        rotation: 10,
      });
      expect(made.effects?.shadow).toBeDefined();
      const picture = framedPicture(made)!;
      expect(picture).toMatchObject({
        id: 'e_photo',
        assetId: 'a_photo',
        crop: { x: 0.1, y: 0, w: 0.8, h: 1 },
        fit: 'cover',
        rotation: 0,
        frame: { x: 0, y: 0, w: 1050, h: 750 },
      });
      expect(picture.smartFrame?.viewBox).toEqual({ w: 1050, h: 750 });
      expect(said(made)).toEqual(['יום הגיבוש שלנו']);
      bus.undo();
      expect(slideOf(bus).elements).toEqual([photo()]);
    });

    it('changes one magnet for another, and keeps a caption that was typed over', () => {
      const bus = busOf(photo());
      const first = put(bus, 'magnet-party') as GroupElement;
      expect(said(first)).toEqual(['לילה שלא נשכח', 'רוקדים עד הבוקר']);
      const [title] = captions(first);
      bus.dispatch({
        type: 'element.update',
        slideId: 's_one',
        elementId: title!.id,
        patch: { content: richText('החתונה של דנה ועומר') },
      });
      // The first caption was typed over and stays; the second gives way to the new frame's own.
      const second = put(bus, 'magnet-wedding') as GroupElement;
      expect(second.id).toBe(first.id);
      expect(second.name).toBe('frame:magnet-wedding');
      expect(said(second)).toEqual(['החתונה של דנה ועומר', 'תודה שחגגתם איתנו']);
      expect(framedPicture(second)?.id).toBe('e_photo');
      // Nothing of the first magnet is left beside the picture.
      expect(
        second.children.filter((child) => child.name?.startsWith('frame:magnet-party')),
      ).toEqual([]);
      expect(Element.safeParse(second).success).toBe(true);
    });

    it('carries words that were typed onto the label of the next magnet', () => {
      const bus = busOf(photo());
      const first = put(bus, 'magnet-party') as GroupElement;
      bus.dispatch({
        type: 'element.update',
        slideId: 's_one',
        elementId: captions(first)[0]!.id,
        patch: { content: richText('רוני בת 30') },
      });
      // The birthday magnet says its words on a ribbon: the words typed are on the ribbon now.
      const second = put(bus, 'magnet-birthday') as GroupElement;
      const ribbon = second.children.find((child) => child.type === 'group') as GroupElement;
      expect(ribbon.name).toBe('frame:magnet-birthday:label:ribbon-rose');
      expect(said(second)).toEqual(['רוני בת 30']);
      // And from the ribbon back onto a caption that stands alone.
      const third = put(bus, 'magnet-summer') as GroupElement;
      expect(third.children.some((child) => child.type === 'group')).toBe(false);
      expect(said(third)).toEqual(['רוני בת 30']);
      expect(Element.safeParse(third).success).toBe(true);
    });

    it('takes the picture out of its group for a frame that is a picture alone', () => {
      const bus = busOf(photo());
      const made = put(bus, 'magnet-summer');
      const alone = put(bus, 'circle') as ImageElement;
      expect(slideOf(bus).elements).toHaveLength(1);
      expect(alone).toMatchObject({
        id: 'e_photo',
        type: 'image',
        assetId: 'a_photo',
        mask: { kind: 'ellipse' },
        rotation: 10,
        // A circle as tall as the magnet was, around its centre.
        frame: { x: 350, y: 175, w: 750, h: 750 },
      });
      expect(alone.smartFrame).toBeUndefined();
      expect(alone.id).not.toBe(made.id);
    });

    it('is the change of a picture alone between two frames that are pictures alone', () => {
      const slide = createSlide({ id: 's_one', elements: [photo()] });
      const { command, select } = reframe(slide, photo(), frame('circle'), 'he', frames);
      expect(command).toMatchObject({ type: 'element.update', elementId: 'e_photo' });
      expect(select).toBe('e_photo');
    });
  });
});

describe('the search of frames', () => {
  it('finds a magnet by the event it is for, in both languages', () => {
    expect(ids(searchFrames(frames, 'חתונה', 8))).toContain('frame:magnet-wedding');
    expect(ids(searchFrames(frames, 'birthday', 20))).toContain('frame:magnet-birthday');
    expect(ids(searchFrames(frames, 'מגנט', 200))).toHaveLength(100);
    // Every magnet is found by words of its own, in both languages.
    for (const one of frames.filter((each) => each.group === 'magnets')) {
      expect(one.tagWords.length, one.id).toBeGreaterThan(1);
      expect(one.tagHebrew.length, one.id).toBeGreaterThan(1);
    }
  });

  it('finds a frame by its name and by other words for it, in both languages', () => {
    expect(ids(searchFrames(frames, 'heart', 3))[0]).toBe('frame:heart');
    expect(ids(searchFrames(frames, 'לב', 3))[0]).toBe('frame:heart');
    expect(ids(searchFrames(frames, 'polaroid', 5))).toContain('frame:instant');
    expect(ids(searchFrames(frames, 'פולרואיד', 5))).toContain('frame:instant');
    expect(ids(searchFrames(frames, 'טלפון', 3))[0]).toBe('frame:phone');
    expect(searchFrames(frames, 'qqqzzz', 5)).toEqual([]);
  });

  it('finds a letter by the letter itself', () => {
    expect(ids(searchFrames(frames, 'א', 3))[0]).toBe('frame:he-alef');
    expect(ids(searchFrames(frames, 'b', 40))).toContain('frame:letter-b');
    expect(ids(searchFrames(frames, '7', 5))).toContain('frame:digit-7');
  });
});
