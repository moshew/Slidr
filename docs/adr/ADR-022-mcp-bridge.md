<div dir="rtl">

# ADR-022 — גשר הכלים: מתאם התעבורה בין ה-Agent ל-Deck API

סטטוס: **הוכרע** · 2026-10-03 · משימה: WG10-T04 · קוד: `apps/desktop/src-tauri/src/mcp_bridge/`, `apps/desktop/src/agent/toolBridge.ts`, `apps/desktop/src/agent/tauriAgent.ts`

זה המימוש של מה ש-ADR-002 בדק ב-spike: שרת MCP בתוך האפליקציה, שמפרסם ל-Agent את הכלים של ה-Deck API ומעביר כל קריאה ל-webview. WG11 בונה עליו את `AgentService`. שינוי בו מעדכן את המסמך הזה.

## ההחלטה

1. **מתאם בלבד.** ב-Rust אין הגדרת כלי, אין לוגיקה של כלי ואין ידע על ה-Deck API. הגשר מכיר סשנים, tokens וקריאות שמחכות לתשובה, ותו לא.
2. **`ToolBridge` הוא כל המצב, ונבדק בלי Tauri**, כמו `HarnessManager`. בבדיקות ה-webview הוא closure. פקודות ה-IPC הן עטיפות של שורה.
3. **הכלים נרשמים לכל סשן, בפתיחה שלו**, ולא פעם אחת בעליית האפליקציה. סשן רואה בדיוק את הרשימה שה-webview מסר לו, כלומר את `list(scope)` של ה-Deck API. אין קטלוג גלובלי ב-Rust ואין סינון.
4. **הקריאות ל-webview עוברות ב-`tauri::ipc::Channel` אחד**, שה-webview מוסר ב-`tool_bridge_connect`. התשובה חוזרת ב-`invoke`. חיבור נוסף הוא webview שנטען מחדש: הוא מחליף את הקודם.
5. **השרת: rmcp על axum, בלי סשנים ברמת הפרוטוקול ועם תשובות JSON רגילות.** כל בקשה עומדת בפני עצמה, כמו בגרסת הפרוטוקול 2026-07-28 שה-CLI מדבר. סגירת סשן של הגשר לא משאירה כלום בצד הפרוטוקול.
6. **מגבלת הזמן היא מאפיין של הגדרת הכלי** (`timeoutMs`), וברירת המחדל 60 שניות. ב-Rust אין שם של כלי.
7. **כלי שנכשל חוזר כתוצאה עם `isError`, לא כשגיאת פרוטוקול.** כך גם timeout, כלי לא מוכר וסשן שנסגר. את הטקסט של תוצאה ה-Agent קורא; שגיאת פרוטוקול מוצגת לו בלי ההודעה שלה.
8. **השם של הפרוטוקול נשאר בתיקייה.** שאר ה-crate מכיר את המודול בשם `tool_bridge`, הפקודות הן `tool_bridge_*`, וב-TypeScript המילה לא מופיעה.

## מבנה

<div dir="ltr">

```
webview (TS)                              Rust                              Agent (תהליך CLI)
────────────                              ────                              ─────────────────
connectToolBridge(handler)
  tool_bridge_connect(onCall) ─────────►  ToolBridge: לאן הולכות הקריאות
bridge.open(api.list(scope))
  tool_bridge_open(tools) ─────────────►  סשן: key, token, הכלים שלו
      ◄── { sessionKey, url, token }      שרת על 127.0.0.1:<פורט אקראי>
                                            POST /mcp/<key> + Bearer <token>  ◄── tools/list, tools/call
                                            key לא מוכר או token שגוי: 401
  onCall({ callId, sessionKey,   ◄─────   call: העברה, והמתנה 60 שניות
           name, input })                   (או המגבלה של הכלי)
  handler(sessionKey, name, input)
  tool_bridge_reply(callId, reply) ────►  תוכן טקסט ותמונה                  ──► ל-Agent
bridge.close(sessionKey)
  tool_bridge_close(sessionKey) ───────►  ה-key מפסיק לעבוד; קריאות שמחכות נכשלות
```

</div>

| קובץ | מה | שורות |
|---|---|---|
| `mcp_bridge/mod.rs` | `ToolBridge`: הסשנים, הקריאות שמחכות, הטיפוסים שחוצים IPC | 324 |
| `mcp_bridge/server.rs` | הקובץ היחיד שמדבר את הפרוטוקול מול Agent: rmcp, axum, שכבת ה-401 | 179 |
| `mcp_bridge/client.rs` | לקוח של השרת עצמו: קריאת כלי אחת כחילוף HTTP אחד. ל-harness המדומה ולבדיקות | 114 |
| `mcp_bridge/ipc.rs` | ארבע פקודות Tauri | 46 |
| `agent/toolBridge.ts` | הטיפוסים, `ToolBridge` כממשק, ו-`toReply` | 92 |
| `agent/tauriAgent.ts` | `connectToolBridge`: ה-Channel ועטיפות `invoke` | 47 שנוספו |

