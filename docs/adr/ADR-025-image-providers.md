<div dir="rtl">

# ADR-025 — ספקי תמונות: החוזה, השירות וספק `codex-cli`

סטטוס: **הוכרע** · 2026-10-03 · משימות: WG12-T01, T02 · קוד: `apps/desktop/src-tauri/src/image_providers/`, `apps/desktop/src/images/`

זה החוזה ש-PLAN סעיף 3 קורא לו `ImageProvider`, ו-WG11 בונה עליו את גלריית התמונות. המסמך ממשיך את [ADR-004](ADR-004-image-provider.md) (מה ש-Codex CLI יודע לעשות) ובנוי כמו [ADR-010](ADR-010-agent-harness.md) (אותה בעיה, עבור ה-Agent).

## ההחלטה

1. **קריאה אחת לספק היא תמונה אחת.** השירות מריץ N קריאות במקביל. כך לכל תמונה יש מצב משלה וביטול משלה בלי שהספק יצטרך לדעת על כך, וזה גם מה ש-ADR-004 מצא (N תמונות הן N תהליכים). ספק HTTP עתידי יעבוד באותה צורה.
2. **התוצאה היא ערך ההחזרה של הקריאה; האירועים הם רק התקדמות.** `image_generate` חוזר כשכל התמונות הסתיימו, עם תוצאה אחת לכל תמונה. ב-Tauri אין הבטחה על הסדר בין הודעות ה-Channel לבין תשובת ה-`invoke`, ולכן מי שצריך את התוצאה לא נשען על האירועים.
3. **מזהה העבודה (job) בא מהקורא.** כך אפשר לבטל עבודה שהקריאה שלה עוד לא חזרה.
4. **ביטול הוא אות שהספק מחויב לכבד**, ולא השלכה של ה-future. הספק הורג את התהליך, מחכה שייגמר, מנקה, ורק אז חוזר. לכן כשהקריאה חוזרת לא נשאר תהליך. `kill_on_drop` נשאר כגיבוי.
5. **ספק מחזיר bytes, והשירות מכניס אותם לנכסי ה-workspace** (`assets::import_bytes`). אין תיקיית ביניים, וכל ספק מנקה רק את מה שהוא עצמו יצר.
6. **מגבלת מקביליות לכל ספק, על פני כל העבודות** (`maxParallel`, ב-`codex-cli` ארבע). תמונה חמישית מחכה בתור.
7. **שגיאות: `{ kind, message }` עם סט סגור של 13 סוגים**, בטיפוס של המודול עצמו, כמו ב-`harness` וב-`capture`. שגיאות האחסון (`error.rs`) מומרות ושומרות על הסוג שלהן. `error.rs` עצמו לא שונה.
8. **ספק ברירת המחדל נשמר ב-`<app_data>/image-providers.json`.** כשאין בחירה, או שהספק שנבחר כבר לא רשום, ברירת המחדל היא הספק הראשון ברישום (`codex-cli`). קובץ נפרד, כי עדיין אין מודול הגדרות; כשיהיה, הערך עובר אליו.
9. **`codex-cli` מפעיל את `codex.exe` עצמו, לא את ה-shim של npm** (ראה "הפעלה" למטה).
10. **הקבצים ש-Codex משאיר נמחקים**: התיקייה `generated_images/<thread_id>/` ותיקיית העבודה הזמנית.
11. **התצוגה המקדימה ל-Agent נוצרת ב-webview (canvas), לא ב-Rust.** היא עובדת על כל פורמט שה-webview מציג (גם JPEG של סטוק ב-T06), ולא מוסיפה מפענח תמונות ל-Rust.
12. **ה-UI וה-TypeScript מכירים רק descriptors, עבודות ותוצאות.** המילה codex מופיעה רק ב-`image_providers/codex_cli.rs`, ב-`image_providers/codex_cli/` (הקלטות ו-CLI מדומה) וב-`image_providers/registry.rs`.

לא נוספה אף תלות ל-`Cargo.toml`.

## הממשק

<div dir="ltr">

