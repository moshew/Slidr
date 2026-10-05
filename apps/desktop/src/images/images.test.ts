import { createDeckApi, startTurn, type PngImage } from '@slidr/agent-tools';
import { AssetMeta, CommandBus, findElementInDeck } from '@slidr/model';
import { allElementsDeck } from '@slidr/model/fixtures';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import contract from '../../src-tauri/src/image_providers/fixtures/contract.json';
import type { AssetService } from '../document/assets';
import type { DocumentService } from '../document/documentService';
import type { ImportedAsset } from '../document/storage';
import { SECRET_NAMES } from '../settings/settings';
import { createAppImages } from './appImages';
import { createImageService } from './imageService';
import {
  IMAGE_ASPECTS,
  IMAGE_ERROR_KINDS,
  ImageError,
  chooseDefaultProvider,
  type EditJob,
  type EditSupport,
  type GenerateJob,
  type ImageCapabilities,
  type ImageClient,
  type ImageEvent,
  type ImageJobResult,
  type ImageOutcome,
  type ImageProviderDescriptor,
  type ImageProviderState,
  type ImageProviderStatus,
} from './images';
import { memoryImages } from './memoryImages';
import { memorySettings, type MemorySettings } from '../settings/memorySettings';
import { BLANK_PREVIEW } from './preview';
import { tauriImages } from './tauriImages';

const { invoke, channels } = vi.hoisted(() => ({
  invoke: vi.fn(),
  channels: [] as { onmessage?: (message: unknown) => void }[],
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke,
  Channel: class {
    onmessage?: (message: unknown) => void;
    constructor(onmessage?: (message: unknown) => void) {
      this.onmessage = onmessage;
      channels.push(this);
    }
  },
}));

const sorted = (keys: Iterable<string>) => [...keys].sort();

/** Every field of every shape, as the TS types name them. The compiler checks the names. */
const OUTCOME_FIELDS: {
  [S in ImageOutcome['status']]: (keyof Extract<ImageOutcome, { status: S }>)[];
} = {
  stored: ['status', 'asset', 'durationMs'],
  failed: ['status', 'error'],
};
const EVENT_FIELDS: { [T in ImageEvent['type']]: (keyof Extract<ImageEvent, { type: T }>)[] } = {
  started: ['type', 'index'],
  finished: ['type', 'index', 'outcome'],
};
const ASSET_FIELDS: (keyof ImportedAsset)[] = [
  'id',
  'file',
  'mime',
  'kind',
  'bytes',
  'width',
  'height',
  'name',
];

function expectOutcome(outcome: Record<string, unknown>) {
  const fields: string[] = OUTCOME_FIELDS[outcome.status as ImageOutcome['status']];
  expect(fields, `unknown status ${String(outcome.status)}`).toBeDefined();
  expect(sorted(Object.keys(outcome))).toEqual(sorted(fields));
  if (outcome.status === 'stored') {
    expect(ASSET_FIELDS).toEqual(expect.arrayContaining(Object.keys(outcome.asset as object)));
  } else {
    const error = outcome.error as { kind: string };
    expect(sorted(Object.keys(error))).toEqual(['kind', 'message']);
    expect(IMAGE_ERROR_KINDS).toContain(error.kind);
  }
}

