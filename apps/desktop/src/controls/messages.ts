import type { Messages } from '../i18n/he';

/* The strings of the shared controls (WG3-T06): the colour field and the font field. */
export const he = {
  color: {
    area: 'רוויה ובהירות',
    hue: 'גוון',
    alpha: 'אטימות',
    hex: 'קוד צבע',
    eyedropper: 'טפטפת',
    none: 'ללא צבע',
    recent: 'אחרונים',
    theme: 'צבעי התבנית',
  },
  token: {
    bg: 'רקע',
    surface: 'משטח',
    text: 'טקסט',
    muted: 'טקסט משני',
    primary: 'ראשי',
    secondary: 'משני',
    accent: 'הדגשה',
  },
  font: {
    search: 'חיפוש גופן',
    recent: 'אחרונים',
    all: 'כל הגופנים',
    deck: 'במצגת הזאת',
    mine: 'הגופנים שלי',
    library: 'ספריית Slidr',
    system: 'במחשב הזה',
    letters: 'תומך ב{{language}}',
    empty: 'לא נמצא גופן כזה',
    weights: 'המשקלים של {{family}}',
  },
  mixed: 'מעורב',
} as const;

export const en: Messages<typeof he> = {
  color: {
    area: 'Saturation and brightness',
    hue: 'Hue',
    alpha: 'Opacity',
    hex: 'Hex code',
    eyedropper: 'Eyedropper',
    none: 'No colour',
    recent: 'Recent',
    theme: 'Theme colours',
  },
  token: {
    bg: 'Background',
    surface: 'Surface',
    text: 'Text',
    muted: 'Muted text',
    primary: 'Primary',
    secondary: 'Secondary',
    accent: 'Accent',
  },
  font: {
    search: 'Search fonts',
    recent: 'Recent',
    all: 'All fonts',
    deck: 'In this presentation',
    mine: 'My fonts',
    library: 'Slidr library',
    system: 'On this computer',
    letters: 'Supports {{language}}',
    empty: 'No font by that name',
    weights: 'Weights of {{family}}',
  },
  mixed: 'Mixed',
};
