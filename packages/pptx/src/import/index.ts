import type { Deck } from '@slidr/model';
import type { ImportWarning } from '../warnings';
import { isCompoundFile, ZipError } from '../zip';
import { PackageReader } from './package';
import { SlideImporter, type PptxImportOptions } from './slides';

export type { PptxImportOptions, StoreAsset } from './slides';

/*
 * A PowerPoint file as a deck: every slide, with its layout, background, objects, notes,
 * transition and animations, the objects editable as Slidr's own. See docs/adr/ADR-108-powerpoint-files.md.
 */

export interface PptxImportResult {
  deck: Deck;
  warnings: ImportWarning[];
  /** The font families the deck's text is set in. */
  fonts: string[];
}

/** Why a file could not be read at all. */
export class PptxReadError extends Error {
  override name = 'PptxReadError';
  constructor(
    readonly reason: 'protected' | 'not-pptx' | 'broken',
    message: string,
  ) {
    super(message);
  }
}

export async function importPptx(
  bytes: Uint8Array,
  options: PptxImportOptions,
): Promise<PptxImportResult> {
  if (isCompoundFile(bytes)) {
    throw new PptxReadError(
      'protected',
      'The file is protected with a password, or is an old .ppt file.',
    );
  }
  let pkg: PackageReader;
  try {
    pkg = new PackageReader(bytes);
  } catch (error) {
    throw new PptxReadError('not-pptx', error instanceof ZipError ? error.message : String(error));
  }
  if (!pkg.has('[Content_Types].xml') || !(await pkg.xml('[Content_Types].xml'))) {
    throw new PptxReadError('not-pptx', 'The file is not an Office document.');
  }
  const importer = new SlideImporter(pkg, options);
  let deck: Deck;
  try {
    deck = await importer.run();
  } catch (error) {
    throw new PptxReadError('broken', error instanceof Error ? error.message : String(error));
  }
  return { deck, warnings: importer.warnings.list, fonts: [...importer.fonts].sort() };
}
