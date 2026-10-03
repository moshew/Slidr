//! The credential store of the operating system: the Windows Credential Manager, the macOS
//! Keychain, the Secret Service on Linux. The one file that names the crate that reaches them.
//!
//! An entry is a pair: the service, which is the app's identifier, and the key's name. A build
//! with another identifier (a development copy of the app) therefore keeps keys of its own and
//! never touches the user's.

use keyring::{Entry, Error};

use super::SecretStore;

/// The app's entries in the system's credential store.
pub struct Keychain {
    service: String,
}

impl Keychain {
    /// The entries of the app whose identifier is `service` (`dev.slidr.app`).
    pub fn new(service: impl Into<String>) -> Self {
        Self {
            service: service.into(),
        }
    }

    fn entry(&self, name: &str) -> Result<Entry, String> {
        Entry::new(&self.service, name).map_err(text)
    }
}

impl SecretStore for Keychain {
    fn get(&self, name: &str) -> Result<Option<String>, String> {
        match self.entry(name)?.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(Error::NoEntry) => Ok(None),
            Err(error) => Err(text(error)),
        }
    }

    fn set(&self, name: &str, value: &str) -> Result<(), String> {
        self.entry(name)?.set_password(value).map_err(text)
    }

    fn delete(&self, name: &str) -> Result<(), String> {
        match self.entry(name)?.delete_credential() {
            Ok(()) | Err(Error::NoEntry) => Ok(()),
            Err(error) => Err(text(error)),
        }
    }
}

/// What the store reported. Its errors describe the failure and never carry the value: the one
/// variant that holds bytes of a stored secret prints only that they are not text.
#[allow(clippy::needless_pass_by_value)]
fn text(error: Error) -> String {
    error.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    type TestResult = std::result::Result<(), Box<dyn std::error::Error>>;

    /// Writes to the real credential store of this machine, under a service of its own:
    /// `cargo test -p slidr real_credential_store -- --ignored`.
    #[test]
    #[ignore = "writes to the credential store of the machine"]
    fn real_credential_store_keeps_a_key_between_two_readers() -> TestResult {
        let service = format!("dev.slidr.app.test-{}", uuid::Uuid::new_v4().simple());
        let name = "openai-api";
        let first = Keychain::new(&service);
        assert_eq!(first.get(name)?, None);
        first.set(name, "sk-test-not-a-real-key")?;
        // Another reader, as after a restart of the app.
        let second = Keychain::new(&service);
        assert_eq!(second.get(name)?.as_deref(), Some("sk-test-not-a-real-key"));
        second.set(name, "sk-test-replaced")?;
        assert_eq!(first.get(name)?.as_deref(), Some("sk-test-replaced"));
        // Another service does not see it.
        assert_eq!(Keychain::new(format!("{service}.other")).get(name)?, None);
        second.delete(name)?;
        assert_eq!(first.get(name)?, None);
        second.delete(name)?;
        Ok(())
    }
}
