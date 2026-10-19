//! The media library: the graphics the app offers (the icon sets, the photographs of the
//! built-in templates, the built-in fonts of decks, the designs, card sets, frames and art of
//! Elements) and the built-in templates themselves. It is published on the web, as a Cloudflare
//! Pages site, and kept on this machine as the app reads it.
//!
//! ```text
//! https://slidr-media.pages.dev/manifest.json        every file of the library, its size and SHA-256
//! https://slidr-media.pages.dev/icons/lucide/icon-nodes.json
//! https://slidr-media.pages.dev/fonts/heebo/heebo-hebrew-wght-normal.woff2
//! ```
//!
//! The pages reach it through a protocol of its own, `media` (`http://media.localhost/<path>`
//! in WebView2), and never by its web address: their content policy stays closed to the network
//! (SEC-05), and Rust makes the calls ([`crate::net`]). The site is written by
//! `pnpm media:publish` from a library on an author's machine (docs/media-library.md).
//!
//! - The manifest is read from the web when the app starts, and kept. Without the network the
//!   last one read stands; never read, the library is empty.
//! - A file is fetched only when a page asks for it, never ahead: the library is not copied to
//!   this machine. A file the manifest names is answered from the cache when the cache holds the
//!   very bytes the manifest names, and otherwise fetched, checked against the manifest and kept,
//!   so what the app has used is at hand the next time the network is not. A new manifest takes
//!   from the cache what it no longer names.
//! - A file the library does not have is not found, and one that cannot be had now is
//!   unavailable. The app goes on without it: an icon set that does not load, a font that falls
//!   back, a catalog that is empty.
//!
//! The protocol only reads: a `GET` of a file of the library answers with the file, and
//! anything else with an error.

use std::{
    collections::{BTreeMap, HashSet},
    path::{Component, Path, PathBuf},
    sync::{Arc, PoisonError, RwLock},
    time::Duration,
};

use percent_encoding::percent_decode_str;
use reqwest::{Client, Url};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::http::{Method, Request, Response, StatusCode, header};
use tokio::sync::watch;

use crate::net;

/// The scheme of the protocol, and so the first label of its host in WebView2.
pub const SCHEME: &str = "media";

/// Where the library is published.
pub const DEFAULT_URL: &str = "https://slidr-media.pages.dev/";

/// A development build may be pointed at another copy of the library: a preview deployment of
/// the site (HTTPS), or a stand-in on this machine.
const VARIABLE: &str = "SLIDR_MEDIA_URL";

/// An installed app may be pointed at another copy of the library, one its users serve
/// themselves, by this file beside its executable: `{ "url": "https://media.example.org/" }`.
/// The installer writes it from `/MEDIA=<url>`, or from a file of that name beside the installer
/// (`windows/hooks.nsh`), so the released installer serves any copy without a build of its own;
/// an administrator may also write it by hand. It is not a setting of the app: whoever can write beside the executable can replace
/// the executable too.
const ADDRESS_FILE: &str = "media-library.json";

/// The file that lists the library.
const MANIFEST: &str = "manifest.json";

/// How long the manifest may take to come.
const MANIFEST_TIMEOUT: Duration = Duration::from_secs(8);

/// How long one file may take to come: the largest are catalogs of a few megabytes.
const FILE_TIMEOUT: Duration = Duration::from_secs(60);

/// How long a request waits for the manifest of this start when one from before is at hand.
/// Online the new one is there well before; offline the old one is answered without delay.
const WAIT_WITH_MANIFEST: Duration = Duration::from_millis(1500);

/// Redirects followed within the site: Pages sends `x.html` to `x`.
const REDIRECTS: usize = 3;

/// One file of the library, as the manifest names it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Entry {
    pub size: u64,
    /// Lowercase hexadecimal.
    pub sha256: String,
}

/// The list of the library's files, by their place in it: `fonts/heebo/heebo-latin.woff2`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Manifest {
    pub version: u32,
    /// When the library was published, as the publisher wrote it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub published: Option<String>,
    pub files: BTreeMap<String, Entry>,
}

