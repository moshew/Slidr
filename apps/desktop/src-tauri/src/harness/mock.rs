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
//!       { "delayMs": 20,  "type": "turn_completed", "outcome": "completed",
//!         "costUsd": 0.01, "durationMs": 420 } ] ] }
//! ```
//!
//! Each step is an [`AgentEvent`] in its IPC shape plus `delayMs`, the wait before it. The n-th
//! `send` plays turn n, wrapping around after the last. Every turn ends with `turn_completed`;
//! `session_started` and `exited` are the mock's own (the first `send`, and `close`). The model
//! picked for the session is the script's name. Tool calls are only events: nothing executes them.

use std::{sync::Arc, time::Duration};

use async_trait::async_trait;
use serde::Deserialize;
use tokio::{sync::oneshot, task::JoinHandle, time::Instant};

use super::{
    AgentError, AgentEvent, AgentHarness, AgentSession, Capabilities, EventSink, HarnessDescriptor,
    HarnessState, HarnessStatus, ModelOption, Result, SessionConfig, TurnOutcome, Usage, UserTurn,
};

/// The scripts built into the app, by name.
const BUILTIN: [(&str, &str); 3] = [
    ("import", include_str!("fixtures/scripts/import.json")),
    (
        "slide-chat",
        include_str!("fixtures/scripts/slide-chat.json"),
    ),
    ("errors", include_str!("fixtures/scripts/errors.json")),
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
    #[serde(flatten)]
    event: AgentEvent,
}

impl Script {
    /// Parses and checks a script: at least one turn, each ending in its only `turn_completed`.
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
        }
        Ok(script)
    }
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
        let (stop, mut stopped) = oneshot::channel::<()>();
        let task = tokio::spawn(async move {
            let began = Instant::now();
            for step in script.turns.get(index).into_iter().flatten() {
                tokio::select! {
                    biased;
                    _ = &mut stopped => {
                        // What a real harness emits for an interrupted turn: no more output, then
                        // the turn's end with nothing billed for it.
                        sink.emit(AgentEvent::TurnCompleted {
                            outcome: TurnOutcome::Interrupted,
                            usage: Usage::default(),
                            cost_usd: Some(0.0),
                            duration_ms: u64::try_from(began.elapsed().as_millis())
                                .unwrap_or(u64::MAX),
                        });
                        return;
                    }
                    () = tokio::time::sleep(Duration::from_millis(step.delay_ms)) => {
                        sink.emit(step.event.clone());
                    }
                }
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
                { "type": "turn_completed", "outcome": "completed", "costUsd": null, "durationMs": 1 },
                { "type": "text_delta", "text": "after the end" } ]] }"#,
            r#"{ "description": "", "turns": [[ { "type": "exited", "code": 0 },
                { "type": "turn_completed", "outcome": "completed", "costUsd": null, "durationMs": 1 } ]] }"#,
            r#"{ "description": "", "turns": [[ { "type": "no_such_event" } ]] }"#,
            r#"{ "description": "", "turns": [], "extra": 1 }"#,
        ];
        for json in bad {
            assert!(Script::parse(json).is_err(), "{json}");
        }
    }

    /// The realistic script keeps what the recorded transcript had: Hebrew text, two tool calls
    /// in parallel, and the turn's real usage.
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
                usage: Usage {
                    output_tokens: 1097,
                    ..
                },
                ..
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
        let Some(AgentEvent::TurnCompleted { duration_ms, .. }) = last else {
            return Err("the turn did not complete".into());
        };
        // The script's delays were honoured (in paused, virtual time).
        let played = u64::try_from(began.elapsed().as_millis())?;
        assert!(played >= 1000, "played in {played}ms");
        assert!(duration_ms > 0);

        session.close().await?;
        let mut rest = Vec::new();
        while let Some(event) = events.recv().await {
            rest.push(event);
        }
        assert_eq!(rest, [AgentEvent::Exited { code: Some(0) }]);
        Ok(())
    }
}
