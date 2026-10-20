//! The recent files list (DOC-05): `recents.json` in the app data directory.

use std::{
    fs,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};

use super::{atomic, time::now_iso};
use crate::error::{AppError, Result};

/// How many files the list keeps.
pub(crate) const CAPACITY: usize = 20;

const FILE: &str = "recents.json";

/// One stored entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Entry {
    path: String,
    title: String,
    opened_at: String,
}

/// A recent file as the webview sees it.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentFile {
    /// Absolute path of the `.slidr` file.
    pub path: String,
    /// Deck title when the file was last saved here, otherwise the file name.
    pub title: String,
    /// When the file was last opened or saved (ISO 8601, UTC).
    pub opened_at: String,
    /// Whether the file is there now; checked on every call.
    pub exists: bool,
}

fn file_of(root: &Path) -> PathBuf {
    root.join(FILE)
}

/// The stored list, most recent first. A missing or damaged file is an empty list.
fn load(root: &Path) -> Vec<Entry> {
    fs::read(file_of(root))
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

fn store(root: &Path, entries: &[Entry]) -> Result<()> {
    let bytes = serde_json::to_vec_pretty(entries).map_err(AppError::internal)?;
    fs::create_dir_all(root).map_err(|e| AppError::io("create the app data directory", &e))?;
    atomic::write(&file_of(root), &bytes).map_err(|e| AppError::io("write recents.json", &e))
}

/// File paths are case-insensitive on Windows.
fn same_path(a: &str, b: &str) -> bool {
    if cfg!(windows) {
        a.eq_ignore_ascii_case(b)
    } else {
        a == b
    }
}

/// The list with `exists` filled in, most recent first.
pub(crate) fn list(root: &Path) -> Vec<RecentFile> {
    load(root)
        .into_iter()
        .map(|entry| RecentFile {
            exists: Path::new(&entry.path).is_file(),
            path: entry.path,
            title: entry.title,
            opened_at: entry.opened_at,
        })
        .collect()
}

/// The title stored for `path`, if the file is on the list.
pub(crate) fn title_of(root: &Path, path: &str) -> Option<String> {
    load(root)
        .into_iter()
        .find(|entry| same_path(&entry.path, path))
        .map(|entry| entry.title)
}

/// Moves `path` to the top of the list (adding it if needed) and trims the list to capacity.
pub(crate) fn add(root: &Path, path: &str, title: &str) -> Result<()> {
    let mut entries = load(root);
    entries.retain(|entry| !same_path(&entry.path, path));
    entries.insert(
        0,
        Entry {
            path: path.to_owned(),
            title: title.to_owned(),
            opened_at: now_iso(),
        },
    );
    entries.truncate(CAPACITY);
    store(root, &entries)
}

/// Removes `path` from the list. Removing a path that is not there is not an error.
pub(crate) fn remove(root: &Path, path: &str) -> Result<()> {
    let mut entries = load(root);
    let before = entries.len();
    entries.retain(|entry| !same_path(&entry.path, path));
    if entries.len() == before {
        Ok(())
    } else {
        store(root, &entries)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    type TestResult = std::result::Result<(), Box<dyn std::error::Error>>;

    fn paths(root: &Path) -> Vec<String> {
        list(root).into_iter().map(|recent| recent.path).collect()
    }

    #[test]
    fn most_recent_first_without_duplicates() -> TestResult {
        let root = tempfile::tempdir()?;
        add(root.path(), "/a.slidr", "A")?;
        add(root.path(), "/b.slidr", "B")?;
        add(root.path(), "/a.slidr", "A2")?;
        assert_eq!(paths(root.path()), ["/a.slidr", "/b.slidr"]);
        assert_eq!(title_of(root.path(), "/a.slidr").as_deref(), Some("A2"));
        Ok(())
    }

    #[test]
    fn keeps_only_the_newest_entries() -> TestResult {
        let root = tempfile::tempdir()?;
        for index in 0..CAPACITY + 5 {
            add(root.path(), &format!("/{index}.slidr"), "deck")?;
        }
        let paths = paths(root.path());
        assert_eq!(paths.len(), CAPACITY);
        assert_eq!(paths.first().map(String::as_str), Some("/24.slidr"));
        assert_eq!(paths.last().map(String::as_str), Some("/5.slidr"));
        Ok(())
    }

    #[test]
    fn remove_drops_one_entry() -> TestResult {
        let root = tempfile::tempdir()?;
        add(root.path(), "/a.slidr", "A")?;
        add(root.path(), "/b.slidr", "B")?;
        remove(root.path(), "/a.slidr")?;
        remove(root.path(), "/not-there.slidr")?;
        assert_eq!(paths(root.path()), ["/b.slidr"]);
        Ok(())
    }

    #[test]
    fn exists_is_checked_on_every_call() -> TestResult {
        let root = tempfile::tempdir()?;
        let file = root.path().join("deck.slidr");
        let path = file.to_string_lossy().into_owned();
        fs::write(&file, b"zip")?;
        add(root.path(), &path, "Deck")?;
        assert!(list(root.path()).iter().all(|recent| recent.exists));
        fs::remove_file(&file)?;
        assert!(list(root.path()).iter().all(|recent| !recent.exists));
        Ok(())
    }

    #[test]
    fn a_damaged_file_reads_as_empty() -> TestResult {
        let root = tempfile::tempdir()?;
        fs::write(root.path().join(FILE), b"{not json")?;
        assert!(list(root.path()).is_empty());
        add(root.path(), "/a.slidr", "A")?;
        assert_eq!(paths(root.path()), ["/a.slidr"]);
        Ok(())
    }
}
