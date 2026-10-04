import type { Messages } from '../i18n/he';

/*
 * The strings of the image providers in the app's own screens (GEN-01, GEN-03): the settings
 * section, and what a provider's state is called wherever it is shown. Nothing here names a
 * provider: a provider is described by what its descriptor says it can do (ADR-025).
 * Hebrew is the source of the keys; `en` must have the same ones.
 */
export const he = {
  settings: {
    title: 'תמונות AI',
    hint: 'מי יוצר את התמונות: בכלים של האפליקציה ובכלים של ה-Agent.',
    providers: 'ספק התמונות',
    chooseFailed: 'הספק לא הוחלף. נסו שוב.',
    listFailed: 'לא ניתן לקרוא את רשימת הספקים',
    quality: 'איכות התמונה',
    qualityHint: 'איכות גבוהה יותר עולה יותר ולוקחת יותר זמן.',
  },
  quality: {
    low: 'נמוכה',
    medium: 'בינונית',
    high: 'גבוהה',
    auto: 'אוטומטית',
  },
  state: {
    checking: 'בודק…',
    ready: 'מוכן',
    not_installed: 'לא מותקן',
    not_logged_in: 'לא מחובר',
    needs_key: 'דרוש מפתח',
    key_rejected: 'המפתח נדחה',
    unavailable: 'לא זמין',
  },
  edit: {
    exact: 'עורך תמונה קיימת במדויק, גם בתוך מסכה',
    regenerate: 'עריכה של תמונה היא ציור מחדש שלה',
    none: 'יוצר תמונות, בלי עריכה',
  },
  cost: {
    key: 'בתשלום לפי תמונה, במפתח שלכם',
    signIn: 'בלי מפתח, על ההתחברות של הכלי',
  },
  account: 'מחובר דרך {{account}}',
  mask: {
    title: 'סימון האזור לשינוי',
    description: 'צבעו על התמונה את החלק שה-AI רשאי לשנות. כל מה שלא נצבע יישאר בדיוק כמו שהוא.',
    canvas: 'התמונה, לצביעת האזור',
    tool: 'הכלי',
    paint: 'צביעה',
    erase: 'מחיקה',
    brush: 'גודל המברשת',
    clear: 'ניקוי',
    empty: 'עוד לא נצבע אזור.',
    done: 'אישור',
    cancel: 'ביטול',
    failed: 'הסימון לא נשמר',
  },
};

export const en: Messages<typeof he> = {
  settings: {
    title: 'AI images',
    hint: "Who makes the images: for the app's own tools and for the agent's.",
    providers: 'Image provider',
    chooseFailed: 'The provider was not changed. Try again.',
    listFailed: 'The list of providers could not be read',
    quality: 'Image quality',
    qualityHint: 'Higher quality costs more and takes longer.',
  },
  quality: {
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    auto: 'Automatic',
  },
  state: {
    checking: 'Checking…',
    ready: 'Ready',
    not_installed: 'Not installed',
    not_logged_in: 'Not signed in',
    needs_key: 'Needs a key',
    key_rejected: 'Key rejected',
    unavailable: 'Unavailable',
  },
  edit: {
    exact: 'Edits an existing image exactly, also inside a mask',
    regenerate: 'Editing an image redraws it',
    none: 'Makes images; no editing',
  },
  cost: {
    key: 'Paid per image, with your key',
    signIn: "No key: it uses the tool's own sign-in",
  },
  account: 'Signed in with {{account}}',
  mask: {
    title: 'Mark the area to change',
    description:
      'Paint over the part of the image the AI may change. Whatever is not painted stays exactly as it is.',
    canvas: 'The image, to paint the area on',
    tool: 'Tool',
    paint: 'Paint',
    erase: 'Erase',
    brush: 'Brush size',
    clear: 'Clear',
    empty: 'No area is painted yet.',
    done: 'Done',
    cancel: 'Cancel',
    failed: 'The mark was not saved',
  },
};
