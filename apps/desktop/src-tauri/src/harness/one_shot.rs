//! Codex, GitHub Copilot, Gemini and Grok adapters. Each turn is a non-interactive CLI
//! invocation. Every one of these CLIs persists a conversation ID, so stopping a turn also stops
//! its process and the next turn can resume without leaving a background process behind.

use std::{
    collections::HashSet,
    io,
    path::{Path, PathBuf},
    process::Stdio,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};

use async_trait::async_trait;
use base64::Engine;
use serde_json::{Value, json};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::Command,
    sync::{Notify, watch},
    time::timeout,
};

use crate::harness::{
    ATTACHMENTS, AgentError, AgentErrorKind, AgentEvent, AgentHarness, AgentSession, Capabilities,
    EventSink, HarnessDescriptor, HarnessState, HarnessStatus, Result, SessionConfig, ToolEndpoint,
    ToolSource, TurnOutcome, UserTurn,
};

const PROBE_TIMEOUT: Duration = Duration::from_secs(15);
const CLOSE_TIMEOUT: Duration = Duration::from_secs(5);

/// The MCP server name the app's tools are registered under, in every CLI's configuration.
const SERVER: &str = "slidr";
/// The environment variable that carries the tool endpoint's token to a CLI that reads it from
/// its configuration, so the token is not written to disk.
const TOKEN_ENV: &str = "SLIDR_MCP_TOKEN";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Kind {
    Codex,
    Copilot,
    Gemini,
    Grok,
}

impl Kind {
    fn name(self) -> &'static str {
        match self {
            Self::Codex => "Codex CLI",
            Self::Copilot => "GitHub Copilot CLI",
            Self::Gemini => "Gemini CLI",
            Self::Grok => "Grok CLI",
        }
    }
    fn id(self) -> &'static str {
        match self {
            Self::Codex => "codex-cli",
            Self::Copilot => "copilot-cli",
            Self::Gemini => "gemini-cli",
            Self::Grok => "grok-cli",
        }
    }
    fn login_hint(self) -> &'static str {
        match self {
            Self::Codex => "Run `codex login` in a terminal.",
            Self::Copilot => "Run `copilot login` in a terminal.",
            Self::Gemini => "Run `gemini` in a terminal and sign in with Google.",
            Self::Grok => "Run `grok login` in a terminal.",
        }
    }
    fn launch(self) -> Result<Launch> {
        let missing = |message: &str| AgentError::new(AgentErrorKind::NotInstalled, message);
        match self {
            Self::Codex => crate::image_providers::codex_executable()
                .map(Launch::new)
                .map_err(|message| missing(&message)),
            Self::Copilot => copilot_executable().map(Launch::new).ok_or_else(|| {
                missing("GitHub Copilot CLI was not found. Install it and run `copilot login` in a terminal.")
            }),
            Self::Gemini => gemini_launch().ok_or_else(|| {
                missing("Gemini CLI was not found. Install it and run `gemini` in a terminal to sign in.")
            }),
            Self::Grok => grok_executable().map(Launch::new).ok_or_else(|| {
                missing("Grok CLI was not found. Install it and run `grok login` in a terminal.")
            }),
        }
    }
    /// The CLI starts a new conversation under an ID the app chose, so the ID is known before the
    /// first turn; Codex reports the ID of the conversation it started instead.
    fn names_sessions(self) -> bool {
        self != Self::Codex
    }
}

/// How a CLI is started: its program and, for a CLI that is a Node.js script run by `node`
/// itself, the script, which comes before the CLI's own arguments.
#[derive(Debug, Clone)]
pub(crate) struct Launch {
    pub(crate) program: PathBuf,
    pub(crate) script: Option<PathBuf>,
}

impl Launch {
    pub(crate) fn new(program: PathBuf) -> Self {
        Self {
            program,
            script: None,
        }
    }

    /// A command that starts the CLI; its own arguments follow what this adds. It runs the CLI
    /// quietly: no update check, and for Gemini no second process (see [`quiet`]).
    pub(crate) fn command(&self, id: &str) -> Command {
        let mut command = Command::new(&self.program);
        command.args(&self.script);
        quiet(id, &mut command);
        command
    }
}

/// What every start of a CLI is given. Gemini CLI otherwise starts itself again as a child
/// process with more memory, which a stop would leave running; Grok checks for updates.
pub(crate) fn quiet(id: &str, command: &mut Command) {
    match id {
        "gemini-cli" => {
            command.env("GEMINI_CLI_NO_RELAUNCH", "true");
        }
        "grok-cli" => {
            command.env("GROK_DISABLE_AUTOUPDATER", "1");
        }
        _ => {}
    }
}

/// npm installs `gemini.cmd` on Windows, which runs the CLI's script with Node.js. Start Node.js
/// on the script itself so interrupt stops the CLI, not only the batch file around it. Elsewhere
/// `gemini` is the script itself, linked onto PATH, and is started as it is.
pub(crate) fn gemini_launch() -> Option<Launch> {
    let dirs = crate::harness::setup::search_paths();
    for dir in &dirs {
        if !cfg!(windows) {
            let program = dir.join("gemini");
            if program.is_file() {
                return Some(Launch::new(program));
            }
            continue;
        }
        let script = dir
            .join("node_modules")
            .join("@google")
            .join("gemini-cli")
            .join("bundle")
            .join("gemini.js");
        if !dir.join("gemini.cmd").is_file() || !script.is_file() {
            continue;
        }
        // The shim prefers the Node.js beside it, as npm writes it, and otherwise the one on PATH.
        let node = std::iter::once(dir)
            .chain(&dirs)
            .map(|dir| dir.join("node.exe"))
            .find(|node| node.is_file())?;
        return Some(Launch {
            program: node,
            script: Some(script),
        });
    }
    None
}

/// The official installers put `grok` in `~/.grok/bin` and add that to PATH, which this app sees
/// only once restarted; WinGet links it into its own folder, which is searched as well.
pub(crate) fn grok_executable() -> Option<PathBuf> {
    let name = if cfg!(windows) { "grok.exe" } else { "grok" };
    let home = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME"));
    home.map(|home| PathBuf::from(home).join(".grok").join("bin"))
        .into_iter()
        .chain(crate::harness::setup::search_paths())
        .map(|dir| dir.join(name))
        .find(|path| path.is_file())
}

/// npm installs `copilot.cmd` on Windows and a `copilot` symlink elsewhere. Start the native
/// program inside its platform package so interrupt does not leave a child process running.
pub(crate) fn copilot_executable() -> Option<PathBuf> {
    let (package, native) = match (std::env::consts::OS, std::env::consts::ARCH) {
        ("windows", "x86_64") => ("copilot-win32-x64", "copilot.exe"),
        ("windows", "aarch64") => ("copilot-win32-arm64", "copilot.exe"),
        ("macos", "x86_64") => ("copilot-darwin-x64", "copilot"),
        ("macos", "aarch64") => ("copilot-darwin-arm64", "copilot"),
        ("linux", "x86_64") => ("copilot-linux-x64", "copilot"),
        ("linux", "aarch64") => ("copilot-linux-arm64", "copilot"),
        _ => return None,
    };
    for dir in crate::harness::setup::search_paths() {
        let standalone = dir.join(native);
        if cfg!(windows) && standalone.is_file() {
            return Some(standalone);
        }
        let shim = dir.join(if cfg!(windows) {
            "copilot.cmd"
        } else {
            "copilot"
        });
        if !shim.is_file() {
            continue;
        }
        let package_root = if cfg!(windows) {
            dir.join("node_modules").join("@github").join("copilot")
        } else {
            let Ok(script) = std::fs::canonicalize(&shim) else {
                continue;
            };
            if script
                .file_name()
                .is_none_or(|name| name != "npm-loader.js")
            {
                return Some(shim);
            }
            let Some(parent) = script.parent() else {
                continue;
            };
            parent.to_path_buf()
        };
        let Some(hoisted) = package_root.parent().and_then(Path::parent) else {
            continue;
        };
        for base in [package_root.join("node_modules"), hoisted.to_path_buf()] {
            let program = base.join("@github").join(package).join(native);
            if program.is_file() {
                return Some(program);
            }
        }
    }
    None
}

pub struct OneShotHarness {
    kind: Kind,
}

impl OneShotHarness {
    pub fn codex() -> Self {
        Self { kind: Kind::Codex }
    }
    pub fn copilot() -> Self {
        Self {
            kind: Kind::Copilot,
        }
    }
    pub fn gemini() -> Self {
        Self { kind: Kind::Gemini }
    }
    pub fn grok() -> Self {
        Self { kind: Kind::Grok }
    }
}

#[async_trait]
impl AgentHarness for OneShotHarness {
    fn descriptor(&self) -> HarnessDescriptor {
        HarnessDescriptor {
            id: self.kind.id().into(),
            name: self.kind.name().into(),
            capabilities: Capabilities {
                streaming: self.kind != Kind::Codex,
                resume: true,
                interrupt: true,
                image_input: true,
                tool_endpoint: true,
                // Gemini CLI's headless stream carries no reasoning.
                thinking: self.kind != Kind::Gemini,
            },
            models: Vec::new(),
            default_model: None,
            effort_levels: Vec::new(),
        }
    }

