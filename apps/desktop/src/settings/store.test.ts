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
