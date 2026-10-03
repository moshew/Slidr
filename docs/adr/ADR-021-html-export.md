<div dir="rtl">

# ADR-021 — ייצוא HTML: קובץ יחיד מה-DOM החי

סטטוס: **הוכרע** · 2026-10-03 · משימות: WG9-T07, T08, T10, T11 · קוד: `packages/html-export/`, `packages/runtime/src/standalone.ts`, `apps/desktop/src/dev/runtime/`, `apps/desktop/e2e/runtime-export.spec.ts`

SPEC פרק 12: קובץ `‎.html` יחיד ועצמאי, שמתנגן בלי אינטרנט ואינו מכיל את המודל. לא נעשו כאן: T09 (הטמעת גופנים עם subset), T12 (דיאלוג הייצוא) ו-T13 (הערות דובר, CSS להדפסה).

## ההחלטה

1. **הייצוא מסדר את ה-DOM שה-renderer צייר, ולא מרנדר מחרוזת** (כפי ש-ADR-009 דרש). `exportHtml` מצייר את כל השקפים ב-`SlideRenderer` במצב `present` במיכל נסתר בגודל מלא, מחכה שהגופנים ייטענו ושהטקסט יימדד, וקורא `getHTML({ serializableShadowRoots: true })`. כך ה-`zoom` של טקסט מכווץ וה-shadow roots של אובייקטי `html` נכנסים לקובץ כמו שהם.
2. **אותו runtime, כסקריפט אחד בתוך הקובץ.** ה-bundle של `@slidr/runtime` (20 kB) נכנס כ-`<script>` בסוף ה-`body` ומפעיל את אותו נגן שהעורך משתמש בו (ADR-020).
3. **המודל לא בקובץ; האנימציות כן.** המעבר וציר הזמן של כל שקף כתובים כ-JSON בתכונות של ה-`<section>` שלו. זה כל מה שה-runtime צריך, והוא נשאר צמוד לשקף.
4. **נכסים נטענים כבייטים ונכנסים כ-data URI.** המארח נותן `loadAsset(asset)` שמחזיר `Blob`. בזמן הרינדור השקפים מקבלים כתובות `blob:`, כך שתמונות וגופני נכס באמת נטענים והמדידה נכונה. אחרי הסידור כל כתובת מוחלפת ב-data URI.
5. **החבילה תלויה ב-`@slidr/renderer` וב-React.** הייצוא הוא אחד מחמשת השימושים של `SlideRenderer` (SPEC 7.2), ולכן הוא מצייר בעצמו ולא מבקש מהמארח DOM מוכן.

## ה-API

<div dir="ltr">

```ts
exportHtml(deck, {
  loadAsset,        // (asset) => Promise<Blob | undefined>
  fontCss?,         // () => Promise<string>: @font-face rules for fonts that are not deck assets
  includeHidden?,   // default false
  pixelRatio?,      // default 2
  imageQuality?,    // default 0.9
}): Promise<{ html, bytes, slides, assets, warnings }>
```

</div>

- רץ בדפדפן (ב-webview של האפליקציה), לא ב-Node: הוא צריך layout.
- `assets` מדווח לכל נכס את הגודל המקורי, הגודל בקובץ והמידות. `warnings` מדווח על נכס שלא נקרא. דיאלוג הייצוא (T12) יציג את שניהם.

## מבנה הקובץ (T07, T10)

<div dir="ltr">

```html
<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8"> <meta name="viewport" ...> <title>...</title>
  <style>/* viewport, stage, .slide */</style>
  <style data-slidr-fonts>/* @font-face, from fontCss */</style>
  <noscript><style>/* the slides as a column */</style></noscript>
</head>
<body>
  <div class="slidr-viewport">
    <div class="slidr-stage" data-width="1920" data-height="1080">
      <section class="slide" data-slide="<id>" aria-roledescription="slide" aria-label="<name>"
               data-transition='{...}' data-timeline='[...]'>
        <div class="slidr-slide" data-slide-id="<id>" lang dir style="...">...</div>
      </section>
      ...
    </div>
  </div>
  <script>/* the runtime */</script>
</body>
</html>
```

</div>