ADR-002 העריך "כ-100 שורות". בפועל הליבה ושכבת הפרוטוקול הן כ-500 שורות עם ההערות, כי נוספו מה שה-spike לא עשה: רשימת כלים לכל סשן, סגירת סשן, החלפת webview, ביטול קריאה, ומגבלת זמן לכל כלי.

## הממשקים

### Rust

<div dir="ltr">

```rust
impl ToolBridge {
    pub fn new() -> Arc<Self>;                         // nothing listens yet
    pub fn connect(&self, forward: impl Fn(ToolCall) -> bool + Send + Sync + 'static);
    pub async fn open(self: &Arc<Self>, tools: Vec<ToolDef>) -> Result<SessionEndpoint>;
    pub fn close(&self, session_key: &str);
    pub fn reply(&self, call_id: &str, reply: ToolReply) -> bool;   // false: nothing waited
}

// the protocol client, for an agent inside this process (the mock harness)
pub async fn call_tool(url: &str, token: &str, name: &str, input: &Value)
    -> Result<ToolReply, String>;
```

</div>

- **השרת עולה ב-`open` הראשון**, לא בעליית האפליקציה. אפליקציה שלא הפעילה Agent לא מאזינה לשום פורט, וכישלון ב-bind חוזר כשגיאה של `open` (`io`) במקום להפיל את האפליקציה.
- **`forward` מחזיר `false`** כשלא הצליח למסור את הקריאה. אז הקריאה נכשלת מיד ולא מחכה ל-timeout.
- **`Result`** הוא של שכבת ה-harness (`AgentError`: `{ kind, message }`), כדי של-webview יהיה סוג שגיאה אחד לכל פקודות ה-Agent.
- **מנעול אחד** על כל המצב. כל הפעולות קצרות וסינכרוניות, וה-`forward` נקרא מחוץ למנעול.

### פקודות IPC

| פקודה | ארגומנטים | מחזיר |
|---|---|---|
| `tool_bridge_connect` | `onCall` (Channel של `ToolCall`) | — |
| `tool_bridge_open` | `tools`: `{ name, description, inputSchema, timeoutMs? }[]` | `{ sessionKey, url, token }` |
| `tool_bridge_close` | `sessionKey` | — |
| `tool_bridge_reply` | `callId`, `reply` | `boolean`: האם מישהו עוד חיכה לתשובה |

הצורות המדויקות קבועות ב-`harness/fixtures/contract.json` תחת `toolBridge`, ושני הצדדים נבדקים מולו, כמו ב-ADR-010.

<div dir="ltr">

```json
// tools: the Deck API's listing as it is; `scopes` and `writes` are ignored
{ "name": "slide_get", "description": "…", "inputSchema": { "type": "object", … }, "timeoutMs": 300000 }

// ToolCall, on the channel
{ "callId": "call_1", "sessionKey": "5f1d…", "name": "slide_get", "input": { "slideId": "s_1" } }

// reply
{ "content": [ { "type": "text", "text": "{\"id\":\"s_1\"}" },
               { "type": "image", "data": "iVBORw0KGgo…", "mimeType": "image/png" } ],
  "isError": false }
```

</div>

### TypeScript

<div dir="ltr">

```ts
type ToolHandler = (sessionKey: string, name: string, input: unknown) => Promise<ToolResult>;

interface ToolBridge {
  open(tools: readonly BridgeTool[]): Promise<{ sessionKey: string; endpoint: ToolEndpoint }>;
  close(sessionKey: string): Promise<void>;
}

connectToolBridge(handler: ToolHandler): Promise<ToolBridge>   // tauriAgent.ts
toReply(result: ToolResult): ToolReply                          // toolBridge.ts
```

</div>

- **`ToolBridge` הוא ממשק**, כדי ש-WG11 יבדוק את `AgentService` מול זיוף, כמו `AgentClient`.
- **הגשר לא מחזיק תורות.** הוא מוסר `sessionKey`, וה-`handler` מוצא את התור. `startTurn` ו-undo שייכים ל-`AgentService`.
- **`toReply`** הוא המיפוי ש-ADR-011 קבע: `data` כטקסט JSON (בלי רווחים), כל תמונה כבלוק תמונה אחריו, ו-`ok: false` כ-`message` עם `isError`. ה-`code` של השגיאה לא נשלח.
- **`handler` שזורק או נדחה** הופך לתשובת שגיאה עם ההודעה. ה-Deck API לא זורק; זה מכסה למשל `sessionKey` שה-`AgentService` לא מכיר.
- **קריאות רצות במקביל.** הגשר לא מסדר אותן, וכל תשובה נשלחת כשהקריאה שלה מסתיימת.

