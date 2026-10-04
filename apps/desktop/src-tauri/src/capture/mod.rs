//! Slide capture to PNG (RND-04, ADR-003): a slide is drawn by `SlideRenderer` in a window that is
//! never shown, and Rust takes the picture with `Page.captureScreenshot` of the WebView2 DevTools
//! protocol.
//!
//! ```text
//! capture_slide ──► CaptureService (one capture at a time)
//!   1. the window: created on first use, label "capture", loads capture.html
//!   2. wait for capture_page_loaded (cold start)
//!   3. eval window.__slidrCapture(id, { deck, assetsDir })  ──►  page renders, settles
//!   4. wait for capture_ready(id, dpr, error)               ◄──
//!   5. Page.captureScreenshot of the 960×540 surface at clip.scale = width / (960 × dpr)
//! ```
//!
//! The page draws the slide at 50% (`ScaledSlide`, 960×540 CSS px) and the clip scales it back
//! up: text at an untransformed 100% is drawn with LCD anti-aliasing, which the editor never
//! shows (ADR-003 condition 6). A browser flag would do the same, but every window shares one
//! WebView2 environment, so it would change the editor too.
//!
//! The same window runs jobs for the main one (ADR-027): work that has to draw on a page and
//! take pictures of it, which the user must not see happen in the editor. The HTML conversion
//! engine is the one job today. Rust carries a job to the page and its answer back, and knows
//! nothing of what is in either:
//!
//! ```text
//! capture_run_job ──► CaptureService (the same one-at-a-time turn as captures)
//!   1. the window, as above
//!   2. eval window.__slidrJob(id)                 ──►  page: capture_job_take(id) ──► the job
//!   3. while it works, the page pictures itself:   ◄──  capture_clip(rect, dpr)
//!   4. wait for capture_job_done(id, result | error)
//! ```
//!
//! `capture_clip` is on its own a command of any window: a PNG of a rectangle of the webview
//! that calls it, one pixel per CSS pixel.

#[cfg(windows)]
#[allow(unsafe_code)]
// The COM call into WebView2 (ADR-003, "מחיר"); `import_window/network.rs` and
// `fonts/directwrite.rs` are the other two.
mod webview2;

use std::{
    fmt,
    path::Path,
    sync::{
        Arc, Mutex, MutexGuard, PoisonError,
        atomic::{AtomicU64, Ordering},
    },
    time::Duration,
};

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tauri::{
    AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder, Window, WindowEvent, ipc::Response,
};
use tokio::{
    sync::{oneshot, watch},
    time::timeout,
};

use crate::storage::Storage;

/// The capture window's label. Only that webview may report a page load or a ready slide.
pub const CAPTURE_LABEL: &str = "capture";
/// The main window: when it goes, the hidden capture window must not keep the app alive.
const MAIN_LABEL: &str = "main";
/// The surface the page draws on, in CSS px: the slide at 50%.
const SURFACE_WIDTH: f64 = 960.0;
const SURFACE_HEIGHT: f64 = 540.0;
/// RND-04: 960×540 for the agent; export and `thumbs/` ask for 1920.
const DEFAULT_WIDTH: u32 = 960;
const MIN_WIDTH: u32 = 16;
const MAX_WIDTH: u32 = 3840;
/// The first capture creates the window and loads the page, fonts and bundle (cold start).
const PAGE_LOAD_TIMEOUT: Duration = Duration::from_secs(20);
/// A rendered slide reports ready within this, or the capture fails.
const READY_TIMEOUT: Duration = Duration::from_secs(10);
/// One DevTools call.
const SCREENSHOT_TIMEOUT: Duration = Duration::from_secs(10);
/// A job answers within this, or fails. Under the 60 s a tool call may take (ADR-022), so the
/// agent reads why its call failed instead of a timeout.
const JOB_TIMEOUT: Duration = Duration::from_secs(50);
/// The longest side of a clip, in CSS px: four slides side by side.
const MAX_CLIP_SIDE: f64 = 7680.0;

pub type Result<T> = std::result::Result<T, CaptureError>;

/// Closed set of failure categories.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CaptureErrorKind {
    /// A malformed request: no slide or more than one, a width out of range.
    InvalidInput,
    /// The workspace named in the request is not open.
    UnknownWorkspace,
    /// Not on this platform: the capture is WebView2's (SPEC appendix C).
    Unsupported,
    /// The page did not load, or the slide did not settle, in time.
    Timeout,
    /// The page could not render the slide.
    RenderFailed,
    /// WebView2 refused or failed the screenshot.
    CaptureFailed,
    /// A bug on the Rust side.
    Internal,
}

/// As the webview receives it: `{ kind, message }`, like the other commands' errors.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CaptureError {
    pub kind: CaptureErrorKind,
    pub message: String,
}

impl CaptureError {
    fn new(kind: CaptureErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }

    fn invalid(message: impl Into<String>) -> Self {
        Self::new(CaptureErrorKind::InvalidInput, message)
    }

