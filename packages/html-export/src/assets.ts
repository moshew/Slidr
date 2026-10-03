import type { AssetMeta } from '@slidr/model';
import { everyElement } from './render';

/**
 * Assets inside the file (WG9-T08): every asset the slides use becomes a data URI. Pictures are
 * first brought down to the size they are shown at and re-encoded as WebP (EXP-01, EXP-09).
 */

export interface LoadedAsset {
  meta: AssetMeta;
  blob: Blob;
  /** The object URL the slides were rendered with; the data URI takes its place in the markup. */
  url: string;
}

export interface EmbeddedAsset {
  id: string;
  mime: string;
  /** Bytes of the original and of what went into the file. */
  originalBytes: number;
  bytes: number;
  /** Pixel size of an embedded picture. */
  width?: number;
  height?: number;
}

export interface ImageOptions {
  /** The highest device pixel ratio pictures should stay sharp at. */
  pixelRatio: number;
  /** WebP quality, 0..1. */
  quality: number;
}

/**
 * How large a picture has to be: the largest box it fills, in slide pixels. `natural` means it is
 * also used somewhere that cannot be measured, so it keeps its own size.
 */
export interface ImageNeed {
  boxes: { w: number; h: number }[];
  natural: boolean;
}

/** Looks through the rendered slides for where each asset is shown, and at what size. */
export function measureNeeds(
  host: HTMLElement,
  assets: readonly LoadedAsset[],
): Map<string, ImageNeed> {
  const needs = new Map<string, ImageNeed>();
  const need = (asset: LoadedAsset): ImageNeed => {
    let entry = needs.get(asset.meta.id);
    if (!entry) needs.set(asset.meta.id, (entry = { boxes: [], natural: false }));
    return entry;
  };
  const inText = (text: string | null | undefined): LoadedAsset[] =>
    text ? assets.filter((a) => text.includes(a.url)) : [];
  const box = (element: Element, asset: LoadedAsset) => {
    // The host is not scaled, so client pixels are slide pixels. A rotated box measures larger
    // than it is, which only errs towards a sharper picture.
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      need(asset).boxes.push({ w: rect.width, h: rect.height });
    }
  };

  for (const element of everyElement(host)) {
    if (element instanceof HTMLImageElement) {
      for (const asset of inText(element.getAttribute('src'))) box(element, asset);
    } else if (element instanceof HTMLVideoElement) {
      for (const asset of inText(element.getAttribute('poster'))) box(element, asset);
    } else if (element.localName === 'image') {
      for (const asset of inText(element.getAttribute('href'))) box(element, asset);
    } else if (element instanceof HTMLIFrameElement) {
      // The frame's own document lays the picture out; it cannot be read from here.
      for (const asset of inText(element.srcdoc)) need(asset).natural = true;
    } else if (element instanceof HTMLStyleElement) {
      for (const asset of inText(element.textContent)) need(asset).natural = true;
    }
    const style = element.getAttribute('style');
    for (const asset of inText(style)) {
      // A background covers its box at most, unless it is tiled at its own size.
      const tiled = getComputedStyle(element).backgroundSize === 'auto';
      if (tiled) need(asset).natural = true;
      else box(element, asset);
    }
  }
  return needs;
}

/** Formats a canvas re-encodes. A GIF may be animated and an SVG is already small: both stay. */
const RASTER = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/bmp']);

async function toWebp(bitmap: ImageBitmap, quality: number): Promise<Blob | undefined> {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d');
  if (!context) return undefined;
  context.drawImage(bitmap, 0, 0);
  const blob = await canvas.convertToBlob({ type: 'image/webp', quality });
  // A browser that cannot write WebP answers with a PNG.
  return blob.type === 'image/webp' ? blob : undefined;
}

/**
 * A picture at the size it is needed, as WebP, or the original when that is no gain. A PNG is
 * tried lossless too, and stays lossless when that costs little: flat graphics compress well
 * that way and keep their edges, photographs do not.
 */
async function encodeImage(
  asset: LoadedAsset,
  need: ImageNeed | undefined,
  options: ImageOptions,
): Promise<{ blob: Blob; width: number; height: number }> {
  const full = await createImageBitmap(asset.blob);
  const natural = { width: full.width, height: full.height };
  let scale = 1;
  if (need && !need.natural && need.boxes.length) {
    const shown = Math.max(...need.boxes.map((b) => Math.max(b.w / full.width, b.h / full.height)));
    scale = Math.min(1, shown * options.pixelRatio);
  }
  const width = Math.max(1, Math.round(full.width * scale));
  const height = Math.max(1, Math.round(full.height * scale));
  const bitmap =
    scale < 1
      ? await createImageBitmap(asset.blob, {
          resizeWidth: width,
          resizeHeight: height,
          resizeQuality: 'high',
        })
      : full;
  let best = await toWebp(bitmap, options.quality);
  if (best && asset.blob.type === 'image/png') {
    const lossless = await toWebp(bitmap, 1);
    if (lossless && lossless.size <= best.size * 1.2) best = lossless;
  }
  if (bitmap !== full) bitmap.close();
  full.close();
  // The original wins when re-encoding at the same size did not make it smaller.
  if (!best || (scale === 1 && best.size >= asset.blob.size)) {
    return { blob: asset.blob, ...natural };
  }
  return { blob: best, width, height };
}

function dataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('could not read an asset'));
    reader.readAsDataURL(blob);
  });
}

/** The data URI of an asset, and what it weighs. */
export async function embedAsset(
  asset: LoadedAsset,
  need: ImageNeed | undefined,
  options: ImageOptions,
): Promise<{ uri: string; report: EmbeddedAsset }> {
  const report: EmbeddedAsset = {
    id: asset.meta.id,
    mime: asset.blob.type,
    originalBytes: asset.blob.size,
    bytes: asset.blob.size,
  };
  let blob = asset.blob;
  if (RASTER.has(blob.type)) {
    try {
      const image = await encodeImage(asset, need, options);
      blob = image.blob;
      Object.assign(report, {
        mime: blob.type,
        bytes: blob.size,
        width: image.width,
        height: image.height,
      });
    } catch {
      // A file the browser cannot decode goes in as it is.
    }
  }
  return { uri: await dataUri(blob), report };
}

/** An asset's bytes under its own type: a blob read from disk often has none. */
export function typed(blob: Blob, meta: AssetMeta): Blob {
  return blob.type === meta.mime ? blob : new Blob([blob], { type: meta.mime });
}
