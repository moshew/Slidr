//! The media library: the graphics the app offers (the icon sets, the photographs of the
//! built-in templates, the built-in fonts of decks), kept in a folder beside the executable and
//! not inside it.
//!
//! ```text
//! <folder of slidr.exe>/media/icons/lucide/icon-nodes.json
//! <folder of slidr.exe>/media/images/templates/shvil-ridge.webp
//! <folder of slidr.exe>/media/fonts/heebo/heebo-hebrew-wght-normal.woff2
//! ```
//!
//! The pages reach it through a protocol of its own, `media` (`http://media.localhost/<path>`
//! in WebView2), and never by a path: where the folder is, is known here alone. A build of the
//! source content lives in a sibling `Slidr-media` directory. The bundle's resources copy
//! its active folders beside the executable; `build/media.ts` supplies their protocol addresses.
//!
//! The protocol only reads: a `GET` of a file inside the folder answers with the file, and
//! anything else with an error.

use std::path::{Component, Path, PathBuf};

use percent_encoding::percent_decode_str;
use tauri::{
    Manager,
    http::{Method, Request, Response, StatusCode, header},
};

/// The scheme of the protocol, and so the first label of its host in WebView2.
pub const SCHEME: &str = "media";

/// The folder's name beside the executable.
const DIR: &str = "media";

/// Where the media library of the running app is: among the resources that came with the
/// installer, which on Windows is the folder of the executable.
pub fn root<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Option<PathBuf> {
    let beside = app.path().resource_dir().ok().or_else(|| {
        // An app run without a bundle has no resources; it still has an executable.
        let exe = std::env::current_exe().ok()?;
        exe.parent().map(Path::to_path_buf)
    })?;
    Some(beside.join(DIR))
}

/// The file a path of the protocol names. None for a path that is not plain names under the
/// folder: one that climbs out of it, starts again at a root, or names a drive or a stream.
fn file_of(root: &Path, uri_path: &str) -> Option<PathBuf> {
    let decoded = percent_decode_str(uri_path).decode_utf8().ok()?;
    let relative = decoded.trim_start_matches('/');
    if relative.is_empty() || relative.contains(['\\', ':']) {
        return None;
    }
    let mut file = root.to_path_buf();
    for part in Path::new(relative).components() {
        match part {
            Component::Normal(name) => file.push(name),
            _ => return None,
        }
    }
    Some(file)
}

/// The type a file of the library is served as, by its extension.
fn content_type(file: &Path) -> &'static str {
    match file
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

/// The answer of the protocol to a request, for a library in `root`.
pub fn respond(root: Option<&Path>, request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
    if !matches!(*request.method(), Method::GET | Method::HEAD) {
        return refusal(StatusCode::METHOD_NOT_ALLOWED);
    }
    let Some(file) = root.and_then(|root| file_of(root, request.uri().path())) else {
        return refusal(StatusCode::NOT_FOUND);
    };
    match std::fs::read(&file) {
        Ok(bytes) => answer(StatusCode::OK, content_type(&file), bytes),
        Err(_) => refusal(StatusCode::NOT_FOUND),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn get(root: &Path, uri: &str) -> Response<Vec<u8>> {
        let request = Request::builder()
            .uri(uri)
            .body(Vec::new())
            .expect("a request");
        respond(Some(root), &request)
    }

    #[test]
    fn a_file_of_the_library_is_served_with_its_type() -> std::io::Result<()> {
        let dir = tempfile::tempdir()?;
        let fonts = dir.path().join("fonts").join("heebo");
        std::fs::create_dir_all(&fonts)?;
        std::fs::write(fonts.join("heebo latin.woff2"), b"font")?;
        std::fs::create_dir_all(dir.path().join("icons"))?;
        std::fs::write(dir.path().join("icons").join("hebrew.json"), b"{}")?;

        let font = get(
            dir.path(),
            "http://media.localhost/fonts/heebo/heebo%20latin.woff2",
        );
        assert_eq!(font.status(), StatusCode::OK);
        assert_eq!(font.headers()["content-type"], "font/woff2");
        assert_eq!(font.headers()["access-control-allow-origin"], "*");
        assert_eq!(font.body(), b"font");

        let words = get(dir.path(), "media://localhost/icons/hebrew.json?v=1");
        assert_eq!(words.status(), StatusCode::OK);
        assert_eq!(words.headers()["content-type"], "application/json");
        assert_eq!(words.body(), b"{}");
        Ok(())
    }

    #[test]
    fn nothing_outside_the_library_is_served() -> std::io::Result<()> {
        let dir = tempfile::tempdir()?;
        let root = dir.path().join("media");
        std::fs::create_dir_all(&root)?;
        std::fs::write(dir.path().join("secret.txt"), b"secret")?;
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
            let response = get(&root, uri);
            assert_eq!(response.status(), StatusCode::NOT_FOUND, "{uri}");
            assert!(response.body().is_empty(), "{uri}");
        }
        Ok(())
    }

    #[test]
    fn the_library_is_only_read() {
        let request = Request::builder()
            .method(Method::POST)
            .uri("http://media.localhost/icons/hebrew.json")
            .body(Vec::new())
            .expect("a request");
        let response = respond(Some(Path::new("media")), &request);
        assert_eq!(response.status(), StatusCode::METHOD_NOT_ALLOWED);
    }

    #[test]
    fn an_app_without_a_library_answers_not_found() {
        let request = Request::builder()
            .uri("http://media.localhost/icons/hebrew.json")
            .body(Vec::new())
            .expect("a request");
        assert_eq!(respond(None, &request).status(), StatusCode::NOT_FOUND);
    }
}
