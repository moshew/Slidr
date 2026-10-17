/**
 * The app's own readers of the media library (`apps/desktop/src`), so the browser shows each
 * kind of content exactly as the app reads and draws it. Only modules that stand without the
 * app's shell are named here: they depend on `@slidr/media-library`, `@slidr/model`,
 * `@slidr/renderer` and `@slidr/templates` alone.
 *
 * Most read the library as they are imported, so each is loaded only when its section opens.
 * They read the published library (`@slidr/media-library`): a page that runs outside the app,
 * without the dev server's stand-in, reads it from the site.
 */
import { he as elementsHe, en as elementsEn } from '../../../../apps/desktop/src/elements/messages';
import { he as objectsHe, en as objectsEn } from '../../../../apps/desktop/src/objects/messages';
import {
  he as templatesHe,
  en as templatesEn,
} from '../../../../apps/desktop/src/templates/messages';
import type { DisplayLang as Lang } from '../api';
import { isBase } from '../languages';

export const designsModule = () => import('../../../../apps/desktop/src/elements/designs');
export const designAssetsModule = () =>
  import('../../../../apps/desktop/src/elements/designAssets');
export const templatesModule = () => import('../../../../apps/desktop/src/templates/builtIn');
export const samplesModule = () => import('../../../../apps/desktop/src/templates/samples');
export const cardSetsModule = () => import('../../../../apps/desktop/src/elements/cardSets');
export const framesModule = () => import('../../../../apps/desktop/src/elements/frames');
export const frameThumbsModule = () => import('../../../../apps/desktop/src/elements/frameThumbs');
export const shapesModule = () => import('../../../../apps/desktop/src/objects/shapes');
export const stickersModule = () => import('../../../../apps/desktop/src/elements/stickers');
export const iconsModule = () => import('../../../../apps/desktop/src/media/icons/library');
export const iconSearchModule = () => import('../../../../apps/desktop/src/media/icons/search');

type Words = Partial<Record<Lang, unknown>>;

/**
 * The app's words for the content of the library: Hebrew and English, and each other language
 * once `loadWords` has read it.
 */
export const messages: Record<'elements' | 'objects' | 'templates', Words> = {
  elements: { he: elementsHe, en: elementsEn },
  objects: { he: objectsHe, en: objectsEn },
  templates: { he: templatesHe, en: templatesEn },
};

/** The app's translations, every namespace of a language in one file, read when it is chosen. */
const translations = import.meta.glob<Record<string, unknown>>(
  '../../../../apps/desktop/src/i18n/locales/*.json',
  { import: 'default' },
);

/** Whether the app's words in a language are at hand. */
export const hasWords = (lang: Lang) => messages.elements[lang] !== undefined;

/** Reads the app's words in a language; a language the app has no translation for has none. */
export async function loadWords(lang: Lang): Promise<void> {
  if (hasWords(lang)) return;
  const read = Object.entries(translations).find(([path]) => path.endsWith(`/${lang}.json`))?.[1];
  const namespaces = read ? await read() : {};
  for (const [namespace, table] of Object.entries(messages)) {
    table[lang] = namespaces[namespace] ?? {};
  }
}

function lookup(at: unknown, path: string[]) {
  for (const key of path) {
    if (typeof at !== 'object' || at === null) return undefined;
    at = (at as Record<string, unknown>)[key];
  }
  return typeof at === 'string' ? at : undefined;
}

/**
 * A name the app's messages give, by key, in a language; undefined when they give none. A
 * translation without the name gives the English one, as the app does.
 */
export function named(table: Words, lang: Lang, ...path: string[]) {
  return lookup(table[lang], path) ?? (isBase(lang) ? undefined : lookup(table.en, path));
}
