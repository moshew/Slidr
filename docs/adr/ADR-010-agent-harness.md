<div dir="rtl">

# ADR-010 — שכבת ה-harness: החוזה ש-WG11 בונה עליו

סטטוס: **הוכרע** · 2026-10-03 · משימות: WG10-T01, T02, T03 · קוד: `apps/desktop/src-tauri/src/harness/`, `apps/desktop/src/agent/`

זה החוזה ש-PLAN סעיף 3 קובע שנסגר בתחילת M2: `AgentHarness`, `AgentSession`, `AgentEvent`. WG11 בונה עליו את `AgentService` ואת הצ'אט. שינוי בו מעדכן את המסמך הזה.

## ההחלטה

1. **שני traits, כמו בסקיצה של SPEC 11.2.** `AgentHarness` מתאר ומפעיל; `AgentSession` הוא שיחה אחת. כל מתודה חוזרת ברגע שהבקשה נמסרה, וכל מה שקורה אחר כך מגיע כאירוע.
2. **`HarnessManager`** מחזיק את ה-harnesses ואת הסשנים הפתוחים לפי מזהה, ונבדק בלי Tauri. בין כל סשן למאזין שלו יושב **`TurnGuard`**, שמחזיק את זרם האירועים בחוזה גם כשה-harness נכשל באמצע (ראה "חוזה הזרם").
3. **ערוץ אירועים: `tauri::ipc::Channel` אחד לכל סשן**, שה-webview מעביר ב-`agent_start`.
4. **harness מדומה** שמנגן תסריטים מוקלטים. ה"מודלים" שלו הם התסריטים.
5. **מתאם Claude Code** לפי SPEC 11.3 ו-ADR-001, עם שלושה הבדלים (ראה למטה).
6. **ה-UI מכיר רק את `AgentEvent` ואת ה-descriptors.** ב-TypeScript אין שם של harness. `git grep -i claude` מוצא את המילה רק ב-`harness/claude_code.rs`, ב-`harness/claude_code/` (הקלטות ו-CLI מדומה לבדיקות), וב-`harness/registry.rs`, הקובץ היחיד שמונה מתאמים.

## הממשקים

<div dir="ltr">

```rust
#[async_trait]
pub trait AgentHarness: Send + Sync {
    fn descriptor(&self) -> HarnessDescriptor;      // id, name, capabilities, models, effort levels
    async fn probe(&self) -> HarnessStatus;         // never fails; a failure is a state
    async fn start(&self, config: SessionConfig, sink: EventSink) -> Result<Box<dyn AgentSession>>;
}

#[async_trait]
pub trait AgentSession: Send {
    async fn send(&mut self, turn: UserTurn) -> Result<()>;   // starts a turn
    async fn interrupt(&mut self) -> Result<()>;              // the turn ends as `interrupted`
    async fn close(self: Box<Self>) -> Result<()>;            // returns after `exited`
    fn native_session_id(&self) -> Option<String>;
}

pub struct EventSink(Arc<dyn Fn(AgentEvent) + Send + Sync>);  // cloneable, any task
```

</div>

- **`async-trait`:** `async fn` ב-trait עדיין לא תואם `dyn` (נבדק על rustc 1.99). זה ה-crate היחיד שנוסף מלבד `tokio`; התלויות שלו כבר בעץ דרך serde.
- **`&mut self` ולא `&self`:** מימוש פשוט יותר (בלי נעילות פנימיות). המנהל מחזיק כל סשן ב-`tokio::sync::Mutex` לכל אורך הקריאה, וכך הקריאות לסשן אחד מסודרות. אין בזה עיכוב: `send` חוזר אחרי כתיבה ל-stdin, לא בסוף התור.
- **המנהל קורא ל-`send` רק כשאין תור פעיל** (אחרת `busy`), ול-`interrupt` רק כשיש.

## `AgentEvent`

