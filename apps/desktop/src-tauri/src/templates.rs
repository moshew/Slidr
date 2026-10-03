//! Personal templates (THM-05, THM-08): the templates a user saved, kept as files so that they
//! outlive the webview's own storage.
//!
//! The webview owns what a template is. This layer keeps `template.json` as opaque text and the
//! template's asset files as opaque bytes, each template in a folder named by its id:
//!
//! ```text
//! <app_data>/templates/<id>/template.json
//! <app_data>/templates/<id>/assets/<file>
//! ```

use std::{
    fs,
    io::Write as _,
    path::{Path, PathBuf},
    sync::Arc,
};

use percent_encoding::percent_decode_str;
use serde::Serialize;
use tauri::{
    State,
    ipc::{InvokeBody, Request, Response},
};

use crate::{
    error::{AppError, Result},
    storage::TempFile,
};

const TEMPLATE_FILE: &str = "template.json";
const ASSETS_DIR: &str = "assets";

/// A saved template as the webview gets it back.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct StoredTemplate {
    /// The folder name, which is the id of the template's theme.
    pub id: String,
    /// The template, as the webview wrote it.
    pub json: String,
}

/// The folder of personal templates.
#[derive(Debug)]
pub struct TemplateStore {
    root: PathBuf,
}

/// An id or a file name that is a single, plain path component.
fn plain(name: &str, what: &str) -> Result<()> {
    let ok = !name.is_empty()
        && name.len() <= 128
        && !name.starts_with('.')
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.'));
    if ok {
        Ok(())
    } else {
        Err(AppError::invalid_input(format!("not a {what}: {name:?}")))
    }
}

fn write_atomic(dir: &Path, target: &Path, bytes: &[u8]) -> Result<()> {
    let temp = TempFile::new_in(dir).map_err(|e| AppError::path(dir, &e))?;
    temp.file()
        .and_then(|mut file| file.write_all(bytes))
        .map_err(|e| AppError::io("write a template file", &e))?;
    temp.persist(target).map_err(|e| AppError::path(target, &e))
}

impl TemplateStore {
    /// The store under the app data directory.
    pub fn new(app_data: &Path) -> Self {
        Self {
            root: app_data.join("templates"),
        }
    }

    fn dir(&self, id: &str) -> Result<PathBuf> {
        plain(id, "template id")?;
        Ok(self.root.join(id))
    }

    /// Every saved template, by id. A folder without a readable `template.json` is skipped:
    /// one broken template must not hide the others.
    pub fn list(&self) -> Result<Vec<StoredTemplate>> {
        let entries = match fs::read_dir(&self.root) {
            Ok(entries) => entries,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(error) => return Err(AppError::path(&self.root, &error)),
        };
        let mut templates = Vec::new();
        for entry in entries.flatten() {
            let Some(id) = entry.file_name().to_str().map(str::to_owned) else {
                continue;
            };
            if plain(&id, "template id").is_err() {
                continue;
            }
            if let Ok(json) = fs::read_to_string(entry.path().join(TEMPLATE_FILE)) {
                templates.push(StoredTemplate { id, json });
            }
        }
        templates.sort_by(|a, b| a.id.cmp(&b.id));
        Ok(templates)
    }

    /// Writes a template, replacing the one with the same id. Its asset files stay.
    pub fn save(&self, id: &str, json: &str) -> Result<()> {
        let dir = self.dir(id)?;
        fs::create_dir_all(&dir).map_err(|e| AppError::path(&dir, &e))?;
        write_atomic(&dir, &dir.join(TEMPLATE_FILE), json.as_bytes())
    }

    /// Stores an asset file of a template.
    pub fn write_asset(&self, id: &str, file: &str, bytes: &[u8]) -> Result<()> {
        plain(file, "file name")?;
        let dir = self.dir(id)?.join(ASSETS_DIR);
        fs::create_dir_all(&dir).map_err(|e| AppError::path(&dir, &e))?;
        write_atomic(&dir, &dir.join(file), bytes)
    }

    /// The bytes of an asset file of a template.
    pub fn read_asset(&self, id: &str, file: &str) -> Result<Vec<u8>> {
        plain(file, "file name")?;
        let path = self.dir(id)?.join(ASSETS_DIR).join(file);
        fs::read(&path).map_err(|e| AppError::path(&path, &e))
    }

    /// Deletes a template and its asset files. Deleting one that is not there is not an error.
    pub fn remove(&self, id: &str) -> Result<()> {
        let dir = self.dir(id)?;
        match fs::remove_dir_all(&dir) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(AppError::path(&dir, &error)),
        }
    }
}

type Shared<'a> = State<'a, Arc<TemplateStore>>;

async fn off_main<T, F>(task: F) -> Result<T>
where
    F: FnOnce() -> Result<T> + Send + 'static,
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(AppError::internal)?
}

/// `template_store_list()`: the personal templates.
#[tauri::command]
pub async fn template_store_list(store: Shared<'_>) -> Result<Vec<StoredTemplate>> {
    let store = Arc::clone(&store);
    off_main(move || store.list()).await
}

/// `template_store_save({ id, json })`: writes a personal template.
#[tauri::command]
pub async fn template_store_save(store: Shared<'_>, id: String, json: String) -> Result<()> {
    let store = Arc::clone(&store);
    off_main(move || store.save(&id, &json)).await
}

