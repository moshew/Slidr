<div dir="rtl">

# ADR-069 — תיקונים בענן: הפגמים שהמאגר רושם, מה שנשאר לא בנוי, וחיפוש פגמים חדשים

סטטוס: **נבנה ונבדק בקונטיינר Linux; לא רץ ב-Windows, לא בחלון של Tauri ולא מול ה-CLI האמיתי. ההכרעות שתחת "החלטות שמחכות לך" מחכות לך** · 2026-10-05 · ענף: `cloud-fixes-1` (יצא מ-`42c4057`), draft pull request · משימות: A1 עד A15 של התדריך והפגמים הפתוחים שברשימות הסגירה של ADR-036 ואילך; B1 עד B7 (WG13-T06 בחלקו, UI-06, ADR-057, FLM-04, AIO-09, ADR-040, ADR-033); חיפוש פגמים

הענף עבד בלי Windows: קונטיינר Linux, Edge 154 ל-Linux, Rust שנבנה אחרי התקנה של ספריות המערכת. כל שינוי כאן נבדק בבדיקה שנכשלה לפניו; מה שלא יכולתי לבדוק כתוב בפרק "מה לא נבדק", עם הדרך לבדוק אותו אצלך.

**ארבעה דברים לדעת לפני הכול:**

1. **הדפדפן הוא Edge, ל-Linux.** `channel: 'msedge'` נשאר כמו שהוא בכל הקונפיגורציות, ולא נוסף override. 22 צילומי הבסיס (`*-win32.png`) הם של Windows: לא הושוו ואף אחד מהם לא עודכן, ואף צילום של Linux לא נכנס ל-commit (Playwright כתב כאלה כקבצים לא עקובים, והם נמחקו; ראה "על הסביבה"). שינוי שמשנה איך שקף מצויר לא נעשה; מה שדרש שינוי כזה נרשם כממצא פתוח (ממצא 1).
2. **נוסף command אחד למודל, `asset.remove`, ונוסף רישום אחד ל-shell, `registerSlideMark`.** שניהם תוספות לחוזים משותפים; כל התוספות בפרק "תוספות לחוזים משותפים".
3. **שלושה ממצאים נשארו פתוחים בכוונה, כבדיקות שמסומנות ככישלון צפוי** (`it.fails`): שניים בניסוח של `packages/prompts`, שרק סט ההערכה שופט, ואחד שמשנה איך גרף מצויר.
4. **B5 (עריכת המתווה בכרטיס) לא נבנה.** כדי שמתווה שנערך יגיע ל-Agent צריך לשנות את הניסוח של `outline.approve` ב-`packages/prompts`. ראה "מה דילגתי עליו".

## ההחלטה

1. **`asset.remove` מסרב לנכס שהמצגת עוד משתמשת בו**, ולא מוחק את האובייקטים שמשתמשים בו. "בשימוש" הוא מה ש-`referencedAssetIds` אומר: כל שדה, HTML או CSS חופשי שנוקב בו, וכל גופן. הכול או כלום; הקובץ נשאר ב-workspace, ו-undo מחזיר את הנכס כמו שהיה. בפאנל המדיה, תמונה שבשימוש לא נמחקת, והמשתמש שומע למה.
2. **אובייקט שנגרר נעצר בקצה ה-Stage**, ואובייקט נבחר נתפס גם בחלק של המסגרת שלו שמחוץ לשקף, שהשקף לא מצייר. כך אובייקט לא נגרר אל מתחת לפאנל הכלים, ואובייקט שכבר שם נתפס בחזרה. על השקף הבחירה נשארת לפי מה שמצויר: קו נתפס בקו שלו, לא בתיבה שסביבו.
3. **Alt+F10 מעביר את המקלדת לסרגל שליד הבחירה.** זה הקיצור של Office לסרגל צף; ה-Tab כבר הולך בין האובייקטים של השקף.
4. **Ctrl עם חץ מזיז את השקפים הנבחרים ב-Filmstrip**, Ctrl+Home ו-Ctrl+End לקצוות. כל לחיצה צעד undo אחד, ולחיצה בקצה אינה צעד.
5. **קישור של שקף נפתח רק ל-`http`, `https`, `mailto` ו-`tel`**, בהצגה, בקובץ המיוצא וב-href שה-renderer כותב. אלה הכתובות שכלי הקישור של האפליקציה כותב; כל קישור אחר מצויר כטקסט שלו.
6. **מספר השקף בקובץ המיוצא הוא המספר שלו במצגת**, גם בטווח שקפים וגם אחרי שקף מוסתר, כמו ב-Stage ובמצב הצגה.
7. **וריאנט של רקע התבנית שנערך משנה גם את השקפים שבחרו אותו**, באותו צעד undo: שקף שבחר וריאנט מחזיק עותק שלו, וההשוואה היא לוריאנט כמו שהיה. וריאנט שהוסר נשאר בשקפים שיש להם אותו, כרקע שלהם.
8. **היסטוריית החלופות (AIO-09) היא של החלון, לא של הקובץ:** עד תשעה סטים קודמים לכל יעד, לצד החדש, כל עוד החלון פתוח. סגירת הגלריה של יעד מסיימת את ההיסטוריה שלו. ADR-045 דחה שמירה של חלופות בתמלול; שמירה בקובץ היא שינוי סכמה, ולכן לא נעשתה.
9. **הוספה של שורות ועמודות מוסיפה כמה שנבחרו** (כמו ב-Word), וטבלה שנבחרה כאובייקט מקבלת אחת. החצים מעלה ומטה עוברים לתא שמעל או מתחת רק מהשורה הראשונה או האחרונה של הטקסט, וה-caret שומר על המקום לרוחב.
10. **לא נוספה תלות, לא השתנו `package.json`, `pnpm-lock.yaml`, `Cargo.toml` (חוץ מהערה) ו-`Cargo.lock`, ולא הועלה תקציב גודל של prompt.**

