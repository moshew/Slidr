import type { CaptureService, PngImage } from '@slidr/agent-tools';
import { captureSlide } from './client';

/**
 * The Deck API's capture service (`slide_render`, `deck_render_contact_sheet`) over the capture
 * window (ADR-003). Agent captures use `optimizeForSpeed`: the same pixels, faster.
 */

function base64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Gap between contact-sheet cells, and the height of the number label under each, in pixels. */
const GAP = 12;
const LABEL = 22;

async function loadImage(png: Uint8Array<ArrayBuffer>): Promise<ImageBitmap> {
  return createImageBitmap(new Blob([png], { type: 'image/png' }));
}

export function createCaptureService(workspaceId: () => string | null): CaptureService {
  return {
    async renderSlide(deck, slideId, { width }): Promise<PngImage> {
      const png = await captureSlide(deck, slideId, {
        width,
        fast: true,
        workspaceId: workspaceId(),
      });
      return {
        mimeType: 'image/png',
        data: base64(png),
        width,
        height: Math.round((width * 9) / 16),
      };
    },

    /** Every slide captured at cell size, then laid out in a grid with its number in the deck. */
    async renderContactSheet(deck, slideIds, { columns, width }): Promise<PngImage> {
      const cols = Math.max(1, Math.min(columns, slideIds.length));
      const cellW = Math.floor((width - GAP * (cols + 1)) / cols);
      const cellH = Math.round((cellW * 9) / 16);
      const rows = Math.ceil(slideIds.length / cols);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = rows * (cellH + LABEL + GAP) + GAP;
      const g = canvas.getContext('2d');
      if (!g) throw new Error('no 2d canvas');
      g.fillStyle = '#e9ebef';
      g.fillRect(0, 0, canvas.width, canvas.height);
      g.font = '600 14px sans-serif';
      g.textBaseline = 'middle';
      g.textAlign = 'center';
      // One at a time: the capture window draws one slide at a time anyway.
      for (const [i, slideId] of slideIds.entries()) {
        const png = await captureSlide(deck, slideId, {
          width: cellW,
          fast: true,
          workspaceId: workspaceId(),
        });
        const image = await loadImage(png);
        const x = GAP + (i % cols) * (cellW + GAP);
        const y = GAP + Math.floor(i / cols) * (cellH + LABEL + GAP);
        g.drawImage(image, x, y, cellW, cellH);
        image.close();
        g.fillStyle = '#3b4250';
        const number = deck.slides.findIndex((s) => s.id === slideId) + 1;
        g.fillText(String(number), x + cellW / 2, y + cellH + LABEL / 2);
      }
      const data = canvas.toDataURL('image/png').split(',')[1] ?? '';
      return { mimeType: 'image/png', data, width: canvas.width, height: canvas.height };
    },
  };
}