describe('the IPC contract (src-tauri/src/image_providers/fixtures/contract.json)', () => {
  it('events and results have exactly the fields of the TS types', () => {
    for (const event of contract.events) {
      const fields: string[] = EVENT_FIELDS[event.type as ImageEvent['type']];
      expect(fields, `unknown event type ${event.type}`).toBeDefined();
      expect(sorted(Object.keys(event))).toEqual(sorted(fields));
      if (event.outcome) expectOutcome(event.outcome);
    }
    expect(sorted(new Set(contract.events.map((e) => e.type)))).toEqual(
      sorted(Object.keys(EVENT_FIELDS)),
    );
    const result: (keyof ImageJobResult)[] = ['provider', 'images'];
    expect(sorted(Object.keys(contract.result))).toEqual(sorted(result));
    contract.result.images.forEach(expectOutcome);
    expect(sorted(new Set(contract.result.images.map((o) => o.status)))).toEqual(
      sorted(Object.keys(OUTCOME_FIELDS)),
    );
  });

  it('a stored asset is an AssetMeta once its origin is added', () => {
    const [first] = contract.result.images;
    const asset = AssetMeta.parse({ ...first?.asset, origin: 'ai' });
    expect(asset).toMatchObject({ kind: 'image', width: 1672, height: 941 });
  });

  it('error kinds and aspects are the same closed sets', () => {
    expect(contract.errorKinds).toEqual([...IMAGE_ERROR_KINDS]);
    expect(sorted(Object.keys(contract.error))).toEqual(['kind', 'message']);
    expect(contract.aspects).toEqual([...IMAGE_ASPECTS]);
  });

  it('descriptors and statuses have the fields of the TS types', () => {
    const descriptor: (keyof ImageProviderDescriptor)[] = ['id', 'name', 'capabilities'];
    const capabilities: (keyof ImageCapabilities)[] = [
      'edit',
      'mask',
      'transparent',
      'maxParallel',
      'quality',
    ];
    const edits: EditSupport[] = ['regenerate', 'exact', 'none'];
    for (const d of contract.descriptors) {
      // `key` is there only for a provider that needs one.
      const optional: keyof ImageProviderDescriptor = 'key';
      expect(sorted(Object.keys(d).filter((field) => field !== optional))).toEqual(
        sorted(descriptor),
      );
      expect(sorted(Object.keys(d.capabilities))).toEqual(sorted(capabilities));
    }
    const keys = contract.descriptors.flatMap((d) => ('key' in d ? [d.key] : []));
    expect(keys).toEqual(['openai-api']);
    expect(SECRET_NAMES).toEqual(expect.arrayContaining(keys));
    expect(contract.descriptors.map((d) => d.capabilities.edit)).toEqual(edits);
    const status: (keyof ImageProviderStatus)[] = ['state', 'version', 'account', 'detail'];
    const states: ImageProviderState[] = ['ready', 'not_installed', 'not_logged_in', 'unavailable'];
    for (const s of contract.statuses) expect(sorted(Object.keys(s))).toEqual(sorted(status));
    expect(contract.statuses.map((s) => s.state)).toEqual(states);
  });

  it('the TS job types express the jobs Rust accepts', () => {
    const generate: GenerateJob[] = [
      { prompt: 'wind turbines at sunrise', count: 1, aspect: '16:9' },
      { prompt: 'a city skyline', count: 4, aspect: '9:16', provider: 'example' },
    ];
    const edit: EditJob[] = [
      { assetId: 'ab'.repeat(32), instruction: 'make it night', count: 1 },
      {
        assetId: 'ab'.repeat(32),
        instruction: 'replace the sky',
        maskAssetId: 'cd'.repeat(32),
        count: 2,
        provider: 'exact',
      },
    ];
    expect(generate).toEqual(contract.generateJobs);
    expect(edit).toEqual(contract.editJobs);
  });
});

describe('tauriImages', () => {
  beforeEach(() => {
    invoke.mockReset();
    channels.length = 0;
  });

  it('runs a job with a channel that delivers its progress', async () => {
    invoke.mockResolvedValue(contract.result);
    const received: ImageEvent[] = [];
    const job: GenerateJob = { prompt: 'a barn', count: 2, aspect: '1:1' };
    const result = await tauriImages.generate('job-1', 'w1', job, (e) => received.push(e));
    expect(result).toEqual(contract.result);
    expect(invoke).toHaveBeenCalledWith('image_generate', {
      jobId: 'job-1',
      workspaceId: 'w1',
      job,
      onEvent: channels[0],
    });
    const event: ImageEvent = { type: 'started', index: 1 };
    channels[0]?.onmessage?.(event);
    expect(received).toEqual([event]);
  });

  it('maps every call to its command', async () => {
    invoke.mockResolvedValue(undefined);
    const edit: EditJob = { assetId: 'a1', instruction: 'make it night', count: 1 };
    await tauriImages.providers();
    await tauriImages.probe('mock');
    await tauriImages.defaultProvider();
    await tauriImages.setDefaultProvider('mock');
    await tauriImages.edit('job-2', 'w1', edit);
    await tauriImages.cancel('job-2');
    expect(invoke.mock.calls).toEqual([
      ['image_providers', undefined],
      ['image_probe', { providerId: 'mock' }],
      ['image_default_provider', undefined],
      ['image_set_default_provider', { providerId: 'mock' }],
      ['image_edit', { jobId: 'job-2', workspaceId: 'w1', job: edit, onEvent: channels[0] }],
      ['image_cancel', { jobId: 'job-2' }],
    ]);
  });

  it('rejects with ImageError', async () => {
    invoke.mockRejectedValueOnce({ kind: 'unsupported', message: 'no masks' });
    const refused = tauriImages.edit('j', 'w', { assetId: 'a', instruction: 'x', count: 1 });
    await expect(refused).rejects.toBeInstanceOf(ImageError);
    await expect(refused).rejects.toMatchObject({ kind: 'unsupported', message: 'no masks' });

    invoke.mockRejectedValueOnce({ kind: 'no_such_kind', message: 'x' });
    await expect(tauriImages.cancel('j')).rejects.toMatchObject({ kind: 'internal' });
    invoke.mockRejectedValueOnce('IPC failed');
    await expect(tauriImages.cancel('j')).rejects.toMatchObject({
      kind: 'internal',
      message: 'IPC failed',
    });
  });
});

