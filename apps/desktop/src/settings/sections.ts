import { useMemo, type ComponentType } from 'react';
import { createStore, useStore } from 'zustand';
import { Ai, Images, Info, SlidersHorizontal, Type, type LucideIcon } from '@slidr/ui/icons';

/**
 * The topics of the settings screen (SPEC 4.2 ⚙), a tab each, in the order of the tabs. The
 * screen shows a topic only when something is on it: `general` always is, since the theme and
 * the language are the shell's own.
 */
export const SETTINGS_PAGES = ['general', 'agent', 'media', 'fonts', 'about'] as const;
export type SettingsPageId = (typeof SETTINGS_PAGES)[number];

/** The tints of the design system a topic is marked with, in its tab's header. */
export type SettingsTone = 'blue' | 'violet' | 'pink' | 'orange' | 'teal';

/** How a topic looks: its icon and its tint. Its name and its line are `settings:pages.<id>`. */
export const settingsPages: Record<SettingsPageId, { icon: LucideIcon; tone: SettingsTone }> = {
  general: { icon: SlidersHorizontal, tone: 'blue' },
  agent: { icon: Ai, tone: 'violet' },
  media: { icon: Images, tone: 'pink' },
  fonts: { icon: Type, tone: 'orange' },
  about: { icon: Info, tone: 'teal' },
};

/**
 * A part of the settings screen that an area draws: its image providers, its photo libraries,
 * the agent it runs. An area registers from its own `src/<area>/register.ts(x)`, so adding one
 * never means editing the screen.
 */
export interface SettingsSection {
  id: string;
  /** The topic, the tab, it is on. */
  page: SettingsPageId;
  /**
   * An i18n key, `namespace:key`: the heading of the section on its tab. A section that is the
   * whole of its tab has none, since the tab's header names it.
   */
  title?: string;
  /** Position on its tab, ascending. See `SettingsOrder`. */
  order: number;
  render: ComponentType;
}

/**
 * Where the sections sit on their tabs. The agent's tab and the fonts' have one section each;
 * on the media tab the image providers come before the photo libraries.
 */
export const SettingsOrder = {
  agent: 20,
  images: 30,
  stock: 40,
  fonts: 50,
  about: 90,
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
