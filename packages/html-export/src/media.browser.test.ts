import { createDeck, createElement, createSlide, type AssetMeta, type Deck } from '@slidr/model';
// The recorder of the runtime's own browser tests: one way to make media for a test.
import { recordClip, toneWav } from '../../runtime/src/testing/recordedClip';
import { beforeAll, describe, expect, test, vi } from 'vitest';
import { exportHtml } from './exportHtml';

// A deck with a real video and a real sound, exported in the engine WebView2 uses: what goes
// into the file, and what stays beside it (MED-05). How the file then plays is the business of
// the end-to-end suite (apps/desktop/e2e/video-present.spec.ts), which opens it from the disk.

const VIDEO = 'a'.repeat(64);
const SOUND = 'b'.repeat(64);
const PICTURE = 'c'.repeat(64);

let files: Record<string, Blob>;
let deck: Deck;

async function picture(): Promise<Blob> {
  const canvas = new OffscreenCanvas(64, 36);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('no 2d context');
  context.fillStyle = 'teal';
  context.fillRect(0, 0, 64, 36);
  return canvas.convertToBlob({ type: 'image/png' });
}

const asset = (id: string, kind: AssetMeta['kind'], ext: string, blob: Blob): AssetMeta => ({
  id,
  file: `${id}.${ext}`,
  mime: blob.type,
  kind,
  bytes: blob.size,
  origin: 'upload',
  name: `${kind}.${ext}`,
});

beforeAll(async () => {
  files = {
    [VIDEO]: await recordClip(1),
    [SOUND]: new Blob([toneWav(0.5)], { type: 'audio/wav' }),
    [PICTURE]: await picture(),
  };
  const base = createDeck({
    lang: 'en',
    slides: [
      createSlide({
        id: 's_media',
        elements: [
          createElement.video({
            id: 'e_video',
            frame: { x: 100, y: 100, w: 640, h: 360 },
            assetId: VIDEO,
            autoplay: true,
            loop: true,
            muted: true,
            volume: 0.5,
            trim: { startMs: 250, endMs: 750 },
            poster: { assetId: PICTURE },
          }),
          createElement.audio({
            id: 'e_audio',
            frame: { x: 100, y: 600, w: 320, h: 80 },
            assetId: SOUND,
            showControls: false,
          }),
        ],
      }),
    ],
  });
  deck = {
    ...base,
    assets: {
      [VIDEO]: asset(VIDEO, 'video', 'webm', files[VIDEO] as Blob),
      [SOUND]: asset(SOUND, 'audio', 'wav', files[SOUND] as Blob),
      [PICTURE]: asset(PICTURE, 'image', 'png', files[PICTURE] as Blob),
    },
  };
}, 30_000);

/** The export, and which assets it asked to read. Fonts are left out: they are not the point. */
async function run(options: { mediaFolder?: string } = {}) {
  const loadAsset = vi.fn((meta: AssetMeta) => Promise.resolve(files[meta.id]));
  const result = await exportHtml(deck, {
    loadAsset,
    fontCss: () => Promise.resolve(''),
    ...options,
  });
  const page = new DOMParser().parseFromString(result.html, 'text/html');
  return {
    result,
    read: loadAsset.mock.calls.map(([meta]) => meta.id).sort(),
    video: page.querySelector('video') as HTMLVideoElement,
    audio: page.querySelector('audio') as HTMLAudioElement,
  };
}