const png: PngImage = { mimeType: 'image/png', data: 'cHJldmlldw==', width: 512, height: 288 };

function imported(n: string): ImportedAsset {
  const id = n.repeat(64);
  return {
    id,
    file: `${id}.png`,
    mime: 'image/png',
    kind: 'image',
    bytes: 10,
    width: 1672,
    height: 941,
  };
}

const stored = (n: string): ImageOutcome => ({
  status: 'stored',
  asset: imported(n),
  durationMs: 48_500,
});
const failed = (kind: ImageError['kind'], message: string = kind): ImageOutcome => ({
  status: 'failed',
  error: { kind, message },
});

/** A client whose jobs end with the given outcomes. */
function fakeClient(outcomes: ImageOutcome[]) {
  const result: ImageJobResult = { provider: 'example', images: outcomes };
  const never = () => Promise.reject(new Error('unused'));
  const client = {
    providers: never,
    probe: never,
    defaultProvider: never,
    setDefaultProvider: never,
    generate: vi.fn<ImageClient['generate']>((_jobId, _workspaceId, _job, onEvent) => {
      onEvent?.({ type: 'started', index: 0 });
      return Promise.resolve(result);
    }),
    edit: vi.fn<ImageClient['edit']>(() => Promise.resolve(result)),
    cancel: vi.fn<ImageClient['cancel']>(() => Promise.resolve()),
  } satisfies ImageClient;
  return client;
}

function service(client: ImageClient, workspaceId: string | null = 'w1') {
  const preview = vi.fn((_asset: AssetMeta) => Promise.resolve(png));
  const events: [string, ImageEvent][] = [];
  const images = createImageService({
    client,
    workspaceId: () => workspaceId,
    preview,
    onEvent: (jobId, event) => events.push([jobId, event]),
  });
  return { images, preview, events };
}