    async fn probe(&self) -> HarnessStatus {
        let make = |state, version, detail| HarnessStatus {
            state,
            version,
            account: None,
            detail,
        };
        let launch = match self.kind.launch() {
            Ok(launch) => launch,
            Err(error) => return make(HarnessState::NotInstalled, None, Some(error.message)),
        };
        let mut command = launch.command(self.kind.id());
        command
            .arg("--version")
            .stdin(Stdio::null())
            .kill_on_drop(true);
        no_window(&mut command);
        let output = timeout(PROBE_TIMEOUT, command.output()).await;
        let version = match output {
            Ok(Ok(output)) if output.status.success() => String::from_utf8_lossy(&output.stdout)
                .split_whitespace()
                .find(|word| word.chars().any(|c| c.is_ascii_digit()))
                .map(str::to_owned),
            Ok(Err(error)) if error.kind() == io::ErrorKind::NotFound => {
                return make(
                    HarnessState::NotInstalled,
                    None,
                    Some(format!(
                        "{} was not found on PATH. Install it and sign in from a terminal.",
                        self.kind.name()
                    )),
                );
            }
            Ok(Err(error)) => {
                return make(HarnessState::Unavailable, None, Some(error.to_string()));
            }
            Ok(Ok(output)) => {
                return make(
                    HarnessState::Unavailable,
                    None,
                    Some(format!(
                        "{} --version exited with {}",
                        self.kind.name(),
                        output.status
                    )),
                );
            }
            Err(_) => {
                return make(
                    HarnessState::Unavailable,
                    None,
                    Some("the CLI did not answer in time".into()),
                );
            }
        };
        if self.kind == Kind::Codex {
            let mut login = launch.command(self.kind.id());
            login
                .args(["login", "status"])
                .stdin(Stdio::null())
                .kill_on_drop(true);
            no_window(&mut login);
            match timeout(PROBE_TIMEOUT, login.output()).await {
                Ok(Ok(output)) if output.status.success() => {
                    make(HarnessState::Ready, version, None)
                }
                Ok(Ok(_)) => make(
                    HarnessState::NotLoggedIn,
                    version,
                    Some(self.kind.login_hint().into()),
                ),
                Ok(Err(error)) => make(HarnessState::Unavailable, version, Some(error.to_string())),
                Err(_) => make(
                    HarnessState::Unavailable,
                    version,
                    Some("login status did not answer in time".into()),
                ),
            }
        } else {
            // Copilot, Gemini and Grok have no cheap non-interactive login-status command. Model
            // discovery (`setup::connect`) asks for the account, and a failed prompt reports
            // not_logged_in with the CLI's error text.
            make(HarnessState::Ready, version, None)
        }
    }

    async fn start(&self, config: SessionConfig, sink: EventSink) -> Result<Box<dyn AgentSession>> {
        if let Some(model) = &config.model
            && (model.is_empty() || model.starts_with('-'))
        {
            return Err(AgentError::invalid_input("invalid model"));
        }
        if let Some(effort) = &config.effort
            && (effort.is_empty() || !effort.chars().all(|c| c.is_ascii_lowercase() || c == '_'))
        {
            return Err(AgentError::invalid_input("unknown effort level"));
        }
        if let Some(resume) = &config.resume
            && uuid::Uuid::parse_str(resume).is_err()
        {
            return Err(AgentError::invalid_input("invalid native session id"));
        }
        let attachments = config.workdir.join(ATTACHMENTS);
        tokio::fs::create_dir_all(&attachments)
            .await
            .map_err(|error| AgentError::io("create agent folder", &error))?;
        if matches!(self.kind, Kind::Codex | Kind::Gemini) {
            tokio::fs::write(config.workdir.join("system.md"), &config.system_prompt)
                .await
                .map_err(|error| AgentError::io("write CLI instructions", &error))?;
        }
        if self.kind == Kind::Copilot
            && let Some(endpoint) = &config.tool_endpoint
        {
            let mcp = json!({ "mcpServers": { SERVER: {
                "type": "http", "url": endpoint.url, "tools": ["*"],
                "headers": { "Authorization": format!("Bearer {}", endpoint.token) },
                "timeout": 600000, "deferTools": "never"
            }}});
            tokio::fs::write(config.workdir.join("copilot-mcp.json"), mcp.to_string())
                .await
                .map_err(|error| AgentError::io("write Copilot tool configuration", &error))?;
        }
        // Gemini and Grok read the configuration of the folder they work in, on top of the
        // user's own. Written for every session, so a session without tools has none left over.
        let folder_config = match self.kind {
            Kind::Gemini => Some((
                attachments.join(".gemini").join("settings.json"),
                gemini_settings(config.tool_endpoint.as_ref(), config.web_access).to_string(),
            )),
            Kind::Grok => Some((
                attachments.join(".grok").join("config.toml"),
                grok_config(config.tool_endpoint.as_ref()),
            )),
            Kind::Codex | Kind::Copilot => None,
        };
        if let Some((path, text)) = folder_config {
            if let Some(parent) = path.parent() {
                tokio::fs::create_dir_all(parent)
                    .await
                    .map_err(|error| AgentError::io("create CLI configuration folder", &error))?;
            }
            tokio::fs::write(&path, text)
                .await
                .map_err(|error| AgentError::io("write CLI tool configuration", &error))?;
        }
        let native = Arc::new(Mutex::new(config.resume.clone().or_else(|| {
            self.kind
                .names_sessions()
                .then(|| uuid::Uuid::new_v4().to_string())
        })));
        Ok(Box::new(OneShotSession {
            kind: self.kind,
            known: Arc::new(AtomicBool::new(config.resume.is_some())),
            config,
            sink,
            native,
            active: None,
            started: false,
        }))
    }
}

/// The settings Gemini CLI runs a session with: the app's tools and no built-in tool but web
/// search and fetch when web access is on (the app's attachment reader stands in for its file
/// tools), no subagents, skills or hooks of the user's, and the app's tools trusted, so they run
/// without a confirmation nobody could give. The token stays in the environment (`TOKEN_ENV`).
fn gemini_settings(endpoint: Option<&ToolEndpoint>, web_access: bool) -> Value {
    // An allowlist: Gemini CLI denies every tool it does not name, MCP tools among them.
    let mut core = vec![format!("mcp_{SERVER}_*")];
    if web_access {
        core.extend(["google_web_search".into(), "web_fetch".into()]);
    }
    let mut settings = json!({
        "general": { "enableAutoUpdate": false, "enableAutoUpdateNotification": false },
        "tools": { "core": core },
        "experimental": { "enableAgents": false },
        "skills": { "enabled": false },
        "hooksConfig": { "enabled": false },
    });
    if let Some(endpoint) = endpoint {
        settings["mcpServers"] = json!({ SERVER: {
            "httpUrl": endpoint.url,
            "headers": { "Authorization": format!("Bearer ${{{TOKEN_ENV}}}") },
            "trust": true,
            "timeout": 600000,
        }});
    }
    settings
}

/// Grok CLI's tool server for a session, in its `config.toml`. The token stays in the environment
/// (`TOKEN_ENV`), which Grok expands in `headers`.
fn grok_config(endpoint: Option<&ToolEndpoint>) -> String {
    let Some(endpoint) = endpoint else {
        return String::new();
    };
    // A JSON string is a valid TOML basic string.
    format!(
        "[mcp_servers.{SERVER}]\nurl = {}\nheaders = {{ Authorization = \"Bearer ${{{TOKEN_ENV}}}\" }}\nstartup_timeout_sec = 30\ntool_timeout_sec = 600\n",
        json!(endpoint.url)
    )
}

struct Active {
    stop: Arc<Notify>,
    done: watch::Receiver<bool>,
}

struct OneShotSession {
    kind: Kind,
    config: SessionConfig,
    sink: EventSink,
    native: Arc<Mutex<Option<String>>>,
    /// Gemini and Grok have the conversation `native` names, so a turn resumes it rather than
    /// creating it: a resumed session, or one a turn has reached the model in. They refuse to
    /// create a conversation under an ID they already have, and to resume one they do not.
    known: Arc<AtomicBool>,
    active: Option<Active>,
    started: bool,
}

#[async_trait]
impl AgentSession for OneShotSession {
    async fn send(&mut self, turn: UserTurn) -> Result<()> {
        if self
            .active
            .as_ref()
            .is_some_and(|active| !*active.done.borrow())
        {
            return Err(AgentError::new(
                AgentErrorKind::Busy,
                "a turn is still running",
            ));
        }
        let first = !self.started;
        self.started = true;
        let resume = self.config.resume.is_some() || !first;
        let (done_tx, done) = watch::channel(false);
        let stop = Arc::new(Notify::new());
        let run = Run {
            kind: self.kind,
            workdir: self.config.workdir.clone(),
            system_prompt: self.config.system_prompt.clone(),
            endpoint: self.config.tool_endpoint.clone(),
            web_access: self.config.web_access,
            model: self.config.model.clone(),
            effort: self.config.effort.clone(),
            native: Arc::clone(&self.native),
            known: Arc::clone(&self.known),
            sink: self.sink.clone(),
            stop: Arc::clone(&stop),
            resume,
        };
        // Copilot's conversation is there once named. Gemini's and Grok's is, for a resumed
        // session; a new one is announced by the turn that reaches the model (`Mapper::reach`),
        // as one that never does leaves nothing to resume.
        let announce = match self.kind {
            Kind::Copilot => true,
            Kind::Gemini | Kind::Grok => self.known.load(Ordering::SeqCst),
            Kind::Codex => false,
        };
        if first && announce {
            self.sink.emit(AgentEvent::SessionStarted {
                native_session_id: self.native_session_id().expect("session ID is allocated"),
                model: self.config.model.clone().unwrap_or_default(),
            });
        }
        tokio::spawn(async move {
            run.run(turn).await;
            done_tx.send_replace(true);
        });
        self.active = Some(Active { stop, done });
        Ok(())
    }

