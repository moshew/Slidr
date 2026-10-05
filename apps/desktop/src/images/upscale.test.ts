// @vitest-environment happy-dom
import { createElement, findElementInDeck, type AssetMeta, type ImageElement } from '@slidr/model';
import { describe, expect, it, vi } from 'vitest';
import contract from '../../src-tauri/src/image_process/fixtures/contract.json';
import type { ImportedAsset } from '../document/storage';
import { createEditor, type Editor } from '../shell/editor';
import { ImageError } from './images';
import {
  cancelUpscale,
  upscaleImage,
  upscalePercent,
  upscaleWorkOf,
  type UpscaleImages,
} from './upscale';
import {
  upscaleRefusal,
  type ImageUpscaler,
  type UpscaleProgress,
  type UpscaleResult,
  type UpscaleStatus,
} from './upscaler';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), isTauri: () => false }));

const source: AssetMeta = {
  id: 'a'.repeat(64),
  file: `${'a'.repeat(64)}.jpg`,
  mime: 'image/jpeg',
  kind: 'image',
  bytes: 9000,
  width: 800,
  height: 600,
  origin: 'stock',
  name: 'harbour.jpg',
  attribution: { author: 'Dana Levi', url: 'https://example.com/dana', license: 'Example License' },
};

const larger: ImportedAsset = {
  id: 'b'.repeat(64),
  file: `${'b'.repeat(64)}.jpg`,
  mime: 'image/jpeg',
  kind: 'image',
  bytes: 120_000,
  width: 3200,
  height: 2400,
};

/** A picture on the slide that has everything a picture can have besides its file. */
const PICTURE = {
  frame: { x: 200, y: 120, w: 640, h: 360 },
  crop: { x: 0.1, y: 0.2, w: 0.7, h: 0.6 },
  mask: { kind: 'rounded', radius: 24 },
  adjust: { brightness: 1.1, contrast: 0.95 },
  filterPreset: 'warm',
  alt: 'The harbour at dawn',
  flipH: true,
} as const;

function editorWithPicture(): { editor: Editor; id: string } {
  const editor = createEditor({ lang: 'he', storage: null });
  const slideId = editor.selection.getState().currentSlideId!;
  const element = createElement.image({ assetId: source.id, ...PICTURE });
  editor.bus.batch([
    { type: 'asset.add', asset: source },
    { type: 'element.add', slideId, element },
  ]);
  return { editor, id: element.id };
}

const pictureOf = (editor: Editor, id: string) =>
  findElementInDeck(editor.bus.deck, id)?.element as ImageElement;

/** An upscaler whose job ends when the test says so. */
function upscalerOf() {
  let settle: (result: UpscaleResult) => void = () => undefined;
  let fail: (error: unknown) => void = () => undefined;
  let report: (progress: UpscaleProgress) => void = () => undefined;
  const run = vi.fn<ImageUpscaler['run']>(
    (_jobId, _workspaceId, _assetId, factor, onProgress) =>
      new Promise<UpscaleResult>((resolve, reject) => {
        settle = resolve;
        fail = reject;
        report = onProgress ?? (() => undefined);
        void factor;
      }),
  );
  const cancel = vi.fn<ImageUpscaler['cancel']>(() => Promise.resolve());
  const images: UpscaleImages = {
    upscaler: { status: () => Promise.reject(new Error('unused')), run, cancel },
    workspaceId: () => 'workspace-1',
  };
  return {
    images,
    run,
    cancel,
    done: (asset: ImportedAsset = larger) =>
      settle({ asset, durationMs: 11_800, model: 'realesr-general-x4v3', factor: 4 }),
    fail: (error: unknown) => fail(error),
    report: (progress: UpscaleProgress) => report(progress),
  };
}

