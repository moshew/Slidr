//! The Claude Code CLI adapter (SPEC 11.3, ADR-001): one long-lived `claude -p` process per
//! session, stream-json both ways. Signs in with the user's existing Claude Code login; the app
//! holds no API key.
//!
//! Session folder (`SessionConfig::workdir`):
//!
//! ```text
//! <workdir>/system.md      the system prompt (replaces the CLI's own)
//! <workdir>/mcp.json       the app's tool endpoint, when the session has one
//! <workdir>/attachments/   the process's working directory; --restricted confines Read and Grep
//!                          to it, so it holds only what the agent may read
//! ```
//!
//! The CLI keeps its transcript under `~/.claude/projects/<cwd>/`, so `--resume` works only from
//! the same folder: the manager derives it from the thread key, which is what makes it stable.

use std::{
    collections::{HashSet, VecDeque},
    ffi::OsString,
    io,
    path::{Path, PathBuf},
    process::Stdio,
    sync::{
        Arc, Mutex, MutexGuard, PoisonError,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};

use async_trait::async_trait;
use serde_json::{Map, Value, json};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::{Child, ChildStderr, ChildStdin, ChildStdout},
    sync::{Notify, watch},
    time::{Instant, timeout},
};

use crate::harness::{
    AgentError, AgentErrorKind, AgentEvent, AgentHarness, AgentSession, Capabilities, EventSink,
    HarnessDescriptor, HarnessState, HarnessStatus, ModelOption, Result, SessionConfig,
    ToolEndpoint, ToolSource, TurnOutcome, Usage, UserTurn,
};

const PROGRAM: &str = "claude";
/// The tool server's name in `mcp.json`. The CLI names its tools `mcp__<server>__<tool>`.
const TOOL_SERVER: &str = "slidr";
const TOOL_PREFIX: &str = "mcp__slidr__";
/// Built-in tools, an exact list (`--tools`): reading the attachments, and the web (AID-07).
const FILE_TOOLS: [&str; 2] = ["Read", "Grep"];
const WEB_TOOLS: [&str; 2] = ["WebSearch", "WebFetch"];
/// Aliases the CLI resolves to the latest model of each family.
const MODELS: [(&str, &str); 4] = [
    ("sonnet", "Sonnet"),
    ("opus", "Opus"),
    ("haiku", "Haiku"),
    ("fable", "Fable"),
];
const EFFORTS: [&str; 5] = ["low", "medium", "high", "xhigh", "max"];

/// Windows: start the CLI without a console window (ADR-001 finding 5).
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
/// ADR-001: an interrupt ends the turn within milliseconds; past this, the process is ended.
const INTERRUPT_GRACE: Duration = Duration::from_secs(1);
/// EOF on stdin ends the process in about 330ms (ADR-001); past this, it is killed.
const CLOSE_GRACE: Duration = Duration::from_secs(5);
const PROBE_TIMEOUT: Duration = Duration::from_secs(20);
/// The CLI gives up on a tool call after 60 seconds unless this variable says otherwise (ADR-002,
/// finding 5). The tool endpoint already limits every call by its tool's own time limit, so the
/// CLI only has to wait longer than the longest of those: ten minutes.
const TOOL_TIMEOUT_ENV: (&str, &str) = ("MCP_TOOL_TIMEOUT", "600000");
/// Length of a tool result's summary, in characters.
const SUMMARY_CHARS: usize = 300;
/// stderr lines kept for the error message when the process dies.
const STDERR_LINES: usize = 20;

const INSTALL_HINT: &str = "Claude Code was not found. Install it, make sure `claude` is on the \
                            PATH, and run `claude` once in a terminal to sign in.";
const LOGIN_HINT: &str = "Claude Code is not signed in. Run `claude` in a terminal and sign in \
                          with /login.";

/// The adapter. Holds nothing but the program to run.
pub struct ClaudeCodeHarness {
    program: OsString,
    /// Arguments before the CLI's own; only the tests' stand-in CLI has any.
    prefix: Vec<OsString>,
}

impl Default for ClaudeCodeHarness {
    fn default() -> Self {
        Self::new()
    }
}

impl ClaudeCodeHarness {
    /// The adapter for the `claude` on the PATH.
    pub fn new() -> Self {
        Self {
            program: PROGRAM.into(),
            prefix: Vec::new(),
        }
    }

    /// The CLI with the user's Claude and Anthropic variables removed (the app may itself run
    /// under Claude Code in development) and, on Windows, no console window.
    fn command(&self) -> std::process::Command {
        let mut command = std::process::Command::new(&self.program);
        command.args(&self.prefix);
        for (key, _) in std::env::vars_os() {
            let upper = key.to_string_lossy().to_ascii_uppercase();
            if upper.starts_with("CLAUDE") || upper.starts_with("ANTHROPIC") {
                command.env_remove(&key);
            }
        }
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(CREATE_NO_WINDOW);
        }
        command
    }

    /// Runs a short CLI command to completion.
    async fn output(&self, args: &[&str]) -> io::Result<std::process::Output> {
        let mut command = tokio::process::Command::from(self.command());
        command.args(args).stdin(Stdio::null()).kill_on_drop(true);
        timeout(PROBE_TIMEOUT, command.output())
            .await
            .map_err(|_| io::Error::new(io::ErrorKind::TimedOut, "no answer in time"))?
    }
}

#[async_trait]
impl AgentHarness for ClaudeCodeHarness {
    fn descriptor(&self) -> HarnessDescriptor {
        HarnessDescriptor {
            id: "claude-code".into(),
            name: "Claude Code".into(),
            capabilities: Capabilities {
                streaming: true,
                resume: true,
                interrupt: true,
                image_input: true,
                tool_endpoint: true,
                thinking: true,
            },
            models: MODELS
                .iter()
                .map(|(id, label)| ModelOption {
                    id: (*id).into(),
                    label: (*label).into(),
                })
                .collect(),
            default_model: None,
            effort_levels: EFFORTS.iter().map(|e| (*e).into()).collect(),
        }
    }

    /// `claude --version` and `claude auth status` (ADR-001 finding 3: `init` arrives only after
    /// the first message, so a session cannot tell).
    async fn probe(&self) -> HarnessStatus {
        let status = |state, version, account, detail: Option<String>| HarnessStatus {
            state,
            version,
            account,
            detail,
        };
        let (version, auth) = tokio::join!(
            self.output(&["--version"]),
            self.output(&["auth", "status"])
        );
        let version = match version {
            Ok(out) => parse_version(&out.stdout),
            Err(e) if e.kind() == io::ErrorKind::NotFound => {
                return status(
                    HarnessState::NotInstalled,
                    None,
                    None,
                    Some(INSTALL_HINT.into()),
                );
            }
            Err(e) => {
                return status(
                    HarnessState::Unavailable,
                    None,
                    None,
                    Some(format!("`claude --version` failed: {e}")),
                );
            }
        };
        // `auth status` prints JSON whether or not the user is signed in.
        let auth = auth
            .ok()
            .and_then(|out| serde_json::from_slice::<Value>(&out.stdout).ok());
        match auth {
            Some(auth) if auth["loggedIn"] == true => {
                status(HarnessState::Ready, version, account(&auth), None)
            }
            Some(_) => status(
                HarnessState::NotLoggedIn,
                version,
                None,
                Some(LOGIN_HINT.into()),
            ),
            None => status(
                HarnessState::Unavailable,
                version,
                None,
                Some("could not read `claude auth status`".into()),
            ),
        }
    }

