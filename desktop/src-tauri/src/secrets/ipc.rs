//! The IPC surface of the keys. There is no command that returns one: the webview hands a key
//! over, asks which keys exist, and removes one.
//!
//! Errors arrive as `{ kind, message }` (see [`crate::error`]); a message never holds a key.

use std::sync::Arc;

use tauri::State;

use super::{SecretName, SecretStatus, Secrets};
use crate::error::{AppError, Result};

type Keys<'a> = State<'a, Arc<Secrets>>;

/// Runs a call into the credential store off the main thread: the store may wait for the user.
async fn off_main<T, F>(task: F) -> Result<T>
where
    F: FnOnce() -> Result<T> + Send + 'static,
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(AppError::internal)?
}

/// `secret_status()`: every key the app knows, and whether one is stored.
#[tauri::command]
pub async fn secret_status(secrets: Keys<'_>) -> Result<Vec<SecretStatus>> {
    let secrets = Arc::clone(&secrets);
    off_main(move || Ok(secrets.status())).await
}

/// `secret_set({ name, value })`: stores a key the user entered.
#[tauri::command]
pub async fn secret_set(secrets: Keys<'_>, name: SecretName, value: String) -> Result<()> {
    let secrets = Arc::clone(&secrets);
    off_main(move || secrets.set(name, &value)).await
}

/// `secret_delete({ name })`: forgets a key.
#[tauri::command]
pub async fn secret_delete(secrets: Keys<'_>, name: SecretName) -> Result<()> {
    let secrets = Arc::clone(&secrets);
    off_main(move || secrets.delete(name)).await
}
