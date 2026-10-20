//! The tool bridge (SPEC 11.4, MCP-01..04 and MCP-06; ADR-002, ADR-022): how an agent that runs
//! outside the app calls the Deck API, which lives in the webview. It is a transport adapter and
//! nothing more. The tools, their schemas and their logic belong to the webview; Rust publishes
//! what the webview registered for a session, forwards each call to it, waits, and hands the
//! answer back.
//!
//! ```text
//! webview                                 Rust                             agent (a CLI process)
//! tool_bridge_connect(onCall) ─────────►  ToolBridge: where calls go
//! tool_bridge_open(tools) ─────────────►  a session: key, token, its tools
//!     ◄── { sessionKey, url, token }      server on 127.0.0.1:<random port>
//!                                           POST /mcp/<key>, Bearer <token>  ◄── list, call
//!                                           unknown key or wrong token: 401
//! onCall({ callId, sessionKey,   ◄─────   call: forward, then wait 60 s
//!          name, input })                   (or the tool's own limit)
//! tool_bridge_reply(callId, reply) ────►  text and image content           ──► the agent
//! tool_bridge_close(sessionKey) ───────►  the key stops working; its waiting calls fail
//! ```
//!
//! [`ToolBridge`] is the whole state and is testable without Tauri: in the tests the webview is
//! a closure. [`server`] is the only file that speaks the protocol to agents, [`client`] the
//! only one that speaks it to the server, and [`ipc`] wraps the bridge in Tauri commands.

mod client;
pub mod ipc;
mod server;
#[cfg(test)]
mod tests;

use std::{
    collections::HashMap,
    sync::{Arc, Mutex, MutexGuard, PoisonError},
    time::Duration,
};

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use tokio::sync::{OnceCell, oneshot};

pub use client::call_tool;

use crate::harness::Result;

/// MCP-04: how long a call waits for the webview, unless its tool sets its own limit.
const DEFAULT_TIMEOUT: Duration = Duration::from_secs(60);

/// A tool as the webview registers it for a session (MCP-03). The Deck API's tool listing has
/// this shape; what the bridge does not publish (its `scopes`, `writes`) is ignored.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolDef {
    pub name: String,
    /// For the agent.
    pub description: String,
    /// JSON Schema of the arguments object.
    pub input_schema: Map<String, Value>,
    /// How long a call may wait for the webview, for a tool that needs more (or less) than the
    /// default 60 s (MCP-04).
    #[serde(default)]
    pub timeout_ms: Option<u64>,
}

impl ToolDef {
    fn timeout(&self) -> Duration {
        self.timeout_ms
            .map_or(DEFAULT_TIMEOUT, Duration::from_millis)
    }
}

/// One call on its way to the webview.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCall {
    /// What `tool_bridge_reply` takes.
    pub call_id: String,
    /// The session the call came from (MCP-02).
    pub session_key: String,
    pub name: String,
    /// The arguments object as the agent sent it. Checking it is the Deck API's job.
    pub input: Value,
}

/// The webview's answer to a call, in the form the agent reads (MCP-06).
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolReply {
    pub content: Vec<Content>,
    /// The tool failed; `content` tells the agent why.
    #[serde(default)]
    pub is_error: bool,
}

/// One part of an answer.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum Content {
    Text {
        text: String,
    },
    /// `data` is the file in base64.
    Image {
        data: String,
        mime_type: String,
    },
}

impl ToolReply {
    /// A failure the bridge itself reports, worded for the agent.
    fn error(message: impl Into<String>) -> Self {
        Self {
            content: vec![Content::Text {
                text: message.into(),
            }],
            is_error: true,
        }
    }
}

/// Where a session's agent reaches its tools. `url` and `token` are the session's
/// `toolEndpoint`; `session_key` is what the webview's calls arrive under.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionEndpoint {
    pub session_key: String,
    pub url: String,
    pub token: String,
}

/// The sessions, the calls waiting for the webview, and where calls go. Shared by the server
/// and the IPC commands.
pub struct ToolBridge {
    state: Mutex<State>,
    /// The server's port. It starts with the first session, so an app that never runs an agent
    /// never listens.
    port: OnceCell<u16>,
}

#[derive(Default)]
struct State {
    /// The webview that connected last.
    forward: Option<Forward>,
    sessions: HashMap<String, Session>,
    /// By call id.
    waiting: HashMap<String, Waiting>,
    calls: u64,
}

/// Hands a call to the webview; `false` when it could not.
type Forward = Arc<dyn Fn(ToolCall) -> bool + Send + Sync>;

struct Session {
    token: String,
    tools: Arc<[ToolDef]>,
}

struct Waiting {
    session_key: String,
    reply: oneshot::Sender<ToolReply>,
}

