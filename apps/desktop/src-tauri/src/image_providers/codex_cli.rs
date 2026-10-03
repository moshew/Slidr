//! The Codex CLI provider (GEN-02, ADR-004): one `codex exec` process per image, on the user's
//! ChatGPT sign-in. The app holds no API key.
//!
//! ```text
//! codex exec --json --skip-git-repo-check --ignore-user-config --ignore-rules --ephemeral
//!       -s read-only "<prompt>" [-i <reference image>]
//! cwd: an empty temp folder      stdin: closed      stdout: one JSON event per line
//! ```
//!
//! The CLI's agent calls its built-in image tool, which writes the picture to
//! `$CODEX_HOME/generated_images/<thread_id>/`; the thread id is in the first event. None of
//! this is an official API: it is what version 0.160.0 does (ADR-004), and `probe` reports the
//! version it finds.
//!
//! What a run leaves on disk, and what becomes of it (ADR-025):
//!
//! - the temp working folder is removed when the run ends, however it ends;
//! - `generated_images/<thread_id>/` is read, then removed: the picture now lives in the
//!   workspace, and nothing else refers to the folder (`--ephemeral` keeps no session). Only the
//!   folder of the run's own thread is touched.

use std::{
    collections::VecDeque,
    ffi::{OsStr, OsString},
    io,
    path::{Path, PathBuf},
    process::{ExitStatus, Stdio},
    time::{Duration, SystemTime},
};

use async_trait::async_trait;
use serde_json::Value;
use tokio::{
    io::{AsyncBufReadExt, BufReader},
    process::ChildStderr,
    time::timeout,
};

use crate::image_providers::{
    Aspect, Cancel, Capabilities, EditRequest, EditSupport, GenerateRequest, GeneratedImage,
    ImageError, ImageErrorKind, ImageProvider, ProviderDescriptor, ProviderState, ProviderStatus,
    Result,
};

/// What every prompt starts with (spike WG0-S4): without it the agent sometimes writes code that
/// draws the picture instead of calling its image tool. Starting with a word also means the
/// prompt can never read as a flag.
const RULE: &str = "Use your image generation tool. Do not write or run any code. When the image \
                    exists, reply with only its file path.";
/// The prompt is one command-line argument; Windows allows about 32,000 characters for all of
/// them together.
const MAX_PROMPT_CHARS: usize = 8000;
/// Under `$CODEX_HOME`: where the image tool writes, one folder per thread.
const GENERATED: &str = "generated_images";

/// Windows: start the CLI without a console window.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
/// An image takes 43 to 95 seconds (ADR-004). Past this the process is taken for hung and ended.
const RUN_TIMEOUT: Duration = Duration::from_secs(240);
const PROBE_TIMEOUT: Duration = Duration::from_secs(20);
/// How long the rest of stderr is waited for once the process has ended.
const STDERR_GRACE: Duration = Duration::from_secs(2);
/// stderr lines kept for the error message when the process dies.
const STDERR_LINES: usize = 12;
/// Length of the CLI's own words in an error message, in characters.
const SAID_CHARS: usize = 400;

const INSTALL_HINT: &str = "The Codex CLI was not found. Install it (`npm install -g \
                            @openai/codex`), then run `codex login` in a terminal.";
const LOGIN_HINT: &str = "The Codex CLI is not signed in. Run `codex login` in a terminal and \
                          sign in with ChatGPT.";

/// The provider.
pub struct CodexCli {
    /// `None`: found on the PATH at every use, so installing the CLI takes no restart.
    program: Option<Program>,
    /// `None`: `$CODEX_HOME`, else `~/.codex`, as the CLI itself decides.
    home: Option<PathBuf>,
    timeout: Duration,
}

/// What to start.
#[derive(Debug, Clone)]
struct Program {
    path: PathBuf,
    /// Arguments before the CLI's own; only the tests' stand-in CLI has any.
    prefix: Vec<OsString>,
}

impl Default for CodexCli {
    fn default() -> Self {
        Self::new()
    }
}

impl CodexCli {
    /// The provider for the `codex` on the PATH.
    pub fn new() -> Self {
        Self {
            program: None,
            home: None,
            timeout: RUN_TIMEOUT,
        }
    }

    fn program(&self) -> Result<Program> {
        if let Some(program) = &self.program {
            return Ok(program.clone());
        }
        let not_installed =
            |message: String| ImageError::new(ImageErrorKind::NotInstalled, message);
        let Some(target) = Target::current() else {
            return Err(not_installed(
                "The Codex CLI has no build for this platform.".into(),
            ));
        };
        let path = std::env::var_os("PATH").unwrap_or_default();
        match locate(std::env::split_paths(&path), &target) {
            Located::Program(path) => Ok(Program {
                path,
                prefix: Vec::new(),
            }),
            Located::Shim(shim) => Err(not_installed(format!(
                "Found {} but not the program it starts. Reinstall the Codex CLI with `npm \
                 install -g @openai/codex`.",
                shim.display()
            ))),
            Located::Nothing => Err(not_installed(INSTALL_HINT.into())),
        }
    }

    /// Where the CLI keeps its files.
    fn home(&self) -> Result<PathBuf> {
        let from_env = || {
            std::env::var_os("CODEX_HOME")
                .filter(|home| !home.is_empty())
                .map(PathBuf::from)
        };
        self.home
            .clone()
            .or_else(from_env)
            .or_else(|| std::env::home_dir().map(|home| home.join(".codex")))
            .ok_or_else(|| ImageError::internal("no home folder to look for the CLI's files in"))
    }

