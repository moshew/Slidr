import { DeckLoadError } from '@slidr/model';
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
