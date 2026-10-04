import { createElement, type AudioElement, type VideoElement } from '@slidr/model';
import { describe, expect, it } from 'vitest';
import {
  CLIP_EXTENSIONS,
  CLIP_FILES,
  formatMoment,
  formatTime,
  isClip,
  MIN_CLIP_MS,
  posterKind,
  trimPatch,
  trimRange,
} from './clip';
import { en, he } from './messages';

const frame = { x: 0, y: 0, w: 640, h: 360 };
const video = (extra: Partial<VideoElement> = {}): VideoElement =>
  createElement.video({ id: 'e_video', frame, assetId: 'a'.repeat(64), ...extra });
const audio = (extra: Partial<AudioElement> = {}): AudioElement =>
  createElement.audio({ id: 'e_audio', frame, assetId: 'b'.repeat(64), ...extra });

describe('the files a clip is made of (MED-01)', () => {
  it('are mp4, webm, mp3, wav and m4a', () => {
    expect([...CLIP_EXTENSIONS]).toEqual(['mp4', 'webm', 'mp3', 'wav', 'm4a']);
    expect(CLIP_FILES).toBe('.mp4,.webm,.mp3,.wav,.m4a');
  });

  it('are the assets of kind video and audio', () => {
    const asset = (kind: 'video' | 'audio' | 'image' | 'other') => ({
      id: 'a'.repeat(64),
      file: 'a.bin',
      mime: 'x/y',
      kind,
      bytes: 1,
      origin: 'upload' as const,
    });
    expect(isClip(asset('video'))).toBe(true);
    expect(isClip(asset('audio'))).toBe(true);
    expect(isClip(asset('image'))).toBe(false);
    expect(isClip(asset('other'))).toBe(false);
  });
});

describe('trimRange', () => {
  it('is the trim of the clip, else the whole file as far as its length is known', () => {
    expect(trimRange(video({ trim: { startMs: 500, endMs: 1500 } }), 3000)).toEqual({
      startMs: 500,
      endMs: 1500,
    });
    expect(trimRange(video(), 3000)).toEqual({ startMs: 0, endMs: 3000 });
    expect(trimRange(audio(), undefined)).toEqual({ startMs: 0, endMs: undefined });
  });
});

describe('trimPatch (MED-03)', () => {
  it('sets the start and keeps the end, which is the end of the file for an untrimmed clip', () => {
    expect(trimPatch(video(), 3000, 'start', 1234.4)).toEqual({
      trim: { startMs: 1234, endMs: 3000 },
    });
    expect(trimPatch(video({ trim: { startMs: 0, endMs: 2000 } }), 3000, 'start', 500)).toEqual({
      trim: { startMs: 500, endMs: 2000 },
    });
  });

  it('sets the end and keeps the start', () => {
    expect(trimPatch(audio(), 3000, 'end', 1800)).toEqual({ trim: { startMs: 0, endMs: 1800 } });
    expect(trimPatch(audio({ trim: { startMs: 700, endMs: 2000 } }), 3000, 'end', 2500)).toEqual({
      trim: { startMs: 700, endMs: 2500 },
    });
  });

  it('never lets the two ends cross, or leaves a clip of no length', () => {
    const trimmed = video({ trim: { startMs: 1000, endMs: 2000 } });
    expect(trimPatch(trimmed, 3000, 'start', 2500)).toEqual({
      trim: { startMs: 2000 - MIN_CLIP_MS, endMs: 2000 },
    });
    expect(trimPatch(trimmed, 3000, 'end', 200)).toEqual({
      trim: { startMs: 1000, endMs: 1000 + MIN_CLIP_MS },
    });
    expect(trimPatch(trimmed, 3000, 'start', -50)).toEqual({ trim: { startMs: 0, endMs: 2000 } });
  });

  it('keeps the end inside the file', () => {
    expect(trimPatch(video({ trim: { startMs: 1000, endMs: 2000 } }), 3000, 'end', 9000)).toEqual({
      trim: { startMs: 1000, endMs: 3000 },
    });
  });

  it('takes the trim off a clip that is the whole file again', () => {
    expect(trimPatch(video({ trim: { startMs: 500, endMs: 3000 } }), 3000, 'start', 0)).toEqual({
      trim: null,
    });
    expect(trimPatch(video({ trim: { startMs: 0, endMs: 2000 } }), 3000, 'end', 3000)).toEqual({
      trim: null,
    });
  });

  it('keeps whole milliseconds, though the length of a file is a fraction', () => {
    expect(trimPatch(video(), 2990.902, 'start', 500)).toEqual({
      trim: { startMs: 500, endMs: 2991 },
    });
    expect(trimPatch(video(), 2990.4, 'end', 2990.4)).toEqual({ trim: null });
    expect(trimPatch(video({ trim: { startMs: 500, endMs: 2990 } }), 2990.4, 'start', 0)).toEqual({
      trim: null,
    });
  });

  it('has nothing to set while the length of an untrimmed file is not known', () => {
    expect(trimPatch(video(), undefined, 'start', 500)).toBeUndefined();
    // A clip that is trimmed has an end to keep, whatever the file's length is.
    expect(
      trimPatch(video({ trim: { startMs: 0, endMs: 2000 } }), undefined, 'start', 500),
    ).toEqual({ trim: { startMs: 500, endMs: 2000 } });
    expect(trimPatch(video({ trim: { startMs: 0, endMs: 2000 } }), undefined, 'end', 2600)).toEqual(
      { trim: { startMs: 0, endMs: 2600 } },
    );
  });
});

describe('posterKind', () => {
  it('says what a video shows while it waits', () => {
    expect(posterKind(video())).toBe('start');
    expect(posterKind(video({ poster: { timeMs: 0 } }))).toBe('frame');
    expect(posterKind(video({ poster: { assetId: 'c'.repeat(64) } }))).toBe('image');
  });
});

describe('times', () => {
  it('reads as a player shows them', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(7.9)).toBe('0:07');
    expect(formatTime(83)).toBe('1:23');
    expect(formatTime(3723)).toBe('1:02:03');
    expect(formatTime(Number.NaN)).toBe('0:00');
    expect(formatTime(Infinity)).toBe('0:00');
    expect(formatTime(-3)).toBe('0:00');
  });

  it('reads to the tenth of a second for trimming', () => {
    expect(formatMoment(0)).toBe('0:00.0');
    expect(formatMoment(7.44)).toBe('0:07.4');
    expect(formatMoment(1.3)).toBe('0:01.3');
    expect(formatMoment(59.99)).toBe('0:59.9');
    expect(formatMoment(61.5)).toBe('1:01.5');
  });
});

describe('the strings of the clip tools', () => {
  const keys = (value: object, prefix = ''): string[] =>
    Object.entries(value).flatMap(([key, inner]) =>
      typeof inner === 'object' && inner !== null
        ? keys(inner as object, `${prefix}${key}.`)
        : [`${prefix}${key}`],
    );

  it('exist in Hebrew and in English, with the same placeholders', () => {
    expect(keys(en.clip)).toEqual(keys(he.clip));
    const placeholders = (text: string) => (text.match(/\{\{\w+\}\}/g) ?? []).sort();
    const read = (from: object, path: string): string =>
      path
        .split('.')
        .reduce<unknown>((at, key) => (at as Record<string, unknown>)[key], from) as string;
    for (const key of keys(he.clip)) {
      expect(placeholders(read(en.clip, key)), key).toEqual(placeholders(read(he.clip, key)));
      expect(read(he.clip, key), key).toMatch(/\p{Script=Hebrew}/u);
    }
  });
});
