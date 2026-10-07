import { describe, expect, it } from 'vitest';
import { nightTemplate } from './fixtures';
import { withStandardLayouts } from './standardLayouts';

describe('the standard title and text layouts', () => {
  it('adds them to an older template in the requested order without changing its drawing', () => {
    const old = nightTemplate();
    const complete = withStandardLayouts(old);
    const kinds = complete.layouts.map((layout) => layout.archetype);
    expect(kinds.indexOf('title')).toBe(kinds.indexOf('section') + 1);
    expect(kinds.indexOf('text')).toBe(kinds.indexOf('textImage') - 1);
    const title = complete.layouts.find((layout) => layout.archetype === 'title')!;
    expect(title.placeholders.map((place) => place.role)).toEqual(['title']);
    expect(title.placeholders[0]!.frame.y).toBe(110);
    expect(
      complete.layouts
        .find((layout) => layout.archetype === 'text')
        ?.placeholders.map((place) => place.role),
    ).toEqual(['title', 'body']);
    expect(old.layouts.some((layout) => layout.archetype === 'title')).toBe(false);
    expect(withStandardLayouts(complete)).toEqual(complete);
  });

  it('places a previously saved text layout before a newly added text and image layout', () => {
    const complete = withStandardLayouts(nightTemplate());
    const text = complete.layouts.find((layout) => layout.archetype === 'text')!;
    const outOfOrder = {
      ...complete,
      layouts: [...complete.layouts.filter((layout) => layout !== text), text],
    };
    expect(withStandardLayouts(outOfOrder).layouts).toEqual(complete.layouts);
  });
});
