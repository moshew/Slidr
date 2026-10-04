import type { Messages } from '../i18n/he';

/*
 * The strings of the "About and diagnostics" part of the settings screen (WG13-T05, AGT-08).
 * Hebrew is the source of the keys; `en` must have the same ones. The log itself is not
 * translated: its entries are the harness's own words.
 */
export const he = {
  title: 'אודות ואבחון',
  version: 'גרסה {{version}}',
  close: 'סגירה',
  licenses: {
    label: 'רישיונות קוד פתוח',
    hint: 'התוכנות, הגופנים והאייקונים ש-Slidr בנויה מהם, והרישיון של כל אחד.',
    open: 'הצגת הרישיונות',
    title: 'רישיונות קוד פתוח',
    loading: 'טוען את הרשימה…',
    failed: 'לא ניתן לקרוא את רשימת הרישיונות.',
  },
  diagnostics: {
    label: 'יומן האבחון של ה-Agent',
    hint: 'מה שה-Agent אמר ועשה בשיחות האחרונות, לבירור תקלות. היומן נשמר במחשב הזה בלבד.',
    size: 'גודל היומן: {{size}}',
    empty: 'היומן ריק.',
    open: 'הצגת היומן',
    clear: 'ניקוי היומן',
    title: 'יומן האבחון',
    description: 'הרשומות האחרונות, החדשה ביותר למטה. לחיצה על רשומה מציגה אותה במלואה.',
    refresh: 'רענון',
    copy: 'העתקת היומן',
    copied: 'הועתק',
    file: 'הקובץ המלא:',
    failed: 'לא ניתן לקרוא את היומן.',
    entries: 'רשומות: {{count}}',
  },
};

export const en: Messages<typeof he> = {
  title: 'About and diagnostics',
  version: 'Version {{version}}',
  close: 'Close',
  licenses: {
    label: 'Open-source licences',
    hint: 'The software, fonts and icons Slidr is built from, and the licence of each.',
    open: 'Show the licences',
    title: 'Open-source licences',
    loading: 'Loading the list…',
    failed: 'The list of licences could not be read.',
  },
  diagnostics: {
    label: "The agent's diagnostics log",
    hint: 'What the agent said and did in recent conversations, for looking into problems. The log stays on this computer.',
    size: 'Size of the log: {{size}}',
    empty: 'The log is empty.',
    open: 'Show the log',
    clear: 'Clear the log',
    title: 'Diagnostics log',
    description: 'The latest entries, the newest at the bottom. Click an entry to see all of it.',
    refresh: 'Refresh',
    copy: 'Copy the log',
    copied: 'Copied',
    file: 'The whole file:',
    failed: 'The log could not be read.',
    entries: 'Entries: {{count}}',
  },
};