## מה נבנה

| קובץ | מה |
|---|---|
| `packages/model/src/commands/deck.ts`, `index.ts` | `asset.remove` (B2) |
| `apps/desktop/src/media/UploadsTab.tsx`, `parts.tsx` | הסרת תמונה מהפאנל, בכפתור וב-Delete (B2) |
| `apps/desktop/src/shell/registry.ts`, `index.ts`, `FilmstripRegion.tsx`; `src/stage/Filmstrip.tsx` | `registerSlideMark`, והפינה של הסימן בתמונה הממוזערת; Ctrl+חץ, גלגלת, מעבר מיידי (B3, B1, A15) |
| `apps/desktop/src/lint/SlideMark.tsx`, `register.tsx` | הסימן של בדיקת העיצוב (B3) |
| `apps/desktop/src/ai/variations.ts`, `Gallery.tsx` | ההיסטוריה של החלופות (B4) |
| `apps/desktop/src/templates/ThemeLook.tsx`, `themeLook.ts`, `TemplatesPanel.tsx` | השדות החדשים של עורך התבנית (B6) |
| `apps/desktop/src/table/stage.tsx`, `tools.tsx`; `packages/renderer/src/tableStyle.ts` | חצים בין תאים, ריפוד, כמה שורות (B7); `CELL_PADDING` |
| `apps/desktop/src/stage/Stage.tsx`, `SelectionToolbar.tsx`, `keys.ts`; `src/shell/StageRegion.tsx`; `src/text/TextEditor.tsx` | Alt+F10, השם וה-status של ה-Stage, Shift+Enter (B1); עצירה בקצה ה-Stage (A15); Ctrl+A בכל פריסה (ממצא 12) |
| `packages/runtime/src/controls.ts`, `packages/renderer/src/text.tsx`, `elements.tsx` | קישור מהמקלדת בהצגה, ורק לכתובות בטוחות (B1); ה-bundle של ה-runtime נבנה מחדש |
| `packages/prompts/src/template.ts`; `packages/templates/src/builtin/index.ts` | חוזה התפקידים במדריך התבניות (A2); ייצוא של `OPTIONAL` |
| `packages/agent-tools/src/tools/deck.ts` | `frame` חלקי ב-`deck_apply_ops` (A3) |
| `apps/desktop/src/export/ExportDialog.tsx`; `packages/html-export/src/exportHtml.ts` | הדוח והתיאור של הייצוא (A4); מספר השקף בקובץ (ממצא 4) |
| `apps/desktop/src/objects/menu.tsx`, `replace.ts`; `src/media/clipMenu.tsx` | הפריטים החדשים בתפריט הקליק הימני (A5) |
| `packages/ui/src/components/button.tsx`, `overlay.tsx`, `number-field.tsx`, `tooltip.tsx`, `theme.css` | A9, וממצא 9 |
| `apps/desktop/src-tauri/src/harness/claude_code.rs`, `image_providers/exact_edit.rs` | ממצאים 7 ו-8 |
| `apps/desktop/src/media/icons/search.ts`, `src/arrange/LayersPanel.tsx`, `src/animations/model.ts`, `AnimationsPanel.tsx` | ממצאים 11, 13 ו-14 |
| `docs/reference-decks/scripts/ledger.mjs`, `picture.mjs`; `apps/desktop/scripts/import/run-set.mjs` | A13, A12 |
| `apps/desktop/e2e/a11y-keys.spec.ts`, `stage-reports.spec.ts`, `table-more.spec.ts`, `editor-key-layouts.spec.ts`, `objects-menu.spec.ts`, `objects-keys.spec.ts`, `editor-ui-buttons.spec.ts`, ועוד | הבדיקות; ראה כל משימה |

## תוצאות לפי משימה (להדבקה ב-PLAN)

### A. הפגמים שהמאגר רושם

**A1, רבים בעברית:** תוקן. ל-`draft.layouts` ול-`draft.errors` של התבניות נוספה צורת `_two` ("שתי פריסות"); בלעדיה מספר 2 הציג את המפתח עצמו. `src/i18n/plurals.test.ts` קורא את כל טבלאות המחרוזות של האפליקציה, מחזיק כל מפתח רבים בעברית ל-`_one`, `_two` ו-`_other` ובאנגלית ל-`_one` ו-`_other`, ומפעיל כל מחרוזת עם `count` במספרים 0 עד 100 בשתי השפות. נמצא רק הזוג הזה.

**A2, חוזה התפקידים במדריך התבניות של ה-Agent:** תוקן. `packages/prompts/src/template.ts` כותב עכשיו את הרשימה מ-`TEMPLATE_ROLES` ומ-`TEMPLATE_OPTIONAL_ROLES`, ו-`src/templates/roleContract.test.ts` מחזיק אותם שווים ל-`ROLE_CONTRACT` ול-`OPTIONAL` ובודק שהשורות מופיעות ב-prompt של סשן מצגת. ה-prompt של סשן מצגת: 40,873 תווים מתוך 41,250; של סשן ייבוא: 43,787 מתוך 44,250. התקציב לא הועלה.

**A3, `deck_apply_ops` ו-`frame` חלקי:** תוקן. כל `frame` של `element.update` מושלם מהאובייקט כפי שהפעולות הקודמות באותו batch משאירות אותו, על bus זמני מעל אותה מצגת; פעולה שעדיין לא תקינה נדחית כמו קודם, עם האינדקס שלה. בדיקה ב-`agent-tools`.

