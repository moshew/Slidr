//! The app's settings (WG3-T08, ADR-051): `<app_data>/settings.json`, kept across runs.
//!
//! The file is one JSON object whose members are sections, each owned by one area of the app:
//!
//! ```json
//! { "images": { "defaultProvider": "openai-api" }, "stock": { "source": "pexels" } }
//! ```
//!
//! This module stores sections and does not read them: an area defines the shape of its own
//! section, on whichever side uses it. A new area adds a section without a change here. Rust
//! code reads its section typed, with [`Settings::read`]; the webview reads and writes whole
//! sections over IPC ([`ipc`]).
//!
//! Keys do not belong here (SEC-04): they are in the credential store ([`crate::secrets`]), and
//! [`ipc::settings_write`] turns back a value that holds one.

pub mod ipc;

use std::{
    fs,
    io::Write,
    path::PathBuf,
    sync::{Mutex, MutexGuard, PoisonError},
};

use serde::de::DeserializeOwned;
use serde_json::{Map, Value};

use crate::{
    error::{AppError, Result},
    storage::TempFile,
};

/// Longest section name, in bytes.
const MAX_NAME: usize = 40;
/// Largest section, as JSON text. Settings are choices, not content.
const MAX_SECTION: usize = 64 * 1024;

/// The settings file and what is in it.
pub struct Settings {
    file: PathBuf,
    sections: Mutex<Map<String, Value>>,
}

impl Settings {
    /// The settings in `file`. No file, or one that is not a JSON object, is "nothing chosen
    /// yet": the defaults of every area stand, and the next write replaces the file.
    pub fn open(file: PathBuf) -> Self {
        let sections = fs::read(&file)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<Map<String, Value>>(&bytes).ok())
            .unwrap_or_default();
        Self {
            file,
            sections: Mutex::new(sections),
        }
    }

    /// Every section, as stored.
    pub fn all(&self) -> Map<String, Value> {
        lock(&self.sections).clone()
    }

    /// One section, typed. A section that is absent, or does not have the shape `T` expects,
    /// reads as `T`'s default: a setting written by a newer or older version must not stop the
    /// app.
    pub fn read<T: DeserializeOwned + Default>(&self, section: &str) -> T {
        lock(&self.sections)
            .get(section)
            .cloned()
            .and_then(|value| serde_json::from_value(value).ok())
            .unwrap_or_default()
    }

    /// Replaces one section and writes the file, atomically. `null` removes the section.
    pub fn write(&self, section: &str, value: Value) -> Result<()> {
        check_name(section)?;
        let size = serde_json::to_string(&value)
            .map_err(AppError::internal)?
            .len();
        if size > MAX_SECTION {
            return Err(AppError::invalid_input(format!(
                "the settings section {section} is larger than {MAX_SECTION} bytes"
            )));
        }
        // Held across the write, so two writers cannot leave the file behind the memory.
        let mut sections = lock(&self.sections);
        let mut next = sections.clone();
        if value.is_null() {
            next.remove(section);
        } else {
            next.insert(section.to_owned(), value);
        }
        self.save(&next)?;
        *sections = next;
        Ok(())
    }

    fn save(&self, sections: &Map<String, Value>) -> Result<()> {
        let saving = |e: &std::io::Error| AppError::io("save the settings", e);
        let json = serde_json::to_vec_pretty(sections).map_err(AppError::internal)?;
        let dir = self
            .file
            .parent()
            .ok_or_else(|| AppError::internal("the settings file has no folder"))?;
        fs::create_dir_all(dir).map_err(|e| saving(&e))?;
        let temp = TempFile::new_in(dir).map_err(|e| saving(&e))?;
        temp.file()
            .and_then(|mut file| file.write_all(&json))
            .map_err(|e| saving(&e))?;
        temp.persist(&self.file).map_err(|e| saving(&e))
    }
}

/// A section name is a plain token: lowercase letters, digits and `-`.
fn check_name(section: &str) -> Result<()> {
    let plain = !section.is_empty()
        && section.len() <= MAX_NAME
        && section
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-');
    if plain {
        Ok(())
    } else {
        Err(AppError::invalid_input(format!(
            "invalid settings section {section:?}: expected lowercase letters, digits and '-'"
        )))
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

#[cfg(test)]
mod tests {
    use serde::Deserialize;
    use serde_json::json;

    use super::*;
    use crate::error::ErrorKind;

    type TestResult = std::result::Result<(), Box<dyn std::error::Error>>;

    #[derive(Debug, Default, PartialEq, Deserialize)]
    #[serde(rename_all = "camelCase", default)]
    struct Images {
        default_provider: Option<String>,
    }

    #[test]
    fn a_section_is_kept_across_runs() -> TestResult {
        let root = tempfile::tempdir()?;
        let file = root.path().join("data").join("settings.json");
        let first = Settings::open(file.clone());
        assert!(first.all().is_empty());
        assert_eq!(first.read::<Images>("images"), Images::default());

        first.write("images", json!({ "defaultProvider": "mock" }))?;
        first.write("stock", json!({ "source": "pexels" }))?;
        assert_eq!(
            first.read::<Images>("images").default_provider.as_deref(),
            Some("mock")
        );

        let second = Settings::open(file.clone());
        assert_eq!(
            Value::Object(second.all()),
            json!({ "images": { "defaultProvider": "mock" }, "stock": { "source": "pexels" } })
        );
        // Replacing one section leaves the other; null removes.
        second.write("images", json!({ "defaultProvider": "other" }))?;
        second.write("stock", Value::Null)?;
        let third = Settings::open(file.clone());
        assert_eq!(
            Value::Object(third.all()),
            json!({ "images": { "defaultProvider": "other" } })
        );
        // Only the settings file is left in the folder: no temp file.
        let names: Vec<_> = fs::read_dir(file.parent().ok_or("no folder")?)?
            .flatten()
            .map(|entry| entry.file_name())
            .collect();
        assert_eq!(names, ["settings.json"]);
        Ok(())
    }

    #[test]
    fn a_broken_file_or_section_reads_as_the_defaults() -> TestResult {
        let root = tempfile::tempdir()?;
        let file = root.path().join("settings.json");
        fs::write(&file, b"{ not json")?;
        let settings = Settings::open(file.clone());
        assert!(settings.all().is_empty());

        fs::write(
            &file,
            br#"{ "images": ["not", "an", "object"], "kept": 1 }"#,
        )?;
        let settings = Settings::open(file);
        assert_eq!(settings.read::<Images>("images"), Images::default());
        // A section this version does not understand is kept as it is.
        settings.write("images", json!({ "defaultProvider": "mock" }))?;
        assert_eq!(settings.all().get("kept"), Some(&json!(1)));
        Ok(())
    }

    #[test]
    fn a_bad_name_or_an_oversized_section_is_rejected() -> TestResult {
        let root = tempfile::tempdir()?;
        let settings = Settings::open(root.path().join("settings.json"));
        for name in ["", "Images", "a b", "../x", &"x".repeat(MAX_NAME + 1)] {
            let error = settings.write(name, json!({})).err();
            assert_eq!(
                error.map(|e| e.kind),
                Some(ErrorKind::InvalidInput),
                "{name}"
            );
        }
        let big = json!({ "text": "x".repeat(MAX_SECTION) });
        let error = settings.write("images", big).err();
        assert_eq!(error.map(|e| e.kind), Some(ErrorKind::InvalidInput));
        assert!(settings.all().is_empty());
        assert!(!root.path().join("settings.json").exists());
        Ok(())
    }
}