    /// The CLI without an API key from the environment, and, on Windows, without a console
    /// window. The provider's promise is the ChatGPT sign-in (ADR-004): a key that happens to
    /// be set must not turn a run into one billed by use.
    fn command(&self, program: &Program) -> std::process::Command {
        let mut command = std::process::Command::new(&program.path);
        command.args(&program.prefix);
        command
            .env_remove("CODEX_API_KEY")
            .env_remove("OPENAI_API_KEY");
        if let Some(home) = &self.home {
            command.env("CODEX_HOME", home);
        }
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(CREATE_NO_WINDOW);
        }
        command
    }

    /// Runs a short CLI command to completion.
    async fn output(&self, program: &Program, args: &[&str]) -> io::Result<std::process::Output> {
        let mut command = tokio::process::Command::from(self.command(program));
        command.args(args).stdin(Stdio::null()).kill_on_drop(true);
        timeout(PROBE_TIMEOUT, command.output())
            .await
            .map_err(|_| io::Error::new(io::ErrorKind::TimedOut, "no answer in time"))?
    }

    /// One `codex exec`, from the spawn to the picture in memory and nothing left behind.
    async fn run(
        &self,
        prompt: String,
        reference: Option<&Path>,
        mut cancel: Cancel,
    ) -> Result<GeneratedImage> {
        if prompt.chars().count() > MAX_PROMPT_CHARS || prompt.contains('\0') {
            return Err(ImageError::invalid_input(format!(
                "the prompt must be at most {MAX_PROMPT_CHARS} characters of text"
            )));
        }
        let program = self.program()?;
        let home = self.home()?;
        let workdir = Workdir::create()
            .map_err(|e| ImageError::io("create a working folder for the Codex CLI", &e))?;
        let mut command = tokio::process::Command::from(self.command(&program));
        command
            .args(args(&prompt, reference))
            .current_dir(&workdir.0)
            // Closed: with a pipe the CLI waits to append what it reads to the prompt.
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        let mut child = command.spawn().map_err(|e| match e.kind() {
            io::ErrorKind::NotFound => ImageError::new(ImageErrorKind::NotInstalled, INSTALL_HINT),
            _ => ImageError::io("start the Codex CLI", &e),
        })?;
        let (Some(stdout), Some(stderr)) = (child.stdout.take(), child.stderr.take()) else {
            return Err(ImageError::internal("the CLI's pipes were not captured"));
        };
        let stderr = tokio::spawn(tail(stderr));

        let mut transcript = Transcript::default();
        let ended = {
            let finish = async {
                let mut lines = BufReader::new(stdout).lines();
                loop {
                    match lines.next_line().await {
                        Ok(Some(line)) => transcript.read(&line),
                        // A line that is not UTF-8 is not an event; the pipe must still drain.
                        Err(e) if e.kind() == io::ErrorKind::InvalidData => {}
                        Ok(None) | Err(_) => break,
                    }
                }
                child.wait().await
            };
            tokio::select! {
                status = finish => Ok(status),
                () = cancel.cancelled() => Err(ImageError::cancelled()),
                () = tokio::time::sleep(self.timeout) => Err(ImageError::new(
                    ImageErrorKind::Timeout,
                    format!(
                        "the Codex CLI did not finish within {} seconds and was stopped",
                        self.timeout.as_secs()
                    ),
                )),
            }
        };
        if ended.is_err() {
            // Ends the process and waits for it to be gone: a cancelled or hung run leaves
            // nothing running by the time this call returns.
            let _ = child.kill().await;
        }
        // The pipe closes with the process. A helper the CLI started could hold it open past
        // that; the call does not wait on one.
        let stderr = timeout(STDERR_GRACE, stderr)
            .await
            .ok()
            .and_then(|tail| tail.ok())
            .unwrap_or_default();

        let folder = transcript
            .thread_id
            .as_deref()
            .map(|thread| home.join(GENERATED).join(thread));
        let image = match ended {
            Ok(status) => match transcript.verdict(status.ok(), &stderr) {
                Ok(()) => collect(folder.as_deref(), &transcript).await,
                Err(failed) => Err(failed),
            },
            Err(stopped) => Err(stopped),
        };
        // The picture is in memory by now, or the run is one whose picture nobody wants.
        if let Some(folder) = &folder {
            let _ = tokio::fs::remove_dir_all(folder).await;
        }
        drop(workdir);
        image
    }
}

#[async_trait]
impl ImageProvider for CodexCli {
    fn descriptor(&self) -> ProviderDescriptor {
        ProviderDescriptor {
            id: "codex-cli".into(),
            name: "Codex CLI".into(),
            capabilities: Capabilities {
                // ADR-004: `-i` gives the agent a reference, and what comes back is a new
                // picture after it. No mask, and nothing of the source is kept.
                edit: EditSupport::Regenerate,
                mask: false,
                transparent: false,
                // Four processes at once is what was measured (ADR-004).
                max_parallel: 4,
            },
        }
    }

    /// `codex --version` and `codex login status`.
    async fn probe(&self) -> ProviderStatus {
        let status =
            |state, version, account: Option<&str>, detail: Option<String>| ProviderStatus {
                state,
                version,
                account: account.map(Into::into),
                detail,
            };
        let program = match self.program() {
            Ok(program) => program,
            Err(e) => return status(ProviderState::NotInstalled, None, None, Some(e.message)),
        };
        let (version, login) = tokio::join!(
            self.output(&program, &["--version"]),
            self.output(&program, &["login", "status"])
        );
        let version = match version {
            Ok(out) => parse_version(&out.stdout),
            Err(e) if e.kind() == io::ErrorKind::NotFound => {
                return status(
                    ProviderState::NotInstalled,
                    None,
                    None,
                    Some(INSTALL_HINT.into()),
                );
            }
            Err(e) => {
                return status(
                    ProviderState::Unavailable,
                    None,
                    None,
                    Some(format!("`codex --version` failed: {e}")),
                );
            }
        };
        match login {
            // The answer is on stderr: "Logged in using ChatGPT", or "Not logged in" and exit 1.
            Ok(out) => {
                let said = [out.stdout, out.stderr].concat();
                let said = String::from_utf8_lossy(&said);
                if !out.status.success() || said.contains("Not logged in") {
                    let hint = Some(LOGIN_HINT.into());
                    status(ProviderState::NotLoggedIn, version, None, hint)
                } else {
                    status(ProviderState::Ready, version, account(&said), None)
                }
            }
            Err(e) => status(
                ProviderState::Unavailable,
                version,
                None,
                Some(format!("`codex login status` failed: {e}")),
            ),
        }
    }

    async fn generate(&self, request: &GenerateRequest, cancel: Cancel) -> Result<GeneratedImage> {
        self.run(generate_prompt(request), None, cancel).await
    }

    async fn edit(&self, request: &EditRequest, cancel: Cancel) -> Result<GeneratedImage> {
        let prompt = edit_prompt(&request.instruction);
        self.run(prompt, Some(&request.source), cancel).await
    }
}

/// "codex-cli 0.160.0"
fn parse_version(stdout: &[u8]) -> Option<String> {
    String::from_utf8_lossy(stdout)
        .split_whitespace()
        .last()
        .map(str::to_owned)
}

/// The sign-in method, and nothing else of the line: with an API key the CLI prints part of it.
fn account(said: &str) -> Option<&'static str> {
    if said.contains("ChatGPT") {
        Some("ChatGPT")
    } else if said.contains("API key") {
        Some("API key")
    } else {
        None
    }
}

/// The aspect ratio is set by the wording; the size is whatever the model then chooses (ADR-004
/// rule 4).
fn generate_prompt(request: &GenerateRequest) -> String {
    let shape = match request.aspect {
        Aspect::Wide => "wide 16:9 landscape",
        Aspect::Landscape => "4:3 landscape",
        Aspect::Square => "square 1:1",
        Aspect::Portrait => "3:4 portrait",
        Aspect::Tall => "tall 9:16 portrait",
    };
    format!("{RULE} Create ONE {shape} image: {}", request.prompt.trim())
}

fn edit_prompt(instruction: &str) -> String {
    format!(
        "{RULE} Edit the attached image, keeping its aspect ratio. Produce ONE image. The edit: {}",
        instruction.trim()
    )
}

/// The command line of ADR-004. The prompt goes before `-i`: the flag takes any number of files
/// and would take a prompt after it for one of them (rule 3).
fn args(prompt: &str, reference: Option<&Path>) -> Vec<OsString> {
    let mut args: Vec<OsString> = [
        "exec",
        "--json",
        "--skip-git-repo-check",
        "--ignore-user-config",
        "--ignore-rules",
        "--ephemeral",
        "-s",
        "read-only",
    ]
    .into_iter()
    .map(OsString::from)
    .collect();
    args.push(prompt.into());
    if let Some(reference) = reference {
        args.push("-i".into());
        args.push(reference.into());
    }
    args
}

/// The platform's names in the npm packaging of the CLI.
struct Target {
    windows: bool,
    /// The package under `@openai` that holds the native program.
    package: &'static str,
    triple: &'static str,
}