**A4, דיאלוג הייצוא:** תוקן. לדוח יש שורה לגרפים כשיש גרף (כמה, ומה משקל ספריית הגרפים), והתיאור אומר שהמדיה הולכת לתיקייה ליד הקובץ כשזה מה שקורה, לפני הייצוא ובדוח. E2E ב-`runtime-export-dialog.spec.ts`.

**A5, תפריט הקליק הימני של ה-Stage:** תוקן. "החלפת תמונה", "עריכת הקוד", "פירוק לאובייקטים" (או למה אי אפשר), ו"ניגון בלולאה" ו"השתקה" של קליפ, כל אחד בקבוצה של הדרך של האובייקט עצמו (20 עד 29) וכל אחד צעד undo אחד כמו הכפתור של שורה B. `objects-menu.spec.ts`.

**A6, קיצורים בלי שם:** תוקן. הקיצורים של `arrange`, `present` ו-`ai` נושאים `label` ו-`section`, והטבלה `named` ב-`shell/shortcutList.ts` נמחקה. `shell/shortcuts.ts` לא נגע.

**A7, `animations/preview.ts`:** תוקן; משתמש ב-`stageSlide()` של ה-shell.

**A8, `Field` מקומי ו-`Toggle` עם תווית:** תוקן ב-`objects/parts.tsx`, `animations/parts.tsx`, `table/tools.tsx`, `templates/TemplatesPanel.tsx`, `templates/DraftCard.tsx` ודיאלוג הייצוא; `arrange/PlacementTool.tsx` לא נגע. ארבעה specs שמצאו את המתגים כ-toggles מוצאים אותם עכשיו כ-checkboxes, וספירת הצירים ב-`chart-options.spec.ts` נעשית לפי השם שלהם, כי גם השדות שבתוכם הם עכשיו קבוצות. אף בדיקה לא הוחלשה.

**A9, `packages/ui`:** תוקן. כפתור שנעשה disabled כשיש לו מיקוד שומר עליו (`aria-disabled`) עד שהמיקוד עוזב; ל-`IconButton` יש מראה לחוץ עם `aria-pressed`; ל-`DialogContent` יש גודל שני (`wide`, 720px) במקום `w-180!`; `NumberField` מקבל `data-testid`. `editor-ui-buttons.spec.ts`, והגלריה של מערכת העיצוב מציגה כל אחד.

**A10, `designRules.test.ts` כפולים:** נעשה. זה של `lint` נמחק; זה של `import` נשאר רק בבדיקת המחרוזות שלו, כ-`import/messages.test.ts`.

**A11, הפניות והערות ישנות:** תוקן, כהערות בלבד (גם ב-`Cargo.toml` וב-Rust). בדיקה חדשה מחזיקה כל קובץ ADR שנזכר בקוד לקובץ שקיים.

**A12, `run-set.mjs`:** תוקן. התיקייה באה מ-`--examples` או מ-`SLIDR_IMPORT_EXAMPLES`; בלעדיה ארבעת הקבצים מדולגים עם שורה שאומרת איך לתת אותה.

**A13, סקריפטי מצגות הייחוס:** תוקן. כל רשומה נכתבת ל-ledger תחת נעילה (`scripts/ledger.mjs`), ו-`index.html` נבנה זהה בכל הרצה (מזהים לפי סדר ההופעה). `index.html` עצמו לא נבנה מחדש.

**A14, התאמה בהערות הדובר:** תוקן. מעבר להתאמה בהערות פותח את פאנל ההערות של השקף; המקלדת נשארת בסרגל החיפוש.

**A15, שני הדיווחים של ADR-066:** שניהם שוחזרו ותוקנו. גלגלת אנכית מעל ה-Filmstrip לא עשתה דבר; עכשיו היא מריצה אותו, בשני הכיוונים של הממשק. אובייקט שנגרר מעבר לקצה ה-Stage נחת מתחת לפאנל הכלים; עכשיו הגרירה נעצרת בקצה, ואובייקט נבחר נתפס גם בחלק שמחוץ לשקף. `stage-reports.spec.ts`.

**מהרשימות של ADR-036 ואילך:** תוקנו שבעה (ממצאים 4 עד 9, שבהם 5 ו-6 הם A15, ו-15, כחלק מ-B1), ושלושה נרשמו כפתוחים, כבדיקות של כישלון צפוי (ממצאים 1 עד 3). השאר כבר תוקנו, שמורים, או מחכים להחלטה.

### B. מה שלא נבנה

**B1, מקלדת ונגישות (WG13-T06 בחלקו, UI-06):** נעשה מה ש-ADR-060 פרק 3 מונה. Shift+Enter שובר שורה בתוך פסקה; Alt+F10 מגיע לסרגל הצף, והחצים, Home ו-End נעים בו; Ctrl עם חץ, Ctrl+Home ו-Ctrl+End מזיזים שקפים ב-Filmstrip; קישור בשקף הוא עצירה של Tab עם `role="link"` בהצגה ובקובץ המיוצא, ו-Enter פותח אותו. ה-Stage הוא `application` עם שם ("שקף 3 מתוך 8"), ולידו status שאומר מה נבחר. ה-Filmstrip זז מיד כשהמערכת מבקשת פחות תנועה. `a11y-keys.spec.ts`, `editor-text-links.spec.ts`, ובדיקות ב-runtime וב-renderer. ב-`Stage.tsx` לא נגעתי בהתנהגויות השמורות.

**B2, `asset.remove`:** נעשה. command חדש עם בדיקת undo/redo; בפאנל המדיה, לכל תמונה של המצגת כפתור הסרה (בריחוף ובמיקוד) ו-Delete על האריח. ההחלטה בפרק "ההחלטה", סעיף 1. `media-panel.spec.ts`.

