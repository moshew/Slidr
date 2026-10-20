//! Workspaces: the unpacked, working form of a deck (DOC-02), autosave and crash recovery
//! (DOC-03).
//!
//! Every open workspace holds an OS lock on its `.lock` file for as long as it is open. A
//! workspace directory whose lock can be taken therefore belongs to no running instance: it
//! is a crash leftover, recoverable when it is dirty and disposable when it is not.

use std::{
    collections::HashMap,
    fs::{self, File, TryLockError},
    io,
    path::{self, Path, PathBuf},
    sync::{Mutex, MutexGuard, PoisonError},
};

use serde::{Deserialize, Serialize};

use super::{
    ASSETS_DIR, DECK_FILE, LOCK_FILE, META_FILE, STATE_FILE, archive, atomic, chat_uploads,
    deck::DeckInfo,
    recents::{self, RecentFile},
    source,
    time::now_iso,
};
use crate::error::{AppError, Result};

/// A workspace as the webview sees it.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    /// Opaque id; also the directory name.
    pub id: String,
    /// Absolute path of the workspace directory, for `convertFileSrc`.
    pub dir: String,
    /// The `.slidr` file this workspace was opened from or last saved to.
    pub source_path: Option<String>,
}

/// A deck ready for the webview to parse.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenedDeck {
    /// Where the deck now lives.
    pub workspace: Workspace,
    /// `deck.json`, byte for byte as stored.
    pub deck_json: String,
    /// `meta.json`, when the file has one.
    pub meta_json: Option<String>,
}

/// The outcome of a save.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedDeck {
    /// Absolute path of the written file.
    pub path: String,
    /// `assets[*].file` of the deck that the file was written without: files that are not in
    /// the workspace, and names that are not file names at all.
    pub missing_assets: Vec<String>,
}

/// A workspace with unsaved work left behind by a crash.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Recoverable {
    /// Pass to `storage_recover` or `storage_close`.
    pub id: String,
    /// The file it was opened from or last saved to.
    pub source_path: Option<String>,
    /// The title at the last autosave.
    pub title: String,
    /// When the deck was last autosaved (ISO 8601, UTC).
    pub autosaved_at: Option<String>,
}

/// `.workspace.json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceState {
    id: String,
    source_path: Option<String>,
    /// The workspace has changes the source file does not.
    dirty: bool,
    title: String,
    opened_at: String,
    autosaved_at: Option<String>,
    saved_at: Option<String>,
}

impl WorkspaceState {
    fn new(id: &str, source_path: Option<String>, title: String) -> Self {
        Self {
            id: id.to_owned(),
            source_path,
            dirty: false,
            title,
            opened_at: now_iso(),
            autosaved_at: None,
            saved_at: None,
        }
    }
}

/// Workspaces open in this process, each with the handle that holds its lock.
type OpenSet = HashMap<String, File>;

/// All workspaces and the recents list, rooted at the app data directory. Managed by Tauri.
pub struct Storage {
    root: PathBuf,
    /// Also serialises every operation that rewrites workspace state or the recents list.
    open: Mutex<OpenSet>,
}

impl Storage {
    /// Storage under `root` (Tauri's `app_data_dir()`).
    pub fn new(root: PathBuf) -> Self {
        Self {
            root,
            open: Mutex::new(HashMap::new()),
        }
    }

