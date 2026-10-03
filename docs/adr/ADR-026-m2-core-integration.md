<div dir="rtl">

# ADR-026 — ליבת M2: התשתית המשותפת, השילוב, ומה חסר עד שהאפליקציה תריץ את זה

סטטוס: **הוכרע, חוץ מהסעיפים שתחת "החלטות שמחכות לך"** · 2026-10-03 · ענף: `m2-core` (worktree נפרד, יוצא מ-`0004502`) · משימות: WG9A, WG7-T05, WG10-T08, WG10-T04

ארבע המשימות נבנו במקביל על ידי ארבעה סוכנים, כל אחת עם ADR משלה:

| משימה | ADR | קוד |
|---|---|---|
| WG9A, מנוע ההמרה מ-HTML | [ADR-017](ADR-017-html-conversion-engine.md) | `packages/html-import` |
| WG7-T05, מנוע ה-lint וכללים L01–L07, L13, L16 | [ADR-018](ADR-018-design-lint.md) | `packages/lint`, `packages/renderer/src/measure.ts`, `apps/desktop/src/lint` |
| WG10-T08, ה-prompt ובלוק ההקשר | [ADR-019](ADR-019-prompts-and-context.md) | `packages/prompts` |
| WG10-T04, גשר ה-MCP | [ADR-022](ADR-022-mcp-bridge.md) | `apps/desktop/src-tauri/src/mcp_bridge`, `apps/desktop/src/agent/toolBridge.ts` |

המסמך הזה מתעד את מה שלא שייך לאף אחת מהן: מה שנקבע לפני שהעבודה חולקה, מה שתוקן בשילוב, מה שנבדק יחד, ומה שהמיזוג עם סבב M1 צריך לדעת.

**שום דבר מכל זה לא הורץ בתוך האפליקציה.** הסשן הזה לא הריץ שרת פיתוח ולא E2E (הפורט 1420 שייך לסשן של M1), ושום קוד לא מחובר ל-shell.

## ההחלטה

1. **`Slide.archetype`, שדה אופציונלי.** שקף שנכתב כ-HTML הוא בלי layout, ולכן לא היה לו ארכיטיפ. ADR-011 סימן את זה כחסר.
2. **`renderSlideOffscreen` ו-`settle` ב-`packages/renderer`.** שני צרכנים (lint, שומר הנאמנות) צריכים לרנדר מצב מצגת שאינו על המסך ולחכות שיתייצב.
3. **בדיקות בדפדפן אמיתי כחלק מה-repo:** `pnpm test:browser`, קבצי `*.browser.test.ts(x)`.
4. **בשילוב:** מוסכמות ה-HTML ב-prompt יושרו מול המנוע; `element_convert` מוצג גם לסשן אובייקט; נתיב מקומי הוסר מסיכום תוצאת כלי; ובדיקה אחת מריצה את כל המסלול יחד.

## 1. `Slide.archetype`

- `packages/model/src/schema/deck.ts`: `archetype: Archetype.optional()` ב-`Slide`.
- `packages/model/src/commands/slide.ts`: `slide.update` מקבל `archetype` (ערך, או `null` להסרה).
- `packages/model/src/queries.ts`: `slideArchetype(deck, slide)` מחזיר את הארכיטיפ של ה-layout, ואם אין layout את זה של השקף.
- `packages/agent-tools`: `deck_get_outline` משתמש ב-`slideArchetype`; `slide_update` מקבל `archetype`.

זה שינוי בחוזה שנסגר בתחילת M1 (PLAN סעיף 3, סכמת המודל). הוא תוספת בלבד: שדה אופציונלי, בלי הגירה ובלי שינוי ב-`SCHEMA_VERSION`. שלושה צרכנים נשענים עליו: `data-archetype` במנוע ההמרה, L16 ב-lint (שקף שאינו ציטוט או מפריד מקטע), ו-`deck_get_outline`. L14 (P1) יצטרך אותו גם.