impl ToolBridge {
    /// A bridge with no sessions. Nothing listens until the first [`ToolBridge::open`].
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            state: Mutex::default(),
            port: OnceCell::new(),
        })
    }

    /// The webview is ready to run tools: calls go to `forward` from now on, and it returns
    /// `false` when it could not hand one over. A second connection is the webview after a
    /// reload. It takes over, and the calls still waiting for the first fail now, since nothing
    /// is left to answer them.
    pub fn connect(&self, forward: impl Fn(ToolCall) -> bool + Send + Sync + 'static) {
        let mut state = self.lock();
        state.forward = Some(Arc::new(forward));
        state.waiting.clear();
    }

    /// Opens a session that offers `tools`, and returns where its agent reaches them
    /// (MCP-01, MCP-02): a path and a bearer token of its own on the local server.
    pub async fn open(self: &Arc<Self>, tools: Vec<ToolDef>) -> Result<SessionEndpoint> {
        let port = *self
            .port
            .get_or_try_init(|| server::start(Arc::clone(self)))
            .await?;
        let session_key = random();
        let token = random();
        let session = Session {
            token: token.clone(),
            tools: tools.into(),
        };
        self.lock().sessions.insert(session_key.clone(), session);
        Ok(SessionEndpoint {
            url: format!("http://127.0.0.1:{port}{}{session_key}", server::PATH),
            session_key,
            token,
        })
    }

    /// Ends a session: its endpoint answers 401 from now on, and its waiting calls fail. Closing
    /// a session that is not open does nothing.
    pub fn close(&self, session_key: &str) {
        let mut state = self.lock();
        state.sessions.remove(session_key);
        state
            .waiting
            .retain(|_, waiting| waiting.session_key != session_key);
    }

    /// The webview's answer to a call. `false` when nothing waits for it any more: the call
    /// timed out, its session closed, or the agent gave up on it.
    pub fn reply(&self, call_id: &str, reply: ToolReply) -> bool {
        let waiting = self.lock().waiting.remove(call_id);
        waiting.is_some_and(|waiting| waiting.reply.send(reply).is_ok())
    }

    /// Whether `token` is the bearer token of the open session `session_key`.
    fn authorized(&self, session_key: &str, token: &str) -> bool {
        self.lock()
            .sessions
            .get(session_key)
            .is_some_and(|session| same(&session.token, token))
    }

    /// The tools of an open session.
    fn tools(&self, session_key: &str) -> Option<Arc<[ToolDef]>> {
        let state = self.lock();
        Some(Arc::clone(&state.sessions.get(session_key)?.tools))
    }

    /// Runs one call of a session in the webview and waits for the answer (MCP-04). It always
    /// answers: what went wrong on the way is an error reply the agent can read. Dropping the
    /// future gives the call up.
    async fn call(&self, session_key: &str, name: &str, input: Value) -> ToolReply {
        let (forward, call_id, limit, answer) = {
            let mut state = self.lock();
            let Some(session) = state.sessions.get(session_key) else {
                return ToolReply::error("This session has ended.");
            };
            let Some(tool) = session.tools.iter().find(|tool| tool.name == name) else {
                return ToolReply::error(format!(
                    "There is no tool named \"{name}\" in this session."
                ));
            };
            let limit = tool.timeout();
            let Some(forward) = state.forward.clone() else {
                return ToolReply::error("The app is not ready to run tools yet.");
            };
            state.calls += 1;
            let call_id = format!("call_{}", state.calls);
            let (reply, answer) = oneshot::channel();
            let waiting = Waiting {
                session_key: session_key.to_owned(),
                reply,
            };
            state.waiting.insert(call_id.clone(), waiting);
            (forward, call_id, limit, answer)
        };
        let _forget = Forget {
            bridge: self,
            call_id: &call_id,
        };
        // Outside the lock: the webview may answer before this returns.
        let handed_over = forward(ToolCall {
            call_id: call_id.clone(),
            session_key: session_key.to_owned(),
            name: name.to_owned(),
            input,
        });
        if !handed_over {
            return ToolReply::error(format!(
                "{name} was not run: the app window is not available."
            ));
        }
        match tokio::time::timeout(limit, answer).await {
            Ok(Ok(reply)) => reply,
            Ok(Err(_)) => ToolReply::error(format!(
                "{name} was dropped: its session closed or the app window reloaded."
            )),
            Err(_) => ToolReply::error(format!(
                "{name} did not answer within {} s. It may still finish in the app, so look at \
                 the deck before calling it again.",
                limit.as_secs_f64()
            )),
        }
    }

    fn lock(&self) -> MutexGuard<'_, State> {
        self.state.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

/// Forgets a waiting call when its future ends, however it ends: answered, timed out, or
/// dropped because the agent went away.
struct Forget<'a> {
    bridge: &'a ToolBridge,
    call_id: &'a str,
}

impl Drop for Forget<'_> {
    fn drop(&mut self) {
        self.bridge.lock().waiting.remove(self.call_id);
    }
}

/// A session key or a token (SEC-01): 122 random bits from the operating system, as 32 hex
/// digits.
fn random() -> String {
    uuid::Uuid::new_v4().simple().to_string()
}

/// Compares every byte, so the time taken says nothing about where two tokens differ.
fn same(a: &str, b: &str) -> bool {
    a.len() == b.len()
        && a.bytes()
            .zip(b.bytes())
            .fold(0, |difference, (x, y)| difference | (x ^ y))
            == 0
}