    fn internal(message: impl fmt::Display) -> Self {
        Self::new(CaptureErrorKind::Internal, message.to_string())
    }
}

impl fmt::Display for CaptureError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for CaptureError {}

/// What `capture_slide` takes: the slide inside the parts of the deck it renders from (theme,
/// layouts, assets, meta, size) with `slides` holding that one slide only, so a capture costs the
/// same in a 200-slide deck. Rust does not interpret the deck beyond that check.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureRequest {
    pub deck: Value,
    /// The open workspace whose `assets/` the slide's assets are in; none for a deck without
    /// asset files.
    #[serde(default)]
    pub workspace_id: Option<String>,
}

impl CaptureRequest {
    fn validate(&self) -> Result<()> {
        let slides = self.deck["slides"]
            .as_array()
            .ok_or_else(|| CaptureError::invalid("the request's deck has no slides array"))?;
        match slides.as_slice() {
            [slide] if slide["id"].is_string() => Ok(()),
            [_] => Err(CaptureError::invalid("the slide has no id")),
            _ => Err(CaptureError::invalid(format!(
                "the request's deck must hold exactly the slide to capture, not {}",
                slides.len()
            ))),
        }
    }
}

fn check_width(width: u32) -> Result<u32> {
    if (MIN_WIDTH..=MAX_WIDTH).contains(&width) {
        Ok(width)
    } else {
        Err(CaptureError::invalid(format!(
            "width {width} is outside {MIN_WIDTH}..={MAX_WIDTH}"
        )))
    }
}

/// ADR-003 condition 4: the output is `width` device pixels wide whatever the display scale.
fn clip_scale(width: u32, device_pixel_ratio: f64) -> f64 {
    f64::from(width) / (SURFACE_WIDTH * device_pixel_ratio)
}

/// `Page.captureScreenshot` parameters (ADR-003 conditions 3–5). `fast` (`optimizeForSpeed`):
/// same pixels, faster, a larger PNG; for the agent, not for files kept in the deck.
fn screenshot_params(width: u32, device_pixel_ratio: f64, fast: bool) -> Value {
    json!({
        "format": "png",
        "fromSurface": true,
        "captureBeyondViewport": true,
        "optimizeForSpeed": fast,
        "clip": {
            "x": 0,
            "y": 0,
            "width": SURFACE_WIDTH,
            "height": SURFACE_HEIGHT,
            "scale": clip_scale(width, device_pixel_ratio),
        },
    })
}

/// The script that hands a request to the page. The payload is re-serialized JSON, so it is a
/// literal and nothing else.
fn page_script(id: u64, deck: &Value, assets_dir: Option<&Path>) -> String {
    let payload = json!({
        "deck": deck,
        "assetsDir": assets_dir.map(|dir| dir.to_string_lossy()),
    });
    format!("window.__slidrCapture({id}, {payload})")
}

/// Width and height from a PNG's IHDR chunk.
#[cfg_attr(not(windows), allow(dead_code))]
fn png_size(png: &[u8]) -> Option<(u32, u32)> {
    const SIGNATURE: [u8; 8] = [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];
    if png.get(..8)? != SIGNATURE || png.get(12..16)? != b"IHDR" {
        return None;
    }
    let word = |at: usize| Some(u32::from_be_bytes(png.get(at..at + 4)?.try_into().ok()?));
    Some((word(16)?, word(20)?))
}

/// What a page reports for a request.
#[derive(Debug)]
struct Ready {
    device_pixel_ratio: f64,
    error: Option<String>,
}

/// A job in the capture page: what the page takes, and who waits for its answer.
struct Job {
    id: u64,
    /// Handed to the page once, by `capture_job_take`.
    payload: Option<Value>,
    done: oneshot::Sender<std::result::Result<Value, String>>,
}

/// A rectangle of a page, in CSS px of its viewport.
#[derive(Debug, Clone, Copy, PartialEq, Deserialize)]
pub struct ClipRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl ClipRect {
    fn validate(&self) -> Result<()> {
        let sides = [self.width, self.height];
        let corner = [self.x, self.y];
        let ok = sides.iter().all(|s| (1.0..=MAX_CLIP_SIDE).contains(s))
            && corner.iter().all(|c| (0.0..=MAX_CLIP_SIDE).contains(c));
        if ok {
            Ok(())
        } else {
            Err(CaptureError::invalid(format!(
                "the clip {self:?} is not a rectangle of 1..={MAX_CLIP_SIDE} px on the page"
            )))
        }
    }
}

/// `Page.captureScreenshot` parameters for a rectangle of a page as it is: one pixel per CSS
/// pixel at any display scale (ADR-003 condition 4), also where the page is larger than its
/// window.
fn clip_params(rect: ClipRect, device_pixel_ratio: f64) -> Value {
    json!({
        "format": "png",
        "fromSurface": true,
        "captureBeyondViewport": true,
        "optimizeForSpeed": true,
        "clip": {
            "x": rect.x,
            "y": rect.y,
            "width": rect.width,
            "height": rect.height,
            "scale": 1.0 / device_pixel_ratio,
        },
    })
}

