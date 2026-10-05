import { availableIn, deckTools, type ScopeKind } from '@slidr/agent-tools';
import { describe, expect, it } from 'vitest';
import { actionMessage } from './actions';
import { systemPrompt } from './systemPrompt';

/*
 * What the agent is told about images against what the image tools do (ADR-069, findings 2 and
 * 3). Both were recorded there as expected failures; the wording they asked for is in now. It
 * has not been run against the evaluation set, nor against a real image provider.
 */

const prompt = (scope: ScopeKind) =>
  systemPrompt({
    scope,
    tools: deckTools.filter((t) => availableIn(t.scopes, scope)).map((t) => t.name),
  });

describe("the deck's image style and palette", () => {
  // `image_generate` adds the deck's image style and its palette to every prompt itself
  // (ADR-051). An agent that is asked to write them in says the style twice in every prompt.
  it('are not asked of the agent, since the tool adds them', () => {
    for (const action of ['slide.image', 'image.alternatives'] as const) {
      const message = actionMessage({ action, params: {}, replyIn: 'English' });
      expect(message).not.toMatch(/image style and its palette/);
      // The agent is told why its prompt stops at what the picture shows.
      expect(message).toMatch(/the app adds the deck's style and palette to every prompt itself/);
    }
    expect(prompt('deck')).not.toMatch(/you repeat it in every image prompt/);
    expect(prompt('deck')).toMatch(/the app adds it to every image prompt/);
  });
});

describe('an image call that timed out', () => {
  // The rule against calling `image_generate` again after it timed out was only in the action
  // template of alternatives (ADR-045): an object session asked for an image in the user's own
  // words did not have it, and a second call makes every image twice.
  it('is not made again, in an object session too', () => {
    expect(prompt('object')).toMatch(
      /timed out[^.]*\. [^.]*do not call it again|do not call it (?:again|a second time)/,
    );
    // A build without an image provider has no such call to be told about.
    const without = deckTools
      .filter((t) => availableIn(t.scopes, 'object') && t.name !== 'image_generate')
      .map((t) => t.name);
    expect(systemPrompt({ scope: 'object', tools: without })).not.toMatch(/timed out/);
  });
});
