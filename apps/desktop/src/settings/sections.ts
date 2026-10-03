import { useMemo, type ComponentType } from 'react';
import { createStore, useStore } from 'zustand';

/**
 * A part of the settings screen that an area draws (SPEC 4.2 ⚙): its image providers, its photo
 * libraries, the agent it runs. An area registers from its own `src/<area>/register.ts(x)`, so
 * adding one never means editing the screen.
 */
export interface SettingsSection {
  id: string;
  /** An i18n key: `namespace:key`. */
  title: string;
  /** Position on the screen, ascending. See `SettingsOrder`. */
  order: number;
  render: ComponentType;
}

/**
 * Where the sections sit. Appearance and language are the screen's own and come first; the
 * agent's (harness, model, web access) has its place before the image providers.
 */
export const SettingsOrder = {
  agent: 20,
  images: 30,
  stock: 40,
} as const;

const sections = createStore<{ items: readonly SettingsSection[] }>(() => ({ items: [] }));

/** Adds a section, or replaces the one with the same id. Returns a function that removes it. */
export function registerSettingsSection(section: SettingsSection): () => void {
  const items = sections.getState().items.filter((item) => item.id !== section.id);
  sections.setState({ items: [...items, section] });
  return () =>
    sections.setState({ items: sections.getState().items.filter((item) => item !== section) });
}

/** The registered sections, in screen order. */
export function useSettingsSections(): readonly SettingsSection[] {
  const items = useStore(sections, (state) => state.items);
  return useMemo(() => [...items].sort((a, b) => a.order - b.order), [items]);
}

/** For tests: the registry's store. */
export const settingsSections = sections;
