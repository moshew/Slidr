import { describe, expect, it, vi } from 'vitest';
import { createScriptedAgent } from './scriptedAgent';
import { HarnessSetup, modelEfforts, selectionIssue } from './harnessSetup';
import type { HarnessConnection, HarnessDescriptor, HarnessStatus } from './agent';

const harness: HarnessDescriptor = {
  id: 'codex-cli',
  name: 'Codex CLI',
  defaultModel: null,
  effortLevels: ['wrong'],
  capabilities: {
    streaming: true,
    resume: true,
    interrupt: true,
    imageInput: true,
    toolEndpoint: true,
    thinking: true,
  },
  models: [
    { id: 'a', label: 'A', effortLevels: ['low', 'ultra'] },
    { id: 'b', label: 'B', effortLevels: [] },
  ],
};
const ready: HarnessStatus = { state: 'ready', version: '1', account: null, detail: null };

describe('harness setup', () => {
  it('keeps delayed connections for different harnesses separate and shares an in-flight request', async () => {
    const { client } = createScriptedAgent({});
    let finish!: (connection: HarnessConnection) => void;
    const connect = (client.connect = vi.fn((id: string) =>
      id === 'codex-cli'
        ? new Promise<HarnessConnection>((resolve) => {
            finish = resolve;
          })
        : Promise.resolve({ harness: { ...harness, id }, status: ready }),
    ));
    const setup = new HarnessSetup(client, () => Promise.resolve(harness));
    const first = setup.connect('codex-cli');
    const same = setup.connect('codex-cli');
    await setup.connect('copilot-cli');
    finish({ harness, status: ready });
    await Promise.all([first, same]);
    expect(connect).toHaveBeenCalledTimes(2);
    expect(setup.store.getState()['copilot-cli']?.connection?.harness.id).toBe('copilot-cli');
    expect(setup.store.getState()['codex-cli']?.connection?.harness.id).toBe('codex-cli');
  });

  it('does not install on a failed check, and reconnects after explicit install and sign-in', async () => {
    const { client } = createScriptedAgent({});
    let state: HarnessStatus['state'] = 'not_installed';
    const connect = (client.connect = vi.fn(() =>
      Promise.resolve({ harness, status: { ...ready, state } }),
    ));
    const install = (client.install = vi.fn(() => {
      state = 'not_logged_in';
      return Promise.resolve();
    }));
    client.login = vi.fn(() => {
      state = 'ready';
      return Promise.resolve();
    });
    const setup = new HarnessSetup(client, () => Promise.resolve(harness));
    await setup.connect(harness.id);
    expect(install).not.toHaveBeenCalled();
    await setup.run(harness.id, 'install');
    expect(setup.store.getState()[harness.id]?.connection?.status.state).toBe('not_logged_in');
    await setup.run(harness.id, 'login');
    expect(setup.store.getState()[harness.id]?.connection?.status.state).toBe('ready');
    expect(connect).toHaveBeenCalledTimes(3);
  });

  it('surfaces errors and permits retry without installing anything', async () => {
    const { client } = createScriptedAgent({});
    client.connect = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ harness, status: ready });
    const setup = new HarnessSetup(client, () => Promise.resolve(harness));
    await expect(setup.connect(harness.id)).rejects.toThrow('offline');
    expect(setup.store.getState()[harness.id]?.error).toBe('offline');
    await setup.connect(harness.id, true);
    expect(setup.store.getState()[harness.id]?.error).toBeUndefined();
  });

  it('a remounted settings panel waits for an active installation before checking again', async () => {
    const { client } = createScriptedAgent({});
    const connect = (client.connect = vi.fn(() => Promise.resolve({ harness, status: ready })));
    let finish!: () => void;
    const install = (client.install = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    ));
    const setup = new HarnessSetup(client, () => Promise.resolve(harness));
    const installing = setup.run(harness.id, 'install');
    const reconnecting = setup.connect(harness.id, true);
    await setup.run(harness.id, 'install');
    expect(install).toHaveBeenCalledTimes(1);
    expect(connect).not.toHaveBeenCalled();
    expect(setup.store.getState()[harness.id]?.busy).toBe('installing');
    finish();
    await Promise.all([installing, reconnecting]);
    expect(setup.store.getState()[harness.id]?.connection?.status.state).toBe('ready');
  });

  it('requires explicit available models and efforts, including models with no effort setting', () => {
    expect(selectionIssue(harness)).toBeTruthy();
    expect(selectionIssue(harness, 'a')).toBeTruthy();
    expect(selectionIssue(harness, 'a', 'max')).toBeTruthy();
    expect(selectionIssue(harness, 'a', 'ultra')).toBeUndefined();
    expect(selectionIssue(harness, 'b')).toBeUndefined();
    expect(selectionIssue(harness, 'b', 'low')).toBeTruthy();
    expect(modelEfforts(harness, 'b')).toEqual([]);
  });
});
