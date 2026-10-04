import type { AssetMeta } from '@slidr/model';
import { isTauri } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { i18n } from '../i18n';
import { pickFiles } from '../objects/insert';
import { focusStage, tell, type Editor } from '../shell';
import { insertAssetsCommands } from '../stage/insert';
import { CLIP_EXTENSIONS, CLIP_FILES, isClip } from './clip';

/*
 * The Insert media button of row A (WG5-T12, MED-01): video and audio files become assets of
 * the document and clips on the current slide.
 */

/** How long a file may take to say what it is before the insert goes on without knowing. */
const PROBE_TIMEOUT_MS = 5000;

export interface ClipFacts {
  width?: number;
  height?: number;
  durationMs?: number;
}

/**
 * What a media file says about itself: the size of its picture and its length. Read by the
 * browser from the start of the file, so nothing but the header is loaded. Empty when the file
 * cannot be played here.
 */
export function probeClip(url: string, kind: 'video' | 'audio'): Promise<ClipFacts> {
  return new Promise((resolve) => {
    const media = document.createElement(kind);
    let done = false;
    const finish = (facts: ClipFacts) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      media.removeAttribute('src');
      media.load();
      resolve(facts);
    };
    const timer = setTimeout(() => finish({}), PROBE_TIMEOUT_MS);
    media.preload = 'metadata';
    media.muted = true;
    media.addEventListener('error', () => finish({}), { once: true });
    media.addEventListener(
      'loadedmetadata',
      () => {
        const facts: ClipFacts = {};
        if (media instanceof HTMLVideoElement && media.videoWidth > 0 && media.videoHeight > 0) {
          facts.width = media.videoWidth;
          facts.height = media.videoHeight;
        }
        // A recording that was never closed properly has no length to state.
        if (Number.isFinite(media.duration) && media.duration > 0) {
          facts.durationMs = Math.round(media.duration * 1000);
        }
        finish(facts);
      },
      { once: true },
    );
    media.src = url;
  });
}

/** The asset with what the file says about itself, for a record that does not state it yet. */
async function withFacts(editor: Editor, asset: AssetMeta): Promise<AssetMeta> {
  if (asset.kind !== 'video' && asset.kind !== 'audio') return asset;
  if (asset.durationMs !== undefined) return asset;
  const url = editor.assets.url(asset);
  if (!url) return asset;
  const facts = await probeClip(url, asset.kind);
  return { ...asset, ...facts };
}

/**
 * Asks for media files and takes them in as assets of the document. In the app the file dialog
 * is Tauri's and the files are copied by path, in Rust: a video may be hundreds of megabytes,
 * and none of it passes through the webview. In a plain browser (the Vite page, Playwright) a
 * file input reads them into memory.
 */
async function pickClips(editor: Editor): Promise<AssetMeta[]> {
  const { document: service } = editor;
  if (isTauri() && service) {
    const chosen = await openDialog({
      multiple: true,
      directory: false,
      filters: [{ name: i18n.t('media:clip.files'), extensions: [...CLIP_EXTENSIONS] }],
    });
    const paths = chosen === null ? [] : Array.isArray(chosen) ? chosen : [chosen];
    return Promise.all(paths.map((path) => service.importAssetFile(path)));
  }
  const files = await pickFiles(CLIP_FILES, true);
  return Promise.all(files.map((file) => editor.assets.import(file)));
}

/**
 * The Insert media button of row A (MED-01): video and audio files chosen in the file dialog
 * become assets of the document and clips in the middle of the current slide. One change, so
 * one undo step, and the new clips end selected.
 */
export async function insertClips(editor: Editor): Promise<void> {
  try {
    const picked = await pickClips(editor);
    if (picked.length === 0) return;
    // The dialog filters by type, but its "all files" choice lets anything through.
    const clips = picked.filter(isClip);
    if (clips.length === 0) {
      await tell(i18n.t('media:clip.notMedia'));
      return;
    }
    const assets = await Promise.all(clips.map((asset) => withFacts(editor, asset)));
    // The slide of the moment the files are in: the user may have moved on while they loaded.
    const slideId = editor.selection.getState().currentSlideId;
    if (!slideId) return;
    const { size } = editor.bus.deck;
    const { commands, elementIds } = insertAssetsCommands(
      slideId,
      assets,
      size,
      { x: size.w / 2, y: size.h / 2 },
      (id) => id in editor.bus.deck.assets,
    );
    if (commands.length === 0) return;
    editor.bus.batch(commands, { label: i18n.t('media:clip.history.insert') });
    editor.selection.getState().selectElements(elementIds);
    focusStage();
  } catch (error) {
    await tell(
      i18n.t('media:clip.insertFailed'),
      error instanceof Error
        ? error.message
        : typeof error === 'object' && error !== null && 'message' in error
          ? String(error.message)
          : undefined,
    );
  }
}