    async fn start(&self, config: SessionConfig, sink: EventSink) -> Result<Box<dyn AgentSession>> {
        check_value("model", config.model.as_deref())?;
        check_value("resume", config.resume.as_deref())?;
        if let Some(effort) = &config.effort
            && !EFFORTS.contains(&effort.as_str())
        {
            return Err(AgentError::invalid_input(format!(
                "unknown effort level {effort:?}; expected one of {}",
                EFFORTS.join(", ")
            )));
        }
        let files = SessionFiles::new(&config.workdir);
        files.write(&config).await?;

        let mut command = tokio::process::Command::from(self.command());
        command
            .args(args(&config, &files))
            .env(TOOL_TIMEOUT_ENV.0, TOOL_TIMEOUT_ENV.1)
            .current_dir(&files.attachments)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        let mut child = command.spawn().map_err(|e| match e.kind() {
            io::ErrorKind::NotFound => AgentError::new(AgentErrorKind::NotInstalled, INSTALL_HINT),
            _ => AgentError::io("start claude", &e),
        })?;
        let (Some(stdin), Some(stdout), Some(stderr)) =
            (child.stdin.take(), child.stdout.take(), child.stderr.take())
        else {
            return Err(AgentError::internal("the CLI's pipes were not captured"));
        };

        let shared = Arc::new(Shared {
            stdin: tokio::sync::Mutex::new(Some(stdin)),
            native_id: Mutex::new(None),
            busy: watch::Sender::new(false),
            turn_began: Mutex::new(None),
            closing: AtomicBool::new(false),
            stopped_by_kill: AtomicBool::new(false),
            explained: AtomicBool::new(false),
            kill: Notify::new(),
        });
        let (exited_tx, exited) = watch::channel(false);
        let mut mapper = StreamMapper::new(config.resume.is_some(), config.tool_endpoint.is_some());
        if config.resume.is_some() {
            mapper.cost_baseline = config.resumed_cost_usd;
        }
        tokio::spawn(supervise(
            child,
            stdout,
            stderr,
            mapper,
            sink,
            Arc::clone(&shared),
            exited_tx,
        ));
        Ok(Box::new(ClaudeSession {
            shared,
            exited,
            resume: config.resume,
            requests: 0,
        }))
    }
}

fn parse_version(stdout: &[u8]) -> Option<String> {
    // "2.1.287 (Claude Code)"
    String::from_utf8_lossy(stdout)
        .split_whitespace()
        .next()
        .map(str::to_owned)
}

/// "claude.ai (max)": the sign-in method and plan, nothing that names the person.
fn account(auth: &Value) -> Option<String> {
    let method = auth["authMethod"].as_str()?;
    Some(match auth["subscriptionType"].as_str() {
        Some(plan) => format!("{method} ({plan})"),
        None => method.to_owned(),
    })
}

/// A value that goes on the command line after a flag: it must not read as a flag itself.
fn check_value(name: &str, value: Option<&str>) -> Result<()> {
    let Some(value) = value else { return Ok(()) };
    let plain = !value.is_empty()
        && !value.starts_with('-')
        && value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "-_.:[]".contains(c));
    if plain {
        Ok(())
    } else {
        Err(AgentError::invalid_input(format!(
            "invalid {name}: {value:?}"
        )))
    }
}

/// The files of one session folder.
struct SessionFiles {
    system: PathBuf,
    tools: PathBuf,
    attachments: PathBuf,
}

impl SessionFiles {
    fn new(dir: &Path) -> Self {
        Self {
            system: dir.join("system.md"),
            tools: dir.join("mcp.json"),
            attachments: dir.join(crate::harness::ATTACHMENTS),
        }
    }

    async fn write(&self, config: &SessionConfig) -> Result<()> {
        let io = |what: &Path| {
            let what = what.display().to_string();
            move |e: io::Error| AgentError::io(format_args!("write {what}"), &e)
        };
        tokio::fs::create_dir_all(&self.attachments)
            .await
            .map_err(io(&self.attachments))?;
        tokio::fs::write(&self.system, &config.system_prompt)
            .await
            .map_err(io(&self.system))?;
        match &config.tool_endpoint {
            Some(endpoint) => tokio::fs::write(&self.tools, tools_config(endpoint).to_string())
                .await
                .map_err(io(&self.tools))?,
            // No token of an earlier session left on disk.
            None => {
                let _ = tokio::fs::remove_file(&self.tools).await;
            }
        }
        Ok(())
    }
}

/// `mcp.json` (SPEC 11.3).
fn tools_config(endpoint: &ToolEndpoint) -> Value {
    let mut servers = Map::new();
    servers.insert(
        TOOL_SERVER.into(),
        json!({
            "type": "http",
            "url": endpoint.url,
            "headers": { "Authorization": format!("Bearer {}", endpoint.token) },
        }),
    );
    json!({ "mcpServers": servers })
}

/// The command line of SPEC 11.3. Without a tool endpoint there is no `--mcp-config` and no
/// `mcp__slidr__*` rule; `--strict-mcp-config` stays, so the user's own servers never load.
fn args(config: &SessionConfig, files: &SessionFiles) -> Vec<OsString> {
    let mut args: Vec<OsString> = [
        "-p",
        "--input-format",
        "stream-json",
        "--output-format",
        "stream-json",
        "--verbose",
        "--include-partial-messages",
        "--restricted",
        "--disable-slash-commands",
        "--strict-mcp-config",
    ]
    .into_iter()
    .map(OsString::from)
    .collect();
    if config.tool_endpoint.is_some() {
        args.push("--mcp-config".into());
        args.push(files.tools.clone().into());
    }
    let web: &[&str] = if config.web_access { &WEB_TOOLS } else { &[] };
    let builtin: Vec<&str> = FILE_TOOLS.iter().chain(web).copied().collect();
    args.push("--tools".into());
    args.push(builtin.join(",").into());
    args.push("--allowedTools".into());
    args.extend(builtin.iter().map(OsString::from));
    if config.tool_endpoint.is_some() {
        args.push(format!("{TOOL_PREFIX}*").into());
    }
    args.extend(["--permission-mode", "dontAsk", "--system-prompt-file"].map(OsString::from));
    args.push(files.system.clone().into());
    for (flag, value) in [
        ("--model", &config.model),
        ("--effort", &config.effort),
        ("--resume", &config.resume),
    ] {
        if let Some(value) = value {
            args.push(flag.into());
            args.push(value.into());
        }
    }
    args
}

/// State shared by the session and the task that reads the process.
struct Shared {
    /// `None` once closed: EOF is how a stream-json session ends.
    stdin: tokio::sync::Mutex<Option<ChildStdin>>,
    native_id: Mutex<Option<String>>,
    /// A turn was written and its `result` has not arrived.
    busy: watch::Sender<bool>,
    turn_began: Mutex<Option<Instant>>,
    closing: AtomicBool,
    /// The running turn ignored its interrupt and the process was ended.
    stopped_by_kill: AtomicBool,
    /// An error event already said why the session cannot go on.
    explained: AtomicBool,
    kill: Notify,
}

impl Shared {
    async fn write(&self, message: &Value) -> Result<()> {
        let mut stdin = self.stdin.lock().await;
        let Some(pipe) = stdin.as_mut() else {
            return Err(AgentError::process_exited("the session is closing"));
        };
        let mut line = message.to_string();
        line.push('\n');
        let written = async {
            pipe.write_all(line.as_bytes()).await?;
            pipe.flush().await
        }
        .await;
        written.map_err(|e| AgentError::process_exited(format!("the CLI is not reading: {e}")))
    }