**B3, FLM-04:** נעשה. סימן ליד המספר של שקף עם ממצאי עיצוב, מתחת לתמונה הממוזערת (לא עליה, כדי שהתמונה תישאר השקף כפי שהוא מצויר): אדום לשגיאות, ענבר לאזהרות, בלי סימן להערות (כמו בשורת המצב). קורא מסך שומע את המספר כתיאור של התמונה. הסימן נרשם דרך רישום חדש של ה-shell, `registerSlideMark`, כך שה-store של בדיקת העיצוב נשאר בתוך `src/lint`. `design-check.spec.ts`.

**B4, AIO-09:** נעשה. הסטים הקודמים של יעד נשמרים לצד החדש (עד תשעה), והגלריה עוברת ביניהם בחצים ("סט 2 מתוך 3"); כרטיס של סט קודם נצפה ונבחר כמו כרטיס של החדש, כצעד undo אחד. סט חדש מציג את עצמו גם כשהמשתמש חזר אחורה. בדיקות ב-`variations.test.ts` וב-`aitools-gallery.spec.ts`, מול ה-Agent המדומה.

**B5, עריכת המתווה בכרטיס:** לא נעשה. ראה "מה דילגתי עליו".

**B6, השדות החסרים של עורך התבנית (ADR-040):** נעשה. פלטת הגרפים (שינוי, הוספה עד 12 והסרה עד אחד), גובה שורה וריווח אותיות לכל סגנון טקסט, עיגול פינות וצל (הזזה, טשטוש, התפשטות וצבע), ורקע התבנית והווריאנטים שלו (צבע, מעבר או תמונה; הוספה והסרה). כל עריכה `theme.update` וצעד undo אחד. `themeLook.test.ts` ו-`templates-panel.spec.ts`.

**B7, טבלאות (ADR-033):** נעשה. חץ למעלה מהשורה הראשונה של הטקסט ולמטה מהאחרונה עובר לתא שמעל או מתחת בזמן הקלדה, עם ה-caret באותו מקום לרוחב (גם בתא ממוזג); כלי "ריפוד התאים" בשורה B (לרוחב ולגובה, לתאים הנבחרים); והוספה של כמה שורות או עמודות כמספר הנבחרות, משורה B ומתפריט הקליק הימני. `table-more.spec.ts`, כולל בדיקה ששורה B של טבלה נכנסת ב-1366.

### C. חיפוש פגמים

**C:** חמישה ממצאים חדשים, כולם תוקנו, כל אחד עם בדיקה שנכשלה לפני התיקון (ממצאים 10 עד 14, למטה). חיפשתי בעומק במקומות שהתדריך מנה: הקיצורים לפי מקש פיזי (AZERTY, QWERTZ, AltGr), פאנל השכבות, הסדר של האנימציות בגרירה וב-Alt+חץ, חיפוש האייקונים בעברית, ה-Filmstrip, ומה העורך עושה עם מצגת שה-Agent רוקן מכל השקפים. המצגת הריקה מתנהגת כמו שצריך (מצב ריק ב-Stage ובפאנל, "אין שקפים להציג" בהצגה, כלי ההוספה לא עושים דבר) ולא נרשמה כממצא. במעבר הצבעים של `FillEditor`, ב-`fontsMatch.ts` ובזום עם הגלגלת קראתי את הקוד ולא מצאתי פגם שבדיקה הראתה.

## הממצאים

המספר הוא זה שבהערות של הבדיקות ("ADR-069, ממצא N"). ממצאים 1 עד 9 ו-15 באו מרשימות הסגירה של ADR-036 ואילך; 10 נמצא בדרך, בעבודה על B1; 11 עד 14 בחיפוש. כל אחד נבדק בבדיקה שהראתה את ההתנהגות השגויה לפני התיקון.

