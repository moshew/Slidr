//! The built-in photo libraries: the one place outside a source's own file that names them.

use std::sync::Arc;

use super::{StockProvider, mock::MockStock};
use crate::secrets::Secrets;

// Declared here rather than in `mod.rs`, so the generic layer does not name them.
#[path = "pexels.rs"]
mod pexels;
#[path = "unsplash.rs"]
mod unsplash;

/// Set to offer the mock library in a release build (end-to-end tests).
const MOCK_ENV: &str = "SLIDR_STOCK_MOCK";

/// The libraries the app offers, in display order. A search that names none goes to the user's
/// choice, or to the first whose key is stored. The mock is offered in debug builds, or in any
/// build when `SLIDR_STOCK_MOCK` is set.
pub fn builtin(secrets: &Arc<Secrets>) -> Vec<Arc<dyn StockProvider>> {
    let mut sources: Vec<Arc<dyn StockProvider>> = vec![
        Arc::new(unsplash::Unsplash::new(Arc::clone(secrets))),
        Arc::new(pexels::Pexels::new(Arc::clone(secrets))),
    ];
    if cfg!(debug_assertions) || std::env::var_os(MOCK_ENV).is_some() {
        sources.push(Arc::new(MockStock::builtin()));
    }
    sources
}