    fn end_turn(&self) {
        self.busy.send_replace(false);
        lock(&self.turn_began).take();
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

/// Reads the process until it ends, then reports how it ended.
async fn supervise(
    mut child: Child,
    stdout: ChildStdout,
    stderr: ChildStderr,
    mut mapper: StreamMapper,
    sink: EventSink,
    shared: Arc<Shared>,
    exited: watch::Sender<bool>,
) {
    let stderr = tokio::spawn(tail(stderr));
    let mut lines = BufReader::new(stdout).lines();
    loop {
        tokio::select! {
            line = lines.next_line() => match line {
                Ok(Some(line)) => on_line(&line, &mut mapper, &sink, &shared).await,
                Ok(None) | Err(_) => break,
            },
            () = shared.kill.notified() => {
                let _ = child.start_kill();
                break;
            }
        }
    }
    let code = child.wait().await.ok().and_then(|status| status.code());
    let stderr = stderr.await.unwrap_or_default();
    let began = lock(&shared.turn_began).take();
    let was_busy = shared.busy.send_replace(false);
    let closing = shared.closing.load(Ordering::SeqCst);
    if was_busy && shared.stopped_by_kill.load(Ordering::SeqCst) {
        sink.emit(AgentEvent::TurnCompleted {
            outcome: TurnOutcome::Interrupted,
            usage: Usage::default(),
            cost_usd: None,
            duration_ms: began.map_or(0, millis),
        });
        if !closing {
            sink.emit(AgentEvent::Error {
                kind: AgentErrorKind::ProcessExited,
                message: "the turn did not stop when asked, so its process was ended; resume \
                          the session to continue"
                    .into(),
                recoverable: false,
            });
        }
    } else if !closing && !shared.explained.load(Ordering::SeqCst) && (was_busy || code != Some(0))
    {
        let mut message = format!("the CLI exited (code {code:?})");
        if !stderr.is_empty() {
            message = format!("{message}: {stderr}");
        }
        sink.emit(AgentEvent::Error {
            kind: AgentErrorKind::ProcessExited,
            message,
            recoverable: false,
        });
    }
    sink.emit(AgentEvent::Exited { code });
    exited.send_replace(true);
}

async fn on_line(line: &str, mapper: &mut StreamMapper, sink: &EventSink, shared: &Shared) {
    // Anything that is not JSON is the CLI talking to a terminal; nothing to map.
    let Ok(message) = serde_json::from_str::<Value>(line) else {
        return;
    };
    let mut stop_turn = false;
    for event in mapper.map(&message) {
        match &event {
            AgentEvent::SessionStarted {
                native_session_id, ..
            } => *lock(&shared.native_id) = Some(native_session_id.clone()),
            AgentEvent::Error {
                kind: AgentErrorKind::ToolsUnavailable,
                ..
            } => stop_turn = true,
            AgentEvent::Error {
                kind: AgentErrorKind::ResumeFailed,
                ..
            } => shared.explained.store(true, Ordering::SeqCst),
            // Before the event goes out, so a turn sent in reply never finds the old one busy.
            AgentEvent::TurnCompleted { .. } => shared.end_turn(),
            _ => {}
        }
        sink.emit(event);
    }
    // ADR-002: a model without its tools does not fail, it makes the results up. Stop the turn.
    if stop_turn {
        let _ = shared.write(&interrupt_request("tools-check")).await;
    }
}

/// The last lines of stderr, for the error message if the process dies.
async fn tail(stderr: ChildStderr) -> String {
    let mut last = VecDeque::with_capacity(STDERR_LINES);
    let mut lines = BufReader::new(stderr).lines();
    while let Ok(Some(line)) = lines.next_line().await {
        if last.len() == STDERR_LINES {
            last.pop_front();
        }
        last.push_back(line);
    }
    Vec::from(last).join("\n")
}

fn millis(since: Instant) -> u64 {
    u64::try_from(since.elapsed().as_millis()).unwrap_or(u64::MAX)
}

/// The stdin message of a user turn (ADR-001): the context block, the images, then the text.
fn user_message(turn: &UserTurn) -> Value {
    let mut content = Vec::new();
    if let Some(context) = turn.context.as_deref().filter(|c| !c.trim().is_empty()) {
        content.push(json!({ "type": "text", "text": context }));
    }
    for image in &turn.images {
        content.push(json!({
            "type": "image",
            "source": { "type": "base64", "media_type": image.media_type, "data": image.data },
        }));
    }
    if !turn.text.trim().is_empty() {
        content.push(json!({ "type": "text", "text": turn.text }));
    }
    json!({ "type": "user", "message": { "role": "user", "content": content } })
}

/// Stops the running turn; the process stays (ADR-001).
fn interrupt_request(id: &str) -> Value {
    json!({ "type": "control_request", "request_id": id, "request": { "subtype": "interrupt" } })
}

struct ClaudeSession {
    shared: Arc<Shared>,
    exited: watch::Receiver<bool>,
    resume: Option<String>,
    requests: u64,
}

#[async_trait]
impl AgentSession for ClaudeSession {
    async fn send(&mut self, turn: UserTurn) -> Result<()> {
        if *self.exited.borrow() {
            return Err(AgentError::process_exited("the CLI process has ended"));
        }
        *lock(&self.shared.turn_began) = Some(Instant::now());
        self.shared.busy.send_replace(true);
        let written = self.shared.write(&user_message(&turn)).await;
        if written.is_err() {
            self.shared.end_turn();
        }
        written
    }

    async fn interrupt(&mut self) -> Result<()> {
        if !*self.shared.busy.borrow() {
            return Ok(());
        }
        self.requests += 1;
        let id = format!("interrupt-{}", self.requests);
        self.shared.write(&interrupt_request(&id)).await?;
        // ADR-001's fallback: no `result` within a second ends the process; the conversation
        // continues from its id in a new session.
        let shared = Arc::clone(&self.shared);
        let mut busy = shared.busy.subscribe();
        tokio::spawn(async move {
            if timeout(INTERRUPT_GRACE, busy.wait_for(|busy| !*busy))
                .await
                .is_err()
            {
                shared.stopped_by_kill.store(true, Ordering::SeqCst);
                shared.kill.notify_one();
            }
        });
        Ok(())
    }

    async fn close(mut self: Box<Self>) -> Result<()> {
        self.shared.closing.store(true, Ordering::SeqCst);
        if *self.shared.busy.borrow() {
            let _ = self.interrupt().await;
            let mut busy = self.shared.busy.subscribe();
            let _ = timeout(INTERRUPT_GRACE * 2, busy.wait_for(|busy| !*busy)).await;
        }
        drop(self.shared.stdin.lock().await.take());
        if timeout(CLOSE_GRACE, self.exited.wait_for(|done| *done))
            .await
            .is_err()
        {
            self.shared.kill.notify_one();
            let _ = timeout(CLOSE_GRACE, self.exited.wait_for(|done| *done)).await;
        }
        Ok(())
    }

    fn native_session_id(&self) -> Option<String> {
        lock(&self.shared.native_id)
            .clone()
            .or_else(|| self.resume.clone())
    }
}

impl Drop for ClaudeSession {
    /// A session dropped without `close` (the app is exiting) takes its process with it.
    fn drop(&mut self) {
        if !*self.exited.borrow() {
            self.shared.kill.notify_one();
        }
    }
}

/// Maps the CLI's stdout, one JSON line at a time, to [`AgentEvent`]s (ADR-001's table).
struct StreamMapper {
    started: bool,
    resumed: bool,
    /// Check every `init` for the app's tools (ADR-002).
    expect_app_tools: bool,
    /// `total_cost_usd` is cumulative per conversation, across processes; the last value seen,
    /// when known. On a resumed process it is what the app says the conversation had cost
    /// (`SessionConfig::resumed_cost_usd`); without that it is unknown until the first `result`,
    /// which then has no per-turn cost.
    cost_baseline: Option<f64>,
    /// The id of the assistant message being streamed, and the ones whose text was streamed.
    current_message: Option<String>,
    streamed: HashSet<String>,
}

impl StreamMapper {
    fn new(resumed: bool, expect_app_tools: bool) -> Self {
        Self {
            started: false,
            resumed,
            expect_app_tools,
            cost_baseline: if resumed { None } else { Some(0.0) },
            current_message: None,
            streamed: HashSet::new(),
        }
    }

    fn map(&mut self, line: &Value) -> Vec<AgentEvent> {
        // Subagents are not enabled; if one ever runs, its stream is not the conversation's.
        if !line["parent_tool_use_id"].is_null() {
            return Vec::new();
        }
        match line["type"].as_str() {
            Some("system") if line["subtype"] == "init" => self.init(line),
            Some("stream_event") => self.stream_event(&line["event"]),
            Some("assistant") => self.assistant(&line["message"]),
            Some("user") => tool_results(&line["message"]),
            Some("result") => self.result(line),
            Some("rate_limit_event") => rate_limit(&line["rate_limit_info"]),
            // system/status, system/thinking_tokens, system/permission_denied (the denial also
            // comes back as a failed tool result), control_response: for the diagnostics log.
            _ => Vec::new(),
        }
    }

    /// `init` repeats on every turn; the session starts once.
    fn init(&mut self, line: &Value) -> Vec<AgentEvent> {
        let mut events = Vec::new();
        if !self.started {
            self.started = true;
            events.push(AgentEvent::SessionStarted {
                native_session_id: text(&line["session_id"]),
                model: text(&line["model"]),
            });
        }
        let has_app_tools = line["tools"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .any(|tool| tool.starts_with(TOOL_PREFIX));
        if self.expect_app_tools && !has_app_tools {
            events.push(AgentEvent::Error {
                kind: AgentErrorKind::ToolsUnavailable,
                message: "the agent started without the app's tools; the turn was stopped".into(),
                recoverable: false,
            });
        }
        events
    }

    fn stream_event(&mut self, event: &Value) -> Vec<AgentEvent> {
        match event["type"].as_str() {
            Some("message_start") => {
                self.current_message = event["message"]["id"].as_str().map(str::to_owned);
                Vec::new()
            }
            Some("content_block_delta") => {
                let delta = &event["delta"];
                match delta["type"].as_str() {
                    Some("text_delta") => {
                        if let Some(id) = &self.current_message {
                            self.streamed.insert(id.clone());
                        }
                        vec![AgentEvent::TextDelta {
                            text: text(&delta["text"]),
                        }]
                    }
                    Some("thinking_delta") => vec![AgentEvent::ThinkingDelta {
                        text: text(&delta["thinking"]),
                    }],
                    _ => Vec::new(),
                }
            }
            _ => Vec::new(),
        }
    }

    /// Complete content blocks. Tool calls come only from here, with their full input. Text
    /// comes from here only when it was not streamed (a CLI run without partial messages).
    fn assistant(&self, message: &Value) -> Vec<AgentEvent> {
        let streamed = message["id"]
            .as_str()
            .is_some_and(|id| self.streamed.contains(id));
        blocks(message)
            .filter_map(|block| match block["type"].as_str() {
                Some("tool_use") => {
                    let name = text(&block["name"]);
                    let (name, source) = match name.strip_prefix(TOOL_PREFIX) {
                        Some(app) => (app.to_owned(), ToolSource::App),
                        None => (name, ToolSource::Harness),
                    };
                    Some(AgentEvent::ToolCallStarted {
                        id: text(&block["id"]),
                        name,
                        source,
                        input: block["input"].clone(),
                    })
                }
                Some("text") if !streamed => Some(AgentEvent::TextDelta {
                    text: text(&block["text"]),
                }),
                _ => None,
            })
            .collect()
    }

    fn result(&mut self, line: &Value) -> Vec<AgentEvent> {
        // A result before any init: the process could not start the conversation. With
        // --resume that means the CLI has no such conversation in this folder (another
        // computer, its history cleared); the process exits next (AGT-06).
        if self.resumed && !self.started {
            return vec![AgentEvent::Error {
                kind: AgentErrorKind::ResumeFailed,
                message: error_text(line),
                recoverable: false,
            }];
        }
        let mut events = Vec::new();
        let is_error = line["is_error"].as_bool().unwrap_or(false);
        let outcome = if line["subtype"] == "success" && !is_error {
            TurnOutcome::Completed
        } else if line["terminal_reason"]
            .as_str()
            .is_some_and(|reason| reason.starts_with("aborted"))
        {
            TurnOutcome::Interrupted
        } else {
            TurnOutcome::Failed
        };
        if outcome == TurnOutcome::Failed {
            events.push(turn_error(line));
        }
        let total = line["total_cost_usd"].as_f64();
        let cost_usd = match (self.cost_baseline, total) {
            (Some(before), Some(total)) => Some((total - before).max(0.0)),
            _ => None,
        };
        if total.is_some() {
            self.cost_baseline = total;
        }
        let usage = &line["usage"];
        let tokens = |key: &str| usage[key].as_u64().unwrap_or(0);
        events.push(AgentEvent::TurnCompleted {
            outcome,
            usage: Usage {
                input_tokens: tokens("input_tokens"),
                output_tokens: tokens("output_tokens"),
                cache_read_tokens: tokens("cache_read_input_tokens"),
                cache_write_tokens: tokens("cache_creation_input_tokens"),
            },
            cost_usd,
            duration_ms: line["duration_ms"].as_u64().unwrap_or(0),
        });
        self.current_message = None;
        self.streamed.clear();
        events
    }
}

/// Tool results come back as a `user` message the CLI writes itself.
fn tool_results(message: &Value) -> Vec<AgentEvent> {
    blocks(message)
        .filter(|block| block["type"] == "tool_result")
        .map(|block| AgentEvent::ToolCallFinished {
            id: text(&block["tool_use_id"]),
            ok: !block["is_error"].as_bool().unwrap_or(false),
            summary: summarize(&block["content"]),
        })
        .collect()
}

/// The error of a failed turn: the API's status says what kind (CHT-U09).
fn turn_error(line: &Value) -> AgentEvent {
    let kind = match line["api_error_status"].as_u64() {
        Some(401 | 403) => AgentErrorKind::NotLoggedIn,
        Some(429) => AgentErrorKind::Quota,
        _ => AgentErrorKind::TurnFailed,
    };
    AgentEvent::Error {
        kind,
        message: error_text(line),
        recoverable: true,
    }
}

/// What a failed `result` says went wrong.
fn error_text(line: &Value) -> String {
    let errors: Vec<&str> = line["errors"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .collect();
    match line["result"].as_str().filter(|r| !r.is_empty()) {
        Some(result) => result.to_owned(),
        None if !errors.is_empty() => errors.join("; "),
        None => format!("the turn ended with {}", text(&line["subtype"])),
    }
}

/// `rate_limit_event`: any status that is not an `allowed…` one means the limit was hit.
fn rate_limit(info: &Value) -> Vec<AgentEvent> {
    let status = info["status"].as_str().unwrap_or("allowed");
    if status.starts_with("allowed") {
        return Vec::new();
    }
    let window = info["rateLimitType"].as_str().unwrap_or("usage");
    let mut message = format!("usage limit reached ({window}, {status})");
    if let Some(resets) = info["resetsAt"].as_i64() {
        message.push_str(&format!("; resets at unix time {resets}"));
    }
    vec![AgentEvent::Error {
        kind: AgentErrorKind::Quota,
        message,
        recoverable: true,
    }]
}

fn blocks(message: &Value) -> impl Iterator<Item = &Value> {
    message["content"].as_array().into_iter().flatten()
}

fn text(value: &Value) -> String {
    value.as_str().unwrap_or_default().to_owned()
}

/// A tool result as short text: its text parts, `[image]` for images.
fn summarize(content: &Value) -> String {
    let full = match content {
        Value::String(text) => without_image_paths(text),
        Value::Array(parts) => parts
            .iter()
            .filter_map(|part| match part["type"].as_str() {
                Some("text") => part["text"]
                    .as_str()
                    .map(without_image_paths)
                    .filter(|text| !text.is_empty()),
                Some("image") => Some("[image]".to_owned()),
                _ => None,
            })
            .collect::<Vec<_>>()
            .join("\n"),
        Value::Null => String::new(),
        other => other.to_string(),
    };
    if full.chars().count() <= SUMMARY_CHARS {
        full
    } else {
        full.chars().take(SUMMARY_CHARS).chain(['…']).collect()
    }
}

/// The CLI saves every image a tool returns and adds a line with the file's path, which holds
/// the user's name. The summary goes to the chat and to the saved transcript, so the line is
/// dropped.
fn without_image_paths(text: &str) -> String {
    text.lines()
        .filter(|line| !(line.starts_with("[Image: source: ") && line.ends_with(']')))
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::harness::{HarnessManager, Scope};

    type TestResult = std::result::Result<(), Box<dyn std::error::Error>>;

    /// Six turns on one process, recorded in spike WG0-S1 (Claude Code 2.1.287, Haiku, with
    /// partial messages): a reply, a Read, a reply, two denied Reads, an interrupted turn, a reply.
    const SESSION: &str = include_str!("claude_code/session.jsonl");
    /// One turn of an import session, recorded in spike WG0-S5 (Sonnet, the app's tools through
    /// the bridge, without partial messages).
    const IMPORT: &str = include_str!("claude_code/import.jsonl");

    fn map_all(mapper: &mut StreamMapper, recording: &str) -> TestResultOf<Vec<AgentEvent>> {
        let mut events = Vec::new();
        for line in recording.lines().filter(|l| !l.is_empty()) {
            events.extend(mapper.map(&serde_json::from_str(line)?));
        }
        Ok(events)
    }

    type TestResultOf<T> = std::result::Result<T, Box<dyn std::error::Error>>;

    /// Splits a stream into turns, each summarized as the text, the tool calls and the end.
    fn turns(events: &[AgentEvent]) -> Vec<(String, Vec<String>, TurnOutcome, Option<f64>)> {
        let mut turns = Vec::new();
        let (mut text, mut tools) = (String::new(), Vec::new());
        for event in events {
            match event {
                AgentEvent::TextDelta { text: delta } => text.push_str(delta),
                AgentEvent::ToolCallStarted {
                    name, source, id, ..
                } => tools.push(format!("{name}:{source:?}:{}", &id[id.len() - 4..])),
                AgentEvent::ToolCallFinished { id, ok, .. } => {
                    tools.push(format!("{}={ok}", &id[id.len() - 4..]));
                }
                AgentEvent::TurnCompleted {
                    outcome, cost_usd, ..
                } => turns.push((
                    std::mem::take(&mut text),
                    std::mem::take(&mut tools),
                    *outcome,
                    *cost_usd,
                )),
                _ => {}
            }
        }
        turns
    }

    fn close_to(a: Option<f64>, b: f64) -> bool {
        a.is_some_and(|a| (a - b).abs() < 1e-9)
    }

    #[test]
    fn maps_a_recorded_session() -> TestResult {
        let mut mapper = StreamMapper::new(false, false);
        let events = map_all(&mut mapper, SESSION)?;

        let started: Vec<&AgentEvent> = events
            .iter()
            .filter(|e| matches!(e, AgentEvent::SessionStarted { .. }))
            .collect();
        assert_eq!(
            started,
            [&AgentEvent::SessionStarted {
                native_session_id: "b2969d29-9f2e-4b87-b425-1feaae899026".into(),
                model: "claude-haiku-4-5-20251001".into(),
            }]
        );
        assert!(
            !events.iter().any(|e| matches!(e, AgentEvent::Error { .. })),
            "allowed_warning is not an error"
        );
        assert!(
            events
                .iter()
                .any(|e| matches!(e, AgentEvent::ThinkingDelta { .. }))
        );

        let turns = turns(&events);
        assert_eq!(turns.len(), 6);
        assert_eq!(turns[0].0, "ZEBRA-42");
        assert!(close_to(turns[0].3, 0.002_652_3));
        assert_eq!(turns[1].0, "The word in the note is **HERON**.");
        assert_eq!(turns[1].1, ["Read:Harness:GCuD", "GCuD=true"]);
        assert!(close_to(turns[1].3, 0.005_772_2 - 0.002_652_3));
        assert_eq!(
            turns[3].1,
            [
                "Read:Harness:cijv",
                "cijv=false",
                "Read:Harness:RPyA",
                "RPyA=false"
            ]
        );
        // The interrupted turn: what streamed before the stop, nothing billed, no error event.
        assert_eq!(
            (&turns[4].0[..], turns[4].2, turns[4].3),
            ("1\n2\n3\n4", TurnOutcome::Interrupted, Some(0.0))
        );
        assert_eq!(turns[5].0, "still alive");
        assert!(
            turns
                .iter()
                .filter(|t| t.2 != TurnOutcome::Interrupted)
                .all(|t| t.2 == TurnOutcome::Completed)
        );

        let finished = events.iter().find_map(|e| match e {
            AgentEvent::ToolCallFinished { id, summary, .. } if id.ends_with("GCuD") => {
                Some(summary.clone())
            }
            _ => None,
        });
        assert_eq!(
            finished.as_deref(),
            Some("1\tThe word in this note is HERON.\n2\t")
        );
        let usage = events.iter().find_map(|e| match e {
            AgentEvent::TurnCompleted { usage, .. } => Some(*usage),
            _ => None,
        });
        assert_eq!(
            usage,
            Some(Usage {
                input_tokens: 10,
                output_tokens: 60,
                cache_read_tokens: 6223,
                cache_write_tokens: 860
            })
        );
        Ok(())
    }

    #[test]
    fn maps_a_recorded_turn_with_app_tools_and_no_streaming() -> TestResult {
        let mut mapper = StreamMapper::new(false, true);
        let events = map_all(&mut mapper, IMPORT)?;
        assert!(!events.iter().any(|e| matches!(e, AgentEvent::Error { .. })));
        let turns = turns(&events);
        assert_eq!(turns.len(), 1);
        // Two pairs of parallel calls, prefix removed: the UI sees Deck API names only.
        assert_eq!(
            turns[0].1,
            [
                "import_inspect:App:igYj",
                "deck_get_outline:App:68d7",
                "igYj=true",
                "68d7=true",
                "import_capture:App:RAq5",
                "deck_update:App:LCkz",
                "RAq5=true",
                "LCkz=true",
            ]
        );
        assert!(turns[0].0.starts_with("Six slides, shown by toggling"));
        assert!(turns[0].0.contains("תוכנית עבודה 2027"));
        assert!(close_to(turns[0].3, 0.053_915_4));
        Ok(())
    }

    #[test]
    fn stops_a_turn_without_the_app_tools() -> TestResult {
        let init: Value = serde_json::from_str(SESSION.lines().next().unwrap_or_default())?;
        let mut expecting = StreamMapper::new(false, true);
        let events = expecting.map(&init);
        assert!(matches!(events[0], AgentEvent::SessionStarted { .. }));
        assert!(matches!(
            events[1],
            AgentEvent::Error {
                kind: AgentErrorKind::ToolsUnavailable,
                recoverable: false,
                ..
            }
        ));
        // The check repeats on every turn's init; the session starts once.
        assert_eq!(expecting.map(&init).len(), 1);
        assert_eq!(StreamMapper::new(false, false).map(&init).len(), 1);
        Ok(())
    }

    #[test]
    fn cost_of_a_resumed_turn_is_known_when_the_app_says_what_was_spent() {
        let result = |total: f64| {
            json!({ "type": "result", "subtype": "success", "is_error": false, "result": "ok",
                    "total_cost_usd": total, "duration_ms": 900, "usage": {} })
        };
        // The conversation had cost 0.6693 when its last process ended; the total goes on from it.
        let mut mapper = StreamMapper::new(true, false);
        mapper.cost_baseline = Some(0.6693);
        mapper
            .map(&json!({ "type": "system", "subtype": "init", "session_id": "s", "model": "m" }));
        let costs: Vec<Option<f64>> = [0.8599, 0.8700]
            .into_iter()
            .flat_map(|total| mapper.map(&result(total)))
            .filter_map(|event| match event {
                AgentEvent::TurnCompleted { cost_usd, .. } => Some(cost_usd),
                _ => None,
            })
            .collect();
        assert_eq!(costs.len(), 2);
        assert!(close_to(costs[0], 0.1906));
        assert!(close_to(costs[1], 0.0101));
    }

    #[test]
    fn cost_of_the_first_resumed_turn_is_unknown() {
        let result = |total: f64| {
            json!({ "type": "result", "subtype": "success", "is_error": false,
                    "total_cost_usd": total, "duration_ms": 900, "usage": {} })
        };
        let mut mapper = StreamMapper::new(true, false);
        mapper
            .map(&json!({ "type": "system", "subtype": "init", "session_id": "s", "model": "m" }));
        let costs: Vec<Option<f64>> = [0.015, 0.016, 0.0185]
            .into_iter()
            .flat_map(|total| mapper.map(&result(total)))
            .filter_map(|e| match e {
                AgentEvent::TurnCompleted { cost_usd, .. } => Some(cost_usd),
                _ => None,
            })
            .collect();
        assert_eq!(costs.len(), 3);
        assert_eq!(costs[0], None);
        assert!(close_to(costs[1], 0.001));
        assert!(close_to(costs[2], 0.0025));
    }

    #[test]
    fn failed_turns_and_limits_become_errors() {
        let mut mapper = StreamMapper::new(false, false);
        let failed = mapper.map(&json!({
            "type": "result", "subtype": "success", "is_error": true, "api_error_status": 429,
            "result": "You've hit your limit", "total_cost_usd": 0, "duration_ms": 10, "usage": {}
        }));
        assert_eq!(
            failed,
            [
                AgentEvent::Error {
                    kind: AgentErrorKind::Quota,
                    message: "You've hit your limit".into(),
                    recoverable: true
                },
                AgentEvent::TurnCompleted {
                    outcome: TurnOutcome::Failed,
                    usage: Usage::default(),
                    cost_usd: Some(0.0),
                    duration_ms: 10
                }
            ]
        );
        let auth = mapper.map(&json!({
            "type": "result", "subtype": "error_during_execution", "is_error": true,
            "api_error_status": 401, "errors": ["Invalid API key", "Please run /login"]
        }));
        assert!(matches!(
            &auth[0],
            AgentEvent::Error { kind: AgentErrorKind::NotLoggedIn, message, .. }
                if message == "Invalid API key; Please run /login"
        ));
        let limited = mapper.map(&json!({
            "type": "rate_limit_event",
            "rate_limit_info": { "status": "rejected", "resetsAt": 1_791_496_800,
                                 "rateLimitType": "five_hour" }
        }));
        assert!(matches!(
            &limited[..],
            [AgentEvent::Error { kind: AgentErrorKind::Quota, message, .. }]
                if message.contains("five_hour") && message.contains("1791496800")
        ));
        let subagent = mapper.map(&json!({
            "type": "stream_event", "parent_tool_use_id": "toolu_1",
            "event": { "type": "content_block_delta", "delta": { "type": "text_delta", "text": "x" } }
        }));
        assert!(subagent.is_empty());
    }

    #[test]
    fn summaries_are_short() {
        let long = "א".repeat(SUMMARY_CHARS + 10);
        let summary = summarize(&json!([{ "type": "text", "text": long }, { "type": "image" }]));
        assert_eq!(summary.chars().count(), SUMMARY_CHARS + 1);
        assert!(summary.ends_with('…'));
        assert_eq!(
            summarize(&json!([{ "type": "text", "text": "ok" }, { "type": "image" }])),
            "ok\n[image]"
        );
    }

    /// The shape recorded from the CLI (2.1.287) for a tool result with a picture.
    #[test]
    fn summaries_leave_out_where_the_cli_saved_an_image() {
        let path = r"[Image: source: C:\Users\someone\.claude\projects\s\tool-results\blob.png]";
        assert_eq!(
            summarize(&json!([
                { "type": "text", "text": "{\"ok\":true}" },
                { "type": "image" },
                { "type": "text", "text": path },
            ])),
            "{\"ok\":true}\n[image]"
        );
        assert_eq!(summarize(&json!(format!("done\n{path}"))), "done");
    }

    /// Recorded: `--resume` with an id the CLI does not have. It answers before any message,
    /// without an `init`, and exits with code 1.
    #[test]
    fn a_missing_conversation_fails_the_resume() -> TestResult {
        let line: Value = serde_json::from_str(include_str!("claude_code/resume-missing.jsonl"))?;
        assert_eq!(
            StreamMapper::new(true, false).map(&line),
            [AgentEvent::Error {
                kind: AgentErrorKind::ResumeFailed,
                message: "No conversation found with session ID: \
                          00000000-0000-4000-8000-000000000000"
                    .into(),
                recoverable: false,
            }]
        );
        // The same line in a session that was not resumed is an ordinary failed turn.
        let fresh = StreamMapper::new(false, false).map(&line);
        assert!(matches!(
            &fresh[..],
            [
                AgentEvent::Error {
                    kind: AgentErrorKind::TurnFailed,
                    ..
                },
                AgentEvent::TurnCompleted {
                    outcome: TurnOutcome::Failed,
                    ..
                }
            ]
        ));
        Ok(())
    }

    fn files() -> SessionFiles {
        SessionFiles::new(Path::new("/s"))
    }

    fn strings(args: &[OsString]) -> Vec<String> {
        args.iter()
            .map(|a| a.to_string_lossy().replace('\\', "/"))
            .collect()
    }

    #[test]
    fn command_line_follows_the_spec() {
        let mut config = SessionConfig::new(Scope::Deck, "", PathBuf::from("/s"));
        config.tool_endpoint = Some(ToolEndpoint {
            url: "http://127.0.0.1:5000/mcp/k".into(),
            token: "t".into(),
        });
        config.model = Some("sonnet".into());
        config.effort = Some("high".into());
        config.resume = Some("b2969d29-9f2e-4b87-b425-1feaae899026".into());
        assert_eq!(
            strings(&args(&config, &files())).join(" "),
            "-p --input-format stream-json --output-format stream-json --verbose \
             --include-partial-messages --restricted --disable-slash-commands \
             --strict-mcp-config --mcp-config /s/mcp.json \
             --tools Read,Grep,WebSearch,WebFetch \
             --allowedTools Read Grep WebSearch WebFetch mcp__slidr__* \
             --permission-mode dontAsk --system-prompt-file /s/system.md \
             --model sonnet --effort high --resume b2969d29-9f2e-4b87-b425-1feaae899026"
        );
    }

    #[test]
    fn command_line_without_tool_endpoint_or_web() {
        let mut config = SessionConfig::new(Scope::Deck, "", PathBuf::from("/s"));
        config.web_access = false;
        assert_eq!(
            strings(&args(&config, &files())).join(" "),
            "-p --input-format stream-json --output-format stream-json --verbose \
             --include-partial-messages --restricted --disable-slash-commands \
             --strict-mcp-config --tools Read,Grep --allowedTools Read Grep \
             --permission-mode dontAsk --system-prompt-file /s/system.md"
        );
    }

    #[test]
    fn values_never_read_as_flags() {
        for good in ["sonnet", "claude-opus-4-5[1m]", "b2969d29-9f2e-4b87"] {
            assert!(check_value("model", Some(good)).is_ok(), "{good}");
        }
        for bad in ["", "--dangerously-skip-permissions", "a b", "x;y"] {
            assert!(check_value("model", Some(bad)).is_err(), "{bad}");
        }
    }

    #[tokio::test]
    async fn writes_the_session_folder() -> TestResult {
        let dir = tempfile::tempdir()?;
        let files = SessionFiles::new(dir.path());
        let mut config = SessionConfig::new(Scope::Deck, "Build slides.", dir.path().into());
        config.tool_endpoint = Some(ToolEndpoint {
            url: "http://127.0.0.1:5000/mcp/k".into(),
            token: "secret".into(),
        });
        files.write(&config).await?;
        assert!(files.attachments.is_dir());
        assert_eq!(std::fs::read_to_string(&files.system)?, "Build slides.");
        let tools: Value = serde_json::from_str(&std::fs::read_to_string(&files.tools)?)?;
        assert_eq!(
            tools,
            json!({ "mcpServers": { "slidr": {
                "type": "http",
                "url": "http://127.0.0.1:5000/mcp/k",
                "headers": { "Authorization": "Bearer secret" } } } })
        );
        assert_eq!(TOOL_PREFIX, format!("mcp__{TOOL_SERVER}__"));
        config.tool_endpoint = None;
        files.write(&config).await?;
        assert!(!files.tools.exists(), "no token left behind");
        Ok(())
    }

    #[test]
    fn user_message_carries_context_images_and_text() {
        let turn = UserTurn {
            text: "Make it blue".into(),
            context: Some("<slidr_context>scope: slide</slidr_context>".into()),
            images: vec![crate::harness::ImageAttachment {
                media_type: "image/png".into(),
                data: "iVBORw0KGgo=".into(),
            }],
        };
        assert_eq!(
            user_message(&turn),
            json!({ "type": "user", "message": { "role": "user", "content": [
                { "type": "text", "text": "<slidr_context>scope: slide</slidr_context>" },
                { "type": "image", "source": {
                    "type": "base64", "media_type": "image/png", "data": "iVBORw0KGgo=" } },
                { "type": "text", "text": "Make it blue" }
            ] } })
        );
    }

    /// The adapter driving `claude_code/fake-cli.mjs` under Node instead of the real CLI.
    fn stand_in() -> ClaudeCodeHarness {
        ClaudeCodeHarness {
            program: "node".into(),
            prefix: vec![
                concat!(
                    env!("CARGO_MANIFEST_DIR"),
                    "/src/harness/claude_code/fake-cli.mjs"
                )
                .into(),
            ],
        }
    }

    type Events = tokio::sync::mpsc::UnboundedReceiver<AgentEvent>;

    /// Events up to and including the first one `last` accepts.
    async fn until(
        events: &mut Events,
        last: impl Fn(&AgentEvent) -> bool,
    ) -> TestResultOf<Vec<AgentEvent>> {
        let mut seen = Vec::new();
        loop {
            let event = timeout(Duration::from_secs(20), events.recv())
                .await?
                .ok_or("the event stream ended")?;
            let done = last(&event);
            seen.push(event);
            if done {
                return Ok(seen);
            }
        }
    }

    fn turn_end(event: &AgentEvent) -> bool {
        matches!(event, AgentEvent::TurnCompleted { .. })
    }

    fn exit(event: &AgentEvent) -> bool {
        matches!(event, AgentEvent::Exited { .. })
    }

    fn text_delta(event: &AgentEvent) -> bool {
        matches!(event, AgentEvent::TextDelta { .. })
    }

    /// Spawn, stdin, stdout, interrupt, close, the kill fallback and a crash, through the
    /// manager, against a stand-in process that speaks the recorded protocol.
    #[tokio::test(flavor = "multi_thread")]
    async fn drives_a_cli_process() -> TestResult {
        let root = tempfile::tempdir()?;
        let manager = HarnessManager::new(root.path().into(), vec![Arc::new(stand_in())]);
        let (sender, mut events) = tokio::sync::mpsc::unbounded_channel();
        let start = |thread: &'static str| {
            let sender = sender.clone();
            let config = SessionConfig::new(Scope::Deck, "Build slides.", PathBuf::new());
            manager.start("claude-code", thread, config, move |event| {
                let _ = sender.send(event);
            })
        };

        // A turn.
        let id = start("deck/a").await?;
        manager.send(&id, UserTurn::text("hello")).await?;
        assert_eq!(
            until(&mut events, turn_end).await?,
            [
                AgentEvent::SessionStarted {
                    native_session_id: "fake-session".into(),
                    model: "fake-model".into()
                },
                AgentEvent::TextDelta {
                    text: "echo: hello".into()
                },
                AgentEvent::TurnCompleted {
                    outcome: TurnOutcome::Completed,
                    usage: Usage {
                        input_tokens: 3,
                        output_tokens: 4,
                        ..Usage::default()
                    },
                    cost_usd: Some(0.01),
                    duration_ms: 5
                }
            ]
        );
        // It ran in attachments/, next to its system prompt, with the isolation flags and
        // without the variables of the Claude Code session these tests may run under.
        let dir = root.path().join("deck").join("a");
        let probe: Value = serde_json::from_str(&std::fs::read_to_string(
            dir.join("attachments/probe.json"),
        )?)?;
        assert_eq!(probe["leaked"], json!([]));
        assert!(
            probe["argv"]
                .as_array()
                .is_some_and(|argv| argv.contains(&json!("--restricted")))
        );
        assert_eq!(
            std::fs::read_to_string(dir.join("system.md"))?,
            "Build slides."
        );

        // An interrupt over stdin ends the turn; the process takes the next one.
        manager.send(&id, UserTurn::text("stream")).await?;
        until(&mut events, text_delta).await?;
        manager.interrupt(&id).await?;
        let turn = until(&mut events, turn_end).await?;
        assert!(matches!(
            turn.last(),
            Some(AgentEvent::TurnCompleted {
                outcome: TurnOutcome::Interrupted,
                cost_usd: Some(0.0),
                ..
            })
        ));
        manager.send(&id, UserTurn::text("again")).await?;
        let turn = until(&mut events, turn_end).await?;
        assert!(matches!(
            turn.last(),
            Some(AgentEvent::TurnCompleted {
                outcome: TurnOutcome::Completed,
                ..
            })
        ));

        // Close during a turn: the turn is interrupted, then EOF ends the process cleanly.
        manager.send(&id, UserTurn::text("stream")).await?;
        until(&mut events, text_delta).await?;
        manager.close(&id).await?;
        let rest = until(&mut events, exit).await?;
        assert!(rest.iter().any(|e| matches!(
            e,
            AgentEvent::TurnCompleted {
                outcome: TurnOutcome::Interrupted,
                ..
            }
        )));
        assert_eq!(rest.last(), Some(&AgentEvent::Exited { code: Some(0) }));
        assert!(!rest.iter().any(|e| matches!(e, AgentEvent::Error { .. })));

        // A turn that ignores its interrupt: after a second the process is ended.
        let id = start("deck/b").await?;
        manager.send(&id, UserTurn::text("hang")).await?;
        until(&mut events, text_delta).await?;
        let asked = Instant::now();
        manager.interrupt(&id).await?;
        let rest = until(&mut events, exit).await?;
        assert!(asked.elapsed() >= INTERRUPT_GRACE);
        let tail: Vec<&AgentEvent> = rest.iter().rev().take(3).rev().collect();
        assert!(matches!(
            &tail[..],
            [
                AgentEvent::TurnCompleted {
                    outcome: TurnOutcome::Interrupted,
                    cost_usd: None,
                    ..
                },
                AgentEvent::Error {
                    kind: AgentErrorKind::ProcessExited,
                    recoverable: false,
                    ..
                },
                AgentEvent::Exited { .. }
            ]
        ));
        let after = manager.send(&id, UserTurn::text("hello")).await;
        assert_eq!(
            after.err().map(|e| e.kind),
            Some(AgentErrorKind::ProcessExited)
        );
        manager.close(&id).await?;

        // A crash mid-turn: the error carries stderr, and the turn still ends.
        let id = start("deck/c").await?;
        manager.send(&id, UserTurn::text("crash")).await?;
        let rest = until(&mut events, exit).await?;
        assert!(matches!(
            &rest[..],
            [
                AgentEvent::SessionStarted { .. },
                AgentEvent::Error { kind: AgentErrorKind::ProcessExited, message, .. },
                AgentEvent::TurnCompleted { outcome: TurnOutcome::Failed, .. },
                AgentEvent::Exited { code: Some(3) }
            ] if message.contains("crashing on purpose")
        ));
        manager.close(&id).await?;
        Ok(())
    }

    #[tokio::test]
    async fn a_missing_program_is_not_installed() -> TestResult {
        let harness = ClaudeCodeHarness {
            program: "slidr-no-such-program".into(),
            prefix: Vec::new(),
        };
        let status = harness.probe().await;
        assert_eq!(status.state, HarnessState::NotInstalled);
        let dir = tempfile::tempdir()?;
        let config = SessionConfig::new(Scope::Deck, "", dir.path().into());
        let (sink, _events) = EventSink::channel();
        let started = harness.start(config, sink).await;
        assert_eq!(
            started.err().map(|e| e.kind),
            Some(AgentErrorKind::NotInstalled)
        );
        Ok(())
    }

    /// The real CLI, on the owner's subscription: probe; a turn; a turn interrupted at its first
    /// text; close; resume in a new process and ask about the first turn; close. Haiku, under
    /// a cent. Run: `cargo test -p slidr real_cli -- --ignored --nocapture`.
    #[tokio::test(flavor = "multi_thread")]
    #[ignore = "runs the real Claude Code CLI on the owner's subscription"]
    async fn real_cli_turns_interrupt_and_resume() -> TestResult {
        use tokio::sync::mpsc;

        let harness = Arc::new(ClaudeCodeHarness::new());
        let status = harness.probe().await;
        println!("probe: {status:?}");
        assert_eq!(status.state, HarnessState::Ready);

        let root = tempfile::tempdir()?;
        let manager = HarnessManager::new(root.path().into(), vec![harness]);
        let (sender, mut events) = mpsc::unbounded_channel();
        let start = |resume: Option<String>, sender: mpsc::UnboundedSender<AgentEvent>| {
            let mut config = SessionConfig::new(
                Scope::Deck,
                "You are a terse test agent. Follow instructions exactly.",
                PathBuf::new(),
            );
            config.model = Some("haiku".into());
            config.web_access = false;
            config.resume = resume;
            let manager = &manager;
            async move {
                manager
                    .start("claude-code", "real/cli", config, move |event| {
                        println!("  {}", serde_json::to_string(&event).unwrap_or_default());
                        let _ = sender.send(event);
                    })
                    .await
            }
        };
        async fn turn_end(events: &mut mpsc::UnboundedReceiver<AgentEvent>) -> Option<AgentEvent> {
            while let Some(event) = tokio::time::timeout(Duration::from_secs(90), events.recv())
                .await
                .ok()
                .flatten()
            {
                if matches!(event, AgentEvent::TurnCompleted { .. }) {
                    return Some(event);
                }
            }
            None
        }

        let id = start(None, sender.clone()).await?;
        println!("turn 1");
        manager
            .send(&id, UserTurn::text("Reply with exactly: pong"))
            .await?;
        let end = turn_end(&mut events).await;
        assert!(matches!(
            end,
            Some(AgentEvent::TurnCompleted {
                outcome: TurnOutcome::Completed,
                cost_usd: Some(_),
                ..
            })
        ));

        println!("turn 2, interrupted after the first text");
        manager
            .send(
                &id,
                UserTurn::text("Count from 1 to 300, one number per line, nothing else."),
            )
            .await?;
        loop {
            match tokio::time::timeout(Duration::from_secs(60), events.recv()).await {
                Ok(Some(AgentEvent::TextDelta { .. })) => break,
                Ok(Some(_)) => {}
                _ => return Err("no text before the interrupt".into()),
            }
        }
        manager.interrupt(&id).await?;
        let end = turn_end(&mut events).await;
        assert!(matches!(
            end,
            Some(AgentEvent::TurnCompleted {
                outcome: TurnOutcome::Interrupted,
                ..
            })
        ));
        let native = manager
            .native_session_id(&id)
            .await?
            .ok_or("no session id")?;
        manager.close(&id).await?;

        println!("resume {native} in a new process");
        let id = start(Some(native.clone()), sender.clone()).await?;
        manager
            .send(
                &id,
                UserTurn::text("What was the first thing I asked you to reply? Quote it only."),
            )
            .await?;
        let end = turn_end(&mut events).await;
        assert!(matches!(
            end,
            Some(AgentEvent::TurnCompleted {
                outcome: TurnOutcome::Completed,
                cost_usd: None,
                ..
            })
        ));
        assert_eq!(manager.native_session_id(&id).await?, Some(native));
        manager.close(&id).await?;
        Ok(())
    }

    /// The real CLI with the app's tools, on the owner's subscription: a session whose tool
    /// endpoint is the bridge, and one tool that a closure answers in place of the webview. What
    /// ADR-002 warns about is what it checks: the CLI lists the tools (no `tools_unavailable`),
    /// the model calls one, the call arrives under the session's key and the tool's own name,
    /// and the answer the model reads, text and picture, is the one that went back through the
    /// bridge. Haiku, about a cent.
    /// Run: `cargo test -p slidr real_cli_calls_a_tool -- --ignored --nocapture`.
    #[tokio::test(flavor = "multi_thread")]
    #[ignore = "runs the real Claude Code CLI on the owner's subscription"]
    async fn real_cli_calls_a_tool_through_the_bridge() -> TestResult {
        use crate::tool_bridge::{Content, ToolBridge, ToolCall, ToolDef, ToolReply};

        // A word the model cannot know without the tool's answer.
        const CODE_WORD: &str = "HERON-4821";
        /// The app's 32 px icon, base64: a picture for the answer to carry.
        const PICTURE: &str = include_str!("claude_code/icon-32.png.b64");

        let bridge = ToolBridge::new();
        let webview = Arc::downgrade(&bridge);
        let calls = Arc::new(Mutex::new(Vec::<ToolCall>::new()));
        let received = Arc::clone(&calls);
        bridge.connect(move |call| {
            let reply = ToolReply {
                content: vec![
                    Content::Text {
                        text: json!({ "codeWord": CODE_WORD, "deck": call.input["deck"] })
                            .to_string(),
                    },
                    Content::Image {
                        data: PICTURE.trim().to_owned(),
                        mime_type: "image/png".into(),
                    },
                ],
                is_error: false,
            };
            let answered = webview
                .upgrade()
                .is_some_and(|bridge| bridge.reply(&call.call_id, reply));
            lock(&received).push(call);
            answered
        });
        let tool: ToolDef = serde_json::from_value(json!({
            "name": "deck_code_word",
            "description": "Returns the code word of a deck.",
            "inputSchema": {
                "type": "object",
                "properties": { "deck": { "type": "string", "description": "The deck's name." } },
                "required": ["deck"]
            }
        }))?;
        let endpoint = bridge.open(vec![tool]).await?;

        let root = tempfile::tempdir()?;
        let manager =
            HarnessManager::new(root.path().into(), vec![Arc::new(ClaudeCodeHarness::new())]);
        let mut config = SessionConfig::new(
            Scope::Deck,
            "You are a terse test agent. Follow instructions exactly.",
            PathBuf::new(),
        );
        config.model = Some("haiku".into());
        config.web_access = false;
        config.tool_endpoint = Some(ToolEndpoint {
            url: endpoint.url.clone(),
            token: endpoint.token.clone(),
        });
        let (sender, mut events) = tokio::sync::mpsc::unbounded_channel();
        let id = manager
            .start("claude-code", "real/bridge", config, move |event| {
                println!("  {}", serde_json::to_string(&event).unwrap_or_default());
                let _ = sender.send((Instant::now(), event));
            })
            .await?;
        // The adapter pointed the CLI at the bridge under the server name its tool prefix names.
        let written: Value = serde_json::from_str(&std::fs::read_to_string(
            root.path().join("real").join("bridge").join("mcp.json"),
        )?)?;
        assert_eq!(written["mcpServers"][TOOL_SERVER]["url"], endpoint.url);

        manager
            .send(
                &id,
                UserTurn::text(
                    "Call the deck_code_word tool with deck set to \"plan\". Then reply with \
                     exactly the code word it returned and nothing else.",
                ),
            )
            .await?;
        let mut seen = Vec::new();
        loop {
            let (at, event) = timeout(Duration::from_secs(120), events.recv())
                .await?
                .ok_or("the event stream ended")?;
            let end = matches!(event, AgentEvent::TurnCompleted { .. });
            seen.push((at, event));
            if end {
                break;
            }
        }
        manager.close(&id).await?;

        let errors: Vec<&AgentEvent> = seen
            .iter()
            .map(|(_, event)| event)
            .filter(|event| matches!(event, AgentEvent::Error { .. }))
            .collect();
        assert!(errors.is_empty(), "{errors:?}");
        let started = seen.iter().find_map(|(at, event)| match event {
            AgentEvent::ToolCallStarted {
                id,
                name,
                source: ToolSource::App,
                input,
            } if name == "deck_code_word" => Some((*at, id.clone(), input.clone())),
            _ => None,
        });
        let (called_at, call_id, input) = started.ok_or("the model did not call the tool")?;
        assert_eq!(input["deck"], "plan");
        let finished = seen.iter().find_map(|(at, event)| match event {
            AgentEvent::ToolCallFinished { id, ok, summary } if *id == call_id => {
                Some((*at, *ok, summary.clone()))
            }
            _ => None,
        });
        let (answered_at, ok, summary) = finished.ok_or("the call did not finish")?;
        println!(
            "tool call as the CLI's stream shows it: {:?} from the call to its result",
            answered_at.duration_since(called_at)
        );
        assert!(ok && summary.contains(CODE_WORD), "{summary}");
        // The picture arrived. The CLI saves it under its own folder and adds a line that says
        // where (ADR-002 finding 4), so the picture is not the last part.
        assert!(summary.contains("\n[image]"), "{summary}");

        // It went through the bridge: once, under the session's key and the tool's own name.
        let calls = lock(&calls);
        assert_eq!(calls.len(), 1, "{calls:?}");
        assert_eq!(calls[0].session_key, endpoint.session_key);
        assert_eq!(calls[0].name, "deck_code_word");
        assert_eq!(calls[0].input["deck"], "plan");

        let reply: String = seen
            .iter()
            .filter_map(|(_, event)| match event {
                AgentEvent::TextDelta { text } => Some(text.as_str()),
                _ => None,
            })
            .collect();
        assert!(reply.contains(CODE_WORD), "{reply}");
        match seen.last() {
            Some((
                _,
                AgentEvent::TurnCompleted {
                    outcome: TurnOutcome::Completed,
                    cost_usd,
                    ..
                },
            )) => println!("cost: {cost_usd:?} USD"),
            other => return Err(format!("the turn did not complete: {other:?}").into()),
        }
        Ok(())
    }

    /// The real CLI asked to resume a conversation it does not have. Free: it fails before any
    /// message is sent.
    #[tokio::test(flavor = "multi_thread")]
    #[ignore = "runs the real Claude Code CLI"]
    async fn real_cli_resume_of_an_unknown_conversation() -> TestResult {
        let root = tempfile::tempdir()?;
        let manager =
            HarnessManager::new(root.path().into(), vec![Arc::new(ClaudeCodeHarness::new())]);
        let (sender, mut events) = tokio::sync::mpsc::unbounded_channel();
        let mut config = SessionConfig::new(Scope::Deck, "", PathBuf::new());
        config.resume = Some("00000000-0000-4000-8000-000000000000".into());
        manager
            .start("claude-code", "real/resume", config, move |event| {
                let _ = sender.send(event);
            })
            .await?;
        let mut seen = Vec::new();
        while let Ok(Some(event)) =
            tokio::time::timeout(Duration::from_secs(30), events.recv()).await
        {
            println!("  {}", serde_json::to_string(&event).unwrap_or_default());
            let end = matches!(event, AgentEvent::Exited { .. });
            seen.push(event);
            if end {
                break;
            }
        }
        assert!(matches!(
            &seen[..],
            [
                AgentEvent::Error {
                    kind: AgentErrorKind::ResumeFailed,
                    ..
                },
                AgentEvent::Exited { code: Some(1) }
            ]
        ));
        Ok(())
    }
}
