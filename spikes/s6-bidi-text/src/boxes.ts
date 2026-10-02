/** Slide geometry and text box fixtures. All numbers are in slide (1920x1080 logical) px. */

export const SLIDE_W = 1920;
export const SLIDE_H = 1080;

export interface BoxSpec {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** degrees, clockwise */
  rot: number;
  font: 'Heebo' | 'Inter';
  size: number;
  html: string;
}

export const BOXES: BoxSpec[] = [
  {
    id: 'en',
    x: 80,
    y: 60,
    w: 760,
    h: 330,
    rot: 0,
    font: 'Inter',
    size: 44,
    html:
      '<p dir="ltr">Hello world, this is an English text box.</p>' +
      '<p dir="ltr">The second paragraph is long enough to wrap onto several lines inside this box.</p>',
  },
  {
    id: 'he',
    x: 1080,
    y: 60,
    w: 760,
    h: 330,
    rot: 0,
    font: 'Heebo',
    size: 44,
    html:
      '<p dir="rtl">שלום עולם, זוהי תיבת טקסט בעברית.</p>' +
      '<p dir="rtl">הפסקה השנייה ארוכה מספיק כדי להישבר לכמה שורות בתוך התיבה הזאת, וכך אפשר לבדוק תנועה.</p>',
  },
  {
    id: 'mixed',
    x: 80,
    y: 420,
    w: 900,
    h: 420,
    rot: 0,
    font: 'Heebo',
    size: 38,
    html:
      '<p dir="rtl">ההתקנה של Slidr גרסה 2.5 (beta) זמינה בכתובת https://slidr.app/get?v=2 כבר היום!</p>' +
      '<p dir="auto">React ו-<strong>TypeScript</strong> הם הבסיס, 100% קוד פתוח.</p>' +
      '<p dir="ltr">The word שלום means peace (and hello), עולם means world.</p>',
  },
  {
    id: 'list',
    x: 1080,
    y: 420,
    w: 760,
    h: 290,
    rot: 0,
    font: 'Heebo',
    size: 38,
    html:
      '<ul>' +
      '<li dir="auto"><p>פריט ראשון בעברית</p></li>' +
      '<li dir="auto"><p>פריט עם API ומספר 42</p></li>' +
      '<li dir="auto"><p>English item with עברית</p></li>' +
      '</ul>',
  },
  {
    id: 'rot',
    x: 1180,
    y: 800,
    w: 600,
    h: 180,
    rot: 15,
    font: 'Heebo',
    size: 36,
    html: '<p dir="rtl">טקסט מסובב עם English בפנים, שורה שנייה 123 ועוד קצת.</p>',
  },
];

export type Mode = 'transform' | 'zoom' | 'plain';

export interface PageConfig {
  /** how the slide is scaled: CSS transform (subject), CSS zoom (workaround A), or laid out at final size (workaround B: unscaled overlay geometry) */
  mode: Mode;
  s: number;
  /** bubble menu placement: none | inside (TipTap default: appended to the editor's parent, i.e. inside the scaled slide) | body */
  bubble: 'none' | 'inside' | 'body';
  /** history owner: tiptap (UndoRedo / prosemirror-history), external (outside history via transaction hook), none (no history, no Mod-z binding) */
  hist: 'tiptap' | 'external' | 'none';
  /** plain contenteditable, no ProseMirror: the native Chromium control */
  native: boolean;
  /** use TipTap's built-in `textDirection: 'auto'` on every node (list direction experiment) */
  tiptapDir: boolean;
  /** drop the rotation of the rotated box (control for rotation-specific effects) */
  norot: boolean;
  /** keep StarterKit's TrailingNode extension (off by default in this spike) */
  trailing: boolean;
}

export function readConfig(search: string): PageConfig {
  const q = new URLSearchParams(search);
  const mode = (q.get('mode') ?? 'transform') as Mode;
  const s = Number(q.get('s') ?? '0.64');
  return {
    mode: mode === 'zoom' || mode === 'plain' ? mode : 'transform',
    s: Number.isFinite(s) && s > 0 ? s : 0.64,
    bubble: (q.get('bubble') ?? 'none') as PageConfig['bubble'],
    hist: (q.get('hist') ?? 'tiptap') as PageConfig['hist'],
    native: q.get('native') === '1',
    tiptapDir: q.get('tiptapDir') === '1',
    norot: q.get('norot') === '1',
    trailing: q.get('trailing') === '1',
  };
}
