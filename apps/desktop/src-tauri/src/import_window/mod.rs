//! The import window (SPEC 13.3, WG9-T14): a webview window that is never shown, in which an
//! imported HTML file runs together with the conversion engine. The file's scripts share a page
//! with the engine, so the window itself is the isolation boundary:
//!
//! - **Commands.** [`gate`] wraps the app's invoke handler. A call from this window passes only
//!   when its command is in [`IMPORT_WINDOW_COMMANDS`]; a command added tomorrow is closed to it
//!   until someone lists it here. Plugin commands never reach the handler: no capability names
//!   this window, so the ACL refuses them.
//! - **Network.** Every request of the window is refused unless it is the window's own page or
//!   the IPC ([`network`]); a top-level navigation away from the page is cancelled, and a new
//!   window is never opened. What was refused is kept for the import report.
//! - **Storage.** The window is an InPrivate one: the file sees no `localStorage`, cookies or
//!   databases of the app, and leaves none behind.
//! - **Data.** The file reaches the page as bytes ([`import_source`]); assets go to the
//!   workspace the session was opened for ([`import_store_asset`]), which the page cannot choose.
//!
//! Work reaches the page the way jobs reach the capture page (ADR-027). Rust carries a job and
//! its answer as opaque JSON:
//!
//! ```text
//! import_open ──► the source is copied where the agent reads it, and kept with the deck
//!                 (`source/import.html`, IMP-07); a fresh window next time
//! import_reopen ──► the same, from the copy the deck keeps: an import that is continued (IMP-09)
//! import_run_job ──► ImportService (one job at a time)
//!   1. the window: created on first use, label "import", loads import.html, network blocked
//!   2. eval window.__slidrImportJob(id)          ──►  page: import_job_take(id) ──► the job
//!   3. while it works, the page asks for:         ◄──  import_source, capture_clip,
//!                                                      import_store_asset
//!   4. wait for import_job_done(id, result | error)
//! ```
//!
//! What a job returns is data from a page that ran a stranger's scripts: the main window
//! validates it before it reaches the deck.

#[cfg(windows)]
#[allow(unsafe_code)] // The COM calls into WebView2, as in `capture/webview2.rs`.
mod network;

use std::{
    borrow::Cow,
    fmt,
    path::{Path, PathBuf},
    sync::{
        Arc, Mutex, MutexGuard, PoisonError,
        atomic::{AtomicU64, Ordering},
    },
    time::Duration,
};

use serde::Serialize;
use serde_json::Value;
use tauri::{
    AppHandle, Manager, Runtime, State, Url, WebviewUrl, WebviewWindowBuilder, Window, WindowEvent,
    ipc::{Invoke, InvokeBody, Request, Response},
};
use tokio::{
    sync::{oneshot, watch},
    time::timeout,
};

use crate::{
    assets::{self, ImportedAsset},
    error::{AppError, ErrorKind},
    harness::HarnessManager,
    storage::Storage,
};

/// The import window's label. Its calls are held to [`IMPORT_WINDOW_COMMANDS`].
pub const IMPORT_LABEL: &str = "import";
const MAIN_LABEL: &str = "main";
/// The window's page, next to the app's own.
const PAGE: &str = "import.html";

/// Everything the import window may call: reporting that its page listens, taking a job and
/// returning it, the bytes of the file being imported, a picture of itself, and saving an asset
/// to the session's workspace. Nothing else, whatever is added to the app.
pub const IMPORT_WINDOW_COMMANDS: [&str; 6] = [
    "import_page_loaded",
    "import_job_take",
    "import_job_done",
    "import_source",
    "import_store_asset",
    "capture_clip",
];

/// The page's size in CSS px. The file's own viewport is a frame inside it and may be larger:
/// pictures are taken beyond the window's edge.
const WINDOW_WIDTH: f64 = 1280.0;
const WINDOW_HEIGHT: f64 = 720.0;
const PAGE_LOAD_TIMEOUT: Duration = Duration::from_secs(20);
/// A job answers within this unless it asks for more. Under the 60 s a tool call may take
/// (ADR-022), so the agent reads why its call failed instead of a timeout.
const JOB_TIMEOUT: Duration = Duration::from_secs(50);
const MAX_JOB_TIMEOUT: Duration = Duration::from_secs(170);
/// The largest file taken for import.
const MAX_SOURCE_BYTES: u64 = 64 * 1024 * 1024;
/// How many refused URLs are kept for the report, and how much of each.
const MAX_BLOCKED: usize = 200;
const MAX_BLOCKED_URL: usize = 300;

pub type Result<T> = std::result::Result<T, ImportError>;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ImportErrorKind {
    /// A malformed request: a path that is not an HTML file, a job that is not waiting.
    InvalidInput,
    /// The file to import does not exist.
    NotFound,
    /// No import session is open.
    NoSession,
    /// The call came from a window that may not make it.
    Forbidden,
    /// Not on this platform: the window's isolation is WebView2's.
    #[cfg_attr(windows, allow(dead_code))]
    Unsupported,
    /// The page did not load, or did not finish a job, in time.
    Timeout,
    /// The page reported a failure of the job.
    JobFailed,
    /// The file system refused.
    Io,
    /// A bug on the Rust side.
    Internal,
}

/// As the webview receives it: `{ kind, message }`, like the other commands' errors.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ImportError {
    pub kind: ImportErrorKind,
    pub message: String,
}

impl ImportError {
    fn new(kind: ImportErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }

    fn invalid(message: impl Into<String>) -> Self {
        Self::new(ImportErrorKind::InvalidInput, message)
    }

    fn internal(message: impl fmt::Display) -> Self {
        Self::new(ImportErrorKind::Internal, message.to_string())
    }
}

