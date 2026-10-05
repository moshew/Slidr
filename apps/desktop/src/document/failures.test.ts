// @vitest-environment happy-dom
import { createDeck, DeckLoadError, type AssetMeta } from '@slidr/model';
import { afterEach, describe, expect, it } from 'vitest';
import { i18n } from '../i18n';
import { autosaveFailure, describeFailure, describeMissingAssets, failureKind } from './failures';
import './register';
import { StorageError } from './storage';

describe('what the user is told when a file operation fails (WG13-T03)', () => {
  afterEach(() => i18n.changeLanguage('he'));

  it('tells a damaged file from a full disk, a refusal and a file that is gone', () => {
    expect(failureKind(new StorageError('invalid_file', 'not a .slidr file: bad zip'))).toBe(
      'damaged',
    );
    expect(failureKind(new DeckLoadError('invalid', 'The deck is not valid'))).toBe('damaged');
    expect(failureKind(new DeckLoadError('not_a_deck', 'x'))).toBe('damaged');
    expect(failureKind(new SyntaxError('Unexpected end of JSON input'))).toBe('damaged');
    expect(failureKind(new DeckLoadError('newer_version', 'x'))).toBe('newer_version');
    expect(failureKind(new StorageError('disk_full', 'os error 112'))).toBe('disk_full');
    expect(failureKind(new StorageError('io', 'os error 5'))).toBe('refused');
    expect(failureKind(new StorageError('not_found', 'x'))).toBe('not_found');
    expect(failureKind(new StorageError('internal', 'x'))).toBe('other');
    expect(failureKind(new Error('anything'))).toBe('other');
    expect(failureKind('a string')).toBe('other');
  });

  it('says it in the language of the interface, without the error own text', async () => {
    const full = new StorageError('disk_full', 'could not write the archive: os error 112');
    expect(describeFailure(full)).toContain('אין מספיק מקום בדיסק');
    expect(describeFailure(full)).not.toContain('os error');
    expect(describeFailure(new StorageError('invalid_file', 'x'))).toContain('הקובץ פגום');
    expect(autosaveFailure('disk_full')).toBe('השמירה האוטומטית נכשלה: אין מקום בדיסק');
    expect(autosaveFailure('refused')).toBe('השמירה האוטומטית נכשלה');

    await i18n.changeLanguage('en');
    expect(describeFailure(full)).toContain('not enough room on the disk');
    expect(describeFailure(new DeckLoadError('newer_version', 'x'))).toContain('newer version');
    expect(autosaveFailure('disk_full')).toBe('Autosave failed: the disk is full');
  });

  it('says how many files a save went without, and their names where the deck knows them', async () => {
    const asset = (id: string, name?: string): AssetMeta => ({
      id,
      file: `${id}.png`,
      mime: 'image/png',
      kind: 'image',
      bytes: 1,
      origin: 'upload',
      ...(name ? { name } : {}),
    });
    const named = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => asset(id, `${id}-photo.jpg`));
    const deck = createDeck();
    deck.assets = Object.fromEntries([...named, asset('bare')].map((a) => [a.id, a]));
    const said = (files: string[]) => describeMissingAssets(deck, files).body;

    expect(describeMissingAssets(deck, ['a.png']).title).toBe(
      'המצגת נשמרה, אבל לא כל הקבצים שלה בקובץ',
    );
    expect(said(['a.png'])).toBe(
      'קובץ אחד שהמצגת משתמשת בו (תמונה, וידאו, אודיו או גופן) לא נמצא, ולכן אינו בקובץ השמור. בשקף הוא מוצג כחסר. שם הקובץ: a-photo.jpg. אפשר להחליף אותו בקובץ מהמחשב, ואז לשמור שוב.',
    );
    expect(said(['a.png', 'b.png'])).toContain('שני קבצים');
    expect(said(['a.png', 'b.png'])).toContain('שמות הקבצים: a-photo.jpg, b-photo.jpg.');
    // A name inside the assets folder is a hash, and is never shown: only the names files came by.
    expect(said(['bare.png'])).not.toContain('bare');
    expect(said(['bare.png'])).not.toContain('שם הקובץ');
    expect(said(['a.png', 'bare.png', 'https://example.com/x.png'])).toContain(
      '3 קבצים שהמצגת משתמשת בהם',
    );
    expect(said(['a.png', 'bare.png'])).toContain('ביניהם: a-photo.jpg.');
    // A long list is cut, and says so.
    expect(said(named.map((a) => a.file))).toContain(
      'שמות הקבצים: a-photo.jpg, b-photo.jpg, c-photo.jpg, d-photo.jpg, ….',
    );

    await i18n.changeLanguage('en');
    expect(said(['a.png'])).toBe(
      'One file the deck uses (a picture, a video, a sound or a font) was not found, so it is not in the saved file. On its slide it shows as missing. Its name: a-photo.jpg. You can replace it with a file from your computer, then save again.',
    );
    expect(said(['a.png', 'b.png'])).toContain('2 files the deck uses');
    expect(said(['a.png', 'bare.png'])).toContain('Among them: a-photo.jpg.');
  });
});
