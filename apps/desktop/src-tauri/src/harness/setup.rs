//! Connection and setup use the CLIs' own metadata protocols, without submitting a prompt.
use std::{path::PathBuf, process::Stdio, time::Duration};

use serde_json::{Value, json};
use tokio::{
    io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader},
    process::{Child, ChildStdin, ChildStdout, Command},
    time::timeout,
};

use super::{
    AgentError, AgentErrorKind, HarnessConnection, HarnessDescriptor, HarnessState, HarnessStatus,
    ModelOption, Result,
    registry::one_shot::{self, Launch},
};

/// Include package-manager locations even if this app started before installation.
pub(crate) fn search_paths() -> Vec<PathBuf> {
    let mut paths: Vec<_> =
        std::env::split_paths(&std::env::var_os("PATH").unwrap_or_default()).collect();
    if let Some(home) = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME")) {
        paths.push(PathBuf::from(home).join(".local/bin"));
    }
    if let Some(local) = std::env::var_os("LOCALAPPDATA") {
        paths.push(PathBuf::from(local).join("Microsoft/WinGet/Links"));
    }
    if let Some(programs) = std::env::var_os("ProgramFiles") {
        paths.push(PathBuf::from(&programs).join("WinGet/Links"));
        // Node.js, for Gemini CLI, which npm installs.
        paths.push(PathBuf::from(programs).join("nodejs"));
    }
    if let Some(roaming) = std::env::var_os("APPDATA") {
        paths.push(PathBuf::from(roaming).join("npm"));
    }
    paths
}

pub(crate) fn claude_program() -> PathBuf {
    search_paths()
        .into_iter()
        .map(|dir| {
            dir.join(if cfg!(windows) {
                "claude.exe"
            } else {
                "claude"
            })
        })
        .find(|path| path.is_file())
        .unwrap_or_else(|| "claude".into())
}

fn program(id: &str) -> Result<Launch> {
    let missing = |name: &str| {
        AgentError::new(
            AgentErrorKind::NotInstalled,
            format!("{name} was not found"),
        )
    };
    match id {
        "claude-code" => Ok(Launch::new(claude_program())),
        "codex-cli" => crate::image_providers::codex_executable()
            .map(Launch::new)
            .map_err(|error| AgentError::new(AgentErrorKind::NotInstalled, error)),
        "copilot-cli" => one_shot::copilot_executable()
            .map(Launch::new)
            .ok_or_else(|| missing("Copilot CLI")),
        "gemini-cli" => one_shot::gemini_launch().ok_or_else(|| missing("Gemini CLI")),
        "grok-cli" => one_shot::grok_executable()
            .map(Launch::new)
            .ok_or_else(|| missing("Grok CLI")),
        _ => Err(AgentError::invalid_input("this harness has no CLI setup")),
    }
}

/// A command that starts the CLI `id`, as `launch` says, for setup.
fn cli(id: &str, launch: &Launch) -> Command {
    let mut command = command(&launch.program);
    command.args(&launch.script);
    one_shot::quiet(id, &mut command);
    command
}

fn command(program: impl AsRef<std::ffi::OsStr>) -> Command {
    let mut command = Command::new(program);
    command.kill_on_drop(true);
    for (key, _) in std::env::vars_os() {
        let upper = key.to_string_lossy().to_ascii_uppercase();
        if upper.starts_with("CLAUDE") || upper.starts_with("ANTHROPIC") {
            command.env_remove(key);
        }
    }
    #[cfg(windows)]
    command.creation_flags(0x0800_0000);
    command
}

pub async fn connect(
    mut harness: HarnessDescriptor,
    mut status: HarnessStatus,
) -> HarnessConnection {
    if status.state == HarnessState::Ready && harness.id != "mock" {
        match timeout(Duration::from_secs(60), discover(&harness.id)).await {
            Ok(Ok(models)) if !models.is_empty() => {
                harness.models = models;
                harness.effort_levels.clear();
                harness.default_model = None;
            }
            result => {
                let error = match result {
                    Ok(Err(error)) => error,
                    Ok(Ok(_)) => AgentError::new(
                        AgentErrorKind::ProcessExited,
                        "The CLI returned no available models. Check account access and update the CLI, then retry.",
                    ),
                    Err(_) => AgentError::new(
                        AgentErrorKind::ProcessExited,
                        "The CLI did not finish loading its models. Check the connection and retry.",
                    ),
                };
                status.state = if error.kind == AgentErrorKind::NotLoggedIn {
                    HarnessState::NotLoggedIn
                } else {
                    HarnessState::Unavailable
                };
                status.detail = Some(error.message);
            }
        }
    }
    HarnessConnection { status, harness }
}

