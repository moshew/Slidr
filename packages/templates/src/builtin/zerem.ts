import type { Theme } from '@slidr/model';

/**
 * Zerem: the technology template. Dark, precise, with one bright colour. Derived from the
 * reference deck `docs/reference-decks/zerem.html`, whose theme block holds these same values.
 */
export const zeremTheme: Theme = {
  id: 'zerem',
  name: 'Zerem',
  colors: {
    bg: '#0b1020',
    surface: '#151d36',
    text: '#eaf0ff',
    muted: '#98a5c8',
    primary: '#2ee6d0',
    secondary: '#8f7dff',
    accent: '#ffb547',
    chart: ['#2ee6d0', '#8f7dff', '#ffb547', '#5aa9ff', '#f472b6', '#98a5c8'],
  },
  fonts: {
    heading: { he: 'IBM Plex Sans Hebrew', latin: 'Space Grotesk' },
    body: { he: 'Heebo', latin: 'Inter' },
  },
  textStyles: {
    display: { font: 'heading', size: 136, weight: 700, lineHeight: 1.05, color: { token: 'text' } },
    title: { font: 'heading', size: 72, weight: 700, lineHeight: 1.12, color: { token: 'text' } },
    heading: { font: 'heading', size: 44, weight: 600, lineHeight: 1.2, color: { token: 'text' } },
    body: { font: 'body', size: 30, weight: 400, lineHeight: 1.5, color: { token: 'text' } },
    caption: { font: 'body', size: 24, weight: 500, lineHeight: 1.4, color: { token: 'muted' } },
  },
  radius: 12,
  shadow: { x: 0, y: 24, blur: 60, color: { value: '#000000', alpha: 0.45 } },
  background: { fill: { kind: 'solid', color: { token: 'bg' } } },
  backgroundVariants: [
    { fill: { kind: 'solid', color: { token: 'surface' } } },
    { fill: { kind: 'solid', color: { token: 'primary' } } },
  ],
};
