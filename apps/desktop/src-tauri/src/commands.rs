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

/// The folder an exported file goes into. The path comes from the webview, so it is held to what
/// an export is: an absolute path to an `.html` file. Anything else is refused.
fn export_dir(path: &std::path::Path) -> Result<&std::path::Path> {
    let html = path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("html") || e.eq_ignore_ascii_case("htm"));
    path.parent()
        .filter(|_| html && path.is_absolute())
        .ok_or_else(|| {
            AppError::invalid_input(format!(
                "not an absolute path to an .html file: {}",
                path.display()
            ))
        })
}

/// Replaces the file at `path` with `bytes`, atomically. The path comes from the webview, so it
/// is held to what an export is: an absolute path to an `.html` file.
fn write_export(path: &std::path::Path, bytes: &[u8]) -> Result<()> {
    use std::io::Write as _;

    let dir = export_dir(path)?;
    let temp = crate::storage::TempFile::new_in(dir).map_err(|e| AppError::path(path, &e))?;
    temp.file()
        .and_then(|mut file| file.write_all(bytes))
        .map_err(|e| AppError::io("write the exported file", &e))?;
    temp.persist(path).map_err(|e| AppError::path(path, &e))
}

/// The video and audio of an export, in a folder beside the exported file (MED-05).
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportedMedia {
    /// The name of the folder, beside the exported file: `<name of the file>_media`.
    pub folder: String,
    /// The files now in the folder.
    pub files: Vec<ExportedMediaFile>,
    /// Asked for, and not among the workspace's assets: the export goes on without them.
    pub missing: Vec<String>,
}

/// One file of [`ExportedMedia`].
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportedMediaFile {
    /// Its name in the folder: the asset's file name, `<sha256>.<ext>`.
    pub file: String,
    /// Its size in bytes.
    pub bytes: u64,
}

/// `export_copy_media({ workspaceId, path, files })`: copies assets of the workspace into a
/// folder beside an exported file, for an export that keeps its video and audio outside the
/// file (MED-05). The bytes never pass through the webview: a video may be hundreds of megabytes.
///
/// The webview says only which file the export is (`path`, as for [`export_write_file`]) and
/// which assets go with it (their file names in the asset table). Where they are read from and
/// where they are written is decided here.
#[tauri::command]
pub async fn export_copy_media(
    storage: Shared<'_>,
    workspace_id: String,
    path: PathBuf,
    files: Vec<String>,
) -> Result<ExportedMedia> {
    let storage = Arc::clone(&storage);
    off_main(move || copy_export_media(&storage.assets_dir(&workspace_id)?, &path, &files)).await
}

/// The name of the media folder of an exported file: the file's name without its extension, and
/// `_media`. The webview derives the same name for the addresses it writes into the file
/// (`mediaFolderName` in `src/export/exportDeck.ts`).
fn media_folder_name(path: &std::path::Path) -> Result<String> {
    path.file_stem()
        .and_then(|stem| stem.to_str())
        .filter(|stem| !stem.is_empty())
        .map(|stem| format!("{stem}_media"))
        .ok_or_else(|| AppError::invalid_input(format!("the file has no name: {}", path.display())))
}

/// Whether `name` is the file name of an asset as the store writes it (`<sha256>.<ext>`), and
/// nothing that could point outside a folder.
fn is_asset_file_name(name: &str) -> bool {
    name.split_once('.').is_some_and(|(id, extension)| {
        id.len() == 64
            && id
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
            && (1..=10).contains(&extension.len())
            && extension.bytes().all(|b| b.is_ascii_alphanumeric())
    })
}

/// Copies `files` from `assets_dir` into the media folder of the export at `path`. A file that
/// is already there is left alone: its name is the hash of its content.
fn copy_export_media(
    assets_dir: &std::path::Path,
    path: &std::path::Path,
    files: &[String],
) -> Result<ExportedMedia> {
    let dir = export_dir(path)?;
    let folder = media_folder_name(path)?;
    if let Some(bad) = files.iter().find(|file| !is_asset_file_name(file)) {
        return Err(AppError::invalid_input(format!(
            "not the file name of an asset: {bad}"
        )));
    }
    let target_dir = dir.join(&folder);
    let mut copied = Vec::new();
    let mut missing = Vec::new();
    for file in files {
        let source = assets_dir.join(file);
        let Some(bytes) = std::fs::metadata(&source)
            .ok()
            .filter(std::fs::Metadata::is_file)
            .map(|meta| meta.len())
        else {
            missing.push(file.clone());
            continue;
        };
        let target = target_dir.join(file);
        let there =
            std::fs::metadata(&target).is_ok_and(|meta| meta.is_file() && meta.len() == bytes);
        if !there {
            std::fs::create_dir_all(&target_dir).map_err(|e| AppError::path(&target_dir, &e))?;
            let mut input =
                std::fs::File::open(&source).map_err(|e| AppError::path(&source, &e))?;
            // Under a temporary name first: the folder only ever holds whole files.
            let temp = crate::storage::TempFile::new_in(&target_dir)
                .map_err(|e| AppError::path(&target_dir, &e))?;
            temp.file()
                .and_then(|mut output| std::io::copy(&mut input, &mut output))
                .map_err(|e| AppError::io("copy the media of the export", &e))?;
            temp.persist(&target)
                .map_err(|e| AppError::path(&target, &e))?;
        }
        copied.push(ExportedMediaFile {
            file: file.clone(),
            bytes,
        });
    }
    Ok(ExportedMedia {
        folder,
        files: copied,
        missing,
    })
}

