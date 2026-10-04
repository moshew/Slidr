import { createDeck, createElement, createSlide, type AssetMeta, type Deck } from '@slidr/model';
import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';
import {
  embeddedSize,
  exportFileName,
  fontFamilyName,
  formatBytes,
  LARGE_MEDIA_BYTES,
  ltr,
  MEDIA_INSIDE_LIMIT_BYTES,
  mediaFolderName,
  planExport,
  planMedia,
} from './exportDeck';
import { en, he } from './messages';
import { warningText } from './warnings';

const deck = createDeck({
  slides: [
    createSlide({ id: 's_1' }),
    createSlide({ id: 's_2', hidden: true }),
    createSlide({ id: 's_3' }),
    createSlide({ id: 's_4' }),
    createSlide({ id: 's_5', hidden: true }),
  ],
});

describe('planExport', () => {
  it('exports the whole deck without its hidden slides, and says how many those are', () => {
    expect(planExport(deck, null)).toEqual({ slideIds: ['s_1', 's_3', 's_4'], hidden: 2 });
  });

  it('takes a range by position, both ends included', () => {
    expect(planExport(deck, { from: 2, to: 4 })).toEqual({ slideIds: ['s_3', 's_4'], hidden: 1 });
    expect(planExport(deck, { from: 4, to: 4 })).toEqual({ slideIds: ['s_4'], hidden: 0 });
    // Typed the other way round, it is the same range.
    expect(planExport(deck, { from: 4, to: 2 }).slideIds).toEqual(['s_3', 's_4']);
    // Past the ends, it is what the deck has.
    expect(planExport(deck, { from: 0, to: 99 }).slideIds).toEqual(['s_1', 's_3', 's_4']);
  });

  it('may come to nothing: a range of hidden slides only', () => {
    expect(planExport(deck, { from: 5, to: 5 })).toEqual({ slideIds: [], hidden: 1 });
  });
});

describe('exportFileName', () => {
  it('is the name of the document, else the title of the deck, else the fallback', () => {
    expect(exportFileName('C:\\decks\\Roadmap 2027.slidr', 'Other', 'Untitled')).toBe(
      'Roadmap 2027.html',
    );
    expect(exportFileName('/home/me/plan.SLIDR', '', 'Untitled')).toBe('plan.html');
    expect(exportFileName(null, 'מפת דרכים', 'Untitled')).toBe('מפת דרכים.html');
    expect(exportFileName(null, '   ', 'מצגת ללא שם')).toBe('מצגת ללא שם.html');
  });

  it('leaves out what a file name cannot hold', () => {
    expect(exportFileName(null, 'Q3: plan / review? "final"', 'x')).toBe(
      'Q3 plan review final.html',
    );
  });
});

describe('formatBytes', () => {
  it('reads as a person would say it', () => {
    expect(formatBytes(820)).toBe('820 B');
    expect(formatBytes(41_300)).toBe('41 kB');
    expect(formatBytes(999_400)).toBe('999 kB');
    expect(formatBytes(999_600)).toBe('1.0 MB');
    expect(formatBytes(2_380_000)).toBe('2.4 MB');
    expect(formatBytes(48_200_000)).toBe('48 MB');
  });
});

describe('fontFamilyName', () => {
  it('is the family, also for its Hebrew-only face', () => {
    expect(fontFamilyName('Heebo::hebrew')).toBe('Heebo');
    expect(fontFamilyName('IBM Plex Sans Hebrew')).toBe('IBM Plex Sans Hebrew');
  });
});

