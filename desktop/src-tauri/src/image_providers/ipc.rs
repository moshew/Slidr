//! The IPC surface of the image providers. Thin: the logic is in [`ImageService`].
//!
//! Argument names are camelCase on the JavaScript side (`providerId`, `jobId`, `workspaceId`,
//! `onEvent`). Errors arrive as `{ kind, message }`. `image_generate` and `image_edit` return
//! when every image of the job is settled, with one outcome per image; while they run, each
//! image's progress arrives on the `Channel` passed in. The job id is the caller's, so that
//! `image_cancel` can name a job whose call has not returned yet.

use std::sync::Arc;

use tauri::{State, ipc::Channel};

use super::{
    EditJob, GenerateJob, ImageError, ImageEvent, ImageService, JobResult, ProviderDescriptor,
    ProviderStatus, Result,
};
use crate::storage::Storage;

type Images<'a> = State<'a, Arc<ImageService>>;
type Files<'a> = State<'a, Arc<Storage>>;

/// `image_providers()`: the registered providers with their capabilities (GEN-01).
#[tauri::command]
pub async fn image_providers(images: Images<'_>) -> Result<Vec<ProviderDescriptor>> {
    Ok(images.descriptors())
}

/// `image_probe({ providerId })`: installed, version, signed in.
#[tauri::command]
pub async fn image_probe(images: Images<'_>, provider_id: String) -> Result<ProviderStatus> {
    images.probe(&provider_id).await
}

/// `image_default_provider()`: the id of the provider a job uses when it names none.
#[tauri::command]
pub async fn image_default_provider(images: Images<'_>) -> Result<String> {
    images.default_provider()
}

/// `image_set_default_provider({ providerId })`: the user's choice, kept across runs.
#[tauri::command]
pub async fn image_set_default_provider(images: Images<'_>, provider_id: String) -> Result<()> {
    let images = Arc::clone(&images);
    // It writes a file.
    tauri::async_runtime::spawn_blocking(move || images.set_default_provider(&provider_id))
        .await
        .map_err(ImageError::internal)?
}

/// `image_generate({ jobId, workspaceId, job, onEvent })`: `job.count` images, in parallel, each
/// stored as an asset of the workspace (GEN-04).
#[tauri::command]
pub async fn image_generate(
    images: Images<'_>,
    storage: Files<'_>,
    job_id: String,
    workspace_id: String,
    job: GenerateJob,
    on_event: Channel<ImageEvent>,
) -> Result<JobResult> {
    images
        .generate(&storage, &job_id, &workspace_id, job, move |event| {
            // Fails only when the webview is gone; the result is what counts.
            let _ = on_event.send(event);
        })
        .await
}

/// `image_edit({ jobId, workspaceId, job, onEvent })`: `job.count` new images made from an asset.
#[tauri::command]
pub async fn image_edit(
    images: Images<'_>,
    storage: Files<'_>,
    job_id: String,
    workspace_id: String,
    job: EditJob,
    on_event: Channel<ImageEvent>,
) -> Result<JobResult> {
    images
        .edit(&storage, &job_id, &workspace_id, job, move |event| {
            let _ = on_event.send(event);
        })
        .await
}

/// `image_cancel({ jobId })`: ends the job's unfinished images as `cancelled`.
#[tauri::command]
pub async fn image_cancel(images: Images<'_>, job_id: String) -> Result<()> {
    images.cancel(&job_id);
    Ok(())
}