struct Rpc {
    child: Child,
    input: ChildStdin,
    output: BufReader<ChildStdout>,
    framed: bool,
    next_id: u32,
}

impl Rpc {
    fn start(mut command: Command, framed: bool) -> Result<Self> {
        let mut child = command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|error| AgentError::io("connect to CLI", &error))?;
        Ok(Self {
            input: child.stdin.take().unwrap(),
            output: BufReader::new(child.stdout.take().unwrap()),
            child,
            framed,
            next_id: 0,
        })
    }
    async fn send(&mut self, value: Value) -> Result<()> {
        let bytes = serde_json::to_vec(&value).unwrap();
        let mut wire = if self.framed {
            format!("Content-Length: {}\r\n\r\n", bytes.len()).into_bytes()
        } else {
            Vec::new()
        };
        wire.extend(bytes);
        if !self.framed {
            wire.push(b'\n');
        }
        self.input
            .write_all(&wire)
            .await
            .map_err(|error| AgentError::io("write CLI request", &error))?;
        self.input
            .flush()
            .await
            .map_err(|error| AgentError::io("flush CLI request", &error))
    }
    async fn read(&mut self) -> Result<Value> {
        loop {
            let mut line = String::new();
            let mut size = None;
            loop {
                line.clear();
                let count = self
                    .output
                    .read_line(&mut line)
                    .await
                    .map_err(|error| AgentError::io("read CLI response", &error))?;
                if count == 0 {
                    return Err(AgentError::new(
                        AgentErrorKind::ProcessExited,
                        "CLI closed the metadata connection. Update the CLI and retry.",
                    ));
                }
                if !self.framed {
                    break;
                }
                if line.trim().is_empty() {
                    break;
                }
                if let Some((name, value)) = line.split_once(':')
                    && name.eq_ignore_ascii_case("content-length")
                {
                    size = value.trim().parse::<usize>().ok();
                }
            }
            if self.framed {
                let size = size
                    .filter(|size| *size <= 8 * 1024 * 1024)
                    .ok_or_else(|| AgentError::invalid_input("invalid CLI response size"))?;
                let mut bytes = vec![0; size];
                self.output
                    .read_exact(&mut bytes)
                    .await
                    .map_err(|error| AgentError::io("read CLI response body", &error))?;
                return serde_json::from_slice(&bytes).map_err(|error| {
                    AgentError::new(AgentErrorKind::ProcessExited, error.to_string())
                });
            }
            if let Ok(value) = serde_json::from_str(&line) {
                return Ok(value);
            }
        }
    }
    async fn call(&mut self, method: &str, params: Value) -> Result<Value> {
        self.request(method, params).await?.map_err(|error| {
            AgentError::new(
                AgentErrorKind::ProcessExited,
                error["message"]
                    .as_str()
                    .unwrap_or("CLI metadata request failed"),
            )
        })
    }
    /// The result of a request, or the JSON-RPC error the CLI answered with.
    async fn request(
        &mut self,
        method: &str,
        params: Value,
    ) -> Result<std::result::Result<Value, Value>> {
        self.next_id += 1;
        let id = self.next_id;
        self.send(json!({"jsonrpc":"2.0", "id":id, "method":method, "params":params}))
            .await?;
        loop {
            let reply = self.read().await?;
            // A request of the CLI's own (ACP agents make some) may carry the same id.
            if reply["id"] == id && reply.get("method").is_none() {
                if let Some(error) = reply.get("error") {
                    return Ok(Err(error.clone()));
                }
                return Ok(Ok(reply["result"].clone()));
            }
        }
    }
}