```rust
#[async_trait]
pub trait ImageProvider: Send + Sync {
    fn descriptor(&self) -> ProviderDescriptor;      // id, name, capabilities
    async fn probe(&self) -> ProviderStatus;         // never fails; a failure is a state
    async fn generate(&self, request: &GenerateRequest, cancel: Cancel) -> Result<GeneratedImage>;
    async fn edit(&self, request: &EditRequest, cancel: Cancel) -> Result<GeneratedImage>;
}

pub struct GenerateRequest { pub prompt: String, pub aspect: Aspect }       // 16:9, 4:3, 1:1, 3:4, 9:16
pub struct EditRequest { pub source: PathBuf, pub mask: Option<PathBuf>, pub instruction: String }
pub struct GeneratedImage { pub bytes: Vec<u8> }
```

</div>

**`capabilities`** (מה שה-UI קורא כדי להסתיר את מה שהספק לא יודע):

| שדה | ערכים | `codex-cli` | `mock` |
|---|---|---|---|
| `edit` | `none` / `regenerate` / `exact` | `regenerate` | `exact` |
| `mask` | בוליאני | `false` | `true` |
| `transparent` | בוליאני | `false` | `false` |
| `maxParallel` | מספר | 4 | 4 |

`regenerate`: תמונה חדשה שצוירה לפי המקור. היא דומה לו, אבל אף פיקסל שלו לא נשמר (ADR-004). `exact`: המקור, כשרק מה שהתבקש השתנה.

## עבודה: אירועים ותוצאה

<div dir="ltr">

```json
{ "type": "started", "index": 0 }
{ "type": "finished", "index": 0, "outcome": {
    "status": "stored",
    "asset": { "id": "df7d…", "file": "df7d….png", "mime": "image/png", "kind": "image",
               "bytes": 2109801, "width": 1672, "height": 941 },
    "durationMs": 48528 } }
{ "type": "finished", "index": 1, "outcome": {
    "status": "failed", "error": { "kind": "cancelled", "message": "the job was cancelled" } } }
```

</div>

- **לכל תמונה:** `started` פעם אחת, ואחריו `finished` פעם אחת. תמונה שהעבודה שלה בוטלה בזמן שחיכתה בתור מקבלת רק `finished`.
- **אין אירוע התקדמות** (ADR-004 כלל 6). בין שני האירועים ה-UI מציג שלד.
- **הקריאה מחזירה** `{ provider, images }`: תוצאה לכל תמונה, לפי הסדר.
- **תמונה שנכשלה לא מכשילה את האחרות.** הקריאה כולה נדחית רק כששום דבר לא התחיל: ספק לא קיים, workspace סגור, קלט לא תקין, או יכולת שהספק לא תומך בה.
- **`durationMs`** הוא הזמן של הספק, בלי ההמתנה בתור.
- הצורה המדויקת קבועה ב-`image_providers/fixtures/contract.json`, ושני הצדדים נבדקים מולו.

**סוגי שגיאה:** `unknown_provider`, `unknown_workspace`, `not_found`, `invalid_input`, `unsupported`, `not_installed`, `not_logged_in`, `quota`, `timeout`, `cancelled`, `generation_failed`, `io`, `internal`.

ה-`message` באנגלית, ומנוסח כהנחיה כשיש מה לעשות. בשונה משגיאות האחסון, הוא מגיע ל-Agent כתוצאה של קריאת הכלי.

## פקודות IPC

| פקודה | ארגומנטים | מחזיר |
|---|---|---|
| `image_providers` | — | `ProviderDescriptor[]` |
| `image_probe` | `providerId` | `state` (`ready` / `not_installed` / `not_logged_in` / `unavailable`), `version`, `account`, `detail` |
| `image_default_provider` | — | מזהה ספק |
| `image_set_default_provider` | `providerId` | — |
| `image_generate` | `jobId`, `workspaceId`, `job` (`prompt`, `count`, `aspect`, `provider?`), `onEvent` | `{ provider, images }` |
| `image_edit` | `jobId`, `workspaceId`, `job` (`assetId`, `instruction`, `maskAssetId?`, `count`, `provider?`), `onEvent` | `{ provider, images }` |
| `image_cancel` | `jobId` | — |

- `count` בין 1 ל-8. `jobId`: אותיות, ספרות, `-` ו-`_`.
- `image_edit` מקבל **מזהה נכס**, לא נתיב. Rust מוצא את הקובץ ב-`assets/` של ה-workspace לפי המזהה, ומוודא שהוא תמונת raster.
- **מסכה מול ספק בלי `mask`** נדחית כ-`unsupported` לפני שמשהו רץ, עם הסבר ("it redraws the whole image").
- `image_cancel` על עבודה שכבר הסתיימה לא עושה כלום. תמונות שכבר נשמרו נשארות.

