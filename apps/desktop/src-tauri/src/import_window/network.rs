//! The import window's network block (SPEC 13.3, IMP-08), on WebView2: every request the window
//! makes, from any frame or worker, comes through `WebResourceRequested` first, and one that the
//! policy refuses is answered here with 403 and never leaves the machine. `data:`, `blob:` and
//! `about:` are not requests and are not seen.
//!
//! COM calls in windows-rs are `unsafe`; this file, `capture/webview2.rs` and
//! `fonts/directwrite.rs` are the three places the app allows it.

use std::time::Duration;

use tauri::WebviewWindow;
use tokio::sync::oneshot;
use webview2_com::{
    Microsoft::Web::WebView2::Win32::{
        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL, COREWEBVIEW2_WEB_RESOURCE_REQUEST_SOURCE_KINDS_ALL,
        ICoreWebView2, ICoreWebView2_2, ICoreWebView2_22,
    },
    WebResourceRequestedEventHandler, take_pwstr,
};
use windows_core::{Interface, PWSTR, w};

/// How long the window's thread may take to install the block.
const INSTALL_TIMEOUT: Duration = Duration::from_secs(10);

/// Installs the block on a window. `allows` is asked about every request URL and must be cheap:
/// it runs on the window's thread. It is also where a refused URL is written down.
pub(super) async fn block(
    window: &WebviewWindow,
    allows: impl Fn(&str) -> bool + Send + 'static,
) -> Result<(), String> {
    let (sender, receiver) = oneshot::channel::<Result<(), String>>();
    window
        .with_webview(move |webview| {
            // SAFETY: `with_webview` runs this closure on the webview's UI thread, the thread
            // its COM objects belong to. The controller is a counted COM reference held by
            // `webview` for the length of the call.
            let installed = unsafe {
                webview
                    .controller()
                    .CoreWebView2()
                    .and_then(|core| install(&core, allows))
            };
            let _ = sender.send(installed.map_err(|e| e.to_string()));
        })
        .map_err(|e| format!("the import window is not available: {e}"))?;
    match tokio::time::timeout(INSTALL_TIMEOUT, receiver).await {
        Ok(Ok(result)) => result,
        Ok(Err(_)) => Err("the network block was dropped before it was installed".into()),
        Err(_) => Err(format!(
            "the network block was not installed within {INSTALL_TIMEOUT:?}"
        )),
    }
}

/// # Safety
/// Must run on the thread `core` belongs to.
unsafe fn install(
    core: &ICoreWebView2,
    allows: impl Fn(&str) -> bool + 'static,
) -> windows_core::Result<()> {
    // SAFETY: plain COM calls on live interfaces, on their own thread (the caller's contract).
    // WebView2 keeps its own reference to the handler, and the handler owns what it captured.
    unsafe {
        // Every request of every kind. The newer call also covers frames in other processes and
        // shared workers, which the older one leaves out.
        if let Ok(newer) = core.cast::<ICoreWebView2_22>() {
            newer.AddWebResourceRequestedFilterWithRequestSourceKinds(
                w!("*"),
                COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL,
                COREWEBVIEW2_WEB_RESOURCE_REQUEST_SOURCE_KINDS_ALL,
            )?;
        } else {
            core.AddWebResourceRequestedFilter(w!("*"), COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL)?;
        }
        let environment = core.cast::<ICoreWebView2_2>()?.Environment()?;
        let handler = WebResourceRequestedEventHandler::create(Box::new(move |_, args| {
            let Some(args) = args else {
                return Ok(());
            };
            let mut uri = PWSTR::null();
            args.Request()?.Uri(&mut uri)?;
            let uri = take_pwstr(uri);
            if !allows(&uri) {
                let refused =
                    environment.CreateWebResourceResponse(None, 403, w!("Blocked"), w!(""))?;
                args.SetResponse(&refused)?;
            }
            Ok(())
        }));
        let mut token = 0;
        core.add_WebResourceRequested(&handler, &raw mut token)
    }
}
