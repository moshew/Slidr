// @vitest-environment happy-dom
import {
  createDeck,
  createElement,
  createSlide,
  type AssetMeta,
  type AudioElement,
  type Deck,
  type Element,
  type VideoElement,
} from '@slidr/model';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clipAttributes, nativeLoop, showsMark, stillFrame, videoSource } from './clip';
import type { RenderMode } from './context';
import { SlideRenderer } from './SlideRenderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CLIP = 'a'.repeat(64);
const SOUND = 'b'.repeat(64);
const PICTURE = 'c'.repeat(64);
const frame = { x: 0, y: 0, w: 640, h: 360 };

const video = (extra: Partial<VideoElement> = {}): VideoElement =>
  createElement.video({ id: 'e_video', frame, assetId: CLIP, ...extra });
const audio = (extra: Partial<AudioElement> = {}): AudioElement =>
  createElement.audio({
    id: 'e_audio',
    frame: { x: 0, y: 400, w: 320, h: 80 },
    assetId: SOUND,
    ...extra,
  });

const asset = (id: string, kind: AssetMeta['kind'], ext: string, mime: string): AssetMeta => ({
  id,
  file: `${id}.${ext}`,
  mime,
  kind,
  bytes: 1000,
  origin: 'upload',
});

function deckOf(...elements: Element[]): Deck {
  const deck = createDeck({ slides: [createSlide({ id: 's_1', elements })] });
  return {
    ...deck,
    assets: {
      [CLIP]: asset(CLIP, 'video', 'webm', 'video/webm'),
      [SOUND]: asset(SOUND, 'audio', 'wav', 'audio/wav'),
      [PICTURE]: asset(PICTURE, 'image', 'png', 'image/png'),
    },
  };
}

describe('what the renderer writes on a clip', () => {
  it('carries the trim in seconds, the loop and how the clip starts', () => {
    expect(
      clipAttributes(video({ trim: { startMs: 1500, endMs: 4250 }, loop: true, autoplay: true })),
    ).toEqual({
      'data-slidr-clip': 'video',
      'data-clip-start': '1.5',
      'data-clip-end': '4.25',
      'data-clip-loop': '',
      'data-clip-autoplay': '',
      'data-clip-still': undefined,
    });
  });

  it('says nothing of what a clip does not have', () => {
    expect(clipAttributes(audio())).toEqual({
      'data-slidr-clip': 'audio',
      'data-clip-start': undefined,
      'data-clip-end': undefined,
      'data-clip-loop': undefined,
      'data-clip-autoplay': undefined,
      'data-clip-still': undefined,
    });
  });

  it('names the frame a video waits at only when one was chosen', () => {
    expect(clipAttributes(video({ poster: { timeMs: 2500 } }))['data-clip-still']).toBe('2.5');
    expect(clipAttributes(video({ poster: { timeMs: 0 } }))['data-clip-still']).toBe('0');
    expect(
      clipAttributes(video({ poster: { assetId: PICTURE } }))['data-clip-still'],
    ).toBeUndefined();
  });
});

describe('the still frame of a video', () => {
  it('is the chosen frame, else the start of the trim, else the start of the file', () => {
    expect(
      stillFrame(video({ poster: { timeMs: 2500 }, trim: { startMs: 1000, endMs: 3000 } })),
    ).toBe(2500);
    expect(stillFrame(video({ trim: { startMs: 1000, endMs: 3000 } }))).toBe(1000);
    expect(stillFrame(video())).toBe(0);
  });

  it('is asked of the browser with a media fragment, which a picture poster must not have', () => {
    expect(videoSource(video({ poster: { timeMs: 2500 } }), 'clip.webm')).toBe('clip.webm#t=2.5');
    expect(videoSource(video({ trim: { startMs: 1000, endMs: 3000 } }), 'clip.webm')).toBe(
      'clip.webm#t=1',
    );
    expect(videoSource(video(), 'clip.webm')).toBe('clip.webm');
    // A browser that seeks to a fragment drops the poster picture.
    expect(
      videoSource(
        video({ poster: { assetId: PICTURE }, trim: { startMs: 1000, endMs: 3000 } }),
        'clip.webm',
      ),
    ).toBe('clip.webm');
  });
});

describe('who brings a clip round', () => {
  it('is the browser only for a clip that is not trimmed', () => {
    expect(nativeLoop(video({ loop: true }))).toBe(true);
    expect(nativeLoop(video({ loop: true, trim: { startMs: 0, endMs: 2000 } }))).toBe(false);
    expect(nativeLoop(video())).toBe(false);
  });
});

describe('the mark of a sound in a show', () => {
  it('is there only for a sound that waits for a click and has no controls', () => {
    expect(showsMark(audio({ showControls: false, autoplay: false }))).toBe(true);
    expect(showsMark(audio({ showControls: true, autoplay: false }))).toBe(false);
    expect(showsMark(audio({ showControls: false, autoplay: true }))).toBe(false);
  });
});