async fn discover(id: &str) -> Result<Vec<ModelOption>> {
    let mut cmd = cli(id, &program(id)?);
    // An empty working directory prevents project instructions/hooks from entering discovery.
    // Gemini CLI records every folder it is started in as a project of its own, so it is given
    // the same one each time (one setup at a time per CLI).
    let folder = std::env::temp_dir().join(if id == "gemini-cli" {
        "slidr-connect-gemini".to_owned()
    } else {
        format!("slidr-connect-{}", uuid::Uuid::new_v4())
    });
    std::fs::create_dir_all(&folder)
        .map_err(|error| AgentError::io("create connection folder", &error))?;
    struct Folder(PathBuf);
    impl Drop for Folder {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir(&self.0);
        }
    }
    let _folder = Folder(folder.clone());
    cmd.current_dir(&folder);
    if id == "grok-cli" {
        return grok_models(cmd).await;
    }
    match id {
        "codex-cli" => {
            cmd.arg("app-server");
        }
        "copilot-cli" => {
            cmd.args(["--headless", "--stdio", "--no-auto-update"]);
        }
        "gemini-cli" => {
            // ACP mode lists the models the account has on a new session. Naming a server keeps
            // the user's own MCP servers from starting for it.
            cmd.args(["--acp", "--allowed-mcp-server-names", "slidr"]);
        }
        "claude-code" => {
            cmd.args([
                "--input-format",
                "stream-json",
                "--output-format",
                "stream-json",
                "--verbose",
                "--strict-mcp-config",
                "--mcp-config",
                "{\"mcpServers\":{}}",
                "--setting-sources",
                "",
                "--no-session-persistence",
                "-p",
            ]);
        }
        _ => return Err(AgentError::invalid_input("unknown CLI")),
    }
    let mut rpc = Rpc::start(cmd, id == "copilot-cli")?;
    let result = async {
        let mut models = Vec::new();
        match id {
            "codex-cli" => {
                rpc.call("initialize", json!({"clientInfo":{"name":"slidr", "version":env!("CARGO_PKG_VERSION")}})).await?;
                rpc.send(json!({"method":"initialized"})).await?;
                let account = rpc.call("account/read", json!({"refreshToken":true})).await?;
                if account["account"].is_null() && account["requiresOpenaiAuth"] != false { return Err(AgentError::new(AgentErrorKind::NotLoggedIn, "Sign in to Codex CLI.")); }
                let mut cursor = Value::Null;
                for _ in 0..30 {
                    let reply = rpc.call("model/list", json!({"limit":100, "includeHidden":false, "cursor":cursor})).await?;
                    models.extend(parse_models(id, &reply["data"]));
                    cursor = reply["nextCursor"].clone();
                    if cursor.is_null() { break; }
                }
            }
            "copilot-cli" => {
                rpc.call("connect", json!({})).await?;
                let auth = rpc.call("auth.getStatus", json!({})).await?;
                if auth["isAuthenticated"] != true { return Err(AgentError::new(AgentErrorKind::NotLoggedIn, "Sign in to GitHub Copilot CLI.")); }
                let reply = rpc.call("models.list", json!({})).await?;
                models = parse_models(id, &reply["models"]);
            }
            "gemini-cli" => {
                rpc.call("initialize", json!({"protocolVersion":1, "clientCapabilities":{}, "clientInfo":{"name":"slidr", "version":env!("CARGO_PKG_VERSION")}})).await?;
                // Gemini CLI answers a new session without a usable account with -32000.
                let session = rpc.request("session/new", json!({"cwd":folder, "mcpServers":[]})).await?;
                let session = session.map_err(|error| AgentError::new(
                    if error["code"] == -32000 { AgentErrorKind::NotLoggedIn } else { AgentErrorKind::ProcessExited },
                    error["message"].as_str().unwrap_or("Gemini CLI could not start a session. Sign in and retry."),
                ))?;
                models = parse_models(id, &session["models"]["availableModels"]);
            }
            _ => {
                rpc.send(json!({"type":"control_request", "request_id":"slidr-models", "request":{"subtype":"initialize"}})).await?;
                loop {
                    let reply = rpc.read().await?;
                    let response = &reply["response"];
                    if response["request_id"] == "slidr-models" {
                        if response["subtype"] != "success" { return Err(AgentError::new(AgentErrorKind::ProcessExited, response["error"].as_str().unwrap_or("Claude initialization failed"))); }
                        models = parse_models(id, &response["response"]["models"]);
                        break;
                    }
                }
            }
        }
        Ok(models)
    }.await;
    let _ = rpc.child.kill().await;
    let _ = rpc.child.wait().await;
    result
}