    async fn interrupt(&mut self) -> Result<()> {
        if let Some(active) = &self.active
            && !*active.done.borrow()
        {
            active.stop.notify_one();
        }
        Ok(())
    }

    async fn close(self: Box<Self>) -> Result<()> {
        if let Some(active) = &self.active
            && !*active.done.borrow()
        {
            active.stop.notify_one();
            let mut done = active.done.clone();
            let _ = timeout(CLOSE_TIMEOUT, done.wait_for(|done| *done)).await;
        }
        self.sink.emit(AgentEvent::Exited { code: Some(0) });
        Ok(())
    }

    fn native_session_id(&self) -> Option<String> {
        // A new Gemini or Grok conversation has its ID once a turn reached the model.
        if matches!(self.kind, Kind::Gemini | Kind::Grok) && !self.known.load(Ordering::SeqCst) {
            return None;
        }
        self.native
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }
}

struct Run {
    kind: Kind,
    workdir: PathBuf,
    system_prompt: String,
    endpoint: Option<ToolEndpoint>,
    web_access: bool,
    model: Option<String>,
    effort: Option<String>,
    native: Arc<Mutex<Option<String>>>,
    known: Arc<AtomicBool>,
    sink: EventSink,
    stop: Arc<Notify>,
    resume: bool,
}

/// What a turn hands the CLI: text on standard input, or for Grok, which does not read its
/// prompt from there, a file of ACP content blocks, removed once the turn is over.
enum Prompt {
    Stdin(String),
    File(TurnFiles),
}

/// How one start of the CLI for a turn ended. `reached`: the turn got as far as the model, so the
/// CLI keeps the conversation.
struct Attempt {
    outcome: std::result::Result<TurnOutcome, String>,
    reached: bool,
}

impl Run {
    async fn run(self, turn: UserTurn) {
        match self.execute(turn).await {
            Ok(TurnOutcome::Completed) => self.sink.emit(AgentEvent::TurnCompleted {
                outcome: TurnOutcome::Completed,
            }),
            Ok(TurnOutcome::Interrupted) => self.sink.emit(AgentEvent::TurnCompleted {
                outcome: TurnOutcome::Interrupted,
            }),
            Ok(TurnOutcome::Failed) => self.sink.emit(AgentEvent::TurnCompleted {
                outcome: TurnOutcome::Failed,
            }),
            Err(error) => {
                self.sink.emit(AgentEvent::Error {
                    kind: error.kind,
                    message: error.message,
                    recoverable: true,
                });
                self.sink.emit(AgentEvent::TurnCompleted {
                    outcome: TurnOutcome::Failed,
                });
            }
        }
    }

    /// The turn resumes a conversation the CLI has. For Codex and Copilot, any but the first
    /// turn of a new session; for Gemini and Grok, what `known` says.
    fn resuming(&self) -> bool {
        match self.kind {
            Kind::Codex | Kind::Copilot => self.resume,
            Kind::Gemini | Kind::Grok => self.known.load(Ordering::SeqCst),
        }
    }

    async fn execute(&self, turn: UserTurn) -> Result<TurnOutcome> {
        let launch = self.kind.launch()?;
        let attachments = self.workdir.join(ATTACHMENTS);
        let images = write_images(&attachments, &turn).await?;
        let prompt = self.prompt(&turn, &images.0).await?;
        let mut retried = false;
        loop {
            let attempt = self.attempt(&launch, &prompt, &images.0).await?;
            if attempt.reached {
                self.known.store(true, Ordering::SeqCst);
            }
            let message = match attempt.outcome {
                Ok(outcome) => return self.finish(outcome),
                Err(message) => message,
            };
            if !retried
                && retry_fresh(
                    self.kind,
                    attempt.reached,
                    self.known.load(Ordering::SeqCst),
                    &message,
                )
            {
                *self.native.lock().unwrap_or_else(|e| e.into_inner()) =
                    Some(uuid::Uuid::new_v4().to_string());
                retried = true;
                continue;
            }
            let kind = classify_error(&message, self.resuming());
            self.sink.emit(AgentEvent::Error {
                kind,
                message,
                recoverable: kind != AgentErrorKind::ResumeFailed,
            });
            return Ok(TurnOutcome::Failed);
        }
    }

    fn finish(&self, outcome: TurnOutcome) -> Result<TurnOutcome> {
        if outcome == TurnOutcome::Completed
            && self.kind == Kind::Codex
            && self
                .native
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .is_none()
        {
            return Err(AgentError::new(
                AgentErrorKind::TurnFailed,
                "Codex ended without a session ID",
            ));
        }
        Ok(outcome)
    }

    async fn prompt(&self, turn: &UserTurn, images: &[PathBuf]) -> Result<Prompt> {
        let context = turn.context.as_deref().unwrap_or("");
        Ok(match self.kind {
            Kind::Codex => Prompt::Stdin([context, &turn.text].join("\n\n")),
            Kind::Copilot => Prompt::Stdin(format!(
                "Slidr application instructions:\n{}\n\nCurrent context:\n{}\n\nUser request:\n{}",
                self.system_prompt, context, turn.text
            )),
            // `@name` puts a file of the working directory into the message: the turn's images.
            Kind::Gemini => {
                let mut text = [context, &turn.text].join("\n\n");
                let names: Vec<String> = images
                    .iter()
                    .filter_map(|path| path.file_name())
                    .map(|name| format!("@{}", name.to_string_lossy()))
                    .collect();
                if !names.is_empty() {
                    text.push_str("\n\n");
                    text.push_str(&names.join(" "));
                }
                Prompt::Stdin(text)
            }
            // Grok takes the instructions on its command line only, which on Windows holds less
            // than they are; like Copilot it is given them with the request. Its MCP tools are
            // reached through its `use_tool`, under the server's name.
            Kind::Grok => {
                let tools = if self.endpoint.is_some() {
                    format!(
                        "\n\nThe Slidr tools these instructions name are on the MCP server `{SERVER}`: call one with use_tool and the tool's name prefixed by `{SERVER}__`."
                    )
                } else {
                    String::new()
                };
                let text = format!(
                    "Slidr application instructions:\n{}{tools}\n\nCurrent context:\n{}\n\nUser request:\n{}",
                    self.system_prompt, context, turn.text
                );
                let mut blocks = vec![json!({ "type": "text", "text": text })];
                for image in &turn.images {
                    blocks.push(json!({
                        "type": "image", "data": image.data, "mimeType": image.media_type
                    }));
                }
                let path = self
                    .workdir
                    .join(format!("turn-{}.json", uuid::Uuid::new_v4().simple()));
                let file = TurnFiles(vec![path.clone()]);
                tokio::fs::write(&path, Value::Array(blocks).to_string())
                    .await
                    .map_err(|error| AgentError::io("write Grok prompt", &error))?;
                Prompt::File(file)
            }
        })
    }

