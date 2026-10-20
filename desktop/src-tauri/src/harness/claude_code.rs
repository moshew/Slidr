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
#[cfg(test)]
use tokio::time::Instant;
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::{Child, ChildStderr, ChildStdin, ChildStdout},
    sync::{Notify, watch},
    time::timeout,
};

use crate::harness::{
    AgentError, AgentErrorKind, AgentEvent, AgentHarness, AgentSession, Capabilities, EventSink,
    HarnessDescriptor, HarnessState, HarnessStatus, Result, SessionConfig, ToolEndpoint,
    ToolSource, TurnOutcome, UserTurn,
};

const PROGRAM: &str = "claude";
/// The tool server's name in `mcp.json`. The CLI names its tools `mcp__<server>__<tool>`.
const TOOL_SERVER: &str = "slidr";
const TOOL_PREFIX: &str = "mcp__slidr__";
/// Built-in tools, an exact list (`--tools`): reading the attachments, and the web (AID-07).
const FILE_TOOLS: [&str; 2] = ["Read", "Grep"];
const WEB_TOOLS: [&str; 2] = ["WebSearch", "WebFetch"];
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
/// The CLI does not hand the model a tool result of more than 25,000 tokens unless this variable
/// says otherwise: it saves the result to a file under its own folder and tells the model to
/// grep it (measured: `real_cli_reads_a_long_tool_result`). A slide is one line of JSON, which
/// can be neither grepped nor read in parts, so a slide of some 70,000 characters (an imported
/// one that stayed `html`, with its markup and styles) could not be read at all. A hundred
/// thousand tokens is half the context of the smallest model the adapter offers: room for any
/// slide the app can draw, and still a limit.
const TOOL_OUTPUT_ENV: (&str, &str) = ("MAX_MCP_OUTPUT_TOKENS", "100000");
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
        let program = if self.program == PROGRAM {
            crate::harness::setup::claude_program().into_os_string()
        } else {
            self.program.clone()
        };
        let mut command = std::process::Command::new(program);
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
            models: Vec::new(),
            default_model: None,
            effort_levels: Vec::new(),
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
            && (effort.is_empty() || !effort.chars().all(|c| c.is_ascii_lowercase() || c == '_'))
        {
            return Err(AgentError::invalid_input("invalid effort level"));
        }
        let files = SessionFiles::new(&config.workdir);
        files.write(&config).await?;

        let mut command = tokio::process::Command::from(self.command());
        command
            .args(args(&config, &files))
            .env(TOOL_TIMEOUT_ENV.0, TOOL_TIMEOUT_ENV.1)
            .env(TOOL_OUTPUT_ENV.0, TOOL_OUTPUT_ENV.1)
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
            closing: AtomicBool::new(false),
            stopped_by_kill: AtomicBool::new(false),
            explained: AtomicBool::new(false),
            kill: Notify::new(),
        });
        let (exited_tx, exited) = watch::channel(false);
        let mapper = StreamMapper::new(config.resume.is_some(), config.tool_endpoint.is_some());
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
    let was_busy = shared.busy.send_replace(false);
    let closing = shared.closing.load(Ordering::SeqCst);
    if was_busy && shared.stopped_by_kill.load(Ordering::SeqCst) {
        sink.emit(AgentEvent::TurnCompleted {
            outcome: TurnOutcome::Interrupted,
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
    // For the diagnostics log (AGT-08), which wants what the CLI said and not what was made of
    // it: the lines mapped to nothing below (retries, statuses, denials) are in it too.
    sink.raw(line);
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
            // A message the CLI writes itself when the API fails ("API Error: …"). It is not the
            // model's reply; the `result` that follows carries the same words as the error.
            Some("assistant") if line["is_api_error_message"] == true => Vec::new(),
            Some("assistant") => self.assistant(&line["message"]),
            Some("user") => tool_results(&line["message"]),
            Some("result") => self.result(line),
            Some("rate_limit_event") => rate_limit(&line["rate_limit_info"]),
            // system/status, system/thinking_tokens, system/api_retry (the CLI tries the API up
            // to ten times, over about three minutes, before it gives a turn up),
            // system/permission_denied (the denial also comes back as a failed tool result),
            // control_response: for the diagnostics log, which gets every line as it is.
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
        events.push(AgentEvent::TurnCompleted { outcome });
        self.current_message = None;
        self.streamed.clear();
        events
    }
}

/// Tool results come back as a `user` message the CLI writes itself.
fn tool_results(message: &Value) -> Vec<AgentEvent> {
    blocks(message)
        .filter(|block| block["type"] == "tool_result")
        .map(|block| {
            let summary = summarize(&block["content"]);
            AgentEvent::ToolCallFinished {
                id: text(&block["tool_use_id"]),
                // A result past the CLI's limit is not marked as an error, and is one: the
                // model was handed a sentence in its place.
                ok: !block["is_error"].as_bool().unwrap_or(false) && !summary.starts_with(TOO_LONG),
                summary,
            }
        })
        .collect()
}

/// The error of a failed turn: the API's status says what kind (CHT-U09).
fn turn_error(line: &Value) -> AgentEvent {
    let kind = match line["api_error_status"].as_u64() {
        Some(401 | 403) => AgentErrorKind::NotLoggedIn,
        Some(429) => AgentErrorKind::Quota,
        // The turn ended on the API and there is no status: no answer ever came. That is the
        // connection (refused, no name resolution, a proxy), after the CLI's own retries.
        None if line["terminal_reason"] == "api_error" => AgentErrorKind::Network,
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
        Value::String(text) => without_saved_paths(text),
        Value::Array(parts) => parts
            .iter()
            .filter_map(|part| match part["type"].as_str() {
                Some("text") => part["text"]
                    .as_str()
                    .map(without_saved_paths)
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

/// How the CLI begins what it hands the model in place of a tool result that is past
/// `TOOL_OUTPUT_ENV`: "Error: result (139,440 characters across 1 line) exceeds maximum allowed
/// tokens. Output has been saved to …".
const TOO_LONG: &str = "Error: result (";
/// What comes before the path of a file the CLI saved a long result in, in its two wordings.
const SAVED_TO: [&str; 2] = [". Output has been saved to ", ". Full output saved to: "];

/// The CLI saves what it does not hand to the model as it came (every image a tool returns; a
/// result past its limits) under the user's own folder, and says where. The path holds the user's
/// name, and the summary goes to the chat and to the transcript kept with the deck: what names a
/// path is dropped, and of a result that was saved only the sentence that says so is kept.
fn without_saved_paths(text: &str) -> String {
    let text = text.strip_prefix("<persisted-output>\n").unwrap_or(text);
    let kept = match SAVED_TO.iter().filter_map(|mark| text.find(mark)).min() {
        Some(at) => &text[..=at],
        None => text,
    };
    kept.lines()
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
    fn turns(events: &[AgentEvent]) -> Vec<(String, Vec<String>, TurnOutcome)> {
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
                AgentEvent::TurnCompleted { outcome } => turns.push((
                    std::mem::take(&mut text),
                    std::mem::take(&mut tools),
                    *outcome,
                )),
                _ => {}
            }
        }
        turns
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
        assert_eq!(turns[1].0, "The word in the note is **HERON**.");
        assert_eq!(turns[1].1, ["Read:Harness:GCuD", "GCuD=true"]);
        assert_eq!(
            turns[3].1,
            [
                "Read:Harness:cijv",
                "cijv=false",
                "Read:Harness:RPyA",
                "RPyA=false"
            ]
        );
        // The interrupted turn: what streamed before the stop, no error event.
        assert_eq!(
            (&turns[4].0[..], turns[4].2),
            ("1\n2\n3\n4", TurnOutcome::Interrupted)
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
    fn failed_turns_and_limits_become_errors() {
        let mut mapper = StreamMapper::new(false, false);
        let failed = mapper.map(&json!({
            "type": "result", "subtype": "success", "is_error": true, "api_error_status": 429,
            "result": "You've hit your limit"
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

    /// What the CLI (2.1.287) wrote when its API was behind a proxy that refused every
    /// connection, recorded on 2026-10-04: ten `api_retry` lines over 175 seconds (the first and
    /// the last are kept), then a message of its own with the error as its text, then the result.
    const NETWORK_FAILURE: &str = include_str!("claude_code/network-failure.jsonl");

    #[test]
    fn a_turn_that_never_reached_the_api_is_a_network_error_and_not_a_reply() -> TestResult {
        let mut mapper = StreamMapper::new(false, false);
        mapper
            .map(&json!({ "type": "system", "subtype": "init", "session_id": "s", "model": "m" }));
        let events = map_all(&mut mapper, NETWORK_FAILURE)?;
        // The CLI's own "API Error: …" message is not text of the reply, and its retries are
        // nothing the chat is told: an error, and the turn's end.
        assert_eq!(events.len(), 2, "{events:?}");
        assert!(matches!(
            &events[0],
            AgentEvent::Error { kind: AgentErrorKind::Network, message, recoverable: true }
                if message.contains("ECONNREFUSED")
        ));
        assert!(matches!(
            &events[1],
            AgentEvent::TurnCompleted {
                outcome: TurnOutcome::Failed,
            }
        ));
        // A failure the API answered with is still the turn's own, whatever ended it.
        let refused = mapper.map(&json!({
            "type": "result", "subtype": "success", "is_error": true, "api_error_status": 400,
            "terminal_reason": "api_error", "result": "API Error: 400 prompt is too long"
        }));
        assert!(matches!(
            &refused[0],
            AgentEvent::Error {
                kind: AgentErrorKind::TurnFailed,
                ..
            }
        ));
        Ok(())
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

    /// Recorded from the real CLI (`real_cli_reads_a_long_tool_result`, before the limits were
    /// raised, and with one of the two raised).
    #[test]
    fn a_result_the_cli_saved_instead_of_handing_over_is_a_failed_call_without_its_path() {
        let folder = r"C:\Users\someone\.claude\projects\C--thread-attachments\tool-results";
        let past_tokens = format!(
            "Error: result (139,440 characters across 1 line) exceeds maximum allowed tokens. \
             Output has been saved to {folder}\\mcp-slidr-slide_get-1791225016399.txt.\n\
             Format: Plain text\n- For targeted searches (find a string): use grep on the file."
        );
        let past_characters = format!(
            "<persisted-output>\nOutput too large (159.7KB). Full output saved to: \
             {folder}\\toolu_01.json\n\nPreview (first 2KB):\n[\n  {{"
        );
        let result = |content: &str| {
            tool_results(&json!({ "content": [
                { "type": "tool_result", "tool_use_id": "t1", "content": content }
            ] }))
        };
        assert_eq!(
            result(&past_tokens),
            [AgentEvent::ToolCallFinished {
                id: "t1".into(),
                ok: false,
                summary: "Error: result (139,440 characters across 1 line) exceeds maximum \
                          allowed tokens."
                    .into(),
            }]
        );
        assert_eq!(
            result(&past_characters),
            [AgentEvent::ToolCallFinished {
                id: "t1".into(),
                ok: true,
                summary: "Output too large (159.7KB).".into(),
            }]
        );
        // A result that came whole is as it was, also one that speaks of saving.
        assert_eq!(
            result("{\"saved\":true}"),
            [AgentEvent::ToolCallFinished {
                id: "t1".into(),
                ok: true,
                summary: "{\"saved\":true}".into(),
            }]
        );
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
        // The CLI's own limits on a tool call, both below what the app's tools need: how long a
        // call may take, and how long a result the model is handed whole.
        assert_eq!(
            probe["limits"],
            json!({ "MCP_TOOL_TIMEOUT": "600000", "MAX_MCP_OUTPUT_TOKENS": "100000" })
        );
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
                },
            )) => {}
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

    /// Events of a real session up to the first one `last` accepts; a real turn takes a while.
    async fn real_until(
        events: &mut Events,
        last: impl Fn(&AgentEvent) -> bool,
    ) -> TestResultOf<Vec<AgentEvent>> {
        let mut seen = Vec::new();
        loop {
            let event = timeout(Duration::from_secs(120), events.recv())
                .await?
                .ok_or("the event stream ended")?;
            let done = last(&event);
            seen.push(event);
            if done {
                return Ok(seen);
            }
        }
    }

    /// The real CLI given a tool result far longer than it takes by default. A slide that an
    /// import kept as `html` carries its whole markup, `slide_get` returns the slide whole, and
    /// the brief of a session sends the agent to exactly that call for a slide too long for the
    /// brief. The tool here answers with about 150,000 characters of slide JSON (some 50,000
    /// tokens) that end in a word, and the model is asked for the word: it can say it only if
    /// the whole result reached it, and it reaches it whole only in the one call. Haiku, about
    /// eleven cents: the result is 52,000 tokens of input.
    /// Run: `cargo test -p slidr real_cli_reads_a_long -- --ignored --nocapture`.
    #[tokio::test(flavor = "multi_thread")]
    #[ignore = "runs the real Claude Code CLI on the owner's subscription"]
    async fn real_cli_reads_a_long_tool_result() -> TestResult {
        use crate::tool_bridge::{Content, ToolBridge, ToolDef, ToolReply};

        const LAST_WORD: &str = "OSPREY-7733";
        let element = |n: usize| {
            json!({
                "id": format!("e_{n:08}"),
                "type": "text",
                "frame": { "x": 120 + n, "y": 340, "w": 560, "h": 80 },
                "rotation": 0,
                "opacity": 1,
                "content": { "paragraphs": [
                    { "runs": [{ "text": format!("Quarterly revenue by region, row {n}") }] }
                ] }
            })
        };
        // serde_json writes the keys in order: `lastWord` is the end of the text.
        let slide = json!({
            "elements": (0..750).map(element).collect::<Vec<_>>(),
            "id": "s_1",
            "lastWord": LAST_WORD,
        })
        .to_string();
        assert!(slide.ends_with(&format!("\"lastWord\":\"{LAST_WORD}\"}}")));
        println!("the tool's result: {} characters", slide.len());

        let bridge = ToolBridge::new();
        let webview = Arc::downgrade(&bridge);
        bridge.connect(move |call| {
            let reply = ToolReply {
                content: vec![Content::Text {
                    text: slide.clone(),
                }],
                is_error: false,
            };
            webview
                .upgrade()
                .is_some_and(|bridge| bridge.reply(&call.call_id, reply))
        });
        let tool: ToolDef = serde_json::from_value(json!({
            "name": "slide_get",
            "description": "Returns a slide of the deck, whole.",
            "inputSchema": {
                "type": "object",
                "properties": { "slideId": { "type": "string" } },
                "required": ["slideId"]
            }
        }))?;
        let endpoint = bridge.open(vec![tool]).await?;

        let root = tempfile::tempdir()?;
        let mut config = SessionConfig::new(
            Scope::Deck,
            "You are a terse test agent. Follow instructions exactly.",
            root.path().join("thread"),
        );
        config.model = Some("haiku".into());
        config.web_access = false;
        config.tool_endpoint = Some(ToolEndpoint {
            url: endpoint.url.clone(),
            token: endpoint.token.clone(),
        });
        let (sender, mut events) = tokio::sync::mpsc::unbounded_channel();
        let sink = EventSink::new(move |event| {
            let _ = sender.send(event);
        })
        .with_raw(|line| {
            // What the CLI itself made of the result, as it handed it to the model.
            if line.contains("\"tool_result\"") {
                let shown: String = line.chars().take(700).collect();
                println!("  the CLI's tool result line begins: {shown}");
            }
        });
        let mut session = ClaudeCodeHarness::new().start(config, sink).await?;
        session
            .send(UserTurn::text(
                "Call the slide_get tool with slideId set to \"s_1\". Then reply with exactly the \
                 value of lastWord in its result and nothing else.",
            ))
            .await?;
        let seen = real_until(&mut events, turn_end).await?;
        session.close().await?;

        let mut reply = String::new();
        let mut results = Vec::new();
        for event in &seen {
            match event {
                AgentEvent::TextDelta { text } => reply.push_str(text),
                AgentEvent::ToolCallFinished { ok, summary, .. } => {
                    let shown: String = summary.chars().take(200).collect();
                    println!("  tool call finished, ok: {ok}: {shown}");
                    results.push((*ok, summary.clone()));
                }
                _ => {}
            }
        }
        println!("  the model replied: {reply}");
        assert!(
            reply.contains(LAST_WORD),
            "the end of the result did not reach the model: {reply}"
        );
        // It reached the model as the tool gave it, in the one call. Without the two limits the
        // CLI saves the result to a file and the model goes looking in it with its file tools:
        // it found a word that way, and could not have read the slide.
        assert_eq!(results.len(), 1, "{results:?}");
        assert!(
            results[0].0 && results[0].1.starts_with("{\"elements\":["),
            "{results:?}"
        );
        Ok(())
    }
}