/// Grok CLI lists the models of the signed-in account with `grok models`, as text: a line about
/// the account, then one model id a line, the default marked.
async fn grok_models(mut cmd: Command) -> Result<Vec<ModelOption>> {
    let output = cmd
        .arg("models")
        .stdin(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|error| AgentError::io("list Grok models", &error))?;
    let text = String::from_utf8_lossy(&output.stdout);
    if text.contains("not authenticated") {
        return Err(AgentError::new(
            AgentErrorKind::NotLoggedIn,
            "Sign in to Grok CLI.",
        ));
    }
    if !output.status.success() {
        let error = String::from_utf8_lossy(&output.stderr);
        let error = error.trim();
        return Err(AgentError::new(
            if error.to_ascii_lowercase().contains("not signed in") {
                AgentErrorKind::NotLoggedIn
            } else {
                AgentErrorKind::ProcessExited
            },
            if error.is_empty() {
                format!("grok models exited with {}", output.status)
            } else {
                error.chars().take(3000).collect()
            },
        ));
    }
    Ok(parse_grok_models(&text))
}

fn parse_grok_models(text: &str) -> Vec<ModelOption> {
    let mut models: Vec<ModelOption> = Vec::new();
    let list = text
        .split_once("Available models:")
        .map_or("", |(_, list)| list);
    for line in list.lines() {
        let Some(id) = line
            .trim()
            .strip_prefix("* ")
            .or_else(|| line.trim().strip_prefix("- "))
        else {
            continue;
        };
        let id = id.trim_end_matches("(default)").trim();
        if id.is_empty() || models.iter().any(|model| model.id == id) {
            continue;
        }
        models.push(ModelOption {
            id: id.into(),
            label: model_label(id),
            effort_levels: Some(Vec::new()),
        });
    }
    models
}

