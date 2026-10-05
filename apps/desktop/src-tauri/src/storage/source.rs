//! `source/` in a workspace (SPEC 5.8, IMP-07): the file a deck was imported from, as the user
//! chose it, and the record the app keeps of that import. Open and save carry the folder through
//! as it is ([`super::archive`]), so both travel inside the `.slidr` file, whatever the deck's
//! assets are.
//!
//! The file is a stranger's HTML, and here it is bytes: nothing reads it as a page but the
//! isolated import window, which is handed a copy over IPC. The record is the webview's JSON and
//! is opaque here, like `deck.json`.

use std::{
    fs::{self, File},
    io,
    path::{Path, PathBuf},
};

use super::atomic::{self, TempFile};
use crate::error::{AppError, Result};

/// The folder inside a workspace.
pub(crate) const SOURCE_DIR: &str = "source";
/// The imported file, under one name whatever it was called (SPEC 5.8).
const SOURCE_FILE: &str = "import.html";
/// The import's record: which slide came from where, the plan, what was refused.
const RECORD_FILE: &str = "import.json";
/// A record is a few hundred bytes for a slide; this is room for thousands of them.
const MAX_RECORD_BYTES: usize = 8 * 1024 * 1024;

/// Where a workspace keeps the file it was imported from.
pub(crate) fn file(workspace: &Path) -> PathBuf {
    workspace.join(SOURCE_DIR).join(SOURCE_FILE)
}

/// Copies `from` over `to` so that a reader of `to` sees the old file or the whole new one.
fn replace(from: &Path, to: &Path) -> io::Result<u64> {
    let dir = to
        .parent()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "target has no parent"))?;
    fs::create_dir_all(dir)?;
    let mut source = File::open(from)?;
    let temp = TempFile::new_in(dir)?;
    let bytes = io::copy(&mut source, &mut temp.file()?)?;
    temp.persist(to)?;
    Ok(bytes)
}

/// Keeps a copy of the file at `from` as the workspace's source, in place of any it had.
/// Returns its size.
pub(crate) fn keep(workspace: &Path, from: &Path) -> Result<u64> {
    replace(from, &file(workspace)).map_err(|e| AppError::path(from, &e))
}

/// Copies the kept source to `to`: where an import session reads it, or a path the user chose.
/// `not_found` when the deck keeps none.
pub(crate) fn copy_to(workspace: &Path, to: &Path) -> Result<u64> {
    let kept = file(workspace);
    if !kept.is_file() {
        return Err(AppError::new(
            crate::error::ErrorKind::NotFound,
            "the deck keeps no source file of an import",
        ));
    }
    replace(&kept, to).map_err(|e| AppError::path(to, &e))
}

/// Takes the kept source out of the workspace, so the next save packs a file without it: the
/// user's way to pass a deck on without the file it came from. The record stays. `false` when
/// there was none to remove.
pub(crate) fn remove(workspace: &Path) -> Result<bool> {
    match fs::remove_file(file(workspace)) {
        Ok(()) => Ok(true),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(e) => Err(AppError::io("remove the source file", &e)),
    }
}

/// The import's record, or `None` when the deck has none.
pub(crate) fn read_record(workspace: &Path) -> Result<Option<String>> {
    match fs::read_to_string(workspace.join(SOURCE_DIR).join(RECORD_FILE)) {
        Ok(text) => Ok(Some(text)),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(None),
        // Not text: a file something else wrote there. The deck opens without a record.
        Err(e) if e.kind() == io::ErrorKind::InvalidData => Ok(None),
        Err(e) => Err(AppError::io("read the import record", &e)),
    }
}

