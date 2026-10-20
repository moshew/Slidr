import { contentLanguageOf, LANGUAGE_SCRIPT, type AssetMeta, type Deck } from '@slidr/model';
import { exportPptx, type ExportWarning, type PptxExportResult } from '@slidr/pptx';
import { builtinFamilies } from '../fonts';
import { i18n } from '../i18n';
import {
  planExport,
  writeExport,
  type Destination,
  type ExportChoices,
} from '../export/exportDeck';
import type { Editor } from '../shell';
import { elementPictures, toPng, videoFrame } from './pictures';

/*
 * The deck as a PowerPoint file (ADR-108): the choices of the dialog, the export with what only
 * the app can do for it (the assets' bytes, the pictures of objects PowerPoint has no object
 * for, the counterparts of the fonts), and the file written where the user chose.
 */

export const PPTX_MIME =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';

/** The library's families by their name, whatever its case. */
const families = new Map(builtinFamilies.map((entry) => [entry.family.toLowerCase(), entry]));

/**
 * The family of the font library that draws a language's letters for text set in `family`,
 * where `family` has none of them (ADR-105). Undefined where it has them, or is not known.
 */
export function counterpart(family: string, lang: string): string | undefined {
  const entry = families.get(family.toLowerCase());
  if (!entry) return undefined;
  const language = contentLanguageOf(lang);
  const script = language === 'he' ? 'he' : language ? LANGUAGE_SCRIPT[language] : undefined;
  if (!script || entry.scripts.includes(script)) return undefined;
  return entry.counterparts?.[script];
}

/** An asset's bytes, from where the renderer loads it. */
async function assetBlob(editor: Editor, asset: AssetMeta): Promise<Blob | undefined> {
  const url = editor.assets.url(asset);
  if (!url) return undefined;
  const response = await fetch(url);
  return response.ok ? response.blob() : undefined;
}

/** The deck as a `.pptx`, the slides and animations as the dialog chose. */
export function exportDeckPptx(
  editor: Editor,
  deck: Deck,
  choices: Pick<ExportChoices, 'range' | 'animations'>,
): Promise<PptxExportResult> {
  const resolveAsset = (asset: AssetMeta) => editor.assets.url(asset);
  return exportPptx(deck, {
    loadAsset: (asset) => assetBlob(editor, asset),
    slideIds: planExport(deck, choices.range).slideIds,
    animations: choices.animations,
    picture: elementPictures({
      resolveAsset,
      workspaceId: () => editor.document?.workspace?.id ?? null,
    }),
    toPng,
    videoFrame,
    counterpart,
    prompts: {
      title: i18n.t('export.promptTitle', { ns: 'pptx' }),
      text: i18n.t('export.promptText', { ns: 'pptx' }),
    },
  });
}

const reason = (error: unknown): string =>
  error instanceof Error
    ? error.message
    : typeof error === 'object' && error !== null && 'message' in error
      ? String(error.message)
      : String(error);

export type PptxOutcome =
  | { ok: true; result: PptxExportResult; destination: Destination; seconds: number }
  | { ok: false; step: 'export' | 'save'; message: string };

/** Exports the deck and writes the file to a destination already chosen. */
export async function exportPptxTo(
  editor: Editor,
  deck: Deck,
  choices: Pick<ExportChoices, 'range' | 'animations'>,
  destination: Destination,
): Promise<PptxOutcome> {
  const started = performance.now();
  let result: PptxExportResult;
  try {
    result = await exportDeckPptx(editor, deck, choices);
  } catch (error) {
    console.error('The PowerPoint export failed', error);
    return { ok: false, step: 'export', message: reason(error) };
  }
  try {
    await writeExport(destination, result.bytes, PPTX_MIME);
  } catch (error) {
    console.error('The PowerPoint file was not written', error);
    return { ok: false, step: 'save', message: reason(error) };
  }
  return { ok: true, result, destination, seconds: (performance.now() - started) / 1000 };
}

/** Warnings of one code and detail, with the slides they are on. */
export interface WarningLine {
  code: string;
  detail?: string;
  slides: number[];
}

/** Warnings as the lines of a report: the same code and detail on many slides is one line. */
export function warningLines(
  warnings: readonly { code: string; slide?: number; detail?: string }[],
): WarningLine[] {
  const lines = new Map<string, WarningLine>();
  for (const w of warnings) {
    const key = `${w.code}|${w.detail ?? ''}`;
    let line = lines.get(key);
    if (!line) {
      line = { code: w.code, ...(w.detail ? { detail: w.detail } : {}), slides: [] };
      lines.set(key, line);
    }
    if (w.slide !== undefined && !line.slides.includes(w.slide)) line.slides.push(w.slide);
  }
  return [...lines.values()].map((line) => ({
    ...line,
    slides: line.slides.sort((a, b) => a - b),
  }));
}

export type { ExportWarning };