/// A label for a model the CLI names by its id only: `grok-4.6` reads "Grok 4.6", which is also
/// how the model picker tells versions of one model apart.
fn model_label(id: &str) -> String {
    id.split('-')
        .map(|word| {
            let mut chars = word.chars();
            chars.next().map_or_else(String::new, |first| {
                first.to_uppercase().chain(chars).collect()
            })
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn parse_models(harness: &str, value: &Value) -> Vec<ModelOption> {
    let mut models = Vec::new();
    for model in value.as_array().into_iter().flatten() {
        if model["hidden"] == true
            || model.pointer("/policy/state").and_then(Value::as_str) == Some("disabled")
        {
            continue;
        }
        let (id, label, efforts) = match harness {
            "codex-cli" => (
                &model["model"],
                &model["displayName"],
                &model["supportedReasoningEfforts"],
            ),
            "copilot-cli" => (
                &model["id"],
                &model["name"],
                model
                    .get("supportedReasoningEfforts")
                    .or_else(|| model.pointer("/capabilities/supports/reasoning_effort"))
                    .unwrap_or(&Value::Null),
            ),
            "gemini-cli" => {
                // `auto…` lets Gemini CLI pick a model for each request; a model is chosen here.
                if model["modelId"]
                    .as_str()
                    .is_some_and(|id| id.starts_with("auto"))
                {
                    continue;
                }
                (&model["modelId"], &model["name"], &Value::Null)
            }
            _ => {
                if model["value"] == "default" {
                    continue;
                }
                (
                    model.get("resolvedModel").unwrap_or(&model["value"]),
                    &model["displayName"],
                    &model["supportedEffortLevels"],
                )
            }
        };
        let Some(id) = id.as_str().filter(|id| !id.is_empty() && *id != "auto") else {
            continue;
        };
        if models.iter().any(|model: &ModelOption| model.id == id) {
            continue;
        }
        let efforts = efforts
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|effort| {
                effort
                    .as_str()
                    .or_else(|| effort["reasoningEffort"].as_str())
            })
            .map(str::to_owned)
            .collect();
        let label = match label.as_str() {
            // Gemini CLI names most models by their id.
            Some(label) if harness == "gemini-cli" && label == id => model_label(id),
            Some(label) => label.into(),
            None => id.into(),
        };
        models.push(ModelOption {
            id: id.into(),
            label,
            effort_levels: Some(efforts),
        });
    }
    models
}

/// Called only after the installation confirmation in Settings.
pub async fn install(id: &str) -> Result<()> {
    let package = match id {
        "claude-code" => "Anthropic.ClaudeCode",
        "codex-cli" => "OpenAI.Codex",
        "copilot-cli" => "GitHub.Copilot",
        // Gemini CLI is published on npm only: WinGet brings Node.js, and npm comes with it.
        "gemini-cli" => "OpenJS.NodeJS.LTS",
        "grok-cli" => "xAI.GrokBuild",
        _ => return Err(AgentError::invalid_input("unknown install package")),
    };
    if !cfg!(windows) {
        return Err(AgentError::new(
            AgentErrorKind::ProcessExited,
            "Automatic installation currently requires Windows. Install the CLI with its official installer, then retry.",
        ));
    }
    if id != "gemini-cli" {
        return run_installer(command("winget.exe").args(winget_args(package))).await;
    }
    let npm = match npm_program() {
        Some(npm) => npm,
        None => {
            run_installer(command("winget.exe").args(winget_args(package))).await?;
            npm_program().ok_or_else(|| {
                AgentError::new(
                    AgentErrorKind::ProcessExited,
                    "Node.js was installed, but npm was not found. Restart the app and retry.",
                )
            })?
        }
    };
    run_installer(command(npm).args(["install", "--global", "@google/gemini-cli"])).await
}

fn winget_args(package: &str) -> [&str; 10] {
    [
        "install",
        "--id",
        package,
        "--exact",
        "--source",
        "winget",
        "--accept-source-agreements",
        "--accept-package-agreements",
        "--silent",
        "--disable-interactivity",
    ]
}

/// npm, from Node.js: `npm.cmd` on Windows, where the installer puts it in the Node.js folder.
fn npm_program() -> Option<PathBuf> {
    let name = if cfg!(windows) { "npm.cmd" } else { "npm" };
    search_paths()
        .into_iter()
        .map(|dir| dir.join(name))
        .find(|path| path.is_file())
}

async fn run_installer(cmd: &mut Command) -> Result<()> {
    let output = timeout(Duration::from_secs(600), cmd.stdin(Stdio::null()).output())
        .await
        .map_err(|_| {
            AgentError::new(
                AgentErrorKind::ProcessExited,
                "Installation timed out. Check Windows App Installer and retry.",
            )
        })?
        .map_err(|error| AgentError::io("run the installer", &error))?;
    if !output.status.success() {
        let report = if output.stdout.is_empty() {
            &output.stderr
        } else {
            &output.stdout
        };
        return Err(AgentError::new(
            AgentErrorKind::ProcessExited,
            format!(
                "Installation failed ({}). {}",
                output.status,
                String::from_utf8_lossy(report)
                    .chars()
                    .take(3000)
                    .collect::<String>()
            ),
        ));
    }
    Ok(())
}

/// The user's Sign in action opens a visible terminal for interactive browser/device login.
pub async fn login(id: &str) -> Result<()> {
    let launch = program(id)?;
    let args = match id {
        "claude-code" => "auth login",
        "codex-cli" | "copilot-cli" | "grok-cli" => "login",
        // Gemini CLI has no sign-in command: its interactive start offers the sign-in.
        "gemini-cli" => "",
        _ => return Err(AgentError::invalid_input("unknown login command")),
    };
    #[cfg(windows)]
    {
        let quote =
            |path: &std::path::Path| format!("'{}'", path.to_string_lossy().replace('\'', "''"));
        let mut start = vec![quote(launch.program.as_path())];
        if let Some(script) = &launch.script {
            start.push(quote(script.as_path()));
        }
        let hint = if id == "gemini-cli" {
            "Write-Host 'Choose Sign in with Google. When you are signed in, type /quit to return to Slidr.'; "
        } else {
            ""
        };
        let script = format!("{hint}& {} {}; exit $LASTEXITCODE", start.join(" "), args);
        let mut cmd = command("powershell.exe");
        one_shot::quiet(id, &mut cmd);
        cmd.creation_flags(0x0000_0010)
            .args(["-NoProfile", "-Command", &script]);
        let status = timeout(Duration::from_secs(600), cmd.status())
            .await
            .map_err(|_| {
                AgentError::new(
                    AgentErrorKind::ProcessExited,
                    "Sign-in timed out. Try again.",
                )
            })?
            .map_err(|error| AgentError::io("open sign-in terminal", &error))?;
        if !status.success() {
            return Err(AgentError::new(
                AgentErrorKind::NotLoggedIn,
                "Sign-in was cancelled or failed. Try again.",
            ));
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let program = launch.script.as_ref().unwrap_or(&launch.program).display();
        let message = if args.is_empty() {
            format!("Run {program} in a terminal and sign in, then retry.")
        } else {
            format!("Run {program} {args} in a terminal, then retry.")
        };
        Err(AgentError::new(AgentErrorKind::NotLoggedIn, message))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn model_metadata_is_per_model_and_excludes_automatic_or_disabled_choices() {
        let models = parse_models(
            "copilot-cli",
            &json!([
                {"id":"auto", "name":"Auto"}, {"id":"disabled", "policy":{"state":"disabled"}},
                {"id":"a", "name":"A", "supportedReasoningEfforts":["low", "ultra"]}, {"id":"b", "name":"B"}
            ]),
        );
        assert_eq!(models.len(), 2);
        assert_eq!(models[0].effort_levels.as_ref().unwrap(), &["low", "ultra"]);
        assert!(models[1].effort_levels.as_ref().unwrap().is_empty());
        let models = parse_models(
            "claude-code",
            &json!([
                {"value":"default", "resolvedModel":"model-a"}, {"value":"alias", "resolvedModel":"model-a", "supportedEffortLevels":["high"]}, {"value":"model-a"}
            ]),
        );
        assert_eq!(models.len(), 1);
        assert_eq!(models[0].id, "model-a");
        let models = parse_models(
            "codex-cli",
            &json!([{"model":"a", "supportedReasoningEfforts":[{"reasoningEffort":"ultra"}]}, {"model":"hidden", "hidden":true}]),
        );
        assert_eq!(models.len(), 1);
        assert_eq!(models[0].effort_levels.as_ref().unwrap(), &["ultra"]);
        let models = parse_models(
            "gemini-cli",
            &json!([
                {"modelId":"auto-gemini-3", "name":"Auto (Gemini 3)"}, {"modelId":"auto", "name":"Auto"},
                {"modelId":"gemini-3.1-pro-preview", "name":"gemini-3.1-pro-preview"}, {"modelId":"gemini-2.5-flash", "name":"Gemini 2.5 Flash"}
            ]),
        );
        let ids: Vec<_> = models.iter().map(|model| model.id.as_str()).collect();
        assert_eq!(ids, ["gemini-3.1-pro-preview", "gemini-2.5-flash"]);
        assert_eq!(models[0].label, "Gemini 3.1 Pro Preview");
        assert_eq!(models[1].label, "Gemini 2.5 Flash");
        assert_eq!(models[0].effort_levels, Some(Vec::new()));
    }
    #[test]
    fn grok_models_are_read_from_its_listing() {
        let models = parse_grok_models(
            "You are logged in with grok.com.\n\nDefault model: grok-4.5\n\nAvailable models:\n  * grok-4.5 (default)\n  - grok-4.6\n  - grok-code-fast-1\n",
        );
        let ids: Vec<_> = models.iter().map(|model| model.id.as_str()).collect();
        assert_eq!(ids, ["grok-4.5", "grok-4.6", "grok-code-fast-1"]);
        assert_eq!(models[1].label, "Grok 4.6");
        assert_eq!(models[2].label, "Grok Code Fast 1");
        assert_eq!(models[0].effort_levels, Some(Vec::new()));
        assert!(parse_grok_models("You are not authenticated.\n").is_empty());
    }
    #[tokio::test]
    #[ignore = "reads the installed CLIs and account metadata; does not generate a response"]
    async fn real_cli_discovers_models() {
        let id = std::env::var("SLIDR_DISCOVER_HARNESS").expect("set SLIDR_DISCOVER_HARNESS");
        let models = timeout(Duration::from_secs(60), discover(&id))
            .await
            .unwrap()
            .unwrap();
        assert!(!models.is_empty());
        assert!(models.iter().all(|model| model.effort_levels.is_some()));
        println!("{}: {} models", id, models.len());
    }
}
