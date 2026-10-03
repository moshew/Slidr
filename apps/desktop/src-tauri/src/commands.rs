//! The IPC surface. Each command is a thin wrapper that moves the work off the main thread;
//! the logic lives in [`crate::storage`] and [`crate::assets`], testable without Tauri.
//!
//! Argument names are camelCase on the JavaScript side (`workspaceId`, `deckJson`). Errors
//! arrive as `{ kind, message }` (see [`crate::error`]).

use std::{path::PathBuf, sync::Arc};

use percent_encoding::percent_decode_str;
use tauri::{
    State,
    ipc::{InvokeBody, Request},
};

use crate::{
    assets::{self, ImportedAsset},
    error::{AppError, Result},
    storage::{self, OpenedDeck, RecentFile, Recoverable, SavedDeck, Storage, Workspace},
};

type Shared<'a> = State<'a, Arc<Storage>>;

/// Runs blocking file work on Tauri's blocking pool.
async fn off_main<T, F>(task: F) -> Result<T>
where
    F: FnOnce() -> Result<T> + Send + 'static,
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(AppError::internal)?
}

/// `storage_new()`: an empty workspace for a new deck.
#[tauri::command]
pub async fn storage_new(storage: Shared<'_>) -> Result<Workspace> {
    let storage = Arc::clone(&storage);
    off_main(move || storage.new_workspace()).await
}

/// `storage_open({ path })`: unpacks a `.slidr` file into a new workspace.
#[tauri::command]
pub async fn storage_open(storage: Shared<'_>, path: PathBuf) -> Result<OpenedDeck> {
    let storage = Arc::clone(&storage);
    off_main(move || storage.open(&path)).await
}

/// `storage_write_deck({ workspaceId, deckJson, title })`: autosave.
#[tauri::command]
pub async fn storage_write_deck(
    storage: Shared<'_>,
    workspace_id: String,
    deck_json: String,
    title: String,
) -> Result<()> {
    let storage = Arc::clone(&storage);
    off_main(move || storage.write_deck(&workspace_id, &deck_json, &title)).await
}

/// `storage_save({ workspaceId, path, deckJson, title? })`: writes the `.slidr` file.
#[tauri::command]
pub async fn storage_save(
    storage: Shared<'_>,
    workspace_id: String,
    path: PathBuf,
    deck_json: String,
    title: Option<String>,
) -> Result<SavedDeck> {
    let storage = Arc::clone(&storage);
    off_main(move || storage.save(&workspace_id, &path, &deck_json, title.as_deref())).await
}

/// `storage_close({ workspaceId })`: deletes the workspace.
#[tauri::command]
pub async fn storage_close(storage: Shared<'_>, workspace_id: String) -> Result<()> {
    let storage = Arc::clone(&storage);
    off_main(move || storage.close(&workspace_id)).await
}

/// `storage_list_recoverable()`: crash leftovers with unsaved work.
#[tauri::command]
pub async fn storage_list_recoverable(storage: Shared<'_>) -> Result<Vec<Recoverable>> {
    let storage = Arc::clone(&storage);
    off_main(move || storage.list_recoverable()).await
}

/// `storage_recover({ workspaceId })`: reopens a leftover workspace as it is.
#[tauri::command]
pub async fn storage_recover(storage: Shared<'_>, workspace_id: String) -> Result<OpenedDeck> {
    let storage = Arc::clone(&storage);
    off_main(move || storage.recover(&workspace_id)).await
}

/// `storage_backup({ path, tag })`: copies a `.slidr` file to `<stem>.<tag>.bak.slidr`.
#[tauri::command]
pub async fn storage_backup(path: PathBuf, tag: String) -> Result<String> {
    off_main(move || {
        storage::backup(&path, &tag).map(|backup| backup.to_string_lossy().into_owned())
    })
    .await
}

/// `recents_list()`: the recent files, most recent first.
#[tauri::command]
pub async fn recents_list(storage: Shared<'_>) -> Result<Vec<RecentFile>> {
    let storage = Arc::clone(&storage);
    off_main(move || Ok(storage.recents())).await
}

/// `recents_remove({ path })`: takes a file off the recents list.
#[tauri::command]
pub async fn recents_remove(storage: Shared<'_>, path: String) -> Result<()> {
    let storage = Arc::clone(&storage);
    off_main(move || storage.remove_recent(&path)).await
}

/// `asset_import_file({ workspaceId, path })`: copies a file into the workspace's assets.
#[tauri::command]
pub async fn asset_import_file(
    storage: Shared<'_>,
    workspace_id: String,
    path: PathBuf,
) -> Result<ImportedAsset> {
    let storage = Arc::clone(&storage);
    off_main(move || assets::import_file(&storage.assets_dir(&workspace_id)?, &path)).await
}

