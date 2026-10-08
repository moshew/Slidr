/**
 * The template library of the app (THM-01, THM-05, THM-08): the templates Slidr ships with,
 * the ones the user saved, and which of them a new deck opens with.
 *
 * Built-in templates are code, which a packaged app reads as files of its media library (see
 * `./builtIn`). Personal ones are files (see `./store`), read once at startup.
 * The choice of the default is a preference of this machine, kept where the shell keeps its
 * own (`localStorage`), with a copy of the template itself beside it: a new deck is made before
 * the store has answered, and must not wait for it.
 */
import type { AssetMeta, Layout } from '@slidr/model';
import { Template, withStandardLayouts } from '@slidr/templates';
import { createStore, type StoreApi } from 'zustand';
import { builtIn } from './builtIn';
import type { TemplateFile, TemplateStore } from './store';

const PREFS_KEY = 'slidr.templates';

interface Prefs {
  /** The id of the template new decks open with; null for the plain deck. */
  defaultId: string | null;
  /** The default template itself, when it is a personal one. */
  template?: unknown;
}

export interface LibraryEntry {
  template: Template;
  personal: boolean;
}

export interface LibraryState {
  personal: readonly Template[];
  defaultId: string | null;
  /** The personal templates were read from the store. */
  loaded: boolean;
}

/** The part of `Storage` the library uses, so tests can hand it a map. */
export type PrefsStorage = Pick<Storage, 'getItem' | 'setItem'>;

function readPrefs(storage: PrefsStorage | undefined): Prefs {
  try {
    const stored: unknown = JSON.parse(storage?.getItem(PREFS_KEY) ?? 'null');
    if (typeof stored === 'object' && stored !== null && 'defaultId' in stored) {
      const { defaultId, template } = stored as Prefs;
      return { defaultId: typeof defaultId === 'string' ? defaultId : null, template };
    }
  } catch {
    // Unreadable preferences are no preferences.
  }
  return { defaultId: null };
}

/**
 * A built-in template as a deck takes it: without its sample slides and their pictures, which
 * are for showing the template, not for carrying in every deck.
 */
function forDecks(template: Template): Template {
  const { sample: _sample, assets: _assets, ...rest } = template;
  return rest;
}

/** What a layout of an archetype is called in a language: "Timeline", "ציר זמן". */
export type LayoutNamer = (archetype: Layout['archetype'], lang: string) => string;

/** A template with its layouts named in a language: a built-in layout is named by its archetype. */
function named(template: Template, lang: string, nameOf: LayoutNamer): Template {
  const rename = (layout: Layout): Layout => ({ ...layout, name: nameOf(layout.archetype, lang) });
  return {
    ...template,
    layouts: template.layouts.map(rename),
    ...(template.flipped ? { flipped: template.flipped.map(rename) } : {}),
  };
}

export class TemplateLibrary {
  readonly state: StoreApi<LibraryState>;
  readonly #builtIn: readonly Template[];
  readonly #store: TemplateStore;
  readonly #storage: PrefsStorage | undefined;
  readonly #nameOf: LayoutNamer | undefined;
  /** The default template as the preferences hold it, until the store has been read. */
  #cached: Template | undefined;
  /** Object URLs of the asset files of personal templates, by asset id. */
  readonly #urls = new Map<string, string>();

  constructor(
    store: TemplateStore,
    options: {
      builtIn?: readonly Template[];
      storage?: PrefsStorage;
      /** Names the layouts of built-in templates in the language of the deck that takes them. */
      layoutName?: LayoutNamer;
    } = {},
  ) {
    this.#store = store;
    this.#storage = options.storage;
    this.#nameOf = options.layoutName;
    this.#builtIn = (options.builtIn ?? builtIn).map((template) =>
      forDecks(withStandardLayouts(template)),
    );
    const prefs = readPrefs(this.#storage);
    const cached = Template.safeParse(prefs.template);
    if (cached.success && cached.data.theme.id === prefs.defaultId)
      this.#cached = withStandardLayouts(cached.data);
    this.state = createStore<LibraryState>(() => ({
      personal: [],
      defaultId: prefs.defaultId,
      loaded: false,
    }));
  }

