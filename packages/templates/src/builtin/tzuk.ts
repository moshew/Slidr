import type { Theme } from '@slidr/model';

/**
 * Tzuk: the business template. Paper, ink and one deep green; serif headings, thin rules, and
 * numbers set large. Derived from the reference deck `docs/reference-decks/tzuk.html`, whose
 * theme block holds these same values.
 */
export const tzukTheme: Theme = {
  id: 'tzuk',
  name: 'Tzuk',
  colors: {
    bg: '#f7f5f0',
    surface: '#ffffff',
    text: '#16202e',
    muted: '#5c6470',
    primary: '#0f5b45',
    secondary: '#1d3557',
    accent: '#b8893a',
    chart: ['#0f5b45', '#1d3557', '#b8893a', '#7fa896', '#8a93a6', '#d9c6a0'],
  },
  fonts: {
    heading: { he: 'Frank Ruhl Libre', latin: 'Playfair Display' },
    body: { he: 'Assistant', latin: 'Inter' },
  },
  textStyles: {
    display: { font: 'heading', size: 128, weight: 700, lineHeight: 1.05, color: { token: 'text' } },
    title: { font: 'heading', size: 68, weight: 700, lineHeight: 1.15, color: { token: 'text' } },
    heading: { font: 'heading', size: 44, weight: 600, lineHeight: 1.2, color: { token: 'text' } },
    body: { font: 'body', size: 30, weight: 400, lineHeight: 1.5, color: { token: 'text' } },
    caption: { font: 'body', size: 24, weight: 500, lineHeight: 1.4, color: { token: 'muted' } },
  },
  radius: 4,
  shadow: { x: 0, y: 12, blur: 32, color: { value: '#16202e', alpha: 0.1 } },
  background: { fill: { kind: 'solid', color: { token: 'bg' } } },
  backgroundVariants: [
    { fill: { kind: 'solid', color: { token: 'surface' } } },
    { fill: { kind: 'solid', color: { token: 'primary' } } },
    { fill: { kind: 'solid', color: { token: 'secondary' } } },
  ],
};
