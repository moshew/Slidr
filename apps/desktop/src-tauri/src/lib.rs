//! The Tauri shell of Slidr. The webview owns the model; Rust keeps the files, runs the agent
//! harnesses and captures slides.

mod assets;
mod capture;
mod commands;
mod error;
mod harness;
mod storage;

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
            capture::capture_slide,
            capture::capture_page_loaded,
            capture::capture_ready,
        ])
        .run(tauri::generate_context!())
        .expect("failed to start the Slidr application");
}
