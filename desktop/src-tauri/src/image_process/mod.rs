//! Local image processing (SPEC GEN-06, GEN-07; WG12-T05): what is done to a picture on this
//! machine, with nothing sent anywhere and nothing fetched.
//!
//! ```text
//! webview ──invoke──► ipc ──► ImageProcessService ──► remove_background: model ► matte ► cut-out
//!                              │                  └─► chroma_key:        the flat colour, keyed out
//!                              └─► assets::import_bytes ──► <workspace>/assets/<sha256>.png
//! ```
//!
//! An operation reads an image asset of a workspace and stores its result as a new PNG asset
//! with transparency, of the picture's own size. The source is never touched (IMG-12).
//!
//! - **`remove_background`** needs a matting model, an ONNX file that is not part of the
//!   repository and that the app never downloads: [`model`] says which files it knows and where
//!   it looks for them, and [`ImageProcessService::status`] says what it found. [`matte`] is
//!   everything around the model: its input, and its coarse matte made into a cut-out whose
//!   edges are the picture's.
//! - **`chroma_key`** ([`chroma`]) needs nothing: it removes one flat colour. It is what gives a
//!   picture from a provider that cannot draw transparency a transparent background.
//!
//! - **Upscaling** ([`upscale`], SPEC AIO-04) is a job of its own beside the two operations: it
//!   takes seconds to a minute, so it reports its progress and can be cancelled. It needs a
//!   super-resolution model, another file of a models folder that the app knows by name; the
//!   result is the picture two or four times its size, in the format of its source.
//!
//! Errors are the image providers' `{ kind, message }`: `not_installed` when there is no model,
//! `not_found` for an asset that is not in the workspace, `unsupported` for a picture this
//! build cannot decode, `invalid_input` for a picture an operation cannot work on, `cancelled`
//! for an upscale that was stopped.

mod chroma;
pub mod ipc;
mod matte;
mod model;
mod service;
mod types;
mod upscale;

pub use model::Places;
pub use service::ImageProcessService;
#[allow(unused_imports)]
// The whole contract is public, whether or not this crate uses each part.
pub use types::{
    MattingState, MattingStatus, ModelInfo, Operation, Processed, UpscaleProgress, UpscaleStatus,
    Upscaled,
};

use tauri::Manager;

/// The places the running app looks for a model in: its data folder, the resources that came
/// with its installer, and, in a debug build, the folder `SLIDR_MODELS_DIR` names.
pub fn places(app: &tauri::App) -> tauri::Result<Places> {
    let paths = app.path();
    let data = paths.app_data_dir()?;
    // An app run without a bundle has no resources; it still has its data folder.
    let resources = paths.resource_dir().ok();
    Ok(Places::new(&data, resources.as_deref(), Places::dev_dir()))
}