## מה נבנה

| דרישה | מימוש |
|---|---|
| MCP-01, SEC-01 | `TcpListener` על `127.0.0.1`, פורט 0. rmcp בודק גם את כותרת `Host` מול שמות loopback (הגנה מ-DNS rebinding) |
| MCP-02, SEC-01 | לכל סשן `key` ו-`token` משלו, כל אחד 122 סיביות אקראיות ממערכת ההפעלה (`uuid` v4). הנתיב `/mcp/<key>`, והכותרת `Authorization: Bearer <token>`. שכבת axum לפני rmcp מחזירה 401 על כל דבר אחר, בלי גוף. ההשוואה עוברת על כל הבתים |
| MCP-03 | `tools/list` מחזיר את מה שנמסר ב-`open` לאותו סשן: שם, תיאור ו-`inputSchema`, ולא יותר |
| MCP-04 | `tools/call` → `ToolCall` ב-Channel → המתנה ל-`tool_bridge_reply`. 60 שניות, או `timeoutMs` של הכלי |
| MCP-06 | `content` של טקסט ותמונה עובר כמו שהוא לבלוקים של הפרוטוקול |
| המלכודת של ADR-002 | `tools/list` נושא `ttlMs: 0` ו-`cacheScope: "private"`. בדיקה נכשלת בלעדיהם (נבדק: הסרת השורה מפילה אותה) |

**מה ה-Agent קורא כשמשהו משתבש** (תמיד תוצאה עם `isError: true`):

| מצב | הטקסט |
|---|---|
| כלי שאינו ברשימה של הסשן | `There is no tool named "x" in this session.` ה-webview לא שומע על הקריאה |
| ה-webview עוד לא התחבר | `The app is not ready to run tools yet.` |
| ה-Channel נכשל (החלון נסגר) | `x was not run: the app window is not available.` |
| אין תשובה בזמן | `x did not answer within 60 s. It may still finish in the app, so look at the deck before calling it again.` |
| הסשן נסגר או ה-webview נטען מחדש בזמן ההמתנה | `x was dropped: its session closed or the app window reloaded.` |
| הכלי עצמו נכשל | ה-`message` של ה-Deck API |

**מחזור החיים של קריאה שמחכה.** הרשומה נמחקת בכל דרך שבה הקריאה נגמרת:

- תשובה מה-webview;
- timeout. תשובה שמגיעה אחריו מקבלת `false`;
- `close` של הסשן: הקריאות שלו נכשלות מיד, ושל סשנים אחרים ממשיכות לחכות;
- `connect` חדש: כל הקריאות שמחכות נכשלות מיד, כי הדף שנשאל כבר לא קיים. הסשנים עצמם נשארים פתוחים, והקריאות הבאות שלהם מגיעות לדף החדש;
- ה-Agent ניתק באמצע (תור שנעצר). rmcp 3.5 לא מפיל את ה-handler כשהלקוח מתנתק, רק מבטל את `context.ct`, ולכן `call_tool` מחכה גם לו. בלי זה הרשומה נשארת עד ה-timeout (נבדק: הסרת הענף מפילה את הבדיקה).

בכל המקרים האלה ה-webview לא מקבל הודעה. כלי שכבר רץ שם ממשיך עד הסוף, ומה שכתב נשאר חלק מהתור.

## התאמה למתאם Claude Code

המתאם (`harness/claude_code.rs`) לא שונה. נבדק מול ה-CLI האמיתי שמה שהגשר מגיש מתאים למה שהוא מצפה:

- **שם השרת.** המתאם כותב ל-`mcp.json` את ה-`url` וה-`token` תחת המפתח `slidr`, ומשם ה-CLI גוזר את הקידומת `mcp__slidr__`. השם שהגשר מחזיר ב-`serverInfo` הוא גם `slidr`, אבל הקידומת לא תלויה בו.
- **שמות הכלים.** ה-CLI הציג את הכלי כ-`mcp__slidr__deck_code_word`. המתאם הסיר את הקידומת, והאירוע הגיע עם `name: "deck_code_word"` ו-`source: "app"`. לגשר הגיע השם בלי קידומת.
- **בדיקת ה-`init`.** לא נשלח `tools_unavailable`, כלומר `init.tools` הכיל את הכלי. המקרה ההפוך (רשימה שנדחתה) נבדק רק על הקלטה, כמו ב-ADR-010.
- **סשן עם נקודת קצה ובלי כלים** (`open([])`) ייעצר ב-`tools_unavailable`. מי שלא רוצה כלים לא מעביר `toolEndpoint`.
- **תצורת השרת שונה מה-spike.** ה-spike הגיש SSE עם ברירות המחדל של rmcp. כאן `legacy_session_mode(false)` ו-`json_response(true)`. Claude Code 2.1.287 עובד גם כך.