describe('a deck with video and audio as one file', () => {
  test('carries the media inside, as large as it is', async () => {
    const { result, read, video, audio } = await run();
    expect(read).toEqual([VIDEO, SOUND, PICTURE]);
    expect(video.getAttribute('src')).toMatch(/^data:video\/webm;base64,/);
    expect(audio.getAttribute('src')).toMatch(/^data:audio\/wav;base64,/);
    expect(result.html).not.toContain('blob:');
    expect(result.mediaFolder).toBeUndefined();
    const report = Object.fromEntries(result.assets.map((a) => [a.id, a]));
    expect(report[VIDEO]).toMatchObject({
      mime: 'video/webm',
      originalBytes: files[VIDEO]?.size,
      bytes: files[VIDEO]?.size,
    });
    expect(report[VIDEO]?.file).toBeUndefined();
    expect(report[SOUND]).toMatchObject({ bytes: files[SOUND]?.size });
    // The file is larger than its media by a third of it, at least.
    const media = (files[VIDEO]?.size ?? 0) + (files[SOUND]?.size ?? 0);
    expect(result.bytes).toBeGreaterThan((media * 4) / 3);
    expect(result.warnings).toEqual([]);
  });

  test('writes down what a clip is, for the runtime to play it by', async () => {
    const { video, audio } = await run();
    // Nothing in the file starts a clip by itself: no `autoplay`, and no `loop` for a trimmed one.
    expect(video.hasAttribute('autoplay')).toBe(false);
    expect(video.hasAttribute('loop')).toBe(false);
    expect(video.getAttribute('data-slidr-clip')).toBe('video');
    expect(video.getAttribute('data-clip-start')).toBe('0.25');
    expect(video.getAttribute('data-clip-end')).toBe('0.75');
    expect(video.hasAttribute('data-clip-loop')).toBe(true);
    expect(video.hasAttribute('data-clip-autoplay')).toBe(true);
    // What markup has no place for: the mute and the volume.
    expect(video.hasAttribute('muted')).toBe(true);
    expect(video.getAttribute('data-volume')).toBe('0.5');
    // The poster is a picture of the deck, inside the file like any other.
    expect(video.getAttribute('poster')).toMatch(/^data:image\//);
    // A sound that waits for a click and has no controls keeps its mark, to be clicked.
    expect(audio.getAttribute('data-slidr-clip')).toBe('audio');
    expect(audio.hasAttribute('controls')).toBe(false);
    expect(audio.parentElement?.querySelector('[data-slidr-clip-toggle]')).not.toBeNull();
  });
});

describe('a deck with its media beside the file', () => {
  test('does not read the media at all, and points at it in the folder', async () => {
    const { result, read, video, audio } = await run({ mediaFolder: 'Road map_media' });
    // Only the picture is read: a video may be hundreds of megabytes.
    expect(read).toEqual([PICTURE]);
    expect(video.getAttribute('src')).toBe(`Road%20map_media/${VIDEO}.webm`);
    expect(audio.getAttribute('src')).toBe(`Road%20map_media/${SOUND}.wav`);
    expect(result.html).not.toContain('blob:');
    expect(result.html).not.toMatch(/data:(?:video|audio)\//);
    // The poster stays inside: it is a picture.
    expect(video.getAttribute('poster')).toMatch(/^data:image\//);
    expect(result.mediaFolder).toBe('Road map_media');
  });

  test('reports each media file by its name in the folder and its size there', async () => {
    const { result } = await run({ mediaFolder: 'deck_media' });
    const report = Object.fromEntries(result.assets.map((a) => [a.id, a]));
    expect(report[VIDEO]).toEqual({
      id: VIDEO,
      mime: 'video/webm',
      originalBytes: files[VIDEO]?.size,
      bytes: 0,
      file: `${VIDEO}.webm`,
    });
    expect(report[SOUND]).toMatchObject({ bytes: 0, file: `${SOUND}.wav` });
    expect(report[PICTURE]?.file).toBeUndefined();
    expect(report[PICTURE]?.bytes).toBeGreaterThan(0);
    // The file itself is smaller than the media it leaves out.
    expect(result.bytes).toBeLessThan((files[VIDEO]?.size ?? 0) + 200_000);
    expect(result.warnings).toEqual([]);
  });

  test('says nothing of a folder for a deck that has no media', async () => {
    const empty: Deck = { ...deck, slides: [createSlide({ id: 's_empty' })] };
    const result = await exportHtml(empty, {
      loadAsset: () => Promise.resolve(undefined),
      fontCss: () => Promise.resolve(''),
      mediaFolder: 'deck_media',
    });
    expect(result.mediaFolder).toBeUndefined();
    expect(result.assets).toEqual([]);
  });
});
