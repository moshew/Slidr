//! The registry of harnesses and of open sessions, and the guard that keeps every session's
//! event stream well-formed whatever its harness does.

use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{Arc, Mutex, MutexGuard, PoisonError},
    time::Instant,
};

use super::{
    AgentError, AgentErrorKind, AgentEvent, AgentHarness, AgentSession, EventSink,
    HarnessDescriptor, HarnessStatus, Result, SessionConfig, TurnOutcome, Usage, UserTurn,
};

/// Longest thread key, in bytes.
const MAX_THREAD_KEY: usize = 200;

/// Where the files a user attached to a chat are kept, inside the folder of its thread.
const ATTACHMENTS_DIR: &str = "attachments";
/// The largest file a chat takes. A deck of scanned pages is tens of megabytes; more is a mistake.
const MAX_ATTACHMENT_BYTES: usize = 50 * 1024 * 1024;
/// Longest file name of an attachment, in characters.
const MAX_ATTACHMENT_NAME: usize = 120;
/// How many different files of one name a conversation keeps.
const MAX_SAME_NAME: usize = 99;

/// Owns the harnesses and the open sessions. Shared by the IPC commands; testable without Tauri.
pub struct HarnessManager {
    harnesses: Vec<Arc<dyn AgentHarness>>,
    /// Session folders live under `<root>/<thread key>/`.
    root: PathBuf,
    sessions: Mutex<HashMap<String, Arc<Slot>>>,
}

/// One open session.
struct Slot {
    guard: Arc<TurnGuard>,
    /// `None` once closed. Locked for the length of each call, which serializes them.
    session: tokio::sync::Mutex<Option<Box<dyn AgentSession>>>,
}

impl HarnessManager {
    /// A manager over `harnesses`, keeping session folders under `root`.
    pub fn new(root: PathBuf, harnesses: Vec<Arc<dyn AgentHarness>>) -> Self {
        Self {
            harnesses,
            root,
            sessions: Mutex::new(HashMap::new()),
        }
    }

    /// The registered harnesses, in registration order.
    pub fn descriptors(&self) -> Vec<HarnessDescriptor> {
        self.harnesses.iter().map(|h| h.descriptor()).collect()
    }

    /// Checks one harness (AGT-03).
    pub async fn probe(&self, harness_id: &str) -> Result<HarnessStatus> {
        Ok(self.harness(harness_id)?.probe().await)
    }

    /// Starts a session on `harness_id` and returns its id. `thread` names the conversation
    /// (`<deckId>/<threadId>`, segments of letters, digits, `-` and `_`): the same thread gets
    /// the same folder, which is what resuming needs. Events go to `deliver`.
    pub async fn start(
        &self,
        harness_id: &str,
        thread: &str,
        mut config: SessionConfig,
        deliver: impl Fn(AgentEvent) + Send + Sync + 'static,
    ) -> Result<String> {
        let harness = self.harness(harness_id)?;
        config.workdir = thread_dir(&self.root, thread)?;
        let guard = Arc::new(TurnGuard::new(deliver));
        let sink = {
            let guard = Arc::clone(&guard);
            EventSink::new(move |event| guard.emit(event))
        };
        let session = harness.start(config, sink).await?;
        let id = uuid::Uuid::new_v4().simple().to_string();
        let slot = Arc::new(Slot {
            guard,
            session: tokio::sync::Mutex::new(Some(session)),
        });
        lock(&self.sessions).insert(id.clone(), slot);
        Ok(id)
    }

    /// Starts a turn. Fails with `busy` while the previous one runs.
    pub async fn send(&self, session_id: &str, turn: UserTurn) -> Result<()> {
        turn.validate()?;
        let slot = self.slot(session_id)?;
        slot.guard.begin_turn()?;
        let mut session = slot.session.lock().await;
        let result = match session.as_mut() {
            Some(session) => session.send(turn).await,
            None => Err(unknown_session(session_id)),
        };
        if result.is_err() {
            slot.guard.abort_turn();
        }
        result
    }

