<div dir="rtl">

# ADR-008 — מערכת העיצוב ומעטפת האפליקציה

סטטוס: **הוכרע** · 2026-10-03 · משימות: WG3-T00 עד T06 · קוד: `packages/ui/`, `apps/desktop/src/shell/`, `apps/desktop/src/controls/`, `apps/desktop/src/i18n/`, `apps/desktop/src/dev/gallery/`

עדכון (2026-10-03, סגירת M1): נוספו T06 (בוררים ושדות), רישום קיצורי מקלדת, popover לכפתורי שורה A, `getEditor()` ושירות הנכסים. ראה "תוספות לסגירת M1" למטה.

שני חוזים מ-PLAN סעיף 3: ה-tokens ורכיבי הבסיס (תחילת M1), ורישום פאנלים וכלי Top Tools (אמצע M1). כל קבוצה שבונה ממשק נשענת עליהם. שינוי בהם מעדכן את המסמך הזה.

## ההחלטה

1. **ה-tokens** הם CSS custom properties בקובץ אחד, `packages/ui/src/theme.css`, בתוך `@theme static` של Tailwind 4. הסולמות של Tailwind (צבעים, רדיוסים, צללים, גדלי טקסט, גופנים, תנועה) מאופסים, ולכן מחלקה שאינה token פשוט לא קיימת: `bg-blue-500` לא מייצר CSS.
2. **כל צבע הוא זוג** `light-dark(בהיר, כהה)`, ו-`color-scheme` בוחר צד. ברירת המחדל עוקבת אחרי מערכת ההפעלה, ו-`data-theme="light" | "dark"` על אלמנט כלשהו מחליף את כל העץ שמתחתיו. החלפת ערכה היא שינוי של attribute אחד, בלי רינדור מחדש (DSN-02).
3. **הרכיבים** הם עטיפות דקות מעל Radix (החבילה `radix-ui`), עם ה-tokens. האייקונים הם Lucide, דרך `@slidr/ui/icons` (DSN-04).
4. **הרחבת המעטפת** היא רישום: פאנלים, כלים לשורה B ופעולות לשורה A. כל תחום רושם מקובץ `src/<area>/register.ts(x)` משלו, והמעטפת טוענת את כולם (`import.meta.glob`). אף תחום לא עורך את קוד המעטפת.
5. **i18n** ב-i18next: עברית ברירת מחדל, namespace לכל תחום, החלפה חיה שמשקפת את כל הפריסה.

## ה-tokens

שמות הצבעים מתחילים ב-`ui-`, כי ה-renderer קובע על שורש כל שקף את `--color-bg`, `--color-text`, `--color-accent` ושאר חוזה ה-Theme (RND-08). כך לשם אחד אין שתי משמעויות. בדיקה נכשלת אם צבע של הממשק מאבד את הקידומת או לוקח שם של חוזה השקף.

