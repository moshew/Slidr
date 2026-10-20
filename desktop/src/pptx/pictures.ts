import type { ElementPicture } from '@slidr/pptx';
import type { Deck, Element, Slide } from '@slidr/model';
import { renderSlideOffscreen, type AssetResolver } from '@slidr/renderer';
import { embedFonts } from '@slidr/html-export';
import { isTauri } from '@tauri-apps/api/core';
import { captureSlide } from '../capture/client';

/*
 * Pictures of what PowerPoint has no object for (ADR-108): an HTML object, a drawing that lays
 * itself out, a picture with a look of its own. The element is drawn alone on a slide of its own,
 * at its size, without its rotation, shadow and opacity, which the file says for itself.
 *
 * In the app the capture window draws it, as it draws every slide the agent sees (ADR-003),
 * twice: on black and on white, and the two give the picture with its transparency. In a plain
 * browser (the Vite page, Playwright) there is no capture window: the slide's DOM is drawn on a
 * canvas through an SVG `foreignObject`, with its fonts and pictures put inside it.
 */

/** Pixels of the picture per slide pixel. */
const SCALE = 2;

/** The element alone at the top-left corner of a slide with no background, and that slide. */
function alone(element: Element, slide: Slide, deck: Deck, ground: string | undefined) {
  const { w, h } = element.frame;
  // Larger than the slide, it is drawn smaller to fit, as large as the slide lets it be.
  const k = Math.min(1, deck.size.w / Math.max(1, w), deck.size.h / Math.max(1, h));
  const copy = {
    ...element,
    frame: { x: 0, y: 0, w: w * k, h: h * k },
    rotation: 0,
    opacity: 1,
    hidden: false,
    ...(element.effects ? { effects: { ...element.effects, shadow: undefined } } : {}),
  } as Element;
  const single: Slide = {
    id: slide.id,
    elements: [copy],
    timeline: [],
    background: { fill: ground ? { kind: 'solid', color: { value: ground } } : { kind: 'none' } },
    ...(slide.css ? { css: slide.css } : {}),
  };
  return { deck: { ...deck, slides: [single] }, slide: single, k };
}

function canvasOf(
  w: number,
  h: number,
): { canvas: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  const g = canvas.getContext('2d', { willReadFrequently: true });
  if (!g) throw new Error('no 2d canvas');
  return { canvas, g };
}

const pngOf = (canvas: HTMLCanvasElement): Promise<Uint8Array<ArrayBuffer>> =>
  new Promise((resolve, reject) =>
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error('the picture could not be encoded'));
      else blob.arrayBuffer().then((bytes) => resolve(new Uint8Array(bytes)), reject);
    }, 'image/png'),
  );

/** The element drawn by the capture window, on black and on white, as one transparent picture. */
async function captured(element: Element, slide: Slide, deck: Deck, workspaceId: string | null) {
  const width = deck.size.w * SCALE;
  const shots: ImageData[] = [];
  let box = { w: 0, h: 0 };
  for (const ground of ['#000000', '#ffffff']) {
    const one = alone(element, slide, deck, ground);
    box = { w: one.slide.elements[0]!.frame.w * SCALE, h: one.slide.elements[0]!.frame.h * SCALE };
    const png = await captureSlide(one.deck, one.slide.id, { width, workspaceId });
    const bitmap = await createImageBitmap(new Blob([png], { type: 'image/png' }));
    const { g } = canvasOf(box.w, box.h);
    g.drawImage(bitmap, 0, 0);
    bitmap.close();
    shots.push(
      g.getImageData(0, 0, Math.max(1, Math.round(box.w)), Math.max(1, Math.round(box.h))),
    );
  }
  const [black, white] = shots as [ImageData, ImageData];
  const { canvas, g } = canvasOf(box.w, box.h);
  const out = g.createImageData(black.width, black.height);
  for (let i = 0; i < black.data.length; i += 4) {
    // What shows the ground through it differs between the two: that difference is its alpha.
    const d =
      (white.data[i]! -
        black.data[i]! +
        white.data[i + 1]! -
        black.data[i + 1]! +
        white.data[i + 2]! -
        black.data[i + 2]!) /
      3;
    const alpha = Math.min(255, Math.max(0, 255 - d));
    const a = alpha / 255;
    out.data[i] = a > 0 ? Math.min(255, black.data[i]! / a) : 0;
    out.data[i + 1] = a > 0 ? Math.min(255, black.data[i + 1]! / a) : 0;
    out.data[i + 2] = a > 0 ? Math.min(255, black.data[i + 2]! / a) : 0;
    out.data[i + 3] = alpha;
  }
  g.putImageData(out, 0, 0);
  return pngOf(canvas);
}

