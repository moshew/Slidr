import type { PngImage } from '@slidr/agent-tools';

/** The longer side of a preview, in pixels: enough for the agent to judge a picture. */
export const PREVIEW_SIDE = 512;

/** What stands in for a preview that could not be made: one transparent pixel. */
export const BLANK_PREVIEW: PngImage = {
  mimeType: 'image/png',
  data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=',
  width: 1,
  height: 1,
};

/**
 * A PNG of the image at `url`, scaled down to at most `maxSide` on its longer side. For any image
 * the webview can draw, whatever its format: an asset of the workspace (the asset protocol lets
 * the page read the pixels back) or an object URL.
 */
export async function previewOf(url: string, maxSide = PREVIEW_SIDE): Promise<PngImage> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load the image (${response.status}).`);
  const image = await createImageBitmap(await response.blob());
  try {
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const g = canvas.getContext('2d');
    if (!g) throw new Error('no 2d canvas');
    g.imageSmoothingQuality = 'high';
    g.drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL('image/png').split(',')[1] ?? '';
    return { mimeType: 'image/png', data, width: canvas.width, height: canvas.height };
  } finally {
    image.close();
  }
}