/// `template_store_remove({ id })`: deletes a personal template.
#[tauri::command]
pub async fn template_store_remove(store: Shared<'_>, id: String) -> Result<()> {
    let store = Arc::clone(&store);
    off_main(move || store.remove(&id)).await
}

/// `template_store_read_asset({ id, file })`: the raw bytes of an asset file of a template.
#[tauri::command]
pub async fn template_store_read_asset(
    store: Shared<'_>,
    id: String,
    file: String,
) -> Result<Response> {
    let store = Arc::clone(&store);
    off_main(move || store.read_asset(&id, &file))
        .await
        .map(Response::new)
}

/// `template_store_write_asset`: stores an asset file of a template. The body is the raw bytes;
/// the template id and the file name travel as the headers `x-template-id` and `x-file-name`,
/// as in `asset_import_bytes`.
#[tauri::command]
pub async fn template_store_write_asset(store: Shared<'_>, request: Request<'_>) -> Result<()> {
    let header = |name: &str| -> Result<String> {
        let invalid = || AppError::invalid_input(format!("missing or malformed header {name}"));
        let value = request.headers().get(name).ok_or_else(invalid)?;
        let value = value.to_str().map_err(|_| invalid())?;
        percent_decode_str(value)
            .decode_utf8()
            .map(std::borrow::Cow::into_owned)
            .map_err(|_| invalid())
    };
    let id = header("x-template-id")?;
    let file = header("x-file-name")?;
    let bytes = match request.body() {
        InvokeBody::Raw(bytes) => bytes.clone(),
        InvokeBody::Json(value) => serde_json::from_value(value.clone())
            .map_err(|e| AppError::invalid_input(format!("the body is not bytes: {e}")))?,
    };
    let store = Arc::clone(&store);
    off_main(move || store.write_asset(&id, &file, &bytes)).await
}

#[cfg(test)]
mod tests {
    use super::{StoredTemplate, TemplateStore};
    use crate::error::ErrorKind;

    type TestResult = std::result::Result<(), Box<dyn std::error::Error>>;

    #[test]
    fn a_saved_template_is_listed_replaced_and_removed() -> TestResult {
        let dir = tempfile::tempdir()?;
        let store = TemplateStore::new(dir.path());
        assert_eq!(store.list()?, Vec::new());

        store.save("personal_b", r#"{"name":"B"}"#)?;
        store.save("personal_a", r#"{"name":"A"}"#)?;
        store.save("personal_b", r#"{"name":"B2"}"#)?;
        let listed = store.list()?;
        assert_eq!(
            listed,
            vec![
                StoredTemplate {
                    id: "personal_a".into(),
                    json: r#"{"name":"A"}"#.into()
                },
                StoredTemplate {
                    id: "personal_b".into(),
                    json: r#"{"name":"B2"}"#.into()
                },
            ]
        );

        store.remove("personal_a")?;
        // Removing what is not there is fine: the caller wanted it gone.
        store.remove("personal_a")?;
        assert_eq!(store.list()?.len(), 1);
        Ok(())
    }

    #[test]
    fn asset_files_are_kept_with_their_template_and_go_with_it() -> TestResult {
        let dir = tempfile::tempdir()?;
        let store = TemplateStore::new(dir.path());
        store.save("personal_a", "{}")?;
        store.write_asset("personal_a", "ab12.png", b"logo")?;
        assert_eq!(store.read_asset("personal_a", "ab12.png")?, b"logo");
        // Saving the template again leaves its files.
        store.save("personal_a", r#"{"v":2}"#)?;
        assert_eq!(store.read_asset("personal_a", "ab12.png")?, b"logo");

        let Err(missing) = store.read_asset("personal_a", "nope.png") else {
            return Err("a missing file was read".into());
        };
        assert_eq!(missing.kind, ErrorKind::NotFound);

        store.remove("personal_a")?;
        assert!(store.read_asset("personal_a", "ab12.png").is_err());
        assert!(!dir.path().join("templates").join("personal_a").exists());
        Ok(())
    }

    #[test]
    fn an_id_or_a_file_name_that_is_a_path_is_refused() -> TestResult {
        let dir = tempfile::tempdir()?;
        let store = TemplateStore::new(dir.path());
        for id in ["", "..", "a/b", r"a\b", ".hidden", "a b"] {
            let Err(error) = store.save(id, "{}") else {
                return Err(format!("{id:?} was saved").into());
            };
            assert_eq!(error.kind, ErrorKind::InvalidInput);
        }
        store.save("ok", "{}")?;
        for file in ["../template.json", "a/b.png", ""] {
            let Err(error) = store.write_asset("ok", file, b"x") else {
                return Err(format!("{file:?} was written").into());
            };
            assert_eq!(error.kind, ErrorKind::InvalidInput);
        }
        // Nothing was written outside the store.
        assert_eq!(std::fs::read_dir(dir.path())?.count(), 1);
        Ok(())
    }

    #[test]
    fn a_folder_without_a_template_does_not_hide_the_others() -> TestResult {
        let dir = tempfile::tempdir()?;
        let store = TemplateStore::new(dir.path());
        store.save("good", "{}")?;
        std::fs::create_dir_all(dir.path().join("templates").join("broken"))?;
        assert_eq!(store.list()?.len(), 1);
        Ok(())
    }
}
