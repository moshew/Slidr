import type { ImageService } from '@slidr/agent-tools';
import type { AssetMeta } from '@slidr/model';
import { describe, expect, it, vi } from 'vitest';
import contract from '../../src-tauri/src/image_process/fixtures/contract.json';
import type { ImportedAsset } from '../document/storage';
import { createImageService } from './imageService';
import { ImageError, type ImageClient } from './images';
import {
  clearBorderColour,
  type ImageProcessClient,
  type ProcessOperation,
  type ProcessResult,
  type ProcessStatus,
} from './process';

/** A picture of one colour with a square of another in the middle, as a canvas would hand it. */
function picture(size: number, background: number[], subject: number[], hole = false): ImageData {
  const data = new Uint8ClampedArray(size * size * 4);
  const inside = (x: number, y: number) =>
    x >= size / 4 && x < (size * 3) / 4 && y >= size / 4 && y < (size * 3) / 4;
  const centre = (x: number, y: number) => Math.abs(x - size / 2) < 2 && Math.abs(y - size / 2) < 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const colour = inside(x, y) && !(hole && centre(x, y)) ? subject : background;
      data.set([...colour, 255], (y * size + x) * 4);
    }
  }
  // Node has no ImageData class: the shape of one is all the function reads.
  return { width: size, height: size, data, colorSpace: 'srgb' };
}

const alphaAt = (image: ImageData, x: number, y: number) =>
  image.data[(y * image.width + x) * 4 + 3];

describe('the stand-in of a plain browser', () => {
  it('takes the colour of the border out, and leaves the subject', () => {
    const image = picture(16, [0, 255, 0], [200, 30, 30]);
    expect(clearBorderColour(image)).toBe('#00ff00');
    expect(alphaAt(image, 0, 0)).toBe(0);
    expect(alphaAt(image, 15, 8)).toBe(0);
    expect(alphaAt(image, 8, 8)).toBe(255);
  });

  it('keeps the background colour where the subject encloses it', () => {
    const image = picture(16, [0, 255, 0], [200, 30, 30], true);
    clearBorderColour(image);
    expect(alphaAt(image, 8, 8)).toBe(255);
  });

  it('takes a colour near the border colour too, within the tolerance', () => {
    const image = picture(16, [0, 250, 4], [200, 30, 30]);
    image.data.set([10, 255, 0, 255], (1 * 16 + 1) * 4);
    clearBorderColour(image);
    expect(alphaAt(image, 1, 1)).toBe(0);
  });
});

describe('the contract with the Rust core', () => {
  it('takes the operations, the results and the statuses the fixture pins', () => {
    const operations: ProcessOperation[] = contract.operations as ProcessOperation[];
    expect(operations.map((operation) => operation.type)).toEqual([
      'remove_background',
      'chroma_key',
      'chroma_key',
    ]);
    const results = contract.results as ProcessResult[];
    expect(typeof results[0]?.model).toBe('string');
    expect(typeof results[0]?.durationMs).toBe('number');
    expect(typeof results[1]?.keyColor).toBe('string');
    for (const result of results) expect(result.asset.kind).toBe('image');
    const statuses = contract.statuses as ProcessStatus[];
    expect(statuses.map((status) => status.state)).toEqual(['ready', 'not_installed']);
    expect(statuses[0]?.model?.license).toBeTruthy();
    expect(statuses[1]?.model).toBeNull();
  });
});

const made: ImportedAsset = {
  id: 'c'.repeat(64),
  file: `${'c'.repeat(64)}.png`,
  mime: 'image/png',
  kind: 'image',
  bytes: 1200,
  width: 640,
  height: 400,
};

const source: AssetMeta = {
  id: 'a'.repeat(64),
  file: `${'a'.repeat(64)}.jpg`,
  mime: 'image/jpeg',
  kind: 'image',
  bytes: 9000,
  width: 640,
  height: 400,
  origin: 'stock',
  name: 'harbour.jpg',
  attribution: { author: 'Dana Levi', url: 'https://example.com/dana', license: 'Example License' },
};

function setup(workspaceId: string | null = 'w1') {
  const run = vi.fn<ImageProcessClient['run']>(() =>
    Promise.resolve({ asset: made, durationMs: 40, model: 'isnet-general-use' }),
  );
  const processor: ImageProcessClient = {
    status: () => Promise.reject(new Error('unused')),
    run,
  };
  const images: ImageService = createImageService({
    client: {} as ImageClient,
    workspaceId: () => workspaceId,
    preview: () => Promise.reject(new Error('no canvas here')),
    processor,
    asset: (id) => (id === source.id ? source : undefined),
  });
  return { images, run };
}

