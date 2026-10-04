import type { Messages } from '../i18n/he';

/*
 * The strings of the settings screen that are not one area's: the keys and where they are kept
 * (WG3-T08, SEC-04). Hebrew is the source of the keys; `en` must have the same ones.
 */
export const he = {
  keys: {
    name: {
      'openai-api': 'מפתח API של OpenAI',
      unsplash: 'מפתח גישה של Unsplash',
      pexels: 'מפתח API של Pexels',
    },
    placeholder: 'הדביקו כאן את המפתח',
    save: 'שמירה',
    replace: 'החלפה',
    remove: 'הסרה',
    cancel: 'ביטול',
    stored: 'מפתח שמור',
    where:
      'המפתח נשמר רק במאגר הסיסמאות של מערכת ההפעלה. הוא לא נכתב לקובץ המצגת או להגדרות, והאפליקציה לא מציגה אותו שוב.',
    invalid: 'זה לא נראה כמו מפתח. הדביקו את המפתח לבדו, בלי רווחים.',
    unavailable: 'מאגר הסיסמאות של מערכת ההפעלה לא זמין כרגע.',
    failed: 'הפעולה נכשלה. נסו שוב.',
  },
  loadFailed: 'לא ניתן לקרוא את ההגדרות',
  retry: 'ניסיון נוסף',
  agent: {
    title: 'ה-Agent',
    harness: 'Harness',
    model: 'מודל',
    effort: 'רמת מאמץ',
    default: 'ברירת המחדל',
    nextMessage: 'חל מההודעה הבאה, בכל שיחה.',
    web: 'חיפוש וקריאה ברשת',
    webHint: 'ה-Agent רשאי לחפש ברשת ולקרוא דפים כשהוא בונה שקפים.',
    gate: 'בדיקת עיצוב בסוף כל תור',
    gateHint: 'ה-Agent מתקן ממצאי עיצוב בשקפים שנגע בהם לפני שהוא מסיים.',
    outline: 'מתווה לפני בניית מצגת',
    outlineHint: 'כשמבקשים מצגת לפי נושא, ה-Agent מציג קודם מתווה לאישור.',
    unavailable: 'לא ניתן לקרוא מה ה-Agent יכול להריץ כרגע.',
  },
};

export const en: Messages<typeof he> = {
  keys: {
    name: {
      'openai-api': 'OpenAI API key',
      unsplash: 'Unsplash access key',
      pexels: 'Pexels API key',
    },
    placeholder: 'Paste the key here',
    save: 'Save',
    replace: 'Replace',
    remove: 'Remove',
    cancel: 'Cancel',
    stored: 'Key saved',
    where:
      "The key is kept only in the operating system's credential store. It is not written to the presentation file or to the settings, and the app never shows it again.",
    invalid: 'This does not look like a key. Paste the key alone, with no spaces.',
    unavailable: "The operating system's credential store is not available right now.",
    failed: 'That did not work. Try again.',
  },
  loadFailed: 'The settings could not be read',
  retry: 'Try again',
  agent: {
    title: 'The agent',
    harness: 'Harness',
    model: 'Model',
    effort: 'Effort',
    default: 'The default',
    nextMessage: 'Applies from the next message, in every chat.',
    web: 'Web search and reading',
    webHint: 'The agent may search the web and read pages while it builds slides.',
    gate: 'Design check at the end of every turn',
    gateHint: 'The agent fixes design findings on the slides it touched before it finishes.',
    outline: 'An outline before building a deck',
    outlineHint: 'Asked for a deck by its subject, the agent first shows an outline to approve.',
    unavailable: 'What the agent can run could not be read right now.',
  },
};
