/**
 * For the end-to-end tests of the app (e2e/runtime-acceptance.spec.ts): one call of the Deck API
 * on a command bus, with no agent, no harness and no bridge behind it. It is the path an agent's
 * tool call takes once it has arrived in the webview (SPEC 11.4).
 */
import { createDeckApi, startTurn, type SessionScope, type ToolResult } from '@slidr/agent-tools';
import type { CommandBus } from '@slidr/model';

export function callTool(
  bus: CommandBus,
  name: string,
  input: unknown,
  scope: SessionScope = { kind: 'deck' },
): Promise<ToolResult> {
  return createDeckApi(bus).call(startTurn('e2e', scope), name, input);
}
