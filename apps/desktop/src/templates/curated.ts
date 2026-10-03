/**
 * The palettes and font pairs Slidr offers beside the ones of its templates (AID-05): the deck
 * tool lists them after the library's own (`src/ai/look.ts`). Like the themes of the built-in
 * templates they are what a slide is drawn in, not colours of the app, so they are data here and
 * not tokens of the design system.
 *
 * A palette is the seven colour tokens of a theme and the series of its charts, so a chart
 * follows the palette it sits on. `src/ai/look.test.ts` holds every palette to the contrast a
 * slide needs, and every font pair to the families the app registers.
 */
import { createBaseTheme, type Theme } from '@slidr/model';

export type ThemeColors = Theme['colors'];
export type ThemeFonts = Theme['fonts'];

/** By id; the deck tool names each in the language of the UI (`look.palette.names`). */
export const curatedPalettes = {
  // The theme of a plain deck: the way back to it after a palette was tried.
  basic: createBaseTheme().colors,
  ocean: {
    bg: '#f4f8fc',
    surface: '#ffffff',
    text: '#0f1f33',
    muted: '#4f6078',
    primary: '#0b5cad',
    secondary: '#0e7c86',
    accent: '#f08a24',
    chart: ['#0b5cad', '#0e7c86', '#f08a24', '#5b9bd5', '#7a5ea8', '#4f6078'],
  },
  sage: {
    bg: '#f3f6ef',
    surface: '#ffffff',
    text: '#1b2a1f',
    muted: '#566454',
    primary: '#2f6b3c',
    secondary: '#8a5a2b',
    accent: '#d9a441',
    chart: ['#2f6b3c', '#8a5a2b', '#d9a441', '#6fa37a', '#3d7c8c', '#566454'],
  },
  rose: {
    bg: '#fdf3f1',
    surface: '#ffffff',
    text: '#2b1620',
    muted: '#735864',
    primary: '#b4235a',
    secondary: '#5b3a8c',
    accent: '#f0a04b',
    chart: ['#b4235a', '#5b3a8c', '#f0a04b', '#e07a9b', '#3f8f8a', '#735864'],
  },
  graphite: {
    bg: '#141416',
    surface: '#222226',
    text: '#f4f4f5',
    muted: '#a5a5ad',
    primary: '#f5b84a',
    secondary: '#6ea8fe',
    accent: '#ef6f6c',
    chart: ['#f5b84a', '#6ea8fe', '#ef6f6c', '#63c7a6', '#b99cf5', '#a5a5ad'],
  },
  forest: {
    bg: '#0f1f1a',
    surface: '#1a2f28',
    text: '#eef6f1',
    muted: '#9db8ab',
    primary: '#5fd39b',
    secondary: '#e2c275',
    accent: '#ff8a5b',
    chart: ['#5fd39b', '#e2c275', '#ff8a5b', '#6fb7e8', '#c9a0e8', '#9db8ab'],
  },
  plum: {
    bg: '#1a1326',
    surface: '#2a1f3d',
    text: '#f5f0ff',
    muted: '#b5a8cf',
    primary: '#c79bff',
    secondary: '#ff8fb3',
    accent: '#ffd166',
    chart: ['#c79bff', '#ff8fb3', '#ffd166', '#6fd3c7', '#7fa8ff', '#b5a8cf'],
  },
} satisfies Record<string, ThemeColors>;

export type CuratedPaletteId = keyof typeof curatedPalettes;

/**
 * Font pairs from the built-in library (SPEC appendix B). A heading family has a real bold
 * face: the text styles of a theme ask for 600 to 800, and a family with one weight would be
 * thickened by the browser.
 */
export const curatedFonts: readonly ThemeFonts[] = [
  // The fonts of a plain deck.
  createBaseTheme().fonts,
  {
    heading: { he: 'Noto Sans Hebrew', latin: 'Manrope' },
    body: { he: 'Noto Sans Hebrew', latin: 'Manrope' },
  },
  {
    heading: { he: 'Assistant', latin: 'Montserrat' },
    body: { he: 'Assistant', latin: 'Open Sans' },
  },
  {
    heading: { he: 'Frank Ruhl Libre', latin: 'Playfair Display' },
    body: { he: 'Heebo', latin: 'Inter' },
  },
  {
    heading: { he: 'Noto Serif Hebrew', latin: 'Playfair Display' },
    body: { he: 'Noto Sans Hebrew', latin: 'DM Sans' },
  },
  {
    heading: { he: 'Karantina', latin: 'Karantina' },
    body: { he: 'Heebo', latin: 'Inter' },
  },
  {
    heading: { he: 'IBM Plex Sans Hebrew', latin: 'JetBrains Mono' },
    body: { he: 'IBM Plex Sans Hebrew', latin: 'Inter' },
  },
];
