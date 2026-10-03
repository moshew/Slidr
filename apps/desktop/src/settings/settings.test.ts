import { beforeEach, describe, expect, it, vi } from 'vitest';
import contract from '../../src-tauri/src/stock/fixtures/contract.json';
import { memorySettings } from './memorySettings';
import { registerSettingsSection, settingsSections, SettingsOrder } from './sections';
import { SECRET_NAMES, SettingsError, type SecretStatus } from './settings';
import { tauriSettings } from './tauriSettings';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock('@tauri-apps/api/core', () => ({ invoke, isTauri: () => false }));

const KEY = 'sk-test-0123456789abcdef';

describe('the IPC contract of the keys', () => {
  it('names the keys the Rust core names, in its order', () => {
    const states: SecretStatus[] = contract.secrets as SecretStatus[];
    expect(states.map((state) => state.name)).toEqual([...SECRET_NAMES]);
    const fields: (keyof SecretStatus)[] = ['name', 'present'];
    for (const state of contract.secrets) expect(Object.keys(state).sort()).toEqual(fields.sort());
  });
});

describe('tauriSettings', () => {
  beforeEach(() => invoke.mockReset());

  it('reads and writes sections, and never asks for a key back', async () => {
    invoke.mockResolvedValueOnce({ images: { defaultProvider: 'x' } });
    expect(await tauriSettings.read()).toEqual({ images: { defaultProvider: 'x' } });
    expect(invoke).toHaveBeenLastCalledWith('settings_read', undefined);

    invoke.mockResolvedValue(undefined);
    await tauriSettings.write('stock', { source: 'y' });
    expect(invoke).toHaveBeenLastCalledWith('settings_write', {
      section: 'stock',
      value: { source: 'y' },
    });
    // `undefined` removes a section: the core takes null for that.
    await tauriSettings.write('stock', undefined);
    expect(invoke).toHaveBeenLastCalledWith('settings_write', { section: 'stock', value: null });

    await tauriSettings.setSecret('openai-api', KEY);
    expect(invoke).toHaveBeenLastCalledWith('secret_set', { name: 'openai-api', value: KEY });
    await tauriSettings.deleteSecret('pexels');
    expect(invoke).toHaveBeenLastCalledWith('secret_delete', { name: 'pexels' });

    invoke.mockResolvedValueOnce(contract.secrets);
    expect(await tauriSettings.secrets()).toEqual(contract.secrets);
    // The whole surface: there is no command that returns a key.
    const commands = new Set(invoke.mock.calls.map(([command]) => command as string));
    expect([...commands].sort()).toEqual([
      'secret_delete',
      'secret_set',
      'secret_status',
      'settings_read',
      'settings_write',
    ]);
  });

  it('turns what Rust rejects with into a SettingsError', async () => {
    invoke.mockRejectedValueOnce({ kind: 'invalid_input', message: 'the key is empty' });
    const rejected = tauriSettings.setSecret('unsplash', ' ');
    await expect(rejected).rejects.toBeInstanceOf(SettingsError);
    await expect(rejected).rejects.toMatchObject({ kind: 'invalid_input' });

    invoke.mockRejectedValueOnce('boom');
    await expect(tauriSettings.read()).rejects.toMatchObject({ kind: 'internal', message: 'boom' });
  });
});

describe('memorySettings', () => {
  it('keeps sections, and removes one that is set to nothing', async () => {
    const settings = memorySettings({ images: { quality: 'high' } });
    await settings.write('stock', { source: 'mock' });
    expect(await settings.read()).toEqual({
      images: { quality: 'high' },
      stock: { source: 'mock' },
    });
    await settings.write('images', null);
    expect(await settings.read()).toEqual({ stock: { source: 'mock' } });
    await expect(settings.write('Bad Name', {})).rejects.toMatchObject({ kind: 'invalid_input' });
  });

  it('stores a key and says only that it is there', async () => {
    const settings = memorySettings();
    expect((await settings.secrets()).every((state) => !state.present)).toBe(true);

    await settings.setSecret('openai-api', `  ${KEY}\n`);
    expect(await settings.secrets()).toEqual([
      { name: 'openai-api', present: true },
      { name: 'unsplash', present: false },
      { name: 'pexels', present: false },
    ]);
    expect(settings.hasSecret('openai-api')).toBe(true);
    // Nothing the client returns holds the key.
    expect(JSON.stringify([await settings.read(), await settings.secrets()])).not.toContain(KEY);

    await settings.deleteSecret('openai-api');
    expect(settings.hasSecret('openai-api')).toBe(false);
  });

  it('rejects what cannot be a key, and a section that holds a stored key', async () => {
    const settings = memorySettings();
    for (const bad of ['', '   ', 'two words', 'x'.repeat(513)]) {
      await expect(settings.setSecret('pexels', bad)).rejects.toMatchObject({
        kind: 'invalid_input',
      });
    }
    expect(settings.hasSecret('pexels')).toBe(false);

    await settings.setSecret('pexels', KEY);
    await expect(settings.write('stock', { apiKey: KEY })).rejects.toMatchObject({
      kind: 'invalid_input',
    });
    expect(await settings.read()).toEqual({});
  });
});

describe('the sections of the settings screen', () => {
  it('are kept in screen order, and one id is one section', () => {
    const Nothing = () => null;
    const remove = [
      registerSettingsSection({
        id: 'b',
        title: 'x:b',
        order: SettingsOrder.stock,
        render: Nothing,
      }),
      registerSettingsSection({
        id: 'a',
        title: 'x:a',
        order: SettingsOrder.agent,
        render: Nothing,
      }),
      registerSettingsSection({
        id: 'b',
        title: 'x:b2',
        order: SettingsOrder.images,
        render: Nothing,
      }),
    ];
    const items = [...settingsSections.getState().items].sort((x, y) => x.order - y.order);
    expect(items.map((item) => [item.id, item.title])).toEqual([
      ['a', 'x:a'],
      ['b', 'x:b2'],
    ]);
    // The agent's section has its place before the image providers'.
    expect(SettingsOrder.agent).toBeLessThan(SettingsOrder.images);
    remove.forEach((undo) => undo());
    expect(settingsSections.getState().items).toEqual([]);
  });
});
