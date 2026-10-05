import type { ImageAspect } from '@slidr/agent-tools';
import { findElementInDeck, type Command, type Frame, type ImageElement } from '@slidr/model';
import { imagePlacement } from '@slidr/renderer';
import { create } from 'zustand';
import type { Editor } from '../shell/editor';
import { imagesOf } from './appImages';
import { ImageError } from './images';

/*
 * Extending a picture past its edges (AIO-04, "outpaint"): the picture is put in the middle of a
 * larger canvas of the wanted shape, and the image provider fills the margins, through the mask
 * `image_edit` takes: opaque over the picture, transparent around it. That needs a provider that
 * edits exactly and inside a mask (ADR-051); with one that redraws the whole image there is
 * nothing to extend, and the operation says so instead of redrawing.
 */

/** The longest side of the canvas that is sent, in pixels: more than a provider draws. */
const MAX_SIDE = 4096;

const INSTRUCTION =
  'Extend the picture into the empty margins around it, so that it continues naturally past its edges: the same scene, light, style, perspective and level of detail. Change nothing inside the original picture.';

export interface ExpandedCanvas {
  /** The size of the canvas. */
  w: number;
  h: number;
  /** Where the picture sits in it: in the middle, at its own size. */
  x: number;
  y: number;
}

/**
 * The canvas a picture is extended to: the smallest one of the aspect that holds the whole
 * picture. Undefined when the picture already has that shape: there is nothing to add.
 */
export function expandedCanvas(
  image: { width: number; height: number },
  aspect: ImageAspect,
): ExpandedCanvas | undefined {
  const [aw, ah] = aspect.split(':').map(Number) as [number, number];
  const ratio = aw / ah;
  const fullW = Math.max(image.width, image.height * ratio);
  const fullH = Math.max(image.height, image.width / ratio);
  // Less than a hundredth more on either side is the same shape.
  if (fullW - image.width < image.width / 100 && fullH - image.height < image.height / 100) {
    return undefined;
  }
  // A very large picture is scaled down with its canvas: no provider draws that many pixels.
  const scale = Math.min(1, MAX_SIDE / Math.max(fullW, fullH));
  const width = Math.round(image.width * scale);
  const height = Math.round(image.height * scale);
  const w = Math.max(width, Math.round(fullW * scale));
  const h = Math.max(height, Math.round(fullH * scale));
  return { w, h, x: Math.round((w - width) / 2), y: Math.round((h - height) / 2) };
}

/**
 * The frame of the element once its picture is the extended one: the picture that was there
 * keeps its place and its size on the slide, and the frame grows around it. A crop is given up:
 * what was cut away is what the margins are added to.
 *
 * So the new frame is worked out from where the whole picture is drawn now, which is not the
 * frame itself: a cropped element's frame shows a part of the picture, and so does one whose
 * picture covers a frame of another shape. `natural` is the size of the picture in pixels.
 */
export function expandedFrame(
  element: Pick<ImageElement, 'frame' | 'crop' | 'fit' | 'rotation' | 'flipH' | 'flipV'>,
  natural: { w: number; h: number },
  canvas: ExpandedCanvas,
): Frame {
  const { frame } = element;
  // The whole picture, in the axes of the frame, from the frame's corner.
  const placed = imagePlacement(frame, natural, element.crop, element.fit);
  // Slide pixels to a pixel of the canvas: the picture is in its middle, at one scale.
  const sx = placed.width / (canvas.w - canvas.x * 2);
  const sy = placed.height / (canvas.h - canvas.y * 2);
  const w = canvas.w * sx;
  const h = canvas.h * sy;
  // How far the middle of the new frame is from the middle of the old one, in those axes. A
  // mirrored element draws its picture mirrored about its own middle, and a turned one is
  // turned about it, so the step is mirrored and turned with it.
  const dx = (placed.left - canvas.x * sx + w / 2 - frame.w / 2) * (element.flipH ? -1 : 1);
  const dy = (placed.top - canvas.y * sy + h / 2 - frame.h / 2) * (element.flipV ? -1 : 1);
  const turn = (element.rotation * Math.PI) / 180;
  const cx = frame.x + frame.w / 2 + dx * Math.cos(turn) - dy * Math.sin(turn);
  const cy = frame.y + frame.h / 2 + dx * Math.sin(turn) + dy * Math.cos(turn);
  return {
    x: Math.round(cx - w / 2),
    y: Math.round(cy - h / 2),
    w: Math.round(w),
    h: Math.round(h),
  };
}

function toPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new ImageError('internal', 'no picture'))),
      'image/png',
    );
  });
}

/** The picture in the middle of its canvas, and the mask that is clear around it. */
async function paintCanvas(
  url: string,
  canvas: ExpandedCanvas,
): Promise<{ padded: Blob; mask: Blob }> {
  const bitmap = await createImageBitmap(await (await fetch(url)).blob());
  const width = canvas.w - canvas.x * 2;
  const height = canvas.h - canvas.y * 2;
  const draw = (paint: (g: CanvasRenderingContext2D) => void) => {
    const surface = document.createElement('canvas');
    surface.width = canvas.w;
    surface.height = canvas.h;
    const g = surface.getContext('2d');
    if (!g) throw new ImageError('internal', 'no 2d canvas');
    paint(g);
    return toPng(surface);
  };
  try {
    const padded = await draw((g) => {
      // Stretched under the picture, so the margins start from its own colours, not from a void.
      g.filter = 'blur(40px)';
      g.drawImage(bitmap, 0, 0, canvas.w, canvas.h);
      g.filter = 'none';
      g.drawImage(bitmap, canvas.x, canvas.y, width, height);
    });
    const mask = await draw((g) => g.fillRect(canvas.x, canvas.y, width, height));
    return { padded, mask };
  } finally {
    bitmap.close();
  }
}

/** The pictures being extended right now, by element id. */
const useWork = create<{ working: Record<string, true> }>(() => ({ working: {} }));

export function useExpandWorking(elementId: string): boolean {
  return useWork((state) => Boolean(state.working[elementId]));
}

function setWorking(elementId: string, on: boolean): void {
  useWork.setState((state) => {
    const { [elementId]: _gone, ...rest } = state.working;
    return { working: on ? { ...rest, [elementId]: true } : rest };
  });
}

/**
 * Extends the picture of an image element to an aspect, through the image provider, and puts
 * the result in the element: the new asset, the frame grown around the old one and the crop
 * given up are one undo step. False when there was nothing to do; rejects with the reason when
 * the provider cannot do it or failed.
 */
export async function expandImage(
  editor: Editor,
  elementId: string,
  aspect: ImageAspect,
  label: string,
): Promise<boolean> {
  const before = findElementInDeck(editor.bus.deck, elementId);
  const assetId = before?.element.type === 'image' ? before.element.assetId : undefined;
  const asset = assetId ? editor.bus.deck.assets[assetId] : undefined;
  const url = asset ? editor.assets.url(asset) : undefined;
  if (!before || !assetId || !asset?.width || !asset.height || !url) return false;
  const image = { width: asset.width, height: asset.height };
  const canvas = expandedCanvas(image, aspect);
  if (!canvas) return false;

  const { service } = imagesOf(editor);
  const provider = await service.describe?.();
  if (!provider || provider.edit !== 'exact' || !provider.mask) {
    throw new ImageError(
      'unsupported',
      'The image provider in use redraws a whole image and takes no mask, so it cannot extend one.',
    );
  }
  setWorking(elementId, true);
  try {
    const { padded, mask } = await paintCanvas(url, canvas);
    const name = (asset.name ?? 'image').replace(/\.[^.]+$/, '');
    const file = (blob: Blob, suffix: string) =>
      new File([blob], `${name}-${suffix}.png`, { type: 'image/png' });
    const [source, area] = await Promise.all([
      editor.assets.import(file(padded, 'wide')),
      editor.assets.import(file(mask, 'mask')),
    ]);
    const [made] = await service.edit({
      assetId: source.id,
      instruction: INSTRUCTION,
      maskAssetId: area.id,
      count: 1,
    });
    const now = findElementInDeck(editor.bus.deck, elementId);
    if (!made || !now || now.element.type !== 'image' || now.element.assetId !== assetId) {
      return false;
    }
    const commands: Command[] = [
      ...(made.asset.id in editor.bus.deck.assets
        ? []
        : [{ type: 'asset.add', asset: made.asset } as const]),
      {
        type: 'element.update',
        slideId: now.slide.id,
        elementId,
        patch: {
          assetId: made.asset.id,
          crop: null,
          frame: expandedFrame(now.element, { w: image.width, h: image.height }, canvas),
        },
      },
    ];
    editor.bus.batch(commands, { label });
    return true;
  } finally {
    setWorking(elementId, false);
  }
}