## ספק `codex-cli`

### הפעלה: לא דרך ה-shim

ב-Windows, התקנה מ-npm שמה ב-PATH רק `codex.cmd`. הוא מריץ `node codex.js`, וזה מריץ את התוכנית האמיתית:

<div dir="ltr">

```
<npm>\codex.cmd
<npm>\node_modules\@openai\codex\bin\codex.js
<npm>\node_modules\@openai\codex\node_modules\@openai\codex-win32-x64\vendor\x86_64-pc-windows-msvc\bin\codex.exe
```

</div>

הספק מוצא את `codex.exe` ומפעיל אותו ישירות, עם ה-prompt כארגומנט אחד. שתי סיבות:

- **`.cmd` עובר דרך `cmd.exe`**, והציטוט שלו שביר ופתוח להזרקה כשהארגומנט הוא טקסט חופשי.
- **עם `node` באמצע, ביטול הורג את `node` ומשאיר את `codex.exe` רץ.**

החיפוש זהה לזה של `codex.js`: חבילת הפלטפורמה ב-`node_modules` הקרוב, ואחריה `vendor/` של החבילה עצמה. `codex.exe` שנמצא ישירות ב-PATH (התקנה עצמאית) מקבל עדיפות. כשנמצא רק ה-shim, `probe` מחזיר `not_installed` עם הסבר. החיפוש נעשה בכל שימוש, כך שהתקנה של Codex לא דורשת הפעלה מחדש של האפליקציה.

### שורת הפקודה

זהה ל-ADR-004, והבדיקה משווה מחרוזת מול מחרוזת:

<div dir="ltr">

```
codex exec --json --skip-git-repo-check --ignore-user-config --ignore-rules --ephemeral
  -s read-only "<prompt>" [-i <reference>]

cwd = empty temp dir, stdin = null
```

</div>

| כלל ב-ADR-004 | במימוש |
|---|---|
| 1. הקובץ לפי `thread_id`, לא לפי הטקסט | ה-`thread_id` נקרא מ-`thread.started`, נבדק שהוא מזהה פשוט (הוא הופך לשם תיקייה), והתמונה נקראת מ-`generated_images/<thread_id>/` |
| 2. יותר מקובץ אחד | הקובץ ששמו מופיע בהודעה האחרונה של ה-Agent; אם אין כזה, החדש ביותר |
| 3. ה-prompt לפני `-i` | כך נבנית הרשימה. ה-CLI המדומה מפרש את הארגומנטים כמו האמיתי, ולכן רגרסיה נכשלת בבדיקה |
| 4. יחס התמונה בניסוח | `Create ONE wide 16:9 landscape image: …`, וכן `4:3 landscape`, `square 1:1`, `3:4 portrait`, `tall 9:16 portrait` |
| 5. תהליך לכל תמונה, ביטול בהריגה | כך |
| 6. אין התקדמות | רק `started` ו-`finished` |

עוד פרטים:

- **ה-prompt תמיד מתחיל במשפט קבוע** ("Use your image generation tool…"), ולכן הוא לא יכול להיקרא כדגל גם כשהמשתמש כתב `--help`.
- **אורך ה-prompt מוגבל ל-8,000 תווים** (`invalid_input`). שורת הפקודה ב-Windows מוגבלת לכ-32,000.
- **תמונה מתקבלת רק מריצה שהסתיימה כראוי:** `turn.completed` וקוד יציאה 0. בכל מקרה אחר מוחזרת שגיאה, גם אם יש קובץ, כי הוא עלול להיות חלקי.
- **`CODEX_API_KEY` ו-`OPENAI_API_KEY` מוסרים מסביבת התהליך.** ההבטחה של הספק היא ההתחברות של ChatGPT, ומפתח שהוגדר במקרה לא אמור להפוך ריצה לריצה בתשלום לפי שימוש.
- **`probe`:** `codex --version` ו-`codex login status`. התשובה של `login status` מגיעה ב-stderr. `account` הוא `ChatGPT` או `API key` בלבד; עם מפתח ה-CLI מדפיס חלק ממנו, וזה לא עובר הלאה.
- **`edit`:** `-i <קובץ הנכס>` עם ההנחיה. זו יצירה מחדש לפי תמונת ייחוס (`regenerate`), בלי מסכה.

### שגיאות, timeout וביטול

