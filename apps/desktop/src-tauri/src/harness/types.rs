//! The harness contract as data: what goes into a session, what comes out, and the errors.
//!
//! Every type here crosses IPC. Field names are camelCase and enum values snake_case on the
//! JavaScript side; `apps/desktop/src/agent/agent.ts` mirrors them, and `fixtures/contract.json`
//! pins the exact shapes for both sides.

use std::{fmt, path::PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Result of every harness operation.
pub type Result<T> = std::result::Result<T, AgentError>;

/// A normalized harness event (AGT-01). The UI knows only these, never a harness's own protocol.
///
/// Per session, in order: `session_started` once, before anything else of the first turn; every
/// accepted turn ends in exactly one `turn_completed`; every `tool_call_started` is matched by a
/// `tool_call_finished` before its turn ends; `exited` is last. The manager enforces the last
/// three, so an adapter that loses its process mid-turn does not leave the UI waiting.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum AgentEvent {
    /// The harness has a session; `native_session_id` is what `SessionConfig::resume` takes.
    SessionStarted {
        native_session_id: String,
        model: String,
    },
    /// The next piece of the assistant's reply.
    TextDelta { text: String },
    /// The next piece of the model's reasoning. Some harnesses send it empty, as a pulse.
    ThinkingDelta { text: String },
    /// The agent called a tool. `input` is the complete arguments object.
    ToolCallStarted {
        id: String,
        name: String,
        #[serde(default)]
        source: ToolSource,
        input: Value,
    },
    /// The tool call `id` returned. `summary` is a short text of the result, for the chip's
    /// detail; the full result of an app tool is known to the webview, which executed it.
    ToolCallFinished {
        id: String,
        ok: bool,
        summary: String,
    },
    /// The turn is over. `cost_usd` is this turn's cost when the harness reports one and it can
    /// be attributed to the turn; `usage` is this turn's tokens.
    TurnCompleted {
        outcome: TurnOutcome,
        #[serde(default)]
        usage: Usage,
        cost_usd: Option<f64>,
        duration_ms: u64,
    },
    /// Something the user should see (CHT-U09). `recoverable`: the session can take another turn.
    Error {
        kind: AgentErrorKind,
        message: String,
        recoverable: bool,
    },
    /// The session is over; nothing follows. `code` is the process exit code, when there was one.
    Exited { code: Option<i32> },
}

/// Who serves a tool: the app (the Deck API, through the session's tool endpoint) or the
/// harness itself (its built-in web search, file read).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolSource {
    #[default]
    App,
    Harness,
}

/// How a turn ended.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TurnOutcome {
    Completed,
    /// Stopped by `interrupt` (or by `close` during a turn).
    Interrupted,
    /// The harness reported an error, or the session ended mid-turn. An `error` event precedes it.
    Failed,
}

/// Tokens of one turn.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Usage {
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_read_tokens: u64,
    pub cache_write_tokens: u64,
}

/// What a session works on (SPEC 11.2). The harness passes it through; the scope guard behind
/// the tool endpoint (SPEC 11.4) and the prompt modules are what act on it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum Scope {
    Deck,
    Slide {
        slide_id: String,
    },
    Object {
        slide_id: String,
        element_ids: Vec<String>,
    },
    /// An HTML import session (SPEC 13); `file` is the source file.
    Import {
        file: String,
    },
}

/// Where the session's agent reaches the app's tools (the Deck API): a local HTTP endpoint with
/// a per-session bearer token (SEC-01). Provided by the tool bridge (WG10-T04).
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolEndpoint {
    pub url: String,
    pub token: String,
}

/// How to start a session.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionConfig {
    #[allow(
        dead_code,
        reason = "read by the scope guard behind the tool endpoint (WG10-T06)"
    )]
    pub scope: Scope,
    /// Assembled from the prompt modules (SPEC 11.6). Replaces the harness's own prompt.
    pub system_prompt: String,
    /// The app's tools. Without it the agent has only the harness's built-in tools.
    #[serde(default)]
    pub tool_endpoint: Option<ToolEndpoint>,
    /// Web search and fetch (AID-07, D15). On unless the settings turn it off.
    #[serde(default = "web_access_default")]
    pub web_access: bool,
    /// One of the descriptor's `models`; the harness's default when absent.
    #[serde(default)]
    pub model: Option<String>,
    /// One of the descriptor's `effort_levels`.
    #[serde(default)]
    pub effort: Option<String>,
    /// A `native_session_id` from an earlier `session_started`.
    #[serde(default)]
    pub resume: Option<String>,
    /// The session's own folder: the harness keeps its files here and lets the agent read only
    /// `<workdir>/attachments/`. Set by the manager from the thread key, never by the webview.
    #[serde(skip)]
    pub workdir: PathBuf,
}