    async fn attempt(
        &self,
        launch: &Launch,
        prompt: &Prompt,
        images: &[PathBuf],
    ) -> Result<Attempt> {
        let mut command = launch.command(self.kind.id());
        command
            .current_dir(self.workdir.join(ATTACHMENTS))
            .stdin(match prompt {
                Prompt::Stdin(_) => Stdio::piped(),
                Prompt::File(_) => Stdio::null(),
            })
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        match (self.kind, prompt) {
            (Kind::Codex, _) => self.codex_args(&mut command, images),
            (Kind::Copilot, _) => self.copilot_args(&mut command, images),
            (Kind::Gemini, _) => self.gemini_args(&mut command),
            (Kind::Grok, Prompt::File(file)) => self.grok_args(&mut command, &file.0[0]),
            (Kind::Grok, Prompt::Stdin(_)) => {
                return Err(AgentError::internal("Grok takes its prompt from a file"));
            }
        }
        no_window(&mut command);
        let mut child = command.spawn().map_err(|error| match error.kind() {
            io::ErrorKind::NotFound => AgentError::new(
                AgentErrorKind::NotInstalled,
                format!("{} was not found on PATH", self.kind.name()),
            ),
            _ => AgentError::io(format!("start {}", self.kind.name()), &error),
        })?;
        let interrupted = Attempt {
            outcome: Ok(TurnOutcome::Interrupted),
            reached: false,
        };
        if let (Some(mut stdin), Prompt::Stdin(text)) = (child.stdin.take(), prompt) {
            let write = async {
                stdin
                    .write_all(text.as_bytes())
                    .await
                    .map_err(|error| AgentError::io("send CLI prompt", &error))?;
                if self.kind == Kind::Copilot {
                    stdin
                        .write_all(b"\n")
                        .await
                        .map_err(|error| AgentError::io("finish Copilot prompt", &error))?;
                }
                Ok::<(), AgentError>(())
            };
            tokio::select! {
                result = write => result?,
                () = self.stop.notified() => {
                    let _ = child.start_kill();
                    let _ = child.wait().await;
                    return Ok(interrupted);
                }
            }
        }
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| AgentError::internal("CLI stdout unavailable"))?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| AgentError::internal("CLI stderr unavailable"))?;
        let stderr = tokio::spawn(async move {
            let mut output = String::new();
            let _ =
                tokio::io::AsyncReadExt::read_to_string(&mut BufReader::new(stderr), &mut output)
                    .await;
            output
        });
        let mut lines = BufReader::new(stdout).lines();
        let mut mapper = Mapper::new(
            self.kind,
            Arc::clone(&self.native),
            self.sink.clone(),
            self.model.clone(),
        );
        mapper.announce =
            matches!(self.kind, Kind::Gemini | Kind::Grok) && !self.known.load(Ordering::SeqCst);
        let mut stopped = false;
        loop {
            tokio::select! {
                line = lines.next_line() => match line {
                    Ok(Some(line)) => { self.sink.raw(&line); mapper.line(&line); }
                    Ok(None) => break,
                    Err(error) => return Err(AgentError::io("read CLI output", &error)),
                },
                () = self.stop.notified() => {
                    stopped = true;
                    let _ = child.start_kill();
                    break;
                }
            }
        }
        let status = child
            .wait()
            .await
            .map_err(|error| AgentError::io("wait for CLI", &error))?;
        let stderr = stderr.await.unwrap_or_default();
        let reached = mapper.reached;
        if stopped {
            return Ok(Attempt {
                reached,
                ..interrupted
            });
        }
        if mapper.failed || !status.success() {
            let message = mapper.error.unwrap_or_else(|| clean_stderr(&stderr));
            let message = if message.is_empty() {
                format!("{} exited with {status}", self.kind.name())
            } else {
                message
            };
            return Ok(Attempt {
                outcome: Err(message),
                reached,
            });
        }
        Ok(Attempt {
            outcome: Ok(TurnOutcome::Completed),
            reached,
        })
    }

    fn codex_args(&self, command: &mut Command, images: &[PathBuf]) {
        command.args([
            "exec",
            "--json",
            "--skip-git-repo-check",
            "--ignore-user-config",
            "--ignore-rules",
            "--sandbox",
            "read-only",
        ]);
        for setting in [
            "approval_policy=\"never\"".to_owned(),
            "features.shell_tool=false".to_owned(),
            "features.apps=false".to_owned(),
            format!(
                "web_search=\"{}\"",
                if self.web_access { "live" } else { "disabled" }
            ),
            format!(
                "model_instructions_file={}",
                json!(self.workdir.join("system.md").to_string_lossy().to_string())
            ),
        ] {
            command.args(["-c", &setting]);
        }
        if let Some(endpoint) = &self.endpoint {
            command.env("SLIDR_MCP_TOKEN", &endpoint.token);
            for setting in [
                format!("mcp_servers.slidr.url={}", json!(endpoint.url)),
                "mcp_servers.slidr.bearer_token_env_var=\"SLIDR_MCP_TOKEN\"".into(),
                "mcp_servers.slidr.required=true".into(),
                "mcp_servers.slidr.tool_timeout_sec=600".into(),
                "mcp_servers.slidr.default_tools_approval_mode=\"approve\"".into(),
            ] {
                command.args(["-c", &setting]);
            }
        }
        if let Some(model) = &self.model {
            command.args(["--model", model]);
        }
        if let Some(effort) = &self.effort {
            command.args(["-c", &format!("model_reasoning_effort={}", json!(effort))]);
        }
        if self.resume
            && let Some(native) = self
                .native
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .clone()
        {
            command.args(["resume", &native]);
        }
        for image in images {
            command.arg("--image").arg(image);
        }
        command.arg("-");
        command
            .env_remove("CODEX_API_KEY")
            .env_remove("OPENAI_API_KEY");
    }

    fn copilot_args(&self, command: &mut Command, images: &[PathBuf]) {
        command.args([
            "--output-format=json",
            "--no-custom-instructions",
            "--no-ask-user",
            "--no-auto-update",
            "--disable-builtin-mcps",
            "--available-tools=web_fetch,slidr",
            "--deny-tool=shell",
            "--deny-tool=write",
        ]);
        if self.web_access {
            command.arg("--allow-all-urls");
        } else {
            command.args(["--deny-tool=url", "--excluded-tools=web_fetch"]);
        }
        if self.endpoint.is_some() {
            command.arg("--allow-tool=slidr");
            command.arg(format!(
                "--additional-mcp-config=@{}",
                self.workdir.join("copilot-mcp.json").display()
            ));
        }
        if let Some(model) = &self.model {
            command.arg(format!("--model={model}"));
        }
        if let Some(effort) = &self.effort {
            command.arg(format!("--reasoning-effort={effort}"));
        }
        if let Some(native) = self
            .native
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
        {
            command.args(["--session-id", &native]);
        }
        for image in images {
            command.arg("--attachment").arg(image);
        }
        command.env("COPILOT_AUTO_UPDATE", "false");
    }

    /// The conversation's ID, and the flag that resumes it or the one that creates it.
    fn session_args(&self, command: &mut Command, resume_flag: &str, create_flag: &str) {
        if let Some(native) = self
            .native
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
        {
            let flag = if self.known.load(Ordering::SeqCst) {
                resume_flag
            } else {
                create_flag
            };
            command.args([flag, &native]);
        }
    }

    fn gemini_args(&self, command: &mut Command) {
        // `yolo` approves what the folder's settings (`gemini_settings`) allow, as nobody could.
        command.args([
            "--output-format",
            "stream-json",
            "--approval-mode",
            "yolo",
            "--allowed-mcp-server-names",
            SERVER,
        ]);
        if let Some(model) = &self.model {
            command.args(["--model", model]);
        }
        // Gemini CLI has no effort setting; its descriptor offers none.
        self.session_args(command, "--resume", "--session-id");
        // Trusts the folder for this run, so its settings apply, without marking it trusted.
        // (`--skip-trust` comes too late for them: they are read before the arguments.)
        command
            .env("GEMINI_CLI_TRUST_WORKSPACE", "true")
            .env("GEMINI_SYSTEM_MD", self.workdir.join("system.md"));
        if let Some(endpoint) = &self.endpoint {
            command.env(TOKEN_ENV, &endpoint.token);
        }
    }

    fn grok_args(&self, command: &mut Command, prompt: &Path) {
        command.arg("--prompt-file").arg(prompt);
        command.arg("--cwd").arg(self.workdir.join(ATTACHMENTS));
        // Only what is allowed below runs: the app's tools and, with web access, the web tools.
        // The built-in tools are those two at most; without web access, none.
        command.args([
            "--output-format",
            "streaming-json",
            "--verbatim",
            "--no-auto-update",
            "--no-subagents",
            "--no-plan",
            "--permission-mode",
            "dontAsk",
            "--tools",
            "web_search,web_fetch",
        ]);
        if self.web_access {
            command.args(["--allow", "WebSearch", "--allow", "WebFetch"]);
        } else {
            command.args([
                "--disallowed-tools",
                "web_search,web_fetch",
                "--disable-web-search",
            ]);
        }
        if let Some(endpoint) = &self.endpoint {
            command.arg("--allow").arg(format!("MCPTool({SERVER}__*)"));
            command.env(TOKEN_ENV, &endpoint.token);
        }
        if let Some(model) = &self.model {
            command.args(["--model", model]);
        }
        if let Some(effort) = &self.effort {
            command.args(["--reasoning-effort", effort]);
        }
        self.session_args(command, "--resume", "--session-id");
        // The folder's `config.toml` holds the app's tool server; Grok reads a folder's
        // configuration only once the folder is trusted, which this turns off for this run.
        // Cross-session memory would carry one deck's chats into another's.
        command
            .env("GROK_FOLDER_TRUST", "0")
            .env("GROK_MEMORY", "0");
    }
}

/// Files a turn writes for the CLI, removed when the turn is over.
struct TurnFiles(Vec<PathBuf>);

impl Drop for TurnFiles {
    fn drop(&mut self) {
        for path in &self.0 {
            let _ = std::fs::remove_file(path);
        }
    }
}

async fn write_images(dir: &Path, turn: &UserTurn) -> Result<TurnFiles> {
    let mut paths = TurnFiles(Vec::new());
    for image in &turn.images {
        let ext = match image.media_type.as_str() {
            "image/png" => "png",
            "image/jpeg" => "jpg",
            "image/gif" => "gif",
            "image/webp" => "webp",
            _ => return Err(AgentError::invalid_input("unsupported image type")),
        };
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(&image.data)
            .map_err(|_| AgentError::invalid_input("invalid image data"))?;
        let path = dir.join(format!("turn-{}.{}", uuid::Uuid::new_v4().simple(), ext));
        tokio::fs::write(&path, bytes)
            .await
            .map_err(|error| AgentError::io("write turn image", &error))?;
        paths.0.push(path);
    }
    Ok(paths)
}