| מה קרה | `kind` | איך מזוהה |
|---|---|---|
| התוכנית לא נמצאה | `not_installed` | החיפוש ב-PATH, או `NotFound` בהפעלה |
| אין התחברות | `not_logged_in` | `turn.failed` עם `401 Unauthorized` (הוקלט) |
| מכסה מוצתה | `quota` | `turn.failed` עם `usage limit`, `rate limit`, `429 Too Many Requests`, `quota` (**לא הוקלט**) |
| הבקשה נדחתה, או שה-CLI קרס | `generation_failed` | `turn.failed` אחר, או יציאה בלי `turn.completed`. ההודעה כוללת את דברי ה-CLI או את סוף ה-stderr |
| הריצה הסתיימה בלי תמונה | `generation_failed` | אין קובץ בתיקייה. ההודעה כוללת את מה שה-Agent של Codex אמר |
| התהליך נתקע | `timeout` | 240 שניות (פי 2.5 מהריצה האיטית שנמדדה), ואז הריגה |
| בוטל | `cancelled` | אות הביטול, ואז הריגה |

- **לא נכשלים מוקדם על 401.** בלי התחברות ה-CLI מנסה שוב במשך כ-15 שניות לפני שהוא מוותר. הספק מחכה ל-`turn.failed` ולא הורג בשגיאה הראשונה, כי התחברות שפגה עשויה להתחדש באחד הניסיונות האלה.
- **מספרי סטטוס לא מזוהים לבדם** (`401`, `429`). מזהי הבקשות הם hex ועלולים להכיל אותם במקרה; הזיהוי הוא לפי צירופים כמו `status 401` ו-`unauthorized`.

### מה נשאר בדיסק

| מה | מה קורה לו |
|---|---|
| תיקיית העבודה הזמנית (`%TEMP%\slidr-image-<uuid>`) | ריקה, כדי של-Agent של Codex לא יהיה מה לקרוא. נמחקת בסוף כל ריצה: הצלחה, כישלון, ביטול או timeout |
| `$CODEX_HOME/generated_images/<thread_id>/` | נקראת לזיכרון ונמחקת. התמונה כבר שמורה ב-workspace, ואין מה שמפנה לתיקייה (`--ephemeral` לא שומר סשן). נמחקת גם אחרי כישלון וביטול. רק התיקייה של ה-thread של הריצה עצמה |
| תיקיות ישנות ב-`generated_images` (של ה-spike, או של שימוש אחר ב-Codex) | לא נוגעים |

בלי המחיקה כל תמונה משאירה כ-2MB בתיקייה שהמשתמש לא מכיר.

## הספק המדומה

- **ב-Rust (`mock.rs`, `id: "mock"`):** מוצע ב-build של debug, או בכל build כש-`SLIDR_IMAGE_MOCK` מוגדר. מצייר gradient ביחס שהתבקש, שונה מתמונה לתמונה (כך ש-N תמונות הן N נכסים), אחרי כשנייה וחצי. הפלט הוא BMP: הפורמט היחיד שלא צריך מקודד כדי לכתוב אותו.
- **בדפדפן רגיל (`memoryImages.ts`):** אותו דבר בלי Rust, על canvas ועם ה-`AssetService` של העמוד. זה המקביל של `memoryAssets`.
- **מילה ב-prompt בוחרת כישלון**, בשניהם:

| מילה | מה קורה |
|---|---|
| `mock:quota`, `mock:not_logged_in`, `mock:not_installed`, `mock:timeout`, `mock:fail` | התמונה נכשלת בסוג הזה |
| `mock:flaky` | כל תמונה שלישית נכשלת |
| `mock:hang` | לא מסתיימת עד שמבטלים |

## הצד של TypeScript

`apps/desktop/src/images/`:

| קובץ | מה |
|---|---|
| `images.ts` | הטיפוסים של החוזה, `ImageError`, והממשק `ImageClient` |
| `tauriImages.ts` | `ImageClient` מעל IPC |
| `imageService.ts` | `createImageService`: מקיים את `ImageService` של `@slidr/agent-tools` |
| `preview.ts` | `previewOf(url)`: PNG של עד 512 פיקסלים בצלע הארוכה |
| `memoryImages.ts` | `ImageClient` לדפדפן רגיל |
| `appImages.ts` | `createAppImages(document, assets)`: בוחר בין השניים כמו ש-`editor.tsx` בוחר נכסים |

