import type { AssetMeta, AudioElement, ElementPatch, VideoElement } from '@slidr/model';

/*
 * Video and audio as objects of a slide (WG5-T12; MED-01, MED-03): which files they are made of,
 * and what the trim and the poster of a clip are in the model. No DOM here. Taking a file in is
 * `insertClip.ts`, playing a clip in place is `playback.ts`, and the tools of row B are
 * `ClipTools.tsx`.
 */

export type ClipElement = VideoElement | AudioElement;

/** The formats of MED-01. */
export const CLIP_EXTENSIONS = ['mp4', 'webm', 'mp3', 'wav', 'm4a'] as const;

/** For a file input. By extension: what type a browser gives a file differs between systems. */
export const CLIP_FILES = CLIP_EXTENSIONS.map((extension) => `.${extension}`).join(',');

export const isClip = (asset: AssetMeta): boolean =>
  asset.kind === 'video' || asset.kind === 'audio';

/* ---------------------------------------------------------------- trim and poster */

/** The shortest clip a trim may leave, in milliseconds. */
export const MIN_CLIP_MS = 100;

/** The trim of a clip as its tools show it: the whole file when the clip is not trimmed. */
export function trimRange(
  element: ClipElement,
  durationMs: number | undefined,
): { startMs: number; endMs: number | undefined } {
  return element.trim ?? { startMs: 0, endMs: durationMs };
}

const tidy = (ms: number): number => Math.max(0, Math.round(ms));

/**
 * The change that sets one end of the trim (MED-03). The other end stays, and the two never
 * cross: an end that would come too close to the other stops `MIN_CLIP_MS` short of it. A trim
 * that is the whole file is no trim, and is taken off the element. Undefined when the length of
 * the file is not known and the trim has no end to keep.
 */
export function trimPatch(
  element: ClipElement,
  durationMs: number | undefined,
  edge: 'start' | 'end',
  ms: number,
): ElementPatch | undefined {
  const { startMs, endMs } = trimRange(element, durationMs);
  if (endMs === undefined) return undefined;
  const limit = durationMs ?? Math.max(endMs, ms);
  // Whole milliseconds: the length of a file is a fraction, and the model keeps none.
  const next =
    edge === 'start'
      ? { startMs: tidy(Math.min(ms, endMs - MIN_CLIP_MS)), endMs: tidy(endMs) }
      : { startMs, endMs: tidy(Math.min(Math.max(ms, startMs + MIN_CLIP_MS), limit)) };
  const whole = next.startMs === 0 && durationMs !== undefined && next.endMs >= durationMs - 1;
  return { trim: whole ? null : next };
}

/** The poster of a video as its tool says it. */
export type PosterKind = 'start' | 'frame' | 'image';

export function posterKind(element: VideoElement): PosterKind {
  if (!element.poster) return 'start';
  return 'assetId' in element.poster ? 'image' : 'frame';
}

/* ---------------------------------------------------------------- times */

/** A moment of a clip as a player shows it: `0:07`, `1:23`, `1:02:03`. */
export function formatTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const s = String(whole % 60).padStart(2, '0');
  const m = Math.floor(whole / 60) % 60;
  const h = Math.floor(whole / 3600);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** A moment to the tenth of a second, for trimming: `0:07.4`. */
export function formatMoment(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const tenths = Math.floor(safe * 10 + 1e-6);
  return `${formatTime(tenths / 10)}.${tenths % 10}`;
}