| # | מה | חומרה | הבדיקה | תוקן? |
|---|---|---|---|---|
| 1 | עמודות של גרף מעוגלות (3px) גם בתבנית שהפינות שלה ישרות (ADR-063) | נמוכה: מראה | `packages/renderer/src/chart/option.test.ts`, `it.fails` | לא. התיקון משנה איך גרף מצויר, ורק צילומי הבסיס של Windows שופטים את זה |
| 2 | שתי תבניות פעולה ומודול המצגת מבקשים מה-Agent לכתוב את סגנון התמונות והפלטה לתוך ה-prompt, והכלי מוסיף אותם בעצמו (ADR-051): הסגנון נאמר פעמיים בכל prompt של תמונה | בינונית | `packages/prompts/src/imageRules.test.ts`, `it.fails` | לא: ניסוח של `packages/prompts` |
| 3 | בסשן אובייקט חסר הכלל "לא לקרוא שוב ל-`image_generate` אחרי timeout" (ADR-045); בקשה במילים משלו מייצרת כל תמונה פעמיים | נמוכה | אותו קובץ, `it.fails` | לא: ניסוח של `packages/prompts` |
| 4 | בקובץ המיוצא מספר השקף מתחיל מ-1 בטווח, ומדלג על שקף מוסתר, בניגוד ל-Stage ולמצב הצגה (ADR-063, "מה לא נבדק") | בינונית | `packages/html-export/src/slideNumber.browser.test.ts` | כן |
| 5 | גלגלת אנכית מעל ה-Filmstrip לא עושה דבר (ADR-066, ממצא 6) | בינונית | `stage-reports.spec.ts` | כן |
| 6 | אובייקט שנגרר מעבר לקצה ה-Stage נוחת מתחת לפאנל הכלים, וידיותיו לא נתפסות (ADR-066, ממצא 7) | בינונית | `stage-reports.spec.ts` | כן |
| 7 | התור הראשון אחרי תהליך Agent שנהרג מוצג בלי עלות (ADR-066, "מה לא נעשה") | נמוכה: תצוגה | `claude_code.rs`, בדיקת Rust | כן, חלקית: תור ראשון שעולה יותר מכל מה שלפניו עדיין נקרא כהפרש |
| 8 | עריכה מדויקת (`exact_edit`) של תמונה שצולמה לרוחב מתעלמת מכיוון ה-Exif: המסכה נופלת על הפיקסלים הלא מסובבים (ADR-057, ממצא 13) | גבוהה לתמונות מטלפון | `exact_edit.rs`, בדיקת Rust על JPEG עם Exif 6 | כן |
| 9 | אחרי סגירת בורר הצבע, ה-tooltip של הדוגמית לוקח את ה-Esc הראשון, וצריך עוד אחד כדי לסגור את ה-popover (ADR-060) | נמוכה | `objects-keys.spec.ts` | כן |
| 10 | צעד ה-undo של גרירת שקפים ב-Filmstrip נקרא "Reorder slides", באנגלית, בקוד | נמוכה | `a11y-keys.spec.ts` (שם הצעד בשתי השפות) | כן |
| 11 | חיפוש האייקונים לא מוצא רבים של ארבע אותיות: "עטים", "פחים", "סלים" לא מוצאים דבר. סיומת הרבים הוסרה רק ממילים של יותר מארבע אותיות, אף שההערה בקוד נותנת את "חצים" כדוגמה | נמוכה | `media/icons/icons.test.ts` | כן |
| 12 | Ctrl+A ב-Stage ובטבלה נקרא לפי המקום של המקש בלבד: ב-AZERTY המקש שכתוב עליו A לא עושה דבר, וזה שכתוב עליו Q בוחר הכול. אות שמוקלדת ב-AltGr (Windows מדווח איתה Ctrl ו-Alt) על תא נבחר נבלעה, או בחרה את כל התאים | בינונית | `editor-key-layouts.spec.ts`, `stage/keys.test.ts` | כן. אותו דפוס נשאר ב-`text/plugins.ts` (Ctrl+Shift+V) וב-`chart/DataEditor.tsx` (Ctrl+A), בלי בדיקה; ב-`text/htmlEditing.ts` הקובץ שמור |
| 13 | Delete בפאנל השכבות מוחק, והמקלדת נופלת ל-`<body>`: החצים לא עושים דבר עד שלוחצים על הרשימה | בינונית: מקלדת | `arrange-objects.spec.ts` | כן |
| 14 | Alt+חץ בפאנל האנימציות: ליד מסלול תנועה (שה-runtime לא מנגן, והרשימה מציגה בנפרד) לחיצה לא משנה דבר על המסך אבל יוצרת צעד undo; ואחרי כל הזזה המקלדת נופלת ל-`<body>` | נמוכה | `animations/model.test.ts`, `runtime-animations.spec.ts` | כן |
| 15 | ה-renderer כותב כל מחרוזת של קישור ל-`href`, וה-runtime פותח כל כתובת, גם `javascript:` ו-`file:` שבאו מייבוא (ADR-060, "ממצאים") | גבוהה בקובץ מיוצא | `packages/runtime/src/controls.test.ts`, `SlideRenderer.test.tsx` | כן, ב-B1 |

## תוספות לחוזים משותפים

- **`asset.remove`** (`packages/model`): command חדש בקטלוג (ADR-007). `{ type: 'asset.remove', assetIds: string[] }`; נדחה ב-`invalid_state` לנכס שבשימוש, וב-`not_found` לנכס שאינו במצגת. בדיקת undo/redo ב-`commands.test.ts`, עם האחרים. ה-`OPS_HELP` של `deck_apply_ops` לא מזכיר אותו (ראה "מה דילגתי עליו").
- **`registerSlideMark`, `SlideMarkDefinition`, `useSlideMarks`** (`apps/desktop/src/shell`): רישום חדש, כמו `registerStatusItem`. `registries.slideMarks` נוסף לרשימת ה-stores.
- **`Filmstrip`**: prop חדש `mark`, ומחרוזת `move` ב-`FilmstripLabels`. **`Stage`**: prop חדש `label`, שם הנגישות שלו.
- **`@slidr/ui`**: `Tooltip` מקבל `onOpenChange`; `DialogContent` מקבל `size: 'default' | 'wide'` (ו-`--spacing-dialog-wide`, 720px); `NumberField` מקבל `data-testid`; `Button` ו-`IconButton` שומרים מיקוד כשהם נעשים disabled (`aria-disabled`); `IconButton` עם `aria-pressed` נראה לחוץ.
- **`@slidr/prompts`**: מייצא `TEMPLATE_ROLES` ו-`TEMPLATE_OPTIONAL_ROLES`. **`@slidr/templates/builtin`**: מייצא גם `OPTIONAL`.
- **`@slidr/renderer`**: מייצא `CELL_PADDING`. בהצגה, קישור של טקסט ואובייקט עם קישור הם `tabIndex=0` ו-`role="link"`; כתובת שאינה `http`, `https`, `mailto` או `tel` לא נכתבת ל-`href`.
- **`@slidr/runtime`**: Enter על קישור שיש לו את המקלדת פותח אותו במקום לעבור לשקף הבא; רק אותן ארבע כתובות נפתחות. ה-bundle נבנה מחדש.
- **`deck_apply_ops`**: `frame` חלקי ב-`element.update` מושלם מהאובייקט. השורה ב-`OPS_HELP` אומרת את זה ("patch.frame may be partial").

## קבצים שמורים שנגעתי בהם, ובמה