impl Target {
    fn current() -> Option<Self> {
        let (package, triple) = match (std::env::consts::OS, std::env::consts::ARCH) {
            ("windows", "x86_64") => ("codex-win32-x64", "x86_64-pc-windows-msvc"),
            ("windows", "aarch64") => ("codex-win32-arm64", "aarch64-pc-windows-msvc"),
            ("macos", "x86_64") => ("codex-darwin-x64", "x86_64-apple-darwin"),
            ("macos", "aarch64") => ("codex-darwin-arm64", "aarch64-apple-darwin"),
            ("linux", "x86_64") => ("codex-linux-x64", "x86_64-unknown-linux-musl"),
            ("linux", "aarch64") => ("codex-linux-arm64", "aarch64-unknown-linux-musl"),
            _ => return None,
        };
        Some(Self {
            windows: cfg!(windows),
            package,
            triple,
        })
    }

    fn program_name(&self) -> &'static str {
        if self.windows { "codex.exe" } else { "codex" }
    }
}

/// What `codex` on the PATH leads to.
#[derive(Debug, PartialEq, Eq)]
enum Located {
    /// The native program.
    Program(PathBuf),
    /// Only npm's shim, without the program it starts.
    Shim(PathBuf),
    Nothing,
}

/// Finds the native Codex program.
///
/// An npm install puts only a shim on the PATH: `codex.cmd` on Windows, a link to `codex.js`
/// elsewhere. The shim starts Node, and `codex.js` starts the real program from the platform's
/// package. The provider starts that program itself, for two reasons. A `.cmd` runs through
/// `cmd.exe`, whose quoting would stand between the app and a free-text prompt. And with Node
/// in between, ending the process would end Node and leave the real one running.
///
/// The branch for a link to `codex.js` was not run: this was built and tested on Windows.
fn locate(dirs: impl Iterator<Item = PathBuf>, target: &Target) -> Located {
    let mut shim = None;
    for dir in dirs {
        if target.windows {
            // A standalone install: the program itself is on the PATH.
            let program = dir.join(target.program_name());
            if program.is_file() {
                return Located::Program(program);
            }
        }
        let link = dir.join(if target.windows { "codex.cmd" } else { "codex" });
        if !link.is_file() {
            continue;
        }
        let package = if target.windows {
            // npm keeps a global package next to its shim.
            Some(dir.join("node_modules").join("@openai").join("codex"))
        } else {
            match std::fs::canonicalize(&link) {
                // <package>/bin/codex.js
                Ok(script) if script.file_name() == Some(OsStr::new("codex.js")) => script
                    .parent()
                    .and_then(Path::parent)
                    .map(Path::to_path_buf),
                _ => return Located::Program(link),
            }
        };
        match package.and_then(|package| native_program(&package, target)) {
            Some(program) => return Located::Program(program),
            None => {
                shim.get_or_insert(link);
            }
        }
    }
    shim.map_or(Located::Nothing, Located::Shim)
}

/// The native program of the npm package at `package`, looked up as its own `codex.js` does: in
/// the platform's package, from the nearest `node_modules` upward, then in the package itself.
fn native_program(package: &Path, target: &Target) -> Option<PathBuf> {
    let program = Path::new("vendor")
        .join(target.triple)
        .join("bin")
        .join(target.program_name());
    package
        .ancestors()
        // The package's own dependencies, then the folder it is installed in.
        .take(4)
        .map(|dir| {
            dir.join("node_modules")
                .join("@openai")
                .join(target.package)
                .join(&program)
        })
        .chain([package.join(&program)])
        .find(|path| path.is_file())
}

/// The empty folder a run works in, so the CLI's agent has nothing to read. Removed with it.
struct Workdir(PathBuf);

impl Workdir {
    fn create() -> io::Result<Self> {
        let name = format!("slidr-image-{}", uuid::Uuid::new_v4().simple());
        let dir = std::env::temp_dir().join(name);
        std::fs::create_dir_all(&dir)?;
        Ok(Self(dir))
    }
}

impl Drop for Workdir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

/// What the `--json` lines of a run said.
#[derive(Debug, Default)]
struct Transcript {
    /// From `thread.started`: the name of the folder the image tool writes to.
    thread_id: Option<String>,
    /// The agent's last message. Never trusted for where the picture is (ADR-004 rule 1): it
    /// only chooses between the files of the thread's folder, and explains a run that made none.
    last_message: Option<String>,
    /// `turn.completed` arrived.
    completed: bool,
    /// The message of `turn.failed`.
    failure: Option<String>,
    /// The last `error` line. The CLI reports its retries this way too, so it means something
    /// only when the run then ends without a turn.
    last_error: Option<String>,
}

impl Transcript {
    fn read(&mut self, line: &str) {
        // Anything that is not JSON is the CLI talking to a terminal; nothing to read.
        let Ok(event) = serde_json::from_str::<Value>(line) else {
            return;
        };
        let text = |value: &Value| value.as_str().map(str::to_owned);
        match event["type"].as_str() {
            // The id becomes a folder name: anything but a plain token could point elsewhere.
            Some("thread.started") => {
                self.thread_id = text(&event["thread_id"]).filter(|id| {
                    !id.is_empty()
                        && id.len() <= 64
                        && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
                });
            }
            Some("item.completed") if event["item"]["type"] == "agent_message" => {
                self.last_message = text(&event["item"]["text"]);
            }
            Some("turn.completed") => self.completed = true,
            Some("turn.failed") => {
                self.failure = Some(text(&event["error"]["message"]).unwrap_or_default());
            }
            Some("error") => self.last_error = text(&event["message"]),
            // turn.started, and items that are not the agent's words (warnings, tool calls).
            _ => {}
        }
    }

    /// Whether the run ended as one that may have made a picture: a completed turn and a clean
    /// exit. Anything else is an error, even if a file is there: it may be half written.
    fn verdict(&self, exit: Option<ExitStatus>, stderr: &str) -> Result<()> {
        if let Some(said) = &self.failure {
            return Err(failure(said));
        }
        if self.completed && exit.is_some_and(|status| status.success()) {
            return Ok(());
        }
        let said = self
            .last_error
            .as_deref()
            .filter(|said| !said.is_empty())
            .unwrap_or(stderr);
        let how = match exit.and_then(|status| status.code()) {
            Some(code) => format!("with exit code {code}"),
            None => "without an exit code".to_owned(),
        };
        Err(failure(&format!(
            "the CLI stopped {how} before it was done. {said}"
        )))
    }
}

/// The error for what the CLI said went wrong.
fn failure(said: &str) -> ImageError {
    let kind = classify(said);
    let said: String = said.chars().take(SAID_CHARS).collect();
    let message = match kind {
        ImageErrorKind::NotLoggedIn => format!("{LOGIN_HINT} The CLI said: {said}"),
        ImageErrorKind::Quota => format!(
            "The usage limit of the ChatGPT plan was reached. Wait for it to reset, or use \
             another image provider. The CLI said: {said}"
        ),
        _ => format!("Codex could not make the image: {said}"),
    };
    ImageError::new(kind, message)
}