    /// Stops the running turn. Nothing to do when no turn runs.
    pub async fn interrupt(&self, session_id: &str) -> Result<()> {
        let slot = self.slot(session_id)?;
        if !slot.guard.in_turn() {
            return Ok(());
        }
        match slot.session.lock().await.as_mut() {
            Some(session) => session.interrupt().await,
            None => Ok(()),
        }
    }

    /// Ends a session and forgets it. Its last event is `exited`.
    pub async fn close(&self, session_id: &str) -> Result<()> {
        let slot = lock(&self.sessions)
            .remove(session_id)
            .ok_or_else(|| unknown_session(session_id))?;
        let session = slot.session.lock().await.take();
        let result = match session {
            Some(session) => session.close().await,
            None => Ok(()),
        };
        // In case the adapter did not say so itself; the guard drops it if it did.
        slot.guard.emit(AgentEvent::Exited { code: None });
        result
    }

    /// Stores a file the user attached to a chat (CHT-U05) in the folder of its thread, under
    /// `attachments/`, where the agent's own file tool reads it. Returns the file's path
    /// relative to the session's working directory. The same file under the same name is stored
    /// once; another file of that name gets a number.
    pub fn attach(&self, thread: &str, name: &str, bytes: &[u8]) -> Result<String> {
        if bytes.len() > MAX_ATTACHMENT_BYTES {
            return Err(AgentError::invalid_input(format!(
                "the attachment is {} bytes; the limit is {MAX_ATTACHMENT_BYTES}",
                bytes.len()
            )));
        }
        let dir = thread_dir(&self.root, thread)?.join(ATTACHMENTS_DIR);
        std::fs::create_dir_all(&dir)
            .map_err(|e| AgentError::io("create the attachments folder", &e))?;
        let name = attachment_name(name);
        let (stem, extension) = match name.rsplit_once('.') {
            Some((stem, extension)) if !stem.is_empty() => (stem, format!(".{extension}")),
            _ => (name.as_str(), String::new()),
        };
        for n in 1..=MAX_SAME_NAME {
            let file = if n == 1 {
                name.clone()
            } else {
                format!("{stem}-{n}{extension}")
            };
            let path = dir.join(&file);
            match std::fs::read(&path) {
                Ok(existing) if existing == bytes => {}
                Ok(_) => continue,
                Err(_) => std::fs::write(&path, bytes)
                    .map_err(|e| AgentError::io("write the attachment", &e))?,
            }
            return Ok(format!("{ATTACHMENTS_DIR}/{file}"));
        }
        Err(AgentError::invalid_input(format!(
            "too many attachments named {name:?} in this conversation"
        )))
    }

    /// The id to resume a session with, once the harness reported one.
    #[allow(
        dead_code,
        reason = "for the transcript and session mapping of WG10-T09"
    )]
    pub async fn native_session_id(&self, session_id: &str) -> Result<Option<String>> {
        let slot = self.slot(session_id)?;
        let session = slot.session.lock().await;
        Ok(session.as_ref().and_then(|s| s.native_session_id()))
    }

    fn harness(&self, id: &str) -> Result<Arc<dyn AgentHarness>> {
        self.harnesses
            .iter()
            .find(|h| h.descriptor().id == id)
            .cloned()
            .ok_or_else(|| {
                AgentError::new(
                    AgentErrorKind::UnknownHarness,
                    format!("unknown harness: {id}"),
                )
            })
    }

    fn slot(&self, id: &str) -> Result<Arc<Slot>> {
        lock(&self.sessions)
            .get(id)
            .cloned()
            .ok_or_else(|| unknown_session(id))
    }
}

