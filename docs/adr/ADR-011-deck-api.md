<div dir="rtl">

# ADR-011 — ה-Deck API, שומר ההיקף ותור כ-transaction

סטטוס: **הוכרע** · 2026-10-03 · משימות: WG10-T05, T06, T07 · קוד: `packages/agent-tools/`, `packages/model/src/compose/`

זה החוזה ש-PLAN סעיף 3 קובע שנסגר בתחילת M2: שמות הפונקציות של ה-Deck API וסכמות הקלט והפלט, בלי תלות בפרוטוקול. WG11, WG12 ומתאם התעבורה (T04) בונים עליו. שינוי בו מעדכן את המסמך הזה.

## ההחלטה

1. **פונקציות וטיפוסים, בלי שכבות.** כלי הוא אובייקט `ToolDef`: שם, תיאור ל-Agent, סכמת Zod, ההיקפים שרשאים לקרוא לו, האם הוא כותב, השירות שהוא צריך, ו-`run`. `createDeckApi(bus, services)` מחזיר `{ tools, list, call }`. אין מחלקות ואין DI.
2. **כל כתיבה עוברת ב-`ctx.write(commands)`.** שם נאכפים שומר ההיקף וה-transaction של התור, ושם נאסף מה השתנה. כלי לא מקבל את ה-bus, ולכן אין לו דרך לעקוף אותם.
3. **שירותים אופציונליים.** כלי שנשען על רכיב שעוד לא נבנה נרשם רק כשהשירות שלו מסופק. שירות מקבל את המצגת ומחזיר נתונים או commands, ולא כותב בעצמו.
4. **אין זכר לפרוטוקול** (API-02). `git grep -i mcp packages/agent-tools` ריק, ובדיקה מוודאת שגם הגדרות הכלים לא מזכירות אותו. אין DOM ואין React; הבדיקות רצות ב-Node.
5. **הבדיקות קוראות ל-`call` ישירות** (API-01), על מצגות הדוגמה של `@slidr/model/fixtures`.

## הכלים

היקף: D מצגת, S שקף, O אובייקט. סשן ייבוא מקבל כל כלי D. כותב: הכלי מחזיר סיכום כתיבה וממצאי lint.

| כלי | היקף | כותב | מצב |
|---|---|---|---|
| `deck_get_outline` | D S O | | ממומש |
| `deck_get_theme` | D S O | | ממומש. עם שירות התבניות מחזיר גם את רשימתן |
| `slide_get` / `element_get` | D S O | | ממומש |
| `selection_get` | D S O | | ממומש, דרך `UiPort` (WG3 / WG11) |
| `slide_render` | D S O | | מחכה ל-`CaptureService` (WG2-T08) |
| `deck_render_contact_sheet` | D | | מחכה ל-`CaptureService` (WG2-T08) |
| `slide_create` | D | כן | מחכה ל-`LayoutService` (WG7-T02) |
| `slide_create_from_html` | D | כן | מחכה ל-`ConversionService` (WG9A) |
| `slide_replace_from_html` | D S | כן | מחכה ל-`ConversionService` (WG9A) |
| `slide_update` | D S | כן | ממומש |
| `slide_delete` / `slide_duplicate` / `slides_reorder` | D | כן | ממומש |
| `element_add` / `element_delete` / `elements_arrange` | D S | כן | ממומש |
| `element_update` / `text_set` / `table_set` / `chart_set` / `animation_set` | D S O | כן | ממומש |
| `element_convert` | D S O | כן | מחכה ל-`ConversionService` (WG9A). ראה "לא נעשה" |
| `theme_update` | D | כן | ממומש |
| `template_apply` | D | כן | מחכה ל-`TemplateService` (WG7-T03) |
| `template_create` / `template_save` | D | | מחכה ל-`TemplateService` (WG7-T11a) |
| `deck_apply_ops` | D S | כן | ממומש |
| `image_generate` / `image_edit` | D S O | כן | מחכה ל-`ImageService` (WG12-T01, T04) |
| `image_process` | D S O | כן | מחכה ל-`ImageService` (WG12-T05) |
| `stock_search` | D S O | כן | מחכה ל-`StockService` (WG12-T06) |
| `icon_search` | D S O | | מחכה ל-`IconService` (WG5-T11) |
| `slide_lint` / `deck_lint` | D S O | | מחכה ל-`LintService` (WG7-T05) |
| `ui_present_options` | S O | | מחכה ל-`OptionsService` (WG11-T08) |
| `ui_navigate` | D S O | | ממומש, דרך `UiPort` |