| קבוצה | tokens | מחלקה לדוגמה |
|---|---|---|
| משטחים | `ui-chrome` (שורת כותרת, Activity Bar, status bar), `ui-panel` (Top Tools, Tool Panel, Filmstrip), `ui-canvas` (מאחורי השקף), `ui-raised` (תפריטים, popover, דיאלוג), `ui-field` (שדות ומסילות), `ui-hover`, `ui-pressed` (שקופים), `ui-scrim`, `ui-thumb` | `bg-ui-panel` |
| טקסט וקווים | `ui-fg`, `ui-fg-muted` (שניהם AA על כל משטח), `ui-fg-subtle` (מושבת וקישוט בלבד), `ui-line`, `ui-line-strong` | `text-ui-fg-muted`, `border-ui-line` |
| הדגשה | `ui-accent`, `ui-accent-hover`, `ui-accent-pressed`, `ui-on-accent`, `ui-accent-soft`, `ui-accent-soft-hover`, `ui-accent-fg`, `ui-focus` | `bg-ui-accent` |
| מצב | `ui-danger`, `ui-danger-hover`, `ui-on-danger`, `ui-danger-fg`, `ui-danger-soft`, `ui-success-fg`, `ui-warning-fg` | `text-ui-danger-fg` |
| tooltip | `ui-tooltip`, `ui-on-tooltip` (הפוך לערכה, כדי שייקרא כשכבה אחרת) | |
| ריווח | `--spacing: 4px`, כלומר `p-2` הוא 8px. גדלים בשם: `control` 32, `control-sm` 28, `titlebar` 36, `caption` 46, `toolbar-a` 48, `toolbar-b` 44, `filmstrip` 132, `statusbar` 24, `activitybar` 56, `thumb-w` 176, `thumb-h` 99, `menu` 224, `popover` 288, `dialog` 440 | `h-control`, `w-activitybar` |
| רדיוס | `small` 4, `inset` 6 (פקד בתוך פקד של 8, כמו מקטע), `control` 8, `panel` 12, `full` | `rounded-control` |
| צל | `raised` (פקד מורם), `overlay` (כל מה שצף), `slide` (השקף על ה-Stage) | `shadow-overlay` |
| טיפוגרפיה | `font-ui`: ‏Inter ללטינית ואחריו Heebo לעברית, כגופנים משתנים מ-`@fontsource-variable` (ארוזים, בלי רשת). `text-xs` 12/16, `text-sm` 13/20 (ברירת המחדל), `text-md` 14/20, `text-lg` 16/24, `text-xl` 20/28. משקלים: normal, medium, semibold | `text-md font-medium` |
| תנועה | `--duration-fast` 120, `--duration-base` 160, `--duration-slow` 200; `ease-standard`, `ease-out`; `animate-overlay-in`, `animate-fade-in`, `animate-spin`, ומחלקת `skeleton`. `prefers-reduced-motion` מקצר הכול | `duration-(--duration-slow)` |

**כללים גלובליים** (ב-`@layer base`): טבעת מיקוד אחת, outline של 2px ב-`ui-focus`, על כל `:focus-visible` (DSN-08); פס גלילה מעוצב גם במקום שאין `ScrollArea`; צבע בחירת טקסט; `user-select: none` על הממשק (שדות טקסט חוזרים לבחירה). תפריט הקליק הימני של ה-webview חסום, חוץ משדות טקסט; בפיתוח Shift+קליק ימני פותח אותו בשביל Inspect.

**מצבים בגלריה.** הווריאנטים `hover:`, `active:`, `focus-visible:` ו-`focus-within:` עונים גם ל-`data-preview="hover" | "active" | "focus"`. כך הגלריה מציגה כל מצב בלי מצביע, והרכיבים כתובים כרגיל.

**נאכף בבדיקות.** `designRules.test.ts` סורק את `packages/ui` ואת `src/shell`: אין צבע מילולי, אין ערך שרירותי עם מספר (`w-[13px]`), אין ערך מילולי ב-`style`, אין `select` ואין `input` מסוג checkbox, radio, range, color או date, אין `title=` (tooltip של מערכת ההפעלה), ואין מאפיין פיזי (`ml-`, `pr-`, `left-`, `text-right`). `theme.test.ts` קורא את הזוגות מ-`theme.css` ובודק בשתי הערכות 4.5:1 לכל צירוף של טקסט ומשטח, ו-3:1 לטבעת המיקוד על כל משטח.

## הרכיבים

כולם ב-`@slidr/ui`, וכולם צריכים `<UiProvider dir>` פעם אחת מעליהם.

