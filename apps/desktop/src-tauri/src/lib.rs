//! The Tauri shell of Slidr. The webview owns the model; Rust keeps the files, runs the agent
//! harnesses and captures slides.

mod assets;
mod capture;
mod commands;
mod error;
mod harness;
mod storage;
// The tool bridge. Its folder is the one place that names the protocol it speaks to agents
// (API-02); the rest of the crate knows it by what it does.
#[path = "mcp_bridge/mod.rs"]
mod tool_bridge;

use std::sync::Arc;

use tauri::Manager;

/// Starts the Tauri application. Blocks until the last window closes.
///
/// # Panics
/// If the webview runtime cannot be initialised; there is nothing to fall back to.
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let root = app.path().app_data_dir()?;
            app.manage(Arc::new(harness::HarnessManager::new(
                root.join("agent"),
                harness::builtin(),
            )));
            app.manage(tool_bridge::ToolBridge::new());
            app.manage(Arc::new(storage::Storage::new(root)));
            app.manage(Arc::new(capture::CaptureService::new()));
            Ok(())
        })
        .on_window_event(capture::on_window_event)
        .invoke_handler(tauri::generate_handler![
            commands::storage_new,
            commands::storage_open,
            commands::storage_write_deck,
            commands::storage_save,
            commands::storage_close,
            commands::storage_list_recoverable,
            commands::storage_recover,
            commands::storage_backup,
            commands::recents_list,
            commands::recents_remove,
            commands::asset_import_file,
            commands::asset_import_bytes,
            harness::ipc::agent_harnesses,
            harness::ipc::agent_probe,
            harness::ipc::agent_start,
            harness::ipc::agent_send,
            harness::ipc::agent_interrupt,
            harness::ipc::agent_close,
            tool_bridge::ipc::tool_bridge_connect,
            tool_bridge::ipc::tool_bridge_open,
            tool_bridge::ipc::tool_bridge_close,
            tool_bridge::ipc::tool_bridge_reply,
            capture::capture_slide,
            capture::capture_page_loaded,
            capture::capture_ready,
        ])
        .run(tauri::generate_context!())
        .expect("failed to start the Slidr application");
}
