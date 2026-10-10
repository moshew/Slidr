//! The built-in image providers: the one place outside a provider's own file that names concrete
//! providers.

use std::sync::Arc;

use super::{ImageProvider, mock::MockProvider};
use crate::{secrets::Secrets, settings::Settings};

// Declared here rather than in `mod.rs`, so the generic layer does not name them.
#[path = "codex_cli.rs"]
mod codex_cli;
#[path = "openai_api.rs"]
mod openai_api;

pub(crate) fn codex_executable() -> std::result::Result<std::path::PathBuf, String> {
    codex_cli::CodexCli::executable()
}

/// Set to offer the mock provider in a release build (end-to-end tests).
const MOCK_ENV: &str = "SLIDR_IMAGE_MOCK";

/// The providers the app offers, in display order. The first is the default until the user picks
/// another (ADR-004): the one that needs no key. The mock is offered in debug builds, or in any
/// build when `SLIDR_IMAGE_MOCK` is set.
///
/// `secrets` and `settings` are for the providers that are web APIs: the user's key, and the
/// options of the `images` section.
pub fn builtin(secrets: &Arc<Secrets>, settings: &Arc<Settings>) -> Vec<Arc<dyn ImageProvider>> {
    let mut providers: Vec<Arc<dyn ImageProvider>> = vec![
        Arc::new(codex_cli::CodexCli::new()),
        Arc::new(openai_api::OpenAiApi::new(
            Arc::clone(secrets),
            Arc::clone(settings),
        )),
    ];
    if cfg!(debug_assertions) || std::env::var_os(MOCK_ENV).is_some() {
        providers.push(Arc::new(MockProvider::builtin()));
    }
    providers
}
