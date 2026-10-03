//! Crash-safe file replacement: write a sibling temp file, sync it, rename it over the target.

use std::{
    fs::{self, File},
    io::{self, Write},
    path::{Path, PathBuf},
};

const TEMP_PREFIX: &str = ".slidr-";
const TEMP_SUFFIX: &str = ".tmp";

/// Whether `name` is a temp file of this module (a leftover of a crash mid-write).
pub(crate) fn is_temp_name(name: &str) -> bool {
    name.starts_with(TEMP_PREFIX) && name.ends_with(TEMP_SUFFIX)
}

/// A temp file that deletes itself on drop unless [`TempFile::persist`] moved it into place.
pub(crate) struct TempFile {
    path: PathBuf,
    /// `None` once the file was closed.
    file: Option<File>,
    persisted: bool,
}

impl TempFile {
    /// Creates a uniquely named temp file in `dir`. Being in the target's directory keeps the
    /// final rename on one volume, which is what makes it atomic.
    pub(crate) fn new_in(dir: &Path) -> io::Result<Self> {
        let name = format!(
            "{TEMP_PREFIX}{}{TEMP_SUFFIX}",
            uuid::Uuid::new_v4().simple()
        );
        let path = dir.join(name);
        let file = File::options().write(true).create_new(true).open(&path)?;
        Ok(Self {
            path,
            file: Some(file),
            persisted: false,
        })
    }

    /// The open file. `&File` is `Write + Seek`.
    pub(crate) fn file(&self) -> io::Result<&File> {
        self.file
            .as_ref()
            .ok_or_else(|| io::Error::other("temp file is already closed"))
    }

    /// Syncs the content to disk and renames the file over `target`, replacing what was there.
    /// On failure the temp file is removed and `target` is untouched.
    pub(crate) fn persist(mut self, target: &Path) -> io::Result<()> {
        if let Some(file) = self.file.take() {
            file.sync_all()?;
        }
        fs::rename(&self.path, target)?;
        self.persisted = true;
        Ok(())
    }
}

impl Drop for TempFile {
    fn drop(&mut self) {
        if !self.persisted {
            // Close before removing: an open handle can keep the name alive on Windows.
            self.file = None;
            let _ = fs::remove_file(&self.path);
        }
    }
}

/// Replaces the content of `target` atomically: a reader sees the old bytes or the new ones,
/// never a half-written file.
pub(crate) fn write(target: &Path, bytes: &[u8]) -> io::Result<()> {
    let dir = target
        .parent()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "target has no parent"))?;
    let temp = TempFile::new_in(dir)?;
    temp.file()?.write_all(bytes)?;
    temp.persist(target)
}

#[cfg(test)]
mod tests {
    use super::*;

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
    fn write_replaces_the_target_and_leaves_no_temp_file() -> TestResult {
        let dir = tempfile::tempdir()?;
        let target = dir.path().join("deck.json");
        write(&target, b"one")?;
        write(&target, b"two")?;
        assert_eq!(fs::read(&target)?, b"two");
        assert_eq!(names(dir.path())?, ["deck.json"]);
        Ok(())
    }

    #[test]
    fn a_dropped_temp_file_is_removed() -> TestResult {
        let dir = tempfile::tempdir()?;
        {
            let temp = TempFile::new_in(dir.path())?;
            temp.file()?.write_all(b"partial")?;
            assert_eq!(names(dir.path())?.len(), 1);
        }
        assert!(names(dir.path())?.is_empty());
        Ok(())
    }

    #[test]
    fn a_failed_rename_removes_the_temp_file_and_keeps_the_target() -> TestResult {
        let dir = tempfile::tempdir()?;
        // A directory cannot be replaced by a file.
        let target = dir.path().join("occupied");
        fs::create_dir(&target)?;
        fs::write(target.join("keep.txt"), b"keep")?;
        assert!(write(&target, b"new").is_err());
        assert_eq!(names(dir.path())?, ["occupied"]);
        assert_eq!(fs::read(target.join("keep.txt"))?, b"keep");
        Ok(())
    }
}
