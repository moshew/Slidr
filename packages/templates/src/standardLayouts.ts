import type { Placeholder } from '@slidr/model';
import type { Template } from './template';

/** The two simple layouts every template offers, including older personal templates. */
export function withStandardLayouts(template: Template): Template {
  const layouts = [...template.layouts];
  const source = layouts.find((layout) => layout.archetype === 'textImage');
  const titleStyle =
    source?.placeholders.find((place) => place.role === 'title')?.styleRef ?? 'title';
  const bodyStyle = source?.placeholders.find((place) => place.role === 'body')?.styleRef ?? 'body';
  const taken = new Set(layouts.map((layout) => layout.id));
  const id = (archetype: 'title' | 'text'): string => {
    const base = `l_${template.theme.id}_${archetype}`;
    let candidate = base;
    let index = 2;
    while (taken.has(candidate)) candidate = `${base}_${index++}`;
    taken.add(candidate);
    return candidate;
  };
  const title = (): Placeholder => ({
    id: 'p_title',
    role: 'title',
    frame: { x: 96, y: 110, w: 1728, h: 220 },
    styleRef: titleStyle,
    align: 'start',
    vAlign: 'top',
  });
  if (!layouts.some((layout) => layout.archetype === 'title')) {
    const afterSection = layouts.findIndex((layout) => layout.archetype === 'section');
    const afterHero = layouts.findIndex((layout) => layout.archetype === 'hero');
    layouts.splice(afterSection >= 0 ? afterSection + 1 : afterHero >= 0 ? afterHero + 1 : 0, 0, {
      id: id('title'),
      name: 'Title',
      archetype: 'title',
      placeholders: [title()],
      decorations: [],
    });
  }
  if (!layouts.some((layout) => layout.archetype === 'text')) {
    const beforeImage = layouts.findIndex((layout) => layout.archetype === 'textImage');
    layouts.splice(beforeImage < 0 ? layouts.length : beforeImage, 0, {
      id: id('text'),
      name: 'Text',
      archetype: 'text',
      placeholders: [
        title(),
        {
          id: 'p_body',
          role: 'body',
          frame: { x: 96, y: 390, w: 1728, h: 490 },
          styleRef: bodyStyle,
          align: 'start',
          vAlign: 'top',
        },
      ],
      decorations: [],
    });
  }
  const textIndex = layouts.findIndex((layout) => layout.archetype === 'text');
  const imageIndex = layouts.findIndex((layout) => layout.archetype === 'textImage');
  if (textIndex >= 0 && imageIndex >= 0 && textIndex !== imageIndex - 1) {
    const [textLayout] = layouts.splice(textIndex, 1);
    layouts.splice(
      layouts.findIndex((layout) => layout.archetype === 'textImage'),
      0,
      textLayout!,
    );
  }
  return { ...template, layouts };
}