#[cfg(test)]
mod export_media_tests {
    use super::{copy_export_media, is_asset_file_name, media_folder_name};
    use crate::error::ErrorKind;

    type TestResult = std::result::Result<(), Box<dyn std::error::Error>>;

    const CLIP: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef.mp4";
    const SOUND: &str = "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210.wav";

    #[test]
    fn media_is_copied_into_a_folder_named_after_the_file() -> TestResult {
        let assets = tempfile::tempdir()?;
        let out = tempfile::tempdir()?;
        std::fs::write(assets.path().join(CLIP), b"video bytes")?;
        std::fs::write(assets.path().join(SOUND), b"sound")?;
        let html = out.path().join("Road map 2027.html");

        let done = copy_export_media(assets.path(), &html, &[CLIP.into(), SOUND.into()])?;

        assert_eq!(done.folder, "Road map 2027_media");
        let folder = out.path().join("Road map 2027_media");
        assert_eq!(std::fs::read(folder.join(CLIP))?, b"video bytes");
        assert_eq!(std::fs::read(folder.join(SOUND))?, b"sound");
        let sizes: Vec<_> = done
            .files
            .iter()
            .map(|f| (f.file.as_str(), f.bytes))
            .collect();
        assert_eq!(sizes, [(CLIP, 11), (SOUND, 5)]);
        assert!(done.missing.is_empty());
        // Only the two files: no temporary file is left beside them.
        assert_eq!(std::fs::read_dir(&folder)?.count(), 2);
        // The assets are copied, not moved.
        assert!(assets.path().join(CLIP).is_file());
        Ok(())
    }

    #[test]
    fn a_file_that_is_already_there_is_left_alone_and_one_that_differs_is_replaced() -> TestResult {
        let assets = tempfile::tempdir()?;
        let out = tempfile::tempdir()?;
        std::fs::write(assets.path().join(CLIP), b"video bytes")?;
        let html = out.path().join("deck.htm");
        let target = out.path().join("deck_media").join(CLIP);

        copy_export_media(assets.path(), &html, &[CLIP.into()])?;
        let first = std::fs::metadata(&target)?.modified()?;
        copy_export_media(assets.path(), &html, &[CLIP.into()])?;
        assert_eq!(std::fs::metadata(&target)?.modified()?, first);

        // A file of that name and another size is not that asset: a copy that was cut short.
        std::fs::write(&target, b"cut")?;
        copy_export_media(assets.path(), &html, &[CLIP.into()])?;
        assert_eq!(std::fs::read(&target)?, b"video bytes");
        Ok(())
    }

    #[test]
    fn an_asset_the_workspace_does_not_have_is_reported_and_no_folder_is_made_for_nothing()
    -> TestResult {
        let assets = tempfile::tempdir()?;
        let out = tempfile::tempdir()?;
        let html = out.path().join("deck.html");
        let done = copy_export_media(assets.path(), &html, &[CLIP.into()])?;
        assert_eq!(done.missing, [CLIP]);
        assert!(done.files.is_empty());
        assert_eq!(std::fs::read_dir(out.path())?.count(), 0);
        Ok(())
    }

    #[test]
    fn only_asset_file_names_are_taken_and_only_beside_an_html_file() -> TestResult {
        let assets = tempfile::tempdir()?;
        let out = tempfile::tempdir()?;
        std::fs::write(assets.path().join(CLIP), b"video bytes")?;
        std::fs::write(out.path().join("secret.txt"), b"secret")?;
        let html = out.path().join("deck.html");

        let traversal = format!("../{CLIP}");
        let nested = format!("sub/{CLIP}");
        let backslash = format!("..\\{CLIP}");
        for name in [
            "../secret.txt",
            "secret.txt",
            traversal.as_str(),
            nested.as_str(),
            backslash.as_str(),
            "C:\\Windows\\win.ini",
            "",
        ] {
            assert!(!is_asset_file_name(name), "{name}");
            let Err(error) = copy_export_media(assets.path(), &html, &[CLIP.into(), name.into()])
            else {
                return Err(format!("{name} was taken").into());
            };
            assert_eq!(error.kind, ErrorKind::InvalidInput);
        }
        // Nothing was written before the bad name was found.
        assert_eq!(std::fs::read_dir(out.path())?.count(), 1);

        for path in [
            out.path().join("deck.slidr"),
            out.path().join("deck"),
            std::path::PathBuf::from("deck.html"),
        ] {
            let Err(error) = copy_export_media(assets.path(), &path, &[CLIP.into()]) else {
                return Err(format!("{} was taken", path.display()).into());
            };
            assert_eq!(error.kind, ErrorKind::InvalidInput);
        }
        assert_eq!(std::fs::read_dir(out.path())?.count(), 1);
        Ok(())
    }

    #[test]
    fn the_folder_is_named_after_the_file_without_its_extension() -> TestResult {
        let name = |file: &str| media_folder_name(std::path::Path::new(file));
        assert_eq!(name("C:/out/deck.html")?, "deck_media");
        assert_eq!(name("C:/out/my.deck.HTM")?, "my.deck_media");
        assert_eq!(name("C:/out/מצגת ראשונה.html")?, "מצגת ראשונה_media");
        Ok(())
    }
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
