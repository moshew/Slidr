//! A harness that replays recorded event scripts (SPEC 14.5): the chat, the tool chips and the
//! error states without a CLI and without cost. Used by the Rust tests, and selectable in the app
//! (debug builds, or with `SLIDR_AGENT_MOCK` set) for UI work and end-to-end tests.
//!
//! A script is JSON (`fixtures/scripts/*.json`):
//!
//! ```json
//! { "description": "…",
//!   "turns": [
//!     [ { "delayMs": 400, "type": "text_delta", "text": "Hello" },
//!       { "delayMs": 20, "type": "turn_completed", "outcome": "completed" } ] ] }
//! ```
//!
//! Each step is an [`AgentEvent`] in its IPC shape plus `delayMs`, the wait before it. The n-th
//! `send` plays turn n, wrapping around after the last. Every turn ends with `turn_completed`;
//! `session_started` and `exited` are the mock's own (the first `send`, and `close`). The model
//! picked for the session is the script's name.
//!
//! Tool calls are only events, and nothing executes them, unless the step says `"call": true`:
//!
//! ```json
//! { "delayMs": 200, "type": "tool_call_started", "id": "t1", "name": "text_set",
//!   "input": { "elementId": "e_1", "markdown": "Shorter" }, "call": true }
//! ```
//!
//! Such a step is carried out. The mock calls the tool through the session's tool endpoint as a
//! real agent would, waits for the answer, and emits the call's `tool_call_finished` from it;
//! the script holds none for that id. This is how a scripted turn changes the deck.
//!
//! A carried-out call can use what an earlier one returned, as an agent reads an id out of a
//! result: `{ "$ref": "t1.slideId" }` anywhere in its input stands for the value at that path
//! in the JSON result of call `t1` of the same session (`t1.created.0` for a list item).

use std::{
    collections::HashMap,
    sync::{Arc, Mutex, MutexGuard, PoisonError},
    time::Duration,
};

use async_trait::async_trait;
use serde::Deserialize;
use serde_json::Value;
#[cfg(test)]
use tokio::time::Instant;
use tokio::{sync::oneshot, task::JoinHandle};

use super::{
    AgentError, AgentEvent, AgentHarness, AgentSession, Capabilities, EventSink, HarnessDescriptor,
    HarnessState, HarnessStatus, ModelOption, Result, SessionConfig, ToolEndpoint, ToolSource,
    TurnOutcome, UserTurn,
};
use crate::tool_bridge::{self, Content};

/// Length of a carried-out call's summary, in characters: what the real adapters keep.
const SUMMARY_CHARS: usize = 300;

/// The key of a reference to an earlier call's result.
const REF_KEY: &str = "$ref";

/// The scripts built into the app, by name.
const BUILTIN: [(&str, &str); 11] = [
    ("import", include_str!("fixtures/scripts/import.json")),
    (
        "slide-chat",
        include_str!("fixtures/scripts/slide-chat.json"),
    ),
    ("errors", include_str!("fixtures/scripts/errors.json")),
    (
        "deck-build",
        include_str!("fixtures/scripts/deck-build.json"),
    ),
    (
        "quality-gate",
        include_str!("fixtures/scripts/quality-gate.json"),
    ),
    (
        "gate-stuck",
        include_str!("fixtures/scripts/gate-stuck.json"),
    ),
    (
        "text-variations",
        include_str!("fixtures/scripts/text-variations.json"),
    ),
    (
        "slide-redesign",
        include_str!("fixtures/scripts/slide-redesign.json"),
    ),
    (
        "image-alternatives",
        include_str!("fixtures/scripts/image-alternatives.json"),
    ),
    (
        "template-create",
        include_str!("fixtures/scripts/template-create.json"),
    ),
    ("outline", include_str!("fixtures/scripts/outline.json")),
];

