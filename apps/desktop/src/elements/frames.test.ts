import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement, ImageElement } from '@slidr/model';
import { presetPath } from '@slidr/renderer';
import { describe, expect, it } from 'vitest';
import {
  featuredFrames,
  FRAME_GROUPS,
  frameElement,
  frameLook,
  frameOutline,
  framePatch,
  framesOf,
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
  readFileSync(fileURLToPath(new URL('./frames-catalog.json', import.meta.url)), 'utf8'),
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
      type: 'shape',
      frame: { x: 0, y: 0, w: 400, h: 480 },
      fill: { kind: 'solid', color: { value: '#ffffff' } },
    });
    expect(instant.smartFrame?.decorations[0]?.effects?.shadow).toBeDefined();
    expect(instant.mask).toBeUndefined();
    // A screen with round corners cuts the photograph inside its opening.
    const phone = frameElement(frame('phone'), { x: 0, y: 0, w: 300, h: 610 });
    expect(phone.mask).toMatchObject({ kind: 'path', viewBox: { w: 272, h: 582 } });
    // Artwork in the colours of the theme follows the theme.
    const corners = frameElement(frame('corners'), { x: 0, y: 0, w: 520, h: 400 });
    expect(corners.smartFrame?.decorations[0]).toMatchObject({
      fill: { kind: 'solid', color: { token: 'primary' } },
    });
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
    expect(Object.keys(patch).sort()).toEqual(['fit', 'frame', 'mask', 'smartFrame']);
  });

  it('takes away what an earlier frame left', () => {
    const framed = photo(frameLook(frame('phone'), { w: 300, h: 610 }) as Partial<ImageElement>);
    expect(framed.smartFrame).toBeDefined();
    expect(framePatch(frame('square'), framed)).toMatchObject({ mask: null, smartFrame: null });
    // The screen of the phone cut the photograph round; the window of a card does not.
    expect(framePatch(frame('instant'), framed)).toMatchObject({ mask: null });
  });
});

describe('the search of frames', () => {
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