**החיבור** (למי שמשלב):

<div dir="ltr">

```ts
const images = createAppImages(document, assets);   // document: DocumentService | null
const api = createDeckApi(bus, { images: images.service /* , … */ });
// images.client: providers, jobs with progress and cancel, for the gallery (WG11)
// images.service.cancel(): from the stop button of the agent's turn
```

</div>

איך `ImageService` מתקיים:

- **`generate` ו-`edit`** מחזירים `StoredImage[]`. הנכס הוא `AssetMeta` עם `origin: "ai"` ו-`lineage` (`provider`, `prompt`, וב-edit גם `parentAssetId`), ועובר את הסכמה המחמירה של `asset.add`.
- **כישלון חלקי:** מוחזרות התמונות שנוצרו. כששום תמונה לא נוצרה, הקריאה נדחית עם השגיאה הראשונה, וה-Agent רואה את ה-`message` שלה.
- **עבודה שבוטלה** נדחית כ-`cancelled`, גם אם חלק מהתמונות כבר נוצרו. המשתמש עצר, ולכן שום דבר לא נכנס למצגת.
- **`edit` דרך `codex-cli` הוא יצירה מחדש.** המגבלה נראית לקורא בשני מקומות: `capabilities.edit === "regenerate"`, ו-`maskAssetId` שנדחה כ-`unsupported`.
- **`process` (הסרת רקע) שייך ל-T05.** הוא נדחה כ-`unsupported` עם הודעה ברורה. הממשק מחייב את המתודה, ולכן היא קיימת.
- **תצוגה מקדימה שנכשלה** מוחלפת בפיקסל שקוף. התמונה כבר נוצרה ושולמה, והיא לא אמורה להפוך לשגיאה.
- **`cancel()`** מבטל את כל העבודות שהשירות מריץ כרגע. `ImageService` עצמו לא מקבל אות ביטול, ולכן זו מתודה נוספת על האובייקט.

## מדידות

Codex CLI ‏0.160.0 ב-Windows, התחברות ChatGPT, 2026-10-03. הכול דרך `ImageService` אל workspace אמיתי.

| בדיקה | תוצאה | ב-ADR-004 |
|---|---|---|
| תמונה אחת, 16:9 | 48.5 שניות. PNG של 1672×941, ‏2.06MB, נכס ב-workspace | 51 שניות |
| עריכה עם תמונת ייחוס | 77.7 שניות. 1672×941, ‏2.09MB. אותה קומפוזיציה, מצוירת מחדש כלילה | 95 שניות |
| ארבע במקביל, 1:1 | 88.2 שניות בסך הכול: 47.7, 49.5, 56.6 ו-88.2. ארבע מתוך ארבע, 1254×1254, ‏1.4–1.5MB כל אחת | 60 שניות (43–60) |
| ביטול אחרי 20 שניות של יצירה | חזר תוך 0.02 שניות. לא נשאר תהליך `codex.exe`, לא קובץ ולא נכס | — |
| ריצה בלי התחברות (`CODEX_HOME` ריק) | `not_logged_in` אחרי 17.5 שניות | — |
| ביטול באמצע הניסיונות החוזרים של אותה ריצה | 0.02 שניות, לא נשאר תהליך | — |
| `probe` | פחות משנייה: `ready`, `0.160.0`, `ChatGPT` | — |
| prompt אחרי `-i` (ישירות מול ה-CLI) | נכשל תוך 0.5 שניות: "No prompt provided via stdin" | 0.1 שניות |

- **נוצלו 7 תמונות מתוך תקציב של 8:** 2 (יצירה ועריכה), 4 (מקביל), 1 (בוטלה).
- **"כדקה לארבע" לא מובטח.** אחת מהארבע לקחה 88 שניות, והזמן של העבודה הוא הזמן של האיטית.
- **אחרי כל הריצות:** ב-`generated_images` נשארו רק שבע התיקיות של ה-spike, ואין אף תיקיית `slidr-image-*` ב-`%TEMP%`.

## מה הופעל בפועל ומה לא

