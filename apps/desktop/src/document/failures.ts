import { DeckLoadError, type Deck } from '@slidr/model';
import { i18n } from '../i18n';
import { StorageError } from './storage';

/*
 * What went wrong with a file, as the user is told (WG13-T03). The storage layer and the model
 * report failures as kinds with an English message for logs; this is where a kind becomes a
 * sentence in the language of the interface. See `messages.ts`.
 */

/** What a file failure is, to the user. */
export type FailureKind =
  /** Not a deck this app can read: not an archive, an archive cut short, a deck that is not one. */
  | 'damaged'
  | 'newer_version'
  | 'not_found'
  | 'disk_full'
  /** The file system said no: a file in use, a folder without permission. */
  | 'refused'
  | 'other';

export function failureKind(error: unknown): FailureKind {
  if (error instanceof StorageError) {
    switch (error.kind) {
      case 'invalid_file':
        return 'damaged';
      case 'not_found':
        return 'not_found';
      case 'disk_full':
        return 'disk_full';
      case 'io':
        return 'refused';
      default:
        return 'other';
    }
  }
  if (error instanceof DeckLoadError) {
    return error.code === 'newer_version' ? 'newer_version' : 'damaged';
  }
  // `deck.json` that is not JSON: the entry was cut short, or overwritten with something else.
  if (error instanceof SyntaxError) return 'damaged';
  return 'other';
}

/** The sentence for a failed file operation: what happened and what to do. */
export function describeFailure(error: unknown): string {
  return i18n.t(`document:failure.${failureKind(error)}`);
}

/** The few words the status bar shows while the autosave cannot write. */
export function autosaveFailure(kind: FailureKind): string {
  return i18n.t(kind === 'disk_full' ? 'document:autosave.disk_full' : 'document:autosave.failed');
}

/** As many of the files' names as a sentence reads well with. */
const NAMES_SHOWN = 4;

/**
 * What the user is told after a save that went through without some of the deck's files
 * (`SavedDeck.missingAssets`): how many, the names they were added under where the deck knows
 * them (a name inside `assets/` is a hash), and what to do.
 */
export function describeMissingAssets(
  deck: Deck,
  files: readonly string[],
): { title: string; body: string } {
  const byFile = new Map(Object.values(deck.assets).map((asset) => [asset.file, asset]));
  const names = files.flatMap((file) => byFile.get(file)?.name ?? []);
  const shown = names.slice(0, NAMES_SHOWN).join(', ') + (names.length > NAMES_SHOWN ? ', …' : '');
  const count = files.length;
  const body = [
    i18n.t('document:saved.missing', { count }),
    ...(names.length === 0
      ? []
      : names.length === count
        ? [i18n.t('document:saved.missingNames', { count, names: shown })]
        : [i18n.t('document:saved.missingAmong', { names: shown })]),
    i18n.t('document:saved.missingNext', { count }),
  ];
  return { title: i18n.t('document:saved.missingTitle'), body: body.join(' ') };
}