| רכיב | הערות |
|---|---|
| `Button` | `primary`, `secondary`, `ghost`, `soft` (גוון ההדגשה, לפעולות AI), `danger`; גדלים `sm` 28 ו-`md` 32; `icon`, `iconEnd`, `loading` |
| `IconButton` | `label` חובה: הוא ה-`aria-label` וה-tooltip. `shortcut`, `mirror`, `tooltipSide`. גם כשהוא מושבת ה-tooltip מופיע |
| `SegmentedControl`, `Toggle` | בחירה אחת מכמה, ומתג אייקון (מודגש). מקטע יכול להיות אייקון בלבד, עם tooltip |
| `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` | קו הדגשה מתחת ללשונית הפעילה |
| `Tooltip` | צדדים לוגיים: `start` ו-`end` מתהפכים עם הכיוון |
| `DropdownMenu*`, `ContextMenu*` | אותם פריטים: `icon`, `shortcut`, `hint`, `tone="danger"`; Checkbox, Radio, Label, Separator, Sub |
| `Popover`, `Dialog` | `DialogContent` עם `title`, `description`, `footer` ו-`closeLabel` |
| `Input`, `TextField` | אייקון, `end`, `invalid`; `TextField` מוסיף תווית ושורת הסבר או שגיאה |
| `NumberField` | מספר אחד: הקלדה חופשית, אישור ב-Enter או ביציאה מהשדה, חיצים מוסיפים `step` (Shift פי עשרה), `min`, `max`, `precision`, `unit`. `value: null` הוא בחירה מעורבת. המספר והיחידה תמיד משמאל לימין |
| `Select` | בחירה אחת מרשימה ארוכה מדי ל-`SegmentedControl`. `variant`: `field` (מסגרת של שדה) או `ghost` (בסרגל) |
| `Slider` | ערך אחד. `onValueCommit` בסוף גרירה, כדי לסגור צעד undo. `trackStyle` לפס מצויר (גוון), `dir` לפס שהוא פיזי ולא כמות |
| `ColorPicker`, `ColorSwatch` | תוכן של popover: בחירות בשם (צבעי התבנית), אחרונים, ריבוע רוויה ובהירות, פס גוון, פס אטימות, hex וטפטפת. הערך הוא hex; `onGestureEnd` בסוף גרירה או הקלדה |
| `FontPicker` | תוכן של popover: חיפוש, אחרונים, כל שם מצויר בגופן שלו, וסימון "אבג" לגופן שיש בו עברית. חיצים ו-Enter מהשדה |
| `Separator`, `Kbd`, `Skeleton`, `Spinner`, `Icon` | `Kbd` תמיד משמאל לימין; `Icon` בשני גדלים, 16 ו-18, ובקו אחיד |
| `EmptyState` | ריק (עם הנחיה ופעולה) ושגיאה (`tone="error"`) |
| `ScrollArea` | אנכי, אופקי או שניהם; פס דק שמופיע בריחוף, או תמיד |

`className` על רכיב הוא לפריסה בלבד (שוליים, רוחב). אין `tailwind-merge`, ולכן מחלקה שמתנגשת בווריאנט של הרכיב נותנת תוצאה לא מוגדרת: כשצריך מראה אחר, מוסיפים ווריאנט.

**הגלריה** (DSN-06): `/dev/gallery.html` בשרת הפיתוח. ארבעה תאים (בהירה וכהה, ימין לשמאל ושמאל לימין) בדף אחד, ו-`?theme=dark&dir=ltr` מציג אחד מהם. תפריטים, popover, tooltip ודיאלוג מוצגים פתוחים במקומם: הם מרונדרים בתוך קופסה עם transform, שהיא ה-containing block שלהם.

## המעטפת