שדות ב-camelCase, ערכים ב-snake_case, כמו שגיאות האחסון. הצורה המדויקת קבועה ב-`harness/fixtures/contract.json`, ושני הצדדים נבדקים מולו: Rust משווה את פלט ה-serde לקובץ, ו-TypeScript משווה את השדות לטיפוסים.

<div dir="ltr">

```json
{ "type": "session_started", "nativeSessionId": "b2969d29-…", "model": "claude-haiku-4-5-20251001" }
{ "type": "text_delta", "text": "Adding a slide." }
{ "type": "thinking_delta", "text": "" }
{ "type": "tool_call_started", "id": "toolu_01…", "name": "slide_create_from_html", "source": "app", "input": { … } }
{ "type": "tool_call_finished", "id": "toolu_01…", "ok": true, "summary": "created s_1" }
{ "type": "turn_completed", "outcome": "completed",
  "usage": { "inputTokens": 10, "outputTokens": 60, "cacheReadTokens": 6223, "cacheWriteTokens": 860 },
  "costUsd": 0.0026, "durationMs": 1032 }
{ "type": "error", "kind": "quota", "message": "usage limit reached (five_hour, rejected)", "recoverable": true }
{ "type": "exited", "code": 0 }
```

</div>

| אירוע | מתי | הערות |
|---|---|---|
| `session_started` | פעם אחת, לפני כל דבר אחר של התור הראשון | `nativeSessionId` הוא מה ש-`resume` מקבל. ב-CLI הוא מגיע רק אחרי ההודעה הראשונה, לא בהפעלה |
| `text_delta` | קטע טקסט של התשובה | |
| `thinking_delta` | קטע חשיבה | ב-Claude Code 2.1.287 הטקסט תמיד ריק: פעימה של "חושב…" |
| `tool_call_started` | קריאה לכלי, עם הקלט המלא | `source: "app"`: כלי של ה-Deck API, בשם שלו בלי הקידומת של התעבורה. `"harness"`: כלי מובנה של ה-harness (`WebSearch`, `Read`), בשם המקורי |
| `tool_call_finished` | הכלי חזר | `summary` עד 300 תווים, `[image]` לתמונה. את התוצאה המלאה של כלי app ה-webview כבר מכיר, כי הוא ביצע אותו |
| `turn_completed` | סוף התור | `outcome`: `completed` / `interrupted` / `failed`. `usage` לתור. `costUsd` לתור, או `null` כשאי אפשר לייחס עלות לתור |
| `error` | משהו שהמשתמש צריך לראות (CHT-U09) | `recoverable`: הסשן יכול לקבל תור נוסף |
| `exited` | הסשן נגמר; אחריו אין כלום | `code` של התהליך, או `null` |

**סוגי שגיאה** (סט סגור, משותף לקריאות שנדחו ולאירועי `error`): `unknown_harness`, `unknown_session`, `busy`, `invalid_input`, `not_installed`, `not_logged_in`, `quota`, `tools_unavailable`, `resume_failed`, `process_exited`, `turn_failed`, `io`, `internal`. קריאה שנדחתה מגיעה כ-`{ kind, message }`, ו-`message` באנגלית ליומן.

## חוזה הזרם

לכל סשן, לפי הסדר:

1. `session_started` פעם אחת, ראשון.
2. **כל `send` שהתקבל מסתיים ב-`turn_completed` אחד בדיוק**, גם כשהתהליך מת באמצע התור (`failed`).
3. כל `tool_call_started` מקבל `tool_call_finished` לפני סוף התור שלו. אם ה-harness לא שלח אחד, נשלח `ok: false`.
4. `failed` בא אחרי `error`.
5. `exited` אחרון, ושום דבר לא אחריו.

סעיפים 1, 2, 3 ו-5 נאכפים ב-`TurnGuard` של המנהל, ולכן מתאם שמאבד את התהליך לא משאיר את ה-UI מחכה.

## פקודות IPC