## ה-harness המדומה: צעד שמבצע קריאה

ADR-010 קבע שקריאות כלים במדומה הן אירועים בלבד, ושלשער האיכות (T13) הוא יצטרך לקרוא לכלים באמת. זה נוסף:

<div dir="ltr">

```json
{ "delayMs": 200, "type": "tool_call_started", "id": "t1", "name": "text_set",
  "input": { "elementId": "e_1", "markdown": "Shorter" }, "call": true }
```

</div>

- צעד `tool_call_started` של כלי app עם `"call": true` **מבוצע**: המדומה שולח `tools/call` אמיתי ב-HTTP לנקודת הקצה של הסשן, מחכה, ושולח בעצמו את `tool_call_finished` עם ה-`ok` וה-`summary` של התשובה (עד 300 תווים, `[image]` לתמונה).
- התסריט לא מכיל `tool_call_finished` לאותו `id`. `Script::parse` דוחה תסריט שכן, וגם `call` על צעד שאינו קריאה לכלי app.
- הקריאות מבוצעות אחת אחרי השנייה. עצירת התור באמצע קריאה מנתקת אותה (כך הקוד בנוי; אין לזה בדיקה נפרדת).
- בלי `toolEndpoint` בסשן הקריאה נכשלת: `the session has no tool endpoint`.
- שלושת התסריטים המובנים לא שונו, ואין בהם `call`. הם ממשיכים להיות אירועים בלבד, גם בסשן שיש לו נקודת קצה.

## בדיקות

- **Rust: 87 בדיקות ב-workspace** (היו 73), ועוד 4 `#[ignore]`.
  - **12 ב-`mcp_bridge/tests.rs`**, כולן מול הפורט האמיתי ב-HTTP, עם closure במקום ה-webview:
    - `server/discover`, `tools/list` ו-`tools/call` בצורה שה-CLI שולח (גרסה 2026-07-28, כולל הכותרות `Mcp-Method` ו-`Mcp-Name`), עם תוצאת טקסט בעברית ותוצאת תמונה;
    - לקוח ישן: `initialize` ואחריו בקשות בלי גרסה;
    - שלושה סשנים בו-זמנית, 30 קריאות במקביל: כל תשובה היא של הסשן שלה, כל סשן רואה רק את הכלים שלו, ו-token של סשן אחד לא פותח נתיב של אחר;
    - 401 ל-token שגוי, ריק או קצר בתו, ל-key לא מוכר ולסשן שנסגר;
    - timeout לפי `timeoutMs` של הכלי, ותשובה מאוחרת;
    - שגיאה מה-webview; כלי לא מוכר; קריאה לפני `connect` וכש-`forward` נכשל;
    - webview שנטען מחדש; סגירת סשן עם קריאה שמחכה; Agent שמתנתק באמצע קריאה;
    - הצורות מול `contract.json`.
  - **2 ב-`harness/mock.rs`**: תסריט עם שלושה צעדי `call` רץ דרך `HarnessManager`, נקודת הקצה והגשר, עד closure שמשחק את ה-webview. זה החלק של Rust בתרחיש המלא מול ה-harness המדומה.
  - **`cargo fmt --check`, `cargo clippy -D warnings`**: נקיים.
- **TypeScript: 17 בדיקות ב-`apps/desktop/src/agent`** (היו 8). 9 חדשות ב-`toolBridge.test.ts`, מול `invoke` מזויף:
  - `toReply` והצורות מול `contract.json`;
  - `connect`, `open`, `close`;
  - קריאה שמגיעה ב-Channel ותשובה שחוזרת תחת ה-`callId`;
  - שתי קריאות במקביל שמסתיימות בסדר הפוך;
  - `handler` שזורק או נדחה; `tool_bridge_reply` שנכשל; `AgentError`;
  - הגשר מעל ה-Deck API האמיתי, כפי ש-`AgentService` יחבר אותו: `api.list('slide')` ל-`open`, `text_set` שמשנה את המצגת בתוך התור, כלי מחוץ להיקף, ו-`sessionKey` לא מוכר.
