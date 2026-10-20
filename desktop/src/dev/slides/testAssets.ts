import { fixtureAssets } from '@slidr/model/fixtures';
import { testAssetKinds, type TestAssetKind } from '@slidr/renderer/fixtures';

/**
 * Pictures for the asset entries of the test decks, drawn on a canvas so that no binary files are
 * needed. Each one marks its corners, so a wrong crop or flip is visible at a glance.
 */
const kinds: Record<string, TestAssetKind> = {
  ...testAssetKinds,
  [fixtureAssets.photo]: 'landscape',
  [fixtureAssets.poster]: 'poster',
  [fixtureAssets.icon]: 'icon',
};

const SIZES: Record<Exclude<TestAssetKind, 'icon'>, [number, number]> = {
  landscape: [2400, 1600],
  portrait: [1200, 1600],
  poster: [1920, 1080],
};

function draw(kind: Exclude<TestAssetKind, 'icon'>): string {
  const [w, h] = SIZES[kind];
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('no 2d context');
  const sky = g.createLinearGradient(0, 0, 0, h);
  if (kind === 'poster') {
    sky.addColorStop(0, '#1b1f3b');
    sky.addColorStop(1, '#3d2a5c');
  } else {
    sky.addColorStop(0, '#7fb6ff');
    sky.addColorStop(0.6, '#ffd9b8');
    sky.addColorStop(1, '#f6a96b');
  }
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);
  // Sun and two ridges.
  g.fillStyle = kind === 'poster' ? '#ffcf5a' : '#fff3c4';
  g.beginPath();
  g.arc(w * 0.68, h * 0.42, Math.min(w, h) * 0.12, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#3b5b7a';
  g.beginPath();
  g.moveTo(0, h);
  g.lineTo(0, h * 0.7);
  g.lineTo(w * 0.3, h * 0.45);
  g.lineTo(w * 0.55, h * 0.72);
  g.lineTo(w * 0.8, h * 0.5);
  g.lineTo(w, h * 0.66);
  g.lineTo(w, h);
  g.fill();
  g.fillStyle = '#20374d';
  g.beginPath();
  g.moveTo(0, h);
  g.lineTo(0, h * 0.85);
  g.lineTo(w * 0.4, h * 0.68);
  g.lineTo(w * 0.7, h * 0.88);
  g.lineTo(w, h * 0.78);
  g.lineTo(w, h);
  g.fill();
  // Corner labels and a frame.
  g.strokeStyle = '#ffffff';
  g.lineWidth = Math.min(w, h) * 0.02;
  g.strokeRect(0, 0, w, h);
  g.fillStyle = '#ffffff';
  g.font = `700 ${Math.round(Math.min(w, h) * 0.12)}px Arial, sans-serif`;
  g.textBaseline = 'top';
  const pad = Math.min(w, h) * 0.04;
  g.textAlign = 'left';
  g.fillText('TL', pad, pad);
  g.textAlign = 'right';
  g.fillText('TR', w - pad, pad);
  g.textBaseline = 'bottom';
  g.fillText('BR', w - pad, h - pad);
  g.textAlign = 'left';
  g.fillText('BL', pad, h - pad);
  if (kind === 'poster') {
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.beginPath();
    g.moveTo(w * 0.46, h * 0.38);
    g.lineTo(w * 0.56, h * 0.5);
    g.lineTo(w * 0.46, h * 0.62);
    g.fill();
  }
  return canvas.toDataURL('image/jpeg', 0.9);
}

const ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#000000" d="M12 2l3 6.5 7 .8-5.2 4.8 1.4 7L12 17.6 5.8 21.1l1.4-7L2 9.3l7-.8z"/></svg>';

const cache = new Map<TestAssetKind, string>();

/** A URL for a test asset, or undefined for assets the dev page has no picture for (video, audio, fonts). */
export function testAssetUrl(assetId: string): string | undefined {
  const kind = kinds[assetId];
  if (!kind) return undefined;
  let url = cache.get(kind);
  if (!url) {
    url = kind === 'icon' ? `data:image/svg+xml,${encodeURIComponent(ICON)}` : draw(kind);
    cache.set(kind, url);
  }
  return url;
}