**חלופה שנדחתה:** לגזור ארכיטיפ רק מה-layout. אז כל שקף שה-Agent כותב ב-HTML, שזה נתיב היצירה הראשי, היה בלי ארכיטיפ, ו-L16 היה מתריע גם על שקפי ציטוט.

## 2. רינדור מחוץ למסך

`packages/renderer/src/offscreen.tsx`:

<div dir="ltr">

```ts
renderSlideOffscreen(props: SlideRendererProps, { parent?, hidden? }): Promise<{ root, container, dispose }>
```

</div>

- מרנדר `SlideRenderer` ב-1920×1080 במיכל `position: fixed` בפינת החלון. ברירת המחדל היא `visibility: hidden`: יש פריסה, אין ציור. `hidden: false` למי שצריך פיקסלים.
- מחכה ל-`settle` לפני שהוא חוזר.
- `settle` עבר מ-`apps/desktop/src/capture/settle.ts` ל-`packages/renderer/src/settle.ts`. הקובץ הישן מייצא אותו מחדש, כך שדפי הפיתוח וחלון הצילום לא השתנו.
- **טיימר גיבוי ב-`settle`.** הוא חיכה לשני frames בלי גבול זמן, וחלון ממוזער לא מקבל frames. עכשיו טיימר של 250ms עומד במקומם. בלי זה lint אחרי כתיבה של ה-Agent היה נתקע כשהמשתמש ממזער את החלון באמצע בניית מצגת, והקריאה לכלי הייתה נופלת ב-timeout. נבדק עם `requestAnimationFrame` שאינו קורא לעולם; לא נבדק בחלון ממוזער אמיתי.

## 3. בדיקות בדפדפן אמיתי

- `vitest.browser.config.ts`: Vitest במצב browser, ספק Playwright, `channel: 'msedge'` (ה-Edge המותקן, אותו מנוע של WebView2), headless, חלון 1920×1080.
- כולל `packages/*/src/**/*.browser.test.{ts,tsx}` ו-`apps/*/src/**/*.browser.test.{ts,tsx}`. הריצה הרגילה (`pnpm test`) מדלגת עליהם.
- Vitest מגיש את הקבצים בעצמו, על פורט משלו. אין שרת פיתוח ואין אפליקציה.
- תלויות חדשות בשורש: `@vitest/browser-playwright` 5.0.3 ו-`playwright` 1.63.0 (שכבר היה בעץ דרך `@playwright/test`).
- **`pnpm check` לא מריץ אותן.** ראה "החלטות שמחכות לך".

המנוע של ADR-005 רץ ב-spike על Playwright ב-Node. כאן הקוד נבדק כמו שהוא ירוץ: בתוך הדף, מול DOM אמיתי. E2E של האפליקציה (`apps/desktop/e2e`, פורט 1420) הוא דבר אחר ולא הורץ.

## 4. מה נעשה בשילוב

**מוסכמות ה-HTML.** ה-prompt נכתב במקביל למנוע, מ-SPEC 11.5. אחרי שהמנוע נסגר יושר `packages/prompts/src/html.ts` מול הפרק "המוסכמות שהמנוע מכבד" ב-ADR-017. ההבדל המהותי היה צורת `data-chart`: ה-prompt לימד JSON שטוח, והמנוע מצפה ל-`{"chartType", "data": {"categories", "series"}}`. בלי היישור כל גרף שה-Agent כותב היה נשאר `html`. הטבלה המלאה ב-ADR-019. גם `HTML_HELP` שבתיאורי הכלים קיבל את `data-archetype`.

**`element_convert` בסשן אובייקט.** ADR-017 הכריע: החלפה במקום, תחת אותו מזהה. ה-prompt הסתיר את הכלי מסשן אובייקט לפני ההכרעה; השורה נמחקה, ומודול האובייקט מתאר את ההתנהגות.

