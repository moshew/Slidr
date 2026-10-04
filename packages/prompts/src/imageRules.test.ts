import { availableIn, deckTools, type ScopeKind } from '@slidr/agent-tools';
import { describe, expect, it } from 'vitest';
import { actionMessage } from './actions';
import { systemPrompt } from './systemPrompt';

/*
 * What the agent is told about images against what the image tools do. Both are expected
 * failures: the wording of this package is judged by the evaluation set, which only the owner's
 * machine runs, so these say what is wrong and leave it for that run.
 */

const prompt = (scope: ScopeKind) =>
  systemPrompt({
    scope,
    tools: deckTools.filter((t) => availableIn(t.scopes, scope)).map((t) => t.name),
  });

describe("the deck's image style and palette", () => {
  // Expected failure: ADR-069, ממצא 2. `image_generate` adds the deck's image style and its
  // palette to every prompt itself (ADR-051), and two action templates and the deck module still
  // ask the agent to write them in, so the style is said twice in every image prompt.
  it.fails('are not asked of the agent, since the tool adds them', () => {
    for (const action of ['slide.image', 'image.alternatives'] as const) {
      expect(actionMessage({ action, params: {}, replyIn: 'English' })).not.toMatch(
        /image style and its palette/,
      );
    }
    expect(prompt('deck')).not.toMatch(/you repeat it in every image prompt/);
  });
});

describe('an image call that timed out', () => {
  // Expected failure: ADR-069, ממצא 3. The rule against calling `image_generate` again after
  // it timed out is only in the action template of alternatives (ADR-045); an object session
  // asked for an image in its own words does not have it, and a second call makes every image
  // twice.
  it.fails('is not made again, in an object session too', () => {
    expect(prompt('object')).toMatch(
      /timed out[^.]*\. [^.]*do not call it again|do not call it (?:again|a second time)/,
    );
  });
});