describe('upscaling the picture of an element', () => {
  it('puts the larger picture in its place as one undo step, and changes nothing else', async () => {
    const { editor, id } = editorWithPicture();
    const { images, run, done } = upscalerOf();
    const before = pictureOf(editor, id);
    const steps = editor.bus.undoStack.length;

    const job = upscaleImage(editor, id, 4, 'Upscale image', images);
    expect(run).toHaveBeenCalledWith(
      expect.stringMatching(/^[\w-]+$/),
      'workspace-1',
      source.id,
      4,
      expect.any(Function),
    );
    done();
    expect(await job).toBe(true);

    const after = pictureOf(editor, id);
    // The frame, the crop, the mask, the adjustments, the filter, the flip and the alt text.
    expect(after).toEqual({ ...before, assetId: larger.id });
    expect(editor.bus.undoStack.length).toBe(steps + 1);
    expect(editor.bus.undoStack.at(-1)?.label).toBe('Upscale image');
    // Still the same picture, and its photographer's.
    expect(editor.bus.deck.assets[larger.id]).toEqual({
      ...larger,
      origin: 'stock',
      name: 'harbour.jpg',
      attribution: source.attribution,
      lineage: { parentAssetId: source.id, provider: 'realesr-general-x4v3' },
    });
    // The original stays an asset of the deck (IMG-12).
    expect(editor.bus.deck.assets[source.id]).toEqual(source);

    editor.bus.undo();
    expect(pictureOf(editor, id)).toEqual(before);
    expect(editor.bus.deck.assets[larger.id]).toBeUndefined();
    editor.bus.redo();
    expect(pictureOf(editor, id).assetId).toBe(larger.id);
    expect(editor.bus.deck.assets[larger.id]).toBeDefined();
  });

  it('keeps the prompt of a picture the AI made, so it is still found by it', async () => {
    const { editor, id } = editorWithPicture();
    const made: AssetMeta = {
      ...source,
      id: 'd'.repeat(64),
      origin: 'ai',
      attribution: undefined,
      lineage: { provider: 'codex-cli', prompt: 'a harbour at dawn' },
    };
    delete made.attribution;
    const slideId = editor.selection.getState().currentSlideId!;
    editor.bus.batch([
      { type: 'asset.add', asset: made },
      { type: 'element.update', slideId, elementId: id, patch: { assetId: made.id } },
    ]);
    const { images, done } = upscalerOf();
    const job = upscaleImage(editor, id, 2, 'Upscale image', images);
    done();
    await job;
    expect(editor.bus.deck.assets[larger.id]).toMatchObject({
      origin: 'ai',
      lineage: {
        prompt: 'a harbour at dawn',
        parentAssetId: made.id,
        provider: 'realesr-general-x4v3',
      },
    });
  });

  it('says how far it is while it works, and is done with it when the job ends', async () => {
    const { editor, id } = editorWithPicture();
    const { images, report, done } = upscalerOf();
    const job = upscaleImage(editor, id, 4, 'Upscale image', images);
    expect(upscaleWorkOf(id)).toMatchObject({ done: 0, total: 0 });
    report({ done: 0, total: 20 });
    report({ done: 7, total: 20 });
    const work = upscaleWorkOf(id);
    expect(work).toMatchObject({ done: 7, total: 20 });
    expect(upscalePercent(work!)).toBe(35);
    // Before the first tile there is no share to name.
    expect(upscalePercent({ done: 0, total: 0 })).toBe(0);
    done();
    await job;
    expect(upscaleWorkOf(id)).toBeUndefined();
  });

  it('runs one job for a picture at a time', async () => {
    const { editor, id } = editorWithPicture();
    const { images, run, done } = upscalerOf();
    const first = upscaleImage(editor, id, 4, 'Upscale image', images);
    expect(await upscaleImage(editor, id, 2, 'Upscale image', images)).toBe(false);
    expect(run).toHaveBeenCalledTimes(1);
    done();
    expect(await first).toBe(true);
  });

  it('is stopped at once for the user, and changes nothing however the job ends', async () => {
    const { editor, id } = editorWithPicture();
    const steps = editor.bus.undoStack.length;

    // The core says the job was cancelled.
    const stopped = upscalerOf();
    const job = upscaleImage(editor, id, 4, 'Upscale image', stopped.images);
    const jobId = stopped.run.mock.calls[0]?.[0];
    stopped.report({ done: 3, total: 20 });
    cancelUpscale(editor, id, stopped.images);
    expect(upscaleWorkOf(id)).toBeUndefined();
    expect(stopped.cancel).toHaveBeenCalledWith(jobId);
    // Progress that was already on its way does not bring the job back to the screen.
    stopped.report({ done: 4, total: 20 });
    expect(upscaleWorkOf(id)).toBeUndefined();
    stopped.fail(new ImageError('cancelled', 'the job was cancelled'));
    expect(await job).toBe(false);

    // The job ended a moment before the cancel reached it: its picture is not put in.
    const late = upscalerOf();
    const raced = upscaleImage(editor, id, 4, 'Upscale image', late.images);
    cancelUpscale(editor, id, late.images);
    late.done();
    expect(await raced).toBe(false);

    expect(pictureOf(editor, id).assetId).toBe(source.id);
    expect(editor.bus.undoStack.length).toBe(steps);
    // And the picture can be upscaled again right away.
    const again = upscalerOf();
    const third = upscaleImage(editor, id, 2, 'Upscale image', again.images);
    again.done();
    expect(await third).toBe(true);
    // Stopping a picture nothing is running for does nothing.
    cancelUpscale(editor, id, again.images);
    expect(again.cancel).not.toHaveBeenCalled();
  });

  it('leaves alone a picture that was replaced or deleted while the work ran', async () => {
    const { editor, id } = editorWithPicture();
    const slideId = editor.selection.getState().currentSlideId!;
    const other: AssetMeta = { ...source, id: 'e'.repeat(64), file: `${'e'.repeat(64)}.jpg` };
    const replaced = upscalerOf();
    const first = upscaleImage(editor, id, 4, 'Upscale image', replaced.images);
    editor.bus.batch([
      { type: 'asset.add', asset: other },
      { type: 'element.update', slideId, elementId: id, patch: { assetId: other.id } },
    ]);
    replaced.done();
    expect(await first).toBe(false);
    expect(pictureOf(editor, id).assetId).toBe(other.id);
    expect(editor.bus.deck.assets[larger.id]).toBeUndefined();

    const deleted = upscalerOf();
    const second = upscaleImage(editor, id, 4, 'Upscale image', deleted.images);
    editor.bus.dispatch({ type: 'element.remove', slideId, elementIds: [id] });
    deleted.done();
    expect(await second).toBe(false);
    expect(upscaleWorkOf(id)).toBeUndefined();
  });

  it('rejects with the reason when the picture could not be upscaled, and is free again', async () => {
    const { editor, id } = editorWithPicture();
    const { images, fail } = upscalerOf();
    const job = upscaleImage(editor, id, 4, 'Upscale image', images);
    fail(new ImageError('not_installed', 'no upscaling model is installed'));
    await expect(job).rejects.toMatchObject({ kind: 'not_installed' });
    expect(upscaleWorkOf(id)).toBeUndefined();
    expect(pictureOf(editor, id).assetId).toBe(source.id);

    // Without a document there is nowhere to store a picture.
    const nowhere: UpscaleImages = { ...images, workspaceId: () => null };
    await expect(upscaleImage(editor, id, 4, 'Upscale image', nowhere)).rejects.toMatchObject({
      kind: 'unknown_workspace',
    });
    // And an element that is not a picture, or is not there, is nothing to do.
    expect(await upscaleImage(editor, 'no-such-element', 4, 'Upscale image', images)).toBe(false);
  });
});