describe('the image service', () => {
  it("removes a background on this machine, and the cut-out stays the photographer's", async () => {
    const { images, run } = setup();
    const { asset } = await images.process({ assetId: source.id, operation: 'removeBackground' });
    expect(run).toHaveBeenCalledWith('w1', source.id, { type: 'remove_background' });
    expect(asset).toEqual({
      ...made,
      origin: 'stock',
      name: 'harbour.jpg',
      attribution: source.attribution,
      lineage: { parentAssetId: source.id, provider: 'isnet-general-use' },
    });
  });

  it('keys a flat background out with the other operation', async () => {
    const { images, run } = setup();
    run.mockResolvedValueOnce({ asset: made, durationMs: 3, keyColor: '#00ff00' });
    const { asset } = await images.process({ assetId: source.id, operation: 'keyOutBackground' });
    expect(run).toHaveBeenCalledWith('w1', source.id, { type: 'chroma_key' });
    expect(asset.lineage).toEqual({ parentAssetId: source.id, provider: 'local' });
  });

  it('says in the words of its tool that there is no model, and what works without one', async () => {
    const { images, run } = setup();
    run.mockRejectedValueOnce(new ImageError('not_installed', 'put u2net.onnx into a folder'));
    const failed = images.process({ assetId: source.id, operation: 'removeBackground' });
    await expect(failed).rejects.toMatchObject({ kind: 'not_installed' });
    await expect(failed).rejects.toThrow(/keyOutBackground/);
    await expect(failed).rejects.not.toThrow(/u2net|chroma_key/);
  });

  it('needs an open document', async () => {
    const { images } = setup(null);
    await expect(
      images.process({ assetId: source.id, operation: 'removeBackground' }),
    ).rejects.toMatchObject({ kind: 'unknown_workspace' });
  });
});

describe('an image with a transparent background (GEN-07)', () => {
  const drawn: ImportedAsset = { ...made, id: 'd'.repeat(64), file: `${'d'.repeat(64)}.png` };

  function generating(key: ImageProcessClient['run']) {
    const generate = vi.fn<ImageClient['generate']>(() =>
      Promise.resolve({
        provider: 'example',
        images: [{ status: 'stored', asset: drawn, durationMs: 50 }],
      }),
    );
    const run = vi.fn(key);
    const images: ImageService = createImageService({
      client: { generate } as unknown as ImageClient,
      workspaceId: () => 'w1',
      preview: () => Promise.reject(new Error('no canvas here')),
      processor: { status: () => Promise.reject(new Error('unused')), run },
    });
    return { images, generate, run };
  }

  it('is drawn on a flat colour, which is then keyed out on this machine', async () => {
    const { images, generate, run } = generating(() =>
      Promise.resolve({ asset: made, durationMs: 3, keyColor: '#ff00ff' }),
    );
    const [image] = await images.generate({
      prompt: 'a red bicycle',
      count: 1,
      aspect: '1:1',
      transparent: true,
    });
    // The provider is asked for the subject on a colour the key can tell from it.
    const asked = generate.mock.calls[0]![2].prompt;
    expect(asked.split('\n')[0]).toBe('a red bicycle');
    expect(asked).toContain('pure magenta');
    expect(run).toHaveBeenCalledWith('w1', drawn.id, { type: 'chroma_key' });
    // What comes back is the cut-out, which says what it was made of and what was asked for.
    expect(image?.asset).toMatchObject({
      id: made.id,
      origin: 'ai',
      lineage: { provider: 'example', prompt: 'a red bicycle', parentAssetId: drawn.id },
    });
  });

  it('keeps the image on its colour when the key fails: it was made and paid for', async () => {
    const { images } = generating(() => Promise.reject(new Error('not a flat background')));
    const [image] = await images.generate({
      prompt: 'a red bicycle',
      count: 1,
      aspect: '1:1',
      transparent: true,
    });
    expect(image?.asset.id).toBe(drawn.id);
  });

  it('is not asked for unless wanted', async () => {
    const { images, generate, run } = generating(() => Promise.reject(new Error('unused')));
    await images.generate({ prompt: 'a red bicycle', count: 1, aspect: '1:1' });
    expect(generate.mock.calls[0]![2].prompt).toBe('a red bicycle');
    expect(run).not.toHaveBeenCalled();
  });
});
