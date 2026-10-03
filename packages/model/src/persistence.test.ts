import { describe, expect, it } from 'vitest';
import { CommandBus } from './bus';
import { updateElement } from './commands';
import { allElementsDeck, fixtureAssets, hebrewDeck } from './fixtures';
import * as ids from './ids';
import { DeckLoadError, loadDeck } from './migrations';
import { referencedAssetIds } from './queries';
import { prepareForSave } from './save';
import { SCHEMA_VERSION } from './schema';

describe('loadDeck', () => {
  it('loads a current deck as it is', () => {
    const deck = hebrewDeck();
    expect(loadDeck(JSON.parse(JSON.stringify(deck)))).toEqual({ deck });
  });

  it('migrates an older deck step by step and says from which version (DOC-04)', () => {
    const { schemaVersion: _, meta, ...rest } = hebrewDeck();
    const old = {
      ...rest,
      schemaVersion: SCHEMA_VERSION - 1,
      meta: { ...meta, heading: meta.title },
    };
    const table = {
      [SCHEMA_VERSION - 1]: (d: Record<string, unknown>) => {
        const { heading, ...m } = d.meta as Record<string, unknown>;
        return { ...d, meta: { ...m, title: heading } };
      },
    };
    expect(loadDeck(old, table)).toEqual({ deck: hebrewDeck(), migratedFrom: SCHEMA_VERSION - 1 });
  });

  it('says why a file cannot be loaded', () => {
    const code = (raw: unknown, table = {}) => {
      try {
        loadDeck(raw, table);
      } catch (e) {
        return e instanceof DeckLoadError ? e.code : 'other';
      }
      return 'loaded';
    };
    expect(code(null)).toBe('not_a_deck');
    expect(code([])).toBe('not_a_deck');
    expect(code({ title: 'x' })).toBe('not_a_deck');
    expect(code({ ...hebrewDeck(), schemaVersion: SCHEMA_VERSION + 1 })).toBe('newer_version');
    expect(code({ ...hebrewDeck(), schemaVersion: SCHEMA_VERSION - 1 })).toBe('no_migration');
    expect(code({ ...hebrewDeck(), slides: 'none' })).toBe('invalid');
  });
});

describe('prepareForSave', () => {
  it('drops assets nothing uses, keeps fonts, and stamps the time', () => {
    const deck = allElementsDeck();
    const saved = prepareForSave(deck, new Date('2027-01-01T00:00:00.000Z'));
    expect(Object.keys(saved.assets).sort()).toEqual(
      [
        fixtureAssets.photo,
        fixtureAssets.icon,
        fixtureAssets.clip,
        fixtureAssets.poster,
        fixtureAssets.sound,
        fixtureAssets.font,
      ].sort(),
    );
    expect(saved.meta.updatedAt).toBe('2027-01-01T00:00:00.000Z');
    expect(Object.keys(deck.assets)).toContain(fixtureAssets.unused);
  });

  it('sees an asset used only from inside free HTML or CSS', () => {
    const bus = new CommandBus(allElementsDeck());
    bus.dispatch(
      updateElement('s_all', 'e_html', { markup: `<img src="asset:${fixtureAssets.unused}">` }),
    );
    expect(referencedAssetIds(bus.deck).has(fixtureAssets.unused)).toBe(true);
  });

  it('keeps an asset whose last use was deleted, so that undo still works', () => {
    const bus = new CommandBus(allElementsDeck());
    bus.dispatch({ type: 'element.remove', slideId: 's_all', elementIds: ['e_audio'] });
    expect(bus.deck.assets[fixtureAssets.sound]).toBeDefined();
    expect(prepareForSave(bus.deck).assets[fixtureAssets.sound]).toBeUndefined();
    bus.undo();
    expect(prepareForSave(bus.deck).assets[fixtureAssets.sound]).toBeDefined();
  });
});

describe('ids', () => {
  it('are short, prefixed and avoid ids in use', () => {
    const taken = new Set(['e_00000000']);
    let calls = 0;
    const id = ids.newId(
      'e',
      (candidate) => taken.has(candidate),
      () => (calls++ < 8 ? 0 : 0.5),
    );
    expect(id).toMatch(/^e_[0-9a-z]{8}$/);
    expect(taken.has(id)).toBe(false);
  });

  it('makes ULIDs that sort by time', () => {
    const a = ids.ulid(1_700_000_000_000);
    const b = ids.ulid(1_800_000_000_000);
    expect(a).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(a < b).toBe(true);
  });
});