describe('a video and a sound as the renderer draws them', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function draw(mode: RenderMode, ...elements: Element[]) {
    const deck = deckOf(...elements);
    act(() =>
      root.render(
        <SlideRenderer
          deck={deck}
          slide={deck.slides[0]!}
          mode={mode}
          resolveAsset={(meta) => `assets/${meta.file}`}
        />,
      ),
    );
    return {
      video: container.querySelector('video'),
      audio: container.querySelector('audio'),
      mark: container.querySelector<HTMLElement>('[data-slidr-clip-toggle]'),
    };
  }

  it('draws the same clip in every mode, and never one that plays by itself', () => {
    const element = video({
      autoplay: true,
      loop: true,
      trim: { startMs: 1000, endMs: 3000 },
      poster: { timeMs: 2000 },
    });
    for (const mode of ['edit', 'thumbnail', 'present'] as const) {
      const drawn = draw(mode, element).video!;
      // Nothing starts a clip but the runtime: not the browser's `autoplay`, not its `loop`.
      expect(drawn.hasAttribute('autoplay'), mode).toBe(false);
      expect(drawn.hasAttribute('loop'), mode).toBe(false);
      expect(drawn.getAttribute('data-clip-start'), mode).toBe('1');
      expect(drawn.getAttribute('data-clip-end'), mode).toBe('3');
      expect(drawn.hasAttribute('data-clip-loop'), mode).toBe(true);
      expect(drawn.hasAttribute('data-clip-autoplay'), mode).toBe(true);
      expect(drawn.hasAttribute('controls'), mode).toBe(false);
    }
  });

  it('asks the browser for the still frame only where no player is there to show it', () => {
    const element = video({ trim: { startMs: 1000, endMs: 3000 }, poster: { timeMs: 2000 } });
    expect(draw('edit', element).video!.getAttribute('src')).toBe(`assets/${CLIP}.webm#t=2`);
    expect(draw('thumbnail', element).video!.getAttribute('src')).toBe(`assets/${CLIP}.webm#t=2`);
    // In a show, and in the file an export writes from it, the address is the file's alone.
    expect(draw('present', element).video!.getAttribute('src')).toBe(`assets/${CLIP}.webm`);
    expect(draw('present', element).video!.getAttribute('data-clip-still')).toBe('2');
  });

  it('keeps a video silent outside a show, and as it is set in one', () => {
    expect(draw('edit', video()).video!.muted).toBe(true);
    expect(draw('thumbnail', video()).video!.muted).toBe(true);
    expect(draw('present', video()).video!.muted).toBe(false);
    expect(draw('present', video({ muted: true })).video!.muted).toBe(true);
  });

  it('gives a video its poster picture, and then no fragment', () => {
    const drawn = draw('present', video({ poster: { assetId: PICTURE } })).video!;
    expect(drawn.getAttribute('poster')).toBe(`assets/${PICTURE}.png`);
    expect(drawn.getAttribute('src')).toBe(`assets/${CLIP}.webm`);
  });

  it('lets the pointer reach a video only in a show, where a click plays it', () => {
    expect(draw('edit', video()).video!.style.pointerEvents).toBe('none');
    const shown = draw('present', video()).video!;
    expect(shown.style.pointerEvents).toBe('auto');
    expect(shown.style.cursor).toBe('pointer');
  });

  it('draws a sound in the editor as its mark, with the sound beside it to play in place', () => {
    const drawn = draw('edit', audio({ trim: { startMs: 500, endMs: 900 } }));
    expect(drawn.mark).not.toBeNull();
    expect(drawn.audio!.style.display).toBe('none');
    expect(drawn.audio!.hasAttribute('controls')).toBe(false);
    // Not read until it is played.
    expect(drawn.audio!.getAttribute('preload')).toBe('none');
    expect(drawn.audio!.getAttribute('data-clip-start')).toBe('0.5');
    // The same parent: that is how the runtime finds the sound of a mark.
    expect(drawn.mark!.parentElement).toBe(drawn.audio!.parentElement);
  });

  it('draws only the mark in a thumbnail, which never plays', () => {
    const drawn = draw('thumbnail', audio());
    expect(drawn.mark).not.toBeNull();
    expect(drawn.audio).toBeNull();
  });

  it('shows the controls of a sound in a show, and no mark', () => {
    const drawn = draw('present', audio({ showControls: true }));
    expect(drawn.mark).toBeNull();
    expect(drawn.audio!.hasAttribute('controls')).toBe(true);
    expect(drawn.audio!.style.display).toBe('block');
  });

  it('shows the mark of a sound that waits for a click and has no controls, to be clicked', () => {
    const drawn = draw('present', audio({ showControls: false, name: 'Applause' }));
    expect(drawn.mark!.getAttribute('role')).toBe('button');
    expect(drawn.mark!.getAttribute('aria-label')).toBe('Applause');
    expect(drawn.mark!.style.pointerEvents).toBe('auto');
    expect(drawn.audio!.style.display).toBe('none');
  });

  it('shows nothing of a sound that starts by itself and has no controls', () => {
    const drawn = draw('present', audio({ showControls: false, autoplay: true }));
    expect(drawn.mark).toBeNull();
    expect(drawn.audio!.style.display).toBe('none');
    expect(drawn.audio!.hasAttribute('data-clip-autoplay')).toBe(true);
  });

  it('leaves the loop of a clip that is not trimmed to the browser', () => {
    expect(draw('present', audio({ loop: true })).audio!.hasAttribute('loop')).toBe(true);
    expect(
      draw('present', audio({ loop: true, trim: { startMs: 0, endMs: 500 } })).audio!.hasAttribute(
        'loop',
      ),
    ).toBe(false);
  });
});
