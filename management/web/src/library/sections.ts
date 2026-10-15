/**
 * The parts of the media library the browser shows, in the order the app offers them, and the
 * files of each (docs/media-library.md), by which the overview counts them.
 */
export interface Section {
  id: string;
  name: string;
  /** What it is, in a line. */
  about: string;
  /** The places of its files: a folder ends with a slash. */
  paths: string[];
}

export const SECTIONS: Section[] = [
  {
    id: 'designs',
    name: 'עיצובים מוכנים',
    about: 'השקפים המוכנים של Elements → עיצובים: הכתובים ביד ואלה שהסטודיו פרסם.',
    paths: ['elements/designs/', 'images/designs/'],
  },
  {
    id: 'templates',
    name: 'תבניות',
    about: 'התבניות המובנות, עם מצגות הדוגמה שלהן בעברית ובאנגלית.',
    paths: ['templates/', 'images/templates/'],
  },
  {
    id: 'cards',
    name: 'ערכות כרטיסים',
    about: 'ערכות הכרטיסים של Elements, בכל מספר כרטיסים ובשני הכיוונים.',
    paths: ['elements/cards/'],
  },
  {
    id: 'frames',
    name: 'מסגרות',
    about: 'מסגרות התמונה ומגנטי האירועים, כפי שלוח Elements מציג אותם.',
    paths: ['elements/catalogs/frames-catalog', 'images/frames/'],
  },
  {
    id: 'shapes',
    name: 'צורות וקווים',
    about: 'הצורות והקווים שהאפליקציה מציעה.',
    paths: ['elements/catalogs/shapes.json'],
  },
  {
    id: 'graphics',
    name: 'גרפיקה',
    about: 'ערכות הגרפיקה, לפי סגנון.',
    paths: ['elements/catalogs/graphics-catalog'],
  },
  {
    id: 'emoji',
    name: "אימוג'י",
    about: "האימוג'י, לפי קטגוריה.",
    paths: ['elements/catalogs/emoji-catalog'],
  },
  {
    id: 'art',
    name: 'איורים',
    about: 'ערכות האיורים הצבעוניים, עם הרישיון של כל ערכה.',
    paths: ['elements/art/'],
  },
  {
    id: 'icons',
    name: 'אייקונים',
    about: 'Lucide ו-Tabler, עם מילות החיפוש בעברית ובאנגלית.',
    paths: ['icons/'],
  },
  {
    id: 'fonts',
    name: 'גופנים',
    about: 'הגופנים המובנים של מצגות, עם הרישיון של כל משפחה.',
    paths: ['fonts/'],
  },
  {
    id: 'files',
    name: 'כל הקבצים',
    about: 'כל קובץ שפורסם, תיקייה אחר תיקייה, עם הגודל וה-SHA-256 שלו.',
    paths: [''],
  },
];

export const sectionOf = (id: string) => SECTIONS.find((section) => section.id === id);

/** Whether a file of the library belongs to a section. */
export const inSection = (section: Section, path: string) =>
  section.paths.some((place) => path.startsWith(place));