- **פריסה.** בשורת flex הילד הראשון יושב בצד ה-start, ולכן אזור ה-AI (Activity Bar ו-Tool Panel) בימין בעברית ובשמאל באנגלית, וכל הפריסה מתהפכת עם `dir` של המסמך. ב-1920×1032: Stage של 1280×748 ושקף של 1232×693, כמו ב-SPEC 4.1. כל הגבולות בתוך הגובה הקבוע של האזור, כדי שהמספרים יצאו מדויקים.
- **רוחב הפאנל.** 584 ב-1920 ו-420 ב-1366, ובין לבין קו ישר. גרירה של המפריד שומרת את הרוחב כחלק מרוחב החלון, בטווח 25%–45%; חיצי מקלדת, Home ו-End עובדים על המפריד, ולחיצה כפולה מחזירה לברירת המחדל. קיפול מוריד את הרוחב ל-0 ב-200ms, והתוכן שומר על הרוחב שלו בזמן התנועה כדי שלא יזרום מחדש.
- **Stage.** `fitSlide()` ב-`shell/layout.ts` (UI-03). `StagePlaceholder` ו-`FilmstripPlaceholder` ב-`shell/Stage.tsx` שומרים את המקום: WG2 מחליף אותם ב-`Shell.tsx`, ושם המקום לשקף הוא `data-slot="slide"`. ה-Stage כותב את קנה המידה שלו ל-`useShell().viewScale`, והזום בשורה A ובשורת הסטטוס קורא אותו. הזום שבתפריט (התאמה, 50%, 100%, 200%) נשמר ב-`useShell().zoom`.
- **שורת כותרת** (DSN-03). `decorations: false`, ו-`data-tauri-drag-region` לגרירה ולהגדלה בלחיצה כפולה. כפתורי החלון בצד ה-end, כלומר בשמאל בעברית, כמו ב-Windows בעברית. הרשאות שנוספו ל-`capabilities/default.json`: `start-dragging`, `minimize`, `toggle-maximize`, `close`. כפתור הסגירה שואל על שינויים שלא נשמרו, סוגר את ה-workspace, ואז את החלון.
- **תפריט קובץ.** חדש, פתיחה, קבצים אחרונים (תת-תפריט), שמירה, שמירה בשם, דרך `DocumentService` ו-`@tauri-apps/plugin-dialog`. לפני שמשהו מחליף מסמך עם שינויים יש שאלה: לשמור, בלי לשמור, ביטול. מזהה ה-workspace נשמר ב-`sessionStorage`, כך שרענון של ה-webview פותח אותו שוב (ADR-007). בלי Tauri, בדפדפן רגיל, רק "חדש" פעיל.
- **Status bar.** שקף n מתוך סה"כ, זום, מצב שמירה (שומר, לא נשמר, נשמר, עוד לא נשמר), ו-placeholders למצב ה-Agent ולממצאי העיצוב.
- **קיצורים.** Ctrl+Z, Ctrl+Y ו-Ctrl+Shift+Z קוראים ל-`bus.undo()` ול-`bus.redo()`, חוץ מבתוך שדה טקסט. ועוד: Ctrl+N, Ctrl+O, Ctrl+S, Ctrl+Shift+S, Ctrl+0, Ctrl+1/2/3. במקלדת עברית הקיצור נקבע לפי המקש הפיזי. WG3-T07 יחליף את זה במערכת הקיצורים המלאה.
- **גישה מתחומים אחרים** (`src/shell/index.ts`): `useEditor()` (ה-bus, `DeckStore`, `SelectionStore`, `DocumentService`), `useDeck(selector)`, `useSelection(selector)`, `useFile(selector)`, `openPanel(id)`, `ask()` ו-`tell()` לשאלות מתוך קוד שאינו רכיב. בפיתוח `window.slidr` הוא ה-editor, לקונסולה ולבדיקות E2E.

## חוזי הרישום

```ts
// src/media/register.tsx: נטען לבד בעליית האפליקציה
import { Images } from '@slidr/ui/icons';
import { registerPanel, registerContextTool, registerAction } from '../shell';
import { registerMessages } from '../i18n';

registerMessages('media', { he: { title: 'מדיה' }, en: { title: 'Media' } });

registerPanel({
  id: 'media', kind: 'tool', slot: 'tools', order: 0,
  title: 'media:title', icon: Images, content: MediaPanel,
});

registerPanel({
  id: 'ai.slide', kind: 'ai', slot: 'ai', order: 1, shortcut: 'Ctrl+2',
  title: 'panels.aiSlide', icon: RectangleHorizontal,
  scope: 'slide', chat: SlideChat, actions: SlideActions,
});

registerContextTool({
  id: 'text.font', kinds: ['text'], group: 'font', order: 10, render: FontPicker,
});

registerAction('insert.image', () => pickAndInsertImage());
```