    fn open_set(&self) -> MutexGuard<'_, OpenSet> {
        // A panic mid-operation leaves nothing half-done in the map itself.
        self.open.lock().unwrap_or_else(PoisonError::into_inner)
    }

    fn dir_of(&self, id: &str) -> Result<PathBuf> {
        // The id becomes a path component; anything but a plain token could point elsewhere.
        let valid = !id.is_empty()
            && id.len() <= 64
            && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-');
        if valid {
            Ok(self.root.join("workspaces").join(id))
        } else {
            Err(AppError::unknown_workspace(id))
        }
    }

    fn open_dir(&self, open: &OpenSet, id: &str) -> Result<PathBuf> {
        let dir = self.dir_of(id)?;
        if open.contains_key(id) {
            Ok(dir)
        } else {
            Err(AppError::unknown_workspace(id))
        }
    }

    /// The `assets/` directory of a workspace open in this process.
    pub fn assets_dir(&self, id: &str) -> Result<PathBuf> {
        let open = self.open_set();
        Ok(self.open_dir(&open, id)?.join(ASSETS_DIR))
    }

    /// The attachments of one chat in an open workspace, for the agent's read-only workdir.
    pub fn chat_uploads_dir(&self, id: &str, thread: &str) -> Result<PathBuf> {
        let open = self.open_set();
        chat_uploads::thread_dir(&self.open_dir(&open, id)?, thread)
    }

    /// Keeps an attachment with the open document and, once saved, beside its `.slidr` file.
    pub fn write_chat_upload(
        &self,
        id: &str,
        thread: &str,
        name: &str,
        bytes: &[u8],
    ) -> Result<()> {
        let open = self.open_set();
        let dir = self.open_dir(&open, id)?;
        let source = read_state(&dir).and_then(|state| state.source_path);
        chat_uploads::write(&dir, source.as_deref().map(Path::new), thread, name, bytes)
    }

    /// Creates a locked, empty workspace directory. The caller registers it as open once it is
    /// filled, or discards it.
    fn create(&self) -> Result<(String, PathBuf, File)> {
        let id = uuid::Uuid::new_v4().simple().to_string();
        let dir = self.dir_of(&id)?;
        fs::create_dir_all(dir.join(ASSETS_DIR))
            .map_err(|e| AppError::io("create a workspace", &e))?;
        match try_lock(&dir) {
            Ok(Some(lock)) => Ok((id, dir, lock)),
            Ok(None) => Err(AppError::internal("a brand-new workspace is locked")),
            Err(e) => Err(AppError::io("lock a new workspace", &e)),
        }
    }

    /// A new, empty workspace: no `deck.json` until the first autosave or save.
    pub fn new_workspace(&self) -> Result<Workspace> {
        let mut open = self.open_set();
        let (id, dir, lock) = self.create()?;
        if let Err(error) = write_state(&dir, &WorkspaceState::new(&id, None, String::new())) {
            discard(&dir, lock);
            return Err(error);
        }
        open.insert(id.clone(), lock);
        Ok(Workspace {
            id,
            dir: display(&dir),
            source_path: None,
        })
    }

    /// Unpacks the `.slidr` file at `path` into a fresh workspace (DOC-01, DOC-02).
    pub fn open(&self, path: &Path) -> Result<OpenedDeck> {
        let path = absolute(path);
        let mut open = self.open_set();
        let (id, dir, lock) = self.create()?;
        match self.fill_from(&path, &id, &dir) {
            Ok(opened) => {
                open.insert(id, lock);
                Ok(opened)
            }
            Err(error) => {
                discard(&dir, lock);
                Err(error)
            }
        }
    }

    fn fill_from(&self, path: &Path, id: &str, dir: &Path) -> Result<OpenedDeck> {
        archive::unpack(path, dir)?;
        let deck_json = read_deck(dir)?;
        chat_uploads::restore(path, dir)?;
        let source = display(path);
        let title = recents::title_of(&self.root, &source).unwrap_or_else(|| file_title(path));
        write_state(
            dir,
            &WorkspaceState::new(id, Some(source.clone()), title.clone()),
        )?;
        // Best effort: the deck is open even when the list cannot be updated.
        let _ = recents::add(&self.root, &source, &title);
        Ok(OpenedDeck {
            workspace: Workspace {
                id: id.to_owned(),
                dir: display(dir),
                source_path: Some(source),
            },
            deck_json,
            meta_json: read_meta(dir),
        })
    }

    /// Autosave (DOC-03): replaces `deck.json` atomically and marks the workspace dirty.
    pub fn write_deck(&self, id: &str, deck_json: &str, title: &str) -> Result<()> {
        let open = self.open_set();
        let dir = self.open_dir(&open, id)?;
        store_deck(&dir, id, deck_json, Some(title)).map(drop)
    }

    /// Save (DOC-01): stores `deck_json` in the workspace, stamps `meta.json`, and packs the
    /// workspace into `path`, replacing any file there atomically.
    pub fn save(
        &self,
        id: &str,
        path: &Path,
        deck_json: &str,
        title: Option<&str>,
    ) -> Result<SavedDeck> {
        // Malformed input fails before anything is written.
        let info = DeckInfo::parse(deck_json)?;
        let target = absolute(path);
        let open = self.open_set();
        let dir = self.open_dir(&open, id)?;

        // Stored and marked dirty first: if packing fails, nothing is lost.
        let mut state = store_deck(&dir, id, deck_json, title)?;
        let saved_at = now_iso();
        write_meta(&dir, &info.schema_version, &saved_at)?;
        chat_uploads::save(&dir, &target)?;
        let mut missing_assets = archive::pack(&dir, &target, &info.asset_files, &info.slide_ids)?;
        // A name that is no file name was never looked for: to the deck it is as missing.
        missing_assets.extend(info.unusable_assets);

        let source = display(&target);
        state.source_path = Some(source.clone());
        state.dirty = false;
        state.saved_at = Some(saved_at);
        write_state(&dir, &state)?;
        let title = if state.title.is_empty() {
            file_title(&target)
        } else {
            state.title
        };
        // Best effort: the file is saved even when the list cannot be updated.
        let _ = recents::add(&self.root, &source, &title);
        Ok(SavedDeck {
            path: source,
            missing_assets,
        })
    }

    /// Deletes a workspace: one open here, or a crash leftover the user chose not to recover.
    /// Closing a workspace that is already gone is not an error.
    pub fn close(&self, id: &str) -> Result<()> {
        let mut open = self.open_set();
        let dir = self.dir_of(id)?;
        if let Some(lock) = open.remove(id) {
            drop(lock);
        } else if dir.is_dir() {
            // Not ours: delete it only if no other running instance has it open.
            match try_lock(&dir) {
                Ok(Some(_lock)) => {}
                Ok(None) => return Err(AppError::unknown_workspace(id)),
                Err(e) => return Err(AppError::io("lock the workspace", &e)),
            }
        }
        // State first: if a file still in use keeps the directory from going away entirely,
        // what is left is no longer dirty, and the next `list_recoverable` sweeps it.
        let _ = fs::remove_file(dir.join(STATE_FILE));
        match fs::remove_dir_all(&dir) {
            Err(e) if e.kind() != io::ErrorKind::NotFound => {
                Err(AppError::io("delete the workspace", &e))
            }
            _ => Ok(()),
        }
    }

    /// Crash recovery (DOC-03): the dirty workspaces no running instance has open, newest
    /// first. Leftovers with nothing unsaved in them are deleted on the way.
    pub fn list_recoverable(&self) -> Result<Vec<Recoverable>> {
        let open = self.open_set();
        let entries = match fs::read_dir(self.root.join("workspaces")) {
            Ok(entries) => entries,
            Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(e) => return Err(AppError::io("list the workspaces", &e)),
        };
        let mut found = Vec::new();
        for entry in entries.flatten() {
            let Ok(id) = entry.file_name().into_string() else {
                continue;
            };
            let Ok(dir) = self.dir_of(&id) else { continue };
            if open.contains_key(&id) || !dir.is_dir() {
                continue;
            }
            // Locked by another running instance (or not lockable): not a leftover.
            let Ok(Some(lock)) = try_lock(&dir) else {
                continue;
            };
            let state =
                read_state(&dir).filter(|state| state.dirty && dir.join(DECK_FILE).is_file());
            drop(lock);
            match state {
                Some(state) => found.push(Recoverable {
                    id,
                    source_path: state.source_path,
                    title: state.title,
                    autosaved_at: state.autosaved_at,
                }),
                None => {
                    let _ = fs::remove_dir_all(&dir);
                }
            }
        }
        found.sort_by(|a, b| b.autosaved_at.cmp(&a.autosaved_at));
        Ok(found)
    }

    /// Reopens a workspace as it is on disk and marks it open here. Also works for a workspace
    /// this process already has open (a webview reload).
    pub fn recover(&self, id: &str) -> Result<OpenedDeck> {
        let mut open = self.open_set();
        let dir = self.dir_of(id)?;
        if !dir.is_dir() {
            return Err(AppError::unknown_workspace(id));
        }
        let deck_json = read_deck(&dir)?;
        if !open.contains_key(id) {
            match try_lock(&dir) {
                Ok(Some(lock)) => open.insert(id.to_owned(), lock),
                Ok(None) => return Err(AppError::unknown_workspace(id)),
                Err(e) => return Err(AppError::io("lock the workspace", &e)),
            };
        }
        let source_path = read_state(&dir).and_then(|state| state.source_path);
        Ok(OpenedDeck {
            workspace: Workspace {
                id: id.to_owned(),
                dir: display(&dir),
                source_path,
            },
            deck_json,
            meta_json: read_meta(&dir),
        })
    }

    /// The recent files, most recent first.
    pub fn recents(&self) -> Vec<RecentFile> {
        recents::list(&self.root)
    }

    /// Takes `path` off the recent files list.
    pub fn remove_recent(&self, path: &str) -> Result<()> {
        let _open = self.open_set();
        recents::remove(&self.root, path)
    }

    /// Keeps a copy of the file at `from` in the workspace, as the file the deck was imported
    /// from (IMP-07): `source/import.html`, which every save packs. Returns its size.
    pub fn keep_source(&self, id: &str, from: &Path) -> Result<u64> {
        let open = self.open_set();
        source::keep(&self.open_dir(&open, id)?, from)
    }

    /// Copies the source the workspace keeps to `to`. `not_found` when it keeps none.
    pub fn copy_source(&self, id: &str, to: &Path) -> Result<u64> {
        let open = self.open_set();
        source::copy_to(&self.open_dir(&open, id)?, to)
    }

    /// Takes the kept source out of the workspace: the next save writes a file without it.
    /// `false` when it kept none.
    pub fn remove_source(&self, id: &str) -> Result<bool> {
        let open = self.open_set();
        source::remove(&self.open_dir(&open, id)?)
    }

    /// The record of the import the workspace's deck came from (`source/import.json`), as the
    /// webview wrote it; `None` when there is none.
    pub fn import_record(&self, id: &str) -> Result<Option<String>> {
        let open = self.open_set();
        source::read_record(&self.open_dir(&open, id)?)
    }

    /// Replaces the record of the import. The text is the webview's and is not read here.
    pub fn write_import_record(&self, id: &str, text: &str) -> Result<()> {
        let open = self.open_set();
        source::write_record(&self.open_dir(&open, id)?, text)
    }
}