- **כל שקף הוא `<section class="slide">`** (EXP-02) שעוטף את שורש השקף של ה-renderer, בלי לשנות אותו. שמות ה-class קבועים (EXP-11).
- **`lang` ו-`dir`** של המצגת על `<html>`; לכל פסקה ה-`dir` שלה (EXP-03).
- **כותרות אמיתיות.** פסקה בסגנון `display` או `title` הופכת ל-`<h1>`, ו-`heading` ל-`<h2>`. ה-renderer כותב את כל הסגנון של פסקה inline, כולל `margin`, גודל ומשקל, ולכן החלפת התג לא מזיזה את הטקסט. רשימות הן `<ul>` / `<ol>` כבר ב-renderer.
- **אובייקט `html` בלי scripts** הוא declarative shadow root; **עם scripts** הוא `iframe` עם `srcdoc` ו-`sandbox` (EXP-10). שדות `css` עוברים כמו שהם.
- **עד שה-runtime עולה** הבמה מוסתרת, כך ששקף לא מוקטן לא מהבהב. **בלי JavaScript** השקפים מוצגים כעמוד אחד לגלילה.
- **שקפים מוסתרים לא מיוצאים**, אלא אם ביקשו `includeHidden`. קובץ שמשתפים לא אמור להכיל מה שהוסתר. קישור לשקף שלא יוצא לא עושה דבר.
- **`muted` ועוצמת הקול** של וידאו ואודיו נכתבים כתכונות (`muted`, `data-volume`): React קובע אותם על האלמנט ולא ב-markup.

## נכסים (T08)

- **רק מה שבשימוש.** נטענים הנכסים שהשקפים המיוצאים מפנים אליהם (`referencedAssetIds`), ונכנסים לקובץ רק אלה שהכתובת שלהם באמת מופיעה ב-markup.
- **הקטנה לגודל המוצג (EXP-09).** לכל תמונה נמדדת התיבה הגדולה ביותר שהיא ממלאת, בפיקסלים של השקף, כולל חיתוך: תמונה שמוצג ממנה רבע צריכה את כל הפיקסלים שלה. הגודל מוכפל ב-`pixelRatio` (ברירת מחדל 2, כדי שתישאר חדה במסך 4K), ואף פעם לא מעל הגודל המקורי.
- **מה שאי אפשר למדוד נשאר בגודלו:** תמונה בתוך `iframe`, בתוך stylesheet, או רקע בפריסה חוזרת.
- **WebP.** PNG, JPEG, WebP ו-BMP מקודדים מחדש ב-canvas. GIF (שעשוי להיות מונפש) ו-SVG נכנסים כמו שהם.
  - PNG נבדק גם ב-lossless, ונשאר כזה אם זה עולה עד 20% יותר: גרפיקה שטוחה נדחסת כך היטב ושומרת על הקצוות, ותצלום לא.
  - אם הקידוד מחדש לא הקטין תמונה שלא הוקטנה, נשאר המקור.
- **וידאו, אודיו וגופני נכס** נכנסים כמו שהם.

## מדידות

מצגת הייחוס עם מעברים ואנימציות, 9 שקפים, מיוצאת מדף הפיתוח:

| מה | ערך |
|---|---|
| זמן ייצוא | 0.6 עד 1.4 שניות (NFR-07: 30 שקפים בפחות מ-10 שניות) |
| גודל הקובץ | 2.38 MB |
| מתוכו גופנים (45 קבצים שלמים, בלי subset) | 1.32 MB |
| מתוכו תמונות (3 תמונות, 16 מופעים) | 0.75 MB |
| מתוכו ה-runtime | 20 kB |
| תמונת נוף 2400×1600, מוצגת גם חתוכה לרבע | 99 kB ← 41 kB, נשארה 2400×1600 |
| תמונת אורך 1200×1600, מוצגת ברוחב 400 לכל היותר | 71 kB ← 17 kB, 800×1067 |
| פוסטר 1920×1080, מוצג ברוחב 720 | 65 kB ← 16 kB, 1440×810 |

**נאמנות:** כל אחד מ-9 השקפים בקובץ, במצב שבו כל האובייקטים נכנסו, הושווה פיקסל מול פיקסל לשקף שה-renderer מצייר בעורך (`/dev/slides.html`), ב-1920×1080. ההבדל הגדול ביותר הוא 0.012% מהפיקסלים (קידוד התמונות). **אותן אנימציות:** אותו צעד, בקובץ ובנגן החי, נותן את אותם keyframes, השהיות ומשכים בדיוק.

## בדיקות

- **9 בדיקות יחידה:** בניית המסמך (escaping, סדר, בלי שום הפניה חיצונית), כותרות, תכונות מדיה.
- **9 בדיקות Playwright.** המצגת מיוצאת מדף הפיתוח, נכתבת לדיסק, ונפתחת כקובץ (`file://`), בלי שרת:
  - אין בקשה אחת שיוצאת מהקובץ, אין `blob:` ואין `localhost` בתוכו;
  - `lang`, `dir`, כותרות, רשימות;
  - תמונות ב-WebP ובגודל הנכון;
  - השוואת פיקסלים מול העורך, ומול הנגן החי בסוף כל שקף (אחרי היציאות);
  - מקשים, צעדים, לחיצה, hash, קישור לשקף;
  - אותן אנימציות כמו בעורך;
  - מצגת RTL: `dir="rtl"`, שקף מוסתר לא יוצא, `start` מתהפך גם בקובץ;
  - בלי JavaScript השקפים מוצגים.
