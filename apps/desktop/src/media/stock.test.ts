import { AssetMeta } from '@slidr/model';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import contract from '../../src-tauri/src/stock/fixtures/contract.json';
import type { AssetService } from '../document/assets';
import { memorySettings } from '../settings/memorySettings';
import { elementForAsset } from '../stage/insert';
import { createStockService } from './appStock';
import { memoryStock } from './memoryStock';
import {
  creditOf,
  STOCK_ERROR_KINDS,
  STOCK_ORIENTATIONS,
  stockAsset,
  StockError,
  type ImportedPhoto,
  type StockPhoto,
  type StockQuery,
  type StockResults,
  type StockSource,
} from './stock';
import { tauriStock } from './tauriStock';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock('@tauri-apps/api/core', () => ({ invoke, isTauri: () => false }));

const sorted = (keys: Iterable<string>) => [...keys].sort();

describe('the IPC contract (src-tauri/src/stock/fixtures/contract.json)', () => {
  it('sources, results and imports have exactly the fields of the TS types', () => {
    const source: (keyof StockSource)[] = ['id', 'name', 'homeUrl', 'license', 'state'];
    for (const listed of contract.sources) {
      // `key` is there only for a source that needs one.
      expect(sorted(Object.keys(listed).filter((field) => field !== 'key'))).toEqual(
        sorted(source),
      );
    }
    expect(contract.sources.map((listed) => listed.state)).toEqual(['ready', 'no_key']);

    const results: (keyof StockResults)[] = ['source', 'photos', 'total', 'page', 'hasMore'];
    expect(sorted(Object.keys(contract.results))).toEqual(sorted(results));
    const photo: (keyof StockPhoto)[] = [
      'id',
      'source',
      'width',
      'height',
      'color',
      'description',
      'author',
      'authorUrl',
      'pageUrl',
    ];
    for (const found of contract.results.photos) {
      expect(sorted(Object.keys(found))).toEqual(sorted(photo));
    }

    const imported: (keyof ImportedPhoto)[] = ['asset', 'attribution', 'description'];
    expect(sorted(Object.keys(contract.imported))).toEqual(sorted(imported));
  });

  it('error kinds, orientations and queries are what Rust accepts', () => {
    expect(contract.errorKinds).toEqual([...STOCK_ERROR_KINDS]);
    expect(sorted(Object.keys(contract.error))).toEqual(['kind', 'message']);
    const queries: StockQuery[] = [
      { query: 'wheat field' },
      { query: 'harbour at dawn', page: 3, perPage: 12, orientation: 'portrait' },
    ];
    expect(queries).toEqual(contract.queries);
    expect(STOCK_ORIENTATIONS).toContain(contract.queries[1]?.orientation);
  });

  it('a photo taken in is an AssetMeta with its credit', () => {
    const asset = stockAsset(contract.imported as ImportedPhoto);
    expect(AssetMeta.parse(asset)).toMatchObject({
      origin: 'stock',
      kind: 'image',
      name: 'A man drinking a coffee.',
      attribution: { author: 'Jeff Sheldon', license: 'Example License' },
    });
    // The credit as the libraries ask it to read: the photographer, and the library.
    expect(creditOf(asset)).toEqual({
      author: 'Jeff Sheldon',
      library: 'Example',
      url: 'https://example.com/@ugmonk?utm_source=slidr&utm_medium=referral',
    });
    expect(creditOf({ ...asset, attribution: undefined })).toBeUndefined();
  });

  it('a photo is named on the slide by the whole description the library gave it', () => {
    // A description is a sentence, and a full stop in it is not the dot of a file extension.
    for (const description of ['Sunset over Mt. Fuji', 'A man drinking a coffee.', 'Version 2.0']) {
      const asset = stockAsset({ ...(contract.imported as ImportedPhoto), description });
      const element = elementForAsset(asset, { w: 1920, h: 1080 }, { x: 960, y: 540 });
      expect(element).toMatchObject({ type: 'image', name: description, alt: description });
    }
    // A file is still named without its extension, whatever else its name holds.
    const named = (name: string) =>
      elementForAsset(
        { ...stockAsset(contract.imported as ImportedPhoto), origin: 'upload', name },
        { w: 1920, h: 1080 },
        { x: 960, y: 540 },
      )?.name;
    expect(named('IMG_0001.jpg')).toBe('IMG_0001');
    expect(named('trip.to.mt.fuji.JPEG')).toBe('trip.to.mt.fuji');
    expect(named('Trip to Mt. Fuji')).toBe('Trip to Mt. Fuji');
  });
});

