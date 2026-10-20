import type { AssetMeta } from '@slidr/model';
import { describe, expect, it } from 'vitest';
import { elementForAsset, insertAssetsCommands } from './insert';

const SLIDE = { w: 1920, h: 1080 };
const photo: AssetMeta = {
  id: 'a'.repeat(64),
  file: 'a.jpg',
  mime: 'image/jpeg',
  kind: 'image',
  bytes: 10,
  origin: 'upload',
  width: 4000,
  height: 3000,
  name: 'beach.jpg',
};

describe('elementForAsset', () => {
  it('scales a large picture to 60% of the slide, centred on the drop point and kept on the slide', () => {
    const e = elementForAsset(photo, SLIDE, { x: 1900, y: 540 });
    expect(e).toMatchObject({
      type: 'image',
      name: 'beach',
      alt: 'beach',
      assetId: photo.id,
      fit: 'cover',
    });
    expect(e?.frame).toEqual({ x: 1056, y: 216, w: 864, h: 648 });
  });

  it('keeps a small picture at its own size', () => {
    const e = elementForAsset({ ...photo, width: 200, height: 100 }, SLIDE, { x: 500, y: 500 });
    expect(e?.frame).toEqual({ x: 400, y: 450, w: 200, h: 100 });
  });

  it('makes video and audio elements, and nothing for other files', () => {
    expect(elementForAsset({ ...photo, kind: 'video' }, SLIDE, { x: 960, y: 540 })?.type).toBe(
      'video',
    );
    expect(elementForAsset({ ...photo, kind: 'audio' }, SLIDE, { x: 960, y: 540 })?.frame.w).toBe(
      320,
    );
    expect(elementForAsset({ ...photo, kind: 'font' }, SLIDE, { x: 960, y: 540 })).toBeUndefined();
  });
});

describe('insertAssetsCommands', () => {
  it('registers new assets once and fans out several files', () => {
    const second = { ...photo, id: 'b'.repeat(64), width: 100, height: 100 };
    const { commands, elementIds } = insertAssetsCommands(
      's_1',
      [photo, second],
      SLIDE,
      { x: 500, y: 500 },
      (id) => id === photo.id,
    );
    expect(commands.map((c) => c.type)).toEqual(['element.add', 'asset.add', 'element.add']);
    expect(elementIds).toHaveLength(2);
  });
});
