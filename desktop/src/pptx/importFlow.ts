import type { AssetMeta } from '@slidr/model';
import { importPptx, PptxReadError, type ImportWarning } from '@slidr/pptx';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { builtinFamilies, loadSystemFonts } from '../fonts';
import { userFonts } from '../fonts/userFonts';
import { currentLanguage, i18n } from '../i18n';
import { pickFiles } from '../objects/insert';
import type { Editor } from '../shell';
import { tell } from '../shell/dialogs';
import { newDocumentFrom } from '../shell/fileActions';
import { openImportReport } from './open';

/*
 * Importing a PowerPoint file (ADR-108): the file is read whole, turned into a deck, and opened
 * as a new document, its pictures and media stored with it. Nothing of the open document goes
 * until the new one is ready, and the question about unsaved changes is asked first, as for any
 * document that takes the place of the open one. A report says what came in otherwise than it
 * was in PowerPoint.
 */

const t = (key: string, options?: Record<string, unknown>) =>
  i18n.t(key, { ns: 'pptx', ...options });

const ACCEPT = '.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation';

/** What a file is called on the disk, whichever slash its path has. */
const baseName = (path: string) => path.split(/[\\/]/).at(-1) ?? path;

/** "Import PowerPoint…": asks for the file, and imports it. */
export async function importPptxFile(editor: Editor): Promise<void> {
  if (!isTauri()) {
    const [file] = await pickFiles(ACCEPT);
    if (!file) return;
    await importPptxBytes(editor, file.name, new Uint8Array(await file.arrayBuffer()));
    return;
  }
  const chosen = await openDialog({
    multiple: false,
    directory: false,
    filters: [{ name: t('filter'), extensions: ['pptx'] }],
  });
  if (!chosen) return;
  await importPptxPath(editor, chosen);
}

/** Imports the PowerPoint file at a path: one chosen in the system's dialog. */
export async function importPptxPath(editor: Editor, path: string): Promise<void> {
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await invoke<ArrayBuffer>('pptx_read', { path }));
  } catch (error) {
    console.error('The PowerPoint file could not be read', error);
    await tell(t('import.failed'), t('import.unreadable'));
    return;
  }
  await importPptxBytes(editor, baseName(path), bytes);
}

/** The families the deck's text is set in that this computer cannot draw. */
async function missingFonts(families: readonly string[]): Promise<string[]> {
  // In a plain browser nobody can list the installed fonts: nothing is said of them.
  if (!isTauri()) return [];
  const known = new Set<string>();
  for (const entry of builtinFamilies) known.add(entry.family.toLowerCase());
  for (const font of await loadSystemFonts()) known.add(font.family.toLowerCase());
  for (const font of userFonts()) known.add(font.family.toLowerCase());
  return families.filter((family) => !known.has(family.toLowerCase()));
}

/** Imports a PowerPoint file's bytes as a new document. */
export async function importPptxBytes(
  editor: Editor,
  name: string,
  bytes: Uint8Array,
): Promise<boolean> {
  let warnings: ImportWarning[] = [];
  let slides = 0;
  let created: boolean;
  try {
    created = await newDocumentFrom(editor, async (store) => {
      const result = await importPptx(bytes, {
        lang: currentLanguage(),
        storeAsset: async ({ name: file, mime, bytes: data }): Promise<AssetMeta | undefined> => {
          const asset = await store(
            new File([data as Uint8Array<ArrayBuffer>], file, { type: mime }),
          );
          return asset;
        },
      });
      const missing = await missingFonts(result.fonts);
      warnings = [
        ...result.warnings,
        ...(missing.length ? [{ code: 'fonts' as const, detail: missing.join(', ') }] : []),
      ];
      slides = result.deck.slides.length;
      return result.deck;
    });
  } catch (error) {
    console.error('The PowerPoint file could not be imported', error);
    const reason = error instanceof PptxReadError ? error.reason : 'broken';
    const body =
      reason === 'protected'
        ? t('import.protected')
        : reason === 'not-pptx'
          ? t('import.notPptx')
          : t('import.broken');
    await tell(t('import.failed'), body);
    return false;
  }
  if (!created) return false;
  openImportReport({ name, slides, warnings });
  return true;
}
