import { describe, expect, it } from 'vitest';
import { builtInAvailable, tzukTemplate } from './builtin';
import { nightTemplate } from './fixtures';
import { Template } from './template';
import { withStandardLayouts } from './standardLayouts';

describe('the standard text layout', () => {
  it('adds them to an older template in the requested order without changing its drawing', () => {
    const old = nightTemplate();
    const complete = withStandardLayouts(old);
    const kinds = complete.layouts.map((layout) => layout.archetype);
    expect(kinds).not.toContain('title');
    expect(kinds.indexOf('text')).toBe(kinds.indexOf('textImage') - 1);
    expect(
      complete.layouts
        .find((layout) => layout.archetype === 'text')
        ?.placeholders.map((place) => place.role),
    ).toEqual(['title', 'body']);
    expect(old.layouts.some((layout) => layout.archetype === 'title')).toBe(false);
    expect(complete.layouts.filter((layout) => old.layouts.includes(layout))).toEqual(old.layouts);
    expect(withStandardLayouts(complete)).toEqual(complete);
  });

  it('sets the title on one line where the content slides set theirs, the body right under it', () => {
    const night = nightTemplate();
    const complete = withStandardLayouts(night);
    const style = night.theme.textStyles.title;
    const line = Math.ceil(style.size * style.lineHeight);
    const [textTitle, body] = complete.layouts.find(
      (layout) => layout.archetype === 'text',
    )!.placeholders;
    // The table of the template sets its title at the top margin, across the slide.
    expect(textTitle!.frame).toEqual({ x: 96, y: 96, w: 1728, h: line });
    expect(body!.frame.x).toBe(96);
    expect(body!.frame.w).toBe(1728);
    expect(body!.frame.y).toBeGreaterThan(96 + line);
    expect(body!.frame.y).toBeLessThan(96 + 2 * line);
  });

  it.skipIf(!builtInAvailable)(
    'draws them on the ground and in the frame of the content slides',
    () => {
      // A built-in template as it was before it drew a title and a text layout of its own.
      const tzuk = tzukTemplate();
      const older = {
        ...tzuk,
        layouts: tzuk.layouts.filter((l) => l.archetype !== 'title' && l.archetype !== 'text'),
      };
      const complete = withStandardLayouts(older);
      const table = tzuk.layouts.find((layout) => layout.archetype === 'table')!;
      for (const archetype of ['text'] as const) {
        const layout = complete.layouts.find((l) => l.archetype === archetype)!;
        expect(layout.placeholders[0]!.frame.y).toBe(
          table.placeholders.find((place) => place.role === 'title')!.frame.y,
        );
        // The brass rule over the title, and the rule, the mark and the number of the foot, under
        // ids of their own; nothing of the table itself, and no footer: the layouts seat only what
        // they are asked for.
        expect(layout.decorations.map((d) => d.id)).toEqual([
          `d_tzuk_table_tick_${archetype}`,
          `d_tzuk_table_rule_${archetype}`,
          `d_tzuk_table_mark_${archetype}`,
          `d_tzuk_table_number_${archetype}`,
        ]);
        expect(layout.decorations.map((d) => d.role)).toContain('slideNumber');
        expect(layout.decorations.map((d) => d.role)).toContain('logo');
        const body = layout.placeholders.find((place) => place.role === 'body');
        if (body) expect(body.frame.y + body.frame.h).toBeLessThanOrEqual(940);
      }
    },
  );

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

it('removes saved title-only layouts, their flipped versions and previews', () => {
  const original = nightTemplate();
  const title = { ...original.layouts[0]!, id: 'retired_title', archetype: 'title' as const };
  const template = {
    ...original,
    layouts: [...original.layouts, title],
    flipped: [title],
    sample: [{ id: 's_retired', layoutId: title.id, elements: [], timeline: [] }],
  };
  const result = withStandardLayouts(template);
  expect(result.layouts.some((layout) => layout.archetype === 'title')).toBe(false);
  expect(result.flipped).toEqual([]);
  expect(result.sample).toEqual([]);
  expect(Template.safeParse(result).success).toBe(true);
  expect(template.layouts).toContain(title);
});
