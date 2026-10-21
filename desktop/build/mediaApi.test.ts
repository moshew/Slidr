import { describe, expect, it } from 'vitest';
import type { Manifest } from './media.ts';
import { authorChanges, nextBase, summary } from './mediaApi.ts';

const manifest = (files: Record<string, string>, published = 'p'): Manifest => ({
  version: 1,
  published,
  files: Object.fromEntries(
    Object.entries(files).map(([path, sha256]) => [path, { size: 1, sha256 }]),
  ),
});

describe('publishing an author’s copy through the library’s API', () => {
  it('sends only what the author changed since the pull, with the hash it was changed from', () => {
    const base = manifest({ 'a.json': '1', 'b.json': '2', 'c.json': '3' });
    const copy = manifest({ 'a.json': '1', 'b.json': '9', 'd.json': '4' });
    const changes = authorChanges(base, copy);
    expect(changes).toEqual({
      'b.json': { from: '2', to: { size: 1, sha256: '9' } },
      'c.json': { from: '3', to: null },
      'd.json': { from: null, to: { size: 1, sha256: '4' } },
    });
    expect(summary(changes)).toEqual({
      added: ['d.json'],
      changed: ['b.json'],
      removed: ['c.json'],
    });
  });

  it('keeps as the base what the library changed that the copy has not pulled', () => {
    const base = manifest({ 'a.json': '1', 'tags/emoji.json': 't1', 'gone.json': 'g' });
    const copy = manifest({ 'a.json': '2', 'tags/emoji.json': 't1' });
    // Published since the pull: the author's file, and an upload's tags.
    const live = manifest({ 'a.json': '2', 'tags/emoji.json': 't2', 'new.json': 'n' }, 'q');
    const next = nextBase(base, copy, live);
    expect(next.published).toBe('q');
    expect(next.files['a.json']!.sha256).toBe('2');
    // Still t1 in the base: the next publication does not send the old tags back.
    expect(next.files['tags/emoji.json']!.sha256).toBe('t1');
    expect(authorChanges(next, copy)).toEqual({});
    expect(next.files['gone.json']).toBeUndefined();
    expect(next.files['new.json']).toBeUndefined();
  });
});