/// The display scale a page reported, or 1 when it reported nonsense.
fn display_scale(device_pixel_ratio: f64) -> f64 {
    if device_pixel_ratio.is_finite() && device_pixel_ratio > 0.0 {
        device_pixel_ratio
    } else {
        1.0
    }
}

/// What a capture needs from its window. The app's is the hidden webview; the tests' a fake.
trait Surface {
    fn exists(&self) -> bool;
    fn create(&self) -> Result<()>;
    /// Runs `script` in the page.
    fn deliver(&self, script: String) -> Result<()>;
    async fn screenshot(&self, params: Value) -> Result<Vec<u8>>;
}

/// The capture window's state, shared by the commands.
pub struct CaptureService {
    /// One capture at a time: there is one window and one slide on it.
    turn: tokio::sync::Mutex<()>,
    /// The page has loaded and listens for requests.
    loaded: watch::Sender<bool>,
    /// The request waiting for its `capture_ready`.
    pending: Mutex<Option<(u64, oneshot::Sender<Ready>)>>,
    /// The job the page is working on.
    job: Mutex<Option<Job>>,
    next_id: AtomicU64,
}

impl Default for CaptureService {
    fn default() -> Self {
        Self::new()
    }
}

impl CaptureService {
    pub fn new() -> Self {
        Self {
            turn: tokio::sync::Mutex::new(()),
            loaded: watch::Sender::new(false),
            pending: Mutex::new(None),
            job: Mutex::new(None),
            next_id: AtomicU64::new(1),
        }
    }

    async fn capture<S: Surface>(
        &self,
        surface: &S,
        request: &CaptureRequest,
        assets_dir: Option<&Path>,
        width: u32,
        fast: bool,
    ) -> Result<Vec<u8>> {
        request.validate()?;
        let width = check_width(width)?;
        let _turn = self.turn.lock().await;
        self.ensure_page(surface).await?;

        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let (sender, receiver) = oneshot::channel();
        *lock(&self.pending) = Some((id, sender));
        surface.deliver(page_script(id, &request.deck, assets_dir))?;
        let ready = match timeout(READY_TIMEOUT, receiver).await {
            Ok(Ok(ready)) => ready,
            Ok(Err(_)) => return Err(CaptureError::internal("the ready signal was dropped")),
            Err(_) => {
                lock(&self.pending).take();
                return Err(CaptureError::new(
                    CaptureErrorKind::Timeout,
                    format!("the slide did not finish rendering within {READY_TIMEOUT:?}"),
                ));
            }
        };
        if let Some(error) = ready.error {
            return Err(CaptureError::new(CaptureErrorKind::RenderFailed, error));
        }
        let dpr = display_scale(ready.device_pixel_ratio);
        surface
            .screenshot(screenshot_params(width, dpr, fast))
            .await
    }

    /// The window, created on first use, with its page loaded. Called with the turn held.
    async fn ensure_page<S: Surface>(&self, surface: &S) -> Result<()> {
        if !surface.exists() {
            self.loaded.send_replace(false);
            surface.create()?;
        }
        let mut loaded = self.loaded.subscribe();
        if timeout(PAGE_LOAD_TIMEOUT, loaded.wait_for(|loaded| *loaded))
            .await
            .is_err()
        {
            return Err(CaptureError::new(
                CaptureErrorKind::Timeout,
                format!("the capture page did not load within {PAGE_LOAD_TIMEOUT:?}"),
            ));
        }
        Ok(())
    }

    /// Runs a job in the capture page and returns the page's answer. `job` is the main window's
    /// and is not read here; the page receives it with the workspace's `assets/` folder beside
    /// it. Jobs and captures share the window, so they run one at a time.
    async fn run_job<S: Surface>(
        &self,
        surface: &S,
        job: Value,
        assets_dir: Option<&Path>,
    ) -> Result<Value> {
        let _turn = self.turn.lock().await;
        self.ensure_page(surface).await?;

        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let (sender, receiver) = oneshot::channel();
        let payload = json!({
            "job": job,
            "assetsDir": assets_dir.map(|dir| dir.to_string_lossy()),
        });
        *lock(&self.job) = Some(Job {
            id,
            payload: Some(payload),
            done: sender,
        });
        // Only the id travels in the script: a job can be megabytes of HTML, and the page
        // fetches it over IPC.
        surface.deliver(format!("window.__slidrJob({id})"))?;
        match timeout(JOB_TIMEOUT, receiver).await {
            Ok(Ok(Ok(result))) => Ok(result),
            Ok(Ok(Err(error))) => Err(CaptureError::new(CaptureErrorKind::RenderFailed, error)),
            Ok(Err(_)) => Err(CaptureError::internal("the job's answer was dropped")),
            Err(_) => {
                lock(&self.job).take();
                Err(CaptureError::new(
                    CaptureErrorKind::Timeout,
                    format!("the capture page did not finish the job within {JOB_TIMEOUT:?}"),
                ))
            }
        }
    }

