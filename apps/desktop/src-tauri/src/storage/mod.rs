//! The deck on disk (DOC-01..05): workspaces under the app data directory, `.slidr` archives,
//! autosave and crash recovery, recents, and backups before a migration.
//!
//! The webview owns the model. This layer treats `deck.json` as opaque text, except for
//! `schemaVersion` and `assets[*].file` (see [`deck`]).
//!
//! ```text
//! <app_data>/workspaces/<id>/
//!     deck.json  meta.json  assets/  thumbs/  chat/  source/   <- packed into the .slidr file
//!     .workspace.json  .lock                                  <- never packed
//! <app_data>/recents.json
//! ```

mod archive;
mod atomic;
mod backup;
mod deck;
mod recents;
mod time;
mod workspace;

pub(crate) use atomic::TempFile;
pub(crate) use backup::backup;
pub use recents::RecentFile;
pub use workspace::{OpenedDeck, Recoverable, SavedDeck, Storage, Workspace};

/// The model, written by the webview.
const DECK_FILE: &str = "deck.json";
/// App version, schema version, save time and keys other work groups add (harness session ids).
const META_FILE: &str = "meta.json";
/// Content-addressed asset files (SPEC 5.7).
pub(crate) const ASSETS_DIR: &str = "assets";
/// Workspace bookkeeping: source path, dirty flag, title, timestamps.
const STATE_FILE: &str = ".workspace.json";
/// Held locked by the process that has the workspace open.
const LOCK_FILE: &str = ".lock";