| מצב | הופעל מול ה-CLI האמיתי? | הערות |
|---|---|---|
| אין התחברות | **כן** | `CODEX_HOME` ריק. הפלט הוקלט (`codex_cli/unauthorized.jsonl`) |
| התחברות שפגה | **לא** | אי אפשר לגרום לזה בלי לפגוע בהתחברות של המשתמש. הצפי הוא 401, כלומר אותו מסלול. נוספו גם `sign in again` ו-`refresh token`, שהם ניחוש |
| מכסה שמוצתה | **לא** | הניסוחים בקוד הם ניחוש, ומסומנים כך. ניסוח אחר ייצא כ-`generation_failed` עם הטקסט של ה-CLI. גם מגבלה של כלי התמונות עצמו (שה-Agent מדווח עליה בטקסט) תצא כך |
| תהליך שנתקע | **לא** | ה-timeout נבדק מול ה-CLI המדומה, עם 3 שניות |
| ביטול | **כן, פעמיים** | בזמן יצירת תמונה, ובזמן ניסיונות חוזרים |
| בקשה שנדחתה (400) | **כן** | מודל שאינו קיים. הוקלט (`codex_cli/rejected.jsonl`) |
| סירוב תוכן | **לא** | המסלול (ריצה שהסתיימה בלי קובץ) נבדק מול ה-CLI המדומה |
| קריסה של ה-CLI | **לא** | נבדק מול ה-CLI המדומה |

## בדיקות

- **Rust: 33 בדיקות ב-`image_providers/`** (מתוך 106 ב-workspace), ועוד חמש מול ה-CLI האמיתי (`#[ignore]`).
  - **החוזה:** מול `contract.json`.
  - **השירות:** מול הספק המדומה, בזמן וירטואלי. מקביליות, תור מעבר ל-`maxParallel`, כישלון חלקי, ביטול (גם של תמונה שמחכה בתור), עריכה, דחיית מסכה, קלט לא תקין, workspace שנסגר באמצע, וברירת המחדל שנשמרת.
  - **המיפוי:** חמש הקלטות אמיתיות של `--json`. שלוש מה-spike (יצירה, יצירה שבה ה-Agent לא ידע את הנתיב, עריכה עם שני קבצים) ושתיים מהמשימה הזו (בלי התחברות, בקשה שנדחתה). שם המשתמש ומזהי הבקשות הוחלפו.
  - **התהליך:** CLI מדומה ב-Node (`codex_cli/fake-cli.mjs`). יצירה, עריכה, שני קבצים, בלי נתיב, בלי תמונה, 401, קריסה, ביטול ו-timeout. בכל מקרה נבדק שתיקיית העבודה והתיקייה ב-`generated_images` נמחקו, ובביטול גם שהתהליך מת (הוא כותב לקובץ כל עוד הוא חי).
  - **איתור התוכנית:** עץ קבצים מדומה של npm.
- **TypeScript: 19 בדיקות** ב-`images.test.ts`. החוזה מול `contract.json`; העטיפות של `invoke`; `createImageService`, כולל ריצה דרך הכלי `image_generate` האמיתי של ה-Deck API מול `CommandBus`; `memoryImages`; `createAppImages`.
- **בתוך האפליקציה** (build של debug, ידנית דרך CDP, הספק המדומה, בלי עלות): הפקודות רשומות ועונות, האירועים מגיעים ב-Channel, הנכסים נשמרים ב-workspace אמיתי, התצוגה המקדימה נוצרת דרך ה-asset protocol, מסכה מול `codex-cli` נדחית, וביטול חוזר תוך 4ms. `probe` של `codex-cli` מתוך האפליקציה החזיר `ready`.
- **`pnpm check:all` ירוק** בלי Codex: כל מה שנוגע ב-CLI האמיתי הוא `#[ignore]`. הבדיקות דורשות Node, שכבר נדרש ל-repo.

הרצת הבדיקות האמיתיות, אחת בכל פעם:

<div dir="ltr">

```
cargo test -p slidr real_cli_probe -- --ignored --nocapture                # free
cargo test -p slidr real_cli_without_a_sign_in -- --ignored --nocapture    # free
cargo test -p slidr real_cli_generate_then_edit -- --ignored --nocapture   # 2 images
cargo test -p slidr real_cli_four_in_parallel -- --ignored --nocapture     # 4 images
cargo test -p slidr real_cli_cancel -- --ignored --nocapture               # 1 image, cancelled
```

</div>

עם `SLIDR_KEEP_IMAGES=<תיקייה>` התמונות מועתקות לשם.

## הבדלים מ-SPEC 11.9

