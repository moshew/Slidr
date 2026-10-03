import type { AssetMeta } from '@slidr/model';
import { i18n } from '../i18n';
import { getEditor, tell, type Editor } from '../shell';
import { target } from './actions';
import {
  clipElements,
  clipSlides,
  clipText,
  parseClip,
  pasteCommands,
  pasteOffset,
  SLIDR_MIME,
  textBoxFor,
  type Clip,
} from './clip';

/*
 * Copy, cut and paste of elements and slides (ARR-05, FLM-02), on the DOM `copy`, `cut` and
 * `paste` events of the window: only these give the clipboard synchronously and without a
 * permission prompt. Text fields and the slide's text editor keep their own clipboard.
 *
 * What a copy takes follows the focus: slides when it is in the Filmstrip, the selected elements
 * otherwise. What a paste does follows the clip: elements go on the current slide, slides go
 * after it.
 */

const label = (key: string) => i18n.t(`arrange:${key}`);

/** Marks the Filmstrip's root, so that a copy there takes slides (see Filmstrip.tsx). */
const FILMSTRIP = '[data-filmstrip]';

function closest(node: EventTarget | null, selector: string): boolean {
  return node instanceof HTMLElement && Boolean(node.closest(selector));
}

/** Text fields and the in-place text editor copy and paste text, not elements. */
function isTextTarget(node: EventTarget | null): boolean {
  if (!(node instanceof HTMLElement)) return false;
  return (
    node.isContentEditable ||
    node.matches('input, textarea, select') ||
    Boolean(node.closest('[data-text-editor]'))
  );
}

/** Selected text somewhere in the window, with nothing else focused: the copy is of that text. */
function copyingText(): boolean {
  const selected = document.getSelection();
  if (!selected || selected.isCollapsed || !selected.anchorNode) return false;
  const active = document.activeElement;
  return !active || active === document.body || active.contains(selected.anchorNode);
}

export function focusInFilmstrip(): boolean {
  return closest(document.activeElement, FILMSTRIP);
}

/* ---------------------------------------------------------------- what was copied */

/**
 * The last clip copied in this window. A menu's "Paste" uses it: a click, unlike Ctrl+V, gets no
 * access to the system clipboard.
 */
let memory: Clip | undefined;

/** Set while a menu asks the browser for a `copy` event to carry this clip. */
let pending: Clip | undefined;

/**
 * The files behind the assets of the last clip, kept in this window's memory. Pasting into
 * another document needs them: its workspace is another folder, and the one they came from is
 * gone once that document is closed.
 */
let files = new Map<string, File>();
let filesReady: Promise<void> = Promise.resolve();

/** How many times the last clip was pasted on each slide, for `pasteOffset`. */
let pastes: { clipId: string; bySlide: Map<string, number> } = { clipId: '', bySlide: new Map() };

/** Larger files stay behind: a paste into another document then leaves them out. */
const MAX_KEPT_BYTES = 64 * 1024 * 1024;

async function keepFiles(editor: Editor, assets: readonly AssetMeta[]): Promise<void> {
  const kept = new Map<string, File>();
  for (const asset of assets) {
    const known = files.get(asset.id);
    if (known) {
      kept.set(asset.id, known);
      continue;
    }
    const url = editor.assets.url(asset);
    if (!url || asset.bytes > MAX_KEPT_BYTES) continue;
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const name = asset.name ?? asset.file;
      kept.set(asset.id, new File([await response.blob()], name, { type: asset.mime }));
    } catch {
      // The file is not at hand; the paste will say so if it turns out to be needed.
    }
  }
  files = kept;
}

function remember(editor: Editor, clip: Clip): void {
  memory = clip;
  pastes = { clipId: clip.id, bySlide: new Map() };
  // One after the other, so that the files of the latest copy are the ones that stay.
  filesReady = filesReady.then(() => keepFiles(editor, clip.assets));
}

/** Whether a menu's "Paste" has something to paste. */
export function canPaste(): boolean {
  return memory !== undefined;
}

/* ---------------------------------------------------------------- copy and cut */

function write(event: ClipboardEvent, clip: Clip): void {
  event.clipboardData?.setData(SLIDR_MIME, JSON.stringify(clip));
  event.clipboardData?.setData('text/plain', clipText(clip));
  event.preventDefault();
}

/**
 * Puts a clip on the clipboard from a menu, outside a clipboard event: the browser is asked for
 * a `copy` event, which carries it. If it refuses, the clip is still remembered for a paste in
 * this window.
 */
function put(editor: Editor, clip: Clip): void {
  pending = clip;
  try {
    document.execCommand('copy');
  } catch {
    // Remembered below.
  }
  if (pending) {
    pending = undefined;
    remember(editor, clip);
  }
}

function removeSource(editor: Editor, clip: Clip): void {
  const { bus } = editor;
  if (clip.kind === 'slides') {
    bus.dispatch(
      { type: 'slide.remove', slideIds: clip.slides.map((s) => s.id) },
      { label: label('history.cut') },
    );
  } else {
    bus.dispatch(
      { type: 'element.remove', slideId: clip.slideId, elementIds: clip.elements.map((e) => e.id) },
      { label: label('history.cut') },
    );
  }
}

/** The clip of what the focus points at: slides in the Filmstrip, the selected elements elsewhere. */
function clipAtFocus(editor: Editor, cut: boolean): Clip | undefined {
  const { deck } = editor.bus;
  if (focusInFilmstrip()) {
    return clipSlides(deck, editor.selection.getState().selectedSlideIds, cut);
  }
  const at = target(editor);
  if (!at) return undefined;
  // A locked element is not deleted, so a cut leaves it where it is.
  const ids = cut ? at.elements.filter((e) => !e.locked).map((e) => e.id) : at.ids;
  return clipElements(deck, at.slide.id, ids, cut);
}