/// Opens the workspace's lock file and tries to lock it. `None`: another instance holds it.
fn try_lock(dir: &Path) -> io::Result<Option<File>> {
    let file = File::options()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(dir.join(LOCK_FILE))?;
    match file.try_lock() {
        Ok(()) => Ok(Some(file)),
        Err(TryLockError::WouldBlock) => Ok(None),
        // A file system without locks: the workspace is still usable, just not guarded.
        Err(TryLockError::Error(e)) if e.kind() == io::ErrorKind::Unsupported => Ok(Some(file)),
        Err(TryLockError::Error(e)) => Err(e),
    }
}

fn discard(dir: &Path, lock: File) {
    drop(lock);
    let _ = fs::remove_dir_all(dir);
}

/// Writes `deck.json` and marks the workspace dirty. Returns the updated state.
fn store_deck(
    dir: &Path,
    id: &str,
    deck_json: &str,
    title: Option<&str>,
) -> Result<WorkspaceState> {
    atomic::write(&dir.join(DECK_FILE), deck_json.as_bytes())
        .map_err(|e| AppError::io("write deck.json", &e))?;
    let mut state = read_state(dir).unwrap_or_else(|| WorkspaceState::new(id, None, String::new()));
    state.dirty = true;
    state.autosaved_at = Some(now_iso());
    if let Some(title) = title {
        title.clone_into(&mut state.title);
    }
    write_state(dir, &state)?;
    Ok(state)
}

fn read_state(dir: &Path) -> Option<WorkspaceState> {
    let bytes = fs::read(dir.join(STATE_FILE)).ok()?;
    serde_json::from_slice(&bytes).ok()
}

fn write_state(dir: &Path, state: &WorkspaceState) -> Result<()> {
    let bytes = serde_json::to_vec_pretty(state).map_err(AppError::internal)?;
    atomic::write(&dir.join(STATE_FILE), &bytes)
        .map_err(|e| AppError::io("write the workspace state", &e))
}

fn read_deck(dir: &Path) -> Result<String> {
    fs::read_to_string(dir.join(DECK_FILE)).map_err(|e| match e.kind() {
        io::ErrorKind::NotFound => AppError::invalid_file("there is no deck.json"),
        io::ErrorKind::InvalidData => AppError::invalid_file("deck.json is not UTF-8 text"),
        _ => AppError::io("read deck.json", &e),
    })
}

fn read_meta(dir: &Path) -> Option<String> {
    fs::read_to_string(dir.join(META_FILE)).ok()
}

/// Regenerates `meta.json`: app version, schema version and save time, keeping every other
/// key (harness session ids and whatever else other parts of the app store there).
fn write_meta(dir: &Path, schema_version: &serde_json::Number, saved_at: &str) -> Result<()> {
    let path = dir.join(META_FILE);
    let mut meta = fs::read(&path)
        .ok()
        .and_then(|bytes| serde_json::from_slice::<serde_json::Map<_, _>>(&bytes).ok())
        .unwrap_or_default();
    meta.insert("appVersion".into(), env!("CARGO_PKG_VERSION").into());
    meta.insert(
        "schemaVersion".into(),
        serde_json::Value::Number(schema_version.clone()),
    );
    meta.insert("savedAt".into(), saved_at.into());
    let bytes = serde_json::to_vec_pretty(&meta).map_err(AppError::internal)?;
    atomic::write(&path, &bytes).map_err(|e| AppError::io("write meta.json", &e))
}