- `src/stage/Stage.tsx`: עצירה של גרירה בקצה ה-Stage ותפיסה של אובייקט נבחר מחוץ לשקף (A15), השם (B1), ו-Ctrl+A (ממצא 12). לא נגעתי בקליק ימני על אובייקט נעול, ב-Alt+חצים, ברמז של footer ריק, ובסוף שינוי גודל.
- `src/table/stage.tsx`: חצים בין תאים, Ctrl+A ו-AltGr. לא נגעתי ב-undo אחרי Tab שהוסיף שורה.
- `src/shell/StageRegion.tsx`: השם וה-status (B1). לא בגרירה ובהדבקה של קבצים.
- `packages/renderer/src/text.tsx`: הקישורים (B1). לא ב-shrink-to-fit.
- `packages/html-export/src/exportHtml.ts`: שורה אחת, השקפים מצוירים מול המצגת כולה (ממצא 4). לא ב-`</style>`.
- `packages/agent-tools/src/tools/deck.ts`: `deck_apply_ops` (A3). לא ב-`asset.add`.
- `src/objects/tools.tsx`: הפונקציה של "החלפת תמונה" עברה ל-`objects/replace.ts`, ומיובאת משם (A5). לא במיקוד המקלדת.
- `src/ai/runtime.ts`: הערות בלבד (A11).
- `src/shell/registry.ts`: הרישום החדש (B3). הוא לא שמור; השמור הוא `packages/agent-tools/src/registry.ts`, שלא נגעתי בו.

## מה דילגתי עליו, ולמה

- **B5, עריכת המתווה בכרטיס (AID-03).** הכרטיס יכול לאפשר שינוי סדר, מחיקה ועריכת כותרת, אבל "אישור ובנייה" שולח היום את `outline.approve`, שאומר ל-Agent לבנות "את המתווה שהצעת, כמו שהוא". כדי שהעריכה תגיע ל-Agent צריך פרמטר חדש לפעולה (המתווה הערוך, JSON בשורה אחת, כמו `description`) וניסוח חדש של הבקשה ב-`packages/prompts/src/actions.ts`. את הניסוח שופט רק סט ההערכה, ואת התוצאה רק ה-Agent האמיתי.
- **היסטוריית החלופות בקובץ.** היא נשמרת בחלון בלבד; שמירה עם המסמך היא שינוי סכמה.
- **חיצים ימינה ושמאלה בקצה הטקסט של תא** לא עוברים לתא שליד. ADR-033 מונה רק מעלה ומטה; בטקסט דו-כיווני ימינה ושמאלה הם שאלה של סדר חזותי מול לוגי.
- **Ctrl+Shift+V ב-`text/plugins.ts` ו-Ctrl+A ב-`chart/DataEditor.tsx`** נקראים לפי מקש פיזי, כמו שהיה ב-Stage (ממצא 12). לא שיניתי בלי בדיקה שמראה את הכשל.
- **`OPS_HELP` של `deck_apply_ops`** לא מזכיר את `asset.remove`. זה טקסט שה-Agent קורא, ולא הוספתי לו בלי הרצה של סט ההערכה.
- **Delete על שורה בפאנל השכבות שיש לה מקלדת אבל אינה בחורה** מוחק את הבחירה, לא את השורה (Tab עובר בין השורות בלי לבחור). כך עושה גם Explorer של Windows; השארתי, ושאלה בסוף.
- **Vite צופה גם ב-`apps/desktop/e2e`** (ADR-051, ממצא 5): עריכה של spec באמצע הרצה טוענת מחדש את הדפים שנבדקים. לא שיניתי את `vite.config.ts`: `src/agent/pageAgent.ts` מייבא משם תסריט.
- **`README.md`, `docs/PLAN.md`, `docs/SPEC.md`** לא נערכו. מה שצריך להיכנס אליהם כתוב כאן, ב"תוצאות לפי משימה".

## מה לא נבדק, ואיך לבדוק ב-Windows

הכול כאן רץ בדפדפן (Edge 154 ל-Linux) מול שרת Vite, וב-Vitest. כל מה שתלוי ב-Windows, בחלון של Tauri או ב-CLI האמיתי לא רץ.

| מה | איך לבדוק |
|---|---|
| צילומי הבסיס (22) מול השינויים ב-renderer: הקישורים (B1), מספר השקף בקובץ המיוצא, `CELL_PADDING` שעבר קובץ (B7) | `pnpm e2e` ב-Windows. אף אחד מהשינויים לא אמור להזיז פיקסל; `renderer.spec.ts` ו-`chart-render.spec.ts` יגידו |
| שמונה בדיקות של `pnpm test:browser` שנכשלות ב-Linux גם על `main` (גופנים, המרת HTML, צל, קליפ קול) | `pnpm test:browser` ב-Windows |
| Alt+F10, Ctrl+חץ ב-Filmstrip, Shift+Enter, Delete באריח של המדיה, ו-Up/Down בתא: מקשים אמיתיים בחלון של Tauri (WebView2 עלול לתפוס Alt+F10 או F10) | `pnpm tauri dev`, ולנסות כל קיצור ביד, בעברית ובאנגלית |
| קורא מסך: השם של ה-Stage, ה-status של הבחירה, תיאור הסימן ב-Filmstrip, ומיקום בגלריה ("סט 2 מתוך 3") | Narrator ב-Windows על `tauri dev` |
| `prefers-reduced-motion` ב-Filmstrip | Settings > Accessibility > Visual effects > Animation effects כבוי, ואז מעבר בין שקפים |
| קישור בהצגה: Tab ו-Enter, ופתיחה של `https`/`mailto` בדפדפן של המערכת | מצב הצגה ב-`tauri dev`, וקובץ מיוצא שנפתח ב-Edge |
| העלות של התור הראשון אחרי תהליך Agent שנהרג (ממצא 7) | מול ה-CLI האמיתי: להרוג את התהליך באמצע תור, לשלוח הודעה, ולראות עלות מתחת לתור |
| `exact_edit` על תמונה מצולמת לרוחב (ממצא 8): נבדק ב-`cargo test` על JPEG עם Exif 6 | עריכה מדויקת בחלון האמיתי, עם ספק תמונות אמיתי |
| הכלים החדשים של עורך התבנית מול הספרייה ושמירה כתבנית אישית: שהשדות החדשים נשמרים ונטענים | לשנות פלטה, צל ווריאנט, לשמור כתבנית אישית, ולהחיל אותה על מצגת חדשה, ב-`tauri dev` |
| המראה של מה שנוסף: הכלים החדשים של פאנל התבנית, כלי הריפוד, הניווט בגלריה, הסימן ב-Filmstrip, ה-status של ה-Stage | `tauri dev`, בערכה הבהירה ובכהה, בעברית ובאנגלית, ב-1920 וב-1366. לא צילמתי אותם לשער העיצוב |
| `run-set.mjs` עם התיקייה שלך | `node apps/desktop/scripts/import/run-set.mjs --examples <התיקייה>` |
| `picture.mjs` במקביל (ledger) ובנייה זהה של `index.html` | שתי הרצות של `picture.mjs` בבת אחת, ואז בנייה של האינדקס פעמיים ו-`git diff` |

