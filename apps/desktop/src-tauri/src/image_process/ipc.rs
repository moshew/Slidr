//! The IPC surface of local image processing. Thin: the logic is in [`ImageProcessService`].
//!
//! Argument names are camelCase on the JavaScript side (`workspaceId`, `assetId`). Errors
//! arrive as `{ kind, message }`, the image providers' kinds. `image_process` returns when the
//! new asset is stored; the work runs off the async runtime, so the app stays responsive while
//! a model takes its seconds.

use std::sync::Arc;

use tauri::State;

use super::{ImageProcessService, MattingStatus, Operation, Processed};
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
