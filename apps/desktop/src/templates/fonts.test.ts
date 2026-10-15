import { TEMPLATE_FONTS } from '@slidr/prompts';
import { describe, expect, it } from 'vitest';
import { builtinFamilies } from '../fonts/builtinFonts.generated';

/**
 * A slide is drawn without the network, so a template can name only fonts the app carries. The
 * agent learns which from its prompt (WG7-T11a); the prompt package cannot see the app's fonts,
 * so this holds the two lists together.
 */
describe('the fonts the agent may give a template', () => {
  const carried = (script: string) =>
    builtinFamilies.filter(({ scripts }) => scripts.includes(script)).map(({ family }) => family);

  it('are the families the app carries, each under the letters it has', () => {
    expect([...TEMPLATE_FONTS.hebrew].sort()).toEqual(carried('he').sort());
    const latinOnly = builtinFamilies.filter(({ scripts }) => !scripts.includes('he'));
    expect([...TEMPLATE_FONTS.latin].sort()).toEqual(latinOnly.map(({ family }) => family).sort());
  });

  it('name every family once', () => {
    const all = [...TEMPLATE_FONTS.hebrew, ...TEMPLATE_FONTS.latin];
    expect(new Set(all).size).toBe(all.length);
    expect(all).toHaveLength(builtinFamilies.length);
  });
});