    /// The job the page was told about, handed over once.
    fn take_job(&self, id: u64) -> Result<Value> {
        match lock(&self.job).as_mut() {
            Some(job) if job.id == id => job
                .payload
                .take()
                .ok_or_else(|| CaptureError::invalid(format!("job {id} was already taken"))),
            _ => Err(CaptureError::invalid(format!(
                "job {id} is not waiting: it timed out, or was never started"
            ))),
        }
    }

    /// The page's answer to a job. One for a job that already timed out is dropped.
    fn finish_job(&self, id: u64, outcome: std::result::Result<Value, String>) {
        let mut job = lock(&self.job);
        if job.as_ref().is_some_and(|waiting| waiting.id == id)
            && let Some(job) = job.take()
        {
            let _ = job.done.send(outcome);
        }
    }

    fn page_loaded(&self) {
        self.loaded.send_replace(true);
    }

    /// A page's answer. One for an earlier request that already timed out is dropped.
    fn ready(&self, id: u64, ready: Ready) {
        let mut pending = lock(&self.pending);
        if pending.as_ref().is_some_and(|(waiting, _)| *waiting == id)
            && let Some((_, sender)) = pending.take()
        {
            let _ = sender.send(ready);
        }
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

/// The hidden capture window of the running app.
struct AppSurface<'a> {
    app: &'a AppHandle,
}

impl Surface for AppSurface<'_> {
    fn exists(&self) -> bool {
        self.app.get_webview_window(CAPTURE_LABEL).is_some()
    }

    /// ADR-003 condition 2: a window never shown captures the new content right away. Built from
    /// an async command, which is what WebView2 needs on Windows.
    fn create(&self) -> Result<()> {
        WebviewWindowBuilder::new(
            self.app,
            CAPTURE_LABEL,
            WebviewUrl::App("capture.html".into()),
        )
        .title("Slidr capture")
        .visible(false)
        .focused(false)
        .skip_taskbar(true)
        .decorations(false)
        .inner_size(SURFACE_WIDTH, SURFACE_HEIGHT)
        .build()
        .map(drop)
        .map_err(|e| CaptureError::internal(format!("could not create the capture window: {e}")))
    }

    fn deliver(&self, script: String) -> Result<()> {
        let window = self
            .app
            .get_webview_window(CAPTURE_LABEL)
            .ok_or_else(|| CaptureError::internal("the capture window is gone"))?;
        window
            .eval(script)
            .map_err(|e| CaptureError::internal(format!("could not reach the capture page: {e}")))
    }

    async fn screenshot(&self, params: Value) -> Result<Vec<u8>> {
        let window = self
            .app
            .get_webview_window(CAPTURE_LABEL)
            .ok_or_else(|| CaptureError::internal("the capture window is gone"))?;
        screenshot(&window, params).await
    }
}

/// `Page.captureScreenshot` of a window's webview, as PNG bytes.
#[cfg(windows)]
async fn screenshot(window: &tauri::WebviewWindow, params: Value) -> Result<Vec<u8>> {
    let result = webview2::call(
        window,
        "Page.captureScreenshot",
        &params,
        SCREENSHOT_TIMEOUT,
    )
    .await
    .map_err(|e| CaptureError::new(CaptureErrorKind::CaptureFailed, e))?;
    let data = result["data"].as_str().ok_or_else(|| {
        CaptureError::new(
            CaptureErrorKind::CaptureFailed,
            "the screenshot has no data",
        )
    })?;
    webview2::decode_png(data).map_err(|e| CaptureError::new(CaptureErrorKind::CaptureFailed, e))
}

#[cfg(not(windows))]
async fn screenshot(_window: &tauri::WebviewWindow, _params: Value) -> Result<Vec<u8>> {
    Err(unsupported())
}

fn unsupported() -> CaptureError {
    CaptureError::new(
        CaptureErrorKind::Unsupported,
        "slide capture uses WebView2 and is available on Windows only",
    )
}

/// `capture_slide({ request, width?, fast? })`: the slide as PNG bytes, `width` pixels wide
/// (default 960) and 9/16 of that high. The answer is the raw bytes, not JSON.
#[tauri::command]
pub async fn capture_slide(
    app: AppHandle,
    service: State<'_, Arc<CaptureService>>,
    storage: State<'_, Arc<Storage>>,
    request: CaptureRequest,
    width: Option<u32>,
    fast: Option<bool>,
) -> Result<Response> {
    if cfg!(not(windows)) {
        return Err(unsupported());
    }
    let assets_dir = match &request.workspace_id {
        Some(id) => Some(
            storage
                .assets_dir(id)
                .map_err(|e| CaptureError::new(CaptureErrorKind::UnknownWorkspace, e.message))?,
        ),
        None => None,
    };
    let png = service
        .capture(
            &AppSurface { app: &app },
            &request,
            assets_dir.as_deref(),
            width.unwrap_or(DEFAULT_WIDTH),
            fast.unwrap_or(false),
        )
        .await?;
    Ok(Response::new(png))
}

