//! Codex and GitHub Copilot adapters. Each turn is a non-interactive CLI invocation. Both CLIs
//! persist a conversation ID, so stopping a turn also stops its process and the next turn can
//! resume without leaving a background process behind.

use std::{
    collections::HashSet,
    io,
    path::{Path, PathBuf},
    process::Stdio,
    sync::{Arc, Mutex},
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
    EventSink, HarnessDescriptor, HarnessState, HarnessStatus, Result, SessionConfig, ToolSource,
    TurnOutcome, UserTurn,
};

const PROBE_TIMEOUT: Duration = Duration::from_secs(15);
const CLOSE_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Clone, Copy, PartialEq, Eq)]
enum Kind {
    Codex,
    Copilot,
}

impl Kind {
    fn name(self) -> &'static str {
        match self {
            Self::Codex => "Codex CLI",
            Self::Copilot => "GitHub Copilot CLI",
        }
    }
    fn id(self) -> &'static str {
        match self {
            Self::Codex => "codex-cli",
            Self::Copilot => "copilot-cli",
        }
    }
    fn login_hint(self) -> &'static str {
        match self {
            Self::Codex => "Run `codex login` in a terminal.",
            Self::Copilot => "Run `copilot login` in a terminal.",
        }
    }
    fn executable(self) -> Result<PathBuf> {
        match self {
            Self::Codex => crate::image_providers::codex_executable()
                .map_err(|message| AgentError::new(AgentErrorKind::NotInstalled, message)),
            Self::Copilot => copilot_executable().ok_or_else(|| AgentError::new(
                AgentErrorKind::NotInstalled,
                "GitHub Copilot CLI was not found. Install it and run `copilot login` in a terminal.",
            )),
        }
    }
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
}