- **מול ה-CLI האמיתי** (`real_cli_calls_a_tool_through_the_bridge`, `#[ignore]`), Claude Code 2.1.287, Haiku, שתי ריצות ב-2026-10-03:
  - **ריצה 1 (debug, תוצאת טקסט): עברה.** `session_started`; `tool_call_started` עם `deck_code_word`, `source: "app"` ו-`input: {"deck":"plan"}`; `tool_call_finished` עם `ok: true` ומילת הקוד; ה-Agent ענה `HERON-4821`. הגשר קיבל קריאה אחת, תחת ה-`sessionKey` של הסשן. בלי אירוע `error`. עלות: $0.006855.
  - **ריצה 2 (release, נוספה תמונה לתוצאה): הגשר עבד, והבדיקה נכשלה על assertion שגוי שלי.** האירועים זהים לריצה 1, וה-`summary` הכיל `[image]`, כלומר התמונה הגיעה ל-CLI. אבל ה-CLI מוסיף אחרי התמונה שורת טקסט עם הנתיב שבו שמר אותה, והבדיקה דרשה שה-`summary` יסתיים ב-`[image]`. ה-assertion תוקן ל-`contains`. **הבדיקה המתוקנת לא הורצה שוב** מול ה-CLI, כי המכסה הייתה שתי ריצות. עלות: $0.006949.
  - סה"כ $0.0138 לפי מה שה-CLI הדפיס.

## מדידות

**תקורת הגשר** (`measures_the_round_trip`, `#[ignore]`): קריאת `tools/call` ב-HTTP מקומי עד התשובה, עם closure שעונה מיד. 500 קריאות אחרי 20 קריאות חימום, חיבור TCP חדש לכל קריאה.

| מדד | חציון | p95 |
|---|---|---|
| תוצאת טקסט, release | 0.43ms | 0.57ms |
| תוצאת תמונה של 200KB, release | 0.91ms | 1.17ms |
| תוצאת טקסט, debug | 0.91ms | 1.15ms |
| תוצאת תמונה של 200KB, debug | 6.9ms | 13.9ms |
| כפי שה-CLI רואה, מ-`tool_call_started` עד `tool_call_finished` (debug, דגימה אחת) | 25.9ms | — |

- **זה לא אותו קטע ש-ADR-002 מדד.** ADR-002 מדד Rust ← webview ← Rust (0.7ms). כאן נמדד HTTP ← rmcp ← הגשר, **בלי** הקטע של ה-IPC ל-webview, שאי אפשר למדוד בלי להריץ את האפליקציה. התקורה המלאה בתוך האפליקציה צפויה להיות בערך הסכום של השניים, כ-1.1ms לטקסט. זו הערכה, לא מדידה.
- **"כפי שה-CLI רואה":** 25.9ms ב-debug מול 12ms ב-ADR-002 (release). ב-release לא נמדד: בריצה 2 ההדפסה באה אחרי ה-assertion שנכשל (הסדר תוקן).
- NFR-04 (פחות מ-50ms לקריאת כלי) מתקיים ברווח בחלק שנמדד.

**תלויות.** `Cargo.lock`: 442 ← 458, כלומר 16 crates, ולא 49 כמו ב-ADR-002. ההפרש: `hyper`, `tower`, `http-body`, `tokio-util` ודומיהם כבר היו בעץ, ושני ה-crates נלקחו בלי ברירות המחדל שלהם.

| נוסף ישירות | גרסה | תכונות |
|---|---|---|
| `rmcp` | 3.5.0 | `server`, `transport-streamable-http-server`. בלי `macros` ובלי לקוח |
| `axum` | 0.8.9 | `tokio`, `http1`. בלי JSON, בלי extractors |
| `tokio` (כבר היה) | 1 | נוספה התכונה `net` |

נגררו: `axum-core` 0.5.6, `matchit` 0.8.4, `httpdate` 1.0.3, `sse-stream` 0.2.6, `tokio-stream` 0.1.19, `futures` 0.3.34, `pastey` 0.2.3, `schemars_derive` 1.2.2, `serde_derive_internals` 0.30.0, `tracing-attributes` 0.1.31, `rand` 0.10.3, `rand_core` 0.10.1, `chacha20` 0.10.2, `cpufeatures` 0.3.1. אין תלות ישירה מעבר לשתיים ש-ADR-002 קבע.

- **לקוח ה-HTTP** של הבדיקות ושל המדומה נכתב ביד מעל `TcpStream` (כ-50 שורות), במקום להוסיף `reqwest` או את לקוח rmcp. הוא מדבר רק עם השרת של עצמו, שמחזיר גוף JSON אחד וסוגר.
- **גודל קובץ ההרצה לא נמדד.**