| ב-SPEC | בחוזה | למה |
|---|---|---|
| `generate({ n, … })` מחזיר N תמונות | קריאה לתמונה, והשירות מריץ N | מצב וביטול לכל תמונה (GEN-04); כך `codex-cli` עובד בכל מקרה |
| `size: string`, `capabilities.sizes` | `aspect` מתוך חמישה יחסים | ב-`codex-cli` הגודל הוא מה שהמודל בחר (ADR-004); הקורא יודע יחס, לא פיקסלים |
| `capabilities.generate`, `maxN` | אין `generate`; `maxParallel` | כל ספק תמונות יוצר; המגבלה היא על מקביליות |
| `capabilities.edit: boolean` | `none` / `regenerate` / `exact` | ההבדל בין עריכה ליצירה מחדש חייב להיות גלוי ל-UI |
| `quality`, `references` | אין | אין להם משמעות ב-`codex-cli`; יתווספו עם `openai-api` (T03) |
| `edit({ mask: Blob })` | `maskAssetId` | המסכה היא נכס ב-workspace, כמו המקור |
| `GeneratedImage` | bytes בצד Rust; `ImportedAsset` ב-IPC | הנכס נוצר ב-Rust, וה-webview מוסיף `origin` ו-`lineage` |

## מה לא נעשה

- **T03–T08.** אין `openai-api`, keychain, סטוק, מילוי placeholders או סגנון תמונות. `EditRequest.mask` קיים בחוזה ואף ספק אמיתי לא קורא אותו עד T03.
- **אין UI.** אין פאנל, גלריה או מסך הגדרות. ברירת המחדל נקבעת רק דרך ה-IPC.
- **יציאה מהאפליקציה באמצע יצירה** משאירה את `codex.exe` רץ עד שהוא מסיים (כדקה), עם הקובץ שלו ב-`generated_images` ותיקיית העבודה ב-`%TEMP%`. סגירה מסודרת דורשת Job Object, כלומר `unsafe` או תלות חדשה.
- **תהליכי בן של `codex.exe`:** הביטול הורג רק את `codex.exe`. בריצות שנמדדו לא היו לו תהליכי בן (מספר התהליכים חזר למה שהיה). גרסה שתפעיל תהליכי עזר עלולה להשאיר אותם.
- **Codex שהותקן דרך pnpm או bun:** ה-shim שלהם בנוי אחרת, ו-`probe` יחזיר `not_installed` עם הסבר. `codex.exe` ב-PATH והתקנה מ-npm עובדים.
- **macOS ו-Linux:** הענף שמאתר את התוכנית דרך קישור ל-`codex.js` נכתב ולא הורץ.
- **ה-Agent לא יודע שעריכה הייתה יצירה מחדש.** ל-`StoredImage` אין שדה להערות, ותיאור הכלי `image_edit` נמצא ב-`packages/agent-tools`. מומלץ להוסיף משפט בתיאור הכלי או במודול ה-prompt.
- **הכלי `image_process` נרשם ברגע שיש `images`**, ועד T05 הוא מחזיר `unsupported`. אפשר להשאיר כך, או לרשום אותו לפי שירות נפרד.
- **רענון ה-webview בפיתוח** לא מבטל עבודות שרצות; הן מסתיימות בלי מאזין.
- **נכסים שאין מי שמפנה אליהם** (תמונות של עבודה שבוטלה, או שה-Agent לא השתמש בהן) נשארים ב-workspace עד שהוא נסגר. שמירה לא אורזת אותם.
- **tokens ומכסה** לא מדווחים. ה-CLI מדווח רק tokens, והם לא עוברים הלאה.
- **בדיקת E2E ב-Playwright** לא נוספה: `apps/desktop/e2e` שייך לסשן אחר.

## תוצאות למשימות (להדבקה ב-PLAN)

#### תוצאות WG12 (2026-10-03)

נעשו T01 ו-T02 (סוכן אחד). מתועד ב-[ADR-025](adr/ADR-025-image-providers.md).

- **T01 — `ImageProvider`, רישום, `ImageService`:**
  - **נעשה:** ה-trait, רישום ספקים, שירות שמריץ N תמונות במקביל עם מצב לכל תמונה וביטול, שמירה כנכסי workspace, ברירת מחדל שנשמרת, שבע פקודות IPC, ספק מדומה ב-Rust ובדפדפן, והצד של TypeScript שמקיים את `ImageService` של ה-Deck API (כולל תצוגה מקדימה). הכלים `image_generate` ו-`image_edit` עובדים מולו.
  - **לא נעשה:** UI ומסך הגדרות; `process` (T05) מחזיר `unsupported`.
  - **לא נבדק:** זרימה מה-UI (אין UI). האפליקציה נבדקה דרך CDP מול הספק המדומה.
  - **זמן סוכן:** כחצי שעה, כולל הצד של TypeScript והבדיקה בתוך האפליקציה. גודל בתוכנית: יום אחד.
