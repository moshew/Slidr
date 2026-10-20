import type { Messages } from '../i18n/he';

/*
 * The strings of the settings screen that are not one area's: the keys and where they are kept
 * (WG3-T08, SEC-04). Hebrew is the source of the keys; `en` must have the same ones.
 */
export const he = {
  topics: 'נושאי ההגדרות',
  pages: {
    general: {
      tab: 'כללי',
      title: 'כללי',
      description: 'המראה של האפליקציה ושפת הממשק.',
    },
    agent: {
      tab: 'סוכן',
      title: 'הסוכן',
      description: 'החיבור, המודל שכל שיחה מתחילה בו, ומה מותר לו לעשות בדרך.',
    },
    media: {
      tab: 'תמונות',
      title: 'תמונות',
      description: 'יצירת תמונות ב-AI, ומאגרי תמונות הסטוק.',
    },
    fonts: {
      tab: 'גופנים',
      title: 'גופנים',
      description: 'הגופנים שבורר הגופן מציע, וגופנים משלכם.',
    },
    about: {
      tab: 'אודות',
      title: 'אודות ואבחון',
      description: 'הגרסה, רישיונות הקוד הפתוח ויומן האבחון.',
    },
  },
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
    installDescriptionNpm:
      'האפליקציה תתקין את {{name}} באמצעות npm, ואם Node.js חסר תתקין אותו קודם באמצעות Windows App Installer. לאחר ההתקנה נבדוק את החיבור ונבקש התחברות לחשבון לפי הצורך.',
    approveInstall: 'אישור והתקנה',
    chooseModel: 'בחרו מודל',
    chooseEffort: 'בחרו רמת מאמץ',
    noEffort: 'המודל הזה אינו מציע בחירת רמת מאמץ.',
    configure: 'בחירת מודל בהגדרות',

    title: 'הסוכן',
    connection: 'חיבור',
    state: {
      ready: 'מחובר',
      not_installed: 'לא מותקן',
      not_logged_in: 'לא מחובר',
      unavailable: 'לא זמין',
      busy: 'בתהליך…',
    },
    defaults: 'ברירת המחדל של שיחות',
    behaviour: 'התנהגות',
    harness: 'Harness',
    model: 'מודל',
    effort: 'רמת מאמץ',
    default: 'ברירת המחדל',
    nextMessage: 'ברירת המחדל של כל שיחה, מההודעה הבאה. שיחה שבחרו לה מודל משלה נשארת עליו.',
    pickerHint: 'לשיחה הזאת בלבד. ברירת המחדל נקבעת בהגדרות.',
    web: 'חיפוש וקריאה ברשת',
    webHint: 'הסוכן רשאי לחפש ברשת ולקרוא דפים כשהוא בונה שקפים.',
    gate: 'בדיקת עיצוב בסוף כל תור',
    gateHint: 'הסוכן מתקן ממצאי עיצוב בשקפים שנגע בהם לפני שהוא מסיים.',
    outline: 'מתווה לפני בניית מצגת',
    outlineHint: 'כשמבקשים מצגת לפי נושא, הסוכן מציג קודם מתווה לאישור.',
    unavailable: 'לא ניתן לקרוא מה הסוכן יכול להריץ כרגע.',
  },
};

export const en: Messages<typeof he> = {
  topics: 'Settings topics',
  pages: {
    general: {
      tab: 'General',
      title: 'General',
      description: "The app's appearance and the language of its interface.",
    },
    agent: {
      tab: 'Agent',
      title: 'The agent',
      description:
        'Its connection, the model every chat starts with, and what it may do on the way.',
    },
    media: {
      tab: 'Images',
      title: 'Images',
      description: 'Making images with AI, and the stock photo libraries.',
    },
    fonts: {
      tab: 'Fonts',
      title: 'Fonts',
      description: 'The fonts the font picker offers, and fonts of your own.',
    },
    about: {
      tab: 'About',
      title: 'About and diagnostics',
      description: 'The version, open-source licences and the diagnostics log.',
    },
  },
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
    installDescriptionNpm:
      'The app will install {{name}} with npm, installing Node.js first using Windows App Installer if it is missing. We will then check the connection and ask you to sign in if needed.',
    approveInstall: 'Approve and install',
    chooseModel: 'Choose a model',
    chooseEffort: 'Choose an effort',
    noEffort: 'This model does not offer an effort setting.',
    configure: 'Choose a model in Settings',

    title: 'The agent',
    connection: 'Connection',
    state: {
      ready: 'Connected',
      not_installed: 'Not installed',
      not_logged_in: 'Signed out',
      unavailable: 'Unavailable',
      busy: 'Working…',
    },
    defaults: 'Defaults for chats',
    behaviour: 'Behaviour',
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