fn web_access_default() -> bool {
    true
}

impl SessionConfig {
    /// A session with defaults.
    #[cfg(test)]
    pub fn new(scope: Scope, system_prompt: impl Into<String>, workdir: PathBuf) -> Self {
        Self {
            scope,
            system_prompt: system_prompt.into(),
            tool_endpoint: None,
            web_access: true,
            model: None,
            effort: None,
            resume: None,
            workdir,
        }
    }
}

/// One user message.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserTurn {
    /// What the user wrote, or the action's prompt.
    pub text: String,
    /// The `<slidr_context>` block of this turn (SPEC 11.6), kept apart from `text` so the
    /// transcript stores what the user wrote.
    #[serde(default)]
    pub context: Option<String>,
    /// Pasted or attached images (CHT-U05).
    #[serde(default)]
    pub images: Vec<ImageAttachment>,
}

/// An image sent with a turn.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageAttachment {
    /// `image/png`, `image/jpeg`, `image/gif` or `image/webp`.
    pub media_type: String,
    /// The bytes, base64.
    pub data: String,
}

const IMAGE_TYPES: [&str; 4] = ["image/png", "image/jpeg", "image/gif", "image/webp"];

impl UserTurn {
    /// A turn of text only.
    #[cfg(test)]
    pub fn text(text: impl Into<String>) -> Self {
        Self {
            text: text.into(),
            ..Self::default()
        }
    }

    /// Rejects a turn no harness could send: nothing in it, or an image type models do not read.
    pub fn validate(&self) -> Result<()> {
        if self.text.trim().is_empty() && self.images.is_empty() {
            return Err(AgentError::invalid_input(
                "the turn has no text and no images",
            ));
        }
        for image in &self.images {
            if !IMAGE_TYPES.contains(&image.media_type.as_str()) {
                return Err(AgentError::invalid_input(format!(
                    "unsupported image type {}; expected one of {}",
                    image.media_type,
                    IMAGE_TYPES.join(", ")
                )));
            }
            if image.data.is_empty() {
                return Err(AgentError::invalid_input("an image has no data"));
            }
        }
        Ok(())
    }
}

/// What a harness is and can do (AGT-02). The UI hides what a harness does not support.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HarnessDescriptor {
    /// Stable id, used in settings and in `agent_start`.
    pub id: String,
    /// Display name.
    pub name: String,
    pub capabilities: Capabilities,
    /// Models the user can pick; may be empty.
    pub models: Vec<ModelOption>,
    /// The model used when the session names none; `None`: the harness decides.
    pub default_model: Option<String>,
    /// Effort levels the user can pick; empty when the harness has no such setting.
    pub effort_levels: Vec<String>,
}

/// Feature flags of a harness.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Capabilities {
    /// Text arrives as deltas while the model writes.
    pub streaming: bool,
    /// A session can continue from a `native_session_id`.
    pub resume: bool,
    /// A turn can be stopped without ending the session.
    pub interrupt: bool,
    /// Turns may carry images.
    pub image_input: bool,
    /// The agent can call the app's tools through a `ToolEndpoint`.
    pub tool_endpoint: bool,
    /// The model's reasoning arrives as `thinking_delta`.
    pub thinking: bool,
}

/// A model choice.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelOption {
    /// What `SessionConfig::model` takes.
    pub id: String,
    pub label: String,
}

/// The result of `probe` (AGT-03).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HarnessStatus {
    pub state: HarnessState,
    pub version: Option<String>,
    /// The signed-in account as the harness describes it (plan, method); no personal data.
    pub account: Option<String>,
    /// English guidance or error text: what to install, how to sign in, what failed.
    pub detail: Option<String>,
}

/// Whether a harness can start sessions.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum HarnessState {
    Ready,
    NotInstalled,
    NotLoggedIn,
    /// Installed, but the check failed; `detail` says how.
    Unavailable,
}

