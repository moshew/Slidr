//! Full screen for the show (PRS-01), as one change of the window.
//!
//! A maximized window without an OS frame keeps the room it leaves for the taskbar when it is
//! told to go full screen, so it has to stop being maximized first, and be maximized again
//! afterwards. Asked for from the webview those are separate calls: the window is seen at its
//! smaller size between them, and Windows animates each, on the way in and on the way out.
//! Here they run together on the main thread, with the animations of the window off, and on
//! Windows the window never has the smaller size at all.

use tauri::{Runtime, Window};

use crate::error::{AppError, Result};

#[cfg(windows)]
// A few calls into Win32: one of the app's four places for `unsafe`, with
// `capture/webview2.rs`, `import_window/network.rs` and `fonts/directwrite.rs`.
#[allow(unsafe_code)]
mod win32;

/// `show_screen_set({ full, maximized })`: the window goes full screen, or back.
///
/// Going in, the answer is whether the window was maximized; going back, `maximized` is that
/// answer, and the window is maximized again.
#[tauri::command]
pub async fn show_screen_set<R: Runtime>(
    window: Window<R>,
    full: bool,
    maximized: bool,
) -> Result<bool> {
    let (done, changed) = tokio::sync::oneshot::channel();
    let target = window.clone();
    window
        .run_on_main_thread(move || {
            let _ = done.send(change(&target, full, maximized));
        })
        .map_err(AppError::internal)?;
    changed.await.map_err(AppError::internal)?
}

/// On the main thread, where each call to the window is done when it returns.
fn change<R: Runtime>(window: &Window<R>, full: bool, maximized: bool) -> Result<bool> {
    #[cfg(windows)]
    let _still = window.hwnd().ok().map(win32::Still::hold);
    let steps = || -> tauri::Result<bool> {
        if full {
            let was_maximized = window.is_maximized()?;
            if was_maximized && !restored_over_screen(window) {
                window.unmaximize()?;
            }
            window.set_fullscreen(true)?;
            Ok(was_maximized)
        } else {
            window.set_fullscreen(false)?;
            if maximized && !maximized_back(window) {
                window.maximize()?;
            }
            Ok(false)
        }
    };
    steps().map_err(AppError::internal)
}

/// The maximized window is over its whole screen already, so that full screen changes only its
/// height by the taskbar's. False where that cannot be done, and it is restored the usual way.
fn restored_over_screen<R: Runtime>(window: &Window<R>) -> bool {
    #[cfg(windows)]
    let done = window.hwnd().is_ok_and(win32::restore_over_screen);
    #[cfg(not(windows))]
    let done = {
        let _ = window;
        false
    };
    done
}

/// Maximized again from the whole screen, at once. False where that cannot be done.
fn maximized_back<R: Runtime>(window: &Window<R>) -> bool {
    #[cfg(windows)]
    let done = window.hwnd().is_ok_and(win32::maximize_back);
    #[cfg(not(windows))]
    let done = {
        let _ = window;
        false
    };
    done
}