fn display(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn absolute(path: &Path) -> PathBuf {
    path::absolute(path).unwrap_or_else(|_| path.to_path_buf())
}

fn file_title(path: &Path) -> String {
    path.file_stem()
        .map(|stem| stem.to_string_lossy().into_owned())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use std::io::{Read, Write};

    use zip::{ZipArchive, ZipWriter, write::SimpleFileOptions};

    use super::*;
    use crate::{
        assets::{self, tiny_png},
        error::ErrorKind,
    };

    type TestResult = std::result::Result<(), Box<dyn std::error::Error>>;

    struct Fixture {
        _temp: tempfile::TempDir,
        /// The app data directory.
        root: PathBuf,
        /// Where the user keeps `.slidr` files.
        files: PathBuf,
    }

    fn fixture() -> io::Result<Fixture> {
        let temp = tempfile::tempdir()?;
        let root = temp.path().join("app");
        let files = temp.path().join("files");
        fs::create_dir_all(&files)?;
        Ok(Fixture {
            _temp: temp,
            root,
            files,
        })
    }

    /// A deck as the webview would send it; formatted oddly on purpose, since open must give
    /// back exactly these bytes.
    fn deck(assets: &[(&str, &str)]) -> String {
        let assets: serde_json::Map<_, _> = assets
            .iter()
            .map(|&(id, file)| {
                let meta = serde_json::json!({ "id": id, "file": file, "kind": "image" });
                (id.to_owned(), meta)
            })
            .collect();
        format!(
            "{{\n  \"schemaVersion\": 1,\n  \"meta\": {{ \"title\": \"שלום\" }},\n  \"assets\": {}\n}}\n",
            serde_json::Value::Object(assets)
        )
    }

    fn kind<T>(result: Result<T>) -> Option<ErrorKind> {
        result.err().map(|error| error.kind)
    }

    fn names_in(dir: &Path) -> io::Result<Vec<String>> {
        let mut names = Vec::new();
        for entry in fs::read_dir(dir)? {
            names.push(entry?.file_name().to_string_lossy().into_owned());
        }
        names.sort();
        Ok(names)
    }

    fn entries_of(archive: &Path) -> std::result::Result<Vec<String>, Box<dyn std::error::Error>> {
        let archive = ZipArchive::new(File::open(archive)?)?;
        let mut names: Vec<String> = archive.file_names().map(str::to_owned).collect();
        names.sort();
        Ok(names)
    }

    fn write_zip(path: &Path, entries: &[(&str, &[u8])]) -> TestResult {
        let mut zip = ZipWriter::new(File::create(path)?);
        for &(name, bytes) in entries {
            zip.start_file(name, SimpleFileOptions::default())?;
            zip.write_all(bytes)?;
        }
        zip.finish()?;
        Ok(())
    }

    #[test]
    fn save_then_open_gives_back_the_deck_assets_and_side_files() -> TestResult {
        let fx = fixture()?;
        let storage = Storage::new(fx.root.clone());
        let workspace = storage.new_workspace()?;
        let dir = PathBuf::from(&workspace.dir);
        let png = tiny_png(64, 32);
        let asset = assets::import_bytes(&storage.assets_dir(&workspace.id)?, None, &png)?;
        let side_files: [(&str, &[u8]); 4] = [
            ("thumbs/s1.webp", b"RIFF thumb"),
            ("chat/t1.jsonl", b"{\"role\":\"user\"}\n"),
            ("source/import.html", "<p dir=\"rtl\">שלום</p>".as_bytes()),
            ("source/nested/style.css", b"p{}"),
        ];
        for (name, bytes) in side_files {
            let path = dir.join(name);
            fs::create_dir_all(path.parent().ok_or("no parent")?)?;
            fs::write(path, bytes)?;
        }
        fs::write(
            dir.join(META_FILE),
            br#"{"harness":{"claude-code":"session-1"},"savedAt":"old"}"#,
        )?;

        let deck = deck(&[(&asset.id, &asset.file)]);
        let target = fx.files.join("deck.slidr");
        let saved = storage.save(&workspace.id, &target, &deck, Some("Deck"))?;
        assert_eq!(saved.path, display(&target));
        assert!(saved.missing_assets.is_empty());
        assert!(
            entries_of(&target)?
                .iter()
                .all(|name| !name.starts_with('.'))
        );

        let opened = storage.open(&target)?;
        assert_ne!(opened.workspace.id, workspace.id);
        assert_eq!(opened.deck_json, deck);
        assert_eq!(
            opened.workspace.source_path.as_deref(),
            Some(saved.path.as_str())
        );
        let reopened = PathBuf::from(&opened.workspace.dir);
        assert_eq!(fs::read(reopened.join(ASSETS_DIR).join(&asset.file))?, png);
        assert_eq!(fs::read(reopened.join(DECK_FILE))?, deck.as_bytes());
        for (name, bytes) in side_files {
            assert_eq!(fs::read(reopened.join(name))?, bytes, "{name}");
        }
        let meta: serde_json::Value =
            serde_json::from_str(opened.meta_json.as_deref().ok_or("no meta.json")?)?;
        assert_eq!(meta["harness"]["claude-code"], "session-1");
        assert_eq!(meta["schemaVersion"], 1);
        assert_eq!(meta["appVersion"], env!("CARGO_PKG_VERSION"));
        assert_ne!(meta["savedAt"], "old");
        Ok(())
    }

    #[test]
    fn saving_over_a_file_replaces_it_and_leaves_no_temp_file() -> TestResult {
        let fx = fixture()?;
        let storage = Storage::new(fx.root.clone());
        let workspace = storage.new_workspace()?;
        let target = fx.files.join("deck.slidr");
        fs::write(&target, b"an older file")?;

        storage.save(&workspace.id, &target, &deck(&[]), None)?;
        let second = deck(&[]).replace("שלום", "second version");
        storage.save(&workspace.id, &target, &second, None)?;

        assert_eq!(names_in(&fx.files)?, ["deck.slidr"]);
        assert_eq!(storage.open(&target)?.deck_json, second);
        Ok(())
    }

    #[test]
    fn a_failed_save_keeps_the_previous_file() -> TestResult {
        let fx = fixture()?;
        let storage = Storage::new(fx.root.clone());
        let workspace = storage.new_workspace()?;
        let dir = PathBuf::from(&workspace.dir);
        let target = fx.files.join("deck.slidr");
        storage.save(&workspace.id, &target, &deck(&[]), None)?;
        let before = fs::read(&target)?;

        // An asset that cannot be read makes packing fail halfway through the archive.
        fs::create_dir(dir.join(ASSETS_DIR).join("broken.png"))?;
        let newer = deck(&[("broken", "broken.png")]);
        assert_eq!(
            kind(storage.save(&workspace.id, &target, &newer, None)),
            Some(ErrorKind::Io)
        );
        assert_eq!(fs::read(&target)?, before);
        assert_eq!(names_in(&fx.files)?, ["deck.slidr"]);

        // The workspace has the newer deck and says so, so a crash now would lose nothing.
        assert_eq!(fs::read_to_string(dir.join(DECK_FILE))?, newer);
        assert!(read_state(&dir).is_some_and(|state| state.dirty));

        // Malformed input and a missing folder fail before anything is written.
        let missing_folder = fx.files.join("no-such-folder").join("deck.slidr");
        let result = storage.save(&workspace.id, &missing_folder, &deck(&[]), None);
        assert_eq!(kind(result), Some(ErrorKind::NotFound));
        assert_eq!(
            kind(storage.save(&workspace.id, &target, "{}", None)),
            Some(ErrorKind::InvalidInput)
        );
        assert_eq!(fs::read(&target)?, before);
        assert_eq!(names_in(&fx.files)?, ["deck.slidr"]);
        Ok(())
    }

    #[test]
    fn open_rejects_paths_that_escape_the_workspace() -> TestResult {
        let fx = fixture()?;
        let storage = Storage::new(fx.root.clone());
        let deck = deck(&[]);
        for evil in [
            "../evil.txt",
            "assets/../../evil.txt",
            "/evil.txt",
            "C:/evil.txt",
            "..\\evil.txt",
        ] {
            let file = fx.files.join("evil.slidr");
            write_zip(&file, &[(DECK_FILE, deck.as_bytes()), (evil, b"pwned")])?;
            // The test means something only if the archive really carries the name.
            assert!(entries_of(&file)?.iter().any(|name| name == evil), "{evil}");
            assert_eq!(
                kind(storage.open(&file)),
                Some(ErrorKind::InvalidFile),
                "{evil}"
            );
        }
        assert!(!fx.root.join("evil.txt").exists());
        assert!(!fx.root.join("workspaces").join("evil.txt").exists());
        // Nothing half-opened is left behind.
        assert!(names_in(&fx.root.join("workspaces"))?.is_empty());
        assert!(storage.recents().is_empty());
        Ok(())
    }

    #[test]
    fn open_rejects_files_that_are_not_decks() -> TestResult {
        let fx = fixture()?;
        let storage = Storage::new(fx.root.clone());
        let no_deck = fx.files.join("no-deck.slidr");
        write_zip(&no_deck, &[(META_FILE, b"{}"), ("assets/a.png", b"png")])?;
        assert_eq!(kind(storage.open(&no_deck)), Some(ErrorKind::InvalidFile));

        let not_zip = fx.files.join("text.slidr");
        fs::write(&not_zip, "just text")?;
        assert_eq!(kind(storage.open(&not_zip)), Some(ErrorKind::InvalidFile));

        let not_utf8 = fx.files.join("binary-deck.slidr");
        write_zip(&not_utf8, &[(DECK_FILE, &[0xff, 0xfe, 0x00])])?;
        assert_eq!(kind(storage.open(&not_utf8)), Some(ErrorKind::InvalidFile));

        assert_eq!(
            kind(storage.open(&fx.files.join("missing.slidr"))),
            Some(ErrorKind::NotFound)
        );
        assert!(names_in(&fx.root.join("workspaces"))?.is_empty());
        Ok(())
    }

    #[test]
    fn open_ignores_entries_the_workspace_keeps_for_itself() -> TestResult {
        let fx = fixture()?;
        let storage = Storage::new(fx.root.clone());
        let file = fx.files.join("deck.slidr");
        let deck = deck(&[]);
        write_zip(
            &file,
            &[
                (DECK_FILE, deck.as_bytes()),
                (STATE_FILE, br#"{"dirty":true}"#),
            ],
        )?;
        let opened = storage.open(&file)?;
        let state = read_state(Path::new(&opened.workspace.dir)).ok_or("no state")?;
        assert!(!state.dirty);
        assert_eq!(state.source_path, opened.workspace.source_path);
        Ok(())
    }

    /// A `.slidr` file comes from anyone. One made to fill the disk (here: more files than any
    /// deck has, in a file of a few megabytes) is refused, and nothing of it stays behind.
    #[test]
    fn open_refuses_an_archive_made_to_fill_the_disk_and_leaves_nothing_behind() -> TestResult {
        let fx = fixture()?;
        let storage = Storage::new(fx.root.clone());
        let deck = deck(&[]);
        let names: Vec<String> = (0..20_000).map(|n| format!("assets/{n}.bin")).collect();
        let mut entries: Vec<(&str, &[u8])> = vec![(DECK_FILE, deck.as_bytes())];
        entries.extend(names.iter().map(|name| (name.as_str(), &b""[..])));
        let file = fx.files.join("many.slidr");
        write_zip(&file, &entries)?;

        assert_eq!(kind(storage.open(&file)), Some(ErrorKind::InvalidFile));
        assert!(names_in(&fx.root.join("workspaces"))?.is_empty());
        assert!(storage.recents().is_empty());
        Ok(())
    }

    /// The limit is on what a file unpacks to against its own size, and a small deck may still
    /// unpack to far more than it weighs: text, and the HTML it was imported from, deflate well.
    #[test]
    fn a_deck_whose_source_deflates_a_thousandfold_still_opens() -> TestResult {
        let fx = fixture()?;
        let storage = Storage::new(fx.root.clone());
        let deck = deck(&[]);
        let html = vec![b' '; 8 * 1024 * 1024];
        let file = fx.files.join("imported.slidr");
        write_zip(
            &file,
            &[(DECK_FILE, deck.as_bytes()), ("source/import.html", &html)],
        )?;
        assert!(fs::metadata(&file)?.len() < 64 * 1024);

        let opened = storage.open(&file)?;
        let kept = PathBuf::from(&opened.workspace.dir)
            .join("source")
            .join("import.html");
        assert_eq!(fs::metadata(kept)?.len(), u64::try_from(html.len())?);
        Ok(())
    }

    #[test]
    fn unreferenced_assets_stay_in_the_workspace_but_are_not_packed() -> TestResult {
        let fx = fixture()?;
        let storage = Storage::new(fx.root.clone());
        let workspace = storage.new_workspace()?;
        let assets_dir = storage.assets_dir(&workspace.id)?;
        let kept = assets::import_bytes(&assets_dir, None, &tiny_png(1, 1))?;
        let dropped = assets::import_bytes(&assets_dir, None, &tiny_png(2, 2))?;

        let target = fx.files.join("deck.slidr");
        let deck = deck(&[(&kept.id, &kept.file), ("gone", "gone.png")]);
        let saved = storage.save(&workspace.id, &target, &deck, None)?;

        assert_eq!(saved.missing_assets, ["gone.png"]);
        let entries = entries_of(&target)?;
        assert!(entries.contains(&format!("assets/{}", kept.file)));
        assert!(!entries.contains(&format!("assets/{}", dropped.file)));
        // Undo may bring the reference back.
        assert!(assets_dir.join(&dropped.file).is_file());

        // Already-compressed media is stored, JSON is deflated.
        let mut archive = ZipArchive::new(File::open(&target)?)?;
        let png = archive
            .by_name(&format!("assets/{}", kept.file))?
            .compression();
        assert_eq!(png, zip::CompressionMethod::Stored);
        let json = archive.by_name(DECK_FILE)?.compression();
        assert_eq!(json, zip::CompressionMethod::Deflated);
        let mut packed = String::new();
        archive.by_name(DECK_FILE)?.read_to_string(&mut packed)?;
        assert_eq!(packed, deck);
        Ok(())
    }

    /// An asset entry is the webview's word, and so the agent's: a path, an address or a name
    /// no file can have costs the deck that asset, never its save. The autosave takes such a
    /// deck, so a save that refused it would leave work that can never reach a file.
    #[test]
    fn an_asset_that_names_no_file_of_the_deck_is_left_out_and_the_deck_is_saved() -> TestResult {
        let fx = fixture()?;
        let storage = Storage::new(fx.root.clone());
        let workspace = storage.new_workspace()?;
        let dir = PathBuf::from(&workspace.dir);
        let assets_dir = storage.assets_dir(&workspace.id)?;
        let kept = assets::import_bytes(&assets_dir, None, &tiny_png(1, 1))?;
        // What `../state` would name if it were followed.
        fs::write(dir.join("state"), b"not an asset")?;
        let strange = [
            "https://example.com/logo.png",
            "C:\\Users\\me\\logo.png",
            "img/logo.png",
            "../state",
            "what?.png",
            "NUL",
        ];
        let mut assets = vec![(kept.id.as_str(), kept.file.as_str())];
        assets.extend(strange.iter().map(|&name| (name, name)));
        let deck = deck(&assets);

        storage.write_deck(&workspace.id, &deck, "Deck")?;
        let target = fx.files.join("deck.slidr");
        let saved = storage.save(&workspace.id, &target, &deck, Some("Deck"))?;

        let mut left_out = saved.missing_assets.clone();
        left_out.sort();
        let mut expected = strange.map(String::from).to_vec();
        expected.sort();
        assert_eq!(left_out, expected);
        // The file has the deck as it was sent and the one asset that is a file, and no more.
        let entries = entries_of(&target)?;
        let packed: Vec<&String> = entries
            .iter()
            .filter(|name| name.starts_with("assets/"))
            .collect();
        assert_eq!(packed, [&format!("assets/{}", kept.file)]);
        assert!(!entries.iter().any(|name| name.contains("state")));
        assert_eq!(storage.open(&target)?.deck_json, deck);
        assert!(read_state(&dir).is_some_and(|state| !state.dirty));
        Ok(())
    }

    #[test]
    fn the_chat_of_a_deleted_slide_stays_out_of_the_file_and_in_the_workspace() -> TestResult {
        let fx = fixture()?;
        let storage = Storage::new(fx.root.clone());
        let workspace = storage.new_workspace()?;
        let chat = PathBuf::from(&workspace.dir).join("chat");
        fs::create_dir_all(&chat)?;
        let line = b"{\"type\":\"user\"}\n";
        for name in [
            "deck.jsonl",
            "slide-s_kept.jsonl",
            "slide-s_kept-cm1x2.jsonl",
            "slide-s_gone.jsonl",
            "slide-s_gone-cm1x2.jsonl",
        ] {
            fs::write(chat.join(name), line)?;
        }
        let index = serde_json::json!({ "version": 1, "threads": {
            "deck": { "scope": { "kind": "deck" }, "nativeSessionId": "n-1" },
            "slide-s_kept": { "scope": { "kind": "slide", "slideId": "s_kept" } },
            "slide-s_gone": { "scope": { "kind": "slide", "slideId": "s_gone" } },
            "slide-s_gone-cm1x2": { "scope": { "kind": "slide", "slideId": "s_gone" } },
        }});
        fs::write(chat.join("threads.json"), index.to_string())?;

        let deck = r#"{"schemaVersion":1,"assets":{},"slides":[{"id":"s_kept","elements":[]}]}"#;
        let target = fx.files.join("deck.slidr");
        storage.save(&workspace.id, &target, deck, None)?;

        let chats: Vec<String> = entries_of(&target)?
            .into_iter()
            .filter(|name| name.starts_with("chat/"))
            .collect();
        assert_eq!(
            chats,
            [
                "chat/deck.jsonl",
                "chat/slide-s_kept-cm1x2.jsonl",
                "chat/slide-s_kept.jsonl",
                "chat/threads.json",
            ]
        );
        let opened = storage.open(&target)?;
        let packed: serde_json::Value = serde_json::from_slice(&fs::read(
            PathBuf::from(&opened.workspace.dir)
                .join("chat")
                .join("threads.json"),
        )?)?;
        let threads: Vec<&String> = packed["threads"]
            .as_object()
            .ok_or("no threads")?
            .keys()
            .collect();
        assert_eq!(threads, ["deck", "slide-s_kept"]);
        assert_eq!(packed["threads"]["deck"]["nativeSessionId"], "n-1");

        // The workspace still has all of it: an undo may bring the slide back, and the next save
        // then takes its chat along again.
        assert_eq!(names_in(&chat)?.len(), 6);
        let restored = r#"{"schemaVersion":1,"assets":{},
            "slides":[{"id":"s_kept","elements":[]},{"id":"s_gone","elements":[]}]}"#;
        storage.save(&workspace.id, &target, restored, None)?;
        assert!(entries_of(&target)?.contains(&"chat/slide-s_gone.jsonl".to_owned()));
        Ok(())
    }

    #[test]
    fn chat_uploads_stay_beside_the_saved_file_and_follow_save_as() -> TestResult {
        let fx = fixture()?;
        let storage = Storage::new(fx.root.clone());
        let workspace = storage.new_workspace()?;
        let first = fx.files.join("first.slidr");
        let second = fx.files.join("second.slidr");
        let document = deck(&[]);
        storage.write_chat_upload(&workspace.id, "deck", "brief.pdf", b"a brief")?;
        storage.save(&workspace.id, &first, &document, None)?;

        let uploads = fx.files.join("chat_uploads");
        let first_uploads = uploads.join("first.slidr/deck");
        let second_uploads = uploads.join("second.slidr/deck");
        assert_eq!(fs::read(first_uploads.join("brief.pdf"))?, b"a brief");
        assert!(
            !entries_of(&first)?
                .iter()
                .any(|entry| entry.starts_with("chat_uploads/"))
        );

        storage.write_chat_upload(&workspace.id, "deck", "notes.txt", b"after save")?;
        assert_eq!(fs::read(first_uploads.join("notes.txt"))?, b"after save");
        storage.save(&workspace.id, &second, &document, None)?;
        assert_eq!(fs::read(second_uploads.join("brief.pdf"))?, b"a brief");
        assert_eq!(fs::read(second_uploads.join("notes.txt"))?, b"after save");

        let reopened = storage.open(&second)?;
        let restored = storage.chat_uploads_dir(&reopened.workspace.id, "deck")?;
        assert_eq!(fs::read(restored.join("brief.pdf"))?, b"a brief");
        assert_eq!(fs::read(restored.join("notes.txt"))?, b"after save");
        assert!(
            !entries_of(&second)?
                .iter()
                .any(|entry| entry.starts_with("chat_uploads/"))
        );
        Ok(())
    }

    #[test]
    fn autosave_writes_the_deck_and_marks_the_workspace_dirty_until_saved() -> TestResult {
        let fx = fixture()?;
        let storage = Storage::new(fx.root.clone());
        let workspace = storage.new_workspace()?;
        let dir = PathBuf::from(&workspace.dir);

        storage.write_deck(&workspace.id, "{\"draft\":1}", "Draft")?;
        assert_eq!(fs::read_to_string(dir.join(DECK_FILE))?, "{\"draft\":1}");
        let state = read_state(&dir).ok_or("no state")?;
        assert!(state.dirty);
        assert_eq!(state.title, "Draft");
        assert!(state.autosaved_at.is_some());
        assert_eq!(
            names_in(&dir)?,
            [".lock", ".workspace.json", "assets", "deck.json"]
        );

        let target = fx.files.join("deck.slidr");
        storage.save(&workspace.id, &target, &deck(&[]), Some("Final"))?;
        let state = read_state(&dir).ok_or("no state")?;
        assert!(!state.dirty);
        assert_eq!(state.title, "Final");
        assert_eq!(state.source_path, Some(display(&target)));
        assert!(state.saved_at.is_some());

        // Saved files go to the top of the recents list, under the deck title.
        let recents = storage.recents();
        assert_eq!(
            recents
                .first()
                .map(|r| (r.path.as_str(), r.title.as_str(), r.exists)),
            Some((display(&target).as_str(), "Final", true))
        );

        // Opening it again finds the title through recents.
        let opened = storage.open(&target)?;
        let state = read_state(Path::new(&opened.workspace.dir)).ok_or("no state")?;
        assert_eq!(state.title, "Final");
        Ok(())
    }

    #[test]
    fn recovery_lists_dirty_leftovers_and_sweeps_clean_ones() -> TestResult {
        let fx = fixture()?;
        let target = fx.files.join("deck.slidr");
        let (dirty, clean) = {
            let crashed = Storage::new(fx.root.clone());
            let dirty = crashed.new_workspace()?;
            crashed.write_deck(&dirty.id, &deck(&[]), "Unsaved work")?;
            let never_written = crashed.new_workspace()?;
            let saved = crashed.new_workspace()?;
            crashed.save(&saved.id, &target, &deck(&[]), None)?;
            let opened = crashed.open(&target)?.workspace;
            (dirty, [never_written, saved, opened])
            // Dropping `crashed` without closing anything is what a crash leaves behind.
        };

        let storage = Storage::new(fx.root.clone());
        let found = storage.list_recoverable()?;
        let summary: Vec<_> = found
            .iter()
            .map(|r| (r.id.as_str(), r.title.as_str()))
            .collect();
        assert_eq!(summary, [(dirty.id.as_str(), "Unsaved work")]);
        assert!(found.iter().all(|r| r.autosaved_at.is_some()));
        for workspace in &clean {
            assert!(!Path::new(&workspace.dir).exists(), "{}", workspace.id);
        }

        let recovered = storage.recover(&dirty.id)?;
        assert_eq!(recovered.deck_json, deck(&[]));
        assert_eq!(recovered.workspace.dir, dirty.dir);
        // Open again here: neither listed nor swept, and usable.
        assert!(storage.list_recoverable()?.is_empty());
        assert!(Path::new(&dirty.dir).is_dir());
        storage.write_deck(&dirty.id, &deck(&[]), "Unsaved work")?;
        // Recovering what is already open (a webview reload) is fine too.
        assert_eq!(storage.recover(&dirty.id)?.workspace.id, dirty.id);
        Ok(())
    }

    #[test]
    fn another_running_instance_keeps_its_workspaces() -> TestResult {
        let fx = fixture()?;
        let first = Storage::new(fx.root.clone());
        let second = Storage::new(fx.root.clone());
        let clean = first.new_workspace()?;
        let dirty = first.new_workspace()?;
        first.write_deck(&dirty.id, &deck(&[]), "Busy")?;

        assert!(second.list_recoverable()?.is_empty());
        assert!(Path::new(&clean.dir).is_dir());
        assert_eq!(
            kind(second.recover(&dirty.id)),
            Some(ErrorKind::UnknownWorkspace)
        );
        assert_eq!(
            kind(second.close(&dirty.id)),
            Some(ErrorKind::UnknownWorkspace)
        );
        assert_eq!(
            kind(second.write_deck(&dirty.id, "{}", "")),
            Some(ErrorKind::UnknownWorkspace)
        );
        assert!(Path::new(&dirty.dir).is_dir());
        Ok(())
    }

    #[test]
    fn close_deletes_the_workspace_and_can_discard_a_leftover() -> TestResult {
        let fx = fixture()?;
        let storage = Storage::new(fx.root.clone());
        let workspace = storage.new_workspace()?;
        storage.write_deck(&workspace.id, &deck(&[]), "x")?;
        storage.close(&workspace.id)?;
        assert!(!Path::new(&workspace.dir).exists());
        assert_eq!(
            kind(storage.write_deck(&workspace.id, "{}", "")),
            Some(ErrorKind::UnknownWorkspace)
        );
        storage.close(&workspace.id)?;

        let leftover = {
            let crashed = Storage::new(fx.root.clone());
            let workspace = crashed.new_workspace()?;
            crashed.write_deck(&workspace.id, &deck(&[]), "x")?;
            workspace
        };
        assert_eq!(storage.list_recoverable()?.len(), 1);
        storage.close(&leftover.id)?;
        assert!(storage.list_recoverable()?.is_empty());
        assert!(!Path::new(&leftover.dir).exists());
        Ok(())
    }

    #[test]
    fn workspace_ids_cannot_name_other_directories() -> TestResult {
        let fx = fixture()?;
        let storage = Storage::new(fx.root.clone());
        fs::create_dir_all(fx.root.join("workspaces"))?;
        fs::write(fx.root.join("recents.json"), b"[]")?;
        for id in [
            "",
            ".",
            "..",
            "../..",
            "a/b",
            "a\\b",
            "C:",
            "x".repeat(65).as_str(),
        ] {
            assert_eq!(
                kind(storage.write_deck(id, "{}", "")),
                Some(ErrorKind::UnknownWorkspace)
            );
            assert_eq!(kind(storage.recover(id)), Some(ErrorKind::UnknownWorkspace));
            assert_eq!(kind(storage.close(id)), Some(ErrorKind::UnknownWorkspace));
            assert_eq!(
                kind(storage.assets_dir(id)),
                Some(ErrorKind::UnknownWorkspace)
            );
        }
        assert!(fx.root.join("recents.json").is_file());
        Ok(())
    }

    /// IMP-07: the file a deck was imported from, and the record of the import, stay with the
    /// deck through save, "save as" and reopening, though no asset of the deck refers to them.
    #[test]
    fn the_source_of_an_import_and_its_record_travel_with_the_deck() -> TestResult {
        let fx = fixture()?;
        let storage = Storage::new(fx.root.clone());
        let workspace = storage.new_workspace()?;
        let html = "<!doctype html><section>שקף</section><script>go()</script>";
        let chosen = fx.files.join("my deck.html");
        fs::write(&chosen, html)?;
        assert_eq!(
            storage.keep_source(&workspace.id, &chosen)?,
            u64::try_from(html.len())?
        );
        assert_eq!(storage.import_record(&workspace.id)?, None);
        let record = r#"{"version":1,"file":"my deck.html","records":{"s_1":{}}}"#;
        storage.write_import_record(&workspace.id, record)?;

        // A deck with no assets at all: the save's clean-up has nothing to keep them by.
        let first = fx.files.join("first.slidr");
        storage.save(&workspace.id, &first, &deck(&[]), None)?;
        // "Save as" packs the same workspace into another file, after the record went on.
        let later = r#"{"version":1,"file":"my deck.html","records":{"s_1":{},"s_2":{}}}"#;
        storage.write_import_record(&workspace.id, later)?;
        let second = fx.files.join("second.slidr");
        storage.save(&workspace.id, &second, &deck(&[]), None)?;

        for (file, record) in [(&first, record), (&second, later)] {
            let entries = entries_of(file)?;
            assert!(
                entries.contains(&"source/import.html".to_owned()),
                "{entries:?}"
            );
            assert!(
                entries.contains(&"source/import.json".to_owned()),
                "{entries:?}"
            );
            let opened = storage.open(file)?.workspace;
            assert_eq!(storage.import_record(&opened.id)?.as_deref(), Some(record));
            // The copy that an import is continued from is the file as it was chosen.
            let out = fx.files.join("out").join("again.html");
            storage.copy_source(&opened.id, &out)?;
            assert_eq!(fs::read_to_string(&out)?, html);
        }

        // The user takes the source out: the file saved after that goes without it, and keeps
        // the record of the import.
        assert!(storage.remove_source(&workspace.id)?);
        let third = fx.files.join("third.slidr");
        storage.save(&workspace.id, &third, &deck(&[]), None)?;
        let entries = entries_of(&third)?;
        assert!(
            !entries.contains(&"source/import.html".to_owned()),
            "{entries:?}"
        );
        assert!(
            entries.contains(&"source/import.json".to_owned()),
            "{entries:?}"
        );
        assert!(!storage.remove_source(&workspace.id)?);
        assert_eq!(
            kind(storage.remove_source("nope")),
            Some(ErrorKind::UnknownWorkspace)
        );

        // A deck that was not imported has neither, and says so.
        let plain = storage.new_workspace()?;
        assert_eq!(storage.import_record(&plain.id)?, None);
        assert_eq!(
            kind(storage.copy_source(&plain.id, &fx.files.join("none.html"))),
            Some(ErrorKind::NotFound)
        );
        // Only a workspace open here is read or written.
        assert_eq!(
            kind(storage.keep_source("nope", &chosen)),
            Some(ErrorKind::UnknownWorkspace)
        );
        assert_eq!(
            kind(storage.write_import_record("../x", "{}")),
            Some(ErrorKind::UnknownWorkspace)
        );
        Ok(())
    }

    /// A crash leaves the workspace as it is: what is recovered has its source and its record.
    #[test]
    fn a_recovered_workspace_has_its_source_and_its_record() -> TestResult {
        let fx = fixture()?;
        let chosen = fx.files.join("deck.html");
        fs::write(&chosen, "<section>1</section>")?;
        let crashed_id = {
            let crashed = Storage::new(fx.root.clone());
            let workspace = crashed.new_workspace()?;
            crashed.keep_source(&workspace.id, &chosen)?;
            crashed.write_import_record(&workspace.id, "{\"version\":1}")?;
            crashed.write_deck(&workspace.id, &deck(&[]), "Importing")?;
            workspace.id
        };
        let storage = Storage::new(fx.root.clone());
        assert_eq!(storage.list_recoverable()?.len(), 1);
        storage.recover(&crashed_id)?;
        assert_eq!(
            storage.import_record(&crashed_id)?.as_deref(),
            Some("{\"version\":1}")
        );
        let out = fx.files.join("again.html");
        storage.copy_source(&crashed_id, &out)?;
        assert_eq!(fs::read_to_string(&out)?, "<section>1</section>");
        Ok(())
    }
}
