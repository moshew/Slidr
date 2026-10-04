//! The IPC surface of the harness layer. Thin: the logic is in [`HarnessManager`].
//!
//! Argument names are camelCase on the JavaScript side (`harnessId`, `sessionId`, `onEvent`).
//! Errors arrive as `{ kind, message }`. Each session's events arrive on the `Channel` passed to
//! `agent_start`: ordered, typed, and delivered only to the webview that opened the session.

use std::sync::Arc;

use percent_encoding::percent_decode_str;
use tauri::{
    State,
    ipc::{Channel, InvokeBody, Request},
};

use super::{
    AgentError, AgentEvent, DiagnosticsView, HarnessDescriptor, HarnessManager, HarnessStatus,
    Result, SessionConfig, UserTurn, transcript,
};
use crate::storage::Storage;

type Manager<'a> = State<'a, Arc<HarnessManager>>;

/// `agent_harnesses()`: the registered harnesses with their capabilities (AGT-02).
#[tauri::command]
pub async fn agent_harnesses(manager: Manager<'_>) -> Result<Vec<HarnessDescriptor>> {
    Ok(manager.descriptors())
}

/// `agent_probe({ harnessId })`: installed, version, signed in (AGT-03).
#[tauri::command]
pub async fn agent_probe(manager: Manager<'_>, harness_id: String) -> Result<HarnessStatus> {
    manager.probe(&harness_id).await
}

/// `agent_start({ harnessId, thread, config, onEvent })`: starts a session; returns its id.
#[tauri::command]
pub async fn agent_start(
    manager: Manager<'_>,
    harness_id: String,
    thread: String,
    config: SessionConfig,
    on_event: Channel<AgentEvent>,
) -> Result<String> {
    // From the first session on, a session nobody talks to is closed (AGT-07).
    manager.watch_idle();
    manager
        .start(&harness_id, &thread, config, move |event| {
            // Fails only when the webview is gone; the session is closed by then or soon will be.
            let _ = on_event.send(event);
        })
        .await
}

/// `agent_send({ sessionId, turn })`: starts a turn.
#[tauri::command]
pub async fn agent_send(manager: Manager<'_>, session_id: String, turn: UserTurn) -> Result<()> {
    manager.send(&session_id, turn).await
}

/// `agent_interrupt({ sessionId })`: stops the running turn.
#[tauri::command]
pub async fn agent_interrupt(manager: Manager<'_>, session_id: String) -> Result<()> {
    manager.interrupt(&session_id).await
}

/// `agent_close({ sessionId })`: ends the session.
#[tauri::command]
pub async fn agent_close(manager: Manager<'_>, session_id: String) -> Result<()> {
    manager.close(&session_id).await
}

/// `agent_diagnostics_read({ maxBytes? })`: the end of the diagnostics log, for the settings
/// screen (AGT-08): what the harnesses wrote and what the sessions did, the newest last.
#[tauri::command]
pub async fn agent_diagnostics_read(
    manager: Manager<'_>,
    max_bytes: Option<usize>,
) -> Result<DiagnosticsView> {
    let manager = Arc::clone(&manager);
    off_main(move || Ok(manager.diagnostics(max_bytes))).await
}

/// `agent_diagnostics_clear()`: empties the diagnostics log.
#[tauri::command]
pub async fn agent_diagnostics_clear(manager: Manager<'_>) -> Result<()> {
    let manager = Arc::clone(&manager);
    off_main(move || manager.clear_diagnostics()).await
}

/// The folder of a workspace open in this process.
fn workspace_dir(storage: &Storage, workspace_id: &str) -> Result<std::path::PathBuf> {
    let assets = storage
        .assets_dir(workspace_id)
        .map_err(|e| AgentError::invalid_input(e.message))?;
    assets
        .parent()
        .map(std::path::Path::to_path_buf)
        .ok_or_else(|| AgentError::internal("the assets folder has no parent"))
}

/// Runs blocking file work off the async runtime's threads.
async fn off_main<T, F>(task: F) -> Result<T>
where
    F: FnOnce() -> Result<T> + Send + 'static,
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(AgentError::internal)?
}

/// `agent_chat_read({ workspaceId, file })`: the text of `chat/<file>` in the workspace of the
/// open deck (AGT-05), or `null` when the deck has none.
#[tauri::command]
pub async fn agent_chat_read(
    storage: State<'_, Arc<Storage>>,
    workspace_id: String,
    file: String,
) -> Result<Option<String>> {
    let dir = workspace_dir(&storage, &workspace_id)?;
    off_main(move || transcript::read(&dir, &file)).await
}

/// `agent_chat_write({ workspaceId, file, text, append })`: adds `text` to the end of
/// `chat/<file>`, or replaces the file with it.
#[tauri::command]
pub async fn agent_chat_write(
    storage: State<'_, Arc<Storage>>,
    workspace_id: String,
    file: String,
    text: String,
    append: bool,
) -> Result<()> {
    let dir = workspace_dir(&storage, &workspace_id)?;
    off_main(move || transcript::write(&dir, &file, &text, append)).await
}

/// `agent_attach`: stores a file the user attached to a chat with the conversation it belongs
/// to (CHT-U05), and returns its path relative to the session's working directory. The body is
/// the raw bytes; the thread key and the file name travel as the headers `x-thread` and
/// `x-file-name`, percent-encoded, as in `asset_import_bytes`.
#[tauri::command]
pub async fn agent_attach(manager: Manager<'_>, request: Request<'_>) -> Result<String> {
    let header = |name: &str| -> Result<String> {
        let invalid = || AgentError::invalid_input(format!("missing or malformed header {name}"));
        let value = request.headers().get(name).ok_or_else(invalid)?;
        let value = value.to_str().map_err(|_| invalid())?;
        percent_decode_str(value)
            .decode_utf8()
            .map(std::borrow::Cow::into_owned)
            .map_err(|_| invalid())
    };
    let thread = header("x-thread")?;
    let name = header("x-file-name")?;
    let bytes = match request.body() {
        InvokeBody::Raw(bytes) => bytes.clone(),
        InvokeBody::Json(value) => serde_json::from_value(value.clone())
            .map_err(|e| AgentError::invalid_input(format!("the body is not bytes: {e}")))?,
    };
    let manager = Arc::clone(&manager);
    off_main(move || manager.attach(&thread, &name, &bytes)).await
}
