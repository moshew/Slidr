import type { VariantStatus } from './api';

/** The studio speaks Hebrew; designs are shown in both languages. */
export const STATUS: Record<VariantStatus, string> = {
  queued: 'בתור',
  image: 'יוצר תמונה · Codex',
  writing: 'Claude מעצב',
  rendering: 'ממיר ומרנדר',
  reviewing: 'Claude בודק את הרינדור',
  ready: 'מוכן',
  failed: 'נכשל',
  cancelled: 'נעצר',
};

export const STAGE: Record<string, string> = {
  'waiting for Claude': 'ממתין ל-Claude',
  'waiting for Codex': 'ממתין ל-Codex',
  'waiting for the browser': 'ממתין לדפדפן',
};

export const LOG_KIND: Record<string, string> = {
  tool: 'כלי',
  text: 'Claude',
  claude: 'Claude',
  image: 'תמונה',
  render: 'רינדור',
  error: 'שגיאה',
  info: 'מידע',
  feedback: 'משוב',
  approval: 'אישור',
  publish: 'פרסום',
};

export const MODELS = [
  { value: '', label: 'ברירת המחדל של Claude Code' },
  { value: 'fable', label: 'Fable' },
  { value: 'opus', label: 'Opus' },
  { value: 'sonnet', label: 'Sonnet' },
];

export const EFFORTS = [
  { value: '', label: 'ברירת מחדל' },
  { value: 'medium', label: 'בינוני' },
  { value: 'high', label: 'גבוה' },
  { value: 'xhigh', label: 'גבוה מאוד' },
  { value: 'max', label: 'מקסימלי' },
];

export const PUBLISH_PHASE: Record<string, string> = {
  idle: '',
  preparing: 'מכין את הפרסום…',
  prepared: 'מוכן לשליחה — בדקו מה ישתנה',
  publishing: 'שולח ל-Cloudflare…',
  done: 'פורסם',
  failed: 'הפרסום נכשל',
};

export const time = (seconds: number) =>
  new Date(seconds * 1000).toLocaleTimeString('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

export const money = (usd: number) => (usd > 0 ? `$${usd.toFixed(2)}` : '');