/** A URL as a data URL, or undefined when it cannot be read. */
async function dataUrl(url: string): Promise<string | undefined> {
  try {
    const response = await fetch(url);
    if (!response.ok) return undefined;
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : undefined);
      reader.onerror = () => resolve(undefined);
      reader.readAsDataURL(blob);
    });
  } catch {
    return undefined;
  }
}

const CSS_URL = /url\("((?:[^"\\]|\\.)*)"\)/g;
// eslint-disable-next-line no-control-regex
const NOT_XML = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g;

/** The element drawn from the DOM onto a canvas, through an SVG `foreignObject`. */
async function drawn(element: Element, slide: Slide, deck: Deck, resolveAsset: AssetResolver) {
  const one = alone(element, slide, deck, undefined);
  const { w, h } = one.slide.elements[0]!.frame;
  const offscreen = await renderSlideOffscreen(
    { deck: one.deck, slide: one.slide, mode: 'present', resolveAsset, scriptNonce: '' },
    { hidden: true },
  );
  try {
    const root = offscreen.root;
    const copy = root.cloneNode(true) as HTMLElement;
    // What lives in shadow roots (an HTML object, a drawing) is copied into the copy itself.
    const hosts = Array.from(root.querySelectorAll<HTMLElement>('*')).filter((el) => el.shadowRoot);
    const twins = Array.from(copy.querySelectorAll<HTMLElement>('*'));
    const all = Array.from(root.querySelectorAll<HTMLElement>('*'));
    hosts.forEach((host, i) => {
      const twin = twins[all.indexOf(host)];
      if (!twin || !host.shadowRoot) return;
      twin.setAttribute('data-pptx-shadow', String(i));
      twin.replaceChildren(...Array.from(host.shadowRoot.childNodes, (n) => n.cloneNode(true)));
      for (const sheet of Array.from(twin.querySelectorAll('style'))) {
        sheet.textContent = `@scope ([data-pptx-shadow="${i}"]) {\n${sheet.textContent ?? ''}\n}`;
      }
    });
    for (const img of Array.from(copy.querySelectorAll('img'))) {
      const src = img.currentSrc || img.src;
      const inline = src ? await dataUrl(src) : undefined;
      if (inline) img.setAttribute('src', inline);
      else img.removeAttribute('src');
    }
    for (const el of Array.from(copy.querySelectorAll<HTMLElement>('[style*="url("]'))) {
      const value = el.style.backgroundImage;
      if (!value) continue;
      const urls = Array.from(value.matchAll(CSS_URL), (m) => m[1] ?? '');
      const inlined = await Promise.all(urls.map((u) => dataUrl(u.replace(/\\(.)/g, '$1'))));
      let k = 0;
      el.style.backgroundImage = value.replace(CSS_URL, () => {
        const next = inlined[k++];
        return next ? `url("${next}")` : 'none';
      });
    }
    for (const frame of Array.from(copy.querySelectorAll('iframe, video'))) frame.remove();
    const fonts = await embedFonts(offscreen.container).catch(() => undefined);
    if (fonts?.css) {
      const style = document.createElement('style');
      // A picture is drawn once: text whose font is still loading is drawn in another, not left
      // out.
      style.textContent = fonts.css.replace(/font-display:\s*block/g, 'font-display: swap');
      copy.prepend(style);
    }
    const xhtml = new XMLSerializer().serializeToString(copy).replace(NOT_XML, '');
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w * SCALE}" height="${h * SCALE}" viewBox="0 0 ${w} ${h}">` +
      `<foreignObject width="${deck.size.w}" height="${deck.size.h}">${xhtml}</foreignObject></svg>`;
    const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    // The fonts inside the picture load after it decodes; the second time they are there.
    const warm = new Image();
    warm.src = src;
    await warm.decode();
    await new Promise((resolve) => setTimeout(resolve, 120));
    const image = new Image();
    image.src = src;
    await image.decode();
    const { canvas, g } = canvasOf(w * SCALE, h * SCALE);
    g.drawImage(image, 0, 0, w * SCALE, h * SCALE);
    return await pngOf(canvas);
  } finally {
    offscreen.dispose();
  }
}