impl Manifest {
    /// The manifest of `text`, without any entry whose path or hash is not plain. None for a text
    /// that is not a manifest.
    fn parse(text: &[u8]) -> Option<Self> {
        let mut manifest: Self = serde_json::from_slice(text).ok()?;
        manifest.files.retain(|path, entry| {
            relative_path(path).as_deref() == Some(path.as_str()) && is_hash(&entry.sha256)
        });
        Some(manifest)
    }
}

/// The manifest the app goes by, and its text, which the pages read as it is.
struct Current {
    manifest: Manifest,
    text: Vec<u8>,
}

/// What reading the manifest from the web came to.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Refresh {
    /// A manifest other than the one kept; it is the one now.
    Changed,
    /// The manifest kept is the published one.
    Same,
    /// The site has no manifest, or not one that can be read: the one kept stands.
    Missing,
    /// The site could not be reached: the one kept stands.
    Offline,
}

/// Why a file is not answered.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Miss {
    /// The library does not have it.
    NotFound,
    /// It cannot be had now: no network, or the site failed.
    Unavailable,
}

/// The media library of the running app: the site, and the cache on this machine.
pub struct MediaLibrary {
    base: Url,
    /// The cache: `manifest.json`, and `objects/<sha256>` for each file.
    dir: PathBuf,
    client: Client,
    current: RwLock<Option<Arc<Current>>>,
    /// Whether the manifest was read from the web in this run, or failed to be.
    refreshed: watch::Sender<bool>,
}

/// Where the library is read from: in a development build the copy [`VARIABLE`] names, else as
/// the installation says ([`installed_base`]). None: the app has no library.
pub fn base_url() -> Option<Url> {
    if cfg!(debug_assertions)
        && let Ok(value) = std::env::var(VARIABLE)
        && let Some(url) = copy_url(&value)
    {
        return Some(url);
    }
    let exe = std::env::current_exe().ok();
    match exe.as_deref().and_then(Path::parent) {
        Some(dir) => installed_base(dir),
        None => folder_url(DEFAULT_URL),
    }
}

/// The library an app installed in `dir` reads: the published site, unless [`ADDRESS_FILE`] is
/// there; then the copy it names. A file that names none the app may read (one that cannot be
/// read, is not JSON, has no `url`, or one that is not HTTPS) leaves the app with no library at
/// all, never with the published one: on a closed network a call to it would look like an attempt
/// to get out.
fn installed_base(dir: &Path) -> Option<Url> {
    #[derive(Deserialize)]
    struct Address {
        url: String,
    }
    let text = match std::fs::read(dir.join(ADDRESS_FILE)) {
        Ok(text) => text,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return folder_url(DEFAULT_URL);
        }
        Err(_) => return None,
    };
    // As Notepad may save it.
    let text = text.strip_prefix(b"\xEF\xBB\xBF").unwrap_or(&text);
    let address: Address = serde_json::from_slice(text).ok()?;
    copy_url(&address.url)
}

/// `value` as the address of a copy of the library: HTTPS anywhere, plain HTTP only on this
/// machine.
fn copy_url(value: &str) -> Option<Url> {
    folder_url(value)
        .filter(|url| url.scheme() == "https" || (url.scheme() == "http" && net::is_loopback(url)))
}

/// `value` as the URL of a folder: ending with a slash, so a path joins under it.
fn folder_url(value: &str) -> Option<Url> {
    let value = value.trim();
    if value.ends_with('/') {
        Url::parse(value).ok()
    } else {
        Url::parse(&format!("{value}/")).ok()
    }
}

impl MediaLibrary {
    /// The library at `base`, cached in `dir`, with the manifest kept there from before.
    pub fn new(base: Url, dir: PathBuf) -> Arc<Self> {
        let current = std::fs::read(dir.join(MANIFEST))
            .ok()
            .and_then(|text| {
                Some(Current {
                    manifest: Manifest::parse(&text)?,
                    text,
                })
            })
            .map(Arc::new);
        Arc::new(Self {
            base,
            dir,
            client: net::client(),
            current: RwLock::new(current),
            refreshed: watch::Sender::new(false),
        })
    }

    /// Reads the manifest from the web, in the background. Nothing else is fetched until a page
    /// asks for it.
    pub fn start(self: &Arc<Self>) {
        let library = Arc::clone(self);
        tauri::async_runtime::spawn(async move {
            library.refresh().await;
        });
    }

    fn current(&self) -> Option<Arc<Current>> {
        self.current
            .read()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
    }

