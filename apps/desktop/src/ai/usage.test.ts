import { describe, expect, it } from 'vitest';
import type { ChatEntry } from '../agent/transcript';
import { conversationUsage, formatCost, formatTokens, tokensOf } from './usage';

const usage = (input: number, output: number, read = 0, written = 0) => ({
  inputTokens: input,
  outputTokens: output,
  cacheReadTokens: read,
  cacheWriteTokens: written,
});

const turn = (id: string, rest: Partial<Extract<ChatEntry, { type: 'assistant' }>>): ChatEntry => ({
  type: 'assistant',
  id,
  at: '2026-10-04T00:00:00.000Z',
  parts: [],
  ...rest,
});

describe('what a conversation used', () => {
  it('is the sum of what the transcript holds for its turns', () => {
    const entries: ChatEntry[] = [
      { type: 'user', id: 'u1', at: '', text: 'build' },
      turn('a1', { outcome: 'completed', usage: usage(9, 240, 6120, 280), costUsd: 0.0041 }),
      { type: 'user', id: 'u2', at: '', text: 'more' },
      turn('a2', { outcome: 'failed', usage: usage(3, 10), costUsd: 0.0033 }),
      // A turn the harness gave no cost for, and one that is still running.
      turn('a3', { outcome: 'completed', usage: usage(1, 1), costUsd: null }),
      turn('a4', {}),
    ];
    const total = conversationUsage(entries);
    expect(total.turns).toBe(3);
    expect(total.usage).toEqual(usage(13, 251, 6120, 280));
    expect(total.costUsd).toBeCloseTo(0.0074, 10);
    expect(total.uncosted).toBe(1);
    expect(tokensOf(total.usage)).toBe(6664);
  });

  it('is nothing for a conversation with no finished turn', () => {
    expect(conversationUsage([])).toEqual({
      turns: 0,
      usage: usage(0, 0),
      costUsd: 0,
      uncosted: 0,
    });
  });
});

describe('formatting', () => {
  it('writes a cost with three places under a dollar and two above', () => {
    expect(formatCost(0.0074)).toBe('$0.007');
    expect(formatCost(0.084)).toBe('$0.084');
    expect(formatCost(1.2649)).toBe('$1.26');
    expect(formatCost(0)).toBe('$0.000');
  });

  it('writes tokens in thousands and millions', () => {
    expect(formatTokens(940)).toBe('940');
    expect(formatTokens(6664)).toBe('6.7k');
    expect(formatTokens(62_061)).toBe('62k');
    expect(formatTokens(1_340_000)).toBe('1.3M');
  });
});
