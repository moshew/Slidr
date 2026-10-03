//! The built-in image providers: the one place outside a provider's own file that names concrete
//! providers.

use std::sync::Arc;

use super::{ImageProvider, mock::MockProvider};

// Declared here rather than in `mod.rs`, so the generic layer does not name it.
#[path = "codex_cli.rs"]
mod codex_cli;

/// Set to offer the mock provider in a release build (end-to-end tests).
const MOCK_ENV: &str = "SLIDR_IMAGE_MOCK";

/// The providers the app offers, in display order. The first is the default until the user picks
/// another (ADR-004). The mock is offered in debug builds, or in any build when
/// `SLIDR_IMAGE_MOCK` is set.
pub fn builtin() -> Vec<Arc<dyn ImageProvider>> {
    let mut providers: Vec<Arc<dyn ImageProvider>> = vec![Arc::new(codex_cli::CodexCli::new())];
    if cfg!(debug_assertions) || std::env::var_os(MOCK_ENV).is_some() {
        providers.push(Arc::new(MockProvider::builtin()));
    }
    providers
}