- **הקבצים נשארים ב-`packages/html-export/test-results/`** (לא ב-git): `reference-deck.html` הוא קובץ הבדיקה, ו-`reference-deck-rtl.html` הוא אותה מצגת במסמך RTL.

## לא נעשה, או ידוע כחסר

- **גופנים (T09).** `exportHtml` לא מטמיע את הספרייה המובנית. יש לו נקודת חיבור אחת, `fontCss`, שנקראת אחרי שהשקפים צוירו והגופנים שלהם נטענו. דף הפיתוח ממלא אותה בקבצים השלמים של הגופנים שהדף טען (`src/dev/runtime/fonts.ts`), כדי שקובץ הבדיקה ייראה נכון בכל מחשב. זה תחליף זמני: T09 צריך subset לתווים שבשימוש, שיוריד את 1.32 MB לעשרות kB.
- **נכס שמופיע כמה פעמים נכנס כמה פעמים.** תמונת הנוף של מצגת הייחוס מופיעה 12 פעמים, ולכן 41 kB הופכים ל-0.66 MB. במצגת אמיתית זה לוגו בכל שקף או רקע משותף. הפתרון המוצע: כל נכס פעם אחת כמשתנה CSS ב-`<head>`; רקעים מפנים אליו ב-`var()`, ולתמונות ה-runtime קובע `src` בעלייה. לא נעשה כי זה מוסיף ל-runtime תפקיד שאין לו בעורך; צריך החלטה.
- **CSP.** הרינדור משתמש בכתובות `blob:` לתמונות, לגופנים ולמדיה. ה-CSP של ה-webview הראשי (SEC-05) צריך להתיר `blob:` ב-`img-src`, `font-src` ו-`media-src`, אחרת גופן נכס לא ייטען והטקסט המכווץ יימדד לא נכון.
- **דפדפנים.** נבדק רק ב-Chromium (Edge). הקובץ נשען על declarative shadow DOM, על `@scope` (ב-`css` של שקף) ועל `zoom`, שקיימים ב-Firefox וב-Safari רק בגרסאות האחרונות. לא נבדק שם.
- **דפדפן שלא יודע לכתוב shadow roots** (`getHTML`) מייצא אובייקטי `html` ריקים, עם אזהרה. ב-WebView2 זה לא קורה.
- **גרפים** מיוצאים כ-placeholder, כמו ב-renderer, עד WG6.
- **אפשרויות הייצוא של EXP-08** (טווח שקפים, בלי אנימציות, מדיה בתיקייה נלווית), **הערות דובר ו-CSS להדפסה** (T12, T13).
- **`@keyframes` באותו שם בשני שקפים** מתנגשים בקובץ, כמו בעורך (ADR-009).
- **כפתור מסך מלא** קטן מופיע כשהעכבר זז, בשביל מסכי מגע שאין בהם מקש F. העיצוב שלו זמני.

## תלויות שהוצהרו

לא נוספה שום חבילה חדשה ל-`node_modules`.

- `packages/html-export/package.json` מצהיר עכשיו על `@slidr/renderer` ו-`@slidr/runtime` (workspace), ועל `react`, `react-dom` והטיפוסים שלהם, כמו ש-`@slidr/renderer` מצהיר. כולם כבר היו ב-workspace באותן גרסאות. ב-`pnpm-lock.yaml` השתנה רק ה-importer של `packages/html-export` (19 שורות).
- `packages/runtime` נשאר בלי תלויות. ה-bundle נבנה ב-Vite של האפליקציה (`pnpm --filter @slidr/runtime bundle`).

## השלכות

- **T12 (דיאלוג הייצוא):** קורא ל-`exportHtml` עם `loadAsset` שקורא את הקובץ מתיקיית ה-workspace, שומר את `html` דרך Tauri, ומציג את `assets` ואת `warnings`. צריך להוסיף את שתי החבילות ל-`apps/desktop/package.json`, ולבדוק את ה-CSP.
- **T09:** ממלא את `fontCss` מתוך החבילה: עובר על הטקסט המצויר, אוסף תווים לכל גופן, ומחזיר `@font-face` עם subset.
- **ייבוא חוזר (EXP-11, SPEC 14.5):** הקובץ שומר `data-element-id`, `data-name`, `data-slide`, `data-transition` ו-`data-timeline`, כך שמנוע ההמרה יכול לשחזר גם אנימציות. הבדיקה עצמה שייכת ל-WG9A.
- **WG6-T08 (גרפים חיים):** ספריית הגרפים תיכנס כ-`<script>` נוסף, רק כשיש גרפים.

</div>