## ממצאים

**1. ה-CLI מוסיף לתוצאה עם תמונה שורת טקסט עם נתיב מקומי.** בריצה 2 ה-`summary` היה:

<div dir="ltr">

```
{"codeWord":"HERON-4821","deck":"plan"}
[image]
[Image: source: C:\Users\<user>\.claude\projects\<session>\tool-results\mcp-slidr-blob-….png]
```

</div>

זה ממצא 4 של ADR-002 (ה-CLI שומר תמונות לדיסק), אבל עם תוצאה שלא נרשמה שם: הנתיב, כולל שם המשתמש, נכנס ל-`tool_call_finished.summary`. משם הוא יגיע לשבב בצ'אט, ולתמלול שנשמר בקובץ המצגת (T09). ראה "השלכות".

**2. rmcp 3.5 דורש כותרות לבקשות של 2026-07-28.** בקשה עם `MCP-Protocol-Version: 2026-07-28` חייבת `Mcp-Method`, ו-`tools/call` גם `Mcp-Name`, וב-`_meta` את `protocolVersion` ו-`clientCapabilities`. ה-CLI שולח אותן. `client.rs` שולח אותן גם הוא, כך שהמדומה עובר באותו מסלול כמו ה-CLI.

**3. שגיאת פרוטוקול היא ערוץ גרוע לכישלון של כלי.** בבקשות של 2026-07-28 rmcp ממפה `METHOD_NOT_FOUND` ל-HTTP 404 ו-`INVALID_PARAMS` ל-400, והתיעוד שלו אומר שלקוחות מציגים שגיאות כאלה בלי ההודעה. לכן גם "כלי לא מוכר" חוזר כתוצאה. איך ה-CLI מציג שגיאת פרוטוקול לא נבדק כאן.

## הבדלים מ-ADR-002 ומה-SPEC

| נושא | ב-ADR-002 / SPEC | כאן | למה |
|---|---|---|---|
| רישום הכלים (MCP-03) | פעם אחת, בעליית האפליקציה | לכל סשן, ב-`open` | סשן רואה את הכלים של ההיקף שלו (ADR-011: 20KB לסשן אובייקט מול 74KB לכולם), והרשימה נכונה גם כששירות מתווסף אחרי העלייה |
| הקריאה ל-webview | אירוע Tauri גלובלי | `ipc::Channel` | אותם נימוקים כמו ב-ADR-010. אין צורך בהרשאת `core:event` |
| סשנים ברמת הפרוטוקול | ברירת המחדל של rmcp (`LocalSessionManager`, SSE) | בלי סשנים, תשובות JSON | אין מצב לנקות, והלקוח של המדומה ושל הבדיקות פשוט |
| עליית השרת | בעליית האפליקציה | ב-`open` הראשון | אין פורט פתוח בלי Agent; כישלון הוא שגיאה ולא קריסה |
| timeout | קבוע של 60 שניות | `timeoutMs` בהגדרת הכלי | MCP-04: "יותר לכלי תמונות" |
| כלי לא מוכר, timeout | שגיאת פרוטוקול | תוצאה עם `isError` | ה-Agent קורא את ההודעה |

## מה לא נעשה

- **לא הורץ בתוך האפליקציה.** ארבע הפקודות רשומות ב-`lib.rs` והקוד מתקמפל, אבל הן לא נקראו מ-webview אמיתי. לא נבדקו: ה-Channel מ-Rust ל-webview, קלט גדול (HTML של מגה-בתים) דרכו, והתקורה של ה-IPC.
- **ה-webview לא מקבל הודעה על קריאה שננטשה** (timeout, עצירת תור, סגירת סשן). הכלי רץ עד הסוף.
- **מגבלת 60 השניות של ה-CLI לא הוארכה.** `timeoutMs` ארוך מאריך רק את הצד של הגשר. ADR-002 ממצא 5: צריך משתנה סביבה לתהליך ה-CLI. נשאר ל-WG12-T04.
- **מגבלת גוף הבקשה נשארה 4MB** (ברירת המחדל של rmcp). רלוונטי ל-HTML גדול ב-`slide_create_from_html`.
- **בדיקת `Origin` לא הופעלה.** rmcp מאפשר (`enforce_origin_validation`), אבל לא נבדק אם ה-CLI שולח את הכותרת. בקשה מדפדפן נחסמת בכל מקרה ב-401.
- **אין תפוגה לסשן.** סשן חי עד `close` או עד יציאה. סשנים של webview שנטען מחדש נשארים פתוחים; הקריאות שלהם מגיעות לדף החדש, שלא מכיר אותם ועונה בשגיאה.
- **רשימת הכלים של סשן קבועה** מרגע הפתיחה. אין `listChanged`. שינוי דורש סשן חדש.
- **אין יומן קריאות** (AGT-08). כל קריאה עוברת ב-`handler` של ה-webview, ושם המקום לרשום.
- **אין הגבלה** על מספר הסשנים או על קריאות במקביל.
- **לא נבדקו מול ה-CLI האמיתי:** הבדיקה המתוקנת עם התמונה; רשימה שנדחתה ו-`tools_unavailable`; timeout; כמה תהליכי CLI בו-זמנית (נבדק רק עם לקוח HTTP); 401 אחרי סגירת סשן; לקוח אמיתי של גרסת פרוטוקול ישנה.

