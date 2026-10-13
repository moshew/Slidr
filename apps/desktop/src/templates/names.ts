import type { Theme } from '@slidr/model';
import { i18n } from '../i18n';

/**
 * What a template is called in a language: a built-in one has a name in each ("Layla", "לילה"),
 * a personal one the name its owner gave it.
 */
export function templateName(theme: Pick<Theme, 'id' | 'name'>, lang: string): string {
  const key = `templates:name.${theme.id}`;
  return i18n.exists(key, { lng: lang }) ? i18n.t(key, { lng: lang }) : theme.name;
}

/** The sentence that says what a built-in template feels like; a personal one has none. */
export function templateTagline(theme: Pick<Theme, 'id'>, lang: string): string | undefined {
  const key = `templates:tagline.${theme.id}`;
  return i18n.exists(key, { lng: lang }) ? i18n.t(key, { lng: lang }) : undefined;
}
