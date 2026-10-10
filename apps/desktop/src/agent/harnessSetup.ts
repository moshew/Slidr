import { createStore } from 'zustand/vanilla';
import type { AgentClient, HarnessConnection, HarnessDescriptor } from './agent';

export interface ConnectionState {
  busy?: 'connecting' | 'installing' | 'signingIn';
  connection?: HarnessConnection;
  error?: string;
}

/** Shared by Settings, the chat picker and session startup. One connection per CLI at a time. */
export class HarnessSetup {
  readonly store = createStore<Record<string, ConnectionState>>(() => ({}));
  #pending = new Map<string, Promise<HarnessConnection>>();
  #actions = new Map<string, Promise<void>>();

  constructor(
    private client: AgentClient,
    private descriptor: (id: string) => Promise<HarnessDescriptor>,
  ) {}

  async connect(id: string, refresh = false): Promise<HarnessConnection> {
    const action = this.#actions.get(id);
    if (action) await action;
    return this.#connect(id, refresh);
  }

  async #connect(id: string, refresh = false): Promise<HarnessConnection> {
    const pending = this.#pending.get(id);
    if (pending) return pending;
    const cached = this.store.getState()[id]?.connection;
    if (cached && !refresh) return cached;
    this.#set(id, { busy: 'connecting' });
    const task = (async () => {
      try {
        const connection = this.client.connect
          ? await this.client.connect(id)
          : { harness: await this.descriptor(id), status: await this.client.probe(id) };
        this.#set(id, { connection });
        return connection;
      } catch (error) {
        this.#set(id, { error: error instanceof Error ? error.message : String(error) });
        throw error;
      } finally {
        this.#pending.delete(id);
      }
    })();
    this.#pending.set(id, task);
    return task;
  }

  /** The caller must obtain installation approval before invoking this action. */
  async run(id: string, action: 'install' | 'login'): Promise<void> {
    if (this.store.getState()[id]?.busy) return;
    const task = this.#run(id, action);
    this.#actions.set(id, task);
    try {
      await task;
    } finally {
      this.#actions.delete(id);
    }
  }

  async #run(id: string, action: 'install' | 'login'): Promise<void> {
    const before = this.store.getState()[id];
    this.#set(id, {
      ...before,
      error: undefined,
      busy: action === 'install' ? 'installing' : 'signingIn',
    });
    try {
      const operation = this.client[action]?.bind(this.client);
      if (!operation) throw new Error('CLI setup is available in the desktop app.');
      await operation(id);
      await this.#connect(id, true);
    } catch (error) {
      this.#set(id, { ...before, error: error instanceof Error ? error.message : String(error) });
    }
  }

  #set(id: string, state: ConnectionState): void {
    this.store.setState({ [id]: state });
  }
}

export function modelEfforts(harness: HarnessDescriptor, modelId?: string): string[] {
  const model = harness.models.find((model) => model.id === modelId);
  return model ? (model.effortLevels ?? harness.effortLevels) : [];
}

export function selectionIssue(
  harness: HarnessDescriptor,
  model?: string,
  effort?: string,
): string | undefined {
  if (harness.id === 'mock') return;
  if (!model || !harness.models.some((option) => option.id === model))
    return 'Choose an available model in Settings.';
  const efforts = modelEfforts(harness, model);
  if (efforts.length && (!effort || !efforts.includes(effort)))
    return 'Choose a supported effort for this model in Settings.';
  if (!efforts.length && effort)
    return 'This model has no effort setting. Choose the model again in Settings.';
}