impl fmt::Display for ImportError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for ImportError {}

/// Whether a window may call an app command. Every window but the import one may call them all,
/// as before; the import window is closed to whatever is not listed.
pub fn may_call(window: &str, command: &str) -> bool {
    window != IMPORT_LABEL || IMPORT_WINDOW_COMMANDS.contains(&command)
}

/// The one place every app command passes through on its way in: wraps the app's invoke handler
/// and refuses what [`may_call`] refuses, before the command's own code runs.
pub fn gate<R: Runtime>(
    handler: impl Fn(Invoke<R>) -> bool + Send + Sync + 'static,
) -> impl Fn(Invoke<R>) -> bool + Send + Sync + 'static {
    move |invoke| {
        let command = invoke.message.command();
        if may_call(invoke.message.webview_ref().label(), command) {
            return handler(invoke);
        }
        let refusal = ImportError::new(
            ImportErrorKind::Forbidden,
            format!("the import window may not call {command}"),
        );
        invoke.resolver.reject(refusal);
        true
    }
}

/// Whether the import window may load a URL: its own page and files, and the IPC. `home` is the
/// origin the window's page came from, e.g. `http://tauri.localhost`.
pub fn request_allowed(home: &str, url: &str) -> bool {
    const IPC: [&str; 2] = ["http://ipc.localhost/", "https://ipc.localhost/"];
    let own = url
        .strip_prefix(home)
        .is_some_and(|rest| rest.is_empty() || rest.starts_with(['/', '?', '#']));
    own || IPC.iter().any(|ipc| url.starts_with(ipc))
}

/// The answer that carries a page to the import window, before the window gets it: without the
/// app's content policy. A packaged app sends the policy of `tauri.conf.json` with every page it
/// serves (ADR-066), and here it would be laid over the import page's own. A browser then allows
/// only what both allow, and a file being imported needs what the app's pages are refused: its
/// own inline scripts, `eval`, a frame of a `blob:`. The import failed that way in a packaged
/// build, and only there. The policy that holds in this window is the one `import.html` carries:
/// it names no server, and behind it Rust refuses every request of the window ([`network`]).
fn own_policy(
    _request: tauri::http::Request<Vec<u8>>,
    response: &mut tauri::http::Response<Cow<'static, [u8]>>,
) {
    response
        .headers_mut()
        .remove(tauri::http::header::CONTENT_SECURITY_POLICY);
}

/// Whether a top-level navigation of the import window stays on its page.
fn stays_home(url: &Url) -> bool {
    let local = matches!(
        url.host_str(),
        Some("localhost" | "127.0.0.1" | "tauri.localhost")
    );
    local && url.path().trim_start_matches('/') == PAGE
}

/// A name for the copy of the source file that the agent reads: the file's own name, with
/// anything that is not a letter, a digit, a space or one of `-_.` replaced.
fn source_name(path: &Path) -> String {
    let name: String = path
        .file_name()
        .map(|name| name.to_string_lossy())
        .unwrap_or_default()
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || matches!(c, ' ' | '-' | '_' | '.') {
                c
            } else {
                '_'
            }
        })
        .collect();
    let name = name.trim().trim_start_matches('.').to_string();
    if name.is_empty() {
        "source.html".into()
    } else {
        name
    }
}

fn is_html(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("html") || e.eq_ignore_ascii_case("htm"))
}

/// The file an import session is about.
#[derive(Debug, Clone)]
struct Session {
    /// The copy of the file in the agent's folder: what the page loads and the agent reads.
    source: PathBuf,
    /// The workspace the session's assets are stored in.
    workspace_id: String,
}

/// What `import_open` answers.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenedSource {
    /// The name the agent reads the file under, in its working folder.
    pub file: String,
    pub bytes: u64,
}

struct Job {
    id: u64,
    /// Handed to the page once, by `import_job_take`.
    payload: Option<Value>,
    done: oneshot::Sender<std::result::Result<Value, String>>,
}

/// What a job needs from its window. The app's is the hidden webview; the tests' a fake.
trait Surface {
    fn exists(&self) -> bool;
    async fn create(&self) -> Result<()>;
    /// Runs `script` in the page.
    fn deliver(&self, script: String) -> Result<()>;
    fn destroy(&self);
}

/// The import window's state, shared by the commands.
pub struct ImportService {
    /// One job at a time: there is one page.
    turn: tokio::sync::Mutex<()>,
    /// The page has loaded and listens for jobs.
    loaded: watch::Sender<bool>,
    job: Mutex<Option<Job>>,
    session: Mutex<Option<Session>>,
    /// URLs the window was refused, in the order they were asked for.
    blocked: Arc<Mutex<Vec<String>>>,
    next_id: AtomicU64,
}

impl Default for ImportService {
    fn default() -> Self {
        Self::new()
    }
}

impl ImportService {
    pub fn new() -> Self {
        Self {
            turn: tokio::sync::Mutex::new(()),
            loaded: watch::Sender::new(false),
            job: Mutex::new(None),
            session: Mutex::new(None),
            blocked: Arc::new(Mutex::new(Vec::new())),
            next_id: AtomicU64::new(1),
        }
    }

