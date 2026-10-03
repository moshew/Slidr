import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** The colours and fonts used lately, for the pickers (TXT-02). Per machine, not per deck. */
interface RecentState {
  /** Hex colours, the latest first. */
  colors: string[];
  /** Font families, the latest first. */
  fonts: string[];
}

const MAX_COLORS = 9;
const MAX_FONTS = 5;

export const useRecent = create<RecentState>()(
  persist((): RecentState => ({ colors: [], fonts: [] }), {
    name: 'slidr.recent',
    version: 1,
    storage: createJSONStorage(() => localStorage),
  }),
);

function remember(list: readonly string[], item: string, max: number): string[] {
  return [item, ...list.filter((other) => other !== item)].slice(0, max);
}

export function rememberColor(hex: string): void {
  useRecent.setState((s) => ({ colors: remember(s.colors, hex.toLowerCase(), MAX_COLORS) }));
}

export function rememberFont(family: string): void {
  useRecent.setState((s) => ({ fonts: remember(s.fonts, family, MAX_FONTS) }));
}