18 כלים רצים עם המודל בלבד. גם 19 האחרים כתובים ונבדקים מול שירותים מזויפים; חסר רק השירות עצמו.

**נוחות מעל ה-commands.** הכלים מקבלים מזהים ולא מיקומים, וממפים ל-commands של ADR-007:

- `element_update`: כל שדה מחליף את השדה כולו (כמו ב-command), חוץ מ-`frame`, שמתמזג (`{"x": 100}` מזיז רק את x).
- `slide_duplicate`, `slide_create*`: `afterSlideId` (null = ראשון). `slides_reorder`: `afterSlideId` במקום `toIndex` שנספר בלי השקפים שזזים.
- `slideId` אופציונלי כשיש `elementId`: מזהי אובייקטים ייחודיים במצגת.
- `elements_arrange`: `align`, `distribute`, `front`/`back`/`forward`/`backward`, `group`, `ungroup`. היישור לפי המלבן שהאובייקט מכסה על המסך (כולל סיבוב), בקואורדינטות פיזיות: left הוא שמאל גם ב-RTL.
- `table_set` / `chart_set`: עדכון, או יצירה כשאין `elementId`. תאים ב-Markdown. שינוי מספר השורות או העמודות מחלק אותן שווה, אלא אם ניתנו מידות. אפשרויות הגרף מתמזגות מפתח אחר מפתח. סדרה שאורכה שונה ממספר הקטגוריות נדחית.
- `animation_set`: צעד בלי `id`, `trigger`, `category`, `duration`, `delay` או `easing` מקבל ברירת מחדל. עם `elementIds` מוחלפים רק הצעדים שלהם, במקום שבו היה הראשון. בסשן אובייקט זו ברירת המחדל, עבור האובייקטים של הסשן.
- `element_add`: האובייקט המלא, כולל `id` חדש, `rotation` ו-`opacity`. מזהה תפוס נדחה עם `conflict`.

## ההקשר והשירותים

<div dir="ltr">

```ts
startTurn(sessionId, scope, { turnId?, label? }): Turn   // { sessionId, scope, actor, txId, label? }
createDeckApi(bus, services?): { tools, list(scope?), call(turn, name, input) }

interface ToolContext {
  readonly deck: Deck;          // live: changes after each write
  readonly turn: Turn;
  readonly services: Services;
  write(commands): WriteSummary; // scope guard, then bus.batch with the turn's actor and txId
}
```

</div>

| שירות | מה | כלים | מי ממלא |
|---|---|---|---|
| `UiPort` | `selection()` מ-`SelectionStore`; `navigate({ slideId, elementIds })` | `selection_get`, `ui_navigate` | WG3 / WG11 |
| `CaptureService` | `renderSlide(deck, slideId, { width })`, `renderContactSheet(deck, ids, { columns, width })` → PNG | `slide_render`, `deck_render_contact_sheet`, ותמונה בתשובת ה-HTML | WG2-T08 |
| `LayoutService` | `createSlide(deck, { layoutId, content, name })` → `Slide` עם מזהים חדשים | `slide_create` | WG7-T02 |
| `ConversionService` | `htmlToSlide(deck, { html, name })` → שקף, נכסים, `editability`, `notes`; `convertElement(...)` | שלושת כלי ה-HTML | WG9A |
| `LintService` | `lint(deck, slideIds, 'agent' \| 'all')` → `LintFinding[]` | אחרי כל כתיבה (`agent`); `slide_lint`, `deck_lint` (`all`) | WG7-T05 |
| `TemplateService` | `list`, `applyCommands` → commands, `create` → טיוטה ותצוגה, `save` | `template_*`, `deck_get_theme` | WG7-T03, T11a |
| `ImageService` | `generate`, `edit`, `process` → נכסים שכבר נשמרו ותצוגות | `image_*` | WG12-T01, T04, T05 |
| `StockService` | `search` → נכסים שכבר נשמרו, עם ייחוס | `stock_search` | WG12-T06 |
| `IconService` | `search` → `{ id, name, svg }` | `icon_search` | WG5-T11 |
| `OptionsService` | `present({ kind, target, prompt, options })` | `ui_present_options` | WG11-T08 |