/// One recorded conversation.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Script {
    /// What the script shows, and where it came from.
    #[allow(dead_code, reason = "documentation inside the file")]
    pub description: String,
    turns: Vec<Vec<Step>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Step {
    #[serde(default)]
    delay_ms: u64,
    /// On a `tool_call_started` of an app tool: make the call for real.
    #[serde(default)]
    call: bool,
    #[serde(flatten)]
    event: AgentEvent,
}

impl Script {
    /// Parses and checks a script: at least one turn, each ending in its only `turn_completed`;
    /// a carried-out call is an app tool's `tool_call_started` with no scripted result.
    pub fn parse(json: &str) -> std::result::Result<Self, String> {
        let script: Self = serde_json::from_str(json).map_err(|e| e.to_string())?;
        if script.turns.is_empty() {
            return Err("a script needs at least one turn".into());
        }
        for (index, turn) in script.turns.iter().enumerate() {
            let ends = turn
                .iter()
                .filter(|s| matches!(s.event, AgentEvent::TurnCompleted { .. }))
                .count();
            let last_ends = matches!(
                turn.last().map(|s| &s.event),
                Some(AgentEvent::TurnCompleted { .. })
            );
            let own = turn.iter().any(|s| {
                matches!(
                    s.event,
                    AgentEvent::SessionStarted { .. } | AgentEvent::Exited { .. }
                )
            });
            if ends != 1 || !last_ends || own {
                return Err(format!(
                    "turn {index}: must end with its only turn_completed, and hold no \
                     session_started or exited"
                ));
            }
            for step in turn.iter().filter(|s| s.call) {
                let AgentEvent::ToolCallStarted {
                    id,
                    source: ToolSource::App,
                    ..
                } = &step.event
                else {
                    return Err(format!(
                        "turn {index}: only a tool_call_started of an app tool can be carried \
                         out (\"call\": true)"
                    ));
                };
                let scripted = turn.iter().any(|s| {
                    matches!(&s.event, AgentEvent::ToolCallFinished { id: done, .. } if done == id)
                });
                if scripted {
                    return Err(format!(
                        "turn {index}: call {id} is carried out, so its tool_call_finished comes \
                         from the tool and not from the script"
                    ));
                }
            }
        }
        Ok(script)
    }
}

/// What the carried-out calls of a session returned, by call id: the JSON of each result.
type Results = Arc<Mutex<HashMap<String, Value>>>;

/// `input` with every `{ "$ref": "<call id>.<path>" }` replaced by the value at that path in the
/// result of that earlier call. Fails when a reference leads nowhere.
fn resolve_refs(
    input: &Value,
    results: &HashMap<String, Value>,
) -> std::result::Result<Value, String> {
    match input {
        Value::Object(map) => {
            if let (1, Some(Value::String(reference))) = (map.len(), map.get(REF_KEY)) {
                let mut path = reference.split('.');
                let call = path.next().unwrap_or_default();
                let mut value = results.get(call);
                for key in path {
                    value = value.and_then(|v| match key.parse::<usize>() {
                        Ok(index) if v.is_array() => v.get(index),
                        _ => v.get(key),
                    });
                }
                return value.cloned().ok_or_else(|| {
                    format!(
                        "the script refers to {reference:?}, which no earlier call of the session \
                         returned"
                    )
                });
            }
            map.iter()
                .map(|(key, value)| Ok((key.clone(), resolve_refs(value, results)?)))
                .collect::<std::result::Result<_, String>>()
                .map(Value::Object)
        }
        Value::Array(items) => items
            .iter()
            .map(|item| resolve_refs(item, results))
            .collect::<std::result::Result<_, String>>()
            .map(Value::Array),
        other => Ok(other.clone()),
    }
}