    fn objects(&self) -> PathBuf {
        self.dir.join("objects")
    }

    fn object(&self, entry: &Entry) -> PathBuf {
        self.objects().join(&entry.sha256)
    }

    /// Reads the manifest from the web, and keeps it when it is new. Whatever comes of it, the
    /// requests waiting for it go on. A new manifest takes from the cache the files it no
    /// longer names.
    pub async fn refresh(&self) -> Refresh {
        let outcome = self.read_manifest().await;
        self.refreshed.send_replace(true);
        if outcome == Refresh::Changed
            && let Some(current) = self.current()
        {
            self.sweep(&current.manifest).await;
        }
        outcome
    }

    async fn read_manifest(&self) -> Refresh {
        let text = match self.download(MANIFEST, MANIFEST_TIMEOUT).await {
            Ok(text) => text,
            Err(Miss::NotFound) => return Refresh::Missing,
            Err(Miss::Unavailable) => return Refresh::Offline,
        };
        let Some(manifest) = Manifest::parse(&text) else {
            return Refresh::Missing;
        };
        if self.current().is_some_and(|current| current.text == text) {
            return Refresh::Same;
        }
        // Kept for the next start; a failure to write only means it is read from the web again.
        let _ = write_atomic(&self.dir, MANIFEST, &text).await;
        *self.current.write().unwrap_or_else(PoisonError::into_inner) =
            Some(Arc::new(Current { manifest, text }));
        Refresh::Changed
    }

    /// Waits for the manifest of this start, briefly when one from before is at hand.
    async fn wait_for_manifest(&self) {
        let wait = if self.current().is_some() {
            WAIT_WITH_MANIFEST
        } else {
            // The manifest's own timeout bounds it; a little more for the answer to arrive.
            MANIFEST_TIMEOUT + Duration::from_secs(1)
        };
        let mut refreshed = self.refreshed.subscribe();
        let _ = tokio::time::timeout(wait, refreshed.wait_for(|done| *done)).await;
    }

    /// The answer of the protocol to a request.
    pub async fn respond(&self, request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
        if !matches!(*request.method(), Method::GET | Method::HEAD) {
            return refusal(StatusCode::METHOD_NOT_ALLOWED);
        }
        let Some(path) = relative_path(request.uri().path()) else {
            return refusal(StatusCode::NOT_FOUND);
        };
        self.wait_for_manifest().await;
        let Some(current) = self.current() else {
            return refusal(StatusCode::NOT_FOUND);
        };
        if path == MANIFEST {
            return answer(StatusCode::OK, content_type(&path), current.text.clone());
        }
        let Some(entry) = current.manifest.files.get(&path) else {
            return refusal(StatusCode::NOT_FOUND);
        };
        match self.file(&path, entry).await {
            Ok(bytes) => answer(StatusCode::OK, content_type(&path), bytes),
            Err(Miss::NotFound) => refusal(StatusCode::NOT_FOUND),
            Err(Miss::Unavailable) => refusal(StatusCode::SERVICE_UNAVAILABLE),
        }
    }

    /// A file of the library: from the cache, or from the web and then kept.
    async fn file(&self, path: &str, entry: &Entry) -> Result<Vec<u8>, Miss> {
        if let Some(bytes) = self.cached(entry).await {
            return Ok(bytes);
        }
        let bytes = self.download(path, FILE_TIMEOUT).await?;
        // Bytes other than the manifest's are the site's newer file under a manifest read
        // before it: answered, but not kept under a hash they do not have.
        if matches(entry, &bytes) {
            let _ = write_atomic(&self.objects(), &entry.sha256, &bytes).await;
        }
        Ok(bytes)
    }

    /// The file from the cache. Files are kept only once checked, under their hash.
    async fn cached(&self, entry: &Entry) -> Option<Vec<u8>> {
        let bytes = tokio::fs::read(self.object(entry)).await.ok()?;
        (bytes.len() as u64 == entry.size).then_some(bytes)
    }

    /// The address of a file of the site.
    fn url_of(&self, path: &str) -> Option<Url> {
        let mut url = self.base.clone();
        url.path_segments_mut()
            .ok()?
            .pop_if_empty()
            .extend(path.split('/'));
        Some(url)
    }