- **תמונה** היא `PngImage`: `{ mimeType: 'image/png', data /* base64 */, width?, height? }` (MCP-06).
- **שירות מקבל את המצגת**, כך שהוא מצלם, בודק או ממיר בדיוק את המצב שהכלי ראה.
- **נכסים** שהשירות שמר נרשמים ב-`asset.add` בתוך אותה כתיבה, ולכן הם חלק מהתור ומה-undo.
- `stock_search` כותב: הוא רושם את התוצאות כנכסים, כדי שה-Agent יוכל למקם אותן לפי מזהה. מה שלא בשימוש נזרק בשמירה (ADR-007).

## צורת התוצאה והשגיאות

<div dir="ltr">

```ts
type ToolResult =
  | { ok: true; data: Record<string, unknown>; images: PngImage[] }
  | { ok: false; error: { code: ToolErrorCode; message: string } };

// added to `data` of every write tool
interface WriteSummary {
  created: string[];   // slides and elements added
  changed: string[];   // existing elements, and slides whose own fields or timeline changed
  removed: string[];
  slides: string[];    // slides touched that still exist: the ones linted
  deck?: ('meta' | 'theme' | 'layouts' | 'slideOrder' | 'assets')[];
}
// and, with lint: data.lint = LintFinding[] (or data.lintError when lint failed; the write stays)
```

</div>

- **הסיכום נגזר ב-registry** מה-`Affected` של ה-bus ומהמצגת לפני ואחרי, ולא בכל כלי. שקף נחשב "השתנה" רק כששדה שלו השתנה, לא כשרק אובייקט עליו השתנה: המודל שומר זהות של מה שלא נגעו בו.
- **`call` לא זורק.** קודי שגיאה:
  - `unknown_tool`;
  - `unavailable`: הכלי קיים בקטלוג והשירות שלו לא רץ;
  - `out_of_scope`;
  - `invalid_input`;
  - `not_found`, `conflict`, `invalid_state`: כמו ב-`CommandError`;
  - `failed`: שירות נכשל.
- **קלט לא תקין** מחזיר שורה לכל שדה עם הנתיב שלו: `element.content.paragraphs[0].dir: Invalid option: expected one of "rtl"|"ltr"|"auto"`. באיחוד, ההודעה נלקחת מהענף שה-`type` או ה-`kind` שלו התאים. כשאף ענף לא התאים, היא מונה את כל הערכים המותרים.
- **מזהה חסר** (CMD-07): "does not exist. It may have been deleted; deck_get_outline lists the slides." אובייקט שנמצא בשקף אחר מזה שנמסר: "is on slide X, not on slide Y".
- **כלי שנכשל אחרי שכתב** (למשל שירות שנפל באמצע): מה שנכתב נשאר כחלק מהתור, וההודעה מפרטת אותו.

## ה-Markdown של `text_set`

גם הערות הדובר (`slide_update.notes`) ותאי טבלה משתמשים בו. `richText` מקבל RichText מלא למי שצריך שליטה מלאה.