/// `capture_page_loaded()`: from the capture page, once it listens for requests.
#[tauri::command]
pub fn capture_page_loaded(
    webview: tauri::Webview,
    service: State<'_, Arc<CaptureService>>,
) -> Result<()> {
    from_capture_page(&webview)?;
    service.page_loaded();
    Ok(())
}

/// `capture_ready({ id, dpr, error? })`: from the capture page, once the slide has settled.
#[tauri::command]
pub fn capture_ready(
    webview: tauri::Webview,
    service: State<'_, Arc<CaptureService>>,
    id: u64,
    dpr: f64,
    error: Option<String>,
) -> Result<()> {
    from_capture_page(&webview)?;
    service.ready(
        id,
        Ready {
            device_pixel_ratio: dpr,
            error,
        },
    );
    Ok(())
}

/// `capture_run_job({ job, workspaceId? })`: runs a job in the capture page (an HTML conversion,
/// ADR-027) and returns its result. `workspaceId` names the open workspace whose `assets/` the
/// job reads and stores in.
#[tauri::command]
pub async fn capture_run_job(
    app: AppHandle,
    service: State<'_, Arc<CaptureService>>,
    storage: State<'_, Arc<Storage>>,
    job: Value,
    workspace_id: Option<String>,
) -> Result<Value> {
    if cfg!(not(windows)) {
        return Err(unsupported());
    }
    let assets_dir = match &workspace_id {
        Some(id) => Some(
            storage
                .assets_dir(id)
                .map_err(|e| CaptureError::new(CaptureErrorKind::UnknownWorkspace, e.message))?,
        ),
        None => None,
    };
    service
        .run_job(&AppSurface { app: &app }, job, assets_dir.as_deref())
        .await
}

/// `capture_job_take({ id })`: from the capture page, the job it was told about:
/// `{ job, assetsDir }`.
#[tauri::command]
pub fn capture_job_take(
    webview: tauri::Webview,
    service: State<'_, Arc<CaptureService>>,
    id: u64,
) -> Result<Value> {
    from_capture_page(&webview)?;
    service.take_job(id)
}

/// `capture_job_done({ id, result?, error? })`: from the capture page, the job's answer.
#[tauri::command]
pub fn capture_job_done(
    webview: tauri::Webview,
    service: State<'_, Arc<CaptureService>>,
    id: u64,
    result: Option<Value>,
    error: Option<String>,
) -> Result<()> {
    from_capture_page(&webview)?;
    service.finish_job(
        id,
        match error {
            Some(error) => Err(error),
            None => Ok(result.unwrap_or(Value::Null)),
        },
    );
    Ok(())
}

/// `capture_clip({ rect, dpr })`: a PNG of a rectangle of the webview that calls it, one pixel
/// per CSS pixel. `rect` is in CSS px of the page; `dpr` is the page's `devicePixelRatio`. The
/// answer is the raw bytes, not JSON. This is what the conversion engine's host pictures its
/// work surface with (ADR-017), in whichever window the engine runs.
#[tauri::command]
pub async fn capture_clip(
    window: tauri::WebviewWindow,
    rect: ClipRect,
    dpr: f64,
) -> Result<Response> {
    rect.validate()?;
    let png = screenshot(&window, clip_params(rect, display_scale(dpr))).await?;
    Ok(Response::new(png))
}

fn from_capture_page(webview: &tauri::Webview) -> Result<()> {
    if webview.label() == CAPTURE_LABEL {
        Ok(())
    } else {
        Err(CaptureError::invalid("only the capture page may report"))
    }
}

/// Closes the capture window with the main one; a hidden window would keep the app running.
pub fn on_window_event(window: &Window, event: &WindowEvent) {
    if window.label() == MAIN_LABEL
        && matches!(event, WindowEvent::Destroyed)
        && let Some(capture) = window.app_handle().get_webview_window(CAPTURE_LABEL)
    {
        let _ = capture.destroy();
    }
}

#[cfg(test)]
mod tests {
    use std::cell::{Cell, RefCell};

    use tokio::sync::mpsc;

    use super::*;

    type TestResult = std::result::Result<(), Box<dyn std::error::Error>>;

    fn deck(slides: Value) -> CaptureRequest {
        CaptureRequest {
            deck: json!({ "id": "d", "theme": {}, "layouts": [], "assets": {}, "slides": slides }),
            workspace_id: None,
        }
    }

    fn one_slide() -> CaptureRequest {
        deck(json!([{ "id": "s_1", "elements": [] }]))
    }

    #[test]
    fn a_request_holds_exactly_the_slide() -> TestResult {
        assert!(one_slide().validate().is_ok());
        for bad in [
            deck(json!([])),
            deck(json!([{ "id": "s_1" }, { "id": "s_2" }])),
            deck(json!([{ "elements": [] }])),
            CaptureRequest {
                deck: json!("not a deck"),
                workspace_id: None,
            },
        ] {
            assert_eq!(
                bad.validate().err().map(|e| e.kind),
                Some(CaptureErrorKind::InvalidInput)
            );
        }
        let parsed: CaptureRequest =
            serde_json::from_value(json!({ "deck": { "slides": [] }, "workspaceId": "w1" }))?;
        assert_eq!(parsed.workspace_id.as_deref(), Some("w1"));
        Ok(())
    }

