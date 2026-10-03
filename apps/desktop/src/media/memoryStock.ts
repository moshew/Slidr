import type { AssetService } from '../document/assets';
import type { MemorySettings } from '../settings/memorySettings';
import {
  StockError,
  type ImportedPhoto,
  type StockClient,
  type StockErrorKind,
  type StockPhoto,
  type StockSource,
} from './stock';

export interface MemoryStockOptions {
  /** How long a search takes. Default 400. */
  delayMs?: number;
  /** Paints a picture. The default draws a gradient on a canvas, which tests do not have. */
  paint?: (picture: { width: number; height: number; seed: number }) => Promise<Blob>;
  /** The page's settings: the user's choice of source, and whether a source's key is stored. */
  settings?: MemorySettings;
}

type Descriptor = Omit<StockSource, 'state'>;

/** The library every page has. */
const OPEN: Descriptor = {
  id: 'mock',
  name: 'Mock photos',
  homeUrl: 'https://example.com/mock-photos',
  license: 'Mock License',
};

/** A second library, in the place of one that needs the user's key. */
const KEYED: Descriptor = {
  id: 'mock-keyed',
  name: 'Keyed photos',
  homeUrl: 'https://example.com/keyed-photos',
  license: 'Keyed License',
  key: 'unsplash',
};

const SOURCES = [OPEN, KEYED];

/** How many photos every query finds. */
const TOTAL = 57;
const AUTHORS = ['Dana Levi', 'Omar Haddad', 'Mika Tanaka', 'Sam Carter'];

/** The words that make the Rust mock library fail make this one fail the same way. */
const FAILURES: [string, StockErrorKind][] = [
  ['mock:rate_limit', 'rate_limit'],
  ['mock:invalid_key', 'invalid_key'],
  ['mock:offline', 'network'],
];

const hash = (text: string) =>
  [...text].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 1_000_003, 7);

const hue = (seed: number, turn: number) => (seed * 47 + turn * 151) % 360;

async function paintGradient(picture: { width: number; height: number; seed: number }) {
  const canvas = document.createElement('canvas');
  canvas.width = picture.width;
  canvas.height = picture.height;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('no 2d canvas');
  const gradient = g.createLinearGradient(0, 0, picture.width, picture.height);
  gradient.addColorStop(0, `hsl(${hue(picture.seed, 0)} 55% 60%)`);
  gradient.addColorStop(1, `hsl(${hue(picture.seed, 1)} 60% 30%)`);
  g.fillStyle = gradient;
  g.fillRect(0, 0, picture.width, picture.height);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('no image'))), 'image/png');
  });
}

/** The shape of photo `number`: the one asked for, or a mix when none was. */
function shapeOf(orientation: string | null | undefined, number: number): [number, number] {
  const shape = orientation ?? ['landscape', 'portrait', 'square'][number % 3];
  if (shape === 'portrait') return [1600, 2400];
  if (shape === 'square') return [2000, 2000];
  return [2400, 1600];
}

/**
 * The photo libraries without the Rust core: in a plain browser (the Vite page, Playwright),
 * libraries that draw their pictures. The browser's counterpart of the Rust mock library: every
 * query finds 57 photos, each a gradient credited to one of four made-up photographers, and the
 * same words in the query pick a failure (`mock:empty`, `mock:rate_limit`, `mock:invalid_key`,
 * `mock:offline`).
 *
 * There are two: `mock`, which is ready at once, and `mock-keyed`, which needs a key from the
 * page's settings, as a real library does.
 */
export function memoryStock(assets: AssetService, options: MemoryStockOptions = {}): StockClient {
  const delayMs = options.delayMs ?? 400;
  const paint = options.paint ?? paintGradient;
  const { settings } = options;
  /** What the searches found, by source and id: what a thumbnail or an import refers to. */
  const found = new Map<string, StockPhoto>();

  const ready = (source: Descriptor) => !source.key || (settings?.hasSecret(source.key) ?? false);
  const listed = (): StockSource[] =>
    SOURCES.map((source) => ({ ...source, state: ready(source) ? 'ready' : 'no_key' }));

  async function defaultSource(): Promise<string> {
    const stored = settings ? (await settings.read()).stock : undefined;
    const chosen =
      typeof stored === 'object' && stored !== null && 'source' in stored ? stored.source : null;
    if (typeof chosen === 'string' && SOURCES.some((source) => source.id === chosen)) return chosen;
    return (SOURCES.find(ready) ?? OPEN).id;
  }

  function sourceOf(id: string): Descriptor {
    const source = SOURCES.find((candidate) => candidate.id === id);
    if (!source) throw new StockError('unknown_source', `unknown photo source: ${id}`);
    return source;
  }

  function photoOf(source: string, id: string): StockPhoto {
    sourceOf(source);
    const photo = found.get(`${source}/${id}`);
    if (!photo) {
      throw new StockError(
        'not_found',
        'the photo is not among the recent search results; search again',
      );
    }
    return photo;
  }

  const picture = (photo: StockPhoto, long: number) => {
    const scale = long / Math.max(photo.width, photo.height);
    return paint({
      width: Math.round(photo.width * scale),
      height: Math.round(photo.height * scale),
      seed: hash(photo.id),
    });
  };

  return {
    sources: () => Promise.resolve(listed()),
    defaultSource,

    search: async (sourceId, query) => {
      const text = query.query.trim();
      const page = query.page ?? 1;
      const perPage = query.perPage ?? 20;
      if (!text) throw new StockError('invalid_input', 'the query is empty');
      if (perPage < 1 || perPage > 30 || page < 1) {
        throw new StockError('invalid_input', 'perPage must be between 1 and 30');
      }
      const source = sourceOf(sourceId ?? (await defaultSource()));
      if (!ready(source)) {
        throw new StockError(
          'no_key',
          `No ${source.name} key is stored. The user can enter one in Settings.`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      const failure = FAILURES.find(([word]) => text.includes(word));
      if (failure) {
        throw new StockError(failure[1], `the mock library was asked to fail (${failure[0]})`);
      }
      const total = text.includes('mock:empty') ? 0 : TOTAL;
      const first = (page - 1) * perPage;
      const last = Math.min(first + perPage, total);
      const photos: StockPhoto[] = [];
      for (let number = first; number < last; number++) {
        const [width, height] = shapeOf(query.orientation, number);
        const author = AUTHORS[number % AUTHORS.length]!;
        const id = hash(`${text}/${number}`).toString(16).padStart(6, '0');
        const photo: StockPhoto = {
          id,
          source: source.id,
          width,
          height,
          color: `hsl(${hue(hash(id), 0)} 55% 60%)`,
          description: `${text}, photo ${number + 1}`,
          author,
          authorUrl: `${source.homeUrl}/@${author.toLowerCase().replace(' ', '-')}`,
          pageUrl: `${source.homeUrl}/${id}`,
        };
        found.set(`${source.id}/${id}`, photo);
        photos.push(photo);
      }
      return { source: source.id, photos, total, page, hasMore: last < total };
    },

    thumbnail: async (source, id) => picture(photoOf(source, id), 240),

    import: async (_workspaceId, source, id): Promise<ImportedPhoto> => {
      const photo = photoOf(source, id);
      const blob = await picture(photo, 1200);
      const file = new File([blob], `${source}-${id}.png`, { type: blob.type || 'image/png' });
      const { origin: _origin, ...asset } = await assets.import(file, 'stock');
      return {
        asset,
        attribution: {
          author: photo.author,
          url: photo.pageUrl,
          license: sourceOf(source).license,
        },
        description: photo.description,
      };
    },
  };
}
