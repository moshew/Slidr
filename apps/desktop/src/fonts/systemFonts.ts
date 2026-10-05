import { invoke, isTauri } from '@tauri-apps/api/core';
import { useEffect } from 'react';
import { create } from 'zustand';

/** A font family installed on this computer, as the `fonts_system` command reports it. */
export interface SystemFont {
  /** The family name: what a deck writes, and what CSS finds the font by. */
  family: string;
  /** The regular face has Hebrew letters. */
  hebrew: boolean;
  /** A symbol font (Wingdings): it draws pictures in place of letters, its own name included. */
  symbol: boolean;
  /** The weights the family has a face of its own for, ascending; absent when not known. */
  weights?: readonly number[];
}

/** Where the list comes from. */
export type SystemFontSource = () => Promise<readonly SystemFont[]>;

/** In a plain browser (the Vite page, Playwright) there is no Tauri core, and so no list. */
const fromSystem: SystemFontSource = () =>
  isTauri() ? invoke<SystemFont[]>('fonts_system') : Promise.resolve([]);

const useStore = create<{ fonts: readonly SystemFont[] }>(() => ({ fonts: [] }));
let source = fromSystem;
let asked: Promise<readonly SystemFont[]> | undefined;

/**
 * The fonts installed on this computer (SPEC appendix B). Asked for once: the answer is kept for
 * as long as the app runs, so a font installed meanwhile shows after a restart. A system that
 * cannot be asked has none.
 */
export function loadSystemFonts(): Promise<readonly SystemFont[]> {
  asked ??= source()
    .catch((error: unknown): readonly SystemFont[] => {
      console.error('could not list the installed fonts', error);
      return [];
    })
    .then((fonts) => {
      useStore.setState({ fonts });
      return fonts;
    });
  return asked;
}

/** The installed fonts, for a component: none until the list arrives. */
export function useSystemFonts(): readonly SystemFont[] {
  useEffect(() => void loadSystemFonts(), []);
  return useStore((s) => s.fonts);
}

/**
 * Puts a list in place of the system's and loads it: for tests, and for a page with no system
 * to ask. `null` puts the system back.
 */
export function setSystemFontSource(next: SystemFontSource | null): Promise<readonly SystemFont[]> {
  source = next ?? fromSystem;
  asked = undefined;
  return loadSystemFonts();
}
