// Helpers for this package's tests (not exported from the package).
import { CommandBus, type Deck } from '@slidr/model';
import { createDeckApi } from './registry';
import type { SessionScope } from './scope';
import type { Services } from './services';
import { startTurn, type ToolError, type ToolResult, type Turn } from './tool';

export function setup(deck: Deck, services: Services = {}, scope: SessionScope = { kind: 'deck' }) {
  const bus = new CommandBus(deck, { validate: true });
  const api = createDeckApi(bus, services);
  let turn: Turn = startTurn('sess', scope);
  return {
    bus,
    api,
    get turn() {
      return turn;
    },
    /** Starts a new turn of the same session. */
    nextTurn(newScope: SessionScope = scope) {
      turn = startTurn('sess', newScope);
      return turn;
    },
    call: (name: string, input: unknown = {}) => api.call(turn, name, input),
  };
}

/** The data of a successful result; throws with the error message otherwise. */
export async function ok(pending: Promise<ToolResult>): Promise<Record<string, unknown>> {
  const result = await pending;
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.data;
}

/** The error of a failed result; throws if the call succeeded. */
export async function failed(pending: Promise<ToolResult>): Promise<ToolError> {
  const result = await pending;
  if (result.ok) throw new Error(`Expected a failure, got ${JSON.stringify(result.data)}`);
  return result.error;
}

/** A 1x1 transparent PNG. */
export const PIXEL =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
