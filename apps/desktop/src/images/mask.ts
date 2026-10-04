/*
 * The mask of an AI edit (AIO-04): a picture the size of the image, opaque where the image must
 * stay as it is and transparent where the edit may happen. That is the form `image_edit` takes
 * (ADR-025, ADR-051). The user paints the area; this turns what was painted into that picture.
 * Pure but for the canvas it draws on, so the geometry is tested without one.
 */

/** The longer side of the canvas the user paints on, in pixels: enough for a brush stroke. */
export const PAINT_SIDE = 1024;

/** The size of the painting canvas for an image: the image's own, down to `PAINT_SIDE`. */
export function paintSize(image: { width: number; height: number }): { w: number; h: number } {
  const scale = Math.min(1, PAINT_SIDE / Math.max(image.width, image.height));
  return {
    w: Math.max(1, Math.round(image.width * scale)),
    h: Math.max(1, Math.round(image.height * scale)),
  };
}

/** The room the painting canvas is shown in, in the dialog: its width, and the height it may take. */
export const PAINT_ROOM = { w: 680, h: 384 } as const;

/** The size the canvas is shown at: whole inside the room, at its own proportions. */
export function shownSize(canvas: { w: number; h: number }): { w: number; h: number } {
  const scale = Math.min(PAINT_ROOM.w / canvas.w, PAINT_ROOM.h / canvas.h);
  return { w: Math.round(canvas.w * scale), h: Math.round(canvas.h * scale) };
}

/** The brush sizes the slider offers, as a share of the canvas's longer side. */
export const BRUSH = { min: 1, max: 20, start: 6 } as const;

/** The radius of the brush in canvas pixels, for a size of the slider (a percentage). */
export function brushRadius(size: number, canvas: { w: number; h: number }): number {
  return Math.max(1, (Math.max(canvas.w, canvas.h) * size) / 200);
}

/** A point of the pointer, in canvas pixels, for a canvas shown in `box`. */
export function canvasPoint(
  pointer: { clientX: number; clientY: number },
  box: { left: number; top: number; width: number; height: number },
  canvas: { w: number; h: number },
): { x: number; y: number } {
  return {
    x: ((pointer.clientX - box.left) / box.width) * canvas.w,
    y: ((pointer.clientY - box.top) / box.height) * canvas.h,
  };
}

/** Whether anything is painted: any pixel that is not fully transparent. */
export function hasPaint(pixels: Uint8ClampedArray): boolean {
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) return true;
  return false;
}

/**
 * The mask as a PNG at the image's own size: opaque everywhere, and transparent where the
 * painting is. The painting is scaled up to the image, so the edge of the area is soft by as
 * much as the scaling blurs it.
 */
export async function maskPng(
  painting: HTMLCanvasElement,
  image: { width: number; height: number },
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('no 2d canvas');
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.globalCompositeOperation = 'destination-out';
  g.imageSmoothingQuality = 'high';
  g.drawImage(painting, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('The mask could not be written.'))),
      'image/png',
    );
  });
}
