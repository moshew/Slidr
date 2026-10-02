/// Starts the Tauri application. Blocks until the last window closes.
///
/// # Panics
/// If the webview runtime cannot be initialised; there is nothing to fall back to.
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("failed to start the Slidr application");
}
