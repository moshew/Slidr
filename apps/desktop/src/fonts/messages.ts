import type { Messages } from '../i18n/he';

/*
 * The strings of the fonts' part of the settings screen (SPEC 4.2), and the name of the undo
 * step that stores a font with a deck. Hebrew is the source of the keys; `en` must have the
 * same ones.
 */
export const he = {
  title: 'גופנים',
  about:
    'הגופנים שבורר הגופן מציע, לפי המקור שלהם. גופן שהוספתם זמין בכל מצגת. מצגת שמשתמשת בו שומרת את הקובץ שלו בתוכה, וכך גם קובץ HTML שמיוצא ממנה.',
  add: 'הוספת קובץ גופן…',
  formats: 'קובץ WOFF2, TTF או OTF. ודאו שרישיון הגופן מתיר להטמיע אותו בקבצים.',
  unreadable: 'לא ניתן לקרוא כגופן: {{files}}',
  storage: 'לא ניתן לשמור באפליקציה: {{files}}',
  remove: 'הסרת {{name}} מהגופנים שלי',
  weight: 'משקל {{weight}}',
  italic: 'נטוי',
  source: {
    mine: 'הגופנים שלי',
    deck: 'במצגת הזאת',
    library: 'ספריית Slidr',
    system: 'במחשב הזה',
  },
  from: {
    mine: 'קבצים שהוספתם כאן.',
    deck: 'גופנים שקובץ המצגת נושא בתוכו: כאלה שהגיעו עם ייבוא, וכאלה שלכם שהמצגת משתמשת בהם.',
    library: 'מגיעים עם האפליקציה, ונטמעים בכל קובץ מיוצא.',
    system: 'מותקנים במחשב הזה. הם אינם נשמרים במצגת, ואינם נטמעים בקובץ מיוצא.',
  },
  none: {
    mine: 'עוד לא הוספתם גופן.',
    deck: 'המצגת הזאת לא נושאת גופן משלה.',
    system: 'רשימת הגופנים של המחשב מוצגת באפליקציה עצמה.',
  },
  undo: {
    embed: 'שמירת הגופן {{family}} במצגת',
  },
};

export const en: Messages<typeof he> = {
  title: 'Fonts',
  about:
    'The fonts the font picker offers, by where they come from. A font you added is there in every presentation. A presentation that uses it keeps its file inside, and so does an HTML file exported from it.',
  add: 'Add a font file…',
  formats:
    'A WOFF2, TTF or OTF file. Make sure the licence of the font lets you embed it in files.',
  unreadable: 'Could not be read as a font: {{files}}',
  storage: 'Could not be kept in the app: {{files}}',
  remove: 'Remove {{name}} from my fonts',
  weight: 'Weight {{weight}}',
  italic: 'Italic',
  source: {
    mine: 'My fonts',
    deck: 'In this presentation',
    library: 'Slidr library',
    system: 'On this computer',
  },
  from: {
    mine: 'Files you added here.',
    deck: 'Fonts the presentation file carries: the ones an import brought, and yours that it uses.',
    library: 'They come with the app, and are embedded in every exported file.',
    system:
      'Installed on this computer. They are not saved in the presentation, and are not embedded in an exported file.',
  },
  none: {
    mine: 'You have not added a font yet.',
    deck: 'This presentation carries no font of its own.',
    system: 'The fonts of the computer are listed in the app itself.',
  },
  undo: {
    embed: 'Store the font {{family}} in the presentation',
  },
};
