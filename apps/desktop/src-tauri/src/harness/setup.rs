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
        paths.push(PathBuf::from(programs).join("WinGet/Links"));
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

fn program(id: &str) -> Result<PathBuf> {
    match id {
        "claude-code" => Ok(claude_program()),
        "codex-cli" => crate::image_providers::codex_executable()
            .map_err(|error| AgentError::new(AgentErrorKind::NotInstalled, error)),
        "copilot-cli" => super::registry::one_shot::copilot_executable().ok_or_else(|| {
            AgentError::new(AgentErrorKind::NotInstalled, "Copilot CLI was not found")
        }),
        _ => Err(AgentError::invalid_input("this harness has no CLI setup")),
    }
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
        self.next_id += 1;
        let id = self.next_id;
        self.send(json!({"jsonrpc":"2.0", "id":id, "method":method, "params":params}))
            .await?;
        loop {
            let reply = self.read().await?;
            if reply["id"] == id {
                if let Some(error) = reply.get("error") {
                    return Err(AgentError::new(
                        AgentErrorKind::ProcessExited,
                        error["message"]
                            .as_str()
                            .unwrap_or("CLI metadata request failed"),
                    ));
                }
                return Ok(reply["result"].clone());
            }
        }
    }
}

async fn discover(id: &str) -> Result<Vec<ModelOption>> {
    let mut cmd = command(program(id)?);
    // An empty working directory prevents project instructions/hooks from entering discovery.
    let folder = std::env::temp_dir().join(format!("slidr-connect-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir(&folder)
        .map_err(|error| AgentError::io("create connection folder", &error))?;
    struct Folder(PathBuf);
    impl Drop for Folder {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir(&self.0);
        }
    }
    let _folder = Folder(folder.clone());
    cmd.current_dir(folder);
    match id {
        "codex-cli" => {
            cmd.arg("app-server");
        }
        "copilot-cli" => {
            cmd.args(["--headless", "--stdio", "--no-auto-update"]);
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
        models.push(ModelOption {
            id: id.into(),
            label: label.as_str().unwrap_or(id).into(),
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
        _ => return Err(AgentError::invalid_input("unknown install package")),
    };
    if !cfg!(windows) {
        return Err(AgentError::new(
            AgentErrorKind::ProcessExited,
            "Automatic installation currently requires Windows. Install the CLI with its official installer, then retry.",
        ));
    }
    let output = timeout(
        Duration::from_secs(600),
        command("winget.exe")
            .args([
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
            ])
            .stdin(Stdio::null())
            .output(),
    )
    .await
    .map_err(|_| {
        AgentError::new(
            AgentErrorKind::ProcessExited,
            "Installation timed out. Check Windows App Installer and retry.",
        )
    })?
    .map_err(|error| AgentError::io("run Windows App Installer (winget)", &error))?;
    if !output.status.success() {
        return Err(AgentError::new(
            AgentErrorKind::ProcessExited,
            format!(
                "Installation failed ({}). {}",
                output.status,
                String::from_utf8_lossy(&output.stdout)
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
    let path = program(id)?;
    let args = match id {
        "claude-code" => "auth login",
        "codex-cli" | "copilot-cli" => "login",
        _ => return Err(AgentError::invalid_input("unknown login command")),
    };
    #[cfg(windows)]
    {
        let script = format!(
            "& '{}' {}; exit $LASTEXITCODE",
            path.to_string_lossy().replace('\'', "''"),
            args
        );
        let mut cmd = command("powershell.exe");
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
        Err(AgentError::new(
            AgentErrorKind::NotLoggedIn,
            format!("Run {} {args} in a terminal, then retry.", path.display()),
        ))
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