## נדרש מחוץ להיקף

- **`capabilities/default.json`:** לא נדרש שינוי. פקודות של האפליקציה עצמה ו-`Channel` לא צריכות הרשאה, כמו פקודות `agent_*`. לא אומת בריצה.
- **`docs/PLAN.md`, קריטריון ה-grep של WG10:** צריך להוסיף שלושה חריגים (ראה "סתירות").
- **`docs/SPEC.md`:**
  - MCP-03: "נרשמות בגשר בעליית האפליקציה" ← "נרשמות בגשר בפתיחת כל סשן".
  - 11.1: בתרשים כתוב `Tauri channel`, וזה נכון עכשיו.
  - 14.1: הגרסאות שנפתרו הן rmcp 3.5.0 ו-axum 0.8.9.
- **`packages/model/src/jsonSchema.ts` שורה 44:** ההערה מזכירה את מזהה הדרישה `MCP-03`, ולכן `git grep -i mcp` מוצא אותה. לא שלי ולא שונה.
- **`README.md`:** רשימת ה-ADRs לא כוללת את המסמך הזה.
- **`packages/agent-tools`:** לא שונה, ואין בו זכר לפרוטוקול. כשיהיה כלי איטי (WG12-T04) צריך מקום ל-`timeoutMs`. ראה "השלכות".

## סתירות שנמצאו ב-SPEC וב-PLAN

- **PLAN, קריטריון ה-grep.** "לא מוצא את המילה mcp מחוץ ל-`mcp_bridge/` ולמתאמי ה-harness". אחרי T04 `git grep -i mcp` בקוד המוצר מוצא עוד שלושה מקומות, ואי אפשר להימנע משניים מהם:
  - `apps/desktop/src-tauri/src/lib.rs`, שורה אחת: `#[path = "mcp_bridge/mod.rs"]`. מישהו חייב לנקוב בשם התיקייה. המודול עצמו נקרא `tool_bridge`, וכל שאר ה-crate משתמש בשם הזה.
  - `apps/desktop/src-tauri/Cargo.toml` ו-`Cargo.lock`: שם ה-crate `rmcp`.
  - `packages/model/src/jsonSchema.ts`: מזהה דרישה בהערה (לא מ-T04).

  המילה claude לא נוספה לשום קובץ מחוץ ל-`harness/claude_code.rs` ולתיקיית ההקלטות שלו. הבדיקה מול ה-CLI האמיתי יושבת שם מהסיבה הזאת. (היא מופיעה גם בבדיקות של `storage/workspace.rs`, כמזהה ה-harness `claude-code` ב-`meta.json`. זה היה שם לפני T04.)
- **MCP-03 מול ADR-011.** MCP-03 אומר רישום בעליית האפליקציה. ADR-011 אומר שהמתאם מפרסם את `list()` "לפי היקף הסשן". שניהם יחד דורשים רישום לכל סשן, וזה מה שנבנה.
- **MCP-04 ("יותר לכלי תמונות") מול ADR-002 ממצא 5.** הגשר לבדו לא יכול לתת יותר מ-60 שניות, כי ה-CLI מנתק קודם.
- **ADR-010, "השלכות → WG10-T04":** "ה-scope guard שלו קורא את `scope`". שומר ההיקף נבנה ב-Deck API (ADR-011), ב-webview. הגשר לא קורא את `scope`, ו-`SessionConfig.scope` לא נקרא ב-Rust בכלל. הנימוק של ה-`allow(dead_code)` שעליו תוקן.
- **ADR-002, "המתאם דק: כ-100 שורות".** ראה "מבנה".

## השלכות