| פקודה | ארגומנטים | מחזיר |
|---|---|---|
| `agent_harnesses` | — | `HarnessDescriptor[]` |
| `agent_probe` | `harnessId` | `HarnessStatus`: `state` (`ready` / `not_installed` / `not_logged_in` / `unavailable`), `version`, `account`, `detail` |
| `agent_start` | `harnessId`, `thread`, `config`, `onEvent` (Channel) | מזהה סשן |
| `agent_send` | `sessionId`, `turn` | — |
| `agent_interrupt` | `sessionId` | — |
| `agent_close` | `sessionId` | — |

- **`thread`** הוא `<deckId>/<threadId>` (אותיות, ספרות, `-`, `_`). Rust גוזר ממנו את תיקיית הסשן `<app_data>/agent/<deckId>/<threadId>/`. ה-webview לא בוחר נתיב, ולכן לא יכול להפנות את ה-Agent לתיקייה אחרת. אותו thread מקבל אותה תיקייה, וזה מה ש-resume צריך (ADR-001 ממצא 4: התמלול של ה-CLI נשמר לפי תיקיית העבודה).
- **`config`**: `scope`, `systemPrompt`, `toolEndpoint?` (`{ url, token }`), `webAccess?` (ברירת מחדל `true`, D15), `model?`, `effort?`, `resume?`.
- **`turn`**: `text`, `context?` (בלוק `<slidr_context>`, בנפרד כדי שהתמלול ישמור את מה שהמשתמש כתב), `images?` (`{ mediaType, data }`, base64; png, jpeg, gif, webp).
- ב-TypeScript: `apps/desktop/src/agent/agent.ts` (טיפוסים, `AgentClient`, `AgentError`) ו-`tauriAgent.ts` (עטיפות `invoke`). `AgentClient` הוא ממשק, כדי ש-WG11 יבדוק את `AgentService` מול זיוף.

## ערוץ האירועים

`tauri::ipc::Channel<AgentEvent>` אחד לכל סשן, ש-`agent_start` מקבל כארגומנט. Tauri ממליץ על הדרך הזו להזרמה, ויש לה ארבעה יתרונות על `emit` של אירוע גלובלי:

- הסדר נשמר;
- ההודעות מגיעות רק ל-webview שפתח את הסשן;
- אין שמות אירועים, סינון לפי סשן או `unlisten`;
- לא צריך הרשאת `core:event` ב-capabilities.

ההעברה עצמה היא `eval` קצר ב-webview, ולא חוסמת את ה-Rust.

## ה-harness המדומה

`harness/mock.rs`. נבחר ב-UI כמו כל harness, עם `id: "mock"`. הוא מוצע ב-build של debug, או בכל build כשמשתנה הסביבה `SLIDR_AGENT_MOCK` מוגדר (לבדיקות E2E). ה"מודל" שנבחר לסשן הוא שם התסריט.

<div dir="ltr">

```json
{ "description": "…",
  "turns": [
    [ { "delayMs": 400, "type": "text_delta", "text": "Hello" },
      { "delayMs": 20,  "type": "turn_completed", "outcome": "completed", "costUsd": 0.01, "durationMs": 420 } ] ] }
```

</div>

- כל צעד הוא `AgentEvent` בצורת ה-IPC, ועוד `delayMs`: ההמתנה לפניו.
- ה-`send` ה-n מנגן את התור ה-n, ואחרי האחרון חוזר להתחלה.
- כל תור נגמר ב-`turn_completed` יחיד.
- `session_started` (ב-`send` הראשון, עם `resume` כמזהה כשניתן) ו-`exited` (ב-`close`) הם של המדומה עצמו, לא של התסריט.
- **עצירה:** הנגינה נעצרת באמצע ונשלח `turn_completed` עם `interrupted` ועלות 0, כמו בתור קטוע אמיתי. קריאה פתוחה נסגרת ב-`ok: false` על ידי ה-guard.
- **קריאות כלים הן אירועים בלבד.** אין כאן גשר ואין Deck API (T04, T05).