describe('tauriStock', () => {
  beforeEach(() => invoke.mockReset());

  it('names a photo by source and id, and never passes an address', async () => {
    invoke.mockResolvedValueOnce(contract.results);
    await tauriStock.search(null, { query: 'coffee', perPage: 4 });
    expect(invoke).toHaveBeenLastCalledWith('stock_search', {
      source: null,
      query: { query: 'coffee', perPage: 4 },
    });

    // A thumbnail arrives as bytes; its type is read from them.
    invoke.mockResolvedValueOnce(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer);
    const png = await tauriStock.thumbnail('example', 'eOLpJytrbsQ');
    expect(invoke).toHaveBeenLastCalledWith('stock_thumbnail', {
      source: 'example',
      id: 'eOLpJytrbsQ',
    });
    expect([png.type, png.size]).toEqual(['image/png', 4]);
    invoke.mockResolvedValueOnce(new Uint8Array([0xff, 0xd8, 0xff]).buffer);
    expect((await tauriStock.thumbnail('example', 'x')).type).toBe('image/jpeg');

    invoke.mockResolvedValueOnce(contract.imported);
    await tauriStock.import('w1', 'example', 'eOLpJytrbsQ');
    expect(invoke).toHaveBeenLastCalledWith('stock_import', {
      workspaceId: 'w1',
      source: 'example',
      id: 'eOLpJytrbsQ',
    });
    for (const [, args] of invoke.mock.calls) {
      expect(JSON.stringify(args ?? {})).not.toMatch(/https?:/);
    }
  });

  it('turns what Rust rejects with into a StockError', async () => {
    invoke.mockRejectedValueOnce(contract.error);
    const rejected = tauriStock.search(null, { query: 'x' });
    await expect(rejected).rejects.toBeInstanceOf(StockError);
    await expect(rejected).rejects.toMatchObject({ kind: 'no_key' });
    invoke.mockRejectedValueOnce(new Error('boom'));
    await expect(tauriStock.sources()).rejects.toMatchObject({ kind: 'internal' });
  });
});

/** An asset store that names each file by its content. */
function fakeAssets(): AssetService {
  return {
    import: async (file, origin = 'upload') => {
      const id = (await file.text()).padEnd(64, '0');
      return {
        id,
        file: `${id}.png`,
        mime: file.type,
        kind: 'image',
        bytes: file.size,
        origin,
        width: 1200,
        height: 800,
      };
    },
    url: () => undefined,
  };
}

function library(settings = memorySettings()) {
  const stock = memoryStock(fakeAssets(), {
    delayMs: 0,
    paint: (picture) => Promise.resolve(new Blob([`p${picture.seed}`], { type: 'image/png' })),
    settings,
  });
  return { stock, settings };
}