/// Carries out a scripted call through the session's tool endpoint. Returns how it went, as the
/// call's `tool_call_finished`, and the JSON the tool answered with, when it answered with JSON.
async fn carry_out(
    endpoint: Option<&ToolEndpoint>,
    id: &str,
    name: &str,
    input: &Value,
) -> (AgentEvent, Option<Value>) {
    let reply = match endpoint {
        Some(endpoint) => tool_bridge::call_tool(&endpoint.url, &endpoint.token, name, input).await,
        None => Err("the session has no tool endpoint".to_owned()),
    };
    let mut result = None;
    let (ok, summary) = match reply {
        Ok(reply) => {
            let parts: Vec<&str> = reply
                .content
                .iter()
                .map(|part| match part {
                    Content::Text { text } => text.as_str(),
                    Content::Image { .. } => "[image]",
                })
                .collect();
            if !reply.is_error {
                result = parts
                    .first()
                    .and_then(|text| serde_json::from_str(text).ok());
            }
            (!reply.is_error, parts.join("\n"))
        }
        Err(message) => (false, message),
    };
    let finished = AgentEvent::ToolCallFinished {
        id: id.to_owned(),
        ok,
        summary: shorten(summary),
    };
    (finished, result)
}

/// A summary as long as the real adapters keep it.
fn shorten(summary: String) -> String {
    if summary.chars().count() <= SUMMARY_CHARS {
        summary
    } else {
        summary.chars().take(SUMMARY_CHARS).chain(['…']).collect()
    }
}

