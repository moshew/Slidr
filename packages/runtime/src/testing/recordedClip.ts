/**
 * Media for tests that need a real browser: a few frames of a canvas recorded with
 * `MediaRecorder`, and a sound written by hand as a WAV file. Tiny, generated, and ours: no
 * third-party media is kept in the repository.
 */

/**
 * The colour of the picture changes every this many seconds, so a frame says when it is from.
 * A whole second: a recorder on a busy machine starts a little late, and the picture of a moment
 * in the middle of a band is the same whether it started on time or a third of a second after.
 */
export const BAND_SECONDS = 1;
export const BAND_COLOURS = ['#d62828', '#2a9d8f', '#264653', '#e9c46a', '#6a4c93', '#f4a261'];

/** Records `seconds` of a canvas as a WebM video. Takes that long in real time. */
export async function recordClip(seconds = 2, size = { w: 320, h: 180 }): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = size.w;
  canvas.height = size.h;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('no 2d context');
  const recorder = new MediaRecorder(canvas.captureStream(30), {
    mimeType: 'video/webm;codecs=vp8',
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => chunks.push(event.data);
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });
  recorder.start();
  const started = performance.now();
  await new Promise<void>((resolve) => {
    const draw = () => {
      const t = (performance.now() - started) / 1000;
      const band = Math.floor(t / BAND_SECONDS) % BAND_COLOURS.length;
      context.fillStyle = BAND_COLOURS[band] ?? '#000';
      context.fillRect(0, 0, size.w, size.h);
      context.fillStyle = '#fff';
      context.font = `${Math.round(size.h / 3)}px sans-serif`;
      context.fillText(t.toFixed(1), size.w / 4, size.h / 1.6);
      if (t < seconds) setTimeout(draw, 1000 / 30);
      else resolve();
    };
    draw();
  });
  recorder.stop();
  await stopped;
  return new Blob(chunks, { type: 'video/webm' });
}

/** A sine tone as a 16-bit mono WAV file: a 44-byte header and the samples. */
export function toneWav(seconds = 1, hertz = 440, rate = 8000): Uint8Array<ArrayBuffer> {
  const samples = Math.round(seconds * rate);
  const bytes = new Uint8Array(new ArrayBuffer(44 + samples * 2));
  const view = new DataView(bytes.buffer);
  const text = (at: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(at + i, value.charCodeAt(i));
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  // PCM, one channel.
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i++) {
    const value = Math.sin((2 * Math.PI * hertz * i) / rate) * 0.2;
    view.setInt16(44 + i * 2, Math.round(value * 32767), true);
  }
  return bytes;
}