#[async_trait]
impl AgentHarness for OneShotHarness {
    fn descriptor(&self) -> HarnessDescriptor {
        HarnessDescriptor {
            id: self.kind.id().into(),
            name: self.kind.name().into(),
            capabilities: Capabilities {
                streaming: self.kind == Kind::Copilot,
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

    async fn probe(&self) -> HarnessStatus {
        let make = |state, version, detail| HarnessStatus {
            state,
            version,
            account: None,
            detail,
        };
        let program = match self.kind.executable() {
            Ok(program) => program,
            Err(error) => return make(HarnessState::NotInstalled, None, Some(error.message)),
        };
        let mut command = Command::new(program);
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
            let mut login = Command::new(self.kind.executable().expect("program was found"));
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
            // Copilot has no documented non-interactive login-status command. A failed prompt
            // reports not_logged_in with the CLI's error text.
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
        if self.kind == Kind::Codex {
            tokio::fs::write(config.workdir.join("system.md"), &config.system_prompt)
                .await
                .map_err(|error| AgentError::io("write Codex instructions", &error))?;
        }
        if self.kind == Kind::Copilot {
            if let Some(endpoint) = &config.tool_endpoint {
                let mcp = json!({ "mcpServers": { "slidr": {
                    "type": "http", "url": endpoint.url, "tools": ["*"],
                    "headers": { "Authorization": format!("Bearer {}", endpoint.token) },
                    "timeout": 600000, "deferTools": "never"
                }}});
                tokio::fs::write(config.workdir.join("copilot-mcp.json"), mcp.to_string())
                    .await
                    .map_err(|error| AgentError::io("write Copilot tool configuration", &error))?;
            }
        }
        let native = Arc::new(Mutex::new(config.resume.clone().or_else(|| {
            (self.kind == Kind::Copilot).then(|| uuid::Uuid::new_v4().to_string())
        })));
        Ok(Box::new(OneShotSession {
            kind: self.kind,
            config,
            sink,
            native,
            active: None,
            started: false,
        }))
    }
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
            sink: self.sink.clone(),
            stop: Arc::clone(&stop),
            resume,
        };
        if first && self.kind == Kind::Copilot {
            self.sink.emit(AgentEvent::SessionStarted {
                native_session_id: self.native_session_id().expect("Copilot ID is allocated"),
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
    endpoint: Option<crate::harness::ToolEndpoint>,
    web_access: bool,
    model: Option<String>,
    effort: Option<String>,
    native: Arc<Mutex<Option<String>>>,
    sink: EventSink,
    stop: Arc<Notify>,
    resume: bool,
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

    async fn execute(&self, turn: UserTurn) -> Result<TurnOutcome> {
        let program = self.kind.executable()?;
        let attachments = self.workdir.join(ATTACHMENTS);
        let images = write_images(&attachments, &turn).await?;
        let prompt = match self.kind {
            Kind::Codex => [turn.context.as_deref().unwrap_or(""), &turn.text].join("\n\n"),
            Kind::Copilot => format!(
                "Slidr application instructions:\n{}\n\nCurrent context:\n{}\n\nUser request:\n{}",
                self.system_prompt,
                turn.context.as_deref().unwrap_or(""),
                turn.text
            ),
        };
        let mut command = Command::new(program);
        command
            .current_dir(&attachments)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        match self.kind {
            Kind::Codex => self.codex_args(&mut command, &images.0),
            Kind::Copilot => self.copilot_args(&mut command, &images.0),
        }
        no_window(&mut command);
        let mut child = command.spawn().map_err(|error| match error.kind() {
            io::ErrorKind::NotFound => AgentError::new(
                AgentErrorKind::NotInstalled,
                format!("{} was not found on PATH", self.kind.name()),
            ),
            _ => AgentError::io(format!("start {}", self.kind.name()), &error),
        })?;
        if let Some(mut stdin) = child.stdin.take() {
            let write = async {
                stdin
                    .write_all(prompt.as_bytes())
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
                    return Ok(TurnOutcome::Interrupted);
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
        if stopped {
            return Ok(TurnOutcome::Interrupted);
        }
        if mapper.failed || !status.success() {
            let message = mapper.error.unwrap_or_else(|| stderr.trim().to_owned());
            let message = if message.is_empty() {
                format!("{} exited with {status}", self.kind.name())
            } else {
                message
            };
            let kind = classify_error(&message, self.resume);
            self.sink.emit(AgentEvent::Error {
                kind,
                message,
                recoverable: kind != AgentErrorKind::ResumeFailed,
            });
            return Ok(TurnOutcome::Failed);
        }
        if self.kind == Kind::Codex
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
        Ok(TurnOutcome::Completed)
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
        if self.resume {
            if let Some(native) = self
                .native
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .clone()
            {
                command.args(["resume", &native]);
            }
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
}

struct TurnImages(Vec<PathBuf>);

impl Drop for TurnImages {
    fn drop(&mut self) {
        for path in &self.0 {
            let _ = std::fs::remove_file(path);
        }
    }
}

async fn write_images(dir: &Path, turn: &UserTurn) -> Result<TurnImages> {
    let mut paths = TurnImages(Vec::new());
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

fn classify_error(message: &str, resume: bool) -> AgentErrorKind {
    let lower = message.to_ascii_lowercase();
    if resume
        && (lower.contains("session not found")
            || lower.contains("no session found")
            || lower.contains("unknown session"))
    {
        AgentErrorKind::ResumeFailed
    } else if lower.contains("not logged in")
        || lower.contains("not authenticated")
        || lower.contains("no authentication")
        || lower.contains("login required")
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
    failed: bool,
    error: Option<String>,
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
            failed: false,
            error: None,
        }
    }

    fn line(&mut self, line: &str) {
        let Ok(value) = serde_json::from_str::<Value>(line) else {
            return;
        };
        match self.kind {
            Kind::Codex => self.codex(&value),
            Kind::Copilot => self.copilot(&value),
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
                if !self.streamed.contains(id) {
                    if let Some(text) = data["content"].as_str() {
                        self.sink.emit(AgentEvent::TextDelta { text: text.into() });
                    }
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
        assert_eq!(id.lock().unwrap().as_deref(), Some("abc"));
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
            received.lock().unwrap().push(call);
            answered
        });
        let tool: ToolDef = serde_json::from_value(json!({
            "name": "deck_code_word",
            "description": "Returns the code word for a deck.",
            "inputSchema": { "type": "object", "properties": { "deck": { "type": "string" } }, "required": ["deck"] }
        }))?;
        let endpoint = bridge.open(vec![tool]).await?;
        let root = tempfile::tempdir()?;
        let harness = match kind {
            Kind::Codex => OneShotHarness::codex(),
            Kind::Copilot => OneShotHarness::copilot(),
        };
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
        let calls = calls.lock().unwrap();
        assert_eq!(calls.len(), 1, "{seen:?}");
        assert_eq!(calls[0].name, "deck_code_word");
        assert_eq!(calls[0].input["deck"], "plan");
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
        drop(calls);

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
}
