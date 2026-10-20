import { transitionTypes } from '@slidr/runtime';
import { describe, expect, it } from 'vitest';
import { transitionGlyph } from './transitionGlyphs';

describe('the small pictures of the transitions', () => {
  const kinds = transitionTypes.filter((type) => type !== 'none');

  it('every kind the runtime plays has a picture of its own', () => {
    const general = transitionGlyph('a kind of tomorrow').icon;
    const icons = kinds.map((type) => transitionGlyph(type).icon);
    expect(kinds.filter((_, i) => icons[i] === general)).toEqual([]);
    expect(new Set(icons).size).toBe(kinds.length);
  });

  it('a kind without one, and a name that is no kind, get the picture of transitions as such', () => {
    const general = transitionGlyph('a kind of tomorrow');
    expect(general.icon).toBeDefined();
    expect(transitionGlyph('constructor')).toBe(general);
    expect(transitionGlyph('none')).toBe(general);
  });
});
