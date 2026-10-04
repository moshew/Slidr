// @vitest-environment happy-dom
import { DeckLoadError } from '@slidr/model';
import { afterEach, describe, expect, it } from 'vitest';
import { i18n } from '../i18n';
import { autosaveFailure, describeFailure, failureKind } from './failures';
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
});