    #[test]
    fn widths_are_bounded() {
        assert_eq!(check_width(960).ok(), Some(960));
        assert_eq!(check_width(1920).ok(), Some(1920));
        assert!(check_width(0).is_err());
        assert!(check_width(MAX_WIDTH + 1).is_err());
    }

    /// The surface is 960 CSS px wide; the output is `width` device pixels at any display scale.
    #[test]
    fn clip_scale_divides_by_the_display_scale() {
        let cases = [
            (960, 1.0, 1.0),
            (1920, 1.0, 2.0),
            (960, 1.25, 0.8),
            (1920, 1.5, 4.0 / 3.0),
            (1920, 2.0, 1.0),
        ];
        for (width, dpr, scale) in cases {
            let got = clip_scale(width, dpr);
            assert!((got - scale).abs() < 1e-12, "{width} at {dpr}: {got}");
            // What Chromium draws: the clip in device pixels times the scale.
            let pixels = SURFACE_WIDTH * dpr * got;
            assert!((pixels - f64::from(width)).abs() < 1e-9);
        }
    }

    #[test]
    fn screenshot_parameters() {
        assert_eq!(
            screenshot_params(1920, 1.25, true),
            json!({
                "format": "png", "fromSurface": true, "captureBeyondViewport": true,
                "optimizeForSpeed": true,
                "clip": { "x": 0, "y": 0, "width": 960.0, "height": 540.0, "scale": 1.6 }
            })
        );
        assert_eq!(
            screenshot_params(960, 1.0, false)["optimizeForSpeed"],
            false
        );
    }

    #[test]
    fn the_page_script_carries_a_json_literal() -> TestResult {
        let request = deck(json!([{ "id": "s_1", "name": "x'); alert(1); ('</script>\u{2028}" }]));
        let script = page_script(7, &request.deck, Some(Path::new("C:/w/assets")));
        let payload = script
            .strip_prefix("window.__slidrCapture(7, ")
            .and_then(|rest| rest.strip_suffix(')'))
            .ok_or("unexpected script shape")?;
        let parsed: Value = serde_json::from_str(payload)?;
        assert_eq!(parsed["deck"], request.deck);
        assert_eq!(parsed["assetsDir"], "C:/w/assets");
        let none = page_script(8, &request.deck, None);
        assert!(none.contains("\"assetsDir\":null"));
        Ok(())
    }

    #[test]
    fn png_size_reads_the_header() {
        let mut png = vec![0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13];
        png.extend_from_slice(b"IHDR");
        png.extend_from_slice(&960u32.to_be_bytes());
        png.extend_from_slice(&540u32.to_be_bytes());
        assert_eq!(png_size(&png), Some((960, 540)));
        assert_eq!(png_size(b"GIF89a"), None);
        assert_eq!(png_size(&png[..20]), None);
    }

    /// A window that hands every delivered script to the test, and answers screenshots with the
    /// parameters it got.
    struct FakeSurface {
        exists: Cell<bool>,
        created: Cell<u32>,
        scripts: mpsc::UnboundedSender<String>,
        shots: RefCell<Vec<Value>>,
    }

    impl FakeSurface {
        fn new() -> (Self, mpsc::UnboundedReceiver<String>) {
            let (scripts, received) = mpsc::unbounded_channel();
            let surface = Self {
                exists: Cell::new(false),
                created: Cell::new(0),
                scripts,
                shots: RefCell::new(Vec::new()),
            };
            (surface, received)
        }
    }

    impl Surface for FakeSurface {
        fn exists(&self) -> bool {
            self.exists.get()
        }

        fn create(&self) -> Result<()> {
            self.exists.set(true);
            self.created.set(self.created.get() + 1);
            Ok(())
        }

        fn deliver(&self, script: String) -> Result<()> {
            self.scripts.send(script).map_err(CaptureError::internal)
        }

        async fn screenshot(&self, params: Value) -> Result<Vec<u8>> {
            tokio::time::sleep(Duration::from_millis(100)).await;
            self.shots.borrow_mut().push(params.clone());
            Ok(params["clip"]["scale"].to_string().into_bytes())
        }
    }

    fn request_id(script: &str) -> u64 {
        script
            .trim_start_matches("window.__slidrCapture(")
            .split(',')
            .next()
            .and_then(|id| id.parse().ok())
            .unwrap_or(0)
    }

    fn ready(dpr: f64) -> Ready {
        Ready {
            device_pixel_ratio: dpr,
            error: None,
        }
    }

