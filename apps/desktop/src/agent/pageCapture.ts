import type { CaptureService, PngImage } from '@slidr/agent-tools';

/**
 * Slide "capture" where nothing can take a picture: a blank slide-shaped PNG. It keeps the
 * agent's tools the same as in the app (a render comes back with every HTML write), which is
 * what the design check counts; nobody looks at the pixels.
 */
export function pageCapture(): CaptureService {
  const blank = (width: number, height: number): PngImage => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return {
      mimeType: 'image/png',
      data: canvas.toDataURL('image/png').split(',')[1] ?? '',
      width,
      height,
    };
  };
  return {
    renderSlide: (_deck, _slideId, { width }) =>
      Promise.resolve(blank(width, Math.round((width * 9) / 16))),
    renderContactSheet: (_deck, slideIds, { columns, width }) => {
      const rows = Math.ceil(slideIds.length / Math.max(1, columns));
      return Promise.resolve(blank(width, Math.round((width * 9 * rows) / (16 * columns))));
    },
  };
}