/// The kind of failure the CLI's own words describe.
///
/// The sign-in words are from a recorded run without credentials (`codex_cli/unauthorized.jsonl`).
/// The limit words are not from a recording: no run here ever reached a limit (ADR-025). They are
/// how such errors are usually worded, and a limit worded otherwise comes out as
/// `generation_failed`, with the CLI's text in the message.
fn classify(said: &str) -> ImageErrorKind {
    let said = said.to_ascii_lowercase();
    let says = |words: &[&str]| words.iter().any(|word| said.contains(word));
    // No bare status numbers: request ids are hex, and would match them by chance.
    if says(&[
        "unauthorized",
        "status 401",
        "\"status\":401",
        "not logged in",
        "sign in again",
        "refresh token",
    ]) {
        ImageErrorKind::NotLoggedIn
    } else if says(&[
        "too many requests",
        "status 429",
        "\"status\":429",
        "usage limit",
        "usage_limit",
        "rate limit",
        "rate_limit",
        "quota",
    ]) {
        ImageErrorKind::Quota
    } else {
        ImageErrorKind::GenerationFailed
    }
}

/// The picture a completed run left in its thread's folder.
async fn collect(folder: Option<&Path>, transcript: &Transcript) -> Result<GeneratedImage> {
    let mut files = Vec::new();
    if let Some(folder) = folder
        && let Ok(mut entries) = tokio::fs::read_dir(folder).await
    {
        while let Ok(Some(entry)) = entries.next_entry().await {
            if let Ok(meta) = entry.metadata().await
                && meta.is_file()
            {
                let written = meta.modified().unwrap_or(SystemTime::UNIX_EPOCH);
                files.push((entry.path(), written));
            }
        }
    }
    let Some(file) = pick(files, transcript.last_message.as_deref()) else {
        let said = transcript.last_message.as_deref().unwrap_or("nothing");
        let said: String = said.chars().take(SAID_CHARS).collect();
        return Err(ImageError::new(
            ImageErrorKind::GenerationFailed,
            format!("Codex finished without making an image. It said: {said}"),
        ));
    };
    let bytes = tokio::fs::read(&file)
        .await
        .map_err(|e| ImageError::io("read the generated image", &e))?;
    Ok(GeneratedImage { bytes })
}