**נתיב מקומי בסיכום תוצאה.** ה-CLI שומר כל תמונה שחוזרת מכלי ומוסיף לתוצאה שורה `[Image: source: C:\Users\<user>\.claude\…png]` (ממצא של ADR-022). `summarize` ב-`harness/claude_code.rs` העביר אותה ל-`tool_call_finished.summary`, ומשם היא הייתה מגיעה לשבב בצ'אט ולתמלול שנשמר בקובץ המצגת (T09). `summarize` משמיט אותה עכשיו, עם בדיקה. לא נבדק מול ה-CLI האמיתי אחרי התיקון.

**בדיקת המסלול כולו:** `apps/desktop/src/agent/slideFromHtml.browser.test.ts`, 4 בדיקות בדפדפן. היא מרכיבה את מה ש-`AgentService` ירכיב, בלי התהליך שבצד השני:

- `createDeckApi` עם מנוע ההמרה האמיתי ושירות ה-lint האמיתי;
- ה-prompt נבנה מ-`api.list('deck')`, אותה רשימה שהגשר מפרסם, ומציג בדיוק את הכלים שיש לסשן;
- שקף עברי שנכתב כ-HTML עם משתני Theme נכנס כאובייקטים: עריכוּת 1, `archetype` מ-`data-archetype`, צבעים מקושרים ל-tokens, כיוון `rtl`, ואפס ממצאי "שגיאה";
- שקף חלש חוזר עם L04, L05, L07 ו-L16 בתוך תשובת הכלי, כפי שה-Agent קורא אותה (דרך `toReply` של הגשר);
- שתי כתיבות בתור אחד הן transaction אחד; `ChangeDigest` לא מדווח לסשן על הכתיבות שלו, ובלוק ההקשר של התור הבא מדווח על עריכה של המשתמש.

מה שהיא **לא** בודקת: ה-harness, הגשר ב-Rust, ה-IPC, והמימוש של `ConversionHost` באפליקציה (היא משתמשת ב-host של בדיקות).

## מצב הבדיקות (2026-10-03, בסוף השילוב)

| בדיקה | תוצאה |
|---|---|
| `pnpm check` (typecheck, eslint, prettier, Vitest ב-Node) | עובר; 546 בדיקות ב-44 קבצים (359 לפני שהעבודה חולקה) |
| `pnpm test:browser` | עובר; 65 בדיקות ב-10 קבצים |
| `cargo fmt --all --check`, `cargo clippy … -D warnings` | נקי |
| `cargo test --workspace` | 88 עוברות, 4 מסומנות `#[ignore]` |
| מול Claude Code האמיתי (Haiku), פעמיים | ראשונה עברה: כלי אחד נקרא דרך הגשר. שנייה: התמונה הגיעה ל-CLI, הבדיקה נכשלה על assertion שגוי; התיקון לא הורץ שוב. סה"כ $0.0138 |

**קריטריון ה-grep של PLAN (WG10):**

- `claude` מופיע מחוץ למותר רק ב-`storage/workspace.rs`, בנתוני בדיקה שהיו שם לפני הענף.
- `mcp` מופיע מחוץ ל-`mcp_bridge/` ולמתאם בשלושה מקומות: שורת `#[path = "mcp_bridge/mod.rs"]` ב-`lib.rs`, שם ה-crate `rmcp` ב-`Cargo.toml`, והערה `MCP-03` ב-`packages/model/src/jsonSchema.ts` שהייתה שם קודם. ב-TypeScript של האפליקציה ובשמות פקודות ה-IPC המילה לא מופיעה.

## מה חסר עד ש-"צור שקף" ירוץ באפליקציה

לפי סדר התלות:

1. **`ConversionHost` באפליקציה** (ADR-017, "נדרש מחוץ להיקף"). המנוע צריך צילום של אזור בדף שבו הוא רץ. היום יש רק `capture_slide`, שמצלם שקף בחלון הצילום. נדרשת פקודת Rust שמצלמת `clip` של ה-webview הקורא, והחלטה איפה המנוע רץ (ההצעה: בחלון הצילום הנסתר). ייתכן שנדרשת הרשאה ב-`capabilities/default.json`, שהסשן הזה לא נגע בו. **בלי זה `slide_create_from_html` לא עובד באפליקציה.**
2. **`AgentService` (WG11).** הסדר, מארבעת ה-ADR-ים:
   - פעם אחת בעלייה: `connectToolBridge(handler)`.
   - `createDeckApi(bus, { ui, capture, conversion: createConversionService(host), lint: createLintService(resolveAsset) })`.
   - לכל סשן: `tools = api.list(scope.kind)`, ואז `bridge.open(tools)` (מחזיר `sessionKey` ו-`endpoint`), `systemPrompt({ scope: scope.kind, tools: tools.map(t => t.name) })`, ו-`agent_start` עם `toolEndpoint` ועם ה-prompt.
   - לכל תור: `startTurn(sessionKey, scope)`, `contextBlock({ scope, deck, selection, changes: digest.take(sessionKey) })`, ו-`agent_send`.
   - ה-`handler`: `(sessionKey, name, input) => api.call(turnOf(sessionKey), name, input)`.
   - אותו מזהה (`sessionKey`) משמש ב-`startTurn` וב-`digest.take`. אחרת ה-Agent שומע שהכתיבות שלו עצמו הן שינויים של מישהו אחר.
3. **שער האיכות (WG10-T13).** ה-prompt כבר מתאר אותו. שני דברים שהוא מניח: צילום שחזר עם הכתיבה נספר כ"הסתכלות", והודעות ההמשך נשלחות בתוך תגית `<slidr_…>`.
4. **הרצה אחת באפליקציה** של כל מה שסומן "לא נבדק" בארבעת ה-ADR-ים: ארבע פקודות ה-IPC של הגשר, פיקסלים של נכסים דרך ה-asset protocol (L05 מעל תמונה), הגופנים המובנים ב-sandbox של ההמרה, ו-`devicePixelRatio` שאינו 1.

## מיזוג עם סבב M1

הענף יוצא מ-`0004502`, לפני סבב M1 שעדיין לא ב-commit בעץ הראשי. מחוץ לארבע החבילות, הענף נגע בקבצים האלה:

| קובץ | מה | סיכון |
|---|---|---|
| `packages/model/src/schema/deck.ts`, `commands/slide.ts`, `queries.ts` | `archetype` | נמוך: סבב M1 שינה במודל את `store.ts` ואת `compose/` |
| `packages/renderer/src/index.ts`, `settle.ts`, `offscreen.tsx`, `measure.ts` | שלושה מודולים חדשים וייצוא | נמוך |
| `apps/desktop/src/capture/settle.ts` | הפך לייצוא מחדש | נמוך |
| `packages/agent-tools/src/` (`scope.ts`, `tools/read.ts`, `tools/slides.ts`, `tools/services.ts`, `tools/deck.ts`) | `archetype`, `element_convert` | נמוך |
| `package.json` (שורש), `vitest.config.ts`, `vitest.browser.config.ts` | סקריפט, שתי תלויות, החרגה | בינוני אם M1 שינה את `package.json` |
| `apps/desktop/package.json` | `@slidr/lint`, `@slidr/html-import`, `@slidr/prompts` | בינוני אם M1 הוסיף תלויות |
| `pnpm-lock.yaml`, `Cargo.lock`, `apps/desktop/src-tauri/Cargo.toml` | תלויות | קובצי נעילה: להריץ `pnpm install` אחרי המיזוג ולא למזג ידנית |
| `apps/desktop/src-tauri/src/lib.rs`, `harness/*` | רישום הגשר, צעד `call` ב-mock, `summarize` | נמוך |