תסריטים מובנים (`harness/fixtures/scripts/`):

| שם | מה |
|---|---|
| `import` | **נגזר מתמלול אמיתי** של S5: סשן ייבוא, שתי זוגות קריאות מקבילות, טקסט עם כותרת בעברית, ה-usage, העלות והזמנים כפי שנמדדו. הטקסט חולק מחדש לקטעים, כי הריצה ההיא לא הזרימה הודעות חלקיות |
| `slide-chat` | שלושה תורות בתזמון של S1: בניית שקף עם שתי קריאות לכלים, תשובה ארוכה בעברית (לבדיקת עצירה), חיפוש web |
| `errors` | כלי שנכשל וה-Agent ממשיך; מכסה שמוצתה; סשן בלי הכלים של האפליקציה |

## מתאם Claude Code: מה שונה מ-SPEC 11.3

שורת הפקודה זהה ל-SPEC 11.3, והבדיקה משווה אותה מחרוזת מול מחרוזת. ההבדלים:

| נושא | SPEC 11.3 | במימוש | למה |
|---|---|---|---|
| בלי נקודת קצה לכלים (עד T04) | `--mcp-config` תמיד | בלי `--mcp-config`, בלי `mcp__slidr__*`, ו-`mcp.json` נמחק אם נשאר מסשן קודם. `--strict-mcp-config` נשאר | בלעדיו נטענים שרתי ה-MCP של המשתמש. נבדק: `init` בלי שרתים |
| `--model` | תמיד | רק כשנבחר מודל | ברירת המחדל של ה-CLI |
| `allowed_tools` ב-`SessionConfig` | רשימת שמות | `webAccess: bool`. `--tools` הוא `Read,Grep` ועוד `WebSearch,WebFetch` כשמותר | שמות הכלים המובנים שייכים ל-harness, וה-UI לא אמור להכיר אותם |
| ערכים אחרי דגל | — | `model`, `effort` ו-`resume` נבדקים: לא מתחילים ב-`-`, תווים מוגבלים, `effort` מתוך הרשימה | כדי שערך מה-webview לא ייקרא כדגל |

התנהגות שנמדדה עכשיו (Claude Code 2.1.287):

- **resume שנכשל:** `--resume` עם מזהה שאינו קיים מחזיר `result` עם `errors: ["No conversation found…"]` לפני כל `init`, בלי לשלוח הודעה, ויוצא בקוד 1. המתאם מתרגם את זה ל-`error` עם `resume_failed` ואחריו `exited`. זה האות של AGT-06: לפתוח סשן חדש עם תקציר.
- **`--system-prompt-snapshot` (ברירת מחדל `on`):** ה-CLI מקליט את ה-system prompt בבקשה הראשונה של השיחה, ומשתמש בו כמו שהוא בכל בקשה וב-resume, גם כשהפעלה מאוחרת מעבירה טקסט אחר. כלומר שינוי במודולי ה-prompt לא מגיע לשיחה ממשיכה. לא שונה כאן; ייבדק ב-T08.
- **קוד יציאה בסגירה** אחרי תור קטוע הוא 1, לא 0. סגירה מכוונת לא מדווחת שגיאה בכל מקרה.

מה שעוד מומש לפי ADR-001 ו-ADR-002:

- **עצירה:** `control_request`. אם `result` לא מגיע תוך שנייה, התהליך נהרג: `turn_completed` (`interrupted`), `error` (`process_exited`, לא ניתן להמשך), `exited`. ממשיכים מ-`nativeSessionId` בסשן חדש.
- **סגירה:** עצירת התור אם יש, EOF ב-stdin, חמש שניות, ואז הריגה.
- **עלות לתור:** הפרש של `total_cost_usd`. בתור הראשון של תהליך שהמשיך (`resume`) הבסיס לא ידוע, ולכן `costUsd: null`.
- **`init` בלי כלי `mcp__slidr__*`** כשיש נקודת קצה: `error` עם `tools_unavailable`, ועצירת התור.
- **`rate_limit_event`** עם סטטוס שאינו `allowed…`: `error` עם `quota`.
- **`result` שנכשל:** `api_error_status` 401/403 → `not_logged_in`, 429 → `quota`, אחרת `turn_failed`.
- **טקסט:** מ-`stream_event`. מבלוקי `assistant` רק כשלא הוזרם, וכך גם תמלול בלי הודעות חלקיות ממופה נכון.
- **`probe`:** `claude --version` ו-`claude auth status`. `account` הוא שיטת ההתחברות והתוכנית (`claude.ai (max)`), בלי כתובת דואר וארגון.
- **סביבה:** משתני `CLAUDE*` ו-`ANTHROPIC*` מוסרים (נבדק: התהליך המדומה לא ראה אף אחד, אף שהבדיקות רצו בתוך Claude Code). ב-Windows `CREATE_NO_WINDOW` דרך `std::os::windows::process::CommandExt`.
- **תהליך שנשאר:** סשן שנזרק בלי `close` הורג את התהליך. ביציאה מהאפליקציה ה-pipes נסגרים וה-CLI יוצא על EOF.

## בדיקות

- **Rust: 28 בדיקות ב-`harness/`**, מתוך 63 בכל ה-workspace, ועוד שתיים מול ה-CLI האמיתי (`#[ignore]`).
  - **מיפוי:** שתי הקלטות אמיתיות של stream-json. האחת של S1: שישה תורות, Read, שתי קריאות שנדחו ותור קטוע. השנייה של S5: כלי app בלי הזרמה. ועוד שורת ה-resume שנכשל, שהוקלטה עכשיו.
  - **שורת הפקודה ותיקיית הסשן.**
  - **התהליך עצמו:** CLI מדומה ב-Node (`claude_code/fake-cli.mjs`) עובר דרך המנהל תור, עצירה, תור נוסף, סגירה באמצע תור, תור שמתעלם מהעצירה ונהרג אחרי שנייה, וקריסה עם stderr. הבדיקה רצה בכל `cargo test`; היא דורשת Node, שכבר נדרש ל-repo.
  - **המדומה:** בזמן וירטואלי (`start_paused`), כלומר דטרמיניסטי ומיידי.
  - **החוזה:** מול `contract.json`.
- **TypeScript: 8 בדיקות** ב-`agent.test.ts`. השדות של כל אירוע מול `contract.json`; התסריטים המדומים מכילים רק אירועים מוכרים; העטיפות של `invoke`, כולל ה-Channel ומיפוי השגיאות.
- **מול ה-CLI האמיתי** (שתי בדיקות `#[ignore]`, הורצו פעם אחת ב-2026-10-03 עם Haiku):
  - `probe` → `ready`, 2.1.287;
  - "Reply with exactly: pong" → `pong`, $0.003015, כ-1 שנייה;
  - ספירה עד 300 נעצרה אחרי הקטע הראשון → `interrupted`;
  - סגירה;
  - resume בתהליך חדש → ה-Agent ציטט את הבקשה הראשונה, `costUsd: null`, אותו `nativeSessionId`;
  - resume של מזהה שאינו קיים → `resume_failed`, בלי עלות.

  סה"כ כ-$0.006 לפי מחירון, על המנוי. ה-prompt הבסיסי עם שני כלים מובנים: כ-2,800 tokens, כצפוי מהחלפת ה-prompt (ADR-001).

## הבדלים מ-SPEC 11.2

