import { Archetype } from '@slidr/model';
import { describe, expect, it } from 'vitest';
import { Template } from '../template';
import { contractGaps } from './contract';
import { builtInSamples, builtInTemplates, builtInThemes } from './index';

const templates = builtInTemplates();
const DRAWN = Archetype.options.filter((archetype) => archetype !== 'blank');

describe.each(templates.map((template) => [template.theme.id, template] as const))(
  'the built-in template %s',
  (id, template) => {
    it('is a valid template, with its theme under its own id', () => {
      expect(Template.safeParse(template).error?.issues).toBeUndefined();
      expect(builtInThemes[id]).toEqual(template.theme);
    });

    it('draws one layout for each archetype, under ids of its own', () => {
      expect(template.layouts.map((layout) => layout.archetype)).toEqual(DRAWN);
      for (const layout of template.layouts) expect(layout.id).toMatch(new RegExp(`^l_${id}_`));
      const decorations = template.layouts.flatMap((layout) => layout.decorations.map((d) => d.id));
      expect(new Set(decorations).size).toBe(decorations.length);
    });

    it('seats the roles every built-in template seats, so a deck can move between them', () => {
      expect(template.layouts.flatMap(contractGaps)).toEqual([]);
    });

    it('draws the slide number and the mark wherever a layout seats a footer', () => {
      // The master components of SLD-04 live in the layouts: a layout with a foot has all three.
      for (const layout of [...template.layouts, ...(template.flipped ?? [])]) {
        if (!layout.placeholders.some((p) => p.role === 'footer')) continue;
        const drawn = layout.decorations.map((d) => d.role);
        expect(drawn, layout.id).toContain('slideNumber');
        expect(drawn, layout.id).toContain('logo');
      }
    });

    it('gives the hand-drawn mirror of a layout ids of its own decorations', () => {
      for (const layout of template.flipped ?? []) {
        const ids = layout.decorations.map((d) => d.id);
        expect(new Set(ids).size, layout.id).toBe(ids.length);
      }
    });

    it('shows every layout in its sample, in Hebrew and in English', () => {
      const samples = builtInSamples[id]!;
      for (const sample of [samples.he, samples.en]) {
        const shown = new Set(sample.map((slide) => slide.layout));
        expect(template.layouts.filter((layout) => !shown.has(layout.id))).toEqual([]);
      }
    });
  },
);

it('the templates have ids of their own', () => {
  const ids = templates.map((template) => template.theme.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(Object.keys(builtInThemes)).toEqual(ids);
  expect(Object.keys(builtInSamples)).toEqual(ids);
});
