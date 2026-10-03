// Helpers for browser tests: this package's own, and the app's test of the whole path
// (`@slidr/html-import/testing`). Not part of the package's main entry.
import type { AssetMeta, Deck } from '@slidr/model';
import { page } from 'vitest/browser';
import type { ConversionHost } from './host';

export interface TestHost extends ConversionHost {
  /** How many pictures were taken. */
  captures: number;
}

const KINDS: Record<string, AssetMeta['kind']> = {
  image: 'image',
  video: 'video',
  audio: 'audio',
  font: 'font',
};

/**
 * A host for tests: pictures through Vitest's browser provider (the same engine WebView2
 * uses), assets kept in memory under their content hash and served as blob URLs.
 */
export function testHost(icons: Record<string, string> = {}): TestHost {
  const urls = new Map<string, string>();
  const host: TestHost = {
    captures: 0,
    async capture(rect) {
      host.captures++;
      // The provider pictures an element; an empty one over the region gives the region.
      const probe = document.createElement('div');
      probe.style.cssText = `position:fixed;left:${rect.x}px;top:${rect.y}px;width:${rect.width}px;height:${rect.height}px;pointer-events:none;z-index:2147483647`;
      document.body.append(probe);
      try {
        const base64 = await page.screenshot({ element: probe, save: false });
        return await (await fetch(`data:image/png;base64,${base64}`)).blob();
      } finally {
        probe.remove();
      }
    },
    async storeAsset(bytes, info) {
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      const id = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join(
        '',
      );
      const blob = new Blob([bytes], { type: info.mime });
      if (!urls.has(id)) urls.set(id, URL.createObjectURL(blob));
      const svg = info.mime === 'image/svg+xml';
      const kind = svg ? 'svg' : (KINDS[info.mime.split('/')[0] ?? ''] ?? 'other');
      let size = {};
      if (kind === 'image') {
        const bitmap = await createImageBitmap(blob);
        size = { width: bitmap.width, height: bitmap.height };
        bitmap.close();
      }
      return {
        id,
        file: `${id}.${info.mime.split('/')[1]?.split('+')[0] ?? 'bin'}`,
        mime: info.mime,
        kind,
        bytes: bytes.byteLength,
        origin: 'import',
        ...size,
        ...(info.name ? { name: info.name } : {}),
      };
    },
    resolveAsset: (asset) => urls.get(asset.id),
    icon: (id) => Promise.resolve(icons[id]),
  };
  return host;
}

/** The deck with the assets a conversion stored, as the tool registers them before the slide. */
export function withAssets(deck: Deck, assets: readonly AssetMeta[]): Deck {
  return {
    ...deck,
    assets: { ...deck.assets, ...Object.fromEntries(assets.map((a) => [a.id, a])) },
  };
}

/** A PNG drawn on a canvas, as a data URL: test pictures without binary files in the repo. */
export function testImage(width: number, height: number, hue = 210): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, `hsl(${hue} 70% 45%)`);
  gradient.addColorStop(1, `hsl(${hue + 60} 80% 70%)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.arc(width * 0.3, height * 0.4, Math.min(width, height) * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#111';
  ctx.fillRect(width * 0.6, height * 0.6, width * 0.25, height * 0.2);
  return canvas.toDataURL('image/png');
}

/**
 * A page of its own on the test page, as an import session has one: any HTML, any size. The
 * conversion reads its DOM and pictures it where it sits.
 */
export async function foreignFrame(
  html: string,
  size: { w: number; h: number },
): Promise<{ document: Document; dispose(): void }> {
  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox', 'allow-same-origin');
  frame.style.cssText = `position:fixed;left:0;top:0;width:${size.w}px;height:${size.h}px;border:0;background:#fff;z-index:2147483000`;
  frame.srcdoc = html;
  const loaded = new Promise((resolve) => frame.addEventListener('load', resolve, { once: true }));
  document.body.append(frame);
  await loaded;
  const doc = frame.contentDocument!;
  await doc.fonts.ready;
  await Promise.all(Array.from(doc.images, (img) => img.decode().catch(() => undefined)));
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return { document: doc, dispose: () => frame.remove() };
}
