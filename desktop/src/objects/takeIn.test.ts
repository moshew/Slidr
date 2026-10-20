// @vitest-environment happy-dom
import type { AssetMeta } from '@slidr/model';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { AssetService } from '../document/assets';
import { i18n } from '../i18n';
import { answer, pendingDialog } from '../shell/dialogs';
import { createEditor } from '../shell/editor';
import { importPicture, insertFiles, NotTaken } from './takeIn';
import './register';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), isTauri: () => false }));

beforeAll(() => i18n.changeLanguage('en'));

const KINDS: Record<string, AssetMeta['kind']> = {
  png: 'image',
  // The asset store calls these pictures: it goes by what the bytes say (bug hunt, finding 7).
  tif: 'image',
  heic: 'image',
  svg: 'svg',
  mp4: 'video',
  txt: 'other',
};

/** A store that takes every file but the one named `gone.png`, as the core's store would. */
function store(): AssetService & { taken: string[] } {
  const taken: string[] = [];
  return {
    taken,
    import(file) {
      if (file.name === 'gone.png') return Promise.reject(new Error('disk full'));
      taken.push(file.name);
      const extension = file.name.split('.').pop() ?? '';
      const id = (taken.length % 16).toString(16).repeat(64);
      const kind = KINDS[extension] ?? 'other';
      return Promise.resolve({
        id,
        file: `${id}.${extension}`,
        mime: 'application/octet-stream',
        kind,
        bytes: 10,
        origin: 'upload',
        name: file.name,
        ...(kind === 'image' ? { width: 400, height: 300 } : {}),
      });
    },
    url: () => undefined,
  };
}

/** The webview draws a PNG, and neither a TIFF nor a HEIC. */
const draws = (file: Blob) => Promise.resolve(!/\.(tif|heic)$/.test((file as File).name));
const file = (name: string) => new File(['x'], name);
const AT = { x: 960, y: 540 };

function setup() {
  const editor = { ...createEditor({ lang: 'en', storage: null }), assets: store() };
  const slide = () =>
    editor.bus.deck.slides.find((s) => s.id === editor.selection.getState().currentSlideId)!;
  return { editor, slide };
}

/** Lets the insert run until it has either finished or asked the user to read something. */
async function settle(running: Promise<void>): Promise<{ title: string; body?: string } | null> {
  let done = false;
  void running.then(() => (done = true));
  for (let i = 0; i < 50 && !done && !pendingDialog(); i++) await Promise.resolve();
  const told = pendingDialog();
  if (!told) return null;
  answer('ok');
  await running;
  return { title: told.title, ...(told.body ? { body: told.body } : {}) };
}

describe('files taken into a slide', () => {
  it('takes the files it can, as one step, and names the ones it left out', async () => {
    const { editor, slide } = setup();
    const before = editor.bus.undoStack.length;
    const told = await settle(
      insertFiles(
        editor,
        ['good.png', 'scan.tif', 'notes.txt', 'gone.png', 'clip.mp4'].map(file),
        AT,
        'Insert',
        { draws },
      ),
    );
    expect(slide().elements.map((e) => e.type)).toEqual(['image', 'video']);
    expect(editor.bus.undoStack.length).toBe(before + 1);
    expect(editor.selection.getState().selectedElementIds).toEqual(
      slide().elements.map((e) => e.id),
    );
    expect(told?.title).toBe('Some of the files were not added');
    expect(told?.body).toBe(
      '"scan.tif" cannot be shown as a picture. PNG, JPEG, WebP, GIF, AVIF and SVG files can. ' +
        '"notes.txt" is not a picture, a video or a sound. ' +
        '"gone.png" could not be read.',
    );
    // One undo takes all of it back.
    editor.bus.undo();
    expect(slide().elements).toEqual([]);
  });

  it('adds nothing for a picture the webview cannot draw, and says so', async () => {
    const { editor, slide } = setup();
    const before = editor.bus.undoStack.length;
    const told = await settle(
      insertFiles(editor, [file('IMG_0002.heic')], AT, 'Insert', { draws }),
    );
    expect(slide().elements).toEqual([]);
    expect(editor.bus.undoStack.length).toBe(before);
    expect(told?.title).toBe('The file could not be added');
    expect(told?.body).toContain('"IMG_0002.heic" cannot be shown as a picture');
  });

  it('says that none of several files went in', async () => {
    const { editor, slide } = setup();
    const told = await settle(
      insertFiles(editor, [file('scan.tif'), file('notes.txt')], AT, 'Insert', { draws }),
    );
    expect(slide().elements).toEqual([]);
    expect(told?.title).toBe('The files could not be added');
  });

  it('says nothing when every file went in', async () => {
    const { editor, slide } = setup();
    const told = await settle(
      insertFiles(editor, [file('a.png'), file('b.png')], AT, 'Insert', { draws }),
    );
    expect(told).toBeNull();
    expect(slide().elements).toHaveLength(2);
  });

  it('says it in the language of the interface', async () => {
    await i18n.changeLanguage('he');
    try {
      const { editor } = setup();
      const told = await settle(insertFiles(editor, [file('scan.tif')], AT, 'Insert', { draws }));
      expect(told?.title).toBe(i18n.t('objects:insert.failed'));
      expect(told?.body).toContain('scan.tif');
      expect(told?.body).not.toContain('cannot be shown');
    } finally {
      await i18n.changeLanguage('en');
    }
  });
});

describe('one picture file, for a place that shows a picture', () => {
  it('is refused when the webview cannot draw it', async () => {
    const assets = store();
    await expect(importPicture(assets, file('scan.tif'), draws)).rejects.toBeInstanceOf(NotTaken);
    await expect(importPicture(assets, file('scan.tif'), draws)).rejects.toThrow(
      '"scan.tif" cannot be shown as a picture',
    );
    expect((await importPicture(assets, file('good.png'), draws)).kind).toBe('image');
  });

  it('is not asked about when it is not a raster picture', async () => {
    const asked = vi.fn(draws);
    expect((await importPicture(store(), file('logo.svg'), asked)).kind).toBe('svg');
    expect(asked).not.toHaveBeenCalled();
  });
});