/// Closed set of failure categories, for both rejected calls and `error` events.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentErrorKind {
    /// No harness with that id.
    UnknownHarness,
    /// No open session with that id.
    UnknownSession,
    /// A turn is still running in the session.
    Busy,
    /// A malformed argument: thread key, model, image, empty turn.
    InvalidInput,
    /// The harness program is not installed.
    NotInstalled,
    /// The harness is installed but not signed in.
    NotLoggedIn,
    /// A usage limit was reached.
    Quota,
    /// The session's agent did not receive the app's tools (ADR-002); the turn is stopped.
    ToolsUnavailable,
    /// The conversation to resume does not exist for the harness (another computer, its
    /// history cleared). The session ends; start a new one with a summary (AGT-06).
    ResumeFailed,
    /// The harness process ended unexpectedly, or the session has already ended.
    ProcessExited,
    /// The harness reported an error for the turn.
    TurnFailed,
    /// Writing the session's files or pipes failed.
    Io,
    /// A bug on the Rust side.
    Internal,
}

/// A rejected call, as the webview receives it: `{ kind, message }`, like the storage errors.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AgentError {
    pub kind: AgentErrorKind,
    /// English details for logs; the UI words its message from `kind`.
    pub message: String,
}

impl AgentError {
    /// An error of the given kind.
    pub fn new(kind: AgentErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }

    /// The webview sent something malformed.
    pub fn invalid_input(message: impl Into<String>) -> Self {
        Self::new(AgentErrorKind::InvalidInput, message)
    }

    /// The session's process is gone.
    pub fn process_exited(message: impl Into<String>) -> Self {
        Self::new(AgentErrorKind::ProcessExited, message)
    }

    /// A file or pipe operation failed while doing `action`.
    pub fn io(action: impl fmt::Display, error: &std::io::Error) -> Self {
        Self::new(AgentErrorKind::Io, format!("could not {action}: {error}"))
    }

    /// A bug on the Rust side.
    pub fn internal(message: impl fmt::Display) -> Self {
        Self::new(AgentErrorKind::Internal, message.to_string())
    }
}

