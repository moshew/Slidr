import { blend, contrastRatio, hex, luminance } from '../color';
import type { Rgb, TextSpanMeasure } from '../measure';
import type { Rule } from '../rule';

/** WCAG AA (SPEC 9.1): 4.5:1, and 3:1 for large text, which on a slide is text above 48px. */
const AA = 4.5;
const AA_LARGE = 3;
const LARGE_ABOVE = 48;

/**
 * Share of the area under a text that may fall short. Over a solid colour every sample is the
 * same; over a photo or a gradient this keeps a few stray pixels from deciding, while a tenth
 * of the text being hard to read is already a problem.
 */
const TOLERATED_SHARE = 0.1;

/** Glyphs this faint are not what draws the text (outlined or clipped text): nothing to judge. */
const INVISIBLE = 0.05;

export function requiredContrast(fontSize: number): number {
  return fontSize > LARGE_ABOVE ? AA_LARGE : AA;
}

/**
 * The contrast a span keeps over all but the worst tenth of what is under it, and the colour
 * there. Undefined when the backdrop is unknown or the glyphs are not drawn.
 */
export function spanContrast(span: TextSpanMeasure): { ratio: number; under: Rgb } | undefined {
  if (span.backdrop.length === 0 || span.alpha < INVISIBLE) return undefined;
  const ratios = span.backdrop
    .map((under) => ({ ratio: contrastRatio(blend(span.color, span.alpha, under), under), under }))
    .sort((a, b) => a.ratio - b.ratio);
  return ratios[Math.floor((ratios.length - 1) * TOLERATED_SHARE)];
}

/** L05: text whose contrast against what is really under it is below WCAG AA. */
export const L05: Rule = {
  id: 'L05',
  severity: 'error',
  agent: true,
  check({ items }) {
    return items.flatMap(({ element, measure }) => {
      // One finding per element: its worst span, relative to what that span needs.
      let worst: { span: TextSpanMeasure; ratio: number; under: Rgb; required: number } | undefined;
      for (const span of measure.text?.spans ?? []) {
        const contrast = spanContrast(span);
        if (!contrast) continue;
        const required = requiredContrast(span.fontSize);
        if (contrast.ratio >= required) continue;
        if (!worst || contrast.ratio / required < worst.ratio / worst.required) {
          worst = { span, ...contrast, required };
        }
      }
      if (!worst) return [];
      const { span, ratio, under, required } = worst;
      const faint = span.alpha < 1 ? ` at ${Math.round(span.alpha * 100)}% opacity` : '';
      const shade = luminance(span.color) > luminance(under) ? 'darker' : 'lighter';
      return [
        {
          elementIds: [element.id],
          // Rounded down, so a ratio just short of the bar never reads as meeting it.
          message: `Text in ${hex(span.color)}${faint} has a contrast of ${Math.floor(ratio * 100) / 100}:1 against what is under it (${hex(under)}); ${Math.round(span.fontSize)}px text needs ${required}:1 (WCAG AA; 3:1 only above ${LARGE_ABOVE}px). Change the text colour, or put a ${shade} shape or overlay under the text.`,
        },
      ];
    });
  },
};