fn no_window(command: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.as_std_mut().creation_flags(0x0800_0000);
    }
    #[cfg(not(windows))]
    {
        let _ = command;
    }
}

/// A failed turn is started once more, as a new conversation under a new ID. Gemini and Grok
/// refuse to create a conversation under an ID they already have, and a turn that failed after
/// the CLI recorded the conversation, but before it reached the model, leaves one behind, which
/// Gemini then also refuses to resume. Nothing of it reached the model or was announced, so
/// nothing is lost, and the CLI refuses before anything runs, so nothing is done twice.
fn retry_fresh(kind: Kind, reached: bool, known: bool, message: &str) -> bool {
    matches!(kind, Kind::Gemini | Kind::Grok) && !reached && !known && session_taken(message)
}

/// Gemini or Grok refused to create a conversation under an ID it already has.
fn session_taken(message: &str) -> bool {
    let lower = message.to_ascii_lowercase();
    lower.contains("session")
        && (lower.contains("already exists") || lower.contains("already in use"))
}

/// What a CLI wrote to standard error, without the notices Gemini CLI prints on every run.
fn clean_stderr(stderr: &str) -> String {
    stderr
        .lines()
        .filter(|line| {
            !line.contains("YOLO mode is enabled") && !line.contains("256-color support")
        })
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_owned()
}

fn classify_error(message: &str, resume: bool) -> AgentErrorKind {
    let lower = message.to_ascii_lowercase();
    if resume
        && (lower.contains("session not found")
            || lower.contains("no session found")
            || lower.contains("unknown session")
            || lower.contains("session does not exist")
            || lower.contains("error resuming session"))
    {
        AgentErrorKind::ResumeFailed
    } else if lower.contains("not logged in")
        || lower.contains("not signed in")
        || lower.contains("not authenticated")
        || lower.contains("no authentication")
        || lower.contains("login required")
        || lower.contains("auth method")
    {
        AgentErrorKind::NotLoggedIn
    } else if lower.contains("rate limit")
        || lower.contains("quota")
        || lower.contains("usage limit")
    {
        AgentErrorKind::Quota
    } else if lower.contains("mcp") && (lower.contains("connect") || lower.contains("initialize")) {
        AgentErrorKind::ToolsUnavailable
    } else if lower.contains("network") || lower.contains("connection") || lower.contains("dns") {
        AgentErrorKind::Network
    } else {
        AgentErrorKind::TurnFailed
    }
}

struct Mapper {
    kind: Kind,
    native: Arc<Mutex<Option<String>>>,
    sink: EventSink,
    model: Option<String>,
    started: bool,
    streamed: HashSet<String>,
    /// Grok's tool calls that started and have not finished.
    open: HashSet<String>,
    failed: bool,
    error: Option<String>,
    /// The turn reached the model (Gemini and Grok): the CLI keeps the conversation.
    reached: bool,
    /// The conversation is new, and is announced (`session_started`) once the turn reaches the
    /// model.
    announce: bool,
}

impl Mapper {
    fn new(
        kind: Kind,
        native: Arc<Mutex<Option<String>>>,
        sink: EventSink,
        model: Option<String>,
    ) -> Self {
        Self {
            kind,
            native,
            sink,
            model,
            started: false,
            streamed: HashSet::new(),
            open: HashSet::new(),
            failed: false,
            error: None,
            reached: false,
            announce: false,
        }
    }

    /// The turn reached the model; a new conversation is there from now on.
    fn reach(&mut self) {
        if !self.reached
            && self.announce
            && let Some(id) = self
                .native
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .clone()
        {
            self.sink.emit(AgentEvent::SessionStarted {
                native_session_id: id,
                model: self.model.clone().unwrap_or_default(),
            });
        }
        self.reached = true;
    }

    fn line(&mut self, line: &str) {
        let Ok(value) = serde_json::from_str::<Value>(line) else {
            return;
        };
        match self.kind {
            Kind::Codex => self.codex(&value),
            Kind::Copilot => self.copilot(&value),
            Kind::Gemini => self.gemini(&value),
            Kind::Grok => self.grok(&value),
        }
    }

    fn codex(&mut self, value: &Value) {
        match value["type"].as_str() {
            Some("thread.started") => {
                if let Some(id) = value["thread_id"].as_str() {
                    *self.native.lock().unwrap_or_else(|e| e.into_inner()) = Some(id.into());
                    if !self.started {
                        self.started = true;
                        self.sink.emit(AgentEvent::SessionStarted {
                            native_session_id: id.into(),
                            model: self.model.clone().unwrap_or_default(),
                        });
                    }
                }
            }
            Some("item.started") => self.codex_item(&value["item"], false),
            Some("item.completed") => self.codex_item(&value["item"], true),
            Some("turn.failed") => {
                self.failed = true;
                self.error = value["error"]["message"].as_str().map(str::to_owned);
            }
            Some("error") => self.error = value["message"].as_str().map(str::to_owned),
            _ => {}
        }
    }

    fn codex_item(&mut self, item: &Value, complete: bool) {
        let id = item["id"].as_str().unwrap_or_default().to_owned();
        match item["type"].as_str() {
            Some("agent_message") if complete => {
                if let Some(text) = item["text"].as_str() {
                    self.sink.emit(AgentEvent::TextDelta { text: text.into() });
                }
            }
            Some("reasoning") if complete => {
                if let Some(text) = item["text"].as_str() {
                    self.sink
                        .emit(AgentEvent::ThinkingDelta { text: text.into() });
                }
            }
            Some("mcp_tool_call") => {
                let server = item["server"].as_str().unwrap_or_default();
                let tool = item["tool"].as_str().unwrap_or_default();
                if !complete {
                    self.sink.emit(AgentEvent::ToolCallStarted {
                        id,
                        name: tool.into(),
                        source: if server == "slidr" {
                            ToolSource::App
                        } else {
                            ToolSource::Harness
                        },
                        input: item["arguments"].clone(),
                    });
                } else {
                    self.sink.emit(AgentEvent::ToolCallFinished {
                        id,
                        ok: item["error"].is_null(),
                        summary: summarize(&item["result"]),
                    });
                }
            }
            Some("web_search") | Some("command_execution") if !complete => {
                self.sink.emit(AgentEvent::ToolCallStarted {
                    id,
                    name: item["type"].as_str().unwrap_or_default().into(),
                    source: ToolSource::Harness,
                    input: item.clone(),
                });
            }
            Some("web_search") | Some("command_execution") => {
                self.sink.emit(AgentEvent::ToolCallFinished {
                    id,
                    ok: true,
                    summary: summarize(item),
                });
            }
            _ => {}
        }
    }

    fn copilot(&mut self, value: &Value) {
        let data = &value["data"];
        match value["type"].as_str() {
            Some("assistant.message_delta") => {
                if let Some(id) = data["messageId"].as_str() {
                    self.streamed.insert(id.into());
                }
                if let Some(text) = data["deltaContent"]
                    .as_str()
                    .filter(|text| !text.is_empty())
                {
                    self.sink.emit(AgentEvent::TextDelta { text: text.into() });
                }
            }
            Some("assistant.message") => {
                let id = data["messageId"].as_str().unwrap_or_default();
                if !self.streamed.contains(id)
                    && let Some(text) = data["content"].as_str()
                {
                    self.sink.emit(AgentEvent::TextDelta { text: text.into() });
                }
            }
            Some("assistant.reasoning_delta") => {
                if let Some(text) = data["deltaContent"].as_str() {
                    self.sink
                        .emit(AgentEvent::ThinkingDelta { text: text.into() });
                }
            }
            Some("tool.execution_start") => {
                let name = data["toolName"].as_str().unwrap_or_default();
                let app_name = name
                    .strip_prefix("mcp__slidr__")
                    .or_else(|| name.strip_prefix("slidr/"))
                    .or_else(|| name.strip_prefix("slidr-"));
                self.sink.emit(AgentEvent::ToolCallStarted {
                    id: data["toolCallId"].as_str().unwrap_or_default().into(),
                    name: app_name.unwrap_or(name).into(),
                    source: if app_name.is_some() {
                        ToolSource::App
                    } else {
                        ToolSource::Harness
                    },
                    input: data["arguments"].clone(),
                });
            }
            Some("tool.execution_complete") => self.sink.emit(AgentEvent::ToolCallFinished {
                id: data["toolCallId"].as_str().unwrap_or_default().into(),
                ok: data["success"].as_bool().unwrap_or(false),
                summary: summarize(if data["success"] == true {
                    &data["result"]
                } else {
                    &data["error"]
                }),
            }),
            Some("session.error") => {
                self.failed = true;
                self.error = data["message"].as_str().map(str::to_owned);
            }
            Some("result") if value["is_error"] == true => {
                self.failed = true;
                self.error = value["result"].as_str().map(str::to_owned);
            }
            _ => {}
        }
    }
}