- **פסקאות:** כל שורה היא פסקה. שורה ריקה רק מפרידה; מרווח הוא מאפיין של פסקה. `\` בסוף שורה ממשיך את הפסקה בשורה חדשה (שבירת שורה בתוך ה-run).
- **רשימות:** `- `, `* ` או `+ ` לתבליט; `1. ` או `1) ` למספור. הזחה גדולה מהפריט שמעל מקננת רמה אחת, עד 8. טאב שווה ארבעה רווחים. פסקה רגילה מאפסת את הקינון.
- **בתוך שורה:**
  - `**מודגש**` (weight 700);
  - `*נטוי*` או `_נטוי_` (קו תחתון רק בגבול מילה, כך ש-`snake_case` נשאר);
  - `~~קו חוצה~~`;
  - `==הדגשה==` (highlight `accent` בשקיפות 0.35);
  - `[טקסט](url)`.

  הם מקוננים, ו-`\` לפני סימן פיסוק הופך אותו לתו רגיל. סימון בלי סוגר נשאר טקסט.
- **אין** כותרות, ציטוטים, קוד וטבלאות: הם טקסט רגיל. המראה של פסקה בא מהסגנון שלה (`styleRef`), לא מ-Markdown.
- **הטקסט החדש יורש את המראה של הישן.**
  - פסקה רגילה יורשת מהפסקה הרגילה הראשונה, ופריט רשימה מפריט הרשימה הראשון: `styleRef`, יישור, ריווח, הזחה, ותו וצבע של תבליט.
  - הסימונים המשותפים לכל ה-runs של הפסקה עוברים לכל ה-runs החדשים, חוץ מקישור. כך כותרת לבנה על רקע צבעוני נשארת לבנה, ומילה מודגשת אחת לא מדגישה הכול.
  - `style` ו-`align` דורסים לכל הפסקאות.
- **כיוון לכל פסקה:** כיוון המצגת, אלא אם יש בפסקה אותיות ואף אחת מהן לא בכיוון הזה (שורה באנגלית במצגת עברית מקבלת `ltr`).
  - "API חדש עלה ל-production" במצגת עברית: `rtl`.
  - "87%": כיוון המצגת.
  - `dir` כופה `rtl`, `ltr` או `auto` על כל הפסקאות.

## שומר ההיקף (MCP-05, T06)

נאכף ב-registry בשתי נקודות, ולא בכל כלי:

1. **לפני הריצה:** כלי שהיקף הסשן לא ברשימה שלו נדחה, עם ההיקפים שבהם הוא כן עובד.
2. **בכל `write`:** `checkWrite(scope, commands, deck)` עובר על כל command. אם אחד נדחה, שום דבר לא מוחל.

| היקף | מותר לכתוב |
|---|---|
| `deck`, `import` | הכול |
| `slide` | commands עם `slideId` של השקף שלו: `element.*`, `text.set`, `slide.update`, `slide.setTimeline` |
| `object` | `element.update` ו-`text.set` על האובייקטים שלו ועל מה שבתוכם; `slide.setTimeline` שבו הצעדים של אובייקטים אחרים נשארים זהים ובאותו סדר |
| כולם | `asset.add`: הוא לא משנה שקף, וכלי התמונות צריכים אותו בכל היקף |

- **קריאה מותרת בכל מקום.** סשן שקף קורא כל שקף.
- `SessionScope` זהה בצורתו ל-`Scope` של `apps/desktop/src/agent/agent.ts` (ADR-010), כך שההיקף של הסשן עובר כמו שהוא.

## תור כ-transaction (MCP-07, D8, T07)

- **`startTurn`** לוקח `txId` חדש (`newId('tx')`) ובונה `actor` עם `agentActor(sessionId, turnId)`. ברירת המחדל של `turnId` היא ה-`txId`.
- **כל כתיבה של התור** היא `bus.batch(commands, { actor, txId, label })`. לכן:
  - התור הוא צעד undo אחד;
  - `undoTransaction(txId)` מבטל אותו;
  - `ChangeDigest` לא מדווח לסשן על השינויים שלו עצמו.
- **כל קריאה אטומית:** הכתיבה שלה היא `batch` אחד. `deck_apply_ops` הוא `batch` של ה-commands שה-Agent שלח.
- **שזירה עם המשתמש** מתנהגת כמו ב-ADR-007, ונבדקה דרך ה-API:
  - הצעדים נרשמים לפי הזמן: תור, משתמש, תור;
  - `transactionInfo` מחזיר `{ steps: 3, otherEdits: 1 }`;
  - Ctrl+Z מבטל רק את החלק האחרון של התור;
  - `undoTransaction` מבטל גם את עריכת המשתמש שבאמצע.
- **קריאה שנכשלה** לא משאירה צעד, והתור נשאר צעד אחד.
- **אובייקט שהמשתמש מחק באמצע התור** מחזיר `not_found` עם "may have been deleted".

## הגדרות הכלים למתאם (MCP-03)

`list(scope?)` מחזיר `{ name, description, inputSchema, scopes, writes }`.

- **הסכמה** נבנית ב-`toJsonSchema` של המודל, כך שטיפוסים משותפים (`Element`, `RichText`, `Fill`...) נכתבים פעם אחת תחת `$defs`.
- **תיאורי שדות:** `toJsonSchema` משתמש ב-registry משלו כמטא-דאטה, ולכן משמיט את `.describe()`. `inputJsonSchema` מוסיף את התיאורים של שדות הרמה העליונה. שדה שהטיפוס שלו הוא סכמה משותפת מתועד דרך `z.lazy(...).describe()`, שלא משכפל את הסכמה.
- **כל קלט הוא אובייקט בשורש**, בלי `anyOf` או `oneOf` שם. API של מודלים דוחה איחוד בשורש של סכמת כלי, ולכן `elements_arrange` הוא אובייקט שטוח עם `action`.
- **`deck_apply_ops`** מפרסם רשימה מקוצרת של צורות ה-commands בתיאור, ובודק כל op מול `Command` של המודל בזמן הריצה, עם הנתיב (`ops[1].patch.hidden: ...`). האיחוד המלא כ-JSON Schema הוא כ-42KB.
- **גודל:** כ-74KB לכל 37 הכלים (כ-20 אלף tokens), 56KB בלי שירותים, 20KB לסשן אובייקט. `element_add` לבדו כ-28KB, כי הוא נושא את סכמת `Element`. בדיקה נכשלת מעל 90KB.

## פונקציות ההרכבה במודל (`packages/model/src/compose/`)

מה ש-ADR-007 השאיר מחוץ לקטלוג, כפונקציות טהורות שמחזירות commands. גם העורך (WG5-T06) משתמש בהן.

- **`duplicateSlide(deck, slideId, { index })`** → `slide.add`.
  - מזהים חדשים לשקף, לאובייקטים ולצעדי האנימציה.
  - הצעדים והמזהים ב-`css` של השקף (מילה שלמה) עוברים למזהים החדשים.
  - השם נשמר.
- **`duplicateElements(deck, slideId, ids, { toSlideId, offset })`** → `element.add`, לשכפול ולהעתקה והדבקה.
  - העותקים למעלה, באותו סדר שכבות.
  - באותו שקף העותק נשאר באותה קבוצה. בשקף אחר הוא עובר לרמה העליונה, במיקום שלו על השקף; סיבוב של קבוצה עוטפת לא מוחל.
  - צעדי אנימציה לא מועתקים.
- **`cloneElement(element, nextId)`**: עותק של עץ עם מזהים חדשים.
- **`alignElements(slide, ids, edge, relativeTo)`** ו-**`distributeElements(slide, ids, axis, relativeTo)`** → `element.update`.
  - לפי המלבן החוסם של כל אובייקט אחרי סיבוב.
  - האובייקטים צריכים הורה משותף. יחסית לשקף זה עובד גם בתוך קבוצה, כל עוד היא לא מסובבת או משוקפת.
  - אובייקט נעול לא זז.
  - אובייקט אחד מיושר לשקף כברירת מחדל. פיזור לפי הבחירה צריך שלושה אובייקטים.
- **`reorderElements(slide, ids, to)`** → `element.reorder` אחד לכל הורה.
- **`groupElements(deck, slideId, ids, { name })`** → `element.group` עם מזהה פנוי.

הקטלוג עצמו לא השתנה, ובמודל נוסף רק ייצוא ב-`index.ts`.

## חלופות שנבחנו

- **שומר שבודק את ה-`Affected` אחרי הרצה ניסיונית.** כללי לכל כלי עתידי, אבל `slide.setTimeline` מסמן רק את השקף. כך סשן אובייקט לא היה מובחן בין שינוי האנימציה שלו לבין שינוי רקע. בדיקה לפי command מדויקת ופשוטה.
- **`deck_apply_ops` כרשימת קריאות לכלים** (עם Markdown וכו'). ADR-007 קבע `batch` של commands. רשימת כלים הייתה מכפילה את שכבת האימות.
- **מזהה שנוצר אוטומטית ב-`element_add`.** אפשר רק דרך preprocess, ואז ה-JSON Schema היה אומר "חובה" והתיאור "לא חובה". נבחר החוזה הישיר: המזהה בא מה-Agent, ומזהה תפוס נדחה בהודעה ברורה.
- **סכמה מלאה ל-`deck_apply_ops`.** נדחתה בגלל הגודל, ראה למעלה.
- **`dir: 'auto'` לכל פסקה.** פסקה בלי אותיות ("87%") הייתה מקבלת LTR במצגת עברית.

## מה לא נעשה

- **`element_convert` בסשן אובייקט** ייחסם בשומר: ההמרה מוחקת את האובייקט ומוסיפה אחרים, שאינם "שלו". כשיגיע `ConversionService` (WG9A) צריך להחליט:
  - לאפשר `element.remove` של אובייקט בהיקף ו-`element.add` של מחליפיו, ולצרף את המחליפים להיקף הסשן;
  - או להוציא את הכלי מ-O.
- **lint אחרי `theme_update`:** אין שקפים ב-`slides`, ולכן אין ממצאים, אף שהניגודיות משתנה בכל המצגת. ייתכן שצריך lint למצגת כולה אחרי שינוי Theme; זה עולה עד 100ms לשקף.
- **מעקב לשער האיכות (T13)** לא כאן. התוצאות נותנות את מה שהוא צריך: `slides` בכל כתיבה ו-`slideId` ב-`slide_render`.
- **timeout** (MCP-04) שייך למתאם.
- **קריאות מקבילות באותו תור** משתלבות; כל קריאה אטומית לעצמה.
- **קריאה של טקסט כ-Markdown:** `slide_get` מחזיר RichText מלא, שהוא ארוך.

## מה צריך במודל (לא שונה כאן)

- **`toJsonSchema` משמיט תיאורי `.describe()`**, כי `metadata` הוא ה-registry של השמות. כדאי למזג אליו את `z.globalRegistry`, ואז `inputJsonSchema` מיותר והתיאורים יגיעו גם לשדות מקוננים.
- **`requireSlide`** אומר "does not exist" בלי "may have been deleted", בניגוד ל-`requireElement`. ה-API מוסיף את זה ב-`toToolError`.
- **ארכיטיפ לשקף:** ל-`Slide` אין `archetype`, רק דרך `layoutId`. שקף מ-HTML הוא בלי layout, ולכן גם בלי ארכיטיפ. אבל `deck_get_outline` מחזיר ארכיטיפ (SPEC 11.4), ה-Agent בוחר אחד לכל שקף (9.4), ו-L14 נשען עליו. כנראה צריך `archetype?` ב-`Slide`, וב-HTML `data-archetype` על השורש.
- **`actorSession`** מפצל לפי `:`. מזהה סשן עם נקודתיים יישבר. כדאי לאסור אותו ב-`agentActor`.

## סתירות שנמצאו ב-SPEC וב-PLAN

- **PLAN, WG6-T08** מונה את `table_set` ו-`chart_set` כמשימה של WG6. הם מומשו כאן, ומה שנשאר ב-T08 הוא הגרפים החיים בייצוא.
- **SPEC 11.4:** `element_convert` הוא D S O, אבל לפי MCP-05 סשן אובייקט כותב רק לאובייקטים שלו (ראה "לא נעשה").
- **SPEC 11.4:** `deck_get_outline` מחזיר ארכיטיפ, שאין לו מקום במודל לשקף בלי layout (ראה "מה צריך במודל").
- **SPEC 11.6:** בבלוק ההקשר `current_slide: { id: "s_07", index: 7 }` לא ברור אם `index` מתחיל מ-0 או מ-1. ה-API מחזיר `number`, שמתחיל מ-1 כמו שהמשתמש סופר. כדאי ש-T08 יעשה אותו דבר.
- **SPEC 11.4 קורא ל-`stock_search` "חיפוש"**, אבל בלי רישום התוצאות כנכסים ה-Agent לא יכול להשתמש בהן. כאן הוא כלי כותב.
- **MCP-03:** "הגדרות הכלים נגזרות מסכמות Zod". זה נכון לכל כלי חוץ מ-`deck_apply_ops`, שמפרסם סכמה מקוצרת ובודק מול ה-Zod המלא (ראה למעלה).

## השלכות

- **T04 (המתאם):**
  - מפרסם את `list()`, אפשר לפי היקף הסשן.
  - מעביר כל קריאה ל-`call(turn, name, input)`.
  - ממפה: `data` לטקסט JSON, `images` לתוכן תמונה, ו-`ok: false` לשגיאה, עם `message` כטקסט.
- **WG11 (`AgentService`):**
  - `startTurn` לכל הודעת משתמש.
  - "בטל שינויים" הוא `bus.undoTransaction(turn.txId)`, והאזהרה מ-`transactionInfo`.
  - מספק `UiPort` מ-`SelectionStore` ומה-Stage.
- **T08:** `changed_since_last_turn` מ-`ChangeDigest.take(turn.sessionId)` בתחילת התור.
- **WG2-T08, WG5-T11, WG7, WG9A, WG11-T08, WG12:** כל אחד מממש את הממשק שלו ב-`services.ts`. הכלי כבר כתוב ונבדק מול זיוף.
- **WG5-T06:** יישור, פיזור, סדר שכבות, קיבוץ, שכפול והעתקה מ-`@slidr/model` (`compose/`).

</div>