- **T02 — ספק `codex-cli`:**
  - **נעשה:** לפי ADR-004, עם כל ששת הכללים. מפעיל את `codex.exe` ישירות ולא דרך ה-shim של npm. שגיאות מסווגות, timeout של 240 שניות, ביטול שלא משאיר תהליך, ומחיקה של הקבצים ש-Codex משאיר. נבדק מול ה-CLI האמיתי ב-7 תמונות: 48.5 שניות לתמונה, 77.7 לעריכה, 88.2 לארבע במקביל, וביטול תוך 0.02 שניות.
  - **לא נעשה:** סגירה של התהליך ביציאה מהאפליקציה; התקנות pnpm ו-bun; רקע שקוף (GEN-07).
  - **לא נבדק:** התחברות שפגה, מכסה שמוצתה ותהליך שנתקע מול ה-CLI האמיתי (ה-timeout נבדק מול CLI מדומה; ניסוחי המכסה הם ניחוש); macOS ו-Linux.
  - **זמן סוכן:** כחצי שעה, מתוכה כשש דקות המתנה לריצות האמיתיות. גודל בתוכנית: יום וחצי.
- **ממצאים:**
  - בריצה האחת שנבדקה, העריכה שמרה על הקומפוזיציה כמעט במדויק (אותן טורבינות, באותו מקום, באותן מידות). היא עדיין ציור מחדש, והפיקסלים אחרים.
  - ארבע במקביל לקחו 88 שניות ולא 60: תמונה אחת איטית קובעת.
  - ריצה בלי התחברות נכשלת רק אחרי כ-15 שניות של ניסיונות חוזרים. לכן ה-UI צריך לקרוא ל-`probe` לפני שהוא מציע יצירה.

סך הכול למסלול: כשעה של סוכן (לפי השעון, 12:20 עד 13:20), כולל המסמך הזה. לא נדרש זמן של המשתמש.

## השלכות

- **WG11:** הגלריה עובדת מול `ImageClient` (עבודות, אירועים, ביטול), ומציגה שלד לכל תמונה. `probe` לפני יצירה, ו-`capabilities` כדי להסתיר מסכה ולסמן "עריכה" כיצירה מחדש. כפתור העצירה של תור ה-Agent קורא ל-`service.cancel()`.
- **WG12-T03 (`openai-api`):** מממש את אותו trait, עם `edit: exact` ו-`mask: true`, וקורא את `EditRequest.mask`. `quality` ו-`references` יתווספו לבקשה.
- **WG12-T04:** הכלים כבר עובדים. נשאר מילוי ה-placeholders שנושאים prompt.
- **WG12-T05:** מחליף את `process` ב-`imageService.ts`.
- **WG12-T06:** `previewOf` מתאים גם לתמונות סטוק.
- **שילוב:**
  - `lib.rs`: שלוש תוספות (שורת `mod`, `app.manage`, ושבע שורות ב-`generate_handler!`).
  - `Cargo.toml`, `error.rs`, `packages/**` ו-`harness/**` לא שונו.
  - ה-worktree `../Slidr-images` והענף `wg12-images` לא היו קיימים, ונוצרו מ-`main` ב-`5934544`.
  - **הכניסה ל-`main` (2026-10-03):** הענף עבר rebase על `3653379`, שכבר כולל את m2-core ואת wg7-templates, ואז fast-forward. הייתה התנגשות אחת, ב-`lib.rs`: m2-core ו-WG12 הוסיפו שורת `app.manage` באותו מקום, ושתיהן נשארו. אחרי ה-rebase `pnpm check:all` ירוק: 834 בדיקות TypeScript ו-121 בדיקות Rust. המספרים בסעיף "בדיקות" למעלה הם מלפני ה-rebase.
  - **אחרי הכניסה:** סעיף התוצאות נמצא ב-PLAN, בסוף פרק WG12, ו-ADR-025 נמצא ברשימת ה-ADRs ב-README.

</div>
