//! The IPC surface of local image processing. Thin: the logic is in [`ImageProcessService`].
//!
//! Argument names are camelCase on the JavaScript side (`workspaceId`, `assetId`). Errors
//! arrive as `{ kind, message }`, the image providers' kinds. `image_process` returns when the
//! new asset is stored; the work runs off the async runtime, so the app stays responsive while
//! a model takes its seconds.

use std::sync::Arc;

use tauri::{State, ipc::Channel};

use super::{
    ImageProcessService, MattingStatus, Operation, Processed, UpscaleProgress, UpscaleStatus,
    Upscaled,
};
use crate::{image_providers::Result, storage::Storage};

type Processing<'a> = State<'a, Arc<ImageProcessService>>;

/// `image_process({ workspaceId, assetId, operation })`: runs `operation` on an image asset of
/// the workspace and stores the result as a new asset; the source stays (IMG-12).
///
/// `operation` is `{ type: 'remove_background' }` or
/// `{ type: 'chroma_key', color?, tolerance?, contiguous? }`.
#[tauri::command]
pub async fn image_process(
    processing: Processing<'_>,
    storage: State<'_, Arc<Storage>>,
    workspace_id: String,
    asset_id: String,
    operation: Operation,
) -> Result<Processed> {
    processing
        .process(&storage, &workspace_id, &asset_id, operation)
        .await
}

/// `image_process_status()`: whether background removal can run: the model that is installed,
/// where it was found, and where one is to be put.
#[tauri::command]
pub async fn image_process_status(processing: Processing<'_>) -> Result<MattingStatus> {
    Ok(processing.status())
}

/// `image_upscale({ jobId, workspaceId, assetId, factor, onProgress })`: draws an image asset
/// of the workspace again at `factor` times its size (2 or 4) with the installed upscaling
/// model, and stores the result as a new asset; the source stays (IMG-12).
///
/// It returns when the asset is stored. While it runs, `{ done, total }` arrives on the
/// `Channel` for every tile of the picture; the job id is the caller's, so that
/// `image_upscale_cancel` can name a job whose call has not returned yet.
#[tauri::command]
pub async fn image_upscale(
    processing: Processing<'_>,
    storage: State<'_, Arc<Storage>>,
    job_id: String,
    workspace_id: String,
    asset_id: String,
    factor: u32,
    on_progress: Channel<UpscaleProgress>,
) -> Result<Upscaled> {
    processing
        .upscale(
            &storage,
            &job_id,
            &workspace_id,
            &asset_id,
            factor,
            move |progress| {
                // Fails only when the webview is gone; the result is what counts.
                let _ = on_progress.send(progress);
            },
        )
        .await
}

/// `image_upscale_cancel({ jobId })`: stops an upscale; its call ends as `cancelled` and
/// nothing is stored.
#[tauri::command]
pub async fn image_upscale_cancel(processing: Processing<'_>, job_id: String) -> Result<()> {
    processing.cancel_upscale(&job_id);
    Ok(())
}

/// `image_upscale_status()`: whether a picture can be upscaled: the model that is installed,
/// the sizes it gives, the largest picture it takes, and where a model is to be put.
#[tauri::command]
pub async fn image_upscale_status(processing: Processing<'_>) -> Result<UpscaleStatus> {
    Ok(processing.upscale_status())
}