    /// Starts a session on a file: copies it into `folder`, where the session's agent reads
    /// its files, and lets go of the window of the session before, so the file gets a page
    /// nothing ran in.
    async fn open<S: Surface>(
        &self,
        surface: &S,
        path: &Path,
        folder: &Path,
        workspace_id: String,
    ) -> Result<OpenedSource> {
        if !path.is_absolute() || !is_html(path) {
            return Err(ImportError::invalid(format!(
                "not an absolute path to an .html file: {}",
                path.display()
            )));
        }
        let io = |action: &str, e: &std::io::Error| {
            let kind = if e.kind() == std::io::ErrorKind::NotFound {
                ImportErrorKind::NotFound
            } else {
                ImportErrorKind::Io
            };
            ImportError::new(kind, format!("could not {action}: {e}"))
        };
        let size = tokio::fs::metadata(path)
            .await
            .map_err(|e| io("read the file", &e))?
            .len();
        if size > MAX_SOURCE_BYTES {
            return Err(ImportError::invalid(format!(
                "the file is {size} bytes; the largest file that can be imported is {MAX_SOURCE_BYTES}"
            )));
        }
        let file = source_name(path);
        let source = folder.join(&file);
        tokio::fs::create_dir_all(folder)
            .await
            .map_err(|e| io("create the session folder", &e))?;
        let bytes = tokio::fs::copy(path, &source)
            .await
            .map_err(|e| io("copy the file", &e))?;

        self.begin(surface, source, workspace_id).await;
        Ok(OpenedSource { file, bytes })
    }

    /// Starts a session on a source that is already where the agent reads it: the copy the deck
    /// keeps was put there again, for an import that is continued (IMP-09). The file gets a
    /// window nothing ran in, as on the first opening.
    async fn reopen<S: Surface>(&self, surface: &S, source: PathBuf, workspace_id: String) {
        self.begin(surface, source, workspace_id).await;
    }

    /// Lets go of the window of the session before, and makes `source` the session's file.
    async fn begin<S: Surface>(&self, surface: &S, source: PathBuf, workspace_id: String) {
        let _turn = self.turn.lock().await;
        surface.destroy();
        self.loaded.send_replace(false);
        lock(&self.blocked).clear();
        *lock(&self.session) = Some(Session {
            source,
            workspace_id,
        });
    }

    /// Ends the session: its window goes, and with it whatever the file left running.
    async fn close<S: Surface>(&self, surface: &S) {
        let _turn = self.turn.lock().await;
        surface.destroy();
        self.loaded.send_replace(false);
        lock(&self.session).take();
    }

    fn session(&self) -> Result<Session> {
        lock(&self.session).clone().ok_or_else(|| {
            ImportError::new(ImportErrorKind::NoSession, "no import session is open")
        })
    }

    /// The window, created on first use, with its page loaded. Called with the turn held.
    async fn ensure_page<S: Surface>(&self, surface: &S) -> Result<()> {
        if !surface.exists() {
            self.loaded.send_replace(false);
            surface.create().await?;
        }
        let mut loaded = self.loaded.subscribe();
        if timeout(PAGE_LOAD_TIMEOUT, loaded.wait_for(|loaded| *loaded))
            .await
            .is_err()
        {
            return Err(ImportError::new(
                ImportErrorKind::Timeout,
                format!("the import page did not load within {PAGE_LOAD_TIMEOUT:?}"),
            ));
        }
        Ok(())
    }

    /// Runs a job in the import page and returns the page's answer. The job is the main
    /// window's and is not read here.
    async fn run_job<S: Surface>(&self, surface: &S, job: Value, wait: Duration) -> Result<Value> {
        self.session()?;
        let _turn = self.turn.lock().await;
        self.ensure_page(surface).await?;

        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let (sender, receiver) = oneshot::channel();
        *lock(&self.job) = Some(Job {
            id,
            payload: Some(job),
            done: sender,
        });
        // Only the id travels in the script; the page fetches the job over IPC.
        surface.deliver(format!("window.__slidrImportJob({id})"))?;
        match timeout(wait, receiver).await {
            Ok(Ok(Ok(result))) => Ok(result),
            Ok(Ok(Err(error))) => Err(ImportError::new(ImportErrorKind::JobFailed, error)),
            Ok(Err(_)) => Err(ImportError::internal("the job's answer was dropped")),
            Err(_) => {
                lock(&self.job).take();
                Err(ImportError::new(
                    ImportErrorKind::Timeout,
                    format!("the import page did not finish the job within {wait:?}"),
                ))
            }
        }
    }