/// ADR-004 rule 2: of several files, the one the agent named; when it named none, the newest.
fn pick(mut files: Vec<(PathBuf, SystemTime)>, said: Option<&str>) -> Option<PathBuf> {
    files.sort_by(|a, b| (a.1, &a.0).cmp(&(b.1, &b.0)));
    let named = said.and_then(|said| {
        files.iter().rposition(|(file, _)| {
            file.file_name()
                .and_then(OsStr::to_str)
                .is_some_and(|name| said.contains(name))
        })
    });
    let chosen = named.or(files.len().checked_sub(1))?;
    Some(files.swap_remove(chosen).0)
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

#[cfg(test)]
mod tests {
    use std::{fs, sync::Arc};

    use super::*;
    use crate::{
        image_providers::{EditJob, GenerateJob, ImageOutcome, ImageService},
        storage::Storage,
    };

    type TestResult = std::result::Result<(), Box<dyn std::error::Error>>;
    type TestResultOf<T> = std::result::Result<T, Box<dyn std::error::Error>>;

    /// Real runs of Codex CLI 0.160.0, recorded by spike WG0-S4 and by this work group. The
    /// user's name and the request ids were replaced; nothing else.
    const GENERATE: &str = include_str!("codex_cli/generate.jsonl");
    /// The agent could not say where the picture was; the picture was there.
    const GENERATE_NO_PATH: &str = include_str!("codex_cli/generate-no-path.jsonl");
    /// An edit with a reference image. The thread's folder held two files after it.
    const EDIT: &str = include_str!("codex_cli/edit.jsonl");
    /// A run with an empty `CODEX_HOME`: no credentials. Fifteen seconds of retries, then this.
    const UNAUTHORIZED: &str = include_str!("codex_cli/unauthorized.jsonl");
    /// A run asking for a model that does not exist: a request the service refused.
    const REJECTED: &str = include_str!("codex_cli/rejected.jsonl");

    fn transcript(recording: &str) -> Transcript {
        let mut transcript = Transcript::default();
        for line in recording.lines() {
            transcript.read(line);
        }
        transcript
    }

    fn clean_exit() -> Option<ExitStatus> {
        Some(ExitStatus::default())
    }

    fn files(names: &[&str]) -> Vec<(PathBuf, SystemTime)> {
        let earliest = SystemTime::UNIX_EPOCH;
        (0_u64..)
            .zip(names)
            .map(|(age, name)| (PathBuf::from(name), earliest + Duration::from_secs(age)))
            .collect()
    }

    #[test]
    fn reads_the_recorded_runs() {
        let run = transcript(GENERATE);
        assert_eq!(
            run.thread_id.as_deref(),
            Some("01a0feab-fc48-78f0-9e41-786add79b1d7")
        );
        assert!(run.completed && run.failure.is_none() && run.last_error.is_none());
        assert!(run.verdict(clean_exit(), "").is_ok());
        assert!(
            run.last_message
                .as_deref()
                .is_some_and(|said| said.ends_with("exec-fc14b4f9-e99c-4724-8a72-b83a04a9cf83.png"))
        );

        // Rule 1: the agent's words do not decide whether there is a picture.
        let run = transcript(GENERATE_NO_PATH);
        assert!(run.verdict(clean_exit(), "").is_ok());
        assert_eq!(
            run.last_message.as_deref(),
            Some("The image tool completed, but I couldn\u{2019}t retrieve its file path.")
        );
        assert_eq!(
            pick(files(&["exec-7a125887.png"]), run.last_message.as_deref()),
            Some(PathBuf::from("exec-7a125887.png"))
        );

        // Rule 2, with the two files the recorded edit left, oldest first.
        let run = transcript(EDIT);
        let left = [
            "exec-ceb041b1-01f4-44c7-93d1-52caeef16a3f.png",
            "exec-b2c79ef5-af54-4c66-96cf-b8f07586338e.png",
        ];
        assert_eq!(
            pick(files(&left), run.last_message.as_deref()),
            Some(PathBuf::from(left[1]))
        );
    }

    #[test]
    fn the_named_file_wins_and_the_newest_is_the_fallback() {
        let three = ["a.png", "b.png", "c.png"];
        let picked = |said: Option<&str>| pick(files(&three), said);
        assert_eq!(picked(Some("C:\\x\\a.png")), Some("a.png".into()));
        assert_eq!(picked(Some("made a.png, then b.png")), Some("b.png".into()));
        assert_eq!(picked(Some("done")), Some("c.png".into()));
        assert_eq!(picked(None), Some("c.png".into()));
        assert_eq!(pick(Vec::new(), Some("a.png")), None);
    }

    #[test]
    fn a_run_without_credentials_is_not_logged_in() {
        let run = transcript(UNAUTHORIZED);
        assert!(!run.completed);
        let Err(error) = run.verdict(None, "") else {
            panic!("the run counted as completed");
        };
        assert_eq!(error.kind, ImageErrorKind::NotLoggedIn);
        assert!(error.message.starts_with(LOGIN_HINT), "{}", error.message);
        assert!(error.message.contains("401 Unauthorized"));
    }

    #[test]
    fn a_refused_request_is_a_failed_generation() {
        let run = transcript(REJECTED);
        let Err(error) = run.verdict(None, "") else {
            panic!("the run counted as completed");
        };
        assert_eq!(error.kind, ImageErrorKind::GenerationFailed);
        assert!(
            error.message.contains("is not supported when using Codex"),
            "{}",
            error.message
        );
    }

    #[test]
    fn a_run_that_dies_reports_what_it_last_said() {
        // No turn at all: the last `error` line, or else stderr.
        let mut run = transcript(GENERATE);
        run.completed = false;
        let Err(error) = run.verdict(None, "thread 'main' panicked") else {
            panic!("the run counted as completed");
        };
        assert_eq!(error.kind, ImageErrorKind::GenerationFailed);
        assert!(error.message.contains("thread 'main' panicked"));
        run.last_error = Some("stream error: status 429 Too Many Requests".into());
        assert_eq!(
            run.verdict(None, "noise").err().map(|e| e.kind),
            Some(ImageErrorKind::Quota)
        );
    }

    #[test]
    fn failures_are_told_apart_by_the_clis_words() {
        use ImageErrorKind::{GenerationFailed, NotLoggedIn, Quota};
        let cases = [
            (
                "unexpected status 401 Unauthorized: Missing bearer",
                NotLoggedIn,
            ),
            ("Not logged in", NotLoggedIn),
            (
                "Your access token could not be refreshed. Please sign in again.",
                NotLoggedIn,
            ),
            ("You've hit your usage limit. Try again at 3:10 PM.", Quota),
            ("{\"type\":\"error\",\"status\":429,\"error\":{}}", Quota),
            (
                "exceeded retry limit, last status: 429 Too Many Requests",
                Quota,
            ),
            ("stream disconnected before completion", GenerationFailed),
            // A request id is hex: digits that look like a status are not one.
            (
                "status 400 Bad Request, request id: req_4012a4296f",
                GenerationFailed,
            ),
        ];
        for (said, kind) in cases {
            assert_eq!(classify(said), kind, "{said}");
        }
        // The CLI's words are part of the message, cut to a length a tool result can carry.
        let long = failure(&"x".repeat(SAID_CHARS * 3));
        assert!(long.message.chars().count() < SAID_CHARS + 100);
    }

    fn strings(args: &[OsString]) -> Vec<String> {
        args.iter()
            .map(|a| a.to_string_lossy().replace('\\', "/"))
            .collect()
    }

    #[test]
    fn command_line_follows_the_adr() {
        const FLAGS: &str = "exec --json --skip-git-repo-check --ignore-user-config \
                             --ignore-rules --ephemeral -s read-only";
        assert_eq!(
            strings(&args("a barn", None)).join(" "),
            format!("{FLAGS} a barn")
        );
        // Rule 3: the prompt, then `-i`.
        let with_reference = strings(&args("make it night", Some(Path::new("/w/assets/ab.png"))));
        assert_eq!(
            with_reference.join(" "),
            format!("{FLAGS} make it night -i /w/assets/ab.png")
        );
        // The prompt is one argument, whatever is in it.
        let odd = "say \"hi\" & del *.* | %PATH% ^ \n-i x.png";
        assert_eq!(args(odd, None).last(), Some(&OsString::from(odd)));
    }

    #[test]
    fn the_prompt_words_the_shape_and_never_reads_as_a_flag() {
        let prompt = |text: &str, aspect| {
            generate_prompt(&GenerateRequest {
                prompt: text.into(),
                aspect,
            })
        };
        let shapes = [
            (Aspect::Wide, "ONE wide 16:9 landscape image"),
            (Aspect::Landscape, "ONE 4:3 landscape image"),
            (Aspect::Square, "ONE square 1:1 image"),
            (Aspect::Portrait, "ONE 3:4 portrait image"),
            (Aspect::Tall, "ONE tall 9:16 portrait image"),
        ];
        for (aspect, words) in shapes {
            let prompt = prompt("  --help\n", aspect);
            assert!(prompt.starts_with("Use your image generation tool."));
            assert!(prompt.contains(words), "{prompt}");
            assert!(prompt.ends_with("image: --help"), "{prompt}");
        }
        let edit = edit_prompt("-i other.png");
        assert!(edit.starts_with("Use your image generation tool."));
        assert!(edit.ends_with("The edit: -i other.png"));
    }

    #[test]
    fn an_api_key_in_the_environment_does_not_reach_the_cli() {
        let provider = CodexCli {
            program: None,
            home: Some("/h".into()),
            timeout: RUN_TIMEOUT,
        };
        let program = Program {
            path: "codex".into(),
            prefix: Vec::new(),
        };
        let command = provider.command(&program);
        let envs: Vec<_> = command.get_envs().collect();
        for key in ["CODEX_API_KEY", "OPENAI_API_KEY"] {
            assert!(envs.contains(&(OsStr::new(key), None)), "{key}");
        }
        assert!(envs.contains(&(OsStr::new("CODEX_HOME"), Some(OsStr::new("/h")))));
    }

    const WINDOWS: Target = Target {
        windows: true,
        package: "codex-win32-x64",
        triple: "x86_64-pc-windows-msvc",
    };

    fn touch(file: &Path) -> io::Result<()> {
        if let Some(dir) = file.parent() {
            fs::create_dir_all(dir)?;
        }
        fs::write(file, b"")
    }

    #[test]
    fn finds_the_native_program_behind_the_npm_shim() -> TestResult {
        let root = tempfile::tempdir()?;
        let (empty, npm, hoisted, bare, standalone) = (
            root.path().join("empty"),
            root.path().join("npm"),
            root.path().join("hoisted"),
            root.path().join("bare"),
            root.path().join("standalone"),
        );
        let native = Path::new("vendor/x86_64-pc-windows-msvc/bin/codex.exe");
        let package = Path::new("node_modules/@openai/codex");
        fs::create_dir_all(&empty)?;
        // npm, as on the machine this was built on: the platform package inside the package.
        touch(&npm.join("codex.cmd"))?;
        touch(&npm.join(package).join("bin/codex.js"))?;
        let nested = npm
            .join(package)
            .join("node_modules/@openai/codex-win32-x64")
            .join(native);
        touch(&nested)?;
        // The platform package next to the package.
        touch(&hoisted.join("codex.cmd"))?;
        let beside = hoisted
            .join("node_modules/@openai/codex-win32-x64")
            .join(native);
        touch(&beside)?;
        // A shim whose package was removed, or is for another platform.
        touch(&bare.join("codex.cmd"))?;
        touch(
            &bare
                .join(package)
                .join("node_modules/@openai/codex-win32-arm64")
                .join(native),
        )?;
        touch(&standalone.join("codex.exe"))?;

        let found = |dirs: &[&PathBuf]| locate(dirs.iter().map(|dir| (*dir).clone()), &WINDOWS);
        assert_eq!(found(&[&empty]), Located::Nothing);
        assert_eq!(found(&[&empty, &npm]), Located::Program(nested.clone()));
        assert_eq!(found(&[&hoisted]), Located::Program(beside));
        assert_eq!(found(&[&bare]), Located::Shim(bare.join("codex.cmd")));
        // A shim without its program does not hide a working install further down the PATH.
        assert_eq!(found(&[&bare, &npm]), Located::Program(nested.clone()));
        assert_eq!(
            found(&[&standalone, &npm]),
            Located::Program(standalone.join("codex.exe"))
        );
        assert_eq!(found(&[&npm, &standalone]), Located::Program(nested));
        Ok(())
    }

    /// The provider driving `codex_cli/fake-cli.mjs` under Node instead of the real CLI, with a
    /// `CODEX_HOME` of the test's own.
    fn stand_in(home: &Path, timeout: Duration) -> CodexCli {
        CodexCli {
            program: Some(Program {
                path: "node".into(),
                prefix: vec![
                    concat!(
                        env!("CARGO_MANIFEST_DIR"),
                        "/src/image_providers/codex_cli/fake-cli.mjs"
                    )
                    .into(),
                ],
            }),
            home: Some(home.to_path_buf()),
            timeout,
        }
    }

    fn wide(prompt: &str) -> GenerateRequest {
        GenerateRequest {
            prompt: prompt.into(),
            aspect: Aspect::Wide,
        }
    }

    /// What the stand-in recorded about its one call so far, and the thread it ran as.
    fn last_call(home: &Path) -> TestResultOf<(String, Value)> {
        let mut calls = Vec::new();
        for entry in fs::read_dir(home.join("calls"))? {
            let path = entry?.path();
            if path.extension() == Some(OsStr::new("json")) {
                calls.push(path);
            }
        }
        let [call] = &calls[..] else {
            return Err(format!("expected one call, found {}", calls.len()).into());
        };
        let thread = call
            .file_stem()
            .map(|stem| stem.to_string_lossy().into_owned())
            .unwrap_or_default();
        Ok((thread, serde_json::from_slice(&fs::read(call)?)?))
    }

    fn size(image: &GeneratedImage) -> TestResultOf<(usize, usize)> {
        let size = imagesize::blob_size(&image.bytes)?;
        Ok((size.width, size.height))
    }

    /// Nothing of the run is left: not its working folder, not the CLI's copy of the picture.
    fn assert_nothing_left(home: &Path) -> TestResult {
        let (thread, call) = last_call(home)?;
        let cwd = call["cwd"].as_str().ok_or("no cwd")?;
        assert!(
            !Path::new(cwd).exists(),
            "the working folder is still there"
        );
        assert!(!home.join(GENERATED).join(thread).exists());
        Ok(())
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn generates_through_a_cli_process() -> TestResult {
        let home = tempfile::tempdir()?;
        let provider = stand_in(home.path(), RUN_TIMEOUT);
        let (_job, cancel) = Cancel::new();
        let image = provider.generate(&wide("a red barn"), cancel).await?;
        assert_eq!(size(&image)?, (1672, 941));

        let (_, call) = last_call(home.path())?;
        // It ran in an empty folder, with the ADR's flags and the prompt as one argument.
        assert_eq!(call["files"], serde_json::json!([]));
        assert_eq!(call["leaked"], serde_json::json!([]));
        assert_eq!(call["images"], serde_json::json!([]));
        let argv: Vec<String> = serde_json::from_value(call["argv"].clone())?;
        assert_eq!(argv[..8].join(" "), strings(&args("", None))[..8].join(" "));
        assert_eq!(argv[8], generate_prompt(&wide("a red barn")));
        assert_eq!(argv.len(), 9);
        assert_nothing_left(home.path())
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn edits_with_the_source_as_a_reference() -> TestResult {
        let home = tempfile::tempdir()?;
        let source = home.path().join("source image.png");
        fs::write(&source, crate::assets::tiny_png(800, 600))?;
        let provider = stand_in(home.path(), RUN_TIMEOUT);
        let (_job, cancel) = Cancel::new();
        let request = EditRequest {
            source: source.clone(),
            mask: None,
            instruction: "make it night".into(),
        };
        let image = provider.edit(&request, cancel).await?;
        assert_eq!(size(&image)?, (1254, 1254));
        // Had the prompt come after `-i`, the stand-in, like the CLI, would have found none.
        let (_, call) = last_call(home.path())?;
        assert_eq!(call["prompt"], edit_prompt("make it night"));
        assert_eq!(call["images"], serde_json::json!([source]));
        assert!(source.is_file(), "the source is only read");
        assert_nothing_left(home.path())
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn takes_the_picture_from_the_threads_folder_whatever_the_agent_says() -> TestResult {
        let (_job, cancel) = Cancel::new();
        // Rule 1: no path in the agent's words.
        let home = tempfile::tempdir()?;
        let provider = stand_in(home.path(), RUN_TIMEOUT);
        let image = provider.generate(&wide("no path"), cancel.clone()).await?;
        assert_eq!(size(&image)?, (1672, 941));
        assert_nothing_left(home.path())?;

        // Rule 2: two files, and the agent named the older one.
        let home = tempfile::tempdir()?;
        let provider = stand_in(home.path(), RUN_TIMEOUT);
        let image = provider
            .generate(&wide("two files"), cancel.clone())
            .await?;
        assert_eq!(size(&image)?, (1672, 941));
        assert_nothing_left(home.path())?;

        // No picture at all: the agent's words are the explanation.
        let home = tempfile::tempdir()?;
        let provider = stand_in(home.path(), RUN_TIMEOUT);
        let Err(error) = provider.generate(&wide("refuse"), cancel).await else {
            return Err("a run without a picture succeeded".into());
        };
        assert_eq!(error.kind, ImageErrorKind::GenerationFailed);
        assert!(
            error.message.contains("goes against the content policy"),
            "{}",
            error.message
        );
        assert_nothing_left(home.path())
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn failed_runs_are_typed_errors() -> TestResult {
        let (_job, cancel) = Cancel::new();
        let home = tempfile::tempdir()?;
        let provider = stand_in(home.path(), RUN_TIMEOUT);
        let Err(error) = provider
            .generate(&wide("unauthorized"), cancel.clone())
            .await
        else {
            return Err("a run without credentials succeeded".into());
        };
        assert_eq!(error.kind, ImageErrorKind::NotLoggedIn);
        assert_nothing_left(home.path())?;

        // A crash mid-turn: the error carries the exit code and stderr.
        let home = tempfile::tempdir()?;
        let provider = stand_in(home.path(), RUN_TIMEOUT);
        let Err(error) = provider.generate(&wide("crash"), cancel.clone()).await else {
            return Err("a crashed run succeeded".into());
        };
        assert_eq!(error.kind, ImageErrorKind::GenerationFailed);
        assert!(
            error.message.contains("exit code 3") && error.message.contains("crashing on purpose"),
            "{}",
            error.message
        );
        assert_nothing_left(home.path())?;

        // Before any process: a prompt the command line cannot carry.
        let too_long = provider
            .generate(&wide(&"x".repeat(MAX_PROMPT_CHARS)), cancel.clone())
            .await;
        assert_eq!(
            too_long.err().map(|e| e.kind),
            Some(ImageErrorKind::InvalidInput)
        );

        let missing = CodexCli {
            program: Some(Program {
                path: "slidr-no-such-program".into(),
                prefix: Vec::new(),
            }),
            home: Some(home.path().to_path_buf()),
            timeout: RUN_TIMEOUT,
        };
        let not_installed = missing.generate(&wide("a red barn"), cancel).await;
        assert_eq!(
            not_installed.err().map(|e| e.kind),
            Some(ImageErrorKind::NotInstalled)
        );
        assert_eq!(missing.probe().await.state, ProviderState::NotInstalled);
        Ok(())
    }

    /// Whether the stand-in's `hang` run is still alive: it appends to a file while it is.
    async fn still_beating(home: &Path, thread: &str) -> bool {
        let beat = home.join("calls").join(format!("{thread}.beat"));
        let size = || fs::metadata(&beat).map(|meta| meta.len()).unwrap_or(0);
        let before = size();
        tokio::time::sleep(Duration::from_millis(400)).await;
        size() > before
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_cancelled_run_leaves_no_process_and_no_files() -> TestResult {
        let home = tempfile::tempdir()?;
        let provider = Arc::new(stand_in(home.path(), RUN_TIMEOUT));
        let (job, cancel) = Cancel::new();
        let run = tokio::spawn({
            let provider = Arc::clone(&provider);
            async move { provider.generate(&wide("hang"), cancel).await }
        });
        // Wait until the process is up and writing.
        let mut thread = None;
        for _ in 0..100 {
            tokio::time::sleep(Duration::from_millis(100)).await;
            if let Ok((id, _)) = last_call(home.path())
                && still_beating(home.path(), &id).await
            {
                thread = Some(id);
                break;
            }
        }
        let thread = thread.ok_or("the stand-in never started")?;
        assert!(!run.is_finished());

        job.send_replace(true);
        let cancelled = run.await?;
        assert_eq!(
            cancelled.err().map(|e| e.kind),
            Some(ImageErrorKind::Cancelled)
        );
        // The call returned only after the process was gone.
        assert!(!still_beating(home.path(), &thread).await);
        assert_nothing_left(home.path())
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_hung_run_is_ended_at_the_timeout() -> TestResult {
        let home = tempfile::tempdir()?;
        let provider = stand_in(home.path(), Duration::from_secs(3));
        let (_job, cancel) = Cancel::new();
        let began = std::time::Instant::now();
        let Err(error) = provider.generate(&wide("hang"), cancel).await else {
            return Err("a hung run succeeded".into());
        };
        assert_eq!(error.kind, ImageErrorKind::Timeout);
        assert!(
            error.message.contains("within 3 seconds"),
            "{}",
            error.message
        );
        assert!(began.elapsed() >= Duration::from_secs(3));
        let (thread, _) = last_call(home.path())?;
        assert!(!still_beating(home.path(), &thread).await);
        assert_nothing_left(home.path())
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn probe_reports_the_version_and_the_sign_in() -> TestResult {
        let home = tempfile::tempdir()?;
        let provider = stand_in(home.path(), RUN_TIMEOUT);
        let ready = provider.probe().await;
        assert_eq!(
            (
                ready.state,
                ready.version.as_deref(),
                ready.account.as_deref()
            ),
            (ProviderState::Ready, Some("9.9.9"), Some("ChatGPT"))
        );
        assert_eq!(ready.detail, None);

        fs::write(home.path().join("logged-out"), b"")?;
        let logged_out = provider.probe().await;
        assert_eq!(logged_out.state, ProviderState::NotLoggedIn);
        assert_eq!(logged_out.version.as_deref(), Some("9.9.9"));
        assert_eq!(logged_out.detail.as_deref(), Some(LOGIN_HINT));

        // With an API key the CLI prints part of the key; none of it is passed on.
        assert_eq!(
            account("Logged in using an API key - sk-proj-***ABCD"),
            Some("API key")
        );
        assert_eq!(account("Logged in"), None);
        Ok(())
    }

    // ------------------------------------------------------------------------------------------
    // The real CLI. Ignored by default: the paid ones spend the owner's ChatGPT quota, about a
    // minute and one image each. Run one at a time:
    //   cargo test -p slidr real_cli_<name> -- --ignored --nocapture
    // With SLIDR_KEEP_IMAGES=<folder> the pictures are copied there to be looked at.
    // ------------------------------------------------------------------------------------------

    /// A storage with one workspace, and a service over the real provider.
    struct Real {
        _root: tempfile::TempDir,
        storage: Arc<Storage>,
        workspace: String,
        assets: PathBuf,
        service: Arc<ImageService>,
    }

    fn real() -> TestResultOf<Real> {
        let root = tempfile::tempdir()?;
        let storage = Arc::new(Storage::new(root.path().to_path_buf()));
        let workspace = storage.new_workspace()?.id;
        let service = Arc::new(ImageService::new(
            Arc::new(crate::settings::Settings::open(
                root.path().join("settings.json"),
            )),
            vec![Arc::new(CodexCli::new())],
        ));
        Ok(Real {
            assets: storage.assets_dir(&workspace)?,
            storage,
            workspace,
            service,
            _root: root,
        })
    }

    fn log(began: std::time::Instant) -> impl Fn(crate::image_providers::ImageEvent) + Clone {
        move |event| {
            println!(
                "  {:>6.1}s {}",
                began.elapsed().as_secs_f64(),
                serde_json::to_string(&event).unwrap_or_default()
            );
        }
    }

    /// Prints what each image of a job became, and copies the pictures out when asked to.
    fn report(real: &Real, label: &str, images: &[ImageOutcome]) -> TestResult {
        for (index, outcome) in images.iter().enumerate() {
            match outcome {
                ImageOutcome::Stored { asset, duration_ms } => {
                    println!(
                        "{label}[{index}]: {:.1}s, {}x{}, {} KB, assets/{}",
                        *duration_ms as f64 / 1000.0,
                        asset.width.unwrap_or(0.0),
                        asset.height.unwrap_or(0.0),
                        asset.bytes / 1024,
                        asset.file
                    );
                    assert!(real.assets.join(&asset.file).is_file());
                    if let Some(keep) = std::env::var_os("SLIDR_KEEP_IMAGES") {
                        fs::create_dir_all(&keep)?;
                        fs::copy(
                            real.assets.join(&asset.file),
                            Path::new(&keep).join(format!("{label}-{index}.png")),
                        )?;
                    }
                }
                ImageOutcome::Failed { error } => {
                    println!("{label}[{index}]: {:?}: {}", error.kind, error.message);
                }
            }
        }
        Ok(())
    }

    /// The folders in `generated_images`, and the `slidr-image-*` folders in the temp folder.
    fn leftovers() -> TestResultOf<(Vec<String>, Vec<String>)> {
        let names = |dir: &Path, prefix: &str| -> Vec<String> {
            let mut names: Vec<String> = fs::read_dir(dir)
                .into_iter()
                .flatten()
                .flatten()
                .map(|entry| entry.file_name().to_string_lossy().into_owned())
                .filter(|name| name.starts_with(prefix))
                .collect();
            names.sort();
            names
        };
        let home = CodexCli::new().home()?;
        Ok((
            names(&home.join(GENERATED), ""),
            names(&std::env::temp_dir(), "slidr-image-"),
        ))
    }

    /// The ids of the running Codex processes.
    fn codex_processes() -> TestResultOf<Vec<String>> {
        let listing = if cfg!(windows) {
            std::process::Command::new("tasklist")
                .args(["/FI", "IMAGENAME eq codex.exe", "/FO", "CSV", "/NH"])
                .output()?
        } else {
            std::process::Command::new("pgrep")
                .args(["-x", "codex"])
                .output()?
        };
        let mut ids: Vec<String> = String::from_utf8_lossy(&listing.stdout)
            .lines()
            .filter_map(|line| {
                if cfg!(windows) {
                    let mut fields = line.split(',').map(|field| field.trim_matches('"'));
                    (fields.next() == Some("codex.exe"))
                        .then(|| fields.next())
                        .flatten()
                } else {
                    Some(line.trim())
                }
            })
            .map(str::to_owned)
            .collect();
        ids.sort();
        Ok(ids)
    }

    /// Free: no request is made.
    #[tokio::test(flavor = "multi_thread")]
    #[ignore = "runs the real Codex CLI"]
    async fn real_cli_probe() -> TestResult {
        let provider = CodexCli::new();
        println!("program: {:?}", provider.program()?.path);
        let status = provider.probe().await;
        println!("probe: {status:?}");
        assert_eq!(status.state, ProviderState::Ready);
        Ok(())
    }

    /// Free: with an empty `CODEX_HOME` the CLI has no credentials, retries for about fifteen
    /// seconds and gives up. Then the same run again, cancelled in the middle of the retries.
    #[tokio::test(flavor = "multi_thread")]
    #[ignore = "runs the real Codex CLI"]
    async fn real_cli_without_a_sign_in() -> TestResult {
        let home = tempfile::tempdir()?;
        let provider = Arc::new(CodexCli {
            program: None,
            home: Some(home.path().to_path_buf()),
            timeout: RUN_TIMEOUT,
        });
        let status = provider.probe().await;
        println!("probe: {status:?}");
        assert_eq!(status.state, ProviderState::NotLoggedIn);

        let before = codex_processes()?;
        let (_job, cancel) = Cancel::new();
        let began = std::time::Instant::now();
        let Err(error) = provider.generate(&wide("a red barn"), cancel).await else {
            return Err("a run without credentials succeeded".into());
        };
        println!(
            "{:.1}s {:?}: {}",
            began.elapsed().as_secs_f64(),
            error.kind,
            error.message
        );
        assert_eq!(error.kind, ImageErrorKind::NotLoggedIn);

        let (job, cancel) = Cancel::new();
        let run = tokio::spawn({
            let provider = Arc::clone(&provider);
            async move { provider.generate(&wide("a red barn"), cancel).await }
        });
        tokio::time::sleep(Duration::from_secs(5)).await;
        println!("running: {:?}", codex_processes()?);
        let began = std::time::Instant::now();
        job.send_replace(true);
        let cancelled = run.await?;
        println!("cancelled in {:.2}s", began.elapsed().as_secs_f64());
        assert_eq!(
            cancelled.err().map(|e| e.kind),
            Some(ImageErrorKind::Cancelled)
        );
        assert_eq!(
            codex_processes()?,
            before,
            "a Codex process was left behind"
        );
        Ok(())
    }

    /// Two images: a 16:9 picture that ends up as an asset of a workspace, then an edit of it.
    #[tokio::test(flavor = "multi_thread")]
    #[ignore = "runs the real Codex CLI on the owner's ChatGPT plan: two images"]
    async fn real_cli_generate_then_edit() -> TestResult {
        let real = real()?;
        let before = leftovers()?;
        let began = std::time::Instant::now();
        let job = GenerateJob {
            prompt: "A photographic hero image for a presentation slide about renewable energy: \
                     wind turbines on rolling green hills at sunrise, soft warm light. No text, \
                     no logos."
                .into(),
            count: 1,
            aspect: Aspect::Wide,
            provider: None,
        };
        let made = real
            .service
            .generate(
                &real.storage,
                "real-generate",
                &real.workspace,
                job,
                log(began),
            )
            .await?;
        report(&real, "generate", &made.images)?;
        let [ImageOutcome::Stored { asset, .. }] = &made.images[..] else {
            return Err("the image was not stored".into());
        };
        // Checked at the end: a failed check must not cost the edit its run.
        let after_generate = leftovers()?;

        let began = std::time::Instant::now();
        let job = EditJob {
            asset_id: asset.id.clone(),
            instruction: "Keep the same composition and turbines, but make it a clear night \
                          with stars and a full moon."
                .into(),
            mask_asset_id: None,
            count: 1,
            provider: None,
        };
        let edited = real
            .service
            .edit(&real.storage, "real-edit", &real.workspace, job, log(began))
            .await?;
        report(&real, "edit", &edited.images)?;
        let [ImageOutcome::Stored { asset: night, .. }] = &edited.images[..] else {
            return Err("the edit was not stored".into());
        };
        assert_ne!(night.id, asset.id);
        assert!(real.assets.join(&asset.file).is_file(), "the source stays");
        assert_eq!(asset.mime, "image/png");
        let (width, height) = (asset.width.unwrap_or(0.0), asset.height.unwrap_or(1.0));
        assert!(
            (width / height - 16.0 / 9.0).abs() < 0.1,
            "{width}x{height}"
        );
        assert_eq!(after_generate, before, "the generation left files behind");
        assert_eq!(leftovers()?, before, "the edit left files behind");
        Ok(())
    }

    /// Four images, four processes at once.
    #[tokio::test(flavor = "multi_thread")]
    #[ignore = "runs the real Codex CLI on the owner's ChatGPT plan: four images"]
    async fn real_cli_four_in_parallel() -> TestResult {
        let real = real()?;
        let before = leftovers()?;
        let began = std::time::Instant::now();
        let job = GenerateJob {
            prompt: "An abstract background for a presentation slide: soft flowing shapes in \
                     teal and indigo, calm, with room for a title. No text."
                .into(),
            count: 4,
            aspect: Aspect::Square,
            provider: None,
        };
        let made = real
            .service
            .generate(
                &real.storage,
                "real-parallel",
                &real.workspace,
                job,
                log(began),
            )
            .await?;
        println!(
            "four in parallel: {:.1}s wall",
            began.elapsed().as_secs_f64()
        );
        report(&real, "parallel", &made.images)?;
        let stored = made
            .images
            .iter()
            .filter(|outcome| matches!(outcome, ImageOutcome::Stored { .. }))
            .count();
        assert_eq!(stored, 4);
        assert_eq!(leftovers()?, before, "the run left files behind");
        Ok(())
    }

    /// One image, cancelled twenty seconds in, while the picture is being made.
    #[tokio::test(flavor = "multi_thread")]
    #[ignore = "runs the real Codex CLI on the owner's ChatGPT plan: one image, cancelled"]
    async fn real_cli_cancel() -> TestResult {
        let real = real()?;
        let before = (leftovers()?, codex_processes()?);
        let began = std::time::Instant::now();
        let job = {
            let service = Arc::clone(&real.service);
            let storage = Arc::clone(&real.storage);
            let workspace = real.workspace.clone();
            tokio::spawn(async move {
                let job = GenerateJob {
                    prompt: "A close-up photograph of a circuit board with shallow depth of \
                             field. No text."
                        .into(),
                    count: 1,
                    aspect: Aspect::Wide,
                    provider: None,
                };
                service
                    .generate(&storage, "real-cancel", &workspace, job, log(began))
                    .await
            })
        };
        tokio::time::sleep(Duration::from_secs(20)).await;
        let running = codex_processes()?;
        println!("running before the cancel: {running:?}");
        assert!(running.len() > before.1.len(), "no Codex process to cancel");
        let asked = std::time::Instant::now();
        real.service.cancel("real-cancel");
        let result = job.await??;
        println!("cancelled in {:.2}s", asked.elapsed().as_secs_f64());
        report(&real, "cancel", &result.images)?;
        assert!(matches!(
            &result.images[..],
            [ImageOutcome::Failed { error }] if error.kind == ImageErrorKind::Cancelled
        ));
        assert_eq!(
            codex_processes()?,
            before.1,
            "a Codex process was left behind"
        );
        assert_eq!(leftovers()?, before.0, "the run left files behind");
        assert_eq!(fs::read_dir(&real.assets)?.count(), 0);
        Ok(())
    }
}
