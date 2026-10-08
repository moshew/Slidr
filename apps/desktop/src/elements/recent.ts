import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Sticker } from './stickers';

/**
 * The graphics and emoji used lately, for the first screen of Elements. Per machine, not per
 * deck. Each is kept with its drawing, so the row shows at once, before any art set is loaded.
 */
export interface RecentSticker {
  id: string;
  label: Sticker['label'];
  markup: string;
}

const MAX = 12;

export const useRecentStickers = create<{ stickers: RecentSticker[] }>()(
  persist((): { stickers: RecentSticker[] } => ({ stickers: [] }), {
    name: 'slidr.elements.recent',
    version: 1,
    storage: createJSONStorage(() => localStorage),
  }),
);

export function rememberSticker(sticker: RecentSticker): void {
  useRecentStickers.setState(({ stickers }) => ({
    stickers: [sticker, ...stickers.filter((other) => other.id !== sticker.id)].slice(0, MAX),
  }));
}