    fn take_job(&self, id: u64) -> Result<Value> {
        match lock(&self.job).as_mut() {
            Some(job) if job.id == id => job
                .payload
                .take()
                .ok_or_else(|| ImportError::invalid(format!("job {id} was already taken"))),
            _ => Err(ImportError::invalid(format!(
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

    fn blocked(&self) -> Vec<String> {
        lock(&self.blocked).clone()
    }
}

/// Writes a refused URL down, once, and only so many of them.
fn note_blocked(blocked: &Mutex<Vec<String>>, url: &str) {
    let url: String = url.chars().take(MAX_BLOCKED_URL).collect();
    let mut blocked = lock(blocked);
    if blocked.len() < MAX_BLOCKED && !blocked.contains(&url) {
        blocked.push(url);
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

fn job_timeout(timeout_ms: Option<u64>) -> Duration {
    timeout_ms.map_or(JOB_TIMEOUT, |ms| {
        Duration::from_millis(ms).clamp(Duration::from_secs(1), MAX_JOB_TIMEOUT)
    })
}

/// The hidden import window of the running app.
struct AppSurface<'a> {
    app: &'a AppHandle,
    blocked: Arc<Mutex<Vec<String>>>,
}

impl Surface for AppSurface<'_> {
    fn exists(&self) -> bool {
        self.app.get_webview_window(IMPORT_LABEL).is_some()
    }

    /// The window never runs anything before its network block is in place: if the block
    /// cannot be installed, the window is destroyed and the job fails.
    async fn create(&self) -> Result<()> {
        let window =
            WebviewWindowBuilder::new(self.app, IMPORT_LABEL, WebviewUrl::App(PAGE.into()))
                .title("Slidr import")
                .visible(false)
                .focused(false)
                .skip_taskbar(true)
                .decorations(false)
                .inner_size(WINDOW_WIDTH, WINDOW_HEIGHT)
                // A profile of its own, kept nowhere: the file sees none of the app's storage.
                .incognito(true)
                // The file may not take the window anywhere else.
                .on_navigation(stays_home)
                // The page's own policy is the one in force, not the app pages' over it.
                .on_web_resource_request(own_policy)
                .build()
                .map_err(|e| {
                    ImportError::internal(format!("could not create the import window: {e}"))
                })?;
        let blocked = block_network(&window, Arc::clone(&self.blocked)).await;
        if blocked.is_err() {
            let _ = window.destroy();
        }
        blocked
    }

    fn deliver(&self, script: String) -> Result<()> {
        let window = self
            .app
            .get_webview_window(IMPORT_LABEL)
            .ok_or_else(|| ImportError::internal("the import window is gone"))?;
        window
            .eval(script)
            .map_err(|e| ImportError::internal(format!("could not reach the import page: {e}")))
    }

    fn destroy(&self) {
        if let Some(window) = self.app.get_webview_window(IMPORT_LABEL) {
            let _ = window.destroy();
        }
    }
}

/// The origin the app's own pages are served from: the dev server while developing, and
/// otherwise where WebView2 serves the bundled files. (The window itself cannot be asked: it
/// has no address until its first navigation commits.)
#[cfg(windows)]
fn home_origin(app: &AppHandle) -> String {
    match &app.config().build.dev_url {
        Some(url) if tauri::is_dev() => url.origin().ascii_serialization(),
        _ => "http://tauri.localhost".into(),
    }
}

#[cfg(windows)]
async fn block_network(
    window: &tauri::WebviewWindow,
    blocked: Arc<Mutex<Vec<String>>>,
) -> Result<()> {
    let home = home_origin(window.app_handle());
    network::block(window, move |url| {
        let allowed = request_allowed(&home, url);
        if !allowed {
            note_blocked(&blocked, url);
        }
        allowed
    })
    .await
    .map_err(|e| ImportError::internal(format!("could not block the import window's network: {e}")))
}

#[cfg(not(windows))]
async fn block_network(
    _window: &tauri::WebviewWindow,
    _blocked: Arc<Mutex<Vec<String>>>,
) -> Result<()> {
    Err(ImportError::new(
        ImportErrorKind::Unsupported,
        "HTML import isolates the file with WebView2 and is available on Windows only",
    ))
}

type Service<'a> = State<'a, Arc<ImportService>>;

fn surface<'a>(app: &'a AppHandle, service: &ImportService) -> AppSurface<'a> {
    AppSurface {
        app,
        blocked: Arc::clone(&service.blocked),
    }
}

/// `import_open({ path, thread, workspaceId })`: starts an import session on the file the user
/// chose. The file is copied to where the agent of `thread` reads its files; `workspaceId` is
/// where the session's assets go. Answers with the name the agent knows the file by.
#[tauri::command]
pub async fn import_open(
    app: AppHandle,
    service: Service<'_>,
    harness: State<'_, Arc<HarnessManager>>,
    storage: State<'_, Arc<Storage>>,
    path: PathBuf,
    thread: String,
    workspace_id: String,
) -> Result<OpenedSource> {
    storage
        .assets_dir(&workspace_id)
        .map_err(|e| ImportError::invalid(e.message))?;
    let folder = harness
        .attachments_dir(&thread)
        .map_err(|e| ImportError::invalid(e.message))?;
    let window = surface(&app, &service);
    let opened = service
        .open(&window, &path, &folder, workspace_id.clone())
        .await?;
    // The deck keeps its source (IMP-07): the bytes the session reads, so what is looked at or
    // continued later is what was imported, whatever becomes of the file the user chose.
    let copy = folder.join(&opened.file);
    let storage = Arc::clone(&storage);
    let kept = off_main(move || storage.keep_source(&workspace_id, &copy)).await;
    if let Err(error) = kept {
        service.close(&window).await;
        return Err(error);
    }
    Ok(opened)
}

/// `import_reopen({ file, thread, workspaceId })`: starts an import session again on the source
/// the deck keeps, for an import that is continued or a slide that is captured again. `file` is
/// the name the agent knows the file by; the copy is put back where the agent of `thread` reads
/// its files, which another machine, or a cleaned folder, does not have.
#[tauri::command]
pub async fn import_reopen(
    app: AppHandle,
    service: Service<'_>,
    harness: State<'_, Arc<HarnessManager>>,
    storage: State<'_, Arc<Storage>>,
    file: String,
    thread: String,
    workspace_id: String,
) -> Result<OpenedSource> {
    let folder = harness
        .attachments_dir(&thread)
        .map_err(|e| ImportError::invalid(e.message))?;
    // The name comes from the webview: only a plain file name gets to be a path.
    let file = source_name(Path::new(&file));
    let source = folder.join(&file);
    let bytes = {
        let (storage, workspace_id, source) =
            (Arc::clone(&storage), workspace_id.clone(), source.clone());
        off_main(move || storage.copy_source(&workspace_id, &source)).await?
    };
    service
        .reopen(&surface(&app, &service), source, workspace_id)
        .await;
    Ok(OpenedSource { file, bytes })
}

/// `import_record_read({ workspaceId })`: the record of the import the open deck came from
/// (`source/import.json`), as the webview wrote it; `null` when the deck has none.
#[tauri::command]
pub async fn import_record_read(
    storage: State<'_, Arc<Storage>>,
    workspace_id: String,
) -> Result<Option<String>> {
    let storage = Arc::clone(&storage);
    off_main(move || storage.import_record(&workspace_id)).await
}

/// `import_record_write({ workspaceId, text })`: replaces the record of the import. It is saved
/// with the deck, so a deck that is opened again has its import report, and an import that was
/// cut is continued from what the record says was captured.
#[tauri::command]
pub async fn import_record_write(
    storage: State<'_, Arc<Storage>>,
    workspace_id: String,
    text: String,
) -> Result<()> {
    let storage = Arc::clone(&storage);
    off_main(move || storage.write_import_record(&workspace_id, &text)).await
}

/// `import_source_export({ workspaceId, path })`: writes a copy of the source the deck keeps to
/// a file the user chose, to look at it outside the app. Returns its size.
#[tauri::command]
pub async fn import_source_export(
    storage: State<'_, Arc<Storage>>,
    workspace_id: String,
    path: PathBuf,
) -> Result<u64> {
    if !path.is_absolute() {
        return Err(ImportError::invalid(format!(
            "not an absolute path: {}",
            path.display()
        )));
    }
    let storage = Arc::clone(&storage);
    off_main(move || storage.copy_source(&workspace_id, &path)).await
}

/// A failure of the file layer, as an import command reports it.
impl From<AppError> for ImportError {
    fn from(error: AppError) -> Self {
        let kind = match error.kind {
            ErrorKind::NotFound => ImportErrorKind::NotFound,
            ErrorKind::InvalidInput | ErrorKind::InvalidFile | ErrorKind::UnknownWorkspace => {
                ImportErrorKind::InvalidInput
            }
            ErrorKind::Io | ErrorKind::DiskFull => ImportErrorKind::Io,
            ErrorKind::Internal => ImportErrorKind::Internal,
        };
        Self::new(kind, error.message)
    }
}

/// Runs blocking file work of the file layer off the async runtime's threads.
async fn off_main<T, F>(task: F) -> Result<T>
where
    F: FnOnce() -> crate::error::Result<T> + Send + 'static,
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(ImportError::internal)?
        .map_err(ImportError::from)
}

/// `import_run_job({ job, timeoutMs? })`: runs a job in the import page and returns its answer.
#[tauri::command]
pub async fn import_run_job(
    app: AppHandle,
    service: Service<'_>,
    job: Value,
    timeout_ms: Option<u64>,
) -> Result<Value> {
    service
        .run_job(&surface(&app, &service), job, job_timeout(timeout_ms))
        .await
}

/// `import_blocked()`: the URLs the import window was refused in this session, for the report.
#[tauri::command]
pub fn import_blocked(service: Service<'_>) -> Vec<String> {
    service.blocked()
}

/// `import_close()`: ends the import session and its window.
#[tauri::command]
pub async fn import_close(app: AppHandle, service: Service<'_>) -> Result<()> {
    service.close(&surface(&app, &service)).await;
    Ok(())
}

/// `import_page_loaded()`: from the import page, once it listens for jobs.
#[tauri::command]
pub fn import_page_loaded(webview: tauri::Webview, service: Service<'_>) -> Result<()> {
    from_import_page(&webview)?;
    service.page_loaded();
    Ok(())
}

/// `import_job_take({ id })`: from the import page, the job it was told about.
#[tauri::command]
pub fn import_job_take(webview: tauri::Webview, service: Service<'_>, id: u64) -> Result<Value> {
    from_import_page(&webview)?;
    service.take_job(id)
}

/// `import_job_done({ id, result?, error? })`: from the import page, the job's answer.
#[tauri::command]
pub fn import_job_done(
    webview: tauri::Webview,
    service: Service<'_>,
    id: u64,
    result: Option<Value>,
    error: Option<String>,
) -> Result<()> {
    from_import_page(&webview)?;
    service.finish_job(
        id,
        match error {
            Some(error) => Err(error),
            None => Ok(result.unwrap_or(Value::Null)),
        },
    );
    Ok(())
}

/// `import_source()`: from the import page, the bytes of the file being imported, as they are
/// on disk. The answer is the raw bytes, not JSON: the page hands them to the browser, which
/// works out the encoding as it would for a file opened by hand.
#[tauri::command]
pub async fn import_source(webview: tauri::Webview, service: Service<'_>) -> Result<Response> {
    from_import_page(&webview)?;
    let session = service.session()?;
    let bytes = tokio::fs::read(&session.source).await.map_err(|e| {
        ImportError::new(
            ImportErrorKind::Io,
            format!("could not read the imported file: {e}"),
        )
    })?;
    Ok(Response::new(bytes))
}

/// `import_store_asset`: from the import page, bytes to keep as an asset of the workspace the
/// session was opened for. The body is the raw bytes; an optional file name travels
/// percent-encoded in the header `x-file-name`, as in `asset_import_bytes`.
#[tauri::command]
pub async fn import_store_asset(
    webview: tauri::Webview,
    service: Service<'_>,
    storage: State<'_, Arc<Storage>>,
    request: Request<'_>,
) -> Result<ImportedAsset> {
    from_import_page(&webview)?;
    let session = service.session()?;
    let name = match request.headers().get("x-file-name") {
        Some(value) => Some(
            value
                .to_str()
                .ok()
                .and_then(|v| percent_encoding::percent_decode_str(v).decode_utf8().ok())
                .map(std::borrow::Cow::into_owned)
                .ok_or_else(|| {
                    ImportError::invalid("header x-file-name is not percent-encoded UTF-8")
                })?,
        ),
        None => None,
    };
    let bytes = match request.body() {
        InvokeBody::Raw(bytes) => bytes.clone(),
        InvokeBody::Json(value) => serde_json::from_value(value.clone())
            .map_err(|e| ImportError::invalid(format!("the body is not bytes: {e}")))?,
    };
    let assets_dir = storage
        .assets_dir(&session.workspace_id)
        .map_err(|e| ImportError::new(ImportErrorKind::NoSession, e.message))?;
    tauri::async_runtime::spawn_blocking(move || assets::import_bytes(&assets_dir, name, &bytes))
        .await
        .map_err(ImportError::internal)?
        .map_err(|e| ImportError::new(ImportErrorKind::Io, e.message))
}

fn from_import_page(webview: &tauri::Webview) -> Result<()> {
    if webview.label() == IMPORT_LABEL {
        Ok(())
    } else {
        Err(ImportError::new(
            ImportErrorKind::Forbidden,
            "only the import page may call this",
        ))
    }
}

/// Closes the import window with the main one; a hidden window would keep the app running.
pub fn on_window_event(window: &Window, event: &WindowEvent) {
    if window.label() == MAIN_LABEL
        && matches!(event, WindowEvent::Destroyed)
        && let Some(import) = window.app_handle().get_webview_window(IMPORT_LABEL)
    {
        let _ = import.destroy();
    }
}

#[cfg(test)]
mod tests {
    use std::cell::Cell;

    use serde_json::json;
    use tokio::sync::mpsc;

    use super::*;

    type TestResult = std::result::Result<(), Box<dyn std::error::Error>>;

    /// The import window is closed to every app command but its own six, including ones that
    /// do not exist yet; every other window is as open as before.
    #[test]
    fn the_import_window_may_call_only_what_import_needs() {
        for command in IMPORT_WINDOW_COMMANDS {
            assert!(may_call(IMPORT_LABEL, command), "{command}");
        }
        for command in [
            "storage_new",
            "storage_open",
            "storage_write_deck",
            "storage_save",
            "asset_import_file",
            "asset_import_bytes",
            "export_write_file",
            "agent_start",
            "agent_send",
            "tool_bridge_connect",
            "tool_bridge_reply",
            "capture_slide",
            "capture_run_job",
            "capture_job_take",
            "agent_chat_write",
            "image_generate",
            "import_open",
            "import_run_job",
            "import_blocked",
            "import_close",
            // The source a deck keeps and the record of its import: the main window's, like
            // the session itself. A file may not reopen itself, rewrite what the report says of
            // it, or have a copy of the source written somewhere on the disk.
            "import_reopen",
            "import_record_read",
            "import_record_write",
            "import_source_export",
            // The agent's diagnostics log (ADR-066): what the agent wrote is not a file's to read.
            "agent_diagnostics_read",
            "agent_diagnostics_clear",
            "a_command_added_next_month",
            "",
        ] {
            assert!(!may_call(IMPORT_LABEL, command), "{command}");
            assert!(may_call("main", command), "{command}");
            assert!(may_call("capture", command), "{command}");
        }
    }

    /// The import page arrives without the app pages' policy, and with the rest of its answer.
    #[test]
    fn the_import_page_is_served_without_the_app_pages_policy() -> TestResult {
        let request = tauri::http::Request::builder()
            .uri("http://tauri.localhost/import.html")
            .body(Vec::new())?;
        let mut response = tauri::http::Response::builder()
            .header("Content-Security-Policy", "default-src 'none'")
            .header("Content-Type", "text/html")
            .body(Cow::Borrowed(&b"<!doctype html>"[..]))?;
        own_policy(request, &mut response);
        assert!(!response.headers().contains_key("content-security-policy"));
        assert_eq!(response.headers()["content-type"], "text/html");
        assert_eq!(response.body().as_ref(), b"<!doctype html>");
        Ok(())
    }

    #[test]
    fn only_the_page_itself_and_the_ipc_load() {
        let home = "http://tauri.localhost";
        for url in [
            "http://tauri.localhost",
            "http://tauri.localhost/import.html",
            "http://tauri.localhost/assets/import-abc.js",
            "http://ipc.localhost/import_job_take",
        ] {
            assert!(request_allowed(home, url), "{url}");
        }
        for url in [
            "https://fonts.googleapis.com/css2?family=Heebo",
            "https://unpkg.com/react",
            "http://tauri.localhost.evil.example/import.html",
            "http://tauri.localhost:8080/",
            "http://tauri.localhostx/",
            "http://asset.localhost/C%3A%5CUsers%5Cme%5Cdeck.json",
            "https://tauri.localhost/import.html",
            "http://localhost:1420/src/main.tsx",
            "file:///C:/Users/me/secret.txt",
            "ws://tauri.localhost/",
        ] {
            assert!(!request_allowed(home, url), "{url}");
        }
        let dev = "http://localhost:1471";
        assert!(request_allowed(
            dev,
            "http://localhost:1471/src/import/page/main.ts"
        ));
        assert!(!request_allowed(dev, "http://localhost:14710/"));
        assert!(!request_allowed(dev, "http://localhost:1420/"));
    }

    #[test]
    fn the_window_stays_on_its_page() -> TestResult {
        for url in [
            "http://localhost:1471/import.html",
            "http://tauri.localhost/import.html",
            "http://tauri.localhost/import.html#x",
        ] {
            assert!(stays_home(&Url::parse(url)?), "{url}");
        }
        for url in [
            "https://example.com/import.html",
            "http://tauri.localhost/index.html",
            "http://tauri.localhost/",
            "about:blank",
            "data:text/html,hello",
            "file:///C:/import.html",
        ] {
            assert!(!stays_home(&Url::parse(url)?), "{url}");
        }
        Ok(())
    }

    #[test]
    fn the_copy_gets_a_plain_name() {
        let name = |path: &str| source_name(Path::new(path));
        assert_eq!(
            name("C:/decks/E-CIX NG - standalone.html"),
            "E-CIX NG - standalone.html"
        );
        assert_eq!(name("C:/decks/מצגת (1).html"), "מצגת _1_.html");
        assert_eq!(name("C:/decks/a&b;c.htm"), "a_b_c.htm");
        assert_eq!(name("C:/decks/..html"), "html");
        assert_eq!(name(""), "source.html");
        assert!(is_html(Path::new("a.HTML")) && is_html(Path::new("a.htm")));
        assert!(!is_html(Path::new("a.html.exe")) && !is_html(Path::new("html")));
    }

    #[test]
    fn refused_urls_are_kept_once_and_bounded() {
        let blocked = Mutex::new(Vec::new());
        note_blocked(&blocked, "https://a.example/x.css");
        note_blocked(&blocked, "https://a.example/x.css");
        note_blocked(&blocked, &format!("https://b.example/{}", "y".repeat(1000)));
        let kept = lock(&blocked).clone();
        assert_eq!(kept.len(), 2);
        assert_eq!(kept[0], "https://a.example/x.css");
        assert_eq!(kept[1].chars().count(), MAX_BLOCKED_URL);
        for i in 0..2 * MAX_BLOCKED {
            note_blocked(&blocked, &format!("https://c.example/{i}"));
        }
        assert_eq!(lock(&blocked).len(), MAX_BLOCKED);
    }

    #[test]
    fn job_timeouts_are_bounded() {
        assert_eq!(job_timeout(None), JOB_TIMEOUT);
        assert_eq!(job_timeout(Some(90_000)), Duration::from_secs(90));
        assert_eq!(job_timeout(Some(0)), Duration::from_secs(1));
        assert_eq!(job_timeout(Some(u64::MAX / 2)), MAX_JOB_TIMEOUT);
    }

    /// A window that hands every delivered script to the test.
    struct FakeSurface {
        exists: Cell<bool>,
        created: Cell<u32>,
        destroyed: Cell<u32>,
        scripts: mpsc::UnboundedSender<String>,
    }

    impl FakeSurface {
        fn new() -> (Self, mpsc::UnboundedReceiver<String>) {
            let (scripts, received) = mpsc::unbounded_channel();
            let surface = Self {
                exists: Cell::new(false),
                created: Cell::new(0),
                destroyed: Cell::new(0),
                scripts,
            };
            (surface, received)
        }
    }

    impl Surface for FakeSurface {
        fn exists(&self) -> bool {
            self.exists.get()
        }

        async fn create(&self) -> Result<()> {
            self.exists.set(true);
            self.created.set(self.created.get() + 1);
            Ok(())
        }

        fn deliver(&self, script: String) -> Result<()> {
            self.scripts.send(script).map_err(ImportError::internal)
        }

        fn destroy(&self) {
            if self.exists.replace(false) {
                self.destroyed.set(self.destroyed.get() + 1);
            }
        }
    }

    fn job_id(script: &str) -> u64 {
        script
            .strip_prefix("window.__slidrImportJob(")
            .and_then(|rest| rest.strip_suffix(')'))
            .and_then(|id| id.parse().ok())
            .unwrap_or(0)
    }

    async fn opened(
        service: &ImportService,
        surface: &FakeSurface,
        dir: &Path,
    ) -> Result<OpenedSource> {
        let file = dir.join("my deck.html");
        tokio::fs::write(&file, "<p dir=\"rtl\">שלום</p>")
            .await
            .map_err(ImportError::internal)?;
        service
            .open(surface, &file, &dir.join("agent/attachments"), "w1".into())
            .await
    }

    /// Opening copies the file to the agent's folder under a plain name and remembers the
    /// workspace; a job then reaches the page by id and its answer comes back.
    #[tokio::test]
    async fn a_session_copies_the_source_and_runs_jobs() -> TestResult {
        let dir = tempfile::tempdir()?;
        let service = ImportService::new();
        let (surface, mut scripts) = FakeSurface::new();

        let no_session = service.run_job(&surface, json!({}), JOB_TIMEOUT).await;
        assert_eq!(
            no_session.err().map(|e| e.kind),
            Some(ImportErrorKind::NoSession)
        );

        let source = opened(&service, &surface, dir.path()).await?;
        assert_eq!(source.file, "my deck.html");
        let copy = dir.path().join("agent/attachments/my deck.html");
        assert_eq!(std::fs::read_to_string(&copy)?, "<p dir=\"rtl\">שלום</p>");
        assert_eq!(u64::try_from(std::fs::read(&copy)?.len())?, source.bytes);
        let session = service.session()?;
        assert_eq!((session.source, session.workspace_id), (copy, "w1".into()));

        let job = json!({ "kind": "load", "html": "not here: the page asks for the bytes" });
        let run = service.run_job(&surface, job.clone(), JOB_TIMEOUT);
        let page = async {
            service.page_loaded();
            let script = scripts.recv().await.unwrap_or_default();
            assert!(!script.contains("load"), "{script}");
            let id = job_id(&script);
            assert_eq!(service.take_job(id).ok(), Some(job.clone()));
            assert!(service.take_job(id).is_err(), "a job is taken once");
            service.finish_job(id + 1, Ok(json!("someone else's")));
            service.finish_job(id, Ok(json!({ "title": "deck" })));
        };
        let (done, ()) = tokio::join!(run, page);
        assert_eq!(done?, json!({ "title": "deck" }));
        assert_eq!(surface.created.get(), 1);

        let run = service.run_job(&surface, json!({}), JOB_TIMEOUT);
        let page = async {
            let id = job_id(&scripts.recv().await.unwrap_or_default());
            service.finish_job(id, Err("the element was not found".into()));
        };
        let (failed, ()) = tokio::join!(run, page);
        assert_eq!(
            failed.err(),
            Some(ImportError::new(
                ImportErrorKind::JobFailed,
                "the element was not found"
            ))
        );
        Ok(())
    }

    /// A new session gets a window nothing ran in, and a clean list of refused URLs.
    #[tokio::test]
    async fn opening_again_starts_from_a_fresh_window() -> TestResult {
        let dir = tempfile::tempdir()?;
        let service = ImportService::new();
        let (surface, mut scripts) = FakeSurface::new();
        opened(&service, &surface, dir.path()).await?;
        note_blocked(&service.blocked, "https://a.example/font.woff2");

        let run = service.run_job(&surface, json!({}), JOB_TIMEOUT);
        let page = async {
            service.page_loaded();
            let id = job_id(&scripts.recv().await.unwrap_or_default());
            service.finish_job(id, Ok(Value::Null));
        };
        let _ = tokio::join!(run, page);
        assert_eq!(service.blocked(), ["https://a.example/font.woff2"]);

        opened(&service, &surface, dir.path()).await?;
        assert_eq!(surface.destroyed.get(), 1);
        assert!(service.blocked().is_empty());
        assert!(
            !*service.loaded.borrow(),
            "the next job waits for the new page"
        );

        service.close(&surface).await;
        assert!(service.session().is_err());
        Ok(())
    }

    /// An import that is continued runs on the copy it is given, in a window nothing ran in.
    #[tokio::test]
    async fn reopening_starts_a_session_on_the_copy_in_a_fresh_window() -> TestResult {
        let dir = tempfile::tempdir()?;
        let service = ImportService::new();
        let (surface, mut scripts) = FakeSurface::new();
        assert!(service.session().is_err());

        let copy = dir.path().join("agent/attachments/my deck.html");
        service.reopen(&surface, copy.clone(), "w1".into()).await;
        let session = service.session()?;
        assert_eq!(
            (session.source, session.workspace_id),
            (copy.clone(), "w1".into())
        );

        let run = service.run_job(&surface, json!({ "kind": "load" }), JOB_TIMEOUT);
        let page = async {
            service.page_loaded();
            let id = job_id(&scripts.recv().await.unwrap_or_default());
            service.finish_job(id, Ok(Value::Null));
        };
        let _ = tokio::join!(run, page);
        note_blocked(&service.blocked, "https://a.example/font.woff2");
        assert_eq!(surface.created.get(), 1);

        // Reopened once more while its window is up: the window goes, and so does the list.
        service.reopen(&surface, copy, "w1".into()).await;
        assert_eq!(surface.destroyed.get(), 1);
        assert!(service.blocked().is_empty());
        assert!(
            !*service.loaded.borrow(),
            "the next job waits for the new page"
        );
        Ok(())
    }

    /// What the file layer refuses reaches the webview in the import commands' own kinds.
    #[test]
    fn a_failure_of_the_file_layer_keeps_its_meaning() {
        let kind = |kind| ImportError::from(AppError::new(kind, "x")).kind;
        assert_eq!(kind(ErrorKind::NotFound), ImportErrorKind::NotFound);
        assert_eq!(
            kind(ErrorKind::UnknownWorkspace),
            ImportErrorKind::InvalidInput
        );
        assert_eq!(kind(ErrorKind::DiskFull), ImportErrorKind::Io);
        assert_eq!(kind(ErrorKind::Internal), ImportErrorKind::Internal);
    }

    #[tokio::test]
    async fn only_an_html_file_that_exists_is_opened() -> TestResult {
        let dir = tempfile::tempdir()?;
        let service = ImportService::new();
        let (surface, _scripts) = FakeSurface::new();
        let folder = dir.path().join("agent");
        std::fs::write(dir.path().join("notes.txt"), "x")?;
        for (path, kind) in [
            (dir.path().join("notes.txt"), ImportErrorKind::InvalidInput),
            (PathBuf::from("deck.html"), ImportErrorKind::InvalidInput),
            (dir.path().join("missing.html"), ImportErrorKind::NotFound),
        ] {
            let refused = service.open(&surface, &path, &folder, "w1".into()).await;
            assert_eq!(refused.err().map(|e| e.kind), Some(kind), "{path:?}");
        }
        assert!(service.session().is_err());
        assert!(!folder.exists(), "nothing was copied");
        Ok(())
    }

    /// A page that never answers fails the job in time, and its late answer is dropped.
    #[tokio::test(start_paused = true)]
    async fn a_job_the_page_never_finishes_times_out() -> TestResult {
        let service = ImportService::new();
        let (surface, mut scripts) = FakeSurface::new();
        *lock(&service.session) = Some(Session {
            source: PathBuf::from("deck.html"),
            workspace_id: "w1".into(),
        });
        service.page_loaded();
        surface.exists.set(true);

        let started = tokio::time::Instant::now();
        let stuck = service.run_job(&surface, json!({}), JOB_TIMEOUT).await;
        assert_eq!(stuck.err().map(|e| e.kind), Some(ImportErrorKind::Timeout));
        assert!(started.elapsed() >= JOB_TIMEOUT);
        let late = job_id(&scripts.recv().await.unwrap_or_default());
        assert!(service.take_job(late).is_err());

        let next = service.run_job(&surface, json!({}), JOB_TIMEOUT);
        let page = async {
            service.finish_job(late, Ok(json!("late")));
            let id = job_id(&scripts.recv().await.unwrap_or_default());
            service.finish_job(id, Ok(json!("in time")));
        };
        let (next, ()) = tokio::join!(next, page);
        assert_eq!(next?, json!("in time"));
        Ok(())
    }
}