impl Mapper {
    /// Gemini CLI's `stream-json`: `init`, `message`, `tool_use`, `tool_result`, `error` and a
    /// last `result`. The app's tools are named `mcp_<server>_<tool>`.
    fn gemini(&mut self, value: &Value) {
        match value["type"].as_str() {
            Some("message") if value["role"] == "assistant" => {
                self.reach();
                if let Some(text) = value["content"].as_str().filter(|text| !text.is_empty()) {
                    self.sink.emit(AgentEvent::TextDelta { text: text.into() });
                }
            }
            Some("tool_use") => {
                self.reach();
                let name = value["tool_name"].as_str().unwrap_or_default();
                let app = name.strip_prefix(&format!("mcp_{SERVER}_"));
                self.sink.emit(AgentEvent::ToolCallStarted {
                    id: value["tool_id"].as_str().unwrap_or_default().into(),
                    name: app.unwrap_or(name).into(),
                    source: if app.is_some() {
                        ToolSource::App
                    } else {
                        ToolSource::Harness
                    },
                    input: value["parameters"].clone(),
                });
            }
            Some("tool_result") => {
                let ok = value["status"] == "success";
                self.sink.emit(AgentEvent::ToolCallFinished {
                    id: value["tool_id"].as_str().unwrap_or_default().into(),
                    ok,
                    summary: summarize(if ok {
                        &value["output"]
                    } else {
                        &value["error"]["message"]
                    }),
                });
            }
            Some("error") if value["severity"] == "error" => {
                self.error = value["message"].as_str().map(str::to_owned);
            }
            Some("result") => {
                if value["status"] == "error" {
                    self.failed = true;
                    if let Some(message) = value["error"]["message"].as_str() {
                        self.error = Some(message.into());
                    }
                } else {
                    self.reach();
                }
            }
            _ => {}
        }
    }

    /// Grok CLI's `streaming-json`, which follows ACP's session updates: `text`, `thought`,
    /// `tool_call`, `tool_call_update`, `usage`, `error` and a last `end`. MCP tools are called
    /// through its `use_tool`, and named `<server>__<tool>`.
    fn grok(&mut self, value: &Value) {
        match value["type"].as_str() {
            Some("text") => {
                self.reach();
                if let Some(text) = value["data"].as_str().filter(|text| !text.is_empty()) {
                    self.sink.emit(AgentEvent::TextDelta { text: text.into() });
                }
            }
            Some("thought") => {
                self.reach();
                if let Some(text) = value["data"].as_str() {
                    self.sink
                        .emit(AgentEvent::ThinkingDelta { text: text.into() });
                }
            }
            Some("tool_call") => {
                self.reach();
                let id = value["toolCallId"].as_str().unwrap_or_default().to_owned();
                if !self.open.insert(id.clone()) {
                    return;
                }
                let mut name = value["toolName"]
                    .as_str()
                    .or_else(|| value["title"].as_str())
                    .unwrap_or_default();
                let mut input = &value["rawInput"];
                if name == "use_tool"
                    && let Some(tool) = input["tool_name"].as_str()
                {
                    name = tool;
                    input = &value["rawInput"]["tool_input"];
                }
                let app = name.strip_prefix(&format!("{SERVER}__"));
                self.sink.emit(AgentEvent::ToolCallStarted {
                    id,
                    name: app.unwrap_or(name).into(),
                    source: if app.is_some() {
                        ToolSource::App
                    } else {
                        ToolSource::Harness
                    },
                    input: input.clone(),
                });
            }
            Some("tool_call_update") => {
                let status = value["status"].as_str();
                if !matches!(status, Some("completed" | "failed")) {
                    return;
                }
                let id = value["toolCallId"].as_str().unwrap_or_default();
                if !self.open.remove(id) {
                    return;
                }
                let summary = if value["rawOutput"].is_null() {
                    content_text(&value["content"])
                } else {
                    summarize(&value["rawOutput"])
                };
                self.sink.emit(AgentEvent::ToolCallFinished {
                    id: id.into(),
                    ok: status == Some("completed"),
                    summary,
                });
            }
            Some("usage" | "end") => self.reach(),
            Some("error") => {
                self.failed = true;
                self.error = value["message"].as_str().map(str::to_owned);
            }
            _ => {}
        }
    }
}

/// The text of ACP tool-call content: `[{ "type": "content", "content": { "type": "text", … } }]`.
fn content_text(content: &Value) -> String {
    let text: Vec<&str> = content
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|item| item["content"]["text"].as_str())
        .collect();
    text.join("\n").chars().take(300).collect()
}

