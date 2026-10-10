//! The built-in harnesses: the one place outside an adapter's own file that names concrete
//! adapters. AGT-04 (a settings file listing harnesses) replaces this list later.

use std::sync::Arc;

use super::{AgentHarness, mock::MockHarness};

// Declared here rather than in `mod.rs`, so the generic layer does not name it.
#[path = "claude_code.rs"]
mod claude_code;
#[path = "one_shot.rs"]
pub(super) mod one_shot;

/// Set to offer the scripted mock harness in a release build (end-to-end tests).
const MOCK_ENV: &str = "SLIDR_AGENT_MOCK";

/// The harnesses the app offers, in display order. The mock is offered in debug builds, or in
/// any build when `SLIDR_AGENT_MOCK` is set.
pub fn builtin() -> Vec<Arc<dyn AgentHarness>> {
    let mut harnesses: Vec<Arc<dyn AgentHarness>> =
        vec![Arc::new(claude_code::ClaudeCodeHarness::new())];
    harnesses.push(Arc::new(one_shot::OneShotHarness::codex()));
    harnesses.push(Arc::new(one_shot::OneShotHarness::copilot()));
    if cfg!(debug_assertions) || std::env::var_os(MOCK_ENV).is_some() {
        harnesses.push(Arc::new(MockHarness::builtin()));
    }
    harnesses
}
