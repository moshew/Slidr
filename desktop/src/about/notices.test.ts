import { describe, expect, it, vi } from 'vitest';

const library = vi.hoisted(() => ({ files: new Map<string, unknown>() }));
vi.mock('@slidr/media-library', () => ({
  mediaFiles: () => Promise.resolve(new Set(library.files.keys())),
  readMediaJson: (path: string) => Promise.resolve(library.files.get(path)),
}));

import { libraryNoticesText, loadLibraryNotices, type LibraryNotice } from './notices';

const OFL = 'Copyright The Heebo Project Authors\n\nSIL OPEN FONT LICENSE Version 1.1';
const heebo: LibraryNotice = {
  name: '@fontsource-variable/heebo',
  version: '5.3.0',
  license: 'OFL-1.1',
  author: 'Google Inc.',
  homepage: 'https://fontsource.org/fonts/heebo',
  text: OFL,
};
const twemoji: LibraryNotice = {
  name: '@iconify-json/twemoji',
  version: '1.2.5',
  license: 'CC-BY-4.0',
  author: 'Twitter, https://github.com/twitter/twemoji',
  text: 'Twitter Emoji, by Twitter.\nCreative Commons Attribution 4.0',
};

describe('the notices of the media library', () => {
  it('list who is in it with their licence, then each licence text once', () => {
    const rubik = { ...heebo, name: '@fontsource-variable/rubik', homepage: undefined };
    const text = libraryNoticesText([twemoji, heebo, rubik]);
    expect(text).toContain('In the media library: fonts of decks, icons and art (3)');
    expect(text).toContain(
      '@fontsource-variable/heebo 5.3.0  |  OFL-1.1  |  by Google Inc.  |  https://fontsource.org/fonts/heebo',
    );
    expect(text).toContain('@iconify-json/twemoji 1.2.5  |  CC-BY-4.0  |  by Twitter');
    expect(text.split('SIL OPEN FONT LICENSE')).toHaveLength(2);
    expect(text).toContain(
      '----- @fontsource-variable/heebo 5.3.0, @fontsource-variable/rubik 5.3.0 -----',
    );
  });

  it('say what could not be read, and are nothing when there are none', () => {
    expect(libraryNoticesText([heebo], 2)).toContain('2 more could not be read now');
    expect(libraryNoticesText([])).toBe('');
  });

  it('are the notice files the library names, read when asked for', async () => {
    library.files.set('fonts/heebo/heebo.notice.json', heebo);
    library.files.set('elements/art/twemoji.notice.json', twemoji);
    library.files.set('elements/art/broken.notice.json', undefined);
    library.files.set('fonts/catalog.json', { faces: [] });
    const text = await loadLibraryNotices();
    expect(text).toContain('(2)');
    expect(text).toContain('1 more could not be read now');
    expect(text).not.toContain('catalog');
    library.files.clear();
    expect(await loadLibraryNotices()).toBe('');
  });
});
