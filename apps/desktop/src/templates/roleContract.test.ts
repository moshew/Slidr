import { availableIn, deckTools } from '@slidr/agent-tools';
import { systemPrompt, TEMPLATE_OPTIONAL_ROLES, TEMPLATE_ROLES } from '@slidr/prompts';
import { OPTIONAL, ROLE_CONTRACT } from '@slidr/templates/builtin';
import { describe, expect, it } from 'vitest';

/**
 * A template the agent makes is moved to and from the built-in ones, and a deck keeps its content
 * only where both draw the same roles (ADR-039, ADR-063). The agent learns the roles from its
 * template guide; the prompt package cannot see the templates' contract, so this holds the two
 * together, as the guide says them.
 */
describe("the roles in the agent's template guide", () => {
  const tools = deckTools.filter((t) => availableIn(t.scopes, 'deck')).map((t) => t.name);
  const prompt = systemPrompt({ scope: 'deck', tools });

  /** One archetype's roles as the guide writes them: `caption ×2, title`. */
  const listed = (seats: Record<string, number | undefined>) =>
    Object.entries(seats)
      .map(([role, count]) => (count === 1 ? role : `${role} ×${count}`))
      .join(', ');

  it('are the roles of the built-in templates, with their counts', () => {
    expect(TEMPLATE_ROLES).toEqual(ROLE_CONTRACT);
  });

  it('name what a template may seat beyond them', () => {
    const optional = Object.fromEntries(
      Object.entries(TEMPLATE_OPTIONAL_ROLES).map(([archetype, extra]) => [archetype, extra.seats]),
    );
    expect(optional).toEqual(OPTIONAL);
  });

  it('are what a deck session reads', () => {
    expect(prompt).toContain('## Making a template');
    const missing = Object.entries(ROLE_CONTRACT).filter(
      ([archetype, seats]) => !prompt.includes(`${archetype}: ${listed(seats)}`),
    );
    expect(missing.map(([archetype]) => archetype)).toEqual([]);
  });
});
