import { mediaFiles, readMediaJson } from '@slidr/media-library';

/*
 * The third-party notices of this build (WG13-T05): a text file the build writes into its own
 * output (`build/notices.ts`), so the app carries the licences of what it is made from. In
 * development the dev server answers the same address with a note that says so.
 *
 * The content of the media library (the fonts of decks, the art of Elements) is not part of the
 * build: each piece made from someone else's work carries its notice beside it in the library,
 * `<name>.notice.json`, and the notices are read from there when they are asked for.
 */

/** Where the file is, beside the app's pages. */
export const NOTICES_PATH = '/THIRD-PARTY-NOTICES.txt';

/** The notices, as text. Rejects when the build has none. */
export async function loadNotices(): Promise<string> {
  const response = await fetch(NOTICES_PATH);
  const type = response.headers.get('content-type') ?? '';
  // A dev server answers an unknown address with the app's page: that is not the file.
  if (!response.ok || type.includes('text/html')) {
    throw new Error(`${NOTICES_PATH} is not part of this build (${response.status})`);
  }
  return response.text();
}

/** A notice of the media library, as `build/notices.ts` and the generators write one. */
export interface LibraryNotice {
  name: string;
  version?: string;
  license: string;
  author?: string;
  homepage?: string;
  text: string;
}

const isNotice = (value: unknown): value is LibraryNotice => {
  const notice = value as Partial<LibraryNotice> | undefined;
  return (
    typeof notice?.name === 'string' &&
    typeof notice.license === 'string' &&
    typeof notice.text === 'string'
  );
};

/**
 * The notices of the media library as a part of the notices' text: who is in it and under which
 * licence, then each licence text once. `unread` notices the library names could not be read
 * now (no network, and not used before), and are said to be missing. Empty when there is nothing
 * to say.
 */
export function libraryNoticesText(notices: readonly LibraryNotice[], unread = 0): string {
  if (notices.length === 0 && unread === 0) return '';
  const sorted = [...notices].sort((a, b) => a.name.localeCompare(b.name));
  // One text serves every notice that carries the same words.
  const texts = new Map<string, { text: string; users: string[] }>();
  for (const notice of sorted) {
    const key = notice.text.replace(/\s+/g, ' ').trim();
    const entry = texts.get(key) ?? { text: notice.text, users: [] };
    entry.users.push(notice.version ? `${notice.name} ${notice.version}` : notice.name);
    texts.set(key, entry);
  }
  const rule = '='.repeat(78);
  return [
    rule,
    `In the media library: fonts of decks, icons and art (${sorted.length})`,
    rule,
    ...sorted.map(({ name, version, license, author, homepage }) =>
      [version ? `${name} ${version}` : name, license, author && `by ${author}`, homepage]
        .filter(Boolean)
        .join('  |  '),
    ),
    ...(unread > 0
      ? ['', `${unread} more could not be read now: they are read from the media library.`]
      : []),
    ...[...texts.values()].flatMap(({ text, users }) => [
      '',
      `----- ${users.join(', ')} -----`,
      '',
      text,
    ]),
    '',
  ].join('\n');
}

/** The notices of the media library, as text; empty when it names none or cannot be read. */
export async function loadLibraryNotices(): Promise<string> {
  const paths = [...(await mediaFiles())].filter((path) => path.endsWith('.notice.json'));
  const read = await Promise.all(paths.map((path) => readMediaJson(path)));
  const notices = read.filter(isNotice);
  return libraryNoticesText(notices, paths.length - notices.length);
}
