import { familyOfLanguage } from '@slidr/model';
import { TEMPLATE_FONTS } from '@slidr/prompts';
import { describe, expect, it } from 'vitest';
import { builtinFamilies } from '../fonts/builtinFonts.generated';

/**
 * A slide is drawn without the network, so a template can name only fonts the app carries. The
 * agent learns which from its prompt (WG7-T11a); the prompt package cannot see the app's fonts,
 * so this holds the two lists together. A theme's pair is a Hebrew family and a Latin one: the
 * families made for other letters are not offered.
 */
describe('the fonts the agent may give a template', () => {
  const hebrew = builtinFamilies.filter((entry) => familyOfLanguage(entry, 'he'));
  const latinOnly = builtinFamilies.filter(
    (entry) => familyOfLanguage(entry, 'en') && !entry.scripts.includes('he'),
  );

  it('are the families the app carries for Hebrew and for Latin, each under the letters it has', () => {
    expect([...TEMPLATE_FONTS.hebrew].sort()).toEqual(hebrew.map(({ family }) => family).sort());
    expect([...TEMPLATE_FONTS.latin].sort()).toEqual(latinOnly.map(({ family }) => family).sort());
  });

  it('name every family once', () => {
    const all = [...TEMPLATE_FONTS.hebrew, ...TEMPLATE_FONTS.latin];
    expect(new Set(all).size).toBe(all.length);
    expect(all).toHaveLength(hebrew.length + latinOnly.length);
  });
});