function onCopy(event: ClipboardEvent, cut: boolean): void {
  if (event.defaultPrevented) return;
  const editor = getEditor();
  if (pending) {
    const clip = pending;
    pending = undefined;
    write(event, clip);
    remember(editor, clip);
    return;
  }
  if (isTextTarget(event.target) || copyingText()) return;
  const clip = clipAtFocus(editor, cut);
  if (!clip) return;
  write(event, clip);
  remember(editor, clip);
  if (cut) removeSource(editor, clip);
}

/** Copies slides from a menu. */
export function copySlides(editor: Editor, slideIds: readonly string[]): void {
  const clip = clipSlides(editor.bus.deck, slideIds);
  if (clip) put(editor, clip);
}

/** Cuts slides from a menu: one undo step brings them back. */
export function cutSlides(editor: Editor, slideIds: readonly string[]): void {
  const clip = clipSlides(editor.bus.deck, slideIds, true);
  if (!clip) return;
  put(editor, clip);
  removeSource(editor, clip);
}

/* ---------------------------------------------------------------- paste */

/**
 * The table entries for the clip's assets that the open deck lacks. Their files are imported
 * into this document when this window still has them; otherwise the entry goes in without a
 * file, the picture shows as missing, and `lost` counts it.
 */
async function bringAssets(
  editor: Editor,
  clip: Clip,
): Promise<{ assets: AssetMeta[]; lost: number }> {
  const missing = clip.assets.filter((asset) => !(asset.id in editor.bus.deck.assets));
  if (missing.length === 0) return { assets: [], lost: 0 };
  await filesReady;
  const assets: AssetMeta[] = [];
  let lost = 0;
  for (const asset of missing) {
    const file = files.get(asset.id);
    try {
      if (!file) throw new Error('The file is not in this window.');
      const imported = await editor.assets.import(file, asset.origin);
      // What the source deck knew about the asset (name, attribution, lineage) is kept.
      assets.push({ ...asset, ...imported, ...(asset.name ? { name: asset.name } : {}) });
    } catch {
      lost++;
      assets.push(asset);
    }
  }
  return { assets, lost };
}

/** Pastes a clip into the open deck as one undo step, and selects what was pasted. */
export async function paste(editor: Editor, clip: Clip): Promise<void> {
  const { bus, selection } = editor;
  const deckId = bus.deck.id;
  const { assets, lost } = await bringAssets(editor, clip);
  // The import took a moment: another document may have been opened meanwhile.
  if (bus.deck.id !== deckId) return;

  const slideId = selection.getState().currentSlideId;
  if (pastes.clipId !== clip.id) pastes = { clipId: clip.id, bySlide: new Map() };
  const earlier = slideId ? (pastes.bySlide.get(slideId) ?? 0) : 0;
  const offset =
    clip.kind === 'elements' && slideId ? pasteOffset(clip, deckId, slideId, earlier) : undefined;

  const result = pasteCommands(bus.deck, clip, { slideId, offset, assets });
  if (result.commands.length === 0) return;
  try {
    bus.batch(result.commands, { label: label('history.paste') });
  } catch (error) {
    console.error('The paste was rejected', error);
    return;
  }
  if (slideId) pastes.bySlide.set(slideId, earlier + 1);
  if (result.slideIds.length > 0) selection.getState().selectSlides(result.slideIds);
  else selection.getState().selectElements(result.elementIds);
  if (lost > 0) void tell(label('clipboard.lostTitle'), label('clipboard.lostBody'));
}

/** A menu's "Paste": the last clip copied in this window. */
export function pasteFromMemory(editor: Editor): void {
  if (memory) void paste(editor, memory);
}

/** Plain text pasted outside a text field becomes a text box on the current slide. */
function pasteText(editor: Editor, text: string): boolean {
  const slideId = editor.selection.getState().currentSlideId;
  const element = textBoxFor(text, editor.bus.deck);
  if (!slideId || !element) return false;
  editor.bus.dispatch({ type: 'element.add', slideId, element }, { label: label('history.paste') });
  editor.selection.getState().selectElements([element.id]);
  return true;
}

function onPaste(event: ClipboardEvent): void {
  const data = event.clipboardData;
  // The Stage takes pasted files itself (STG-09) and marks the event as handled.
  if (!data || event.defaultPrevented || isTextTarget(event.target)) return;
  const editor = getEditor();
  const payload = data.getData(SLIDR_MIME);
  const clip = payload ? parseClip(payload) : undefined;
  if (clip) {
    event.preventDefault();
    void paste(editor, clip);
    return;
  }
  if (data.files.length > 0 || closest(event.target, FILMSTRIP)) return;
  if (pasteText(editor, data.getData('text/plain'))) event.preventDefault();
}

/** Starts listening to the window's clipboard events. Returns a function that stops. */
export function installClipboard(): () => void {
  const copy = (event: ClipboardEvent) => onCopy(event, false);
  const cut = (event: ClipboardEvent) => onCopy(event, true);
  window.addEventListener('copy', copy);
  window.addEventListener('cut', cut);
  window.addEventListener('paste', onPaste);
  return () => {
    window.removeEventListener('copy', copy);
    window.removeEventListener('cut', cut);
    window.removeEventListener('paste', onPaste);
  };
}
