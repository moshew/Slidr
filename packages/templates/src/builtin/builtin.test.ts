import { Archetype, CommandBus, type Color, type Fill, type Theme } from '@slidr/model';
import { describe, expect, it } from 'vitest';
import { applyTemplate } from '../deck';
import { equalJson } from '../json';
import { Template } from '../template';
import { contractGaps } from './contract';
import { builtInSamples, builtInTemplates, builtInThemes, sampleDeck } from './index';

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

    it('offers no background that one of its text styles cannot be read on', () => {
      // The text of a placeholder has the colour of its text style and none of its own, so a
      // ground the theme offers (its own, and the variants the Background tool shows) has to
      // carry all five styles: WCAG AA, as the lint judges it (4.5:1, and 3:1 above 48px).
      const { theme } = template;
      const faint: string[] = [];
      for (const [index, background] of [theme.background, ...theme.backgroundVariants].entries()) {
        const name = index === 0 ? 'the background' : `variant ${index}`;
        expect(background.overlay, name).toBeUndefined();
        for (const ground of groundsOf(theme, background.fill, name)) {
          for (const [ref, style] of Object.entries(theme.textStyles)) {
            const drawn = rgbOf(theme, style.color, ground);
            const got = contrast(drawn, ground);
            const need = style.size > 48 ? 3 : 4.5;
            if (got < need) faint.push(`${name}: ${ref} at ${got.toFixed(2)}:1, needs ${need}:1`);
          }
        }
      }
      expect([...new Set(faint)]).toEqual([]);
    });
  },
);

// The contrast of a text style on a ground, from the values of the theme alone.
type Rgb = [number, number, number];

function hexRgb(css: string): Rgb {
  const digits = /^#([0-9a-f]{6})$/i.exec(css.trim())?.[1];
  if (!digits) throw new Error(`"${css}" is not a colour this test can read`);
  return [0, 2, 4].map((at) => parseInt(digits.slice(at, at + 2), 16)) as Rgb;
}

const mix = (a: Rgb, b: Rgb, share: number): Rgb =>
  a.map((channel, i) => Math.round(channel * (1 - share) + b[i]! * share)) as Rgb;

/** A colour of the theme as it is drawn over a ground. */
function rgbOf(theme: Theme, color: Color, over: Rgb): Rgb {
  const base = hexRgb('token' in color ? theme.colors[color.token] : color.value);
  return color.alpha === undefined ? base : mix(over, base, color.alpha);
}

function contrast(a: Rgb, b: Rgb): number {
  const luminance = (rgb: Rgb) => {
    const [r, g, b] = rgb.map((channel) => {
      const v = channel / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    }) as Rgb;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

/** The colours a fill puts under text: its colour, or its stops and what lies between them. */
function groundsOf(theme: Theme, fill: Fill, name: string): Rgb[] {
  const opaque = (color: Color): Rgb => {
    // A ground that lets something through is not one colour: nothing here can judge it.
    expect(color.alpha, name).toBeUndefined();
    return rgbOf(theme, color, [0, 0, 0]);
  };
  if (fill.kind === 'solid') return [opaque(fill.color)];
  if (fill.kind === 'linear' || fill.kind === 'radial' || fill.kind === 'conic') {
    const stops = fill.stops.map((stop) => opaque(stop.color));
    return stops.flatMap((stop, i) => {
      const next = stops[i + 1];
      return next ? [0, 0.25, 0.5, 0.75].map((share) => mix(stop, next, share)) : [stop];
    });
  }
  throw new Error(`${name} is a ${fill.kind} fill, which this test cannot read`);
}

it(
  'a deck that goes to another template and back is the deck it was: every pair, in both languages',
  { timeout: 120_000 },
  () => {
    // The promise of ADR-023, over the whole library: 90 ordered pairs, Hebrew and English.
    const broken: string[] = [];
    for (const from of templates) {
      for (const language of [
        { lang: 'he', dir: 'rtl' },
        { lang: 'en', dir: 'ltr' },
      ] as const) {
        const start = sampleDeck(from, builtInSamples[from.theme.id]![language.lang], language);
        for (const to of templates) {
          if (to === from) continue;
          const bus = new CommandBus(start);
          bus.batch(applyTemplate(bus.deck, to));
          bus.batch(applyTemplate(bus.deck, from));
          if (!equalJson(bus.deck, start)) {
            broken.push(`${from.theme.id} -> ${to.theme.id} -> ${from.theme.id}, ${language.lang}`);
          }
        }
      }
    }
    expect(broken).toEqual([]);
  },
);

it('the templates have ids of their own', () => {
  const ids = templates.map((template) => template.theme.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(Object.keys(builtInThemes)).toEqual(ids);
  expect(Object.keys(builtInSamples)).toEqual(ids);
});