describe('warningText', () => {
  // The key and its values, as the dialog's `t` would be asked.
  const t = ((key: string, values?: { name?: string }) =>
    `${key}(${values?.name ?? ''})`) as unknown as TFunction<'export'>;

  it('says a warning in the language of the UI, by its code', () => {
    // The file name is kept apart from the Hebrew around it, to be read left to right.
    expect(
      warningText(t, {
        code: 'asset-unreadable',
        subject: 'clip.mp4',
        message: 'Asset clip.mp4 could not be read',
      }),
    ).toBe(`warning.assetUnreadable(${ltr('clip.mp4')})`);
    expect(ltr('clip.mp4')).toHaveLength('clip.mp4'.length + 2);
    expect(warningText(t, { code: 'shadow-roots', message: 'No shadow roots' })).toBe(
      'warning.noShadowRoots()',
    );
  });

  it('has a string in both languages for every code', () => {
    const codes = [
      'asset-unreadable',
      'font-unreadable',
      'font-whole',
      'fonts-whole',
      'shadow-roots',
    ] as const;
    for (const code of codes) {
      const key = warningText(t, { code, message: '' }).replace(/^warning\.|\(.*$/g, '');
      expect(he.warning, key).toHaveProperty(key);
      expect(en.warning, key).toHaveProperty(key);
    }
  });
});

describe('the video and audio of an export (MED-05)', () => {
  const CLIP = 'a'.repeat(64);
  const SOUND = 'b'.repeat(64);
  const PICTURE = 'c'.repeat(64);
  const UNUSED = 'd'.repeat(64);
  const frame = { x: 0, y: 0, w: 640, h: 360 };
  const asset = (id: string, kind: AssetMeta['kind'], bytes: number): AssetMeta => ({
    id,
    file: `${id}.bin`,
    mime: 'application/octet-stream',
    kind,
    bytes,
    origin: 'upload',
  });

  /** A video with a picture as its poster on the first slide, a sound on the third. */
  function withMedia(clipBytes = 3_000_000, soundBytes = 600_000): Deck {
    const base = createDeck({
      slides: [
        createSlide({
          id: 's_1',
          elements: [
            createElement.video({ id: 'e_v', frame, assetId: CLIP, poster: { assetId: PICTURE } }),
          ],
        }),
        createSlide({ id: 's_2' }),
        createSlide({
          id: 's_3',
          elements: [createElement.audio({ id: 'e_a', frame, assetId: SOUND })],
        }),
      ],
    });
    return {
      ...base,
      assets: {
        [CLIP]: asset(CLIP, 'video', clipBytes),
        [SOUND]: asset(SOUND, 'audio', soundBytes),
        [PICTURE]: asset(PICTURE, 'image', 80_000),
        [UNUSED]: asset(UNUSED, 'video', 900_000_000),
      },
    };
  }

  it('is the video and audio the exported slides use, and nothing else', () => {
    const media = planMedia(withMedia(), ['s_1', 's_2', 's_3']);
    // Not the picture, which always goes into the file, and not a video no slide shows.
    expect(media.assets.map((a) => a.id)).toEqual([CLIP, SOUND]);
    expect(media.bytes).toBe(3_600_000);
    expect(planMedia(withMedia(), ['s_3']).assets.map((a) => a.id)).toEqual([SOUND]);
    expect(planMedia(withMedia(), ['s_2'])).toMatchObject({ assets: [], bytes: 0, inFile: 0 });
  });

  it('weighs a third more inside the file than as files', () => {
    expect(embeddedSize(3)).toBe(4);
    expect(embeddedSize(4)).toBe(8);
    expect(embeddedSize(3_600_000)).toBe(4_800_000);
    expect(planMedia(withMedia(), ['s_1', 's_3']).inFile).toBe(4_800_000);
  });

  it('warns when the media would make the file large, and refuses what one file cannot hold', () => {
    const all = ['s_1', 's_3'];
    expect(planMedia(withMedia(), all)).toMatchObject({ large: false, tooLarge: false });
    // The thresholds are of what the media adds to the file, not of the files themselves.
    const justUnder = Math.floor((LARGE_MEDIA_BYTES / 4) * 3) - 600_000;
    expect(planMedia(withMedia(justUnder), all).large).toBe(false);
    expect(planMedia(withMedia(justUnder + 3), all)).toMatchObject({
      large: true,
      tooLarge: false,
    });
    expect(planMedia(withMedia(240_000_000), all)).toMatchObject({ large: true, tooLarge: true });
    expect(LARGE_MEDIA_BYTES).toBeLessThan(MEDIA_INSIDE_LIMIT_BYTES);
  });

  it('names the folder after the file, as Rust does for the path', () => {
    // The same cases as `the_folder_is_named_after_the_file_without_its_extension` in commands.rs.
    expect(mediaFolderName('deck.html')).toBe('deck_media');
    expect(mediaFolderName('C:/out/my.deck.HTM')).toBe('my.deck_media');
    expect(mediaFolderName('C:\\out\\Road map 2027.html')).toBe('Road map 2027_media');
    expect(mediaFolderName('מצגת ראשונה.html')).toBe('מצגת ראשונה_media');
  });

  it('has its strings in both languages, with the same placeholders', () => {
    const placeholders = (text: string) => (text.match(/\{\{\w+\}\}/g) ?? []).sort();
    for (const [key, text] of Object.entries(he.media)) {
      expect(placeholders(en.media[key as keyof typeof he.media]), key).toEqual(placeholders(text));
    }
    for (const key of ['media', 'mediaFolder', 'mediaDownloaded'] as const) {
      expect(placeholders(en.done[key]), key).toEqual(placeholders(he.done[key]));
    }
    expect(en.failed.media).not.toBe(he.failed.media);
  });
});
