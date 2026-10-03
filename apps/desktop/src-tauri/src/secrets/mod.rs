//! API keys (SEC-04, ADR-051): kept in the credential store of the operating system and nowhere
//! else.
//!
//! ```text
//! webview ──secret_set(name, value)──► Secrets ──► the OS credential store
//!    ▲                                   │
//!    └──── secret_status(): present? ◄───┤          a value never travels this way
//!                                        └─► a provider that calls a web API reads it, in Rust
//! ```
//!
//! A key enters once, from the settings screen, and from then on only Rust reads it: there is no
//! command that returns one. So a key is never in the webview's storage, in the settings file, in
//! a deck, in a transcript or in a log. What the app sends to an agent or shows the user passes
//! [`Secrets::redact`] first wherever a remote service had a hand in the text.
//!
//! The names are a closed set ([`SecretName`]); a new one is a line here and a field in the
//! settings screen.

pub mod ipc;
mod keychain;

use std::{
    collections::HashMap,
    fmt,
    sync::{Mutex, MutexGuard, PoisonError},
};

use serde::{Deserialize, Serialize};

use crate::error::{AppError, ErrorKind, Result};

pub use keychain::Keychain;

/// Longest key the app accepts, in bytes. Real keys are under 200.
const MAX_LEN: usize = 512;

/// What stands where a key was, in text that leaves the process.
const REDACTED: &str = "[redacted]";

/// The keys the app keeps.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SecretName {
    /// The image provider that calls the OpenAI Images API (GEN-03).
    OpenaiApi,
    /// Stock photos from Unsplash (GEN-08): the application's access key.
    Unsplash,
    /// Stock photos from Pexels (GEN-08).
    Pexels,
}

impl SecretName {
    /// Every name, in the order the settings screen shows them.
    pub const ALL: [Self; 3] = [Self::OpenaiApi, Self::Unsplash, Self::Pexels];

    /// The name as it is written in the credential store and over IPC.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::OpenaiApi => "openai-api",
            Self::Unsplash => "unsplash",
            Self::Pexels => "pexels",
        }
    }
}

/// A key. It has no `Display` and no `Serialize`, and its `Debug` shows nothing, so it cannot
/// reach a log or the webview by accident; whoever needs the text asks for it by name.
#[derive(Clone, PartialEq, Eq)]
pub struct Secret(String);

impl Secret {
    /// The key itself: for the header of a request to the service it belongs to, nothing else.
    pub fn expose(&self) -> &str {
        &self.0
    }
}

impl fmt::Debug for Secret {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("Secret(…)")
    }
}

/// Where the keys are kept. The app uses [`Keychain`]; tests use a map.
pub trait SecretStore: Send + Sync {
    /// The value under `name`; `None` when there is none.
    fn get(&self, name: &str) -> std::result::Result<Option<String>, String>;
    /// Stores `value` under `name`, replacing what was there.
    fn set(&self, name: &str, value: &str) -> std::result::Result<(), String>;
    /// Removes `name`. Removing what is not there is not an error.
    fn delete(&self, name: &str) -> std::result::Result<(), String>;
}

/// Whether a key is stored. All the webview ever learns about one.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SecretStatus {
    pub name: SecretName,
    pub present: bool,
}

/// The app's keys. Shared by the IPC commands and by the providers that need a key.
pub struct Secrets {
    store: Box<dyn SecretStore>,
    /// What was read or written in this run: the store is asked once per key, and
    /// [`Secrets::redact`] knows what to look for.
    known: Mutex<HashMap<SecretName, Option<Secret>>>,
}

impl Secrets {
    /// The keys in `store`.
    pub fn new(store: impl SecretStore + 'static) -> Self {
        Self {
            store: Box::new(store),
            known: Mutex::new(HashMap::new()),
        }
    }

