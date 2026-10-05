import type { Messages } from '../i18n/he';

/*
 * What the user is told when a file operation fails (WG13-T03): what happened, in their words,
 * and what to do about it. The error's own text, which is English and names paths, goes to the
 * console. Hebrew is the source of the keys; `en` must have the same ones.
 */
export const he = {
  failure: {
    damaged:
      'הקובץ פגום או קטוע, או שאינו קובץ של Slidr, ולכן אי אפשר לפתוח אותו. הקובץ עצמו לא שונה.',
    newer_version:
      'הקובץ נשמר בגרסה חדשה יותר של Slidr. עדכנו את האפליקציה כדי לפתוח אותו. הקובץ עצמו לא שונה.',
    not_found: 'הקובץ או התיקייה לא נמצאו. ייתכן שהועברו, שמם שונה או שנמחקו.',
    disk_full:
      'אין מספיק מקום בדיסק. פנו מקום ונסו שוב, או שמרו במקום אחר. המצגת הפתוחה והקובץ הקודם לא נפגעו.',
    refused:
      'מערכת הקבצים סירבה לפעולה. בדקו שהקובץ אינו פתוח בתוכנה אחרת, ושיש לכם הרשאת כתיבה לתיקייה.',
    other: 'הפעולה לא הושלמה בגלל תקלה. המצגת הפתוחה לא נפגעה. נסו שוב.',
  },
  autosave: {
    failed: 'השמירה האוטומטית נכשלה',
    disk_full: 'השמירה האוטומטית נכשלה: אין מקום בדיסק',
  },
  // A save that went through, without files the deck uses: the deck is safe, the file is not whole.
  saved: {
    missingTitle: 'המצגת נשמרה, אבל לא כל הקבצים שלה בקובץ',
    missing_one:
      'קובץ אחד שהמצגת משתמשת בו (תמונה, וידאו, אודיו או גופן) לא נמצא, ולכן אינו בקובץ השמור. בשקף הוא מוצג כחסר.',
    missing_two:
      'שני קבצים שהמצגת משתמשת בהם (תמונות, וידאו, אודיו או גופנים) לא נמצאו, ולכן אינם בקובץ השמור. בשקפים הם מוצגים כחסרים.',
    missing_other:
      '{{count}} קבצים שהמצגת משתמשת בהם (תמונות, וידאו, אודיו או גופנים) לא נמצאו, ולכן אינם בקובץ השמור. בשקפים הם מוצגים כחסרים.',
    // Last in the message, and with no full stop after the names: they read left to right, and
    // a stop after them is drawn at their other end, before the first name.
    missingNames_one: 'שם הקובץ: {{names}}',
    missingNames_two: 'שמות הקבצים: {{names}}',
    missingNames_other: 'שמות הקבצים: {{names}}',
    missingAmong: 'ביניהם: {{names}}',
    missingNext_one: 'אפשר להחליף אותו בקובץ מהמחשב, ואז לשמור שוב.',
    missingNext_two: 'אפשר להחליף אותם בקבצים מהמחשב, ואז לשמור שוב.',
    missingNext_other: 'אפשר להחליף אותם בקבצים מהמחשב, ואז לשמור שוב.',
  },
};

export const en: Messages<typeof he> = {
  failure: {
    damaged:
      'The file is damaged or cut short, or is not a Slidr file, so it cannot be opened. The file itself was not changed.',
    newer_version:
      'The file was saved by a newer version of Slidr. Update the app to open it. The file itself was not changed.',
    not_found: 'The file or the folder was not found. It may have been moved, renamed or deleted.',
    disk_full:
      'There is not enough room on the disk. Free some space and try again, or save somewhere else. The open deck and the previous file were not harmed.',
    refused:
      'The file system refused. Check that the file is not open in another program, and that you may write to the folder.',
    other: 'That did not complete because of a fault. The open deck was not harmed. Try again.',
  },
  autosave: {
    failed: 'Autosave failed',
    disk_full: 'Autosave failed: the disk is full',
  },
  saved: {
    missingTitle: 'Saved, but not all of the deck’s files are in the file',
    missing_one:
      'One file the deck uses (a picture, a video, a sound or a font) was not found, so it is not in the saved file. On its slide it shows as missing.',
    missing_two:
      '{{count}} files the deck uses (pictures, videos, sounds or fonts) were not found, so they are not in the saved file. On the slides they show as missing.',
    missing_other:
      '{{count}} files the deck uses (pictures, videos, sounds or fonts) were not found, so they are not in the saved file. On the slides they show as missing.',
    missingNames_one: 'Its name: {{names}}.',
    missingNames_two: 'Their names: {{names}}.',
    missingNames_other: 'Their names: {{names}}.',
    missingAmong: 'Among them: {{names}}.',
    missingNext_one: 'You can replace it with a file from your computer, then save again.',
    missingNext_two: 'You can replace them with files from your computer, then save again.',
    missingNext_other: 'You can replace them with files from your computer, then save again.',
  },
};
