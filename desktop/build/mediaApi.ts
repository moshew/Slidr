/**
 * Publishing an author's copy of the media library through Slidr Library's API, once the library
 * lives in its Worker's bucket (docs/media-library.md, "Changing it"): only the files the author
 * changed since the copy was pulled are sent, each with the hash it was changed from, so a file
 * the library changed meanwhile (a published upload) is a conflict, never written over, and
 * every file the author did not change stays as the library has it.
 */
import type { Manifest, ManifestEntry } from './media.ts';

/** The manifest an author's copy was pulled with (`pnpm media:pull`), kept in the copy. */
export const BASE_FILE = '.published-manifest.json';

/** The header the library sends when it is served from its bucket. */
export const LIVE_HEADER = 'x-slidr-library';

/** Slidr Library, whose API takes the publication. */
export const LIBRARY_URL = 'https://library.slidr.workers.dev';

/** What a publication does to one path: the file it was, and the file it is to be. */
export interface FileChange {
  from: string | null;
  to: ManifestEntry | null;
}

/** The files of the copy that are not as it was pulled (`base`): added, changed, taken away. */
export function authorChanges(base: Manifest, copy: Manifest): Record<string, FileChange> {
  const changes: Record<string, FileChange> = {};
  const paths = [...new Set([...Object.keys(base.files), ...Object.keys(copy.files)])].sort();
  for (const path of paths) {
    const was = base.files[path];
    const is = copy.files[path];
    if (was?.sha256 === is?.sha256) continue;
    changes[path] = {
      from: was?.sha256 ?? null,
      to: is ? { size: is.size, sha256: is.sha256 } : null,
    };
  }
  return changes;
}

/** The changes, as a publication's report names them. */
export function summary(changes: Record<string, FileChange>) {
  const entries = Object.entries(changes);
  return {
    added: entries.filter(([, one]) => one.to && !one.from).map(([path]) => path),
    changed: entries.filter(([, one]) => one.to && one.from).map(([path]) => path),
    removed: entries.filter(([, one]) => !one.to).map(([path]) => path),
  };
}

/**
 * What the copy holds as the library holds it, after a publication: the base for the next. A file
 * the copy has as the library now has it takes the library's entry; one the library changed that
 * the copy has not pulled keeps its old entry, so it is not sent back; one gone from both goes.
 */
export function nextBase(base: Manifest, copy: Manifest, live: Manifest): Manifest {
  const files: Record<string, ManifestEntry> = { ...base.files };
  for (const [path, entry] of Object.entries(copy.files)) {
    const now = live.files[path];
    if (now?.sha256 === entry.sha256) files[path] = now;
  }
  for (const path of Object.keys(files)) {
    if (!copy.files[path] && !live.files[path]) delete files[path];
  }
  return { version: 1, published: live.published, files };
}