  /** Reads the personal templates from the store. A file that is not a template is skipped. */
  async load(): Promise<void> {
    const personal: Template[] = [];
    for (const { id, json } of await this.#store.list()) {
      try {
        const template = Template.parse(JSON.parse(json));
        if (template.theme.id === id) personal.push(withStandardLayouts(template));
      } catch (error) {
        console.error(`The personal template "${id}" could not be read`, error);
      }
    }
    this.state.setState({ personal, loaded: true });
    await Promise.all(personal.map((template) => this.#loadUrls(template)));
    // A default that is gone (its folder was deleted) is no default.
    const { defaultId } = this.state.getState();
    if (defaultId && !this.find(defaultId)) this.setDefault(null);
    else this.#writePrefs();
  }

  async #loadUrls(template: Template): Promise<void> {
    for (const asset of Object.values(template.assets ?? {})) {
      if (this.#urls.has(asset.id)) continue;
      try {
        const bytes = await this.#store.readAsset(template.theme.id, asset.file);
        const blob = new Blob([bytes.slice()], { type: asset.mime });
        this.#urls.set(asset.id, URL.createObjectURL(blob));
      } catch (error) {
        console.error(`An asset of the template "${template.theme.id}" could not be read`, error);
      }
    }
  }

  /** Built-in templates first, then the personal ones. */
  entries(): LibraryEntry[] {
    return [
      ...this.#builtIn.map((template) => ({ template, personal: false })),
      ...this.state.getState().personal.map((template) => ({ template, personal: true })),
    ];
  }

  find(id: string): LibraryEntry | undefined {
    return this.entries().find((entry) => entry.template.theme.id === id);
  }

  /** A template as a deck of the given language takes it: built-in layouts named in it. */
  forDeck(id: string, lang: string): Template | undefined {
    const entry = this.find(id);
    if (!entry) return undefined;
    if (entry.personal || !this.#nameOf) return entry.template;
    return named(entry.template, lang, this.#nameOf);
  }

  /** The template a new deck opens with, in a language; undefined for the plain deck. */
  defaultTemplate(lang: string): Template | undefined {
    const { defaultId } = this.state.getState();
    if (!defaultId) return undefined;
    return this.forDeck(defaultId, lang) ?? this.#cached;
  }

  setDefault(id: string | null): void {
    this.state.setState({ defaultId: id });
    this.#writePrefs();
  }

  #writePrefs(): void {
    const { defaultId } = this.state.getState();
    const entry = defaultId ? this.find(defaultId) : undefined;
    // Not yet read from the store: what the preferences hold stays as it is.
    if (defaultId && !entry && !this.state.getState().loaded) return;
    const prefs: Prefs = {
      defaultId: entry ? defaultId : null,
      ...(entry?.personal ? { template: entry.template } : {}),
    };
    this.#cached = entry?.personal ? entry.template : undefined;
    try {
      this.#storage?.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // Not remembered; the choice still holds until the app closes.
    }
  }

  /** Saves a personal template with its asset files; one with the same id is replaced. */
  async save(template: Template, files: readonly TemplateFile[]): Promise<void> {
    const parsed = withStandardLayouts(Template.parse(template));
    const id = parsed.theme.id;
    if (this.#builtIn.some((builtIn) => builtIn.theme.id === id)) {
      throw new Error(`"${id}" is a built-in template.`);
    }
    await this.#store.save(id, JSON.stringify(parsed), files);
    const others = this.state.getState().personal.filter((t) => t.theme.id !== id);
    this.state.setState({ personal: [...others, parsed] });
    for (const asset of Object.values(parsed.assets ?? {})) {
      const file = files.find((f) => f.name === asset.file);
      if (file && !this.#urls.has(asset.id)) {
        this.#urls.set(
          asset.id,
          URL.createObjectURL(new Blob([file.bytes.slice()], { type: asset.mime })),
        );
      }
    }
    this.#writePrefs();
  }

  /** Deletes a personal template. If it was the default, new decks are plain again. */
  async remove(id: string): Promise<void> {
    await this.#store.remove(id);
    this.state.setState({
      personal: this.state.getState().personal.filter((t) => t.theme.id !== id),
    });
    if (this.state.getState().defaultId === id) this.setDefault(null);
  }

  /** The bytes of an asset file of a personal template; undefined when there are none. */
  async assetBytes(templateId: string, asset: AssetMeta): Promise<Uint8Array | undefined> {
    if (!this.find(templateId)?.personal) return undefined;
    try {
      return await this.#store.readAsset(templateId, asset.file);
    } catch (error) {
      console.error(`An asset of the template "${templateId}" could not be read`, error);
      return undefined;
    }
  }

  /** Where the asset of a personal template loads from, for a picture of the template. */
  assetUrl = (asset: AssetMeta): string | undefined => this.#urls.get(asset.id);
}
