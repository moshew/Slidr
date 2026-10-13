import { createDeckApi } from '@slidr/agent-tools';
import type { AgentClient, HarnessConnection } from '../src/agent/agent';
import { AgentService } from '../src/agent/agentService';
import { createScriptedAgent } from '../src/agent/scriptedAgent';
import { memoryTranscripts } from '../src/agent/transcript';
import type { AiRuntime } from '../src/ai/runtime';
import { createSessions } from '../src/ai/sessions';
import { agentSettings, setAgentSettings } from '../src/settings';

export type RequestOutcome = 'ready' | 'not_logged_in' | 'model_missing' | 'error' | 'list_error';

/** A real chat service over a delayed CLI stand-in, installed while the Settings panel is open. */
export async function installRequestHarness(runtime: AiRuntime, outcome: RequestOutcome) {
  const editor = window.slidr!;
  const connection = runtime.agent.setup.store.getState()['claude-code']!.connection!;
  const descriptors = await runtime.agent.harnesses();
  await runtime.agent.dispose();
  const scripted = createScriptedAgent(
    {
      'claude-code-reasoning': {
        description: 'A successful connection',
        turns: [
          [
            { type: 'text_delta', text: 'Connected on request.' },
            { type: 'turn_completed', outcome: 'completed' },
          ],
        ],
      },
    },
    { speed: 0 },
  );
  const pendingList = new Promise<typeof descriptors>((resolve, reject) => {
    document.addEventListener(
      'release-harnesses',
      () => {
        if (outcome === 'list_error') reject(new Error('offline'));
        else resolve(descriptors);
      },
      { once: true },
    );
  });
  const pendingConnection = new Promise<HarnessConnection>((resolve, reject) => {
    document.addEventListener(
      'release-connection',
      () => {
        if (outcome === 'error') reject(new Error('offline'));
        else
          resolve({
            ...connection,
            status: {
              ...connection.status,
              state: outcome === 'not_logged_in' ? outcome : 'ready',
            },
            harness:
              outcome === 'model_missing'
                ? {
                    ...connection.harness,
                    models: connection.harness.models.filter(
                      (model) => model.id !== 'claude-code-reasoning',
                    ),
                  }
                : connection.harness,
          });
      },
      { once: true },
    );
  });
  document.body.dataset.harnessReads = '0';
  document.body.dataset.connectionChecks = '0';
  const client: AgentClient = {
    ...scripted.client,
    harnesses: () => {
      document.body.dataset.harnessReads = String(Number(document.body.dataset.harnessReads) + 1);
      return pendingList;
    },
    connect: () => {
      document.body.dataset.connectionChecks = String(
        Number(document.body.dataset.connectionChecks) + 1,
      );
      return pendingConnection;
    },
    start: (_id, thread, config, onEvent) => scripted.client.start('mock', thread, config, onEvent),
  };
  const agent = new AgentService({
    client,
    connectBridge: scripted.connectBridge,
    bus: editor.bus,
    api: createDeckApi(editor.bus, {}),
    transcripts: memoryTranscripts(),
    settings: agentSettings,
    selection: () => {
      const { currentSlideId, selectedSlideIds, selectedElementIds, editingElementId } =
        editor.selection.getState();
      return { currentSlideId, selectedSlideIds, selectedElementIds, editingElementId };
    },
  });
  runtime.agent = agent;
  runtime.sessions = createSessions(agent, editor.bus);
  setAgentSettings({ model: 'claude-code-reasoning', effort: 'ultra', qualityGate: false });
}