- **מזהה** ייחודי. רישום אמיתי מחליף placeholder עם אותו מזהה, בלי קשר לסדר הטעינה; placeholder לעולם לא מחליף רישום אמיתי. כל `register*` מחזיר פונקציה שמסירה את הרישום.
- **פאנל.** `slot`: `ai` (הקבוצה העליונה), `tools`, או `footer` (למטה, כמו הגדרות). `title` הוא מפתח i18n. פאנל `ai` מספק את `chat` ואת `actions`, ו-`scope` שלו (`deck`, `slide` או `object`) קובע את שבב ההיקף; המעטפת מציירת את הכותרת, את השבב ואת לשוניות צ'אט ופעולות (SPEC 4.3). פאנל `tool` מספק את `content`, והמעטפת מציירת כותרת וגלילה. המזהים שהמעטפת עצמה פונה אליהם: `PanelId` (`ai.deck`, `ai.slide`, `ai.object`, `settings`).
- **כלי בשורה B.** `kinds` מתוך `SelectionKind`: `none`, `text`, `image`, `shape` (כולל קו ו-SVG), `table`, `chart`, `media` (וידאו ואודיו), `html`, `group`, `multiple`. כלים עם אותו `group` יושבים יחד, ורווח מפריד בין קבוצות. `render` מקבל `{ kind }`. כפתור "AI" בסוף השורה שייך למעטפת.
- **פעולה בשורה A.** `insert.text`, `insert.image`, `insert.shape`, `insert.line`, `insert.table`, `insert.chart`, `insert.media`, `insert.icon`, `present`, `export`. כפתור שאין לו פעולה רשומה מושבת, עם tooltip.
- **ה-placeholders** ב-`shell/register.tsx`: שלושת כלי ה-AI, מדיה, אנימציות, שכבות, הערות דובר, בדיקת עיצוב, היסטוריה, ובשורה B (בלי בחירה) רקע, layout ומעבר. ההגדרות (ערכה ושפה) אמיתיות.

## i18n

- **מחרוזות המעטפת** ב-`src/i18n/he.ts`, שהוא מקור המפתחות, וב-`en.ts`, שהטיפוס שלו `Messages<typeof he>`: מפתח חסר או מיותר הוא שגיאת קומפילציה. ה-namespace הוא `shell`.
- **תחום אחר** רושם namespace משלו עם `registerMessages(ns, { he, en })`, שגם הוא דורש את אותם מפתחות בשתי השפות, וקורא עם `useTranslation(ns)` או עם המפתח `ns:key`.
- **מחרוזת חסרה היא באג.** אין שפת גיבוי (`fallbackLng: false`); מחרוזת חסרה נכתבת כ-`console.error`, ובדיקת העשן ב-E2E נכשלת עליה. `i18n.test.ts` בודק גם שכל מפתח שמופיע בקוד המעטפת קיים.
- **החלפת שפה** מעדכנת את `lang` ואת `dir` של `<html>` ומרנדרת מחדש כל `useTranslation`, בלי רענון. השפה נשמרת ב-`localStorage` (`slidr.language`).
- **כיוון.** רק מאפיינים לוגיים (`ms-`, `pe-`, `start-`, `border-e`, `text-start`). אייקון שיש לו כיוון מקבל `mirror`: undo ו-redo, חיצים, chevron של תת-תפריט, קיפול הפאנל. אייקוני מדיה (הצגה) לא מתהפכים, וגם קיצורי מקלדת לא.
- **ניסוח.** העברית פונה ברבים ("בחרו אובייקט"), שהיא פנייה ניטרלית למגדר. שם כל שפה כתוב בשפה עצמה ("עברית", "English").

## תוספות לסגירת M1

**רכיבים בלי שפה.** ל-`packages/ui` אין i18n, ולכן `ColorPicker` ו-`FontPicker` מקבלים את המחרוזות שלהם ב-`labels`. הם גם לא מכירים את המודל: הצבע הוא hex והגופן הוא שם משפחה.

