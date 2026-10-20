//! What Tauri's window does not offer, asked of Windows itself: a change of size without an
//! animation, and a maximized window restored straight onto the whole screen. Calls into Win32
//! in windows-rs are `unsafe`; this file is one of the places the app allows it.

use std::{ffi::c_void, sync::Mutex};

use windows::{
    Win32::{
        Foundation::{HWND, RECT},
        Graphics::{
            Dwm::{DWMWA_TRANSITIONS_FORCEDISABLED, DwmSetWindowAttribute},
            Gdi::{GetMonitorInfoW, MONITOR_DEFAULTTONEAREST, MONITORINFO, MonitorFromWindow},
        },
        UI::WindowsAndMessaging::{
            GetWindowPlacement, SW_MAXIMIZE, SW_SHOWMAXIMIZED, SW_SHOWNORMAL, SetWindowPlacement,
            ShowWindow, WINDOWPLACEMENT,
        },
    },
    core::BOOL,
};

/// While this lives the window changes size without an animation.
pub struct Still(HWND);

impl Still {
    pub fn hold(window: HWND) -> Self {
        set(window, true);
        Self(window)
    }
}

impl Drop for Still {
    fn drop(&mut self) {
        set(self.0, false);
    }
}

fn set(window: HWND, disabled: bool) {
    let value = BOOL::from(disabled);
    // A refusal leaves the animations on: the change still happens, only less quietly.
    let _ = unsafe {
        DwmSetWindowAttribute(
            window,
            DWMWA_TRANSITIONS_FORCEDISABLED,
            (&raw const value).cast::<c_void>(),
            size_of::<BOOL>() as u32,
        )
    };
}

/// Where the window was before the show, with the size it has when it is not maximized: the
/// show's own placement says the whole screen there.
static BEFORE: Mutex<Option<WINDOWPLACEMENT>> = Mutex::new(None);

fn placement(window: HWND) -> Option<WINDOWPLACEMENT> {
    let mut placement = WINDOWPLACEMENT {
        length: size_of::<WINDOWPLACEMENT>() as u32,
        ..Default::default()
    };
    unsafe { GetWindowPlacement(window, &raw mut placement) }.ok()?;
    Some(placement)
}

/// The maximized window, no longer maximized and over the whole of its screen, in one step:
/// restored the usual way it would first be seen at its smaller size. False when Windows
/// refused, and the window is as it was.
pub fn restore_over_screen(window: HWND) -> bool {
    let Some(before) = placement(window) else {
        return false;
    };
    let mut info = MONITORINFO {
        cbSize: size_of::<MONITORINFO>() as u32,
        ..Default::default()
    };
    let monitor = unsafe { MonitorFromWindow(window, MONITOR_DEFAULTTONEAREST) };
    if !unsafe { GetMonitorInfoW(monitor, &raw mut info) }.as_bool() {
        return false;
    }
    let (screen, work) = (info.rcMonitor, info.rcWork);
    // A placement is measured from the corner of the work area, not of the screen: they differ
    // when the taskbar is at the top or at the left.
    let (left, top) = (
        screen.left - (work.left - screen.left),
        screen.top - (work.top - screen.top),
    );
    let over = WINDOWPLACEMENT {
        showCmd: SW_SHOWNORMAL.0 as u32,
        rcNormalPosition: RECT {
            left,
            top,
            right: left + (screen.right - screen.left),
            bottom: top + (screen.bottom - screen.top),
        },
        ..before
    };
    if unsafe { SetWindowPlacement(window, &raw const over) }.is_err() {
        return false;
    }
    if let Ok(mut kept) = BEFORE.lock() {
        *kept = Some(before);
    }
    true
}

/// Maximized again, with the smaller size it had before [`restore_over_screen`]. False when
/// there is nothing kept, or Windows refused.
pub fn maximize_back(window: HWND) -> bool {
    let Some(before) = BEFORE.lock().ok().and_then(|mut kept| kept.take()) else {
        return false;
    };
    // Maximized first, and only then given its smaller size back: a placement that asks for
    // both moves the window to the smaller size on its way (seen: one frame of it).
    let _ = unsafe { ShowWindow(window, SW_MAXIMIZE) };
    let back = WINDOWPLACEMENT {
        showCmd: SW_SHOWMAXIMIZED.0 as u32,
        ..before
    };
    unsafe { SetWindowPlacement(window, &raw const back) }.is_ok()
}
