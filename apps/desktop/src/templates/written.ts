import { BASE_LANGUAGES, contentLanguageOf, type ContentLanguage } from '@slidr/model';
import { useEffect, useMemo } from 'react';
import { createStore, useStore } from 'zustand';
import type { LibraryEntry } from './library';

/*
 * The templates an interface in a language offers (ADR-104): a built-in template when its sample
 * is written in that language, and a personal one always, which has no sample and is shown in
 * the app's own words for each role, as a built-in one the catalog has no sample of is.
 *
 * The languages of the samples are in their catalog (`samples.ts`), which is large and is read
 * when the app is idle. Every sample is written in Hebrew and in English, so an interface in
 * either does not wait for it; one in another language has its built-in templates once it is read.
 */

type Languages = Readonly<Record<string, readonly ContentLanguage[]>>;

const written = createStore<{ languages?: Languages }>(() => ({}));

let reading: Promise<void> | undefined;

/** Reads the languages of the samples, once; a read that failed is tried again the next time. */
function readLanguages(): void {
  reading ??= import('./samples')
    .then((samples) => samples.sampleLanguages())
    .then((languages) => written.setState({ languages }))
    .catch((error: unknown) => {
      reading = undefined;
      console.error('The languages of the templates could not be read', error);
    });
}

const isBase = (lang: ContentLanguage | undefined) => BASE_LANGUAGES.some((base) => base === lang);

/**
 * Whether an interface in `lang` offers a template, by the languages of the samples; undefined
 * while those are not read and the language is not Hebrew or English.
 */
export function offeredIn(
  entry: LibraryEntry,
  lang: string,
  languages: Languages | undefined,
): boolean | undefined {
  const own = contentLanguageOf(lang);
  if (entry.personal || isBase(own)) return true;
  if (!languages) return undefined;
  const sample = languages[entry.template.theme.id];
  return !sample || (own !== undefined && sample.includes(own));
}

/**
 * The templates an interface in `lang` offers (`offeredIn`), in their order, and whether there
 * may be more once the languages of the samples are read.
 */
export function useTemplatesIn(
  entries: readonly LibraryEntry[],
  lang: string,
): { entries: LibraryEntry[]; pending: boolean } {
  const languages = useStore(written, (state) => state.languages);
  const base = isBase(contentLanguageOf(lang));
  useEffect(() => {
    if (!languages && !base) readLanguages();
  }, [languages, base]);
  return useMemo(() => {
    const offered = entries.map((entry) => offeredIn(entry, lang, languages));
    return {
      entries: entries.filter((_, index) => offered[index]),
      pending: offered.includes(undefined),
    };
  }, [entries, lang, languages]);
}
