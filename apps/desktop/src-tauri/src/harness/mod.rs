//! The agent harness layer (SPEC 11.2, AGT-01..03): one interface over agent runtimes that run
//! outside the app (a CLI process today), so the rest of the app knows sessions and
//! [`AgentEvent`]s, never a particular harness.
//!
//! ```text
//! webview ──invoke──► ipc ──► HarnessManager ──► dyn AgentHarness ──start──► dyn AgentSession
//!    ▲                              │                                            │
//!    └──── Channel<AgentEvent> ◄── TurnGuard ◄──────── EventSink ◄───────────────┘
//! ```
//!
//! Adapters live next to this file; [`registry`] is the only place that names them. The mock
//! harness ([`mock`]) replays recorded event scripts, for tests and for UI work without cost.

pub mod ipc;
mod manager;
mod mock;
mod registry;
mod types;

use std::{fmt, sync::Arc};

use async_trait::async_trait;

pub use manager::HarnessManager;
pub use registry::builtin;
#[allow(unused_imports)]
// The whole contract is public, whether or not this crate uses each part.
pub use types::{
    AgentError, AgentErrorKind, AgentEvent, Capabilities, HarnessDescriptor, HarnessState,
    HarnessStatus, ImageAttachment, ModelOption, Result, Scope, SessionConfig, ToolEndpoint,
    ToolSource, TurnOutcome, Usage, UserTurn,
};

/// An agent runtime the app can start sessions on.
#[async_trait]
pub trait AgentHarness: Send + Sync {
    /// Id, name, capabilities and models. Cheap and constant.
    fn descriptor(&self) -> HarnessDescriptor;

    /// Is it installed, which version, is it signed in (AGT-03). Never fails; a failure is a state.
    async fn probe(&self) -> HarnessStatus;

    /// Starts a session. Returns once the session accepts turns; its events go to `sink`, from
    /// tasks of the session's own, until `exited`.
    async fn start(&self, config: SessionConfig, sink: EventSink) -> Result<Box<dyn AgentSession>>;
}

/// One conversation with an agent.
///
/// The manager serializes calls per session, and calls `send` only when no turn is running and
/// `interrupt` only while one is. Each method returns as soon as the request is handed over; what
/// follows arrives as events.
#[async_trait]
pub trait AgentSession: Send {
    /// Starts a turn.
    async fn send(&mut self, turn: UserTurn) -> Result<()>;

    /// Stops the running turn; it ends with `turn_completed` (`interrupted`). The session stays.
    async fn interrupt(&mut self) -> Result<()>;

    /// Ends the session, stopping a running turn first. Returns after `exited` was emitted.
    async fn close(self: Box<Self>) -> Result<()>;

    /// The id to resume this conversation with, once known.
    fn native_session_id(&self) -> Option<String>;
}

/// Where a session's events go. Cheap to clone; may be called from any task.
#[derive(Clone)]
pub struct EventSink(Arc<dyn Fn(AgentEvent) + Send + Sync>);

impl EventSink {
    /// A sink that hands every event to `deliver`, in order.
    pub fn new(deliver: impl Fn(AgentEvent) + Send + Sync + 'static) -> Self {
        Self(Arc::new(deliver))
    }

    /// Delivers one event.
    pub fn emit(&self, event: AgentEvent) {
        (self.0)(event);
    }

    /// A sink that queues events for a test to read.
    #[cfg(test)]
    pub fn channel() -> (Self, tokio::sync::mpsc::UnboundedReceiver<AgentEvent>) {
        let (sender, receiver) = tokio::sync::mpsc::unbounded_channel();
        let sink = Self::new(move |event| {
            let _ = sender.send(event);
        });
        (sink, receiver)
    }
}

impl fmt::Debug for EventSink {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("EventSink")
    }
}