## על הסביבה, ומה שנתקלתי בו

1. **Edge ל-Linux הותקן** (גרסה 154), ולכן כל ההרצות היו על `channel: 'msedge'`, בלי override.
2. **Rust נבנה אחרי התקנה של ספריות המערכת** (`webkit2gtk-4.1` וחבריה, דרך apt). הבנייה ב-Linux מזהירה על קוד שמשמש רק ב-Windows (`dead_code`); לא שיניתי אותו.
3. **Playwright כותב צילום בסיס כשאין כזה** (`writing actual`), ולכן הרצה של `renderer.spec.ts` ו-`chart-render.spec.ts` ב-Linux השאירה קובצי `*-linux.png` לא עקובים בתיקיית ה-snapshots. מחקתי אותם, אף אחד מהם לא נכנס ל-commit, וכל ההרצות האחרונות היו עם `--update-snapshots=none`. מי שמריץ את ה-E2E ב-Linux צריך את הדגל הזה.
4. **`e2e/tables.playwright.config.ts` הוא לא הסוויטה של הטבלאות** אלא העתק של כל ה-E2E, על פורט 1461. הסוויטות של הטבלאות רצות דרך `editor.playwright.config.ts` עם `SLIDR_E2E=app`. השם מטעה.
5. **`pnpm test:browser`**: שמונה בדיקות נכשלות ב-Linux, גם על `main` בלי שום שינוי: צמצום גופנים, המרת HTML שתלויה בגופנים, צל של טקסט, וחיתוך של קליפ קול (גופני המערכת וה-codecs). הפירוט ב"מצב הבדיקות".
6. **E2E שנכשלים כאן גם על `main`, בלי שינוי:** 22 בדיקות צילומי הבסיס (אין להן בסיס ל-Linux, וזה נכון), ושמונה בדיקות של הסביבה: תנועת המקלדת לפי מילים ב-`text-bidi.spec.ts` (Edge ל-Linux עוצר במקום אחר), שתיים של ייצוא מדיה ב-`video-export.spec.ts`, שתיים של ניגון ב-`video-playback.spec.ts`, הגופנים של הקובץ המיוצא ב-`runtime-export-fonts.spec.ts`, ההשוואה של מצגת הייחוס ב-`runtime-export.spec.ts`, והרמז של placeholder ריק ב-`editor-stage-agent.spec.ts`. בהרצה חוזרת על `main` חמש מהן נכשלו שוב, ושלוש עברו.

## החלטות שמחכות לך

**נוסף command אחד (`asset.remove`) ורישום אחד (`registerSlideMark`). הכול קל להפוך.**

1. **`asset.remove` מסרב לנכס שבשימוש.** החלופה: למחוק גם את מה שמשתמש בו, באותו צעד. הסירוב שומר על "אין אובייקט שמצביע על נכס שאינו במצגת" בלי לגעת באובייקטים.
2. **Alt+F10 לסרגל הצף.** זה הקיצור של Office; כדאי לבדוק ב-WebView2 שהוא לא נתפס (F10 פותח תפריט בדפדפנים).
3. **הכתובות שקישור פותח: `http`, `https`, `mailto`, `tel`.** כל השאר מצויר כטקסט. להרחיב: `OPENABLE` ב-`packages/runtime/src/controls.ts` וב-`packages/renderer/src/text.tsx`.
4. **שקף מוסתר נספר במספור של הקובץ המיוצא**, כמו ב-Stage ובמצב הצגה. ADR-063 השאיר את זה לא בדוק; ההתנהגות של ה-Stage היא שקבעה.
5. **עריכה של וריאנט רקע משנה את השקפים שבחרו אותו.** החלופה: וריאנט הוא נקודת התחלה, ושקף שבחר אותו לא משתנה איתו.
6. **היסטוריית החלופות: תשעה סטים קודמים לכל יעד, בחלון בלבד, וסגירה מסיימת אותה.** להפוך: `EARLIER` ב-`ai/variations.ts`; שמירה בקובץ היא שינוי סכמה.
7. **הוספת שורות ועמודות כמספר הנבחרות** (כמו Word). PowerPoint עושה אותו דבר.
8. **B5, עריכת המתווה.** הצעה: פרמטר `outline` לפעולה `outline.approve`, שנכתב כ-JSON בשורה אחת כמו `description`, ומשפט בבקשה: "the user edited the outline: build the one in `outline`". צריך הרצה של סט ההערכה לפני שזה נכנס.
9. **Delete בפאנל השכבות פועל על הבחירה גם כשהמקלדת על שורה שאינה בחורה.** החלופה: Delete על שורה כזו מוחק אותה.
10. **ממצא 1** (פינות העמודות של גרף): להעביר את `theme.radius` ל-spec של הגרף ולהשתמש ב-`min(3, radius)`. זה משנה ציור, ולכן צריך את צילומי הבסיס של Windows.
11. **ממצאים 2 ו-3** (`packages/prompts`): הניסוח המוצע כתוב בבדיקות שמסומנות `it.fails`. צריך הרצה של סט ההערכה.

