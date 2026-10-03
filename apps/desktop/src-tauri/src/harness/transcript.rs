//! The chat files of a deck (AGT-05): `chat/` in the deck's workspace, which open and save carry
//! through as they are (SPEC 5.8), so a conversation travels inside the `.slidr` file.
//!
//! The webview owns what is in them: normalized transcripts, one JSON entry per line, and the
//! index that maps each thread to the harness session that can resume it. Like `deck.json`, the
//! text is opaque here; this module only decides where a file may be and writes it safely.

use std::{
    fs::{self, File},
    io::{self, Write},
    path::{Path, PathBuf},
};

use super::{AgentError, AgentErrorKind, Result};
use crate::storage::TempFile;

/// The folder inside a workspace.
const CHAT_DIR: &str = "chat";
/// Longest file name, in bytes.
const MAX_NAME: usize = 80;

/// `<workspace>/chat/<name>` for a plain name: letters, digits, `-` and `_`, then `.jsonl` or
/// `.json`. The name comes from the webview, so nothing else gets to be a path.
fn chat_file(workspace: &Path, name: &str) -> Result<PathBuf> {
    let stem = name
        .strip_suffix(".jsonl")
        .or_else(|| name.strip_suffix(".json"));
    let plain = |stem: &str| {
        !stem.is_empty()
            && stem
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    };
    if name.len() <= MAX_NAME && stem.is_some_and(plain) {
        Ok(workspace.join(CHAT_DIR).join(name))
    } else {
        Err(AgentError::invalid_input(format!(
            "invalid chat file name {name:?}: expected letters, digits, '-' and '_', ending in \
             .jsonl or .json"
        )))
    }
}

fn io_error(what: &str, error: &io::Error) -> AgentError {
    AgentError::new(AgentErrorKind::Io, format!("could not {what}: {error}"))
}

/// The text of a chat file, or `None` when the deck has no such file.
pub fn read(workspace: &Path, name: &str) -> Result<Option<String>> {
    match fs::read_to_string(chat_file(workspace, name)?) {
        Ok(text) => Ok(Some(text)),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(io_error("read the chat file", &e)),
    }
}

/// Writes a chat file. `append` adds `text` to the end, for a transcript that grows by a line
/// per entry; otherwise the file is replaced atomically, for the index.
pub fn write(workspace: &Path, name: &str, text: &str, append: bool) -> Result<()> {
    let path = chat_file(workspace, name)?;
    let dir = workspace.join(CHAT_DIR);
    fs::create_dir_all(&dir).map_err(|e| io_error("create the chat folder", &e))?;
    let written = if append {
        File::options()
            .append(true)
            .create(true)
            .open(&path)
            .and_then(|mut file| file.write_all(text.as_bytes()))
    } else {
        TempFile::new_in(&dir).and_then(|temp| {
            temp.file()?.write_all(text.as_bytes())?;
            temp.persist(&path)
        })
    };
    written.map_err(|e| io_error("write the chat file", &e))
}

#[cfg(test)]
mod tests {
    use super::*;

    type TestResult = std::result::Result<(), Box<dyn std::error::Error>>;

    #[test]
    fn a_transcript_grows_by_lines_and_the_index_is_replaced() -> TestResult {
        let workspace = tempfile::tempdir()?;
        let dir = workspace.path();
        assert_eq!(read(dir, "deck.jsonl")?, None);

        write(
            dir,
            "deck.jsonl",
            "{\"type\":\"user\",\"text\":\"שלום\"}\n",
            true,
        )?;
        write(dir, "deck.jsonl", "{\"type\":\"assistant\"}\n", true)?;
        assert_eq!(
            read(dir, "deck.jsonl")?.as_deref(),
            Some("{\"type\":\"user\",\"text\":\"שלום\"}\n{\"type\":\"assistant\"}\n")
        );

        write(dir, "threads.json", "{\"threads\":{}}", false)?;
        write(dir, "threads.json", "{\"threads\":{\"deck\":{}}}", false)?;
        assert_eq!(
            read(dir, "threads.json")?.as_deref(),
            Some("{\"threads\":{\"deck\":{}}}")
        );
        // Only the two files: a replaced file leaves no temp file behind.
        let mut names: Vec<_> = fs::read_dir(dir.join(CHAT_DIR))?
            .filter_map(|entry| entry.ok()?.file_name().into_string().ok())
            .collect();
        names.sort();
        assert_eq!(names, ["deck.jsonl", "threads.json"]);
        Ok(())
    }

    #[test]
    fn only_plain_names_become_files() -> TestResult {
        let workspace = tempfile::tempdir()?;
        let dir = workspace.path();
        for bad in [
            "",
            ".jsonl",
            "deck",
            "deck.txt",
            "../deck.jsonl",
            "a/b.jsonl",
            "a\\b.json",
            "C:deck.json",
            "deck.jsonl.exe",
            "שיחה.jsonl",
            &format!("{}.jsonl", "x".repeat(MAX_NAME)),
        ] {
            assert_eq!(
                write(dir, bad, "x", true).err().map(|e| e.kind),
                Some(AgentErrorKind::InvalidInput),
                "{bad:?}"
            );
            assert!(read(dir, bad).is_err(), "{bad:?}");
        }
        assert!(
            !dir.join(CHAT_DIR).exists(),
            "nothing was created for a bad name"
        );
        assert_eq!(
            chat_file(dir, "s_k3x9-a_2.jsonl")?,
            dir.join("chat").join("s_k3x9-a_2.jsonl")
        );
        Ok(())
    }
}
