<div dir="rtl">

# ADR-001 — מתאם Claude Code: CLI גולמי, לא sidecar של Agent SDK

סטטוס: **הוכרע** · 2026-10-02 · spike: WG0-S1 · קוד: `spikes/s1-claude-cli/`

## ההחלטה

המתאם הראשון (`harness/claude_code.rs`) מפעיל את `claude` ישירות מ-Rust כתהליך ארוך-חיים עם `stream-json` דו-כיווני. **אין צורך ב-sidecar של Agent SDK.** כל ארבע הנקודות הפתוחות של SPEC 11.3 נסגרו במדידה, כולל עצירת תור בלי להרוג את התהליך.

נבדק מול Claude Code **2.1.287** ב-Windows 11, מתוך Rust (tokio), עם התחברות מנוי קיימת.

## ארבע הנקודות הפתוחות של SPEC 11.3

| נושא | מה נמצא | איך נבדק |
|---|---|---|
| מבנה הודעת משתמש ב-stdin | `{"type":"user","message":{"role":"user","content":[...]}}`, שורה אחת לכל הודעה. `content` מקבל גם בלוק `image` (base64), כך שצילום מסך מודבק עובר באותו ערוץ | 6 תורות על תהליך אחד; תור עם תמונה ("Left is red, right blue") |
| עצירת תור באמצע | הודעת בקרה ב-stdin: `{"type":"control_request","request_id":"…","request":{"subtype":"interrupt"}}`. חוזר `control_response` עם `subtype: success`, ואחריו `result` עם `subtype: error_during_execution` ו-`terminal_reason: aborted_streaming`. **התהליך נשאר חי** והתור הבא עובד | עצירה אחרי 3 קטעי טקסט: 12.6ms מהבקשה עד `result` |
| בידוד מהגדרות המשתמש | `--restricted --strict-mcp-config --disable-slash-commands`. בלי הדגלים התהליך טוען 32 כלים, 6 מחברי claude.ai של החשבון, 32 skills וזיכרון אוטומטי. איתם: רק שרת ה-MCP שלנו, 0 skills, בלי זיכרון, `CLAUDE.md` בתיקיית העבודה לא נטען, וההתחברות ממשיכה לעבוד. **לא `--safe-mode`:** הוא מבטל גם את השרת שהועבר ב-`--mcp-config` | השוואת הודעת `system/init` בשבעה צירופי דגלים (`probe.mjs`); קובץ `CLAUDE.md` עם מילת קוד שלא דלפה |
| חסימת כלים מובנים | `--tools "Read,Grep,WebSearch,WebFetch"` קובע רשימה **מדויקת** של כלים מובנים (`--tools ""` נותן אפס). אין צורך ברשימת `--disallowedTools` | `init.tools` מכיל בדיוק את ארבעת הכלים |

## שורת הפקודה שנבדקה

<div dir="ltr">

```
claude -p
  --input-format stream-json --output-format stream-json
  --verbose --include-partial-messages
  --restricted --disable-slash-commands
  --strict-mcp-config --mcp-config <session>/mcp.json
  --tools "Read,Grep,WebSearch,WebFetch"
  --allowedTools Read Grep WebSearch WebFetch "mcp__slidr__*"
  --permission-mode dontAsk
  --system-prompt-file <session>/system.md        (the spikes ran with --append-system-prompt-file)
  --model <model> [--effort <level>] [--resume <native-session-id>]

cwd = <session>/attachments        (see "File access" below)
env = parent env without CLAUDE* / ANTHROPIC* variables
Windows: CREATE_NO_WINDOW
```

</div>

## ממצאים שמשנים את ה-SPEC

**1. גישה לקבצים: כלל `Read(./attachments/**)` לא מגביל.** ב-SPEC 11.3 ההנחה הייתה שכלל הרשאה עם נתיב מגביל את הקריאה לתיקיית הצירופים. בפועל ה-Agent קרא קובץ שישב ליד `attachments/` בתיקיית העבודה: קריאה בתוך תיקיית העבודה מותרת תמיד, והכלל רק מוסיף. מה שכן מגביל הוא `--restricted`, שסוגר את כלי הקבצים לתיקיית העבודה. לכן **תיקיית העבודה של התהליך היא תיקיית `attachments/` עצמה**, וקובצי ההגדרות (`mcp.json`, `system.md`) יושבים מחוצה לה ומועברים בנתיב מלא. נבדק: `Read` ו-`Grep` על התיקייה שמעל נדחו, ונרשמו ב-`permission_denials`.

**2. `total_cost_usd` מצטבר לסשן, לא לתור.** הערך גדל מתור לתור (0.0145 → 0.0179 → 0.0195…), ממשיך גם אחרי `--resume`, ולא נשמר כשהתהליך נהרג. `usage` (tokens) הוא כן לתור. לכן `TurnCompleted.cost_usd` מחושב כהפרש מהתור הקודם, והתצוגה (CHT-U06) נשענת קודם על tokens.

**3. `system/init` חוזר בכל תור, ולא מגיע לפני ההודעה הראשונה.** `SessionStarted` נשלח פעם אחת (לפי `session_id`). `probe()` לא יכול להישען עליו; הוא משתמש ב-`claude --version` וב-`claude auth status` (מחזיר JSON עם `loggedIn`, `authMethod`, `subscriptionType`).

**4. resume תלוי בתיקיית העבודה.** התמלול המקורי נשמר ב-`~/.claude/projects/<cwd>/`, ולכן `--resume` עובד רק מאותה תיקייה. זה מתיישב עם AGT-06: במחשב אחר או אחרי העברת קובץ נפתח סשן חדש עם תקציר.