## איך הענף נבנה

סשן אחד בענן, בלי Windows. הענף שהתבקש הוא `cloud-fixes-1`; ההגדרות של הסשן נקבו בענף אחר (`claude/sharp-darwin-1q3oo7`), ועבדתי על זה שהתבקש. ה-pull request הוא draft; לא מוזג דבר ולא נדחף דבר ל-`main`.

## מצב הבדיקות בענף

הכול על Linux (קונטיינר, 4 ליבות), בדפדפן Edge 154 ל-Linux (`channel: 'msedge'`, בלי override). ההשוואה היא ל-`main` (`42c4057`) באותה סביבה.

| בדיקה | על הענף | על `main` | מה זה אומר |
|---|---|---|---|
| `pnpm check` (typecheck, ESLint, Prettier, Vitest) | עובר. Vitest: 169 קבצים, 2,063 עוברות ו-3 כישלונות צפויים (`it.fails`, ממצאים 1 עד 3) | עובר. 162 קבצים, 2,045 עוברות | רץ לפני כל commit |
| `pnpm test:browser` (Edge ל-Linux) | 228 עוברות, 8 נכשלות, מתוך 236 | 226 עוברות, 8 נכשלות, מתוך 234 | אותן 8 בדיוק נכשלות גם על `main`: שלוש של צמצום הגופנים (`fonts.browser.test.ts`), שלוש של המרת HTML (`convert.browser.test.ts`: גופן שה-HTML מגדיר, משפחה לכל קטע, pseudo-elements), הצל של אפקט טקסט (`textEffects.browser.test.tsx`) וחיתוך של קליפ קול (`media.browser.test.ts`). גופני המערכת וה-codecs של Linux; ב-Windows הן צריכות לעבור. השתיים החדשות (`slideNumber.browser.test.ts`) עוברות |
| `pnpm e2e` (כל הסוויטה, `SLIDR_E2E=app`, `--update-snapshots=none`) | ב-`d32b2ef`: 1,169 עוברות, 33 נכשלות, 2 דולגו ו-8 לא רצו, מתוך 1,212 (53.8 דקות) | 1,145 עוברות, 30 נכשלות, 2 דולגו ו-5 לא רצו, מתוך 1,182 (שעה) | ראה למטה |
| `cargo test` | 243 עוברות, 12 ב-ignore | 241 עוברות, 12 ב-ignore | שתי הבדיקות החדשות (ממצאים 7 ו-8) עוברות |

**ה-E2E, בפירוט.** מתוך 33 הכישלונות בהרצה המלאה: 22 הן בדיקות צילומי הבסיס של Windows (`renderer.spec.ts` ו-`chart-render.spec.ts`, שאין להן בסיס ל-Linux, כמו על `main`); שש נכשלות גם על `main` בסביבה הזו (`text-bidi.spec.ts:240`, שתיים ב-`video-export.spec.ts`, `runtime-export-fonts.spec.ts:303`, `runtime-export.spec.ts:227`, ו-`editor-stage-agent.spec.ts:112`, שעובר לפעמים); וחמש לא נכשלו על `main`:

- `stage-lines.spec.ts:97` (קו נבחר נתפס בתיבה שסביבו): **רגרסיה של הענף**, מהתיקון של A15. תוקנה ב-`720acf0`: המסגרת לוקחת אובייקט נבחר רק מחוץ לשקף.
- `chart-render.spec.ts:192` ("one chart, five uses"; שלוש הווריאציות האחרות שלו לא רצו אחריו): **רגרסיה של הענף**, מ-B3: הסימן של ממצאי העיצוב צויר מעל התמונה הממוזערת ושינה אותה. תוקנה ב-`7ca0dca`: הסימן עבר לשורה של המספר.
- `code-editor.spec.ts:36`, `objects-menu.spec.ts:99` ו-`table-editing.spec.ts:412`: עברו שלוש פעמים כל אחת בהרצה חוזרת על הענף הסופי. כישלון תחת עומס: `cargo test` רץ במקביל להרצה המלאה, על אותן ארבע ליבות.

**אחרי ההרצה המלאה** (ב-`574b888`, הענף הסופי): ארבע הווריאציות של `chart-render.spec.ts:192` עוברות; `stage-lines.spec.ts`, `stage-reports.spec.ts` ו-`stage.spec.ts` עוברים (22); וכל הסוויטות של האזורים שהענף נגע בהם (`stage*`, `editor-stage*`, `arrange-*`, `a11y-keys`, `design-check`, `editor-key-layouts`, `table-more`, `objects-menu`, `objects-keys`, `media-panel`, `aitools-gallery`, `templates-panel`): 182 עוברות, ואחת נכשלת, `editor-stage-agent.spec.ts:112`, שנכשלת גם על `main`. **את ה-E2E המלא לא הרצתי שוב על `574b888`**; שלושת ה-commits שאחרי `d32b2ef` נוגעים ב-`Stage.tsx` (הבחירה), בשורת המספר של ה-Filmstrip, ובבדיקה אחת.

**מה לא רץ בכלל:** החלון של Tauri, ה-build הארוז (`apps/desktop/packaged`), ה-CLI האמיתי של Claude Code ושל Codex, סט ההערכה (`apps/desktop/eval`), והשוואה לצילומי הבסיס של Windows. `cargo clippy` לא הורץ כשער.

</div>
