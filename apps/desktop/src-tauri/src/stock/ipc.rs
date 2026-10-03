//! The IPC surface of the stock photos. Thin: the logic is in [`StockService`].
//!
//! Argument names are camelCase on the JavaScript side (`workspaceId`). Errors arrive as
//! `{ kind, message }`. The webview names a photo by its source and id, as a search returned
//! them; it never passes an address.

use std::sync::Arc;

use tauri::{State, ipc::Response};

use super::{ImportedPhoto, Result, SourceStatus, StockQuery, StockResults, StockService};
use crate::storage::Storage;

type Stock<'a> = State<'a, Arc<StockService>>;

/// `stock_sources()`: the photo libraries, each with whether its key is stored.
#[tauri::command]
pub async fn stock_sources(stock: Stock<'_>) -> Result<Vec<SourceStatus>> {
    Ok(stock.sources())
}

/// `stock_default_source()`: the id of the source a search uses when it names none.
#[tauri::command]
pub async fn stock_default_source(stock: Stock<'_>) -> Result<String> {
    stock.default_source()
}

/// `stock_search({ source?, query })`: one page of photos.
#[tauri::command]
pub async fn stock_search(
    stock: Stock<'_>,
    source: Option<String>,
    query: StockQuery,
) -> Result<StockResults> {
    stock.search(source.as_deref(), query).await
}

/// `stock_thumbnail({ source, id })`: a small picture of a found photo, as the bytes of its file.
#[tauri::command]
pub async fn stock_thumbnail(stock: Stock<'_>, source: String, id: String) -> Result<Response> {
    Ok(Response::new(stock.thumbnail(&source, &id).await?))
}

/// `stock_import({ workspaceId, source, id })`: takes a found photo into the workspace's assets.
#[tauri::command]
pub async fn stock_import(
    stock: Stock<'_>,
    storage: State<'_, Arc<Storage>>,
    workspace_id: String,
    source: String,
    id: String,
) -> Result<ImportedPhoto> {
    stock.import(&storage, &workspace_id, &source, &id).await
}