describe('memoryStock', () => {
  it('finds photos in pages, each with a photographer to credit', async () => {
    const { stock } = library();
    const first = await stock.search(null, { query: 'wheat field', perPage: 20 });
    expect(first).toMatchObject({ source: 'mock', total: 57, page: 1, hasMore: true });
    expect(first.photos).toHaveLength(20);
    const last = await stock.search(null, { query: 'wheat field', page: 3, perPage: 20 });
    expect([last.photos.length, last.hasMore]).toEqual([17, false]);
    // The same query finds the same photos.
    const again = await stock.search(null, { query: 'wheat field', perPage: 20 });
    expect(again.photos[0]).toEqual(first.photos[0]);

    const tall = await stock.search(null, { query: 'tower', orientation: 'portrait', perPage: 5 });
    expect(tall.photos.every((photo) => photo.height > photo.width)).toBe(true);

    const photo = first.photos[0]!;
    expect((await stock.thumbnail('mock', photo.id)).type).toBe('image/png');
    const taken = await stock.import('memory', 'mock', photo.id);
    expect(AssetMeta.parse(stockAsset(taken))).toMatchObject({
      origin: 'stock',
      attribution: { author: photo.author, url: photo.pageUrl, license: 'Mock License' },
      name: 'wheat field, photo 1',
    });
  });

  it('fails as the query asks, and knows only what it found', async () => {
    const { stock } = library();
    const kind = (query: string) =>
      stock.search(null, { query }).then(
        () => 'found',
        (error: unknown) => (error instanceof StockError ? error.kind : 'other'),
      );
    expect(await kind('mock:rate_limit')).toBe('rate_limit');
    expect(await kind('mock:invalid_key')).toBe('invalid_key');
    expect(await kind('mock:offline')).toBe('network');
    expect(await kind('  ')).toBe('invalid_input');
    expect((await stock.search(null, { query: 'mock:empty' })).photos).toEqual([]);
    await expect(stock.thumbnail('mock', 'nope')).rejects.toMatchObject({ kind: 'not_found' });
    await expect(stock.search('nowhere', { query: 'x' })).rejects.toMatchObject({
      kind: 'unknown_source',
    });
  });

  it('has a library that needs a key, and searches where the settings say', async () => {
    const { stock, settings } = library();
    const states = async () => (await stock.sources()).map((s) => [s.id, s.state, s.key]);
    expect(await states()).toEqual([
      ['mock', 'ready', undefined],
      ['mock-keyed', 'no_key', 'unsplash'],
    ]);
    await expect(stock.search('mock-keyed', { query: 'x' })).rejects.toMatchObject({
      kind: 'no_key',
    });

    await settings.setSecret('unsplash', 'unsplash-key-0123456789');
    expect((await states())[1]).toEqual(['mock-keyed', 'ready', 'unsplash']);
    // The first library that is ready, until the settings name one.
    expect(await stock.defaultSource()).toBe('mock');
    await settings.write('stock', { source: 'mock-keyed' });
    expect(await stock.defaultSource()).toBe('mock-keyed');
    expect((await stock.search(null, { query: 'x' })).source).toBe('mock-keyed');
  });
});

describe('createStockService', () => {
  const png = { mimeType: 'image/png' as const, data: 'AAAA', width: 1, height: 1 };

  it('takes the best matches into the deck, each with its credit and a preview', async () => {
    const { stock } = library();
    const preview = vi.fn(() => Promise.resolve(png));
    const service = createStockService({ client: stock, workspaceId: () => 'memory', preview });
    const found = await service.search({ query: 'harbour', count: 3, orientation: 'landscape' });
    expect(found).toHaveLength(3);
    for (const { asset, preview: shown } of found) {
      expect(AssetMeta.parse(asset)).toMatchObject({ origin: 'stock' });
      expect(asset.attribution?.author).toBeTruthy();
      expect(shown).toBe(png);
    }
    expect(preview).toHaveBeenCalledTimes(3);

    // Nothing found is an empty answer, not a failure.
    expect(await service.search({ query: 'mock:empty', count: 3 })).toEqual([]);
  });

  it('passes on why nothing could be taken, and needs an open document', async () => {
    const { stock } = library();
    const service = createStockService({
      client: stock,
      workspaceId: () => 'memory',
      preview: () => Promise.reject(new Error('no preview')),
    });
    await expect(service.search({ query: 'mock:rate_limit', count: 2 })).rejects.toMatchObject({
      kind: 'rate_limit',
    });
    // A preview that fails does not fail the photo.
    const [first] = await service.search({ query: 'harbour', count: 1 });
    expect(first?.preview.data).toBeTruthy();

    const closed = createStockService({
      client: stock,
      workspaceId: () => null,
      preview: () => Promise.resolve(png),
    });
    await expect(closed.search({ query: 'x', count: 1 })).rejects.toMatchObject({
      kind: 'unknown_workspace',
    });
  });
});
