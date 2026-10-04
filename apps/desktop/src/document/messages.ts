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
};