- **WG11 (`AgentService`).** הסדר:
  1. **בעליית האפליקציה, פעם אחת:** `api = createDeckApi(bus, services)`, ואז `bridge = await connectToolBridge(handler)`.
     ה-`handler` מקבל `(sessionKey, name, input)`, מוצא את הסשן ואת התור הרץ שלו, ומחזיר `api.call(turn, name, input)`. כשאין סשן כזה או שאין תור רץ הוא זורק, וההודעה מגיעה ל-Agent כשגיאה.
  2. **לכל סשן:** `{ sessionKey, endpoint } = await bridge.open(api.list(scope.kind))`, ואחריו `sessionId = await agent.start(harnessId, thread, { scope, systemPrompt, toolEndpoint: endpoint, … }, onEvent)`.
     הסדר הזה מחייב: `start` צריך את נקודת הקצה. `sessionKey` ו-`sessionId` הם שני מזהים שונים, ו-`AgentService` שומר את שניהם.
  3. **לכל הודעת משתמש:** `turn = startTurn(sessionKey, scope, { label })`, שמירתו כתור הרץ של הסשן, ורק אז `agent.send(sessionId, …)`. ה-CLI לא קורא לכלים לפני ה-`send`.
     ב-`sessionKey` אין נקודתיים, ולכן הוא מתאים כ-`sessionId` של `startTurn` (ADR-011, `actorSession`).
  4. **ב-`turn_completed`:** התור נגמר. `turn.txId` נשמר ל"בטל שינויים".
  5. **בסגירה או ב-`exited`:** `agent.close(sessionId)`, ואחריו `bridge.close(sessionKey)`.
  - **עצירת תור:** כלי שרץ ב-webview בזמן `interrupt` מסתיים, והכתיבה שלו נשארת בתור. ה-Agent לא יקבל את התשובה.
  - **`bridge.open` יכול להידחות** עם `AgentError` מסוג `io`.
  - **סשן שהתהליך שלו נסגר ומתחדש (AGT-07)** יכול להמשיך עם אותו `sessionKey`: נקודת הקצה תקפה עד `close`.
  - **`connectToolBridge` פעם אחת.** קריאה נוספת (למשל ב-HMR) מפילה את הקריאות שמחכות.
- **WG10-T09, WG11 (תמלול ושבבים):** ה-`summary` של תוצאה עם תמונה מכיל נתיב מקומי עם שם המשתמש (ממצא 1). תוקן בשילוב: `summarize` ב-`claude_code.rs` משמיט את השורה `[Image: source: …]`, עם בדיקה (`summaries_leave_out_where_the_cli_saved_an_image`). לא נבדק מול ה-CLI האמיתי אחרי התיקון.
- **WG10-T11:**
  - יומן הקריאות נכתב ב-`handler`.
  - התמונות שה-CLI שומר (ADR-002 ממצא 4) נמצאות תחת `~/.claude/projects/<תיקייה>/<session>/tool-results/`.
  - סשנים של webview שנטען מחדש: כשיהיה `agent_sessions`, לסגור גם את סשני הגשר שלהם.
- **WG10-T13 (שער האיכות):** התסריט כותב `"call": true` על הקריאות שצריכות לשנות את המצגת. מה שנשאר ל-T13:
  - התסריט עצמו (ב-`harness/fixtures/scripts/` וברשימה `BUILTIN`);
  - `AgentService` שפותח סשן גשר גם ל-harness המדומה;
  - הרצה בתוך האפליקציה, שלא נעשתה כאן.

  הבדיקה ב-`agent.test.ts` כבר מקבלת `call` בצעד של תסריט.
- **WG12-T04 (כלי תמונות):**
  - להוסיף `timeoutMs` להגדרת הכלי. המקום הטבעי הוא שדה אופציונלי ב-`ToolDef` וב-`ToolListing` של `agent-tools`: כמה זמן כלי רשאי לקחת אינו ידע על הפרוטוקול, ו-`api.list()` יעבור ל-`open` כמו שהוא. עד אז `AgentService` יכול להוסיף את השדה כשהוא ממפה את הרשימה.
  - להאריך את המגבלה של ה-CLI במתאם.
- **WG9A (`slide_create_from_html`):** קלט מעל 4MB יידחה ב-413 לפני שיגיע ל-webview. תמונות צריכות להגיע כנכסים ולא מוטמעות ב-HTML, או שהמגבלה תוגדל (`with_max_request_body_bytes`).
- **WG13-T04 (מעבר אבטחה):**
  - ה-token כתוב ב-`mcp.json` בתיקיית הסשן, וכל תהליך של אותו משתמש יכול לקרוא אותו. זה התכנון של SEC-01.
  - לבדוק אם ה-CLI שולח `Origin`, ואם לא, להפעיל את בדיקת ה-`Origin`.
  - כל חלון של האפליקציה יכול לקרוא ל-`tool_bridge_*`. חלון הצילום לא עושה זאת.

</div>
