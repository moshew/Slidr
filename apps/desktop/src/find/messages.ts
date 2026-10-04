/* The strings of find and replace (TXT-12), namespace `find`. */

export const he = {
  title: 'חיפוש והחלפה',
  find: 'חיפוש במצגת',
  replaceWith: 'החלפה ב…',
  noResults: 'אין תוצאות',
  previous: 'התוצאה הקודמת',
  next: 'התוצאה הבאה',
  showReplace: 'הצגת שורת ההחלפה',
  hideReplace: 'הסתרת שורת ההחלפה',
  matchCase: 'התאמת רישיות',
  wholeWord: 'מילה שלמה בלבד',
  replace: 'החלפה',
  replaceAll: 'החלפת הכול',
  close: 'סגירה',
  // Hebrew counts one, two and many apart.
  replaced_one: 'תוצאה אחת הוחלפה',
  replaced_two: 'שתי תוצאות הוחלפו',
  replaced_other: '{{count}} תוצאות הוחלפו',
  skipped_one: 'תוצאה אחת באובייקט נעול לא הוחלפה',
  skipped_two: 'שתי תוצאות באובייקטים נעולים לא הוחלפו',
  skipped_other: '{{count}} תוצאות באובייקטים נעולים לא הוחלפו',
  where: {
    notes: 'התוצאה בהערות הדובר של השקף',
    hidden: 'התוצאה באובייקט מוסתר',
    locked: 'התוצאה באובייקט נעול, ולכן לא תוחלף',
  },
  shortcut: {
    open: 'חיפוש במצגת',
    replace: 'חיפוש והחלפה',
    next: 'התוצאה הבאה',
    previous: 'התוצאה הקודמת',
  },
  history: {
    replace: 'החלפה',
    replaceAll: 'החלפת הכול',
  },
};

export const en = {
  title: 'Find and replace',
  find: 'Find in the deck',
  replaceWith: 'Replace with',
  noResults: 'No results',
  previous: 'Previous match',
  next: 'Next match',
  showReplace: 'Show the replace row',
  hideReplace: 'Hide the replace row',
  matchCase: 'Match case',
  wholeWord: 'Whole word only',
  replace: 'Replace',
  replaceAll: 'Replace all',
  close: 'Close',
  // English has no form for two; the key is here because both tables have the same keys.
  replaced_one: 'Replaced one match',
  replaced_two: 'Replaced {{count}} matches',
  replaced_other: 'Replaced {{count}} matches',
  skipped_one: 'One match in a locked object was left as it is',
  skipped_two: '{{count}} matches in locked objects were left as they are',
  skipped_other: '{{count}} matches in locked objects were left as they are',
  where: {
    notes: "This match is in the slide's speaker notes",
    hidden: 'This match is in a hidden object',
    locked: 'This match is in a locked object, so it will not be replaced',
  },
  shortcut: {
    open: 'Find in the deck',
    replace: 'Find and replace',
    next: 'Next match',
    previous: 'Previous match',
  },
  history: {
    replace: 'Replace',
    replaceAll: 'Replace all',
  },
};