/// Plays a step that is a carried-out call: the call with its references filled in, then its
/// result.
async fn play_call(
    sink: &EventSink,
    endpoint: Option<&ToolEndpoint>,
    results: &Results,
    event: &AgentEvent,
) {
    let AgentEvent::ToolCallStarted {
        id,
        name,
        source,
        input,
    } = event
    else {
        return;
    };
    let resolved = resolve_refs(input, &lock(results));
    let input = match resolved {
        Ok(input) => input,
        Err(message) => {
            sink.emit(event.clone());
            sink.emit(AgentEvent::ToolCallFinished {
                id: id.clone(),
                ok: false,
                summary: shorten(message),
            });
            return;
        }
    };
    sink.emit(AgentEvent::ToolCallStarted {
        id: id.clone(),
        name: name.clone(),
        source: *source,
        input: input.clone(),
    });
    let (finished, result) = carry_out(endpoint, id, name, &input).await;
    if let Some(result) = result {
        lock(results).insert(id.clone(), result);
    }
    sink.emit(finished);
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

/// The scripted harness. Its "models" are its scripts.
pub struct MockHarness {
    scripts: Vec<(String, Arc<Script>)>,
}

impl MockHarness {
    /// A harness with the given scripts; the first is the default.
    pub fn new(scripts: Vec<(String, Script)>) -> Self {
        Self {
            scripts: scripts
                .into_iter()
                .map(|(name, script)| (name, Arc::new(script)))
                .collect(),
        }
    }

    /// The harness with the scripts built into the app.
    pub fn builtin() -> Self {
        Self::new(
            BUILTIN
                .iter()
                // A broken built-in script is caught by the tests, not at run time.
                .filter_map(|(name, json)| Some(((*name).to_owned(), Script::parse(json).ok()?)))
                .collect(),
        )
    }
}

#[async_trait]
impl AgentHarness for MockHarness {
    fn descriptor(&self) -> HarnessDescriptor {
        HarnessDescriptor {
            id: "mock".into(),
            name: "Scripted mock".into(),
            capabilities: Capabilities {
                streaming: true,
                resume: true,
                interrupt: true,
                image_input: true,
                tool_endpoint: true,
                thinking: true,
            },
            models: self
                .scripts
                .iter()
                .map(|(name, _)| ModelOption {
                    id: name.clone(),
                    label: name.clone(),
                    effort_levels: None,
                })
                .collect(),
            default_model: self.scripts.first().map(|(name, _)| name.clone()),
            effort_levels: Vec::new(),
        }
    }

    async fn probe(&self) -> HarnessStatus {
        HarnessStatus {
            state: HarnessState::Ready,
            version: Some(env!("CARGO_PKG_VERSION").into()),
            account: None,
            detail: None,
        }
    }

    async fn start(&self, config: SessionConfig, sink: EventSink) -> Result<Box<dyn AgentSession>> {
        let found = match &config.model {
            None => self.scripts.first(),
            Some(model) => self.scripts.iter().find(|(name, _)| name == model),
        };
        let Some((name, script)) = found else {
            return Err(AgentError::invalid_input(format!(
                "no mock script named {:?}",
                config.model.unwrap_or_default()
            )));
        };
        Ok(Box::new(MockSession {
            script: Arc::clone(script),
            model: name.clone(),
            native_id: config
                .resume
                .unwrap_or_else(|| format!("mock-{}", uuid::Uuid::new_v4().simple())),
            tool_endpoint: config.tool_endpoint,
            results: Results::default(),
            sink,
            started: false,
            next_turn: 0,
            player: None,
        }))
    }
}

struct MockSession {
    script: Arc<Script>,
    model: String,
    native_id: String,
    /// Where carried-out calls go.
    tool_endpoint: Option<ToolEndpoint>,
    /// What they returned, for the calls after them.
    results: Results,
    sink: EventSink,
    started: bool,
    next_turn: usize,
    player: Option<Player>,
}

/// The task playing the current turn.
struct Player {
    stop: oneshot::Sender<()>,
    task: JoinHandle<()>,
}

impl MockSession {
    /// Stops the playing turn, which then ends as an interrupted turn does on a real harness.
    async fn stop(&mut self) {
        if let Some(player) = self.player.take() {
            let _ = player.stop.send(());
            let _ = player.task.await;
        }
    }
}

#[async_trait]
impl AgentSession for MockSession {
    async fn send(&mut self, _turn: UserTurn) -> Result<()> {
        if self.player.as_ref().is_some_and(|p| !p.task.is_finished()) {
            return Err(AgentError::new(
                super::AgentErrorKind::Busy,
                "a turn is still running in this session",
            ));
        }
        if !self.started {
            self.started = true;
            self.sink.emit(AgentEvent::SessionStarted {
                native_session_id: self.native_id.clone(),
                model: self.model.clone(),
            });
        }
        let index = self.next_turn % self.script.turns.len();
        self.next_turn += 1;
        let script = Arc::clone(&self.script);
        let sink = self.sink.clone();
        let endpoint = self.tool_endpoint.clone();
        let results = Arc::clone(&self.results);
        let (stop, stopped) = oneshot::channel::<()>();
        let task = tokio::spawn(async move {
            let play = async {
                for step in script.turns.get(index).into_iter().flatten() {
                    tokio::time::sleep(Duration::from_millis(step.delay_ms)).await;
                    if step.call {
                        play_call(&sink, endpoint.as_ref(), &results, &step.event).await;
                    } else {
                        sink.emit(step.event.clone());
                    }
                }
            };
            tokio::select! {
                biased;
                _ = stopped => {
                    // What a real harness emits for an interrupted turn: no more output.
                    sink.emit(AgentEvent::TurnCompleted { outcome: TurnOutcome::Interrupted });
                }
                () = play => {}
            }
        });
        self.player = Some(Player { stop, task });
        Ok(())
    }

    async fn interrupt(&mut self) -> Result<()> {
        self.stop().await;
        Ok(())
    }

    async fn close(mut self: Box<Self>) -> Result<()> {
        self.stop().await;
        self.sink.emit(AgentEvent::Exited { code: Some(0) });
        Ok(())
    }

    fn native_session_id(&self) -> Option<String> {
        Some(self.native_id.clone())
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::*;
    use crate::harness::{Scope, ToolSource};

    type TestResult = std::result::Result<(), Box<dyn std::error::Error>>;

    #[test]
    fn builtin_scripts_parse() -> TestResult {
        for (name, json) in BUILTIN {
            Script::parse(json).map_err(|e| format!("{name}: {e}"))?;
        }
        assert_eq!(MockHarness::builtin().scripts.len(), BUILTIN.len());
        Ok(())
    }

    #[test]
    fn rejects_malformed_scripts() {
        let bad = [
            r#"{ "description": "", "turns": [] }"#,
            r#"{ "description": "", "turns": [[ { "type": "text_delta", "text": "no end" } ]] }"#,
            r#"{ "description": "", "turns": [[
                { "type": "turn_completed", "outcome": "completed" },
                { "type": "text_delta", "text": "after the end" } ]] }"#,
            r#"{ "description": "", "turns": [[ { "type": "exited", "code": 0 },
                { "type": "turn_completed", "outcome": "completed" } ]] }"#,
            r#"{ "description": "", "turns": [[ { "type": "no_such_event" } ]] }"#,
            r#"{ "description": "", "turns": [], "extra": 1 }"#,
            // Only an app tool's call can be carried out, and then the script holds no result.
            r#"{ "description": "", "turns": [[ { "type": "text_delta", "text": "x", "call": true },
                { "type": "turn_completed", "outcome": "completed" } ]] }"#,
            r#"{ "description": "", "turns": [[
                { "type": "tool_call_started", "id": "t", "name": "WebSearch", "source": "harness",
                  "input": {}, "call": true },
                { "type": "turn_completed", "outcome": "completed" } ]] }"#,
            r#"{ "description": "", "turns": [[
                { "type": "tool_call_started", "id": "t", "name": "slide_get", "input": {}, "call": true },
                { "type": "tool_call_finished", "id": "t", "ok": true, "summary": "scripted" },
                { "type": "turn_completed", "outcome": "completed" } ]] }"#,
        ];
        for json in bad {
            assert!(Script::parse(json).is_err(), "{json}");
        }
    }

    /// The realistic script keeps what the recorded transcript had: Hebrew text and two tool
    /// calls in parallel.
    #[test]
    fn import_script_is_the_recorded_turn() -> TestResult {
        let script = Script::parse(BUILTIN[0].1)?;
        let events: Vec<&AgentEvent> = script.turns.iter().flatten().map(|s| &s.event).collect();
        let tools: Vec<&str> = events
            .iter()
            .filter_map(|e| match e {
                AgentEvent::ToolCallStarted {
                    name,
                    source: ToolSource::App,
                    ..
                } => Some(name.as_str()),
                _ => None,
            })
            .collect();
        assert_eq!(
            tools,
            [
                "import_inspect",
                "deck_get_outline",
                "import_capture",
                "deck_update"
            ]
        );
        let text: String = events
            .iter()
            .filter_map(|e| match e {
                AgentEvent::TextDelta { text } => Some(text.as_str()),
                _ => None,
            })
            .collect();
        assert!(text.contains("תוכנית עבודה 2027"));
        assert!(matches!(
            events.last(),
            Some(AgentEvent::TurnCompleted {
                outcome: TurnOutcome::Completed
            })
        ));
        Ok(())
    }

    #[tokio::test(start_paused = true)]
    async fn plays_with_timing_and_resumes_by_id() -> TestResult {
        let harness = MockHarness::builtin();
        let (sink, mut events) = EventSink::channel();
        let mut config = SessionConfig::new(Scope::Deck, "", PathBuf::new());
        config.model = Some("slide-chat".into());
        config.resume = Some("earlier-id".into());
        let mut session = harness.start(config, sink).await?;
        assert_eq!(session.native_session_id().as_deref(), Some("earlier-id"));

        let began = Instant::now();
        session.send(UserTurn::text("Hi")).await?;
        let first = events.recv().await;
        assert!(matches!(
            first,
            Some(AgentEvent::SessionStarted { ref native_session_id, ref model })
                if native_session_id == "earlier-id" && model == "slide-chat"
        ));
        let mut last = None;
        while let Some(event) = events.recv().await {
            let end = matches!(event, AgentEvent::TurnCompleted { .. });
            last = Some(event);
            if end {
                break;
            }
        }
        let Some(AgentEvent::TurnCompleted {
            outcome: TurnOutcome::Completed,
        }) = last
        else {
            return Err("the turn did not complete".into());
        };
        // The script's delays were honoured (in paused, virtual time).
        let played = u64::try_from(began.elapsed().as_millis())?;
        assert!(played >= 1000, "played in {played}ms");

        session.close().await?;
        let mut rest = Vec::new();
        while let Some(event) = events.recv().await {
            rest.push(event);
        }
        assert_eq!(rest, [AgentEvent::Exited { code: Some(0) }]);
        Ok(())
    }

    /// A scripted turn whose calls are carried out: through the manager, the session's tool
    /// endpoint and the bridge, to a closure standing in for the webview.
    #[tokio::test]
    async fn carries_out_scripted_calls_through_the_tool_bridge() -> TestResult {
        use serde_json::json;

        use crate::{
            harness::HarnessManager,
            tool_bridge::{ToolBridge, ToolDef, ToolReply},
        };

        let script = Script::parse(
            &json!({
                "description": "two calls that are carried out, one that is only an event",
                "turns": [[
                    { "delayMs": 5, "type": "tool_call_started", "id": "t1", "name": "text_set",
                      "input": { "elementId": "e_1", "markdown": "קצר יותר" }, "call": true },
                    { "delayMs": 5, "type": "tool_call_started", "id": "t2", "name": "slide_render",
                      "input": { "slideId": "s_1" }, "call": true },
                    { "delayMs": 5, "type": "tool_call_started", "id": "t3", "name": "slide_delete",
                      "input": { "slideId": "s_1" }, "call": true },
                    { "delayMs": 5, "type": "tool_call_started", "id": "t4", "name": "WebSearch",
                      "source": "harness", "input": {} },
                    { "delayMs": 5, "type": "tool_call_finished", "id": "t4", "ok": true,
                      "summary": "scripted" },
                    { "delayMs": 5, "type": "turn_completed", "outcome": "completed" }
                ]]
            })
            .to_string(),
        )?;

        // The webview: `text_set` writes, `slide_render` returns a picture.
        let bridge = ToolBridge::new();
        let webview = Arc::downgrade(&bridge);
        let calls = Arc::new(std::sync::Mutex::new(Vec::new()));
        let received = Arc::clone(&calls);
        bridge.connect(move |call| {
            let mut content = vec![Content::Text {
                text: format!("{} {}", call.name, call.input),
            }];
            if call.name == "slide_render" {
                content.push(Content::Image {
                    data: "iVBORw0KGgo=".into(),
                    mime_type: "image/png".into(),
                });
            }
            let reply = ToolReply {
                content,
                is_error: false,
            };
            let answered = webview
                .upgrade()
                .is_some_and(|bridge| bridge.reply(&call.call_id, reply));
            if let Ok(mut calls) = received.lock() {
                calls.push(call);
            }
            answered
        });
        let tool = |name: &str| ToolDef {
            name: name.into(),
            description: String::new(),
            input_schema: serde_json::Map::new(),
            timeout_ms: None,
        };
        // A slide session: it has no `slide_delete`.
        let endpoint = bridge
            .open(vec![tool("text_set"), tool("slide_render")])
            .await?;

        let root = tempfile::tempdir()?;
        let harness = MockHarness::new(vec![("scenario".to_owned(), script)]);
        let manager = HarnessManager::new(root.path().into(), vec![Arc::new(harness)]);
        let mut config = SessionConfig::new(Scope::Deck, "", PathBuf::new());
        config.tool_endpoint = Some(ToolEndpoint {
            url: endpoint.url.clone(),
            token: endpoint.token.clone(),
        });
        let (sender, mut events) = tokio::sync::mpsc::unbounded_channel();
        let id = manager
            .start("mock", "deck/thread", config, move |event| {
                let _ = sender.send(event);
            })
            .await?;
        manager
            .send(&id, UserTurn::text("Shorten the title"))
            .await?;

        let mut seen = Vec::new();
        while let Some(event) = tokio::time::timeout(Duration::from_secs(10), events.recv()).await?
        {
            let end = matches!(event, AgentEvent::TurnCompleted { .. });
            seen.push(event);
            if end {
                break;
            }
        }
        let finished: Vec<(&str, bool, &str)> = seen
            .iter()
            .filter_map(|event| match event {
                AgentEvent::ToolCallFinished { id, ok, summary } => {
                    Some((id.as_str(), *ok, summary.as_str()))
                }
                _ => None,
            })
            .collect();
        assert_eq!(
            finished,
            [
                (
                    "t1",
                    true,
                    r#"text_set {"elementId":"e_1","markdown":"קצר יותר"}"#
                ),
                ("t2", true, "slide_render {\"slideId\":\"s_1\"}\n[image]"),
                (
                    "t3",
                    false,
                    "There is no tool named \"slide_delete\" in this session."
                ),
                ("t4", true, "scripted"),
            ]
        );
        // Each result follows its call, so the stream is the one a real agent produces.
        assert_eq!(seen.len(), 10, "{seen:?}");
        assert!(matches!(&seen[1], AgentEvent::ToolCallStarted { id, .. } if id == "t1"));
        assert!(matches!(&seen[2], AgentEvent::ToolCallFinished { id, .. } if id == "t1"));
        manager.close(&id).await?;
        // The webview ran the two tools of the session, under the session's key.
        let calls = calls.lock().map_err(|e| e.to_string())?;
        let ran: Vec<(&str, &str)> = calls
            .iter()
            .map(|call| (call.session_key.as_str(), call.name.as_str()))
            .collect();
        assert_eq!(
            ran,
            [
                (endpoint.session_key.as_str(), "text_set"),
                (endpoint.session_key.as_str(), "slide_render")
            ]
        );
        Ok(())
    }

    #[tokio::test]
    async fn a_carried_out_call_without_a_tool_endpoint_fails() {
        let (finished, result) = carry_out(None, "t1", "slide_get", &Value::Null).await;
        assert_eq!(
            finished,
            AgentEvent::ToolCallFinished {
                id: "t1".into(),
                ok: false,
                summary: "the session has no tool endpoint".into()
            }
        );
        assert_eq!(result, None);
    }

    /// A reference stands for a value of an earlier result, wherever it sits in the input.
    #[test]
    fn references_take_values_from_earlier_results() {
        use serde_json::json;

        let results = HashMap::from([(
            "t1".to_owned(),
            json!({ "slideId": "s_1", "created": ["s_1", "e_1", "e_2"], "n": { "deep": 7 } }),
        )]);
        let input = json!({
            "slideId": { "$ref": "t1.slideId" },
            "ids": [{ "$ref": "t1.created.2" }, "e_9"],
            "nested": { "value": { "$ref": "t1.n.deep" } },
            "text": "$ref is only a key",
            "kept": { "$ref": "t1.slideId", "other": 1 },
        });
        assert_eq!(
            resolve_refs(&input, &results),
            Ok(json!({
                "slideId": "s_1",
                "ids": ["e_2", "e_9"],
                "nested": { "value": 7 },
                "text": "$ref is only a key",
                "kept": { "$ref": "t1.slideId", "other": 1 },
            }))
        );
        for missing in [
            "t2.slideId",
            "t1.nothing",
            "t1.created.9",
            "t1.slideId.deeper",
        ] {
            let bad = json!({ "slideId": { "$ref": missing } });
            assert!(resolve_refs(&bad, &results).is_err(), "{missing}");
        }
    }

    /// Two turns of one session: the second turn's call writes to the slide the first one made.
    #[tokio::test]
    async fn a_later_call_uses_what_an_earlier_one_returned() -> TestResult {
        use serde_json::json;

        use crate::{
            harness::HarnessManager,
            tool_bridge::{ToolBridge, ToolDef, ToolReply},
        };

        let script = Script::parse(
            &json!({
                "description": "a slide is made, then replaced by id in the next turn",
                "turns": [
                    [
                        { "type": "tool_call_started", "id": "t1", "name": "slide_create",
                          "input": { "html": "<p>" }, "call": true },
                        { "type": "turn_completed", "outcome": "completed" }
                    ],
                    [
                        { "type": "tool_call_started", "id": "t2", "name": "slide_replace",
                          "input": { "slideId": { "$ref": "t1.slideId" } }, "call": true },
                        { "type": "tool_call_started", "id": "t3", "name": "slide_replace",
                          "input": { "slideId": { "$ref": "t9.slideId" } }, "call": true },
                        { "type": "turn_completed", "outcome": "completed" }
                    ]
                ]
            })
            .to_string(),
        )?;

        let bridge = ToolBridge::new();
        let webview = Arc::downgrade(&bridge);
        let inputs = Arc::new(Mutex::new(Vec::new()));
        let received = Arc::clone(&inputs);
        bridge.connect(move |call| {
            lock(&received).push(call.input.clone());
            let reply = ToolReply {
                content: vec![Content::Text {
                    text: json!({ "slideId": "s_made" }).to_string(),
                }],
                is_error: false,
            };
            webview
                .upgrade()
                .is_some_and(|bridge| bridge.reply(&call.call_id, reply))
        });
        let tool = |name: &str| ToolDef {
            name: name.into(),
            description: String::new(),
            input_schema: serde_json::Map::new(),
            timeout_ms: None,
        };
        let endpoint = bridge
            .open(vec![tool("slide_create"), tool("slide_replace")])
            .await?;

        let root = tempfile::tempdir()?;
        let harness = MockHarness::new(vec![("refs".to_owned(), script)]);
        let manager = HarnessManager::new(root.path().into(), vec![Arc::new(harness)]);
        let mut config = SessionConfig::new(Scope::Deck, "", PathBuf::new());
        config.tool_endpoint = Some(ToolEndpoint {
            url: endpoint.url.clone(),
            token: endpoint.token.clone(),
        });
        let (sender, mut events) = tokio::sync::mpsc::unbounded_channel();
        let id = manager
            .start("mock", "deck/thread", config, move |event| {
                let _ = sender.send(event);
            })
            .await?;

        let mut seen = Vec::new();
        for text in ["make a slide", "now replace it"] {
            manager.send(&id, UserTurn::text(text)).await?;
            while let Some(event) =
                tokio::time::timeout(Duration::from_secs(10), events.recv()).await?
            {
                let end = matches!(event, AgentEvent::TurnCompleted { .. });
                seen.push(event);
                if end {
                    break;
                }
            }
        }
        manager.close(&id).await?;

        // The webview got the id, not the reference.
        assert_eq!(
            *lock(&inputs),
            [json!({ "html": "<p>" }), json!({ "slideId": "s_made" })]
        );
        // And so did the chat: the call is shown as it was made.
        assert!(seen.iter().any(|event| matches!(
            event,
            AgentEvent::ToolCallStarted { id, input, .. }
                if id == "t2" && input == &json!({ "slideId": "s_made" })
        )));
        // A reference that leads nowhere fails the call without making it.
        assert!(seen.iter().any(|event| matches!(
            event,
            AgentEvent::ToolCallFinished { id, ok: false, summary }
                if id == "t3" && summary.contains("t9.slideId")
        )));
        Ok(())
    }
}
