// @vitest-environment happy-dom
import {
  createElement,
  findElementInDeck,
  updateElement,
  type AssetMeta,
  type ImageElement,
} from '@slidr/model';
import { describe, expect, it, vi } from 'vitest';
import type { Target } from '../objects/target';
import { createEditor, type Editor } from '../shell/editor';
import { offersReplace, replaceSelected } from './replace';
import './register';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), isTauri: () => false }));

function photo(id: string, extra: Partial<AssetMeta> = {}): AssetMeta {
  return {
    id: id.repeat(64),
    file: `${id.repeat(64)}.jpg`,
    mime: 'image/jpeg',
    kind: 'image',
    bytes: 1000,
    width: 2400,
    height: 1600,
    origin: 'upload',
    name: `${id}.jpg`,
    ...extra,
  };
}

/** What a picture on a slide has besides its file. */
const LOOK = {
  frame: { x: 200, y: 120, w: 640, h: 360 },
  crop: { x: 0.1, y: 0.2, w: 0.7, h: 0.6 },
  mask: { kind: 'ellipse' },
  adjust: { brightness: 1.1, contrast: 0.95 },
  filterPreset: 'noir',
  flipH: true,
} as const;

/** An editor with a picture on its slide, and the picture as the panel is handed it. */
function withPicture(alt?: string): { editor: Editor; picture: () => Target<ImageElement> } {
  const editor = createEditor({ lang: 'he', storage: null });
  const slideId = editor.selection.getState().currentSlideId!;
  const shown = photo('a');
  const element = createElement.image({ assetId: shown.id, ...(alt ? { alt } : {}), ...LOOK });
  editor.bus.batch([
    { type: 'asset.add', asset: shown },
    { type: 'element.add', slideId, element },
  ]);
  // As `useTarget` builds it: the element as it is now, and a change of it on the bus.
  const picture = (): Target<ImageElement> => ({
    slideId,
    element: findElementInDeck(editor.bus.deck, element.id)?.element as ImageElement,
    update: (patch, options, first = []) =>
      editor.bus.batch([...first, updateElement(slideId, element.id, patch)], options),
  });
  return { editor, picture };
}

describe('replacing the selected picture from the media panel', () => {
  it('changes the file and nothing else, as one undo step that brings the asset with it', () => {
    const { editor, picture } = withPicture('The team at the harbour');
    const before = picture().element;
    const steps = editor.bus.undoStack.length;
    // A stock photo that was just taken in: the deck does not list it yet.
    const stock = photo('b', {
      origin: 'stock',
      name: undefined,
      attribution: { author: 'Dana Levi', url: 'https://example.com/p', license: 'Mock License' },
    });
    delete stock.name;

    replaceSelected(editor, picture(), stock);
    // The frame, the crop, the mask, the adjustments, the filter, the flip, and the alt text.
    expect(picture().element).toEqual({ ...before, assetId: stock.id });
    expect(editor.bus.deck.assets[stock.id]).toEqual(stock);
    expect(editor.bus.undoStack.length).toBe(steps + 1);
    expect(editor.bus.undoStack.at(-1)?.label).toBe('החלפת תמונה');

    editor.bus.undo();
    expect(picture().element).toEqual(before);
    expect(editor.bus.deck.assets[stock.id]).toBeUndefined();
    editor.bus.redo();
    expect(picture().element.assetId).toBe(stock.id);
    expect(editor.bus.deck.assets[stock.id]).toEqual(stock);
  });

  it('takes a picture the deck already has without listing it twice', () => {
    const { editor, picture } = withPicture();
    const spare = photo('c');
    editor.bus.dispatch({ type: 'asset.add', asset: spare });
    const assets = Object.keys(editor.bus.deck.assets);
    replaceSelected(editor, picture(), spare);
    expect(picture().element.assetId).toBe(spare.id);
    expect(Object.keys(editor.bus.deck.assets)).toEqual(assets);
    // Undo takes the change back, and leaves the picture among the deck's own.
    editor.bus.undo();
    expect(editor.bus.deck.assets[spare.id]).toEqual(spare);
  });

  it('lets an alt text that was only the old file’s name follow the new file', () => {
    const named = withPicture('a');
    replaceSelected(named.editor, named.picture(), photo('d', { name: 'sunset.jpg' }));
    expect(named.picture().element.alt).toBe('sunset');
    // One the user wrote stays as it is.
    const written = withPicture('The team at the harbour');
    replaceSelected(written.editor, written.picture(), photo('d', { name: 'sunset.jpg' }));
    expect(written.picture().element.alt).toBe('The team at the harbour');
  });

  it('is offered by every picture but the one the element already shows', () => {
    const { picture } = withPicture();
    expect(offersReplace(picture(), 'b'.repeat(64))).toBe(true);
    expect(offersReplace(picture(), picture().element.assetId)).toBe(false);
    // Without a picture selected there is nothing to replace.
    expect(offersReplace(undefined, 'b'.repeat(64))).toBe(false);
  });
});
