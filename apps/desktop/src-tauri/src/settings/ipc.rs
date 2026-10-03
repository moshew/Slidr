//! The IPC surface of the settings: the webview reads every section and writes one at a time.

use std::sync::Arc;

use serde_json::{Map, Value};
use tauri::State;

use super::Settings;
use crate::{
    error::{AppError, Result},
    secrets::Secrets,
};

/// `settings_read()`: every section, as stored.
#[tauri::command]
pub async fn settings_read(settings: State<'_, Arc<Settings>>) -> Result<Map<String, Value>> {
    Ok(settings.all())
}

/// `settings_write({ section, value })`: replaces one section; `null` removes it.
///
/// A value that holds one of the stored keys is turned back: a key lives in the credential
/// store only (SEC-04), and a settings field must not become a second home for it.
#[tauri::command]
pub async fn settings_write(
    settings: State<'_, Arc<Settings>>,
    secrets: State<'_, Arc<Secrets>>,
    section: String,
    value: Value,
) -> Result<()> {
    let (settings, secrets) = (Arc::clone(&settings), Arc::clone(&secrets));
    tauri::async_runtime::spawn_blocking(move || {
        if secrets.appears_in(&value.to_string()) {
            return Err(AppError::invalid_input(
                "a settings value holds an API key; keys are kept in the credential store only",
            ));
        }
        settings.write(&section, value)
    })
    .await
    .map_err(AppError::internal)?
}