    /// The first capture waits out the cold start; two captures asked together run one after the
    /// other; the page's display scale sets the clip.
    #[tokio::test(start_paused = true)]
    async fn captures_wait_for_the_page_and_run_one_at_a_time() -> TestResult {
        let service = CaptureService::new();
        let (surface, mut scripts) = FakeSurface::new();
        let request = one_slide();
        let first = service.capture(&surface, &request, None, 960, false);
        let second = service.capture(&surface, &request, None, 1920, true);
        let page = async {
            tokio::time::sleep(Duration::from_secs(5)).await;
            service.page_loaded();
            let script = scripts.recv().await.unwrap_or_default();
            // While the first slide renders, the second request has not been sent.
            tokio::time::sleep(Duration::from_secs(1)).await;
            assert!(scripts.try_recv().is_err());
            service.ready(request_id(&script), ready(1.25));
            let script = scripts.recv().await.unwrap_or_default();
            service.ready(request_id(&script), ready(1.25));
        };
        let (first, second, ()) = tokio::join!(first, second, page);
        assert_eq!(first?, b"0.8");
        assert_eq!(second?, b"1.6");
        assert_eq!(surface.created.get(), 1);
        let shots = surface.shots.borrow();
        assert_eq!(
            [&shots[0]["optimizeForSpeed"], &shots[1]["optimizeForSpeed"]],
            [&json!(false), &json!(true)]
        );
        Ok(())
    }

    #[tokio::test(start_paused = true)]
    async fn a_page_that_never_loads_or_never_settles_times_out() -> TestResult {
        let service = CaptureService::new();
        let (surface, mut scripts) = FakeSurface::new();
        let request = one_slide();

        let started = tokio::time::Instant::now();
        let cold = service.capture(&surface, &request, None, 960, false).await;
        assert_eq!(cold.err().map(|e| e.kind), Some(CaptureErrorKind::Timeout));
        assert!(started.elapsed() >= PAGE_LOAD_TIMEOUT);

        service.page_loaded();
        let started = tokio::time::Instant::now();
        let stuck = service.capture(&surface, &request, None, 960, false).await;
        assert_eq!(stuck.err().map(|e| e.kind), Some(CaptureErrorKind::Timeout));
        assert!(started.elapsed() >= READY_TIMEOUT);
        let late = scripts.recv().await.unwrap_or_default();

        // The late answer is dropped; the next capture gets its own.
        let next = service.capture(&surface, &request, None, 960, false);
        let page = async {
            service.ready(request_id(&late), ready(1.0));
            let script = scripts.recv().await.unwrap_or_default();
            service.ready(request_id(&script), ready(1.0));
        };
        let (next, ()) = tokio::join!(next, page);
        assert_eq!(next?, b"1.0");
        Ok(())
    }

    #[tokio::test(start_paused = true)]
    async fn render_errors_and_bad_requests_fail_cleanly() -> TestResult {
        let service = CaptureService::new();
        let (surface, mut scripts) = FakeSurface::new();
        service.page_loaded();
        surface.exists.set(true);
        let request = one_slide();
        let capture = service.capture(&surface, &request, None, 960, false);
        let page = async {
            let script = scripts.recv().await.unwrap_or_default();
            service.ready(
                request_id(&script),
                Ready {
                    device_pixel_ratio: 1.0,
                    error: Some("the slide failed to render".into()),
                },
            );
        };
        let (failed, ()) = tokio::join!(capture, page);
        assert_eq!(
            failed.err(),
            Some(CaptureError::new(
                CaptureErrorKind::RenderFailed,
                "the slide failed to render"
            ))
        );
        let two = deck(json!([{ "id": "a" }, { "id": "b" }]));
        let rejected = service.capture(&surface, &two, None, 960, false).await;
        assert_eq!(
            rejected.err().map(|e| e.kind),
            Some(CaptureErrorKind::InvalidInput)
        );
        let wide = service
            .capture(&surface, &one_slide(), None, 10_000, false)
            .await;
        assert_eq!(
            wide.err().map(|e| e.kind),
            Some(CaptureErrorKind::InvalidInput)
        );
        assert!(
            scripts.try_recv().is_err(),
            "nothing was sent for a bad request"
        );
        Ok(())
    }

    /// A clip is the page as it is: one picture pixel per CSS pixel at any display scale.
    #[test]
    fn clips_are_one_pixel_per_css_pixel() {
        let slide = ClipRect {
            x: 0.0,
            y: 0.0,
            width: 1920.0,
            height: 1080.0,
        };
        assert!(slide.validate().is_ok());
        assert_eq!(
            clip_params(slide, 1.25),
            json!({
                "format": "png", "fromSurface": true, "captureBeyondViewport": true,
                "optimizeForSpeed": true,
                "clip": { "x": 0.0, "y": 0.0, "width": 1920.0, "height": 1080.0, "scale": 0.8 }
            })
        );
        assert_eq!(clip_params(slide, 1.0)["clip"]["scale"], 1.0);
        for bad in [
            ClipRect {
                width: 0.0,
                ..slide
            },
            ClipRect {
                height: -4.0,
                ..slide
            },
            ClipRect { x: -1.0, ..slide },
            ClipRect {
                width: f64::NAN,
                ..slide
            },
            ClipRect {
                y: f64::INFINITY,
                ..slide
            },
            ClipRect {
                width: MAX_CLIP_SIDE + 1.0,
                ..slide
            },
        ] {
            assert_eq!(
                bad.validate().err().map(|e| e.kind),
                Some(CaptureErrorKind::InvalidInput),
                "{bad:?}"
            );
        }
        assert!((display_scale(1.5) - 1.5).abs() < f64::EPSILON);
        for nonsense in [0.0, -1.0, f64::NAN, f64::INFINITY] {
            assert!((display_scale(nonsense) - 1.0).abs() < f64::EPSILON);
        }
    }

