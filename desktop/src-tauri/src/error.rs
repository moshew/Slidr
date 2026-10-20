//! The one error type that crosses IPC: `{ kind, message }`.

use std::{fmt, io, path::Path};

use serde::Serialize;

/// Result of every storage and asset operation.
pub type Result<T> = std::result::Result<T, AppError>;

/// Closed set of error categories the webview can branch on.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorKind {
    /// A file or folder the caller pointed at does not exist.
    NotFound,
    /// The file exists but is not a usable `.slidr` archive.
    InvalidFile,
    /// An argument from the webview is malformed (deck JSON, backup tag, request headers).
    InvalidInput,
    /// The file system refused the operation.
    Io,
    /// The disk, or the user's quota on it, has no room for what was being written.
    DiskFull,
    /// No such workspace in this process, or another running instance owns it.
    UnknownWorkspace,
    /// A bug on the Rust side.
    Internal,
}

/// An error as the webview receives it. `message` is English text for logs; the UI picks its
/// own wording from `kind`.
#[derive(Debug, Clone, Serialize)]
pub struct AppError {
    /// What went wrong, as a category.
    pub kind: ErrorKind,
    /// Details for logs and bug reports.
    pub message: String,
}

impl AppError {
    /// An error of the given kind.
    pub fn new(kind: ErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }

    /// A file system failure while doing `action` ("write deck.json"): `disk_full` when there
    /// was no room to write, `io` otherwise.
    pub fn io(action: impl fmt::Display, error: &io::Error) -> Self {
        Self::new(
            file_error_kind(error),
            format!("could not {action}: {error}"),
        )
    }

    /// A failure on a path the caller chose: `not_found` when it does not exist, `disk_full`
    /// when there was no room to write, `io` otherwise.
    pub fn path(path: &Path, error: &io::Error) -> Self {
        let kind = if error.kind() == io::ErrorKind::NotFound {
            ErrorKind::NotFound
        } else {
            file_error_kind(error)
        };
        Self::new(kind, format!("{}: {error}", path.display()))
    }

    /// The file is not a usable `.slidr` archive.
    pub fn invalid_file(message: impl Into<String>) -> Self {
        Self::new(ErrorKind::InvalidFile, message)
    }

    /// The webview sent something malformed.
    pub fn invalid_input(message: impl Into<String>) -> Self {
        Self::new(ErrorKind::InvalidInput, message)
    }

    /// The workspace id does not name a workspace this process may use.
    pub fn unknown_workspace(id: &str) -> Self {
        Self::new(
            ErrorKind::UnknownWorkspace,
            format!("unknown workspace: {id}"),
        )
    }

    /// A bug on the Rust side.
    pub fn internal(message: impl fmt::Display) -> Self {
        Self::new(ErrorKind::Internal, message.to_string())
    }
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for AppError {}

/// A full disk is told apart from every other refusal: it is the one the user can do something
/// about, and the app says so (WG13-T03).
fn file_error_kind(error: &io::Error) -> ErrorKind {
    match error.kind() {
        io::ErrorKind::StorageFull | io::ErrorKind::QuotaExceeded => ErrorKind::DiskFull,
        _ => ErrorKind::Io,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_full_disk_has_a_kind_of_its_own() {
        let full = io::Error::from(io::ErrorKind::StorageFull);
        let quota = io::Error::from(io::ErrorKind::QuotaExceeded);
        let denied = io::Error::from(io::ErrorKind::PermissionDenied);
        let missing = io::Error::from(io::ErrorKind::NotFound);
        assert_eq!(
            AppError::io("write deck.json", &full).kind,
            ErrorKind::DiskFull
        );
        assert_eq!(
            AppError::io("write deck.json", &quota).kind,
            ErrorKind::DiskFull
        );
        assert_eq!(AppError::io("write deck.json", &denied).kind, ErrorKind::Io);
        let path = Path::new("deck.slidr");
        assert_eq!(AppError::path(path, &full).kind, ErrorKind::DiskFull);
        assert_eq!(AppError::path(path, &denied).kind, ErrorKind::Io);
        assert_eq!(AppError::path(path, &missing).kind, ErrorKind::NotFound);
        assert_eq!(
            serde_json::to_value(ErrorKind::DiskFull).ok(),
            Some(serde_json::json!("disk_full"))
        );
    }

    /// Windows reports a full volume as error 112, and as 39 on a handle: both are `StorageFull`
    /// to the standard library, which is what the mapping above relies on.
    #[cfg(windows)]
    #[test]
    fn windows_disk_full_codes_are_storage_full() {
        for code in [112, 39] {
            let error = io::Error::from_raw_os_error(code);
            assert_eq!(error.kind(), io::ErrorKind::StorageFull, "os error {code}");
            assert_eq!(AppError::io("write", &error).kind, ErrorKind::DiskFull);
        }
    }
}
