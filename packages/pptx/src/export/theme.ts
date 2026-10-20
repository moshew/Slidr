import type { Theme } from '@slidr/model';
import { readCss, rgbHex } from '../color';
import { NS } from '../opc';
import { el } from '../xml';

/*
 * The theme part: the deck's colours in the slots PowerPoint names them by, its two font pairs
 * as the major (headings) and minor (body) fonts, and the format scheme PowerPoint's own
 * shapes take their look from.
 */

const hex = (css: string, fallback: string): string => {
  const value = readCss(css);
  return value && !('token' in value) ? rgbHex(value) : fallback;
};

/** The six accents: the three colours of the theme, then the rest of its chart palette. */
export function accentColors(theme: Theme): string[] {
  const { colors } = theme;
  const rest = colors.chart.slice(3);
  const accents = [colors.primary, colors.secondary, colors.accent, ...rest];
  while (accents.length < 6)
    accents.push(colors.chart[accents.length % colors.chart.length] ?? colors.primary);
  return accents.slice(0, 6);
}

function fontXml(
  tag: string,
  pair: { he: string; latin: string },
  lang: string,
  counterpart?: string,
) {
  const east = /^(ja|zh|ko)/i.test(lang) ? (counterpart ?? '') : '';
  const complex = /^(ar|fa|ur)/i.test(lang) ? (counterpart ?? pair.he) : pair.he;
  return el(
    tag,
    {},
    el('a:latin', { typeface: pair.latin }),
    el('a:ea', { typeface: east }),
    el('a:cs', { typeface: complex }),
    el('a:font', { script: 'Hebr', typeface: pair.he }),
  );
}

export function themeXml(
  theme: Theme,
  lang: string,
  counterpart?: (family: string, lang: string) => string | undefined,
): string {
  const { colors } = theme;
  const accents = accentColors(theme);
  const srgb = (value: string) => el('a:srgbClr', { val: value });
  const clrScheme = el(
    'a:clrScheme',
    { name: theme.name },
    el('a:dk1', {}, srgb(hex(colors.text, '000000'))),
    el('a:lt1', {}, srgb(hex(colors.bg, 'FFFFFF'))),
    el('a:dk2', {}, srgb(hex(colors.muted, '44546A'))),
    el('a:lt2', {}, srgb(hex(colors.surface, 'E7E6E6'))),
    ...accents.map((value, i) => el(`a:accent${i + 1}`, {}, srgb(hex(value, '4472C4')))),
    el('a:hlink', {}, srgb(hex(colors.primary, '0563C1'))),
    el('a:folHlink', {}, srgb(hex(colors.secondary, '954F72'))),
  );
  const fontScheme = el(
    'a:fontScheme',
    { name: theme.name },
    fontXml(
      'a:majorFont',
      theme.fonts.heading,
      lang,
      counterpart?.(theme.fonts.heading.latin, lang),
    ),
    fontXml('a:minorFont', theme.fonts.body, lang, counterpart?.(theme.fonts.body.latin, lang)),
  );
  const ph = (inner: string) => el('a:solidFill', {}, el('a:schemeClr', { val: 'phClr' }, inner));
  const fmtScheme = el(
    'a:fmtScheme',
    { name: 'Office' },
    el(
      'a:fillStyleLst',
      {},
      el('a:solidFill', {}, el('a:schemeClr', { val: 'phClr' })),
      ph(el('a:tint', { val: 75000 })),
      ph(el('a:shade', { val: 90000 })),
    ),
    el(
      'a:lnStyleLst',
      {},
      el(
        'a:ln',
        { w: 6350, cap: 'flat', cmpd: 'sng', algn: 'ctr' },
        el('a:solidFill', {}, el('a:schemeClr', { val: 'phClr' })),
        el('a:prstDash', { val: 'solid' }),
        el('a:miter', { lim: 800000 }),
      ),
      el(
        'a:ln',
        { w: 12700, cap: 'flat', cmpd: 'sng', algn: 'ctr' },
        el('a:solidFill', {}, el('a:schemeClr', { val: 'phClr' })),
        el('a:prstDash', { val: 'solid' }),
        el('a:miter', { lim: 800000 }),
      ),
      el(
        'a:ln',
        { w: 19050, cap: 'flat', cmpd: 'sng', algn: 'ctr' },
        el('a:solidFill', {}, el('a:schemeClr', { val: 'phClr' })),
        el('a:prstDash', { val: 'solid' }),
        el('a:miter', { lim: 800000 }),
      ),
    ),
    el(
      'a:effectStyleLst',
      {},
      el('a:effectStyle', {}, el('a:effectLst')),
      el('a:effectStyle', {}, el('a:effectLst')),
      el(
        'a:effectStyle',
        {},
        el(
          'a:effectLst',
          {},
          el(
            'a:outerShdw',
            { blurRad: 57150, dist: 19050, dir: 5400000, algn: 'ctr', rotWithShape: 0 },
            el('a:srgbClr', { val: '000000' }, el('a:alpha', { val: 63000 })),
          ),
        ),
      ),
    ),
    el(
      'a:bgFillStyleLst',
      {},
      el('a:solidFill', {}, el('a:schemeClr', { val: 'phClr' })),
      ph(el('a:tint', { val: 95000 })),
      ph(el('a:shade', { val: 90000 })),
    ),
  );
  return el(
    'a:theme',
    { 'xmlns:a': NS.a, name: theme.name },
    el('a:themeElements', {}, clrScheme, fontScheme, fmtScheme),
    el('a:objectDefaults'),
    el('a:extraClrSchemeLst'),
  );
}