    /// A file of the site, from the web.
    async fn download(&self, path: &str, timeout: Duration) -> Result<Vec<u8>, Miss> {
        let mut url = self.url_of(path).ok_or(Miss::NotFound)?;
        for _ in 0..=REDIRECTS {
            let response = self
                .client
                .get(url.clone())
                .timeout(timeout)
                .send()
                .await
                .map_err(|_| Miss::Unavailable)?;
            let status = response.status();
            if status.is_redirection() {
                // Within the site only: a library on one host is never read from another.
                let next = response
                    .headers()
                    .get(reqwest::header::LOCATION)
                    .and_then(|location| location.to_str().ok())
                    .and_then(|location| url.join(location).ok())
                    .filter(|next| next.origin() == self.base.origin());
                url = next.ok_or(Miss::Unavailable)?;
                continue;
            }
            if matches!(status.as_u16(), 404 | 410) {
                return Err(Miss::NotFound);
            }
            if !status.is_success() {
                return Err(Miss::Unavailable);
            }
            return response
                .bytes()
                .await
                .map(|bytes| bytes.to_vec())
                .map_err(|_| Miss::Unavailable);
        }
        Err(Miss::Unavailable)
    }

    /// Removes from the cache what `manifest` does not name, and what a write left half done.
    async fn sweep(&self, manifest: &Manifest) {
        let named: HashSet<&str> = manifest
            .files
            .values()
            .map(|entry| entry.sha256.as_str())
            .collect();
        let Ok(mut entries) = tokio::fs::read_dir(self.objects()).await else {
            return;
        };
        while let Ok(Some(file)) = entries.next_entry().await {
            let name = file.file_name();
            if !name.to_str().is_some_and(|name| named.contains(name)) {
                let _ = tokio::fs::remove_file(file.path()).await;
            }
        }
    }
}

/// Whether `bytes` are the file `entry` names.
fn matches(entry: &Entry, bytes: &[u8]) -> bool {
    bytes.len() as u64 == entry.size && format!("{:x}", Sha256::digest(bytes)) == entry.sha256
}

fn is_hash(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| matches!(byte, b'0'..=b'9' | b'a'..=b'f'))
}

/// Writes `name` in `dir` whole or not at all: to a file of its own first, then renamed.
async fn write_atomic(dir: &Path, name: &str, bytes: &[u8]) -> std::io::Result<()> {
    tokio::fs::create_dir_all(dir).await?;
    let temp = dir.join(format!(".{name}.{}.tmp", uuid::Uuid::new_v4()));
    tokio::fs::write(&temp, bytes).await?;
    let renamed = tokio::fs::rename(&temp, dir.join(name)).await;
    if renamed.is_err() {
        let _ = tokio::fs::remove_file(&temp).await;
    }
    renamed
}

/// The place in the library a path of the protocol names: plain names joined by `/`. None for a
/// path that climbs out, starts again at a root, or names a drive or a stream.
fn relative_path(uri_path: &str) -> Option<String> {
    let decoded = percent_decode_str(uri_path).decode_utf8().ok()?;
    let relative = decoded.trim_start_matches('/');
    if relative.is_empty() || relative.contains(['\\', ':']) {
        return None;
    }
    let mut parts = Vec::new();
    for part in Path::new(relative).components() {
        match part {
            Component::Normal(name) => parts.push(name.to_str()?),
            _ => return None,
        }
    }
    Some(parts.join("/"))
}

/// The type a file of the library is served as, by its extension.
fn content_type(path: &str) -> &'static str {
    match Path::new(path)
        .extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("json") => "application/json",
        Some("svg") => "image/svg+xml",
        Some("webp") => "image/webp",
        Some("png") => "image/png",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("woff2") => "font/woff2",
        Some("woff") => "font/woff",
        Some("ttf") => "font/ttf",
        Some("otf") => "font/otf",
        Some("html") => "text/html; charset=utf-8",
        Some("md" | "txt") => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

fn answer(status: StatusCode, kind: &'static str, body: Vec<u8>) -> Response<Vec<u8>> {
    let mut response = Response::new(body);
    *response.status_mut() = status;
    let headers = response.headers_mut();
    headers.insert(header::CONTENT_TYPE, header::HeaderValue::from_static(kind));
    // The pages are of another origin (`tauri.localhost`), and read these files as data: a
    // font, the text of an icon set, a picture drawn to a canvas.
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_ORIGIN,
        header::HeaderValue::from_static("*"),
    );
    response
}