describe('createImageService', () => {
  it('returns the stored images as assets with their lineage and a preview', async () => {
    const client = fakeClient([stored('b'), stored('c')]);
    const { images, preview, events } = service(client);
    const made = await images.generate({ prompt: 'a red barn', count: 2, aspect: '16:9' });

    const [jobId, workspaceId, job] = client.generate.mock.calls[0]!;
    expect(jobId).toMatch(/^[\w-]{1,64}$/);
    expect([workspaceId, job]).toEqual(['w1', { prompt: 'a red barn', count: 2, aspect: '16:9' }]);
    expect(made.map((m) => m.asset.id)).toEqual(['b'.repeat(64), 'c'.repeat(64)]);
    for (const { asset, preview: shown } of made) {
      // What `asset.add` takes: the schema is strict.
      expect(AssetMeta.parse(asset)).toEqual(asset);
      expect(asset).toMatchObject({
        origin: 'ai',
        lineage: { provider: 'example', prompt: 'a red barn' },
      });
      expect(shown).toBe(png);
    }
    expect(preview).toHaveBeenCalledTimes(2);
    expect(events).toEqual([[jobId, { type: 'started', index: 0 }]]);
  });

  it('keeps what was made when some images failed, and rejects when none was', async () => {
    const partly = service(fakeClient([failed('timeout'), stored('b'), failed('quota')]));
    const made = await partly.images.generate({ prompt: 'x', count: 3, aspect: '1:1' });
    expect(made.map((m) => m.asset.id)).toEqual(['b'.repeat(64)]);

    const none = service(fakeClient([failed('quota', 'limit reached'), failed('timeout')]));
    const rejected = none.images.generate({ prompt: 'x', count: 2, aspect: '1:1' });
    await expect(rejected).rejects.toBeInstanceOf(ImageError);
    await expect(rejected).rejects.toMatchObject({ kind: 'quota', message: 'limit reached' });

    const empty = service(fakeClient([]));
    await expect(
      empty.images.generate({ prompt: 'x', count: 1, aspect: '1:1' }),
    ).rejects.toMatchObject({ kind: 'internal' });
  });

  it('gives nothing of a cancelled job, even what was made before the cancel', async () => {
    const { images, preview } = service(fakeClient([stored('b'), failed('cancelled')]));
    await expect(images.generate({ prompt: 'x', count: 2, aspect: '1:1' })).rejects.toMatchObject({
      kind: 'cancelled',
    });
    expect(preview).not.toHaveBeenCalled();
  });

  it('cancels the jobs that are still running', async () => {
    const client = fakeClient([failed('cancelled')]);
    let finish: (result: ImageJobResult) => void = () => undefined;
    client.generate.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    const { images } = service(client);
    await images.cancel();
    expect(client.cancel).not.toHaveBeenCalled();

    const pending = images.generate({ prompt: 'x', count: 1, aspect: '1:1' });
    await images.cancel();
    expect(client.cancel).toHaveBeenCalledWith(client.generate.mock.calls[0]![0]);
    finish({ provider: 'example', images: [failed('cancelled')] });
    await expect(pending).rejects.toMatchObject({ kind: 'cancelled' });
    // Nothing is running any more.
    client.cancel.mockClear();
    await images.cancel();
    expect(client.cancel).not.toHaveBeenCalled();
  });

  it('edit names the source in the lineage and passes a mask only when given', async () => {
    const client = fakeClient([stored('d')]);
    const { images } = service(client);
    const source = 'a'.repeat(64);
    const [made] = await images.edit({ assetId: source, instruction: 'make it night', count: 1 });
    expect(client.edit.mock.calls[0]![2]).toEqual({
      assetId: source,
      instruction: 'make it night',
      count: 1,
    });
    expect(made?.asset.lineage).toEqual({
      provider: 'example',
      prompt: 'make it night',
      parentAssetId: source,
    });
    expect(AssetMeta.parse(made?.asset)).toEqual(made?.asset);

    // A provider without masks refuses the job; the refusal reaches the caller as it is.
    client.edit.mockRejectedValueOnce(new ImageError('unsupported', 'cannot edit inside a mask'));
    const masked = images.edit({ assetId: source, instruction: 'x', maskAssetId: 'm', count: 1 });
    await expect(masked).rejects.toMatchObject({ kind: 'unsupported' });
    expect(client.edit.mock.calls[1]![2]).toMatchObject({ maskAssetId: 'm' });
  });

  it('needs an open document, survives a failed preview, and has no image processing yet', async () => {
    const closed = service(fakeClient([stored('b')]), null);
    await expect(
      closed.images.generate({ prompt: 'x', count: 1, aspect: '1:1' }),
    ).rejects.toMatchObject({ kind: 'unknown_workspace' });

    const { images, preview } = service(fakeClient([stored('b')]));
    preview.mockRejectedValueOnce(new Error('tainted canvas'));
    const [made] = await images.generate({ prompt: 'x', count: 1, aspect: '1:1' });
    expect(made?.preview).toBe(BLANK_PREVIEW);

    await expect(
      images.process({ assetId: 'b'.repeat(64), operation: 'removeBackground' }),
    ).rejects.toMatchObject({ kind: 'unsupported' });
  });

  it('serves the image tools of the Deck API', async () => {
    const bus = new CommandBus(allElementsDeck(), { validate: true });
    const client = fakeClient([stored('b'), stored('c')]);
    const { images } = service(client);
    const api = createDeckApi(bus, { images });
    const turn = startTurn('sess', {
      kind: 'object',
      slideId: 's_all',
      elementIds: ['e_image_pending'],
    });

    const result = await api.call(turn, 'image_generate', {
      prompt: 'a blue gradient',
      count: 2,
      elementId: 'e_image_pending',
    });
    if (!result.ok) throw new Error(result.error.message);
    expect(result.images).toEqual([png, png]);
    // Both images are assets of the deck; the first one fills the placeholder.
    const first = bus.deck.assets['b'.repeat(64)];
    expect(first).toMatchObject({ origin: 'ai', lineage: { provider: 'example' } });
    // The prompt kept with the asset is the one that was sent: the tool added the palette.
    expect(first?.lineage?.prompt).toMatch(/^a blue gradient\n\nThe presentation's palette is /);
    expect(bus.deck.assets['c'.repeat(64)]).toBeDefined();
    expect(findElementInDeck(bus.deck, 'e_image_pending')?.element).toMatchObject({
      assetId: 'b'.repeat(64),
    });

    // A failure is what the agent reads as the result of its call.
    client.generate.mockResolvedValueOnce({
      provider: 'example',
      images: [failed('not_logged_in', 'The CLI is not signed in. Run its login.')],
    });
    const refused = await api.call(turn, 'image_generate', { prompt: 'again' });
    expect(refused).toMatchObject({
      ok: false,
      error: { code: 'failed', message: 'The CLI is not signed in. Run its login.' },
    });
  });
});

describe('createAppImages', () => {
  beforeEach(() => {
    invoke.mockReset();
    channels.length = 0;
  });

  const assets: AssetService = {
    import: () => Promise.reject(new Error('unused')),
    url: () => undefined,
  };

  it('goes through IPC into the workspace of the open document', async () => {
    const document = { workspace: { id: 'w1', dir: 'C:/w1', sourcePath: null } };
    const images = createAppImages(document as unknown as DocumentService, assets);
    expect(images.client).toBe(tauriImages);
    expect(images.workspaceId()).toBe('w1');

    invoke.mockResolvedValue({ provider: 'example', images: [stored('b')] });
    const [made] = await images.service.generate({ prompt: 'a barn', count: 1, aspect: '4:3' });
    expect(invoke).toHaveBeenCalledWith(
      'image_generate',
      expect.objectContaining({
        workspaceId: 'w1',
        job: { prompt: 'a barn', count: 1, aspect: '4:3' },
      }),
    );
    // The asset has no URL here, so there is no preview to make; the image is still returned.
    expect(made).toMatchObject({
      asset: { id: 'b'.repeat(64), origin: 'ai' },
      preview: BLANK_PREVIEW,
    });

    const closed = createAppImages({ workspace: null } as unknown as DocumentService, assets);
    await expect(
      closed.service.generate({ prompt: 'a barn', count: 1, aspect: '4:3' }),
    ).rejects.toMatchObject({ kind: 'unknown_workspace' });
  });

  it('paints in memory when there is no document service', async () => {
    const images = createAppImages(null, assets);
    expect(images.client).not.toBe(tauriImages);
    expect(images.workspaceId()).toBe('memory');
    expect(await images.client.defaultProvider()).toBe('mock');
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('memoryImages', () => {
  /** An asset store that names each file by its content. */
  function fakeAssets(): AssetService {
    return {
      import: async (file, origin = 'upload') => {
        const id = (await file.text()).padEnd(64, '0');
        return { id, file: `${id}.png`, mime: file.type, kind: 'image', bytes: file.size, origin };
      },
      url: () => undefined,
    };
  }

  function client(delayMs = 20, settings?: MemorySettings) {
    const painted: { width: number; height: number; seed: number }[] = [];
    const images = memoryImages(fakeAssets(), {
      delayMs,
      paint: (placeholder) => {
        painted.push(placeholder);
        return Promise.resolve(new Blob([`p${placeholder.seed}`], { type: 'image/png' }));
      },
      ...(settings ? { settings } : {}),
    });
    return { images, painted };
  }

  it('paints a different placeholder of the requested shape for each image', async () => {
    const { images, painted } = client();
    const events: ImageEvent[] = [];
    const job: GenerateJob = { prompt: 'a barn', count: 3, aspect: '9:16' };
    const result = await images.generate('job-1', 'none', job, (e) => events.push(e));
    expect(result.provider).toBe('mock');
    expect(result.images.map((o) => o.status)).toEqual(['stored', 'stored', 'stored']);
    const ids = result.images.map((o) => (o.status === 'stored' ? o.asset.id : ''));
    expect(new Set(ids).size).toBe(3);
    expect(painted.map((p) => [p.width, p.height])).toEqual(Array(3).fill([360, 640]));
    expect(events.filter((e) => e.type === 'started')).toHaveLength(3);
    expect(events.filter((e) => e.type === 'finished')).toHaveLength(3);
    // The first provider is the default until another is chosen.
    expect((await images.providers()).map((p) => p.id)).toEqual(['mock', 'mock-api']);
    expect(await images.defaultProvider()).toBe('mock');
  });

  it('has a provider that needs a key, and makes images where the settings say', async () => {
    const settings = memorySettings();
    const { images } = client(5, settings);
    const run = (provider?: string) =>
      images.generate(crypto.randomUUID(), 'none', {
        prompt: 'a barn',
        count: 1,
        aspect: '1:1',
        ...(provider ? { provider } : {}),
      });
    const statusOf = async (result: Promise<ImageJobResult>) => {
      const [outcome] = (await result).images;
      return outcome?.status === 'failed' ? outcome.error.kind : outcome?.status;
    };

    // Without its key the provider says so, and makes nothing.
    expect(await images.probe('mock-api')).toMatchObject({ state: 'not_logged_in' });
    expect(await statusOf(run('mock-api'))).toBe('not_logged_in');
    expect(await images.probe('mock')).toMatchObject({ state: 'ready' });

    await settings.setSecret('openai-api', 'sk-test-0123456789');
    expect(await images.probe('mock-api')).toMatchObject({ state: 'ready', account: 'API key' });

    // The choice is kept in the settings, next to what else the section holds, and a job that
    // names no provider goes where it says.
    await settings.write('images', { quality: 'high' });
    expect((await run()).provider).toBe('mock');
    await images.setDefaultProvider('mock-api');
    expect((await settings.read()).images).toEqual({
      quality: 'high',
      defaultProvider: 'mock-api',
    });
    expect(await images.defaultProvider()).toBe('mock-api');
    const made = await run();
    expect(made.provider).toBe('mock-api');
    expect(await statusOf(Promise.resolve(made))).toBe('stored');
    // A job that names a provider still goes there.
    expect((await run('mock')).provider).toBe('mock');

    // The key removed: the same job fails again, at once.
    await settings.deleteSecret('openai-api');
    expect(await statusOf(run())).toBe('not_logged_in');
  });

  it('fails as the prompt asks, and stops a job that is cancelled', async () => {
    const { images } = client();
    const kinds = (result: ImageJobResult) =>
      result.images.map((o) => (o.status === 'failed' ? o.error.kind : o.status));
    const run = (jobId: string, prompt: string, count: number) =>
      images.generate(jobId, 'none', { prompt, count, aspect: '1:1' });

    expect(kinds(await run('a', 'mock:quota', 2))).toEqual(['quota', 'quota']);
    expect(kinds(await run('b', 'mock:flaky', 3))).toEqual([
      'generation_failed',
      'stored',
      'stored',
    ]);

    const hanging = run('c', 'mock:hang', 2);
    await expect(run('c', 'x', 1)).rejects.toMatchObject({ kind: 'invalid_input' });
    await images.cancel('c');
    expect(kinds(await hanging)).toEqual(['cancelled', 'cancelled']);
    await expect(run('d', ' ', 1)).rejects.toMatchObject({ kind: 'invalid_input' });
    await expect(run('d', 'x', 9)).rejects.toMatchObject({ kind: 'invalid_input' });
    await expect(images.setDefaultProvider('nope')).rejects.toMatchObject({
      kind: 'unknown_provider',
    });
  });
});

describe('choosing the default provider', () => {
  it('is a choice that was made once the core took it, even if the settings are not read back', async () => {
    const setDefaultProvider = vi.fn(() => Promise.resolve());
    const unread = vi.fn(() => Promise.reject(new Error('the settings could not be read')));
    // The core saved the choice: the screen must not put the old one back and call it a failure.
    expect(await chooseDefaultProvider({ setDefaultProvider }, 'openai-api', unread)).toBe(true);
    expect(setDefaultProvider).toHaveBeenCalledWith('openai-api');
    expect(unread).toHaveBeenCalledTimes(1);
  });

  it('is not made when the core refuses it, and nothing is read back then', async () => {
    const refused = vi.fn(() =>
      Promise.reject(new ImageError('invalid_input', 'no such provider')),
    );
    const refresh = vi.fn(() => Promise.resolve());
    expect(await chooseDefaultProvider({ setDefaultProvider: refused }, 'nope', refresh)).toBe(
      false,
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});
