//! The diagnostics log (AGT-08): what the harnesses said and what the sessions did, as lines of
//! JSON in a file of the app's own, to look at from the settings screen when an agent misbehaves.
//!
//! ```text
//! <app_data>/agent/diagnostics.jsonl      the log; a line per entry, the newest last
//! <app_data>/agent/diagnostics.1.jsonl    the log before it was last rolled over
//! ```
//!
//! An entry is `{ "at", "session", "kind", "data" }`:
//!
//! | kind      | data                                                                        |
//! |-----------|-----------------------------------------------------------------------------|
//! | `start`   | the harness, the thread, and how the session was started                    |
//! | `send`    | the size of a turn that was sent (its text is in the deck's own transcript) |
//! | `raw`     | a line of the harness's own output, as it wrote it                          |
//! | `event`   | a normalized event: a tool call and its result, a turn's end, an error      |
//! | `close`   | why the session was closed: asked for, or left idle                         |
//!
//! Text that streams (the reply, a token at a time) is not logged: the reply is in the transcript,
//! and it would be most of the file. Long values are cut. The log stays on this computer; the
//! harness's lines can name folders of the user, so it is the user who decides to show it.

use std::{
    fs::{self, File},
    io::{self, Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
    sync::{Mutex, MutexGuard, PoisonError},
};

use serde::Serialize;
use serde_json::{Value, json};

use crate::storage::now_iso;

const CURRENT: &str = "diagnostics.jsonl";
const OLDER: &str = "diagnostics.1.jsonl";
/// The log is rolled over once it is this long, so it holds between one and two of these.
const MAX_BYTES: u64 = 1024 * 1024;
/// Longest string kept of a value, in characters: a slide's HTML and a picture run to pages.
const MAX_TEXT: usize = 2000;
/// What `tail` returns when it is not told how much.
pub const DEFAULT_TAIL_BYTES: usize = 256 * 1024;
/// The most `tail` returns, whatever it is asked for.
const MAX_TAIL_BYTES: usize = 2 * 1024 * 1024;

/// The log file and what is needed to append to it. Shared by every session.
pub struct Diagnostics {
    dir: PathBuf,
    /// The open file and its length, once something was written.
    file: Mutex<Option<(File, u64)>>,
}

/// The log as the settings screen shows it.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsView {
    /// Where the log is kept, for the user who wants the whole file.
    pub path: String,
    /// The end of the log: whole lines, the newest last.
    pub text: String,
    /// How long the log is on disk, both files together.
    pub bytes: u64,
}

impl Diagnostics {
    /// A log kept in `dir`. Nothing is created until the first entry.
    pub fn new(dir: PathBuf) -> Self {
        Self {
            dir,
            file: Mutex::new(None),
        }
    }

    fn current(&self) -> PathBuf {
        self.dir.join(CURRENT)
    }

    fn older(&self) -> PathBuf {
        self.dir.join(OLDER)
    }

    fn state(&self) -> MutexGuard<'_, Option<(File, u64)>> {
        self.file.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Appends an entry. A log that cannot be written is not worth failing a session over, so
    /// this never fails: the entry is dropped.
    pub fn record(&self, session: &str, kind: &str, data: Value) {
        let entry =
            json!({ "at": now_iso(), "session": session, "kind": kind, "data": clip(data) });
        let mut line = entry.to_string();
        line.push('\n');
        let _ = self.append(line.as_bytes());
    }

    /// A line the harness wrote, as it wrote it. A line of streamed text is left out.
    pub fn record_raw(&self, session: &str, line: &str) {
        match serde_json::from_str::<Value>(line) {
            Ok(value) if value["type"] == "stream_event" => {}
            Ok(value) => self.record(session, "raw", value),
            // Not JSON: the harness talking to a terminal.
            Err(_) => self.record(session, "raw", Value::String(line.to_owned())),
        }
    }