    fn job_id(script: &str) -> u64 {
        script
            .strip_prefix("window.__slidrJob(")
            .and_then(|rest| rest.strip_suffix(')'))
            .and_then(|id| id.parse().ok())
            .unwrap_or(0)
    }

    /// A job reaches the page by id, is taken once with the assets folder beside it, and its
    /// answer, or its failure, comes back to whoever asked.
    #[tokio::test(start_paused = true)]
    async fn a_job_goes_to_the_page_and_its_answer_comes_back() -> TestResult {
        let service = CaptureService::new();
        let (surface, mut scripts) = FakeSurface::new();
        let job = json!({ "kind": "htmlToSlide", "html": "<p>שלום</p>" });

        let run = service.run_job(&surface, job.clone(), Some(Path::new("C:/w/assets")));
        let page = async {
            service.page_loaded();
            let script = scripts.recv().await.unwrap_or_default();
            // The script names the job; the job itself travels over IPC.
            assert!(!script.contains("htmlToSlide"), "{script}");
            let id = job_id(&script);
            let taken = service.take_job(id);
            assert_eq!(
                taken.ok(),
                Some(json!({ "job": job, "assetsDir": "C:/w/assets" }))
            );
            assert!(service.take_job(id).is_err(), "a job is taken once");
            assert!(service.take_job(id + 1).is_err());
            service.finish_job(id + 1, Ok(json!("someone else's")));
            service.finish_job(id, Ok(json!({ "slide": { "id": "s_1" } })));
        };
        let (done, ()) = tokio::join!(run, page);
        assert_eq!(done?, json!({ "slide": { "id": "s_1" } }));
        assert_eq!(surface.created.get(), 1);

        let run = service.run_job(&surface, job.clone(), None);
        let page = async {
            let id = job_id(&scripts.recv().await.unwrap_or_default());
            assert_eq!(
                service.take_job(id).ok(),
                Some(json!({ "job": job, "assetsDir": null }))
            );
            service.finish_job(id, Err("the sandbox frame did not load".into()));
        };
        let (failed, ()) = tokio::join!(run, page);
        assert_eq!(
            failed.err(),
            Some(CaptureError::new(
                CaptureErrorKind::RenderFailed,
                "the sandbox frame did not load"
            ))
        );
        Ok(())
    }

    /// A page that never answers fails the job in time, and its late answer is dropped.
    #[tokio::test(start_paused = true)]
    async fn a_job_the_page_never_finishes_times_out() -> TestResult {
        let service = CaptureService::new();
        let (surface, mut scripts) = FakeSurface::new();
        service.page_loaded();
        surface.exists.set(true);

        let started = tokio::time::Instant::now();
        let stuck = service.run_job(&surface, json!({}), None).await;
        assert_eq!(stuck.err().map(|e| e.kind), Some(CaptureErrorKind::Timeout));
        assert!(started.elapsed() >= JOB_TIMEOUT);
        let late = job_id(&scripts.recv().await.unwrap_or_default());
        assert!(
            service.take_job(late).is_err(),
            "a timed-out job is not handed out"
        );

        let next = service.run_job(&surface, json!({}), None);
        let page = async {
            service.finish_job(late, Ok(json!("late")));
            let id = job_id(&scripts.recv().await.unwrap_or_default());
            service.finish_job(id, Ok(json!("in time")));
        };
        let (next, ()) = tokio::join!(next, page);
        assert_eq!(next?, json!("in time"));
        Ok(())
    }

    /// There is one window: a capture asked for while a job runs waits for the job.
    #[tokio::test(start_paused = true)]
    async fn jobs_and_captures_take_turns() -> TestResult {
        let service = CaptureService::new();
        let (surface, mut scripts) = FakeSurface::new();
        service.page_loaded();
        surface.exists.set(true);
        let request = one_slide();

        let job = service.run_job(&surface, json!({}), None);
        let capture = service.capture(&surface, &request, None, 960, true);
        let page = async {
            let script = scripts.recv().await.unwrap_or_default();
            tokio::time::sleep(Duration::from_secs(2)).await;
            assert!(scripts.try_recv().is_err(), "the capture waits for the job");
            service.finish_job(job_id(&script), Ok(Value::Null));
            let script = scripts.recv().await.unwrap_or_default();
            service.ready(request_id(&script), ready(1.0));
        };
        let (job, capture, ()) = tokio::join!(job, capture, page);
        assert_eq!(job?, Value::Null);
        assert_eq!(capture?, b"1.0");
        Ok(())
    }
}
