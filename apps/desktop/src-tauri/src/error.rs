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

    /// A file system failure while doing `action` ("write deck.json").
    pub fn io(action: impl fmt::Display, error: &io::Error) -> Self {
        Self::new(ErrorKind::Io, format!("could not {action}: {error}"))
    }

    /// A failure on a path the caller chose: `not_found` when it does not exist, `io` otherwise.
    pub fn path(path: &Path, error: &io::Error) -> Self {
        let kind = if error.kind() == io::ErrorKind::NotFound {
            ErrorKind::NotFound
        } else {
            ErrorKind::Io
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