    fn append(&self, line: &[u8]) -> io::Result<()> {
        let mut state = self.state();
        if state.is_none() {
            fs::create_dir_all(&self.dir)?;
            let file = File::options()
                .append(true)
                .create(true)
                .open(self.current())?;
            let length = file.metadata()?.len();
            *state = Some((file, length));
        }
        if state
            .as_ref()
            .is_some_and(|(_, length)| *length >= MAX_BYTES)
        {
            // Close before renaming: Windows does not rename an open file.
            *state = None;
            fs::rename(self.current(), self.older())?;
            let file = File::options()
                .append(true)
                .create(true)
                .open(self.current())?;
            *state = Some((file, 0));
        }
        if let Some((file, length)) = state.as_mut() {
            file.write_all(line)?;
            *length += line.len() as u64;
        }
        Ok(())
    }

    /// The end of the log, at most `max_bytes` of it, cut at a line.
    pub fn tail(&self, max_bytes: usize) -> DiagnosticsView {
        let max = max_bytes.clamp(1, MAX_TAIL_BYTES);
        // Held so that a roll-over does not happen between the two reads.
        let _state = self.state();
        let (current, current_len) = read_tail(&self.current(), max);
        let (older, older_len) = if current.len() < max {
            read_tail(&self.older(), max - current.len())
        } else {
            (String::new(), file_len(&self.older()))
        };
        DiagnosticsView {
            path: self.current().to_string_lossy().into_owned(),
            text: older + &current,
            bytes: current_len + older_len,
        }
    }

    /// Empties the log.
    pub fn clear(&self) -> io::Result<()> {
        let mut state = self.state();
        *state = None;
        for path in [self.current(), self.older()] {
            match fs::remove_file(path) {
                Err(e) if e.kind() != io::ErrorKind::NotFound => return Err(e),
                _ => {}
            }
        }
        Ok(())
    }
}

fn file_len(path: &Path) -> u64 {
    fs::metadata(path).map_or(0, |meta| meta.len())
}

/// The last `max` bytes of a file as text, from the first whole line; and the file's length.
fn read_tail(path: &Path, max: usize) -> (String, u64) {
    let Ok(mut file) = File::open(path) else {
        return (String::new(), 0);
    };
    let length = file.metadata().map_or(0, |meta| meta.len());
    let start = length.saturating_sub(max as u64);
    let mut bytes = Vec::new();
    if file.seek(SeekFrom::Start(start)).is_err() || file.read_to_end(&mut bytes).is_err() {
        return (String::new(), length);
    }
    let text = String::from_utf8_lossy(&bytes);
    let whole = if start == 0 {
        &text[..]
    } else {
        // The cut fell inside a line (and maybe inside a character): begin after it.
        text.split_once('\n').map_or("", |(_, rest)| rest)
    };
    (whole.to_owned(), length)
}