/// Replaces the import's record, atomically.
pub(crate) fn write_record(workspace: &Path, text: &str) -> Result<()> {
    if text.len() > MAX_RECORD_BYTES {
        return Err(AppError::invalid_input(format!(
            "the import record is {} bytes; the most kept is {MAX_RECORD_BYTES}",
            text.len()
        )));
    }
    let dir = workspace.join(SOURCE_DIR);
    fs::create_dir_all(&dir).map_err(|e| AppError::io("create the source folder", &e))?;
    atomic::write(&dir.join(RECORD_FILE), text.as_bytes())
        .map_err(|e| AppError::io("write the import record", &e))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::ErrorKind;

    type TestResult = std::result::Result<(), Box<dyn std::error::Error>>;

    fn names(dir: &Path) -> io::Result<Vec<String>> {
        let mut names = Vec::new();
        for entry in fs::read_dir(dir)? {
            names.push(entry?.file_name().to_string_lossy().into_owned());
        }
        names.sort();
        Ok(names)
    }

    #[test]
    fn the_source_is_kept_byte_for_byte_under_one_name() -> TestResult {
        let dir = tempfile::tempdir()?;
        let workspace = dir.path().join("w");
        fs::create_dir_all(&workspace)?;
        // Not UTF-8 on purpose: the file is bytes, in whatever encoding it declares.
        let first: &[u8] = b"<meta charset=\"windows-1255\"><p>\xf9\xec\xe5\xed</p>";
        let chosen = dir.path().join("my deck (1).html");
        fs::write(&chosen, first)?;

        assert_eq!(keep(&workspace, &chosen)?, u64::try_from(first.len())?);
        assert_eq!(fs::read(file(&workspace))?, first);

        // Another import into the same workspace replaces it, and leaves nothing beside it.
        fs::write(&chosen, b"<p>second</p>")?;
        keep(&workspace, &chosen)?;
        assert_eq!(fs::read(file(&workspace))?, b"<p>second</p>");
        assert_eq!(names(&workspace.join(SOURCE_DIR))?, ["import.html"]);

        let missing = keep(&workspace, &dir.path().join("gone.html"));
        assert_eq!(missing.err().map(|e| e.kind), Some(ErrorKind::NotFound));
        assert_eq!(fs::read(file(&workspace))?, b"<p>second</p>");
        Ok(())
    }

    #[test]
    fn the_kept_source_is_copied_out_and_a_deck_without_one_says_so() -> TestResult {
        let dir = tempfile::tempdir()?;
        let workspace = dir.path().join("w");
        fs::create_dir_all(&workspace)?;
        let out = dir
            .path()
            .join("agent")
            .join("attachments")
            .join("deck.html");

        let none = copy_to(&workspace, &out);
        assert_eq!(none.err().map(|e| e.kind), Some(ErrorKind::NotFound));
        assert!(!out.exists());

        let chosen = dir.path().join("deck.html");
        fs::write(&chosen, "<p dir=\"rtl\">שלום</p>")?;
        keep(&workspace, &chosen)?;
        // The folder is made on the way: a session folder that a restart found empty.
        copy_to(&workspace, &out)?;
        assert_eq!(fs::read_to_string(&out)?, "<p dir=\"rtl\">שלום</p>");

        // Taken out, it is gone from the workspace, and with it from whatever is saved next;
        // the record of the import stays.
        write_record(&workspace, "{\"version\":1}")?;
        assert!(remove(&workspace)?);
        assert!(!remove(&workspace)?, "nothing to remove the second time");
        assert_eq!(names(&workspace.join(SOURCE_DIR))?, ["import.json"]);
        let gone = copy_to(&workspace, &out);
        assert_eq!(gone.err().map(|e| e.kind), Some(ErrorKind::NotFound));
        Ok(())
    }

    #[test]
    fn the_record_is_replaced_whole_and_bounded() -> TestResult {
        let dir = tempfile::tempdir()?;
        let workspace = dir.path();
        assert_eq!(read_record(workspace)?, None);

        write_record(workspace, "{\"version\":1,\"file\":\"מצגת.html\"}")?;
        write_record(workspace, "{\"version\":1,\"file\":\"deck.html\"}")?;
        assert_eq!(
            read_record(workspace)?.as_deref(),
            Some("{\"version\":1,\"file\":\"deck.html\"}")
        );
        assert_eq!(names(&workspace.join(SOURCE_DIR))?, ["import.json"]);

        let huge = "x".repeat(MAX_RECORD_BYTES + 1);
        assert_eq!(
            write_record(workspace, &huge).err().map(|e| e.kind),
            Some(ErrorKind::InvalidInput)
        );
        // A file that is not text is no record, and no failure.
        fs::write(workspace.join(SOURCE_DIR).join(RECORD_FILE), [0xff, 0xfe])?;
        assert_eq!(read_record(workspace)?, None);
        Ok(())
    }
}
