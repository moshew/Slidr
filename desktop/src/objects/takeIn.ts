import type { AssetMeta, Point } from '@slidr/model';
import type { AssetService } from '../document/assets';
import { i18n } from '../i18n';
import { focusStage, tell, type Editor } from '../shell';
import { insertAssetsCommands } from '../stage/insert';
import { svgMarkups } from './svgImport';

/*
 * Taking files into a slide: the Insert button, a drop on the Stage and a paste all end here.
 * Each file is taken by itself, so one that cannot be taken does not cost the others their
 * place, and the user is told about every file that was left out, and why.
 */

/**
 * Whether the webview can draw a picture file. The asset store calls a file a picture by what
 * its bytes say (a TIFF, a HEIC, a file that is only a header), and the webview draws fewer
 * formats than that: such a file would be an image element that shows nothing. The one that
 * will have to draw it is asked.
 */
export async function canDraw(file: Blob): Promise<boolean> {
  const url = URL.createObjectURL(file);
  const picture = new Image();
  picture.src = url;
  try {
    await picture.decode();
    return picture.naturalWidth > 0 && picture.naturalHeight > 0;
  } catch {
    return false;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export type Draws = (file: Blob) => Promise<boolean>;

/** Why a file was left out, in the words the user is told. */
type Reason = 'notShown' | 'notMedia' | 'unreadable';

const said = (reason: Reason, name: string): string =>
  i18n.t(`objects:insert.reason.${reason}`, { name });

/** A file that was left out: `message` says which and why, in the language of the UI. */
export class NotTaken extends Error {
  constructor(reason: Reason, name: string) {
    super(said(reason, name));
    this.name = 'NotTaken';
  }
}

/**
 * A file as an asset of the document, for a place that shows it as a picture (a new image, a
 * replaced one, a fill, a poster). Rejects with `NotTaken` for a picture the webview cannot
 * draw, so nothing is left showing an empty frame.
 */
export async function importPicture(
  assets: AssetService,
  file: File,
  draws: Draws = canDraw,
): Promise<AssetMeta> {
  const asset = await assets.import(file);
  if (asset.kind === 'image' && !(await draws(file))) throw new NotTaken('notShown', file.name);
  return asset;
}

const SHOWN = new Set<AssetMeta['kind']>(['image', 'svg', 'video', 'audio']);

/**
 * Files become assets of the document and elements of the current slide around `at`, as one
 * change: one undo step, and the new elements end selected. A file that cannot be read, is not
 * something a slide shows, or is a picture the webview cannot draw is left out, the others go
 * in, and one message names every file that was left out.
 *
 * `toStage` gives the keyboard to the Stage afterwards, for a caller whose own control had it
 * (the Insert button): Delete and the arrows then act on what was just put in.
 */
export async function insertFiles(
  editor: Pick<Editor, 'assets' | 'bus' | 'selection'>,
  files: readonly File[],
  at: Point,
  label: string,
  { toStage = false, draws = canDraw }: { toStage?: boolean; draws?: Draws } = {},
): Promise<void> {
  const taken: { file: File; asset: AssetMeta }[] = [];
  const left: string[] = [];
  const results = await Promise.allSettled(
    files.map(async (file) => {
      const asset = await importPicture(editor.assets, file, draws);
      if (!SHOWN.has(asset.kind)) throw new NotTaken('notMedia', file.name);
      return asset;
    }),
  );
  results.forEach((result, i) => {
    const file = files[i] as File;
    if (result.status === 'fulfilled') taken.push({ file, asset: result.value });
    else {
      left.push(
        result.reason instanceof NotTaken ? result.reason.message : said('unreadable', file.name),
      );
    }
  });

  // The slide of the moment the files are in: the user may have moved on while they loaded.
  const slideId = editor.selection.getState().currentSlideId;
  if (slideId && taken.length > 0) {
    const assets = taken.map((one) => one.asset);
    const { commands, elementIds } = insertAssetsCommands(
      slideId,
      assets,
      editor.bus.deck.size,
      at,
      (id) => id in editor.bus.deck.assets,
      // An SVG file goes in as cleaned markup, so its colours can be replaced (SHP-06, SEC-06).
      await svgMarkups(
        taken.map((one) => one.file),
        assets,
      ),
    );
    if (commands.length > 0) {
      editor.bus.batch(commands, { label });
      editor.selection.getState().selectElements(elementIds);
      if (toStage) focusStage();
    }
  }
  if (left.length > 0) {
    const title = files.length === 1 ? 'failed' : taken.length > 0 ? 'failedSome' : 'failedAll';
    await tell(i18n.t(`objects:insert.${title}`), left.join(' '));
  }
}