fn summarize(value: &Value) -> String {
    let text = match value {
        Value::String(text) => text.clone(),
        Value::Null => String::new(),
        other => other.to_string(),
    };
    text.chars().take(300).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        harness::{HarnessManager, Scope, ToolEndpoint},
        tool_bridge::{Content, ToolBridge, ToolCall, ToolDef, ToolReply},
    };

    #[test]
    fn maps_codex_thread_text_and_app_tool() {
        let (sink, mut events) = EventSink::channel();
        let id = Arc::new(Mutex::new(None));
        let mut mapper = Mapper::new(Kind::Codex, Arc::clone(&id), sink, Some("gpt".into()));
        mapper.line(r#"{"type":"thread.started","thread_id":"abc"}"#);
        mapper.line(r#"{"type":"item.started","item":{"id":"one","type":"mcp_tool_call","server":"slidr","tool":"slide_create","arguments":{"title":"A"}}}"#);
        mapper.line(r#"{"type":"item.completed","item":{"id":"one","type":"mcp_tool_call","server":"slidr","tool":"slide_create","result":{"ok":true}}}"#);
        mapper.line(
            r#"{"type":"item.completed","item":{"id":"two","type":"agent_message","text":"Done"}}"#,
        );
        assert!(matches!(
            events.try_recv(),
            Ok(AgentEvent::SessionStarted { .. })
        ));
        assert!(
            matches!(events.try_recv(), Ok(AgentEvent::ToolCallStarted { name, source: ToolSource::App, .. }) if name == "slide_create")
        );
        assert!(matches!(
            events.try_recv(),
            Ok(AgentEvent::ToolCallFinished { ok: true, .. })
        ));
        assert!(matches!(events.try_recv(), Ok(AgentEvent::TextDelta { text }) if text == "Done"));
        assert_eq!(
            id.lock().expect("the id is not poisoned").as_deref(),
            Some("abc")
        );
    }

    #[test]
    fn maps_copilot_deltas_without_repeating_final_message() {
        let (sink, mut events) = EventSink::channel();
        let mut mapper = Mapper::new(Kind::Copilot, Arc::new(Mutex::new(None)), sink, None);
        mapper.line(r#"{"type":"assistant.message_delta","data":{"messageId":"m1","deltaContent":"Hello"}}"#);
        mapper.line(r#"{"type":"assistant.message","data":{"messageId":"m1","content":"Hello"}}"#);
        assert!(matches!(events.try_recv(), Ok(AgentEvent::TextDelta { text }) if text == "Hello"));
        assert!(events.try_recv().is_err());
    }

    #[test]
    fn maps_copilot_app_tool_name() {
        let (sink, mut events) = EventSink::channel();
        let mut mapper = Mapper::new(Kind::Copilot, Arc::new(Mutex::new(None)), sink, None);
        mapper.line(r#"{"type":"tool.execution_start","data":{"toolCallId":"one","toolName":"slidr-deck_code_word","arguments":{"deck":"plan"}}}"#);
        assert!(matches!(events.try_recv(), Ok(AgentEvent::ToolCallStarted {
            name, source: ToolSource::App, input, ..
        }) if name == "deck_code_word" && input["deck"] == "plan"));
    }

    #[test]
    fn failures_are_classified_for_resume_and_auth() {
        assert_eq!(
            classify_error("Session not found", true),
            AgentErrorKind::ResumeFailed
        );
        assert_eq!(
            classify_error("No authentication information found", false),
            AgentErrorKind::NotLoggedIn
        );
        assert_eq!(
            classify_error(
                "Error resuming session: No previous sessions found for this project.",
                true
            ),
            AgentErrorKind::ResumeFailed
        );
        assert_eq!(
            classify_error("Session does not exist", true),
            AgentErrorKind::ResumeFailed
        );
        assert_eq!(
            classify_error("Not signed in. Run `grok login` to authenticate.", false),
            AgentErrorKind::NotLoggedIn
        );
        assert_eq!(
            classify_error(
                "Please set an Auth method in your settings.json or specify GEMINI_API_KEY",
                false
            ),
            AgentErrorKind::NotLoggedIn
        );
        assert!(session_taken(
            "Error starting session: Session ID \"x\" already exists. Use --resume to resume it."
        ));
        assert!(!session_taken("Session does not exist"));
        let taken = "Error: Session ID 0b6f5d8e-1111-4222-8333-944445555666 is already in use.";
        assert!(retry_fresh(Kind::Grok, false, false, taken));
        assert!(retry_fresh(
            Kind::Gemini,
            false,
            false,
            "Error starting session: Session ID \"x\" already exists. Use --resume to resume it."
        ));
        // Not when the turn reached the model, the turn already resumed, or for another CLI.
        assert!(!retry_fresh(Kind::Grok, true, false, taken));
        assert!(!retry_fresh(Kind::Grok, false, true, taken));
        assert!(!retry_fresh(Kind::Copilot, false, false, taken));
        assert!(!retry_fresh(Kind::Gemini, false, false, "Quota exceeded"));
        assert_eq!(
            clean_stderr(
                "YOLO mode is enabled. All tool calls will be automatically approved.\nBoom\n"
            ),
            "Boom"
        );
    }

    #[test]
    fn maps_gemini_stream_with_app_tool() {
        let (sink, mut events) = EventSink::channel();
        let mut mapper = Mapper::new(Kind::Gemini, Arc::new(Mutex::new(None)), sink, None);
        mapper.line(r#"{"type":"init","session_id":"abc","model":"gemini-2.5-pro"}"#);
        mapper.line(r#"{"type":"message","role":"user","content":"Make a slide"}"#);
        assert!(!mapper.reached);
        mapper.line(r#"{"type":"tool_use","tool_name":"mcp_slidr_slide_create","tool_id":"t1","parameters":{"title":"A"}}"#);
        mapper
            .line(r#"{"type":"tool_result","tool_id":"t1","status":"success","output":"created"}"#);
        mapper.line(r#"{"type":"tool_use","tool_name":"google_web_search","tool_id":"t2","parameters":{"query":"q"}}"#);
        mapper.line(r#"{"type":"tool_result","tool_id":"t2","status":"error","error":{"type":"X","message":"offline"}}"#);
        mapper.line(r#"{"type":"message","role":"assistant","content":"Done","delta":true}"#);
        mapper.line(r#"{"type":"result","status":"success","stats":{}}"#);
        assert!(matches!(events.try_recv(), Ok(AgentEvent::ToolCallStarted {
            name, source: ToolSource::App, input, ..
        }) if name == "slide_create" && input["title"] == "A"));
        assert!(
            matches!(events.try_recv(), Ok(AgentEvent::ToolCallFinished { ok: true, summary, .. }) if summary == "created")
        );
        assert!(matches!(events.try_recv(), Ok(AgentEvent::ToolCallStarted {
            name, source: ToolSource::Harness, ..
        }) if name == "google_web_search"));
        assert!(
            matches!(events.try_recv(), Ok(AgentEvent::ToolCallFinished { ok: false, summary, .. }) if summary == "offline")
        );
        assert!(matches!(events.try_recv(), Ok(AgentEvent::TextDelta { text }) if text == "Done"));
        assert!(events.try_recv().is_err());
        assert!(mapper.reached && !mapper.failed);
    }

    #[test]
    fn a_new_gemini_or_grok_conversation_is_announced_once_it_reaches_the_model() {
        for (kind, first, second) in [
            (
                Kind::Gemini,
                r#"{"type":"init","session_id":"id-1","model":"m"}"#,
                r#"{"type":"message","role":"assistant","content":"Hi","delta":true}"#,
            ),
            (
                Kind::Grok,
                r#"{"type":"available_commands","tools":[]}"#,
                r#"{"type":"text","data":"Hi"}"#,
            ),
        ] {
            let (sink, mut events) = EventSink::channel();
            let native = Arc::new(Mutex::new(Some("id-1".to_owned())));
            let mut mapper = Mapper::new(kind, native, sink, Some("m".into()));
            mapper.announce = true;
            mapper.line(first);
            assert!(events.try_recv().is_err(), "{kind:?}");
            mapper.line(second);
            mapper.line(second);
            assert!(matches!(events.try_recv(), Ok(AgentEvent::SessionStarted {
                native_session_id, model
            }) if native_session_id == "id-1" && model == "m"));
            assert!(matches!(
                events.try_recv(),
                Ok(AgentEvent::TextDelta { .. })
            ));
            assert!(matches!(
                events.try_recv(),
                Ok(AgentEvent::TextDelta { .. })
            ));
            assert!(events.try_recv().is_err());
        }
    }

    #[test]
    fn gemini_failure_keeps_its_message() {
        let (sink, _events) = EventSink::channel();
        let mut mapper = Mapper::new(Kind::Gemini, Arc::new(Mutex::new(None)), sink, None);
        mapper.line(r#"{"type":"error","severity":"warning","message":"Loop detected"}"#);
        mapper.line(r#"{"type":"error","severity":"error","message":"The model returned an empty response."}"#);
        mapper.line(r#"{"type":"result","status":"error"}"#);
        assert!(mapper.failed && !mapper.reached);
        assert_eq!(
            mapper.error.as_deref(),
            Some("The model returned an empty response.")
        );
    }

    #[test]
    fn maps_grok_stream_through_use_tool() {
        let (sink, mut events) = EventSink::channel();
        let mut mapper = Mapper::new(Kind::Grok, Arc::new(Mutex::new(None)), sink, None);
        mapper.line(r#"{"type":"thought","data":"Planning"}"#);
        mapper.line(r#"{"type":"tool_call","toolCallId":"c1","toolName":"use_tool","kind":"other","status":"pending","rawInput":{"tool_name":"slidr__slide_create","tool_input":{"title":"A"}}}"#);
        mapper.line(r#"{"type":"tool_call","toolCallId":"c1","toolName":"use_tool","status":"in_progress","rawInput":{}}"#);
        mapper.line(r#"{"type":"tool_call_update","toolCallId":"c1","status":"in_progress"}"#);
        mapper.line(r#"{"type":"tool_call_update","toolCallId":"c1","status":"completed","content":[{"type":"content","content":{"type":"text","text":"created"}}]}"#);
        mapper.line(r#"{"type":"tool_call_update","toolCallId":"c1","status":"completed","rawOutput":{"again":true}}"#);
        mapper.line(r#"{"type":"tool_call","toolCallId":"c2","toolName":"web_search","status":"in_progress","rawInput":{"query":"q"}}"#);
        mapper.line(r#"{"type":"tool_call_update","toolCallId":"c2","status":"failed","rawOutput":"blocked"}"#);
        mapper.line(r#"{"type":"text","data":"Done"}"#);
        mapper.line(r#"{"type":"end","stopReason":"end_turn","sessionId":"s"}"#);
        assert!(
            matches!(events.try_recv(), Ok(AgentEvent::ThinkingDelta { text }) if text == "Planning")
        );
        assert!(matches!(events.try_recv(), Ok(AgentEvent::ToolCallStarted {
            id, name, source: ToolSource::App, input
        }) if id == "c1" && name == "slide_create" && input["title"] == "A"));
        assert!(
            matches!(events.try_recv(), Ok(AgentEvent::ToolCallFinished { id, ok: true, summary }) if id == "c1" && summary == "created")
        );
        assert!(matches!(events.try_recv(), Ok(AgentEvent::ToolCallStarted {
            name, source: ToolSource::Harness, ..
        }) if name == "web_search"));
        assert!(
            matches!(events.try_recv(), Ok(AgentEvent::ToolCallFinished { ok: false, summary, .. }) if summary == "blocked")
        );
        assert!(matches!(events.try_recv(), Ok(AgentEvent::TextDelta { text }) if text == "Done"));
        assert!(events.try_recv().is_err());
        assert!(mapper.reached && !mapper.failed);

        let (sink, _events) = EventSink::channel();
        let mut mapper = Mapper::new(Kind::Grok, Arc::new(Mutex::new(None)), sink, None);
        mapper.line(r#"{"type":"error","message":"Not signed in."}"#);
        assert!(mapper.failed && !mapper.reached);
        assert_eq!(mapper.error.as_deref(), Some("Not signed in."));
    }

    #[test]
    fn gemini_and_grok_configuration_names_the_server_without_its_token() {
        let endpoint = ToolEndpoint {
            url: "http://127.0.0.1:4100/mcp".into(),
            token: "secret".into(),
        };
        let settings = gemini_settings(Some(&endpoint), true);
        let server = &settings["mcpServers"]["slidr"];
        assert_eq!(server["httpUrl"], "http://127.0.0.1:4100/mcp");
        assert_eq!(
            server["headers"]["Authorization"],
            "Bearer ${SLIDR_MCP_TOKEN}"
        );
        assert_eq!(server["trust"], true);
        assert_eq!(
            settings["tools"]["core"],
            json!(["mcp_slidr_*", "google_web_search", "web_fetch"])
        );
        let offline = gemini_settings(None, false);
        assert_eq!(offline["tools"]["core"], json!(["mcp_slidr_*"]));
        assert!(offline.get("mcpServers").is_none());
        assert!(!settings.to_string().contains("secret"));

        let toml = grok_config(Some(&endpoint));
        assert!(toml.starts_with("[mcp_servers.slidr]\n"));
        assert!(toml.contains("url = \"http://127.0.0.1:4100/mcp\""));
        assert!(toml.contains("Authorization = \"Bearer ${SLIDR_MCP_TOKEN}\""));
        assert!(!toml.contains("secret"));
        assert!(grok_config(None).is_empty());
    }

    fn test_run(kind: Kind, known: bool, web_access: bool) -> Run {
        Run {
            kind,
            workdir: PathBuf::from("work"),
            system_prompt: String::new(),
            endpoint: Some(ToolEndpoint {
                url: "http://127.0.0.1:4100/mcp".into(),
                token: "secret".into(),
            }),
            web_access,
            model: Some("model-a".into()),
            effort: None,
            native: Arc::new(Mutex::new(Some("id-1".into()))),
            known: Arc::new(AtomicBool::new(known)),
            sink: EventSink::new(|_| {}),
            stop: Arc::new(Notify::new()),
            resume: false,
        }
    }

    fn args(command: &Command) -> Vec<String> {
        command
            .as_std()
            .get_args()
            .map(|arg| arg.to_string_lossy().into_owned())
            .collect()
    }

    fn has_pair(args: &[String], flag: &str, value: &str) -> bool {
        args.windows(2)
            .any(|pair| pair[0] == flag && pair[1] == value)
    }

    #[test]
    fn gemini_and_grok_create_their_conversation_then_resume_it() {
        for kind in [Kind::Gemini, Kind::Grok] {
            let mut command = Command::new("cli");
            let run = test_run(kind, false, true);
            match kind {
                Kind::Gemini => run.gemini_args(&mut command),
                _ => run.grok_args(&mut command, Path::new("turn.json")),
            }
            let created = args(&command);
            assert!(has_pair(&created, "--session-id", "id-1"), "{created:?}");
            assert!(!created.contains(&"--resume".to_owned()));
            run.known.store(true, Ordering::SeqCst);
            let mut command = Command::new("cli");
            match kind {
                Kind::Gemini => run.gemini_args(&mut command),
                _ => run.grok_args(&mut command, Path::new("turn.json")),
            }
            let resumed = args(&command);
            assert!(has_pair(&resumed, "--resume", "id-1"), "{resumed:?}");
            assert!(has_pair(&resumed, "--model", "model-a"));
            assert!(!resumed.iter().any(|arg| arg.contains("secret")));
            let token = command
                .as_std()
                .get_envs()
                .find(|(key, _)| *key == TOKEN_ENV)
                .and_then(|(_, value)| value);
            assert_eq!(token, Some(std::ffi::OsStr::new("secret")));
        }
    }

    #[test]
    fn grok_runs_only_the_app_tools_and_the_web_tools_it_is_allowed() {
        let mut command = Command::new("grok");
        test_run(Kind::Grok, false, true).grok_args(&mut command, Path::new("turn.json"));
        let online = args(&command);
        assert!(has_pair(&online, "--permission-mode", "dontAsk"));
        assert!(has_pair(&online, "--allow", "MCPTool(slidr__*)"));
        assert!(has_pair(&online, "--allow", "WebFetch"));
        assert!(has_pair(&online, "--prompt-file", "turn.json"));
        assert!(!online.contains(&"--disable-web-search".to_owned()));
        let mut command = Command::new("grok");
        test_run(Kind::Grok, false, false).grok_args(&mut command, Path::new("turn.json"));
        let offline = args(&command);
        assert!(has_pair(
            &offline,
            "--disallowed-tools",
            "web_search,web_fetch"
        ));
        assert!(offline.contains(&"--disable-web-search".to_owned()));
        assert!(!offline.contains(&"WebFetch".to_owned()));
    }

    async fn real_tool_round_trip(
        kind: Kind,
    ) -> std::result::Result<(), Box<dyn std::error::Error>> {
        let bridge = ToolBridge::new();
        let calls = Arc::new(Mutex::new(Vec::<ToolCall>::new()));
        let received = Arc::clone(&calls);
        let webview = Arc::downgrade(&bridge);
        bridge.connect(move |call| {
            let answered = webview.upgrade().is_some_and(|bridge| {
                bridge.reply(
                    &call.call_id,
                    ToolReply {
                        content: vec![Content::Text {
                            text: "HERON-4821".into(),
                        }],
                        is_error: false,
                    },
                )
            });
            received
                .lock()
                .expect("the calls are not poisoned")
                .push(call);
            answered
        });
        let tool: ToolDef = serde_json::from_value(json!({
            "name": "deck_code_word",
            "description": "Returns the code word for a deck.",
            "inputSchema": { "type": "object", "properties": { "deck": { "type": "string" } }, "required": ["deck"] }
        }))?;
        let endpoint = bridge.open(vec![tool]).await?;
        let root = tempfile::tempdir()?;
        let harness = OneShotHarness { kind };
        let manager = HarnessManager::new(root.path().into(), vec![Arc::new(harness)]);
        let mut config = SessionConfig::new(
            Scope::Deck,
            "You are a Slidr test agent. Use the supplied Slidr tool to answer the user's request.",
            PathBuf::new(),
        );
        config.tool_endpoint = Some(ToolEndpoint {
            url: endpoint.url.clone(),
            token: endpoint.token.clone(),
        });
        config.web_access = false;
        let (sender, mut events) = tokio::sync::mpsc::unbounded_channel();
        let sender_second = sender.clone();
        let id = manager
            .start(kind.id(), "test/deck", config, move |event| {
                let _ = sender.send(event);
            })
            .await?;
        manager.send(&id, UserTurn::text(
            "Call the deck_code_word tool with deck set to plan. Reply with the exact code word it returns."
        )).await?;
        let mut seen = Vec::new();
        loop {
            let event = timeout(Duration::from_secs(120), events.recv())
                .await?
                .ok_or("event stream ended")?;
            let done = matches!(event, AgentEvent::TurnCompleted { .. });
            seen.push(event);
            if done {
                break;
            }
        }
        let native = manager
            .native_session_id(&id)
            .await?
            .ok_or("no native session id")?;
        manager.close(&id).await?;
        assert!(
            matches!(
                seen.last(),
                Some(AgentEvent::TurnCompleted {
                    outcome: TurnOutcome::Completed
                })
            ),
            "{seen:?}"
        );
        // In a block of its own: the guard is gone before the turns below are awaited.
        {
            let calls = calls.lock().map_err(|_| "the calls are poisoned")?;
            assert_eq!(calls.len(), 1, "{seen:?}");
            assert_eq!(calls[0].name, "deck_code_word");
            assert_eq!(calls[0].input["deck"], "plan");
        }
        assert!(
            seen.iter()
                .any(|event| matches!(event, AgentEvent::ToolCallStarted {
            name, source: ToolSource::App, ..
        } if name == "deck_code_word")),
            "{seen:?}"
        );
        assert!(
            seen.iter()
                .any(|event| matches!(event, AgentEvent::ToolCallFinished {
            ok: true, summary, ..
        } if summary.contains("HERON-4821"))),
            "{seen:?}"
        );
        assert!(seen.iter().any(|event| matches!(event, AgentEvent::TextDelta { text } if text.contains("HERON-4821"))), "{seen:?}");

        let mut resumed = SessionConfig::new(
            Scope::Deck,
            "You are a Slidr test agent. Use the supplied Slidr tool to answer the user's request.",
            PathBuf::new(),
        );
        resumed.tool_endpoint = Some(ToolEndpoint {
            url: endpoint.url,
            token: endpoint.token,
        });
        resumed.web_access = false;
        resumed.resume = Some(native);
        let id = manager
            .start(kind.id(), "test/deck", resumed, move |event| {
                let _ = sender_second.send(event);
            })
            .await?;
        manager.send(&id, UserTurn::text(
            "Without calling any tool, reply with the code word the tool returned in our earlier turn."
        )).await?;
        let mut resumed_events = Vec::new();
        loop {
            let event = timeout(Duration::from_secs(120), events.recv())
                .await?
                .ok_or("event stream ended")?;
            let done = matches!(event, AgentEvent::TurnCompleted { .. });
            resumed_events.push(event);
            if done {
                break;
            }
        }
        manager.close(&id).await?;
        assert!(
            matches!(
                resumed_events.last(),
                Some(AgentEvent::TurnCompleted {
                    outcome: TurnOutcome::Completed
                })
            ),
            "{resumed_events:?}"
        );
        assert!(resumed_events.iter().any(|event| matches!(event, AgentEvent::TextDelta { text } if text.contains("HERON-4821"))), "{resumed_events:?}");
        Ok(())
    }

    #[tokio::test(flavor = "multi_thread")]
    #[ignore = "runs the real Codex CLI on the owner's ChatGPT subscription"]
    async fn real_codex_calls_app_tool() -> std::result::Result<(), Box<dyn std::error::Error>> {
        real_tool_round_trip(Kind::Codex).await
    }

    #[tokio::test(flavor = "multi_thread")]
    #[ignore = "runs the real GitHub Copilot CLI on the owner's subscription"]
    async fn real_copilot_calls_app_tool() -> std::result::Result<(), Box<dyn std::error::Error>> {
        real_tool_round_trip(Kind::Copilot).await
    }

    #[tokio::test(flavor = "multi_thread")]
    #[ignore = "runs the real Gemini CLI on the owner's Google account"]
    async fn real_gemini_calls_app_tool() -> std::result::Result<(), Box<dyn std::error::Error>> {
        real_tool_round_trip(Kind::Gemini).await
    }

    #[tokio::test(flavor = "multi_thread")]
    #[ignore = "runs the real Grok CLI on the owner's xAI account"]
    async fn real_grok_calls_app_tool() -> std::result::Result<(), Box<dyn std::error::Error>> {
        real_tool_round_trip(Kind::Grok).await
    }
}