/// A value with its long strings cut, so one entry is never pages long.
fn clip(value: Value) -> Value {
    match value {
        Value::String(text) if text.chars().count() > MAX_TEXT => {
            let total = text.chars().count();
            let kept: String = text.chars().take(MAX_TEXT).collect();
            Value::String(format!("{kept}… [{total} characters]"))
        }
        Value::Array(items) => Value::Array(items.into_iter().map(clip).collect()),
        Value::Object(map) => Value::Object(map.into_iter().map(|(k, v)| (k, clip(v))).collect()),
        other => other,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    type TestResult = std::result::Result<(), Box<dyn std::error::Error>>;

    fn entries(text: &str) -> serde_json::Result<Vec<Value>> {
        text.lines().map(serde_json::from_str).collect()
    }

    #[test]
    fn entries_are_lines_of_json_the_newest_last() -> TestResult {
        let dir = tempfile::tempdir()?;
        let log = Diagnostics::new(dir.path().join("agent"));
        assert_eq!(log.tail(DEFAULT_TAIL_BYTES).text, "", "no log yet");
        assert!(
            !dir.path().join("agent").exists(),
            "nothing is made to read"
        );

        log.record(
            "s1",
            "start",
            json!({ "harness": "claude-code", "thread": "d/deck" }),
        );
        log.record_raw(
            "s1",
            r#"{"type":"system","subtype":"api_retry","attempt":1}"#,
        );
        log.record_raw(
            "s1",
            r#"{"type":"stream_event","event":{"delta":{"text":"שלום"}}}"#,
        );
        log.record_raw("s1", "Warning: not json");
        log.record("s1", "close", json!({ "reason": "idle" }));

        let view = log.tail(DEFAULT_TAIL_BYTES);
        let seen = entries(&view.text)?;
        let kinds: Vec<&str> = seen.iter().filter_map(|e| e["kind"].as_str()).collect();
        assert_eq!(
            kinds,
            ["start", "raw", "raw", "close"],
            "streamed text is left out"
        );
        assert_eq!(seen[1]["data"]["subtype"], "api_retry");
        assert_eq!(seen[2]["data"], "Warning: not json");
        assert!(seen.iter().all(|e| e["session"] == "s1"));
        assert!(
            seen.iter()
                .all(|e| e["at"].as_str().is_some_and(|at| at.ends_with('Z')))
        );
        assert!(view.path.ends_with("diagnostics.jsonl"));
        assert_eq!(view.bytes, view.text.len() as u64);
        Ok(())
    }

    #[test]
    fn long_values_are_cut_and_say_how_long_they_were() -> TestResult {
        let dir = tempfile::tempdir()?;
        let log = Diagnostics::new(dir.path().to_path_buf());
        let html = "א".repeat(MAX_TEXT + 500);
        log.record(
            "s",
            "event",
            json!({ "input": { "html": html, "name": "פתיחה" } }),
        );
        let seen = entries(&log.tail(DEFAULT_TAIL_BYTES).text)?;
        let kept = seen[0]["data"]["input"]["html"].as_str().ok_or("no html")?;
        assert!(kept.ends_with(&format!("… [{} characters]", MAX_TEXT + 500)));
        assert!(kept.chars().count() < MAX_TEXT + 40);
        assert_eq!(seen[0]["data"]["input"]["name"], "פתיחה");
        Ok(())
    }

    #[test]
    fn the_log_rolls_over_and_the_tail_reads_across_the_two_files() -> TestResult {
        let dir = tempfile::tempdir()?;
        let log = Diagnostics::new(dir.path().to_path_buf());
        let padding = "x".repeat(1000);
        let mut written = 0_u64;
        let mut n = 0;
        while written < MAX_BYTES + 50_000 {
            log.record("s", "raw", json!({ "n": n, "padding": padding }));
            n += 1;
            written += 1070;
        }
        assert!(dir.path().join(OLDER).is_file(), "rolled over once");
        assert!(file_len(&dir.path().join(CURRENT)) < MAX_BYTES / 2);

        // The whole of the new file and the end of the old one, in order, cut at a line.
        let view = log.tail(200_000);
        assert!(view.text.len() <= 200_000);
        let seen = entries(&view.text)?;
        let numbers: Vec<i64> = seen
            .iter()
            .filter_map(|e| e["data"]["n"].as_i64())
            .collect();
        assert_eq!(numbers.last().copied(), Some(n - 1));
        assert!(numbers.windows(2).all(|pair| pair[1] == pair[0] + 1));
        assert!(numbers.len() > 150);
        assert!(view.bytes > MAX_BYTES);

        log.clear()?;
        assert_eq!(log.tail(DEFAULT_TAIL_BYTES).text, "");
        assert_eq!(fs::read_dir(dir.path())?.count(), 0);
        // And it can be written to again.
        log.record("s", "start", json!({}));
        assert_eq!(entries(&log.tail(DEFAULT_TAIL_BYTES).text)?.len(), 1);
        Ok(())
    }
}