| איפה | ב-SPEC | בחוזה | למה |
|---|---|---|---|
| `SessionConfig.mcp` | `McpEndpoint`, חובה | `tool_endpoint: Option<ToolEndpoint>` | השם לא מזכיר את הפרוטוקול (קריטריון ה-grep של PLAN); אופציונלי עד T04 ובסשנים בלי כלים |
| `SessionConfig.allowed_tools` | `Vec<String>` | `web_access: bool` | ראה טבלת המתאם |
| `SessionConfig.workdir` | נתיב מהקורא | נגזר ב-Rust מ-`thread` | ה-webview לא בוחר נתיבים; resume צריך תיקייה יציבה לכל שיחה |
| `TurnCompleted` | `usage`, `cost_usd`, `duration_ms` | ועוד `outcome` | ה-UI צריך להבחין בין תור שהושלם, נעצר או נכשל |
| `ToolCallStarted` | `id`, `name`, `input` | ועוד `source` | שבב פעולה של כלי app (CHT-U02) שונה מחיפוש web |
| `UserTurn` | "text + attachments + context" | `text`, `context`, `images` | קבצים מצורפים (CHT-U05) מועתקים ל-`attachments/` ב-T10, לא נשלחים בתור |
| `ErrorKind` | לא הוגדר | 13 הסוגים למעלה | |

## מה לא נעשה

- **T04–T13.** אין גשר כלים, ולכן `tools_unavailable` נבדק רק על הקלטה. אין תמלול (T09), אין העתקת קבצים ל-`attachments/` (T10), ואין סגירה של תהליכים לא פעילים ויומן אבחון (T11). שורות `system/status`, `permission_denied` ו-`control_response` מתעלמים מהן עד T11.
- **AGT-04:** רשימת ה-harnesses היא קוד ב-`registry.rs`, לא קובץ הגדרות.
- **רענון ה-webview בפיתוח** משאיר סשנים פתוחים בלי מאזין, עד יציאה מהאפליקציה. אין `agent_sessions` לאיסוף שלהם.
- **Claude Code שהותקן דרך npm** (`claude.cmd`) לא נמצא: `std::process::Command` ב-Windows מחפש רק `.exe`. המתקין הרשמי מתקין `claude.exe`, ועליו זה נבדק.
- **`CLAUDE_CONFIG_DIR`** מוסר עם שאר משתני `CLAUDE*`, לפי SPEC. משתמש שמחזיק את ההגדרות של Claude Code בתיקייה אחרת ייראה "לא מחובר".
- **ADR-001 ממצא 6** (בדיקה ב-`probe` ש-`--system-prompt-file` מתקבל, ונפילה ל-`--append-system-prompt`): לא מומש. הדגל עבד ב-2.1.287.
- **לא נבדקו בפועל:** מכסה שמוצתה, חשבון לא מחובר, והריגה אחרי עצירה מול ה-CLI האמיתי (נבדקה מול ה-CLI המדומה).
- **בדיקה ב-`pnpm tauri dev`:** לא הורצה. הפקודות רשומות והקוד מתקמפל, אבל לא נקראו מה-webview.

## השלכות

- **WG11:** בונה את `AgentService` על `AgentClient`, ובודק אותו מול זיוף או מול ה-harness המדומה. כפתור העצירה מוצג לפי `capabilities.interrupt`; בורר המודל לפי `models`; העלות לפי `costUsd`, ו-tokens כשהוא `null`.
- **WG10-T04:** הגשר מספק `ToolEndpoint` ל-`SessionConfig`, וה-scope guard שלו קורא את `scope`. ה-mock יצטרך לקרוא לכלים דרכו כדי שהתרחיש של שער האיכות ירוץ מקצה לקצה.
- **WG10-T09:** `meta.json` שומר את `nativeSessionId` לכל thread. `resume_failed` מפעיל את המסלול של AGT-06.
- **PLAN, קריטריון ה-grep:** המילה mcp חייבת להופיע גם במתאם עצמו, שכותב `mcp.json` ומעביר `--mcp-config`. הקריטריון צריך לומר "מחוץ ל-`mcp_bridge/` ולמתאמי ה-harness". "קובץ ההגדרות" של המתאם הוא `registry.rs`.

</div>