    /// The key under `name`, or `None` when the user has not entered one.
    pub fn get(&self, name: SecretName) -> Result<Option<Secret>> {
        if let Some(known) = lock(&self.known).get(&name) {
            return Ok(known.clone());
        }
        // Read outside the lock: the credential store may take its time.
        let found = self
            .store
            .get(name.as_str())
            .map_err(|e| unavailable("read", name, &e))?
            .filter(|value| !value.is_empty())
            .map(Secret);
        lock(&self.known).insert(name, found.clone());
        Ok(found)
    }

    /// Stores a key the user entered. Surrounding white space is dropped; a value that cannot
    /// be a key (empty, too long, with white space or control characters inside) is rejected.
    pub fn set(&self, name: SecretName, value: &str) -> Result<()> {
        let value = value.trim();
        if value.is_empty() {
            return Err(AppError::invalid_input("the key is empty"));
        }
        if value.len() > MAX_LEN {
            return Err(AppError::invalid_input(format!(
                "the key is longer than {MAX_LEN} characters"
            )));
        }
        if value.chars().any(|c| c.is_whitespace() || c.is_control()) {
            return Err(AppError::invalid_input(
                "the key has white space inside; paste the key alone",
            ));
        }
        self.store
            .set(name.as_str(), value)
            .map_err(|e| unavailable("store", name, &e))?;
        lock(&self.known).insert(name, Some(Secret(value.to_owned())));
        Ok(())
    }

    /// Forgets a key.
    pub fn delete(&self, name: SecretName) -> Result<()> {
        self.store
            .delete(name.as_str())
            .map_err(|e| unavailable("remove", name, &e))?;
        lock(&self.known).insert(name, None);
        Ok(())
    }

    /// Which keys are stored. A key the store cannot be asked about counts as absent.
    pub fn status(&self) -> Vec<SecretStatus> {
        SecretName::ALL
            .into_iter()
            .map(|name| SecretStatus {
                name,
                present: matches!(self.get(name), Ok(Some(_))),
            })
            .collect()
    }

    /// `text` with every key this run has seen replaced by a marker. For anything a remote
    /// service wrote that may go on to the user, to an agent or to a log: a service is free to
    /// echo the request it was sent.
    pub fn redact(&self, text: &str) -> String {
        let known = lock(&self.known);
        let mut out = text.to_owned();
        for secret in known.values().flatten() {
            if out.contains(secret.expose()) {
                out = out.replace(secret.expose(), REDACTED);
            }
        }
        out
    }

    /// Whether `text` holds one of the keys: the settings file refuses such a value.
    pub fn appears_in(&self, text: &str) -> bool {
        // Every key, not only the ones a provider happened to read in this run.
        SecretName::ALL.into_iter().any(
            |name| matches!(self.get(name), Ok(Some(secret)) if text.contains(secret.expose())),
        )
    }
}

