import { deckFromTemplate, type Template } from '@slidr/templates';
import { nightTemplate, paperTemplate } from '@slidr/templates/fixtures';
import { describe, expect, it } from 'vitest';
import { TemplateLibrary, type PrefsStorage } from './library';
import { memoryTemplateStore } from './store';

/** `localStorage`, as a map. */
function prefs(initial: Record<string, string> = {}): PrefsStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

/** A personal template: the night fixture under an id of its own. */
function personal(id = 'personal_one', name = 'שלי'): Template {
  const template = nightTemplate();
  return { ...template, theme: { ...template.theme, id, name } };
}

const library = (options: ConstructorParameters<typeof TemplateLibrary>[1] = {}) => {
  const store = memoryTemplateStore();
  return { store, lib: new TemplateLibrary(store, { builtIn: [paperTemplate()], ...options }) };
};

describe('the template library', () => {
  it('lists the built-in templates before the personal ones, and finds each by its id', async () => {
    const { lib } = library();
    await lib.save(personal(), []);
    expect(lib.entries().map((e) => [e.template.theme.id, e.personal])).toEqual([
      ['test_paper', false],
      ['personal_one', true],
    ]);
    expect(lib.find('personal_one')?.personal).toBe(true);
    expect(lib.find('nope')).toBeUndefined();
  });

  it('hands a built-in template to decks without its sample slides and their pictures', () => {
    const paper = paperTemplate();
    paper.assets = {
      photo: {
        id: 'photo',
        file: 'photo.webp',
        mime: 'image/webp',
        kind: 'image',
        bytes: 1,
        origin: 'ai',
      },
    };
    const lib = new TemplateLibrary(memoryTemplateStore(), { builtIn: [paper] });
    const [entry] = lib.entries();
    expect(paper.sample?.length).toBeGreaterThan(0);
    expect(entry!.template.sample).toBeUndefined();
    expect(entry!.template.assets).toBeUndefined();
    expect(deckFromTemplate(entry!.template).assets).toEqual({});
  });

  it('names the layouts of a built-in template in the language of the deck', async () => {
    const { lib } = library({ layoutName: (archetype, lang) => `${lang}:${archetype}` });
    expect(lib.forDeck('test_paper', 'he')!.layouts[0]!.name).toBe('he:hero');
    // A personal template keeps the names it was saved with.
    await lib.save(personal(), []);
    expect(lib.forDeck('personal_one', 'he')!.layouts[0]!.name).toBe(
      nightTemplate().layouts[0]!.name,
    );
  });

  it('reads the personal templates from the store, and skips what is not a template', async () => {
    const { store, lib } = library();
    const mine = personal();
    await store.save(mine.theme.id, JSON.stringify(mine), []);
    await store.save('broken', '{"theme":', []);
    await store.save('renamed', JSON.stringify(personal('another_id')), []);
    expect(lib.state.getState().loaded).toBe(false);
    await lib.load();
    expect(lib.state.getState()).toMatchObject({ loaded: true });
    expect(lib.state.getState().personal.map((t) => t.theme.id)).toEqual(['personal_one']);
    const kinds = lib.find('personal_one')!.template.layouts.map((layout) => layout.archetype);
    expect(kinds.indexOf('title')).toBe(kinds.indexOf('section') + 1);
    expect(kinds.indexOf('text')).toBe(kinds.indexOf('textImage') - 1);
  });

  it('refuses to save over a built-in template', async () => {
    const { lib } = library();
    await expect(lib.save(paperTemplate(), [])).rejects.toThrow(/built-in/);
  });
});

describe('the default template', () => {
  it('is none until one is chosen, and is remembered', () => {
    const storage = prefs();
    const { lib } = library({ storage });
    expect(lib.defaultTemplate('he')).toBeUndefined();
    lib.setDefault('test_paper');
    expect(lib.defaultTemplate('he')?.theme.id).toBe('test_paper');

    const again = new TemplateLibrary(memoryTemplateStore(), {
      builtIn: [paperTemplate()],
      storage,
    });
    expect(again.state.getState().defaultId).toBe('test_paper');
    expect(again.defaultTemplate('en')?.theme.id).toBe('test_paper');

    again.setDefault(null);
    expect(again.defaultTemplate('en')).toBeUndefined();
    expect(JSON.parse(storage.data.get('slidr.templates')!)).toEqual({ defaultId: null });
  });

  it('is at hand before the store was read, when it is a personal template', async () => {
    const storage = prefs();
    const store = memoryTemplateStore();
    const first = new TemplateLibrary(store, { builtIn: [paperTemplate()], storage });
    await first.save(personal(), []);
    first.setDefault('personal_one');

    // The next start of the app: a new deck is made before `load` has answered.
    const next = new TemplateLibrary(store, { builtIn: [paperTemplate()], storage });
    expect(next.state.getState().loaded).toBe(false);
    expect(next.defaultTemplate('he')?.theme).toMatchObject({ id: 'personal_one', name: 'שלי' });
    await next.load();
    expect(next.defaultTemplate('he')?.theme.id).toBe('personal_one');
  });

  it('is cleared when its template is deleted, or is no longer in the store', async () => {
    const storage = prefs();
    const { store, lib } = library({ storage });
    await lib.save(personal(), []);
    lib.setDefault('personal_one');
    await lib.remove('personal_one');
    expect(lib.state.getState().defaultId).toBeNull();
    expect(lib.defaultTemplate('he')).toBeUndefined();

    await lib.save(personal('personal_two'), []);
    lib.setDefault('personal_two');
    await store.remove('personal_two');
    const next = new TemplateLibrary(store, { builtIn: [paperTemplate()], storage });
    await next.load();
    expect(next.state.getState().defaultId).toBeNull();
    expect(next.defaultTemplate('he')).toBeUndefined();
  });

  it('follows a personal template that is saved again', async () => {
    const storage = prefs();
    const { lib } = library({ storage });
    await lib.save(personal(), []);
    lib.setDefault('personal_one');
    await lib.save(personal('personal_one', 'שם חדש'), []);
    expect(lib.state.getState().personal).toHaveLength(1);
    const next = new TemplateLibrary(memoryTemplateStore(), {
      builtIn: [paperTemplate()],
      storage,
    });
    expect(next.defaultTemplate('he')?.theme.name).toBe('שם חדש');
  });
});

describe('the asset files of a personal template', () => {
  it('are stored with it and read back', async () => {
    const { lib } = library();
    const mine = personal();
    const logo = {
      id: 'a'.repeat(64),
      file: `${'a'.repeat(64)}.png`,
      mime: 'image/png',
      kind: 'image' as const,
      bytes: 3,
      origin: 'upload' as const,
    };
    mine.assets = { [logo.id]: logo };
    await lib.save(mine, [{ name: logo.file, bytes: new Uint8Array([1, 2, 3]) }]);
    expect(await lib.assetBytes('personal_one', logo)).toEqual(new Uint8Array([1, 2, 3]));
    expect(lib.assetUrl(logo)).toMatch(/^blob:/);
    // A built-in template has no files in the store.
    expect(await lib.assetBytes('test_paper', logo)).toBeUndefined();
  });
});