- **לא נגעתי** ב-`apps/desktop/src/{shell,stage,text,objects,arrange,controls}`, ב-`packages/ui`, ב-`packages/model/src/compose`, ב-`docs/PLAN.md`, ב-`docs/SPEC.md`, ב-`capabilities/default.json` וב-`packages/model/src/store.ts`.
- **ההצעה:** סבב M1 נכנס ל-commit ראשון, ואז `m2-core` עובר rebase עליו.
- **`README.md`:** רשימת ה-ADR-ים צריכה את 017, 018, 019, 022 ו-026. לא עודכנה כאן, כי סבב M1 מוסיף באותו מקום את 013 עד 016.
- **מספור ה-ADR-ים.** הענף קיבל "מ-ADR-017 והלאה", והסשן של M5 קיבל "מ-ADR-020". חמישה מסמכים לא נכנסים בשלושה מספרים, ולכן הגשר ומסמך השילוב נכתבו תחילה כ-020 ו-021 והתנגשו עם `ADR-020-runtime` ו-`ADR-021-html-export` שב-`../Slidr-m5`. הם מוספרו מחדש ל-022 ול-026: המספרים הפנויים שנמצאו ב-2026-10-03 בארבעת ה-worktrees (023 ב-`../Slidr-templates`, 025 ב-`../Slidr-images`). אם 022 או 026 הוקצו למישהו אחר, זה שינוי של שם קובץ ושל ההפניות אליו.
- **`docs/PLAN.md` ו-`docs/SPEC.md`:** כל אחד מארבעת ה-ADR-ים מונה את העדכונים שהוא מבקש. העיקריים: תוצאות WG9A, WG7-T05, WG10-T04 ו-T08 ב-PLAN; קריטריון ה-grep; SPEC 11.5 (קישור ל-token רק דרך `var()`, ערכי `data-anim`, `data-archetype`); MCP-03 (רישום כלים לכל סשן); 11.6 (שדות בלוק ההקשר); 14.2 (`html-import` תלוי גם ב-`renderer`).

## החלטות שמחכות לך

1. **מתווה לפני בנייה.** בסשן מצגת, כשהמשתמש נותן נושא בלי מבנה, ה-prompt מורה ל-Agent להציע מתווה ולחכות לאישור. זה מוסיף צעד לתרחיש של M2 ("לבקש מצגת ולראות אותה נבנית"). AID-03 הוא P1.
2. **QG-01:** צילום שחוזר עם כתיבת ה-HTML נספר כ"הסתכלות", במקום קריאה נפרדת ל-`slide_render`.
3. **קישור ל-Theme רק דרך `var()`**, ולא לפי שוויון ערכים כמו ש-SPEC 11.5 מנסח. הנימוק ב-ADR-017: טקסט לבן על רקע כהה היה מקושר ל-`bg`.
4. **L16 פוטר גם `bigNumber`**, בנוסף לציטוט ולמפריד מקטע ש-QG-04 מונה.
5. **SPEC 9.1 סותר את עצמו:** caption הוא 20–24px והמינימום המוחלט 24px. סגנון ה-caption של תבנית הבסיס הוא 22px, ו-L04 מתריע עליו.
6. **lint לכל המצגת אחרי `theme_update`** (נקודה פתוחה מ-ADR-011): כ-35ms לשקף, כשנייה ל-30 שקפים. לא נעשה.
7. **בידוד הייבוא ב-M3** (ADR-017): המנוע קורא את ה-DOM ישירות, וקובץ מיובא צריך גם scripts; שני הדגלים יחד מבטלים את ה-sandbox של ה-`iframe`. ההצעה היא חלון webview ייעודי לייבוא. צריך הכרעה לפני WG9-T14.
8. **`pnpm test:browser` בתוך `pnpm check`?** היום הוא סקריפט נפרד. הוספה שלו מאריכה את `check` בכ-15 שניות ודורשת Edge מותקן.
9. **גודל ה-prompt:** כ-26,800 תווים לסשן מצגת (הערכה: כ-6,700 tokens), בערך פי שניים מה-prompt המובנה שהוא מחליף.

</div>
