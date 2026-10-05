import { findSlide, type AssetMeta, type Element, type Frame } from '@slidr/model';
import { i18n } from '../i18n';
import { focusStage, type Editor } from '../shell';
import { newLine, newShape, type LineKind } from './shapes';
import { insertFiles } from './takeIn';

/*
 * The Insert buttons of row A for pictures, shapes and lines (IMG-01, SHP-01, SHP-05). Each
 * insert is one change on the bus, lands in the middle of the current slide and ends selected.
 */

/**
 * Asks for files with the system's file dialog. The input is made in code, not in JSX: it works
 * in the Tauri webview and in a browser alike. Resolves with nothing when the dialog is cancelled.
 */
export function pickFiles(accept: string, multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.hidden = true;
    const done = (files: File[]) => {
      input.remove();
      resolve(files);
    };
    input.addEventListener('change', () => done(Array.from(input.files ?? [])), { once: true });
    input.addEventListener('cancel', () => done([]), { once: true });
    // Attached while the dialog is open, so the input cannot be collected before it answers.
    document.body.append(input);
    input.click();
  });
}

export const IMAGE_FILES = 'image/*';

/**
 * Whether an imported file can be shown as a picture. The file dialog filters by type, but its
 * "all files" choice lets anything through.
 */
export function isPicture(asset: AssetMeta): boolean {
  return asset.kind === 'image' || asset.kind === 'svg';
}

/** The frames of the slide's top-level elements, to keep a new element from hiding one. */
function takenFrames(editor: Editor, slideId: string): Frame[] {
  return findSlide(editor.bus.deck, slideId)?.elements.map((e) => e.frame) ?? [];
}

function insertElement(editor: Editor, build: (slideId: string) => Element): void {
  const slideId = editor.selection.getState().currentSlideId;
  if (!slideId) return;
  const element = build(slideId);
  editor.bus.dispatch(
    { type: 'element.add', slideId, element },
    { label: i18n.t('objects:history.insert') },
  );
  editor.selection.getState().selectElements([element.id]);
  // The keyboard goes to the Stage, so Delete, the arrows and Enter act on what was just inserted
  // rather than on the row A button. The library popover is still open when this runs: focus that
  // leaves a popover closes it, and then the popover does not take the focus back to its button.
  focusStage();
}

/** A shape of the library, at its usual size and in the theme's colours. */
export function insertShape(editor: Editor, preset: string): void {
  insertElement(editor, (slideId) =>
    newShape(preset, editor.bus.deck.size, takenFrames(editor, slideId)),
  );
}

export function insertLine(editor: Editor, kind: LineKind): void {
  insertElement(editor, (slideId) =>
    newLine(kind, editor.bus.deck.size, takenFrames(editor, slideId), editor.bus.deck.meta.dir),
  );
}

/**
 * Picture files chosen in the file dialog become assets of the document and elements in the
 * middle of the slide: one change, so one undo step, and the new elements end selected. A file
 * that cannot be taken is left out, and the user is told which (`insertFiles`).
 */
export async function insertImages(editor: Editor): Promise<void> {
  const files = await pickFiles(IMAGE_FILES, true);
  if (files.length === 0) return;
  const { size } = editor.bus.deck;
  await insertFiles(
    editor,
    files,
    { x: size.w / 2, y: size.h / 2 },
    i18n.t('objects:history.insert'),
  );
}
