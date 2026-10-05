//! The Tauri shell of Slidr. The webview owns the model; Rust keeps the files, runs the agent
//! harnesses and captures slides.

mod assets;
mod capture;
mod commands;
mod error;
mod fonts;
mod harness;
mod image_process;
mod image_providers;
mod import_window;
mod net;
mod secrets;
mod settings;
mod stock;
mod storage;
mod templates;
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
        // A link that leaves the app opens in the browser of the system. The capability allows
        // `open_url` for http and https addresses and nothing else of the plugin.
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let root = app.path().app_data_dir()?;
            app.manage(Arc::new(harness::HarnessManager::new(
                root.join("agent"),
                harness::builtin(),
            )));
            app.manage(tool_bridge::ToolBridge::new());
            manage_media(app, &root);
            app.manage(Arc::new(templates::TemplateStore::new(&root)));
            app.manage(Arc::new(storage::Storage::new(root)));
            app.manage(Arc::new(capture::CaptureService::new()));
            app.manage(Arc::new(import_window::ImportService::new()));
            app.manage(Arc::new(image_process::ImageProcessService::new(
                image_process::places(app)?,
            )));
            Ok(())
        })
        .on_window_event(capture::on_window_event)
        .on_window_event(import_window::on_window_event)
        // Every app command passes the gate: the import window may call only its own few.
        .invoke_handler(import_window::gate(tauri::generate_handler![
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
            commands::export_write_file,
            image_providers::ipc::image_providers,
            image_providers::ipc::image_probe,
            image_providers::ipc::image_default_provider,
            image_providers::ipc::image_set_default_provider,
            image_providers::ipc::image_generate,
            image_providers::ipc::image_edit,
            image_providers::ipc::image_cancel,
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
            capture::capture_clip,
            capture::capture_run_job,
            capture::capture_job_take,
            capture::capture_job_done,
            harness::ipc::agent_chat_read,
            harness::ipc::agent_chat_write,
            templates::template_store_list,
            templates::template_store_save,
            templates::template_store_remove,
            templates::template_store_read_asset,
            templates::template_store_write_asset,
            harness::ipc::agent_attach,
            settings::ipc::settings_read,
            settings::ipc::settings_write,
            secrets::ipc::secret_status,
            secrets::ipc::secret_set,
            secrets::ipc::secret_delete,
            stock::ipc::stock_sources,
            stock::ipc::stock_default_source,
            stock::ipc::stock_search,
            stock::ipc::stock_thumbnail,
            stock::ipc::stock_import,
            import_window::import_open,
            import_window::import_run_job,
            import_window::import_blocked,
            import_window::import_close,
            import_window::import_page_loaded,
            import_window::import_job_take,
            import_window::import_job_done,
            import_window::import_source,
            import_window::import_store_asset,
            commands::export_copy_media,
            image_process::ipc::image_process,
            image_process::ipc::image_process_status,
            harness::ipc::agent_diagnostics_read,
            harness::ipc::agent_diagnostics_clear,
            fonts::fonts_system,
            import_window::import_reopen,
            import_window::import_record_read,
            import_window::import_record_write,
            import_window::import_source_export,
        ]))
        .run(tauri::generate_context!())
        .expect("failed to start the Slidr application");
}

/// The settings and the keys, and what reads them: the image providers and the photo libraries
/// (ADR-051).
fn manage_media(app: &tauri::App, root: &std::path::Path) {
    let settings = Arc::new(settings::Settings::open(root.join("settings.json")));
    // Keys are kept under the app's identifier, so a development copy has keys of its own and
    // never reads or replaces the user's.
    let secrets = Arc::new(secrets::Secrets::new(secrets::Keychain::new(
        app.config().identifier.clone(),
    )));
    let images = image_providers::ImageService::new(
        Arc::clone(&settings),
        image_providers::builtin(&secrets, &settings),
    );
    images.adopt_legacy_choice(&root.join("image-providers.json"));
    app.manage(Arc::new(images));
    app.manage(Arc::new(stock::StockService::new(
        Arc::clone(&settings),
        stock::builtin(&secrets),
    )));
    app.manage(settings);
    app.manage(secrets);
}