fn unknown_session(id: &str) -> AgentError {
    AgentError::new(
        AgentErrorKind::UnknownSession,
        format!("unknown session: {id}"),
    )
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

/// `<root>/<deckId>/<threadId>` for the key `deckId/threadId`. Only plain segments, so the key
/// cannot point outside `root`.
fn thread_dir(root: &Path, thread: &str) -> Result<PathBuf> {
    let plain = |segment: &str| {
        !segment.is_empty()
            && segment
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    };
    if thread.len() > MAX_THREAD_KEY || !thread.split('/').all(plain) {
        return Err(AgentError::invalid_input(format!(
            "invalid thread key {thread:?}: expected segments of letters, digits, '-' and '_', \
             separated by '/'"
        )));
    }
    Ok(thread
        .split('/')
        .fold(root.to_path_buf(), |dir, s| dir.join(s)))
}

/// A file name for an attachment: the name the user's file had, with whatever could leave the
/// folder or confuse a shell replaced. Letters of any script stay, so a Hebrew name is kept.
fn attachment_name(name: &str) -> String {
    let base = name.rsplit(['/', '\\']).next().unwrap_or(name);
    let mut clean: String = base
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || matches!(c, '.' | '-' | '_' | ' ') {
                c
            } else {
                '_'
            }
        })
        .collect();
    clean = clean.trim().trim_start_matches('.').to_owned();
    if clean.chars().count() > MAX_ATTACHMENT_NAME {
        // Keep the end: that is where the extension is.
        let skip = clean.chars().count() - MAX_ATTACHMENT_NAME;
        clean = clean.chars().skip(skip).collect();
    }
    if clean.is_empty() {
        "file".to_owned()
    } else {
        clean
    }
}

/// Sits between a session and its listener, and keeps the stream to the contract of
/// [`AgentEvent`] whatever the adapter does: one `session_started`; open tool calls are closed
/// before their turn ends; a turn cut short by the end of the session still gets its
/// `turn_completed`; nothing after `exited`.
struct TurnGuard {
    deliver: Box<dyn Fn(AgentEvent) + Send + Sync>,
    state: Mutex<GuardState>,
}

#[derive(Default)]
struct GuardState {
    started: bool,
    /// When the running turn began.
    turn: Option<Instant>,
    open_tools: Vec<String>,
    exited: bool,
}

impl TurnGuard {
    fn new(deliver: impl Fn(AgentEvent) + Send + Sync + 'static) -> Self {
        Self {
            deliver: Box::new(deliver),
            state: Mutex::default(),
        }
    }

    fn begin_turn(&self) -> Result<()> {
        let mut state = lock(&self.state);
        if state.exited {
            return Err(AgentError::process_exited("the session has ended"));
        }
        if state.turn.is_some() {
            return Err(AgentError::new(
                AgentErrorKind::Busy,
                "a turn is still running in this session",
            ));
        }
        state.turn = Some(Instant::now());
        Ok(())
    }

    /// The turn was never handed to the harness.
    fn abort_turn(&self) {
        lock(&self.state).turn = None;
    }

    fn in_turn(&self) -> bool {
        lock(&self.state).turn.is_some()
    }

    /// Delivers `event`, preceded by whatever the contract says must come first. Delivery happens
    /// under the lock, so events from different tasks of one session cannot overtake each other.
    fn emit(&self, event: AgentEvent) {
        let mut state = lock(&self.state);
        if state.exited {
            return;
        }
        match &event {
            AgentEvent::SessionStarted { .. } => {
                if state.started {
                    return;
                }
                state.started = true;
            }
            AgentEvent::ToolCallStarted { id, .. } => state.open_tools.push(id.clone()),
            AgentEvent::ToolCallFinished { id, .. } => state.open_tools.retain(|open| open != id),
            AgentEvent::TurnCompleted { outcome, .. } => {
                let summary = match outcome {
                    TurnOutcome::Interrupted => "interrupted",
                    _ => "the turn ended before the tool returned",
                };
                self.close_tools(&mut state, summary);
                state.turn = None;
            }
            AgentEvent::Exited { .. } => {
                self.close_tools(&mut state, "the session ended");
                if let Some(began) = state.turn.take() {
                    (self.deliver)(AgentEvent::TurnCompleted {
                        outcome: TurnOutcome::Failed,
                        usage: Usage::default(),
                        cost_usd: None,
                        duration_ms: millis(began),
                    });
                }
                state.exited = true;
            }
            _ => {}
        }
        (self.deliver)(event);
    }

