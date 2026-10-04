// @vitest-environment happy-dom
import { createElement } from '@slidr/model';
import {
  clipAttributes,
  CLIP_ATTRIBUTE as RENDERER_CLIP,
  CLIP_TOGGLE_ATTRIBUTE as RENDERER_TOGGLE,
} from '@slidr/renderer';
import {
  clipSettings,
  CLIP_ATTRIBUTE,
  CLIP_AUTOPLAY,
  CLIP_END,
  CLIP_LOOP,
  CLIP_START,
  CLIP_STILL,
  CLIP_TOGGLE_ATTRIBUTE,
} from '@slidr/runtime';
import { describe, expect, it } from 'vitest';
import { mediaUrl } from './exportHtml';

describe('video and audio in an exported file (MED-02, MED-03)', () => {
  it('holds the runtime and the renderer to one set of names for a clip', () => {
    // The runtime depends on nothing and repeats the names; this package has both.
    expect(CLIP_ATTRIBUTE).toBe(RENDERER_CLIP);
    expect(CLIP_TOGGLE_ATTRIBUTE).toBe(RENDERER_TOGGLE);
    const written = clipAttributes(
      createElement.video({
        frame: { x: 0, y: 0, w: 640, h: 360 },
        assetId: 'a'.repeat(64),
        autoplay: true,
        loop: true,
        trim: { startMs: 1500, endMs: 4000 },
        poster: { timeMs: 2500 },
      }),
    );
    expect(Object.keys(written).sort()).toEqual(
      [CLIP_ATTRIBUTE, CLIP_START, CLIP_END, CLIP_LOOP, CLIP_AUTOPLAY, CLIP_STILL].sort(),
    );
  });

  it('reads back in the runtime what the renderer wrote', () => {
    const element = createElement.video({
      frame: { x: 0, y: 0, w: 640, h: 360 },
      assetId: 'a'.repeat(64),
      autoplay: true,
      loop: true,
      trim: { startMs: 1500, endMs: 4000 },
      poster: { timeMs: 2500 },
    });
    const video = document.createElement('video');
    for (const [name, value] of Object.entries(clipAttributes(element))) {
      if (value !== undefined) video.setAttribute(name, value);
    }
    expect(clipSettings(video)).toEqual({
      start: 1.5,
      end: 4,
      loop: true,
      autoplay: true,
      still: 2.5,
    });
  });
});

describe('media beside the file (MED-05)', () => {
  it('is addressed relative to the file, with a folder name of any language', () => {
    const file = `${'a'.repeat(64)}.mp4`;
    expect(mediaUrl('deck_media', file)).toBe(`deck_media/${file}`);
    expect(mediaUrl('Road map 2027_media', file)).toBe(`Road%20map%202027_media/${file}`);
    const hebrew = mediaUrl('מצגת_media', file);
    expect(hebrew).toMatch(/^%D7%9E[%0-9A-F]+_media\/a{64}\.mp4$/);
    expect(decodeURIComponent(hebrew)).toBe(`מצגת_media/${file}`);
  });
});
