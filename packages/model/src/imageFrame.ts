import { frameCenter, rotateVector } from './geometry';
import type { Frame, ImageElement } from './schema';

/** The photograph's opening, in the decorated frame's local coordinates. */
export function imageOpening(image: Pick<ImageElement, 'frame' | 'smartFrame'>): Frame {
  const design = image.smartFrame;
  if (!design) return { x: 0, y: 0, w: image.frame.w, h: image.frame.h };
  const sx = image.frame.w / design.viewBox.w;
  const sy = image.frame.h / design.viewBox.h;
  const o = design.opening;
  return { x: o.x * sx, y: o.y * sy, w: o.w * sx, h: o.h * sy };
}

/** The opening in the parent's coordinates, respecting the artwork's rotation and mirroring. */
export function imageOpeningFrame(
  image: Pick<ImageElement, 'frame' | 'smartFrame' | 'rotation' | 'flipH' | 'flipV'>,
): Frame {
  const o = imageOpening(image);
  const center = frameCenter(image.frame);
  const delta = rotateVector(
    {
      x: (o.x + o.w / 2 - image.frame.w / 2) * (image.flipH ? -1 : 1),
      y: (o.y + o.h / 2 - image.frame.h / 2) * (image.flipV ? -1 : 1),
    },
    image.rotation,
  );
  return { x: center.x + delta.x - o.w / 2, y: center.y + delta.y - o.h / 2, w: o.w, h: o.h };
}
