/**
 * What a conversation used (CHT-U06): the tokens and the cost the harness reported for each
 * turn, as the transcript keeps them, and their sum. Nothing here estimates: a turn the harness
 * gave no cost for adds none, and the sum says so.
 */
import type { Usage } from '../agent/agent';
import type { ChatEntry } from '../agent/transcript';

export interface ConversationUsage {
  /** Turns that ended, whatever they cost. */
  turns: number;
  usage: Usage;
  /** The sum of the costs the harness reported. */
  costUsd: number;
  /** Turns the harness gave no cost for: with any, `costUsd` is less than the whole. */
  uncosted: number;
}

/** Every token of a turn: what went in, what came out, and what was read from and written to the cache. */
export function tokensOf(usage: Usage): number {
  return usage.inputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
}

export function conversationUsage(entries: readonly ChatEntry[]): ConversationUsage {
  const total: ConversationUsage = {
    turns: 0,
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    costUsd: 0,
    uncosted: 0,
  };
  for (const entry of entries) {
    if (entry.type !== 'assistant' || !entry.outcome) continue;
    total.turns++;
    if (entry.usage) {
      for (const key of Object.keys(total.usage) as (keyof Usage)[]) {
        total.usage[key] += entry.usage[key];
      }
    }
    if (typeof entry.costUsd === 'number') total.costUsd += entry.costUsd;
    else total.uncosted++;
  }
  return total;
}

/** `$0.084`, `$1.26`: three places under a dollar, where a turn's cost lives, two above. */
export function formatCost(usd: number): string {
  return `$${usd.toFixed(usd < 1 ? 3 : 2)}`;
}

/** `940`, `12.4k`, `1.3M`. */
export function formatTokens(count: number): string {
  if (count < 1000) return String(count);
  if (count < 1_000_000) return `${(count / 1000).toFixed(count < 10_000 ? 1 : 0)}k`;
  return `${(count / 1_000_000).toFixed(1)}M`;
}