/**
 * The SVG of a drawing as the slide shows it: cleaned and recoloured as the renderer draws it,
 * its theme colours and `currentColor` written out, for PowerPoint to draw at any size.
 */
async function drawingSvg(element: Element, slide: Slide, deck: Deck, resolveAsset: AssetResolver) {
  if (element.type !== 'svg' || !element.markup || element.stretch || element.layout)
    return undefined;
  const one = alone(element, slide, deck, undefined);
  const offscreen = await renderSlideOffscreen(
    { deck: one.deck, slide: one.slide, mode: 'present', resolveAsset, scriptNonce: '' },
    { hidden: true },
  );
  try {
    const host = offscreen.root.querySelector<HTMLElement>('[data-slidr-svg]');
    const svg = host?.shadowRoot?.querySelector('svg');
    if (!host || !svg) return undefined;
    const copy = svg.cloneNode(true) as SVGSVGElement;
    copy.setAttribute('width', String(element.frame.w));
    copy.setAttribute('height', String(element.frame.h));
    copy.style.removeProperty('display');
    let text = new XMLSerializer().serializeToString(copy);
    const current = getComputedStyle(host).color;
    text = text.replace(/currentColor/gi, current);
    const colors = deck.theme.colors as unknown as Record<string, string>;
    text = text.replace(
      /var\(\s*--color-([a-z]+)\s*(?:,[^)]*)?\)/g,
      (whole, name: string) => colors[name] ?? whole,
    );
    return text;
  } finally {
    offscreen.dispose();
  }
}

/** The host's picture of an element, for the PowerPoint export. */
export function elementPictures(options: {
  resolveAsset: AssetResolver;
  workspaceId: () => string | null;
}): (element: Element, slide: Slide, deck: Deck) => Promise<ElementPicture | undefined> {
  return async (element, slide, deck) => {
    let png: Uint8Array | undefined;
    if (isTauri()) {
      png = await captured(element, slide, deck, options.workspaceId()).catch((error: unknown) => {
        console.warn('The capture window could not draw an object for the export', error);
        return undefined;
      });
    }
    png ??= await drawn(element, slide, deck, options.resolveAsset).catch((error: unknown) => {
      console.warn('An object could not be drawn for the export', error);
      return undefined;
    });
    if (!png) return undefined;
    const svg = await drawingSvg(element, slide, deck, options.resolveAsset).catch(() => undefined);
    return { png, ...(svg ? { svg } : {}) };
  };
}

/** A picture PowerPoint cannot read (WebP, AVIF) as PNG. */
export async function toPng(blob: Blob): Promise<Uint8Array | undefined> {
  const bitmap = await createImageBitmap(blob);
  try {
    const { canvas, g } = canvasOf(bitmap.width, bitmap.height);
    g.drawImage(bitmap, 0, 0);
    return await pngOf(canvas);
  } finally {
    bitmap.close();
  }
}

/** A frame of a video, as the poster of it in the file. */
export async function videoFrame(blob: Blob, timeMs: number): Promise<Uint8Array | undefined> {
  const url = URL.createObjectURL(blob);
  const video = document.createElement('video');
  video.muted = true;
  video.preload = 'auto';
  video.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error('the video could not be read'));
    });
    video.currentTime = Math.min(timeMs / 1000, Math.max(0, (video.duration || 0) - 0.05));
    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
      setTimeout(resolve, 3000);
    });
    const { canvas, g } = canvasOf(video.videoWidth || 1280, video.videoHeight || 720);
    g.drawImage(video, 0, 0, canvas.width, canvas.height);
    return await pngOf(canvas);
  } catch {
    return undefined;
  } finally {
    URL.revokeObjectURL(url);
  }
}