impl fmt::Display for AgentError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for AgentError {}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    type TestResult = std::result::Result<(), Box<dyn std::error::Error>>;

    /// One sample of every shape that crosses IPC. The webview's types are checked against the
    /// same file (`apps/desktop/src/agent/agent.test.ts`).
    fn contract() -> serde_json::Result<Value> {
        serde_json::from_str(include_str!("fixtures/contract.json"))
    }

    #[test]
    fn events_have_the_contract_shape() -> TestResult {
        let contract = contract()?;
        let events = vec![
            AgentEvent::SessionStarted {
                native_session_id: "b2969d29".into(),
                model: "sonnet".into(),
            },
            AgentEvent::TextDelta {
                text: "Adding a slide.".into(),
            },
            AgentEvent::ThinkingDelta {
                text: String::new(),
            },
            AgentEvent::ToolCallStarted {
                id: "call_1".into(),
                name: "slide_create_from_html".into(),
                source: ToolSource::App,
                input: json!({ "index": 0, "html": "<section></section>" }),
            },
            AgentEvent::ToolCallStarted {
                id: "call_2".into(),
                name: "WebSearch".into(),
                source: ToolSource::Harness,
                input: json!({ "query": "market size" }),
            },
            AgentEvent::ToolCallFinished {
                id: "call_1".into(),
                ok: true,
                summary: "created s_1".into(),
            },
            AgentEvent::TurnCompleted {
                outcome: TurnOutcome::Completed,
                usage: Usage {
                    input_tokens: 10,
                    output_tokens: 60,
                    cache_read_tokens: 6223,
                    cache_write_tokens: 860,
                },
                cost_usd: Some(0.0026),
                duration_ms: 1032,
            },
            AgentEvent::TurnCompleted {
                outcome: TurnOutcome::Interrupted,
                usage: Usage::default(),
                cost_usd: None,
                duration_ms: 1390,
            },
            AgentEvent::Error {
                kind: AgentErrorKind::Quota,
                message: "usage limit reached".into(),
                recoverable: true,
            },
            AgentEvent::Exited { code: Some(0) },
            AgentEvent::Exited { code: None },
        ];
        assert_eq!(serde_json::to_value(&events)?, contract["events"]);
        let parsed: Vec<AgentEvent> = serde_json::from_value(contract["events"].clone())?;
        assert_eq!(parsed, events);
        Ok(())
    }

    #[test]
    fn error_kinds_are_the_contract_list() -> TestResult {
        use AgentErrorKind::*;
        let all = [
            UnknownHarness,
            UnknownSession,
            Busy,
            InvalidInput,
            NotInstalled,
            NotLoggedIn,
            Quota,
            ToolsUnavailable,
            ResumeFailed,
            ProcessExited,
            TurnFailed,
            Io,
            Internal,
        ];
        // Exhaustive: a new kind does not compile here until it is in the list above.
        let position = |kind: AgentErrorKind| match kind {
            UnknownHarness => 0,
            UnknownSession => 1,
            Busy => 2,
            InvalidInput => 3,
            NotInstalled => 4,
            NotLoggedIn => 5,
            Quota => 6,
            ToolsUnavailable => 7,
            ResumeFailed => 8,
            ProcessExited => 9,
            TurnFailed => 10,
            Io => 11,
            Internal => 12,
        };
        assert!(all.iter().enumerate().all(|(i, kind)| position(*kind) == i));
        let contract = contract()?;
        assert_eq!(serde_json::to_value(all)?, contract["errorKinds"]);
        let busy = AgentError::new(Busy, "a turn is still running in this session");
        assert_eq!(serde_json::to_value(busy)?, contract["error"]);
        Ok(())
    }

    #[test]
    fn descriptor_and_status_have_the_contract_shape() -> TestResult {
        let contract = contract()?;
        let descriptor = HarnessDescriptor {
            id: "example".into(),
            name: "Example".into(),
            capabilities: Capabilities {
                streaming: true,
                resume: true,
                interrupt: true,
                image_input: true,
                tool_endpoint: false,
                thinking: false,
            },
            models: vec![ModelOption {
                id: "fast".into(),
                label: "Fast".into(),
            }],
            default_model: None,
            effort_levels: vec!["low".into(), "high".into()],
        };
        assert_eq!(serde_json::to_value(descriptor)?, contract["descriptor"]);
        let status =
            |state, version: Option<&str>, account: Option<&str>, detail: &str| HarnessStatus {
                state,
                version: version.map(Into::into),
                account: account.map(Into::into),
                detail: (!detail.is_empty()).then(|| detail.into()),
            };
        let statuses = [
            status(HarnessState::Ready, Some("2.1.287"), Some("web (max)"), ""),
            status(HarnessState::NotInstalled, None, None, "Install it."),
            status(HarnessState::NotLoggedIn, Some("2.1.287"), None, "Sign in."),
            status(HarnessState::Unavailable, None, None, "timed out"),
        ];
        assert_eq!(serde_json::to_value(statuses)?, contract["statuses"]);
        Ok(())
    }

    #[test]
    fn configs_and_turns_parse_as_the_contract_says() -> TestResult {
        let contract = contract()?;
        let configs: Vec<SessionConfig> = serde_json::from_value(contract["configs"].clone())?;
        let [deck, slide, object, import] = &configs[..] else {
            return Err("expected four configs".into());
        };
        assert_eq!(deck.scope, Scope::Deck);
        assert!(deck.web_access, "web access is on by default (D15)");
        assert!(deck.tool_endpoint.is_none() && deck.model.is_none());
        assert_eq!(
            slide.scope,
            Scope::Slide {
                slide_id: "s_1".into()
            }
        );
        assert!(!slide.web_access);
        assert_eq!(
            slide.tool_endpoint,
            Some(ToolEndpoint {
                url: "http://127.0.0.1:5000/t/k".into(),
                token: "secret".into()
            })
        );
        assert_eq!(
            [&slide.model, &slide.effort, &slide.resume].map(Option::as_deref),
            [Some("sonnet"), Some("high"), Some("b2969d29")]
        );
        assert_eq!(
            object.scope,
            Scope::Object {
                slide_id: "s_1".into(),
                element_ids: vec!["e_1".into(), "e_2".into()]
            }
        );
        assert_eq!(
            import.scope,
            Scope::Import {
                file: "C:/decks/plan.html".into()
            }
        );
        assert!(
            configs.iter().all(|c| c.workdir.as_os_str().is_empty()),
            "the webview cannot choose the folder"
        );

        let turns: Vec<UserTurn> = serde_json::from_value(contract["turns"].clone())?;
        assert!(turns.iter().all(|t| t.validate().is_ok()));
        assert_eq!(turns[1].images[0].media_type, "image/png");
        assert_eq!(
            turns[1].context.as_deref(),
            Some("<slidr_context>scope: slide</slidr_context>")
        );
        Ok(())
    }

    #[test]
    fn turns_without_content_or_with_unknown_images_are_rejected() {
        let image = |media_type: &str, data: &str| UserTurn {
            text: "x".into(),
            context: None,
            images: vec![ImageAttachment {
                media_type: media_type.into(),
                data: data.into(),
            }],
        };
        assert!(UserTurn::text(" \n").validate().is_err());
        assert!(image("image/tiff", "AAAA").validate().is_err());
        assert!(image("image/png", "").validate().is_err());
        assert!(image("image/webp", "AAAA").validate().is_ok());
    }
}