describe('what a picture can be asked for', () => {
  const [ready, missing] = contract.upscale.statuses as UpscaleStatus[];

  it('is two and four times with a model, within what the result may weigh', () => {
    expect(ready?.factors).toEqual([2, 4]);
    const status = ready!;
    expect(upscaleRefusal(status, { width: 1024, height: 768 }, 2)).toBeUndefined();
    expect(upscaleRefusal(status, { width: 1024, height: 768 }, 4)).toBeUndefined();
    expect(upscaleRefusal(status, { width: 1920, height: 1080 }, 4)).toBeUndefined();
    // Four times 2048 by 2048 is past the largest result; two times is not.
    expect(upscaleRefusal(status, { width: 2048, height: 2048 }, 4)).toBe('too_large');
    expect(upscaleRefusal(status, { width: 2048, height: 2048 }, 2)).toBeUndefined();
    // A picture past the largest source is not upscaled at all.
    expect(upscaleRefusal(status, { width: 3000, height: 2000 }, 2)).toBe('too_large');
    // A size the model does not give.
    expect(upscaleRefusal(status, { width: 100, height: 100 }, 3)).toBe('not_installed');
  });

  it('is nothing without one', () => {
    expect(missing?.state).toBe('not_installed');
    expect(missing?.factors).toEqual([]);
    expect(upscaleRefusal(missing!, { width: 100, height: 100 }, 2)).toBe('not_installed');
  });

  it('comes back as the fixture pins it: the asset, the model and the size', () => {
    const result = contract.upscale.result as UpscaleResult;
    expect(result.asset.kind).toBe('image');
    expect(result).toMatchObject({ model: 'realesr-general-x4v3', factor: 4 });
    expect(typeof result.durationMs).toBe('number');
    const progress = contract.upscale.progress as UpscaleProgress[];
    expect(progress.map((p) => upscalePercent(p))).toEqual([0, 100]);
    // A job that was stopped ends with a kind the webview knows.
    expect(contract.errorKinds).toContain('cancelled');
  });
});
