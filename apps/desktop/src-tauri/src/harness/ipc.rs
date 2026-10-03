//! The IPC surface of the harness layer. Thin: the logic is in [`HarnessManager`].
//!
//! Argument names are camelCase on the JavaScript side (`harnessId`, `sessionId`, `onEvent`).
//! Errors arrive as `{ kind, message }`. Each session's events arrive on the `Channel` passed to
//! `agent_start`: ordered, typed, and delivered only to the webview that opened the session.

use std::sync::Arc;

use tauri::{State, ipc::Channel};

use super::{
    AgentError, AgentEvent, HarnessDescriptor, HarnessManager, HarnessStatus, Result,
    SessionConfig, UserTurn, transcript,
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