    fn close_tools(&self, state: &mut GuardState, summary: &str) {
        for id in state.open_tools.drain(..) {
            (self.deliver)(AgentEvent::ToolCallFinished {
                id,
                ok: false,
                summary: summary.to_owned(),
            });
        }
    }
}

fn millis(since: Instant) -> u64 {
    u64::try_from(since.elapsed().as_millis()).unwrap_or(u64::MAX)
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use serde_json::json;
    use tokio::sync::mpsc;

    use super::*;
    use crate::harness::{
        Scope, ToolSource,
        mock::{MockHarness, Script},
    };

    type TestResult = std::result::Result<(), Box<dyn std::error::Error>>;

    fn script() -> std::result::Result<Script, String> {
        Script::parse(
            &json!({
                "description": "two turns: a tool call, then a long reply",
                "turns": [
                    [
                        { "delayMs": 100, "type": "text_delta", "text": "Adding a slide." },
                        { "delayMs": 100, "type": "tool_call_started", "id": "t1",
                          "name": "slide_create", "input": { "layout": "title" } },
                        { "delayMs": 300, "type": "tool_call_finished", "id": "t1", "ok": true,
                          "summary": "created s_1" },
                        { "delayMs": 50, "type": "turn_completed", "outcome": "completed",
                          "usage": { "inputTokens": 10, "outputTokens": 20 },
                          "costUsd": 0.01, "durationMs": 550 }
                    ],
                    [
                        { "delayMs": 100, "type": "text_delta", "text": "1, " },
                        { "delayMs": 100, "type": "tool_call_started", "id": "t2",
                          "name": "WebSearch", "source": "harness", "input": {} },
                        { "delayMs": 5000, "type": "tool_call_finished", "id": "t2", "ok": true,
                          "summary": "" },
                        { "delayMs": 100, "type": "turn_completed", "outcome": "completed",
                          "costUsd": 0.02, "durationMs": 5300 }
                    ]
                ]
            })
            .to_string(),
        )
    }

    fn manager(root: &Path) -> std::result::Result<HarnessManager, String> {
        let harness = MockHarness::new(vec![("demo".to_owned(), script()?)]);
        Ok(HarnessManager::new(
            root.to_path_buf(),
            vec![Arc::new(harness)],
        ))
    }

    fn config() -> SessionConfig {
        SessionConfig::new(Scope::Deck, "You build slides.", PathBuf::new())
    }

    async fn start(
        manager: &HarnessManager,
    ) -> Result<(String, mpsc::UnboundedReceiver<AgentEvent>)> {
        let (sender, receiver) = mpsc::unbounded_channel();
        let id = manager
            .start("mock", "deck1/thread1", config(), move |event| {
                let _ = sender.send(event);
            })
            .await?;
        Ok((id, receiver))
    }

    /// Events up to and including the next `turn_completed` or `exited`.
    async fn until_turn_end(events: &mut mpsc::UnboundedReceiver<AgentEvent>) -> Vec<AgentEvent> {
        let mut seen = Vec::new();
        while let Some(event) = events.recv().await {
            let end = matches!(
                event,
                AgentEvent::TurnCompleted { .. } | AgentEvent::Exited { .. }
            );
            seen.push(event);
            if end {
                break;
            }
        }
        seen
    }

    fn kinds(events: &[AgentEvent]) -> Vec<&'static str> {
        events
            .iter()
            .map(|event| match event {
                AgentEvent::SessionStarted { .. } => "session_started",
                AgentEvent::TextDelta { .. } => "text_delta",
                AgentEvent::ThinkingDelta { .. } => "thinking_delta",
                AgentEvent::ToolCallStarted { .. } => "tool_call_started",
                AgentEvent::ToolCallFinished { .. } => "tool_call_finished",
                AgentEvent::TurnCompleted { .. } => "turn_completed",
                AgentEvent::Error { .. } => "error",
                AgentEvent::Exited { .. } => "exited",
            })
            .collect()
    }

    #[tokio::test(start_paused = true)]
    async fn full_scenario_against_the_mock() -> TestResult {
        let root = tempfile::tempdir()?;
        let manager = manager(root.path())?;
        assert_eq!(manager.descriptors().len(), 1);
        let (id, mut events) = start(&manager).await?;

        // Turn 1 plays to the end.
        manager
            .send(&id, UserTurn::text("Make an opening slide"))
            .await?;
        let turn = until_turn_end(&mut events).await;
        assert_eq!(
            kinds(&turn),
            [
                "session_started",
                "text_delta",
                "tool_call_started",
                "tool_call_finished",
                "turn_completed"
            ]
        );
        assert!(matches!(
            &turn[4],
            AgentEvent::TurnCompleted { outcome: TurnOutcome::Completed, cost_usd: Some(c), usage, .. }
                if (*c - 0.01).abs() < 1e-9 && usage.output_tokens == 20
        ));

        // Turn 2 is interrupted while the web search runs: the open tool call is closed first.
        manager.send(&id, UserTurn::text("Count")).await?;
        tokio::time::sleep(Duration::from_millis(1000)).await;
        let busy = manager.send(&id, UserTurn::text("Again")).await;
        assert_eq!(busy.err().map(|e| e.kind), Some(AgentErrorKind::Busy));
        manager.interrupt(&id).await?;
        let turn = until_turn_end(&mut events).await;
        assert_eq!(
            kinds(&turn),
            [
                "text_delta",
                "tool_call_started",
                "tool_call_finished",
                "turn_completed"
            ]
        );
        assert!(matches!(
            &turn[1],
            AgentEvent::ToolCallStarted {
                source: ToolSource::Harness,
                ..
            }
        ));
        assert!(matches!(
            &turn[2],
            AgentEvent::ToolCallFinished { ok: false, .. }
        ));
        assert!(matches!(
            &turn[3],
            AgentEvent::TurnCompleted {
                outcome: TurnOutcome::Interrupted,
                duration_ms: 1000,
                ..
            }
        ));

        // The session takes another turn after the interrupt; the script wraps around.
        manager.send(&id, UserTurn::text("Once more")).await?;
        let turn = until_turn_end(&mut events).await;
        assert_eq!(turn.len(), 4);
        assert_eq!(
            manager
                .native_session_id(&id)
                .await?
                .map(|s| s.starts_with("mock-")),
            Some(true)
        );

        manager.close(&id).await?;
        assert_eq!(kinds(&until_turn_end(&mut events).await), ["exited"]);
        assert!(events.recv().await.is_none(), "nothing after exited");
        let gone = manager.send(&id, UserTurn::text("Hello?")).await;
        assert_eq!(
            gone.err().map(|e| e.kind),
            Some(AgentErrorKind::UnknownSession)
        );
        Ok(())
    }

    #[tokio::test(start_paused = true)]
    async fn close_during_a_turn_ends_it_first() -> TestResult {
        let root = tempfile::tempdir()?;
        let manager = manager(root.path())?;
        let (id, mut events) = start(&manager).await?;
        manager.send(&id, UserTurn::text("Go")).await?;
        tokio::time::sleep(Duration::from_millis(250)).await;
        manager.close(&id).await?;
        let mut all = Vec::new();
        while let Some(event) = events.recv().await {
            all.push(event);
        }
        assert_eq!(
            kinds(&all),
            [
                "session_started",
                "text_delta",
                "tool_call_started",
                "tool_call_finished",
                "turn_completed",
                "exited"
            ]
        );
        Ok(())
    }

    #[tokio::test]
    async fn rejects_bad_input() -> TestResult {
        let root = tempfile::tempdir()?;
        let manager = manager(root.path())?;
        let unknown = manager.start("nope", "d/t", config(), |_| {}).await;
        assert_eq!(
            unknown.err().map(|e| e.kind),
            Some(AgentErrorKind::UnknownHarness)
        );
        for thread in ["", "../x", "d/../x", "d//t", "d/t/", "d\\t", "ד/t"] {
            let bad = manager.start("mock", thread, config(), |_| {}).await;
            assert_eq!(
                bad.err().map(|e| e.kind),
                Some(AgentErrorKind::InvalidInput),
                "{thread:?}"
            );
        }
        let mut wrong_model = config();
        wrong_model.model = Some("no-such-script".into());
        let bad = manager.start("mock", "d/t", wrong_model, |_| {}).await;
        assert_eq!(
            bad.err().map(|e| e.kind),
            Some(AgentErrorKind::InvalidInput)
        );

        let (id, _events) = start(&manager).await?;
        let empty = manager.send(&id, UserTurn::text("  ")).await;
        assert_eq!(
            empty.err().map(|e| e.kind),
            Some(AgentErrorKind::InvalidInput)
        );
        // A rejected turn does not leave the session busy.
        manager.interrupt(&id).await?;
        manager.close(&id).await?;
        Ok(())
    }

    #[test]
    fn thread_dir_stays_under_root() -> TestResult {
        let root = Path::new("/app/agent");
        assert_eq!(
            thread_dir(root, "01JABC/main_1")?,
            root.join("01JABC").join("main_1")
        );
        Ok(())
    }

    #[test]
    fn attachments_go_under_the_thread_and_keep_their_names() -> TestResult {
        let dir = tempfile::tempdir()?;
        let manager = manager(dir.path())?;
        let stored = manager.attach("deck1/thread1", "C:\\Users\\me\\לוגו החברה.png", b"png")?;
        assert_eq!(stored, "attachments/לוגו החברה.png");
        let on_disk = dir.path().join("deck1").join("thread1").join(&stored);
        assert_eq!(std::fs::read(on_disk)?, b"png");
        // The same file again is the same file; another file of that name gets a number.
        assert_eq!(
            manager.attach("deck1/thread1", "לוגו החברה.png", b"png")?,
            stored
        );
        assert_eq!(
            manager.attach("deck1/thread1", "לוגו החברה.png", b"other")?,
            "attachments/לוגו החברה-2.png"
        );
        // A name cannot leave the folder, and a thread key cannot leave the root.
        assert_eq!(
            manager.attach("deck1/thread1", "../../evil<1>.html", b"x")?,
            "attachments/evil_1_.html"
        );
        assert_eq!(
            manager.attach("deck1/thread1", "..", b"x")?,
            "attachments/file"
        );
        assert_eq!(
            manager
                .attach("../deck1", "a.txt", b"x")
                .err()
                .map(|e| e.kind),
            Some(AgentErrorKind::InvalidInput)
        );
        Ok(())
    }

    #[test]
    fn guard_closes_a_turn_cut_short_by_exit() {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let guard = {
            let seen = Arc::clone(&seen);
            TurnGuard::new(move |event| lock(&seen).push(event))
        };
        let started = |id: &str| AgentEvent::ToolCallStarted {
            id: id.into(),
            name: "slide_get".into(),
            source: ToolSource::App,
            input: json!({}),
        };
        let session = AgentEvent::SessionStarted {
            native_session_id: "n".into(),
            model: "m".into(),
        };
        assert!(guard.begin_turn().is_ok());
        guard.emit(session.clone());
        guard.emit(session);
        guard.emit(started("a"));
        guard.emit(started("b"));
        guard.emit(AgentEvent::ToolCallFinished {
            id: "a".into(),
            ok: true,
            summary: String::new(),
        });
        guard.emit(AgentEvent::Exited { code: Some(1) });
        guard.emit(AgentEvent::TextDelta {
            text: "late".into(),
        });
        assert_eq!(
            kinds(&lock(&seen)),
            [
                "session_started",
                "tool_call_started",
                "tool_call_started",
                "tool_call_finished",
                "tool_call_finished",
                "turn_completed",
                "exited"
            ]
        );
        assert!(matches!(
            lock(&seen)[5],
            AgentEvent::TurnCompleted {
                outcome: TurnOutcome::Failed,
                ..
            }
        ));
        assert_eq!(
            guard.begin_turn().err().map(|e| e.kind),
            Some(AgentErrorKind::ProcessExited)
        );
    }
}