/// `asset_import_bytes`: stores pasted or dropped bytes. The body is the raw bytes (an
/// `ArrayBuffer` or `Uint8Array` passed as the whole payload), not JSON; the workspace id and
/// the optional file name travel as the headers `x-workspace-id` and `x-file-name`, the name
/// percent-encoded (`encodeURIComponent`), since header values are ASCII.
#[tauri::command]
pub async fn asset_import_bytes(
    storage: Shared<'_>,
    request: Request<'_>,
) -> Result<ImportedAsset> {
    let workspace_id = header(&request, "x-workspace-id")?
        .ok_or_else(|| AppError::invalid_input("missing header x-workspace-id"))?;
    let name = header(&request, "x-file-name")?;
    let bytes = match request.body() {
        InvokeBody::Raw(bytes) => bytes.clone(),
        // Where raw bodies are unavailable, the bytes come as a JSON array of numbers.
        InvokeBody::Json(value) => serde_json::from_value(value.clone())
            .map_err(|e| AppError::invalid_input(format!("the body is not bytes: {e}")))?,
    };
    let storage = Arc::clone(&storage);
    off_main(move || assets::import_bytes(&storage.assets_dir(&workspace_id)?, name, &bytes)).await
}

/// A percent-decoded request header.
fn header(request: &Request<'_>, name: &str) -> Result<Option<String>> {
    let Some(value) = request.headers().get(name) else {
        return Ok(None);
    };
    let invalid = || AppError::invalid_input(format!("header {name} is not percent-encoded UTF-8"));
    let value = value.to_str().map_err(|_| invalid())?;
    let decoded = percent_decode_str(value)
        .decode_utf8()
        .map_err(|_| invalid())?;
    Ok(Some(decoded.into_owned()))
}

/// `export_write_file`: writes an exported presentation to the place the user chose in the save
/// dialog (WG9-T12). The body is the file's bytes, as in [`asset_import_bytes`]; the path travels
/// percent-encoded in the header `x-file-path`.
#[tauri::command]
pub async fn export_write_file(request: Request<'_>) -> Result<()> {
    let path = header(&request, "x-file-path")?
        .map(PathBuf::from)
        .ok_or_else(|| AppError::invalid_input("missing header x-file-path"))?;
    let bytes = match request.body() {
        InvokeBody::Raw(bytes) => bytes.clone(),
        InvokeBody::Json(value) => serde_json::from_value(value.clone())
            .map_err(|e| AppError::invalid_input(format!("the body is not bytes: {e}")))?,
    };
    off_main(move || write_export(&path, &bytes)).await
}

/// Replaces the file at `path` with `bytes`, atomically. The path comes from the webview, so it
/// is held to what an export is: an absolute path to an `.html` file.
fn write_export(path: &std::path::Path, bytes: &[u8]) -> Result<()> {
    use std::io::Write as _;

    let html = path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("html") || e.eq_ignore_ascii_case("htm"));
    let dir = path.parent().filter(|_| html && path.is_absolute());
    let Some(dir) = dir else {
        return Err(AppError::invalid_input(format!(
            "not an absolute path to an .html file: {}",
            path.display()
        )));
    };
    let temp = crate::storage::TempFile::new_in(dir).map_err(|e| AppError::path(path, &e))?;
    temp.file()
        .and_then(|mut file| file.write_all(bytes))
        .map_err(|e| AppError::io("write the exported file", &e))?;
    temp.persist(path).map_err(|e| AppError::path(path, &e))
}

#[cfg(test)]
mod export_tests {
    use super::write_export;
    use crate::error::ErrorKind;

    type TestResult = std::result::Result<(), Box<dyn std::error::Error>>;

    #[test]
    fn an_export_is_written_and_replaces_the_file_that_was_there() -> TestResult {
        let dir = tempfile::tempdir()?;
        let target = dir.path().join("deck.html");
        write_export(&target, b"<!doctype html>one")?;
        write_export(&target, b"<!doctype html>two")?;
        assert_eq!(std::fs::read(&target)?, b"<!doctype html>two");
        // No temp file is left beside it.
        assert_eq!(std::fs::read_dir(dir.path())?.count(), 1);
        Ok(())
    }

    #[test]
    fn only_an_absolute_html_path_is_written() -> TestResult {
        let dir = tempfile::tempdir()?;
        for name in ["deck.slidr", "deck", "deck.html.exe"] {
            let Err(error) = write_export(&dir.path().join(name), b"x") else {
                return Err(format!("{name} was written").into());
            };
            assert_eq!(error.kind, ErrorKind::InvalidInput);
        }
        let Err(error) = write_export(std::path::Path::new("deck.html"), b"x") else {
            return Err("a relative path was written".into());
        };
        assert_eq!(error.kind, ErrorKind::InvalidInput);
        assert_eq!(std::fs::read_dir(dir.path())?.count(), 0);
        Ok(())
    }

    #[test]
    fn a_folder_that_is_not_there_is_not_found() -> TestResult {
        let dir = tempfile::tempdir()?;
        let Err(error) = write_export(&dir.path().join("missing").join("deck.HTML"), b"x") else {
            return Err("a file was written into a missing folder".into());
        };
        assert_eq!(error.kind, ErrorKind::NotFound);
        Ok(())
    }
}