fn refusal(status: StatusCode) -> Response<Vec<u8>> {
    answer(status, "text/plain; charset=utf-8", Vec::new())
}

/// The answer while the app has no library at all (before its setup ran).
pub fn unavailable() -> Response<Vec<u8>> {
    refusal(StatusCode::SERVICE_UNAVAILABLE)
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use super::*;
    use crate::net::testing::{Reply, Seen, Server, serve};

    fn hash(bytes: &[u8]) -> String {
        format!("{:x}", Sha256::digest(bytes))
    }

    fn url(value: &str) -> Url {
        folder_url(value).expect("a URL")
    }

    /// A port nothing listens on: the network, gone.
    const UNREACHABLE: &str = "http://127.0.0.1:9/";

    /// A manifest of `files`, as the publisher writes it.
    fn manifest_of<'a>(files: impl Iterator<Item = (&'a String, &'a Vec<u8>)>) -> Vec<u8> {
        let files = files
            .map(|(path, bytes)| {
                let entry = Entry {
                    size: bytes.len() as u64,
                    sha256: hash(bytes),
                };
                (path.clone(), entry)
            })
            .collect();
        let manifest = Manifest {
            version: 1,
            published: None,
            files,
        };
        serde_json::to_vec(&manifest).expect("a manifest")
    }

    type Files = Arc<Mutex<BTreeMap<String, Vec<u8>>>>;

    /// A site that serves its files, and a manifest of them as they are now.
    struct Site {
        server: Server,
        files: Files,
    }

    impl Site {
        async fn new(files: &[(&str, &[u8])]) -> std::io::Result<Self> {
            let files: Files = Arc::new(Mutex::new(
                files
                    .iter()
                    .map(|(path, bytes)| ((*path).to_owned(), bytes.to_vec()))
                    .collect(),
            ));
            let served = Arc::clone(&files);
            let server = serve(move |seen: &Seen| {
                let files = served.lock().unwrap_or_else(PoisonError::into_inner);
                let path = percent_decode_str(seen.path.trim_start_matches('/'))
                    .decode_utf8_lossy()
                    .into_owned();
                if path == MANIFEST {
                    return Reply::json(200, manifest_of(files.iter()));
                }
                match files.get(&path) {
                    Some(bytes) => Reply::bytes(200, "application/octet-stream", bytes.clone()),
                    None => Reply::bytes(404, "text/html", b"<h1>Not found</h1>".to_vec()),
                }
            })
            .await?;
            Ok(Self { server, files })
        }

        fn base(&self) -> Url {
            url(&self.server.base)
        }

        fn set(&self, path: &str, bytes: Option<&[u8]>) {
            let mut files = self.files.lock().unwrap_or_else(PoisonError::into_inner);
            match bytes {
                Some(bytes) => files.insert(path.to_owned(), bytes.to_vec()),
                None => files.remove(path),
            };
        }

        fn requests_for(&self, path: &str) -> usize {
            let path = format!("/{path}");
            self.server
                .seen()
                .iter()
                .filter(|seen| seen.path == path)
                .count()
        }
    }

    async fn get(library: &MediaLibrary, uri: &str) -> Response<Vec<u8>> {
        let request = Request::builder()
            .uri(uri)
            .body(Vec::new())
            .expect("a request");
        library.respond(&request).await
    }

    fn kept(dir: &Path, bytes: &[u8]) -> bool {
        dir.join("objects").join(hash(bytes)).is_file()
    }

    #[tokio::test]
    async fn a_file_is_read_from_the_site_and_then_from_the_cache() -> std::io::Result<()> {
        let site = Site::new(&[("fonts/heebo/heebo latin.woff2", b"font")]).await?;
        let dir = tempfile::tempdir()?;
        let library = MediaLibrary::new(site.base(), dir.path().to_path_buf());
        assert_eq!(library.refresh().await, Refresh::Changed);

        for _ in 0..2 {
            let uri = "http://media.localhost/fonts/heebo/heebo%20latin.woff2";
            let font = get(&library, uri).await;
            assert_eq!(font.status(), StatusCode::OK);
            assert_eq!(font.headers()["content-type"], "font/woff2");
            assert_eq!(font.headers()["access-control-allow-origin"], "*");
            assert_eq!(font.body(), b"font");
        }
        assert_eq!(site.requests_for("fonts/heebo/heebo%20latin.woff2"), 1);
        assert!(kept(dir.path(), b"font"));
        Ok(())
    }

    #[tokio::test]
    async fn the_pages_read_the_manifest_the_app_goes_by() -> std::io::Result<()> {
        let site = Site::new(&[("icons/hebrew.json", b"{}")]).await?;
        let dir = tempfile::tempdir()?;
        let library = MediaLibrary::new(site.base(), dir.path().to_path_buf());
        library.refresh().await;
        let manifest = get(&library, "http://media.localhost/manifest.json").await;
        assert_eq!(manifest.status(), StatusCode::OK);
        assert_eq!(manifest.headers()["content-type"], "application/json");
        let paths = Manifest::parse(manifest.body()).map(|read| read.files.into_keys().collect());
        assert_eq!(paths, Some(vec!["icons/hebrew.json".to_owned()]));
        Ok(())
    }

    #[tokio::test]
    async fn without_the_network_the_cache_answers() -> std::io::Result<()> {
        let site =
            Site::new(&[("icons/hebrew.json", b"{\"a\":1}"), ("icons/b.json", b"[]")]).await?;
        let dir = tempfile::tempdir()?;
        let online = MediaLibrary::new(site.base(), dir.path().to_path_buf());
        online.refresh().await;
        // The app used one of the two files.
        get(&online, "http://media.localhost/icons/hebrew.json").await;

        // The next start, with the network gone: the manifest and the file used are those kept.
        let offline = MediaLibrary::new(url(UNREACHABLE), dir.path().to_path_buf());
        assert_eq!(offline.refresh().await, Refresh::Offline);
        let words = get(&offline, "http://media.localhost/icons/hebrew.json").await;
        assert_eq!(words.status(), StatusCode::OK);
        assert_eq!(words.body(), b"{\"a\":1}");
        let unused = get(&offline, "http://media.localhost/icons/b.json").await;
        assert_eq!(unused.status(), StatusCode::SERVICE_UNAVAILABLE);
        let missing = get(&offline, "http://media.localhost/icons/nothing.json").await;
        assert_eq!(missing.status(), StatusCode::NOT_FOUND);
        Ok(())
    }

    #[tokio::test]
    async fn a_file_neither_kept_nor_reachable_is_unavailable() -> std::io::Result<()> {
        let site = Site::new(&[("images/templates/a.webp", b"webp")]).await?;
        let dir = tempfile::tempdir()?;
        // Only the manifest is kept.
        let online = MediaLibrary::new(site.base(), dir.path().to_path_buf());
        online.refresh().await;
        let offline = MediaLibrary::new(url(UNREACHABLE), dir.path().to_path_buf());
        offline.refresh().await;
        let picture = get(&offline, "http://media.localhost/images/templates/a.webp").await;
        assert_eq!(picture.status(), StatusCode::SERVICE_UNAVAILABLE);
        assert!(picture.body().is_empty());
        Ok(())
    }

    #[tokio::test]
    async fn a_library_never_reached_or_never_published_has_nothing() -> std::io::Result<()> {
        let dir = tempfile::tempdir()?;
        let library = MediaLibrary::new(url(UNREACHABLE), dir.path().to_path_buf());
        assert_eq!(library.refresh().await, Refresh::Offline);
        for uri in [
            "http://media.localhost/manifest.json",
            "http://media.localhost/icons/hebrew.json",
        ] {
            assert_eq!(
                get(&library, uri).await.status(),
                StatusCode::NOT_FOUND,
                "{uri}"
            );
        }

        // A site that answers, but has no library.
        let none = serve(|_: &Seen| Reply::bytes(404, "text/html", b"none".to_vec())).await?;
        let library = MediaLibrary::new(url(&none.base), dir.path().to_path_buf());
        assert_eq!(library.refresh().await, Refresh::Missing);
        let words = get(&library, "http://media.localhost/icons/hebrew.json").await;
        assert_eq!(words.status(), StatusCode::NOT_FOUND);

        // A site whose answer is not a manifest: a page of a site that is something else.
        let other = serve(|_: &Seen| Reply::bytes(200, "text/html", b"<html>".to_vec())).await?;
        let library = MediaLibrary::new(url(&other.base), dir.path().to_path_buf());
        assert_eq!(library.refresh().await, Refresh::Missing);
        assert!(library.current().is_none());
        Ok(())
    }

    #[tokio::test]
    async fn an_empty_library_answers_its_manifest_and_nothing_else() -> std::io::Result<()> {
        let site = Site::new(&[]).await?;
        let dir = tempfile::tempdir()?;
        let library = MediaLibrary::new(site.base(), dir.path().to_path_buf());
        assert_eq!(library.refresh().await, Refresh::Changed);
        let manifest = get(&library, "http://media.localhost/manifest.json").await;
        assert_eq!(manifest.status(), StatusCode::OK);
        let words = get(&library, "http://media.localhost/icons/hebrew.json").await;
        assert_eq!(words.status(), StatusCode::NOT_FOUND);
        // It was not asked of the site: the manifest does not name it.
        assert_eq!(site.requests_for("icons/hebrew.json"), 0);
        Ok(())
    }

    #[tokio::test]
    async fn a_new_publication_replaces_what_is_kept() -> std::io::Result<()> {
        let site =
            Site::new(&[("icons/hebrew.json", b"old"), ("icons/gone.json", b"gone")]).await?;
        let dir = tempfile::tempdir()?;
        let library = MediaLibrary::new(site.base(), dir.path().to_path_buf());
        library.refresh().await;
        for uri in [
            "http://media.localhost/icons/hebrew.json",
            "http://media.localhost/icons/gone.json",
        ] {
            get(&library, uri).await;
        }
        assert!(kept(dir.path(), b"old"));
        assert!(kept(dir.path(), b"gone"));

        site.set("icons/hebrew.json", Some(b"new"));
        site.set("icons/gone.json", None);
        let next = MediaLibrary::new(site.base(), dir.path().to_path_buf());
        assert_eq!(next.refresh().await, Refresh::Changed);
        // What the new manifest does not name left the cache with it.
        assert!(!kept(dir.path(), b"old"));
        assert!(!kept(dir.path(), b"gone"));
        let words = get(&next, "http://media.localhost/icons/hebrew.json").await;
        assert_eq!(words.body(), b"new");
        assert!(kept(dir.path(), b"new"));
        let gone = get(&next, "http://media.localhost/icons/gone.json").await;
        assert_eq!(gone.status(), StatusCode::NOT_FOUND);
        Ok(())
    }

    #[tokio::test]
    async fn bytes_other_than_the_manifest_names_are_answered_but_not_kept() -> std::io::Result<()>
    {
        let site = Site::new(&[("icons/hebrew.json", b"listed")]).await?;
        let dir = tempfile::tempdir()?;
        let library = MediaLibrary::new(site.base(), dir.path().to_path_buf());
        library.refresh().await;
        // Published again after this manifest was read.
        site.set("icons/hebrew.json", Some(b"newer"));
        let words = get(&library, "http://media.localhost/icons/hebrew.json").await;
        assert_eq!(words.body(), b"newer");
        assert!(!kept(dir.path(), b"listed"));
        assert!(!kept(dir.path(), b"newer"));
        Ok(())
    }

    #[tokio::test]
    async fn only_what_is_asked_for_is_fetched_and_kept() -> std::io::Result<()> {
        let site = Site::new(&[("a.json", b"a"), ("b/c.json", b"c"), ("b/d.webp", b"d")]).await?;
        let dir = tempfile::tempdir()?;
        let library = MediaLibrary::new(site.base(), dir.path().to_path_buf());
        library.start();
        get(&library, "http://media.localhost/b/c.json").await;
        // Time for anything the start might fetch on its own.
        tokio::time::sleep(Duration::from_millis(300)).await;
        assert_eq!(site.requests_for("b/c.json"), 1);
        assert_eq!(site.requests_for("a.json"), 0);
        assert_eq!(site.requests_for("b/d.webp"), 0);
        assert!(kept(dir.path(), b"c"));
        assert!(!kept(dir.path(), b"a"));
        assert!(!kept(dir.path(), b"d"));
        Ok(())
    }

    #[tokio::test]
    async fn nothing_outside_the_library_is_served() -> std::io::Result<()> {
        let site = Site::new(&[("icons/hebrew.json", b"{}")]).await?;
        let dir = tempfile::tempdir()?;
        let library = MediaLibrary::new(site.base(), dir.path().to_path_buf());
        library.refresh().await;
        for uri in [
            "http://media.localhost/",
            "http://media.localhost/missing.json",
            "http://media.localhost/../secret.txt",
            "http://media.localhost/%2e%2e/secret.txt",
            "http://media.localhost/..%5Csecret.txt",
            "http://media.localhost/icons/..%2F..%2Fsecret.txt",
            "http://media.localhost/C%3A/Windows/win.ini",
            "http://media.localhost//Windows/win.ini",
        ] {
            let response = get(&library, uri).await;
            assert_eq!(response.status(), StatusCode::NOT_FOUND, "{uri}");
            assert!(response.body().is_empty(), "{uri}");
        }
        Ok(())
    }

    #[test]
    fn a_manifest_names_only_plain_paths_and_hashes() {
        let good = hash(b"x");
        let text = format!(
            r#"{{"version":1,"files":{{
                "icons/a.json":{{"size":1,"sha256":"{good}"}},
                "../secret.txt":{{"size":1,"sha256":"{good}"}},
                "C:/win.ini":{{"size":1,"sha256":"{good}"}},
                "icons/b.json":{{"size":1,"sha256":"not a hash"}}
            }}}}"#
        );
        let paths = Manifest::parse(text.as_bytes()).map(|read| read.files.into_keys().collect());
        assert_eq!(paths, Some(vec!["icons/a.json".to_owned()]));
    }

    #[tokio::test]
    async fn the_library_is_only_read() {
        let library = MediaLibrary::new(url(UNREACHABLE), PathBuf::from("unused"));
        let request = Request::builder()
            .method(Method::POST)
            .uri("http://media.localhost/icons/hebrew.json")
            .body(Vec::new())
            .expect("a request");
        let response = library.respond(&request).await;
        assert_eq!(response.status(), StatusCode::METHOD_NOT_ALLOWED);
    }

    #[test]
    fn the_published_library_is_read_unless_a_development_copy_is_named() {
        if std::env::var(VARIABLE).is_err() {
            assert_eq!(base_url().map(String::from).as_deref(), Some(DEFAULT_URL));
        }
        let folder = folder_url("https://preview.slidr-media.pages.dev").map(String::from);
        assert_eq!(
            folder.as_deref(),
            Some("https://preview.slidr-media.pages.dev/")
        );
    }

    #[test]
    fn an_installation_may_name_a_copy_of_its_own() -> std::io::Result<()> {
        let dir = tempfile::tempdir()?;
        let base = |dir: &Path| installed_base(dir).map(String::from);
        assert_eq!(base(dir.path()).as_deref(), Some(DEFAULT_URL));
        let named = |text: &[u8]| -> std::io::Result<Option<String>> {
            std::fs::write(dir.path().join(ADDRESS_FILE), text)?;
            Ok(base(dir.path()))
        };
        for (text, url) in [
            (
                br#"{ "url": "https://media.example.org/slidr" }"#.as_slice(),
                "https://media.example.org/slidr/",
            ),
            (
                b"\xEF\xBB\xBF{\"url\":\"https://media.example.org/\"}",
                "https://media.example.org/",
            ),
            (
                br#"{"url":"http://127.0.0.1:8080/"}"#,
                "http://127.0.0.1:8080/",
            ),
        ] {
            assert_eq!(named(text)?.as_deref(), Some(url), "{url}");
        }
        // Not plain HTTP across the network, nor what is not an address: no library at all, and
        // not the published one.
        for text in [
            br#"{"url":"http://media.example.org/"}"#.as_slice(),
            br#"{"url":"file:///C:/media/"}"#,
            br#"{"url":""}"#,
            b"https://media.example.org/",
            b"{}",
            b"",
        ] {
            assert_eq!(named(text)?, None, "{}", String::from_utf8_lossy(text));
        }
        // Nor a file that cannot be read.
        let folder = tempfile::tempdir()?;
        std::fs::create_dir(folder.path().join(ADDRESS_FILE))?;
        assert_eq!(base(folder.path()), None);
        Ok(())
    }
}
