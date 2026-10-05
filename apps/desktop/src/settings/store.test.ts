import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsError } from './settings';
import {
  loadSettings,
  pageSettings,
  refreshSettings,
  replaceSection,
  updateSection,
  useSettings,
} from './store';

/*
 * The store of the settings: what a key press and a starting session read without waiting
 * (`replaceSection`), and that the file and the store do not part ways while a write is on.
 */

const sections = () => useSettings.getState().sections;

afterEach(async () => {
  vi.restoreAllMocks();
  for (const name of Object.keys(await pageSettings.read())) await replaceSection(name, null);
});

describe('replacing a section', () => {
  it('is in the store at once, and in the file after', async () => {
    const written = replaceSection('agent', { model: 'a' });
    expect(sections().agent).toEqual({ model: 'a' });
    await written;
    expect(await pageSettings.read()).toEqual({ agent: { model: 'a' } });

    await replaceSection('agent', null);
    expect(sections()).not.toHaveProperty('agent');
    expect(await pageSettings.read()).toEqual({});
  });

  it('writes in the order it was asked, so the file ends as the last one left it', async () => {
    const order: unknown[] = [];
    const write = pageSettings.write.bind(pageSettings);
    vi.spyOn(pageSettings, 'write').mockImplementation(async (name, value) => {
      // The first write is the slow one.
      if (order.length === 0) await new Promise((resolve) => setTimeout(resolve, 20));
      order.push(value);
      return write(name, value);
    });
    void replaceSection('agent', { model: 'a' });
    void replaceSection('agent', { model: 'b' });
    await replaceSection('agent', { model: 'c' });
    expect(order).toEqual([{ model: 'a' }, { model: 'b' }, { model: 'c' }]);
    expect(await pageSettings.read()).toEqual({ agent: { model: 'c' } });
  });

  it('is not undone by a read of the file that began before the write', async () => {
    await loadSettings();
    const read = pageSettings.read.bind(pageSettings);
    let reads = 0;
    vi.spyOn(pageSettings, 'read').mockImplementation(async () => {
      const found = await read();
      // The section is replaced while the first read is on its way back.
      if (reads++ === 0) void replaceSection('shortcuts', { keys: { 'x.y': 'ctrl+j' } });
      return found;
    });
    await refreshSettings();
    expect(sections().shortcuts).toEqual({ keys: { 'x.y': 'ctrl+j' } });
    expect(reads).toBe(2);
  });

  it('rejects when the file refuses, and the next write still goes through', async () => {
    await expect(replaceSection('Bad Name', {})).rejects.toBeInstanceOf(SettingsError);
    await replaceSection('agent', { model: 'a' });
    expect(await pageSettings.read()).toEqual({ agent: { model: 'a' } });
  });

  it('is seen by a change of some fields that follows it', async () => {
    void replaceSection('images', { quality: 'high' });
    await updateSection('images', { defaultProvider: 'mock' });
    expect(await pageSettings.read()).toEqual({
      images: { quality: 'high', defaultProvider: 'mock' },
    });
  });
});

describe('reading the settings again', () => {
  // The bug hunt's `ai-ui.md`, finding 17: the failed read was kept as the answer, so every
  // later read and every `updateSection` gave up at once, until the app was started again.
  it('is tried again after a refresh that failed once, and the store keeps what it held', async () => {
    await replaceSection('stock', { source: 'unsplash' });
    await loadSettings();
    // The file cannot be read for a moment: a scanner, a sync client.
    vi.spyOn(pageSettings, 'read').mockRejectedValueOnce(new Error('settings.json is locked'));
    await expect(refreshSettings()).rejects.toThrow('settings.json is locked');
    expect(sections().stock).toEqual({ source: 'unsplash' });

    await expect(loadSettings()).resolves.toBeUndefined();
    await expect(updateSection('stock', { source: 'pexels' })).resolves.toBeUndefined();
    expect(sections().stock).toEqual({ source: 'pexels' });
    expect(await pageSettings.read()).toEqual({ stock: { source: 'pexels' } });
    await expect(refreshSettings()).resolves.toBeUndefined();
  });

  it('does not let a refresh that failed undo the one that followed it', async () => {
    const read = pageSettings.read.bind(pageSettings);
    let fail: (error: Error) => void = () => undefined;
    const reading = vi
      .spyOn(pageSettings, 'read')
      // The first read hangs, and fails only after the second refresh is done.
      .mockImplementationOnce(() => new Promise((_, reject) => (fail = reject)))
      .mockImplementation(read);
    const first = refreshSettings();
    await refreshSettings();
    fail(new Error('too late'));
    await expect(first).rejects.toThrow('too late');
    // The answer in hand is the second one's: nothing is read again for it.
    const reads = reading.mock.calls.length;
    await loadSettings();
    expect(reading.mock.calls.length).toBe(reads);
  });
});
