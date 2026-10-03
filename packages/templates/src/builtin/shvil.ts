import type { Theme } from '@slidr/model';

/**
 * Shvil: the marketing template. Warm, light and rounded, with large photographs. Derived from
 * the reference deck `docs/reference-decks/shvil.html`, whose theme block holds these same values.
 */
export const shvilTheme: Theme = {
  id: 'shvil',
  name: 'Shvil',
  colors: {
    bg: '#fbf6ec',
    surface: '#ffffff',
    text: '#2a1f1a',
    muted: '#75655a',
    primary: '#c4451c',
    secondary: '#1f5c4a',
    accent: '#f2b33d',
    chart: ['#c4451c', '#1f5c4a', '#f2b33d', '#e58f6a', '#3e8e7a', '#75655a'],
  },
  fonts: {
    heading: { he: 'Rubik', latin: 'Poppins' },
    body: { he: 'Rubik', latin: 'DM Sans' },
  },
  textStyles: {
    display: { font: 'heading', size: 148, weight: 800, lineHeight: 1.02, color: { token: 'text' } },
    title: { font: 'heading', size: 76, weight: 800, lineHeight: 1.1, color: { token: 'text' } },
    heading: { font: 'heading', size: 46, weight: 700, lineHeight: 1.2, color: { token: 'text' } },
    body: { font: 'body', size: 30, weight: 400, lineHeight: 1.5, color: { token: 'text' } },
    caption: { font: 'body', size: 24, weight: 500, lineHeight: 1.4, color: { token: 'muted' } },
  },
  radius: 32,
  shadow: { x: 0, y: 20, blur: 50, color: { value: '#3c1e0a', alpha: 0.12 } },
  background: { fill: { kind: 'solid', color: { token: 'bg' } } },
  backgroundVariants: [
    { fill: { kind: 'solid', color: { token: 'surface' } } },
    { fill: { kind: 'solid', color: { token: 'primary' } } },
    { fill: { kind: 'solid', color: { token: 'secondary' } } },
  ],
};