**`packages/ui/src/color.ts`** הוא הקובץ היחיד במערכת העיצוב שכותב ערכי צבע (המרות HSV, פס הגוון, לוח השחמט שמאחורי צבע שקוף). בורר צבע עובד בכל צבע ולא ב-tokens. בדיקת כללי העיצוב פוטרת אותו בשמו.

**`src/controls`** מחבר את הבוררים למודל, לשימוש כל תחום שעורך את המצגת:

| מה | תפקיד |
|---|---|
| `ColorField` | כפתור בסרגל שפותח את בורר הצבע. הערך הוא `Color` של המודל. צבע שנבחר מהתבנית נשמר כ-token, ולכן ממשיך לעקוב אחרי התבנית; שינוי של האטימות בלבד משאיר אותו token. `mixed`, `allowNone`, `alpha`, `icon` (אייקון מעל פס בצבע, כמו בצבע טקסט), `onCloseAutoFocus` (להחזיר מיקוד לעורך הטקסט) |
| `FontField` | כפתור שפותח את בורר הגופן: הספרייה המובנית (נספח ב') והגופנים שהמצגת נושאת כנכסים |
| `useGestureTx()` | צעד undo אחד למחווה רציפה על פקד (גרירה בבורר הצבע, מחוון): כל שינוי נשלח עם `txId: tx.id()`, ו-`tx.end()` נקרא כשהפקד מדווח על סוף המחווה |
| `useRecent` | צבעים וגופנים אחרונים, ב-`localStorage` (`slidr.recent`): למחשב, לא למצגת |
| `colorToHex`, `hexToColor`, `pickedColor`, `cssToRgba` | `Color` של המודל מול hex. token נקרא מה-Theme; תחביר CSS שאינו hex מפוענח על ידי הדפדפן |

**חוזי רישום חדשים** (`src/shell/registry.ts`):

```ts
// קיצור מקלדת. אותיות, ספרות וסוגריים לפי המקש הפיזי, כך שהם עובדים גם במקלדת עברית.
registerShortcut({
  id: 'arrange.duplicate', keys: 'Ctrl+D',
  run: (editor, event) => duplicateSelection(editor),   // false = לא היה על מה לפעול
  inText: false,                                        // ברירת מחדל: לא בזמן הקלדה
});

// כפתור בשורה A שפותח popover במקום לפעול מיד (ספריית הצורות).
registerActionPopover('insert.shape', ShapeLibrary);    // הרכיב מקבל { close }
```

- **סדר הקיצורים.** קודם הקיצורים של המעטפת עצמה, אחר כך הרשומים, האחרון שנרשם ראשון. קיצור שמחזיר `false` מעביר את המקש הלאה. מקש שרכיב כבר טיפל בו (`defaultPrevented`) לא מגיע לקיצורים.
- **`getEditor()`** נותן את ה-editor לקוד שאינו רכיב: פעולה של שורה A, קיצור. רכיבים ממשיכים עם `useEditor()`.
- **שורה B בזמן עריכת טקסט בצורה** היא של `text` ולא של `shape`: הסמן בתוך טקסט, ולכן כלי הטקסט הם הנדרשים.
- **`editor.assets`** (`AssetService`): `import(file)` מחזיר `AssetMeta`, ו-`url(asset)` נותן ל-renderer מאיפה לטעון. באפליקציה הנכסים ב-workspace; בדפדפן רגיל (דף Vite, Playwright) הם בזיכרון, כך שתמונות נבדקות גם ב-E2E. מי שמייבא שולח `asset.add` באותו batch של האובייקט שמשתמש בנכס.
- **`editingElementId`** הוא "האובייקט שנערך במקומו": טקסט של תיבה או של צורה, וחיתוך של תמונה (ADR-016).

**בדיקת כללי העיצוב** סורקת עכשיו גם את `src/controls`, `src/text`, `src/objects` ו-`src/arrange`. פטורים: דפי הפיתוח, ומה שמצויר על השקף עצמו בפיקסלים של שקף או של מסך (`src/stage`, עורך הטקסט שבתוך השקף).

**שחזור וסגירה** (DOC-03): בעליית האפליקציה, אם קריסה השאירה workspaces עם שינויים שלא נשמרו, דיאלוג מציע לשחזר או למחוק אותם. סגירת החלון מכל דרך (Alt+F4, שורת המשימות, כפתור הסגירה) שואלת על שינויים שלא נשמרו.

## חלופות שנבחנו

- **בלוק `[data-theme=dark]` שמשכפל כל token.** שתי רשימות שמתרחקות זו מזו. `light-dark()` שם את שני הערכים באותה שורה, ומאפשר לגלריה להציג את שתי הערכות בדף אחד.
- **העתקת רכיבי shadcn/ui.** הקוד היה הופך לשלנו בכל מקרה; העטיפות כאן קטנות יותר, ובנויות מראש על ה-tokens שלנו.
- **רשימת import מפורשת של קובצי הרישום.** כל תחום חדש היה עורך את המעטפת. `import.meta.glob` לא דורש עריכה.
- **מפתחות i18n מוקלדים דרך `CustomTypeOptions`.** הם חוסמים namespace לכל תחום, כי אי אפשר למזג את `resources` מכמה מקומות. במקומם: טיפוס `Messages`, בדיקה, ושגיאה בזמן ריצה.

## מה לא נעשה

- **גופני מערכת** בבורר הגופן (WG2-T02): רק הספרייה המובנית וגופני המצגת.
- **T07, T08:** מפת הקיצורים המלאה ושינוי קיצורים; מסך ההגדרות המלא ו-keychain למפתחות (נדרש רק מ-M4, לספק `openai-api`).
- **Snap Layouts של Windows 11** על כפתור ההגדלה דורש hit-testing של מערכת ההפעלה (`WM_NCHITTEST`), ואין אותו בשורת כותרת של ה-webview.
- **תפריט קליק ימני בשדות טקסט** הוא עדיין של הדפדפן.
- **ניגודיות של מסגרות פקדים.** המסגרת של שדה מול המשטח שלו פחות מ-3:1. שדה מזוהה גם במילוי, במסגרת ובתווית שלו; הטקסט עצמו עובר AA.
- **השוואת צילומים.** הצילומים ב-`test-results/wg3/` נכתבים כדי שיסתכלו עליהם, ואינם מושווים לבסיס. תמונות הבסיס יגיעו עם הרגרסיה הוויזואלית של WG13.
- **שורה A מושבתת ברובה** (הוספה, הצגה, ייצוא) עד ש-WG2, WG5, WG8 ו-WG9 ירשמו פעולות. ה-Filmstrip הזמני מוסיף שקף ריק, בלי בחירת layout.
- **הגדרות הממשק** (ערכה, רוחב הפאנל, הפאנל הפתוח) נשמרות ב-`localStorage` (`slidr.shell`) עד שהגדרות האפליקציה (T08) יקבלו מקום.

## השלכות

- **כל קבוצה:** ממשק נבנה מ-`@slidr/ui` ומה-tokens בלבד; אייקונים מ-`@slidr/ui/icons`; מחרוזות בשתי השפות; תחום חדש נרשם מ-`src/<area>/register.tsx`.
- **WG2:** מחליף את `StagePlaceholder` ואת `FilmstripPlaceholder` ב-`Shell.tsx`, משתמש ב-`fitSlide`, כותב את `viewScale` ומכבד את `zoom` של `useShell`, ורושם את פעולות ההוספה.
- **WG11:** רושם את `ai.deck`, `ai.slide` ו-`ai.object` עם `chat` ו-`actions`; הכותרת, השבב והלשוניות כבר קיימים.
- **WG13:** בודק בשער העיצוב את הצילומים של `e2e/wg3-visual.spec.ts`, ויכול להפוך אותם לתמונות בסיס.
- **SPEC:** UI-01 אומר "הפאנל בטווח 25%–45% מרוחב החלון". מומש על ה-Tool Panel בלבד, בלי ה-Activity Bar; שתי ברירות המחדל (584 ו-420) בתוך הטווח בכל קריאה.

</div>