/// The credential store refused; the text is the store's, and names no key.
fn unavailable(action: &str, name: SecretName, error: &str) -> AppError {
    AppError::new(
        ErrorKind::Io,
        format!(
            "could not {action} the {} key in the system's credential store: {error}",
            name.as_str()
        ),
    )
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

/// A store in memory, for tests of everything that needs a key.
#[cfg(test)]
#[derive(Default)]
pub struct MemoryStore {
    values: Mutex<HashMap<String, String>>,
    /// Makes every call fail, as a locked or missing credential store does.
    pub broken: bool,
}

#[cfg(test)]
impl SecretStore for MemoryStore {
    fn get(&self, name: &str) -> std::result::Result<Option<String>, String> {
        if self.broken {
            return Err("the store is locked".into());
        }
        Ok(lock(&self.values).get(name).cloned())
    }

    fn set(&self, name: &str, value: &str) -> std::result::Result<(), String> {
        if self.broken {
            return Err("the store is locked".into());
        }
        lock(&self.values).insert(name.to_owned(), value.to_owned());
        Ok(())
    }

    fn delete(&self, name: &str) -> std::result::Result<(), String> {
        if self.broken {
            return Err("the store is locked".into());
        }
        lock(&self.values).remove(name);
        Ok(())
    }
}

/// Keys in memory, with `values` already stored.
#[cfg(test)]
pub fn memory(values: &[(SecretName, &str)]) -> Secrets {
    let secrets = Secrets::new(MemoryStore::default());
    for (name, value) in values {
        assert!(secrets.set(*name, value).is_ok());
    }
    secrets
}

#[cfg(test)]
mod tests {
    use super::*;

    type TestResult = std::result::Result<(), Box<dyn std::error::Error>>;

    const KEY: &str = "sk-test-0123456789abcdefghij";

    #[test]
    fn a_key_is_stored_read_and_forgotten() -> TestResult {
        let secrets = memory(&[]);
        assert!(secrets.get(SecretName::OpenaiApi)?.is_none());
        assert!(secrets.status().iter().all(|s| !s.present));

        secrets.set(SecretName::OpenaiApi, &format!("  {KEY}\n"))?;
        let stored = secrets.get(SecretName::OpenaiApi)?;
        assert_eq!(stored.as_ref().map(Secret::expose), Some(KEY));
        let present: Vec<_> = secrets.status().into_iter().filter(|s| s.present).collect();
        assert_eq!(present.len(), 1);
        assert_eq!(present[0].name, SecretName::OpenaiApi);

        secrets.delete(SecretName::OpenaiApi)?;
        assert!(secrets.get(SecretName::OpenaiApi)?.is_none());
        // Removing what is not there is fine.
        secrets.delete(SecretName::Pexels)?;
        Ok(())
    }

    #[test]
    fn what_cannot_be_a_key_is_rejected() {
        let secrets = memory(&[]);
        let long = "k".repeat(MAX_LEN + 1);
        for bad in ["", "   ", "two words", "line\nbreak", long.as_str()] {
            let error = secrets.set(SecretName::Unsplash, bad).err();
            assert_eq!(error.map(|e| e.kind), Some(ErrorKind::InvalidInput));
        }
        assert!(secrets.status().iter().all(|s| !s.present));
    }

    #[test]
    fn a_key_never_shows_in_debug_output_or_in_an_error() -> TestResult {
        let secrets = memory(&[(SecretName::OpenaiApi, KEY)]);
        let secret = secrets.get(SecretName::OpenaiApi)?.ok_or("no key")?;
        assert_eq!(format!("{secret:?}"), "Secret(…)");
        assert!(!format!("{:?}", secrets.status()).contains(KEY));

        let broken = Secrets::new(MemoryStore {
            broken: true,
            ..MemoryStore::default()
        });
        let error = broken
            .set(SecretName::OpenaiApi, KEY)
            .err()
            .ok_or("stored")?;
        assert_eq!(error.kind, ErrorKind::Io);
        assert!(!error.message.contains(KEY));
        assert!(error.message.contains("openai-api"));
        // A store that cannot be read reports every key as absent rather than failing.
        assert!(broken.status().iter().all(|s| !s.present));
        Ok(())
    }

    #[test]
    fn text_from_outside_loses_the_keys_it_echoes() {
        let secrets = memory(&[(SecretName::OpenaiApi, KEY), (SecretName::Pexels, "px-777")]);
        let said = format!("Incorrect API key provided: {KEY}. And px-777 too.");
        assert_eq!(
            secrets.redact(&said),
            "Incorrect API key provided: [redacted]. And [redacted] too."
        );
        assert_eq!(secrets.redact("nothing to hide"), "nothing to hide");
        assert!(secrets.appears_in(&format!("{{\"apiKey\":\"{KEY}\"}}")));
        assert!(!secrets.appears_in("{\"defaultProvider\":\"openai-api\"}"));
    }

    #[test]
    fn the_names_are_the_ones_the_webview_uses() -> TestResult {
        let names = serde_json::to_value(SecretName::ALL)?;
        assert_eq!(
            names,
            serde_json::json!(["openai-api", "unsplash", "pexels"])
        );
        for name in SecretName::ALL {
            assert_eq!(serde_json::to_value(name)?, name.as_str());
        }
        Ok(())
    }
}
