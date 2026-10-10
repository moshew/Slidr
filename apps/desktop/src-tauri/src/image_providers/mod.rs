//! AI image providers (SPEC 11.9, GEN-01, GEN-04, GEN-05): one interface over image generators
//! that run outside the app (a CLI process today), so the rest of the app knows jobs, outcomes
//! and assets, never a particular provider.
//!
//! ```text
//! webview ──invoke──► ipc ──► ImageService ──► dyn ImageProvider      one call per image,
//!    ▲                         │    │                                 N calls in parallel
//!    │                         │    └─► assets::import_bytes ──► <workspace>/assets/<sha256>.png
//!    └─ Channel<ImageEvent> ◄──┘
//! ```
//!
//! A job is `count` images from one request. Its result is the return value of the call: one
//! outcome per image. The events on the channel are only its progress.
//!
//! Providers live next to this file; [`registry`] is the only place that names them. The mock
//! provider ([`mock`]) draws placeholder pictures, for tests and for UI work without cost.
//! [`exact_edit`] is what a provider that edits through a web service lays around its call, so
//! that the edit keeps the pixels it was not asked to change.

mod exact_edit;
pub mod ipc;
mod mock;
mod registry;
mod service;
mod types;

use async_trait::async_trait;
use tokio::sync::watch;

pub use registry::builtin;
pub(crate) use registry::codex_executable;
pub use service::ImageService;
#[allow(unused_imports)]
// The whole contract is public, whether or not this crate uses each part.
pub use types::{
    Aspect, Capabilities, EditJob, EditRequest, EditSupport, GenerateJob, GenerateRequest,
    GeneratedImage, ImageError, ImageErrorKind, ImageEvent, ImageOutcome, JobResult,
    ProviderDescriptor, ProviderState, ProviderStatus, Result,
};

/// Something that makes images.
///
/// One call makes one image; the service runs as many calls at once as the descriptor's
/// `max_parallel` allows. A call ends early, with `cancelled`, once `cancel` fires, and by the
/// time any call returns the provider has nothing of it still running and nothing of it left on
/// disk.
#[async_trait]
pub trait ImageProvider: Send + Sync {
    /// Id, name and capabilities. Cheap and constant.
    fn descriptor(&self) -> ProviderDescriptor;

    /// Is it installed, which version, is it signed in. Never fails; a failure is a state.
    async fn probe(&self) -> ProviderStatus;

    /// One image from a prompt.
    async fn generate(&self, request: &GenerateRequest, cancel: Cancel) -> Result<GeneratedImage>;

    /// One new image from an existing one. Called only when the capabilities allow it, and with
    /// a mask only when they say `mask`.
    async fn edit(&self, request: &EditRequest, cancel: Cancel) -> Result<GeneratedImage>;
}

/// Tells the images of one job to stop. Cheap to clone.
#[derive(Debug, Clone)]
pub struct Cancel(watch::Receiver<bool>);

impl Cancel {
    /// A signal and the sender that fires it by sending `true`.
    pub fn new() -> (watch::Sender<bool>, Self) {
        let (sender, receiver) = watch::channel(false);
        (sender, Self(receiver))
    }

    /// Returns once the job is cancelled; never, if it is not.
    pub async fn cancelled(&mut self) {
        if self.0.wait_for(|cancelled| *cancelled).await.is_err() {
            // The job is over and nobody can cancel it any more.
            std::future::pending::<()>().await;
        }
    }
}