**5. אין חלון קונסול.** כשההורה הוא אפליקציית GUI (נבדק מתוך אפליקציית Tauri ב-S2), הדגל `CREATE_NO_WINDOW` מספיק: לא נפתח חלון של `claude.exe` או של `conhost.exe` לאורך הריצה.

**6. `--system-prompt-file` ו-`--append-system-prompt-file` קיימים אבל לא מופיעים ב-`--help`.** שניהם עובדים (נבדקו עם מילת קוד). מכיוון שאינו מתועד, `probe()` צריך לבדוק שהדגל מתקבל, והמתאם נופל ל-`--append-system-prompt` עם הטקסט עצמו אם לא.

## מיפוי אירועים (מאומת)

| פלט ה-CLI | `AgentEvent` |
|---|---|
| `system` / `init` (הראשון בלבד) | `SessionStarted { native_session_id, model }` |
| `stream_event` → `content_block_delta` / `text_delta` | `TextDelta` |
| `stream_event` → `content_block_delta` / `thinking_delta` | `ThinkingDelta` |
| `assistant` עם בלוק `tool_use` (הקלט המלא) | `ToolCallStarted { id, name, input }` |
| `user` עם בלוק `tool_result` | `ToolCallFinished { id, ok: !is_error, summary }` |
| `result` | `TurnCompleted`. `subtype: success` או `error_during_execution`; `terminal_reason`: `completed` / `aborted_streaming`; `usage`; `permission_denials` |
| `rate_limit_event` | מצב המכסה: `status`, ניצול חלון 5 שעות ושבוע, מועד איפוס. כש-`status` אינו `allowed` → `Error { kind: Quota }` (CHT-U09) |
| `system` / `permission_denied` | נרשם ביומן האבחון (AGT-08) |
| `control_response` | אישור לבקשת בקרה (עצירה) |
| `system` / `status`, `system` / `thinking_tokens` | מצב "עובד…" (CHT-U03) |
| סגירת stdout | `Exited { code }` |

## מדידות

| מדד | ערך |
|---|---|
| עליית תהליך עד `init` (כולל `--resume`) | כ-0.7 שניות |
| זמן עד הטקסט הראשון, תהליך חם (Haiku) | 0.85–1.3 שניות |
| זמן עד הטקסט הראשון, תהליך חדש עם `--resume` | 1.8–2.2 שניות |
| עצירה: מהבקשה עד `result` | 12.6ms |
| סגירה: EOF ב-stdin עד יציאה (קוד 0) | 330ms |
| הריגת תהליך באמצע תור | 19ms, בלי תהליכים יתומים; `--resume` אחריה שומר את כל ההקשר, כולל הבקשה שנקטעה |
| גודל ה-prompt הבסיסי: ברירת מחדל ← מבודד | כ-26,000 ← 7,000–10,000 tokens (לפי מספר הכלים) |
| גודל ה-prompt הבסיסי עם החלפה במקום הוספה | כ-3,850 tokens עם ארבעת הכלים המובנים; 446 בלי כלים בכלל |
| המתנה לכלי ה-MCP לפני התור הראשון | ה-CLI מחכה לרשימת הכלים גם כשהיא מתעכבת 4 שניות; אין מרוץ |

## השלכות

- **PLAN:** נקודת ההחלטה "CLI גולמי או sidecar" נסגרת: CLI גולמי. WG10-T02 נשאר בהיקפו (2 ימים); מתאם Agent SDK נשאר P2 (WG10-T12) כהוכחת הפשטה בלבד.
- **תוכנית גיבוי לעצירה:** אם `control_request` יפסיק לעבוד בגרסה עתידית, הריגת התהליך ו-`--resume` נבדקו ועובדים. המתאם מממש את שניהם: בקשת בקרה, ואם אין `result` תוך שנייה — הריגה.
- **AGT-07** (סגירת תהליך לא פעיל) זול: חידוש עולה כשנייה אחת.
- **סיכון R1 יורד מ"גבוהה" ל"בינונית":** הפרוטוקול עובד, אבל חלקו לא מתועד (`control_request`, `--append-system-prompt-file`). המענה: בדיקת עשן של המתאם מול ה-CLI האמיתי שרצה כשגרסת ה-CLI משתנה (`claude --version` נשמר ב-`meta.json`).

## ה-system prompt: החלפה, לא הוספה (הוכרע 2026-10-03)

המתאם **מחליף** את ה-system prompt של Claude Code (`--system-prompt-file`) ואינו מוסיף עליו. ה-prompt המובנה מגדיר עוזר תכנות בטרמינל (תשובות קצרות, מוסכמות קוד, git), והמודולים של SPEC 11.6 כבר מגדירים תפקיד, כלים, היקף ושפה. ההחלפה גם חוסכת כ-3,200 tokens בכל תור.

ה-spikes עצמם רצו עם הוספה (`--append-system-prompt-file`). ההחלפה נמדדה רק לגודל ה-prompt, לא להתנהגות. היא נבדקת מול סט ההערכה ב-M2 (WG10-T08), והחזרה להוספה היא שינוי של דגל אחד.

## מה לא נבדק

- מצבי שגיאה של CHT-U09 שאי אפשר לייצר לפי דרישה: מכסה שמוצתה, חשבון לא מחובר. מבנה `rate_limit_event` ידוע; ההתנהגות בפועל בסף לא נצפתה.
- `rate_limit_event.status` מקבל ערכים נוספים מעבר ל-`allowed` (נצפה `allowed_warning`); רשימת הערכים המלאה לא ידועה, ולכן המיפוי מתייחס לכל ערך שמתחיל ב-`allowed` כתקין.
- מודלים אחרים מ-Haiku: הפרוטוקול זהה, הזמנים לא.

</div>
