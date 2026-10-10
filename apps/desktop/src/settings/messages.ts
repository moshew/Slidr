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
    connecting: 'מתחברים וטוענים מודלים זמינים…',
    installing: 'מתקינים את ה־CLI. הפעולה עשויה להימשך כמה דקות…',
    signingIn: 'השלימו את ההתחברות בחלון שנפתח. לאחר מכן נטען את המודלים.',
    ready: 'מחובר. בחרו מודל ורמת מאמץ.',
    not_installed: 'ה־CLI לא מותקן במחשב. להתקין אותו?',
    not_logged_in: 'ה־CLI מותקן. נדרשת התחברות לחשבון.',
    install: 'התקנה…',
    signIn: 'התחברות לחשבון',
    refresh: 'רענון החיבור והמודלים',
    installTitle: 'להתקין {{name}}?',
    installDescription:
      'האפליקציה תוריד ותתקין את {{name}} באמצעות Windows App Installer. לאחר ההתקנה נבדוק את החיבור ונבקש התחברות לחשבון לפי הצורך.',
    approveInstall: 'אישור והתקנה',
    chooseModel: 'בחרו מודל',
    chooseEffort: 'בחרו רמת מאמץ',
    noEffort: 'המודל הזה אינו מציע בחירת רמת מאמץ.',
    configure: 'בחירת מודל בהגדרות',

    title: 'ה-Agent',
    harness: 'Harness',
    model: 'מודל',
    effort: 'רמת מאמץ',
    default: 'ברירת המחדל',
    nextMessage: 'ברירת המחדל של כל שיחה, מההודעה הבאה. שיחה שבחרו לה מודל משלה נשארת עליו.',
    pickerHint: 'לשיחה הזאת בלבד. ברירת המחדל נקבעת בהגדרות.',
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
    connecting: 'Connecting and loading available models…',
    installing: 'Installing the CLI. This may take a few minutes…',
    signingIn: 'Complete sign-in in the window that opened. We will then load your models.',
    ready: 'Connected. Choose a model and effort.',
    not_installed: 'The CLI is not installed on this computer. Install it?',
    not_logged_in: 'The CLI is installed. Sign in to your account to continue.',
    install: 'Install…',
    signIn: 'Sign in',
    refresh: 'Refresh connection and models',
    installTitle: 'Install {{name}}?',
    installDescription:
      'The app will download and install {{name}} using Windows App Installer. We will then check the connection and ask you to sign in if needed.',
    approveInstall: 'Approve and install',
    chooseModel: 'Choose a model',
    chooseEffort: 'Choose an effort',
    noEffort: 'This model does not offer an effort setting.',
    configure: 'Choose a model in Settings',

    title: 'The agent',
    harness: 'Harness',
    model: 'Model',
    effort: 'Effort',
    default: 'The default',
    nextMessage:
      'The default of every chat, from its next message. A chat that picked its own model stays on it.',
    pickerHint: 'For this chat only. The default is set in Settings.',
    web: 'Web search and reading',
    webHint: 'The agent may search the web and read pages while it builds slides.',
    gate: 'Design check at the end of every turn',
    gateHint: 'The agent fixes design findings on the slides it touched before it finishes.',
    outline: 'An outline before building a deck',
    outlineHint: 'Asked for a deck by its subject, the agent first shows an outline to approve.',
    unavailable: 'What the agent can run could not be read right now.',
  },
};
