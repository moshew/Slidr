//! The content-addressed asset store of a workspace (SPEC 5.7): `assets/<sha256>.<ext>`.
//!
//! Importing never deletes. A file nobody refers to any more stays until the workspace goes
//! away, because undo may bring the reference back; a save simply does not pack it.

use std::{
    ffi::OsStr,
    fmt::Write as _,
    fs::{self, File},
    io::{self, Read, Write},
    path::Path,
};

use serde::Serialize;
use sha2::{Digest, Sha256};

use crate::{
    error::{AppError, Result},
    storage::TempFile,
};

/// How much of the start of a file content sniffing looks at.
const HEAD_LEN: usize = 64 * 1024;

/// Same values as `AssetMeta.kind` in `packages/model`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum AssetKind {
    /// A raster image the webview can show.
    Image,
    /// An SVG document.
    Svg,
    /// A video.
    Video,
    /// Sound.
    Audio,
    /// A font face (WOFF2, WOFF, TTF, OTF).
    Font,
    /// Anything else, kept as it is.
    Other,
}

/// An asset now in the store. The webview turns it into an `AssetMeta` by adding `origin`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedAsset {
    /// Lowercase hex sha256 of the content.
    pub id: String,
    /// File name inside `assets/`: `<id>.<ext>`.
    pub file: String,
    /// Detected from the content first, the file name second.
    pub mime: String,
    /// What kind of element can show it.
    pub kind: AssetKind,
    /// Size of the content in bytes.
    pub bytes: u64,
    /// Natural width in pixels (raster images, and SVGs that state it).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub width: Option<f64>,
    /// Natural height in pixels.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub height: Option<f64>,
    /// The name the content came with (file name or the name given with the bytes).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

/// Copies the file at `source` into `assets_dir`. Streams, so a large video is never held in
/// memory.
pub fn import_file(assets_dir: &Path, source: &Path) -> Result<ImportedAsset> {
    let file = File::open(source).map_err(|e| AppError::path(source, &e))?;
    let name = source
        .file_name()
        .map(|name| name.to_string_lossy().into_owned());
    import(assets_dir, name, file, |e| AppError::path(source, e))
}

/// Stores `bytes` (a paste or a drop) in `assets_dir`. `name` helps only when the content
/// itself says nothing about its type.
pub fn import_bytes(
    assets_dir: &Path,
    name: Option<String>,
    bytes: &[u8],
) -> Result<ImportedAsset> {
    import(assets_dir, name, bytes, |e| AppError::internal(e))
}

fn import(
    assets_dir: &Path,
    name: Option<String>,
    mut source: impl Read,
    read_error: impl Fn(&io::Error) -> AppError,
) -> Result<ImportedAsset> {
    let write_error = |e: &io::Error| AppError::io("write the asset", e);
    fs::create_dir_all(assets_dir).map_err(|e| write_error(&e))?;

    // Hash while copying into a temp file: one pass, and the store only ever sees complete
    // files under their final name.
    let temp = TempFile::new_in(assets_dir).map_err(|e| write_error(&e))?;
    let mut out = temp.file().map_err(|e| write_error(&e))?;
    let mut hasher = Sha256::new();
    let mut head = Vec::new();
    let mut size = 0_u64;
    let mut buffer = vec![0_u8; 64 * 1024];
    loop {
        let read = match source.read(&mut buffer) {
            Ok(0) => break,
            Ok(read) => read,
            Err(e) if e.kind() == io::ErrorKind::Interrupted => continue,
            Err(e) => return Err(read_error(&e)),
        };
        let chunk = &buffer[..read];
        hasher.update(chunk);
        let wanted = HEAD_LEN.saturating_sub(head.len()).min(read);
        head.extend_from_slice(&chunk[..wanted]);
        out.write_all(chunk).map_err(|e| write_error(&e))?;
        size += read as u64;
    }

    let id = hex(&hasher.finalize());
    let detected = detect(&head, name.as_deref());
    let file = format!("{id}.{}", detected.extension);
    let target = assets_dir.join(&file);
    if target.is_file() {
        // Content seen before: the stored copy is it. Dropping the temp file deletes it.
        drop(temp);
    } else {
        temp.persist(&target).map_err(|e| write_error(&e))?;
    }

    let (width, height) = dimensions(&target, &head, detected.kind).unzip();
    Ok(ImportedAsset {
        id,
        file,
        mime: detected.mime,
        kind: detected.kind,
        bytes: size,
        width,
        height,
        name,
    })
}

fn hex(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        let _ = write!(out, "{byte:02x}");
    }
    out
}

/// What the store calls a piece of content.
#[derive(Debug, PartialEq, Eq)]
struct Detected {
    extension: String,
    mime: String,
    kind: AssetKind,
}

impl Detected {
    fn other(extension: &str, mime: &str) -> Self {
        Self {
            extension: extension.to_ascii_lowercase(),
            mime: mime.into(),
            kind: AssetKind::Other,
        }
    }
}

/// The formats the editor knows what to do with: extension, MIME type, kind.
const KNOWN: [(&str, &str, AssetKind); 29] = [
    ("png", "image/png", AssetKind::Image),
    ("jpg", "image/jpeg", AssetKind::Image),
    ("gif", "image/gif", AssetKind::Image),
    ("webp", "image/webp", AssetKind::Image),
    ("avif", "image/avif", AssetKind::Image),
    ("bmp", "image/bmp", AssetKind::Image),
    ("ico", "image/x-icon", AssetKind::Image),
    ("tif", "image/tiff", AssetKind::Image),
    ("heif", "image/heif", AssetKind::Image),
    ("svg", "image/svg+xml", AssetKind::Svg),
    ("mp4", "video/mp4", AssetKind::Video),
    ("m4v", "video/x-m4v", AssetKind::Video),
    ("webm", "video/webm", AssetKind::Video),
    ("mov", "video/quicktime", AssetKind::Video),
    ("mkv", "video/x-matroska", AssetKind::Video),
    ("avi", "video/x-msvideo", AssetKind::Video),
    ("ogv", "video/ogg", AssetKind::Video),
    ("mp3", "audio/mpeg", AssetKind::Audio),
    ("m4a", "audio/mp4", AssetKind::Audio),
    ("aac", "audio/aac", AssetKind::Audio),
    ("ogg", "audio/ogg", AssetKind::Audio),
    ("opus", "audio/ogg", AssetKind::Audio),
    ("wav", "audio/wav", AssetKind::Audio),
    ("flac", "audio/flac", AssetKind::Audio),
    ("woff2", "font/woff2", AssetKind::Font),
    ("woff", "font/woff", AssetKind::Font),
    ("ttf", "font/ttf", AssetKind::Font),
    ("otf", "font/otf", AssetKind::Font),
    ("ttc", "font/collection", AssetKind::Font),
];

/// Other spellings of extensions in [`KNOWN`].
const ALIASES: [(&str, &str); 4] = [
    ("jpeg", "jpg"),
    ("jpe", "jpg"),
    ("tiff", "tif"),
    ("heic", "heif"),
];

fn known(extension: &str) -> Option<Detected> {
    let extension = extension.to_ascii_lowercase();
    let extension = ALIASES
        .iter()
        .find(|(alias, _)| *alias == extension)
        .map_or(extension.as_str(), |(_, canonical)| canonical);
    KNOWN
        .iter()
        .find(|(known, ..)| *known == extension)
        .map(|&(extension, mime, kind)| Detected {
            extension: extension.into(),
            mime: mime.into(),
            kind,
        })
}

/// Content first, file name second.
fn detect(head: &[u8], name: Option<&str>) -> Detected {
    if svg_root_attributes(&String::from_utf8_lossy(head)).is_some() {
        return Detected {
            extension: "svg".into(),
            mime: "image/svg+xml".into(),
            kind: AssetKind::Svg,
        };
    }
    let sniffed = infer::get(head);
    let name_extension = name
        .and_then(|name| Path::new(name).extension())
        .and_then(OsStr::to_str);

    // Binary signatures are reliable. Text sniffing (HTML, XML) is a guess the name may correct.
    if let Some(found) = sniffed.filter(|found| found.matcher_type() != infer::MatcherType::Text) {
        return known(found.extension())
            .unwrap_or_else(|| Detected::other(found.extension(), found.mime_type()));
    }
    if let Some(found) = name_extension.and_then(known) {
        return found;
    }
    if let Some(found) = sniffed {
        return Detected::other(found.extension(), found.mime_type());
    }
    let extension = name_extension
        .filter(|extension| {
            (1..=10).contains(&extension.len())
                && extension.bytes().all(|b| b.is_ascii_alphanumeric())
        })
        .unwrap_or("bin");
    Detected::other(extension, "application/octet-stream")
}

fn dimensions(path: &Path, head: &[u8], kind: AssetKind) -> Option<(f64, f64)> {
    let (width, height) = match kind {
        // Reads only as much of the file as the header needs.
        AssetKind::Image => {
            let size = imagesize::size(path).ok()?;
            (size.width as f64, size.height as f64)
        }
        AssetKind::Svg => svg_size(&String::from_utf8_lossy(head))?,
        _ => return None,
    };
    (width > 0.0 && height > 0.0).then_some((width, height))
}

/// The attribute text of the root `<svg ...>` tag, when the document is an SVG: what precedes
/// it may only be an XML declaration, processing instructions, comments and a doctype.
fn svg_root_attributes(text: &str) -> Option<&str> {
    let mut rest = text.trim_start_matches('\u{feff}').trim_start();
    loop {
        let after = if let Some(after) = rest.strip_prefix("<?") {
            after.split_once("?>").map(|(_, after)| after)
        } else if let Some(after) = rest.strip_prefix("<!--") {
            after.split_once("-->").map(|(_, after)| after)
        } else if let Some(after) = rest.strip_prefix("<!") {
            skip_doctype(after)
        } else {
            break;
        };
        rest = after?.trim_start();
    }
    let after = rest.strip_prefix("<svg")?;
    if !after.starts_with(|c: char| c.is_whitespace() || c == '>' || c == '/') {
        return None;
    }
    after.find('>').map(|end| &after[..end])
}

/// Skips the rest of `<!DOCTYPE ...>`, including an internal subset in brackets.
fn skip_doctype(after: &str) -> Option<&str> {
    let close = after.find('>')?;
    match after.find('[') {
        Some(open) if open < close => {
            let (_, after_subset) = after[open..].split_once(']')?;
            after_subset.split_once('>').map(|(_, after)| after)
        }
        _ => after.get(close + 1..),
    }
}

/// `width`/`height` in pixels, else the size of the `viewBox`.
fn svg_size(text: &str) -> Option<(f64, f64)> {
    let tag = svg_root_attributes(text)?;
    let width = attribute(tag, "width").and_then(pixels);
    let height = attribute(tag, "height").and_then(pixels);
    if let (Some(width), Some(height)) = (width, height) {
        return Some((width, height));
    }
    let view_box = attribute(tag, "viewBox")?
        .split(|c: char| c.is_whitespace() || c == ',')
        .filter(|part| !part.is_empty())
        .map(str::parse::<f64>)
        .collect::<std::result::Result<Vec<_>, _>>()
        .ok()?;
    match view_box[..] {
        [_, _, width, height] => Some((width, height)),
        _ => None,
    }
}

/// The value of `name="..."` (or single quotes) in a tag's attribute text.
fn attribute<'a>(tag: &'a str, name: &str) -> Option<&'a str> {
    let mut rest = tag;
    while let Some(at) = rest.find(name) {
        // `width` must not match the end of `stroke-width`.
        let starts_attribute = rest[..at].ends_with(char::is_whitespace);
        rest = &rest[at + name.len()..];
        let Some(value) = rest.trim_start().strip_prefix('=') else {
            continue;
        };
        if !starts_attribute {
            continue;
        }
        let value = value.trim_start();
        let quote = value.chars().next().filter(|c| *c == '"' || *c == '\'')?;
        let value = &value[1..];
        return value.find(quote).map(|end| &value[..end]);
    }
    None
}

/// A length in user units or `px`; relative units (`%`, `em`) say nothing about pixels.
fn pixels(value: &str) -> Option<f64> {
    let value = value.trim();
    let number = value.strip_suffix("px").unwrap_or(value).trim();
    number
        .parse::<f64>()
        .ok()
        .filter(|n| n.is_finite() && *n > 0.0)
}

/// A valid PNG header of the given size; enough for sniffing and for `imagesize`.
#[cfg(test)]
pub(crate) fn tiny_png(width: u32, height: u32) -> Vec<u8> {
    let mut png = b"\x89PNG\r\n\x1a\n\0\0\0\x0dIHDR".to_vec();
    png.extend_from_slice(&width.to_be_bytes());
    png.extend_from_slice(&height.to_be_bytes());
    png.extend_from_slice(&[8, 6, 0, 0, 0, 0, 0, 0, 0]);
    png
}

#[cfg(test)]
mod tests {
    use super::*;

    type TestResult = std::result::Result<(), Box<dyn std::error::Error>>;

    fn file_names(dir: &Path) -> io::Result<Vec<String>> {
        let mut names = Vec::new();
        for entry in fs::read_dir(dir)? {
            names.push(entry?.file_name().to_string_lossy().into_owned());
        }
        names.sort();
        Ok(names)
    }

    #[test]
    fn the_same_content_is_stored_once() -> TestResult {
        let dir = tempfile::tempdir()?;
        let assets = dir.path().join("assets");
        let png = tiny_png(640, 480);
        let first = import_bytes(&assets, Some("a.png".into()), &png)?;
        let second = import_bytes(&assets, Some("copy of a.png".into()), &png)?;
        let source = dir.path().join("elsewhere.png");
        fs::write(&source, &png)?;
        let third = import_file(&assets, &source)?;

        assert_eq!(first.id.len(), 64);
        assert!(
            first
                .id
                .bytes()
                .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
        );
        assert_eq!(first.file, format!("{}.png", first.id));
        for again in [&second, &third] {
            assert_eq!(
                (again.id.as_str(), again.file.as_str()),
                (first.id.as_str(), first.file.as_str())
            );
        }
        assert_eq!(third.name.as_deref(), Some("elsewhere.png"));
        // One file, and no temp file left behind by the duplicates.
        assert_eq!(file_names(&assets)?, [first.file.as_str()]);
        assert_eq!(fs::read(assets.join(&first.file))?, png);
        Ok(())
    }

    #[test]
    fn raster_images_get_mime_kind_and_size() -> TestResult {
        let dir = tempfile::tempdir()?;
        // The name lies; the content wins.
        let asset = import_bytes(dir.path(), Some("photo.jpg".into()), &tiny_png(640, 480))?;
        assert_eq!(
            (asset.mime.as_str(), asset.kind),
            ("image/png", AssetKind::Image)
        );
        assert_eq!((asset.width, asset.height), (Some(640.0), Some(480.0)));
        assert_eq!(asset.bytes, tiny_png(640, 480).len() as u64);
        assert_eq!(asset.name.as_deref(), Some("photo.jpg"));
        Ok(())
    }

    #[test]
    fn svg_is_recognised_by_content_and_sized_when_cheap() -> TestResult {
        let dir = tempfile::tempdir()?;
        let svg = br#"<?xml version="1.0"?>
<!-- exported -->
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd" [
  <!ENTITY ns "http://www.w3.org/2000/svg">
]>
<svg xmlns="http://www.w3.org/2000/svg" stroke-width="3" width="120px" height="80"><rect/></svg>"#;
        let asset = import_bytes(dir.path(), None, svg)?;
        assert_eq!(
            (asset.mime.as_str(), asset.kind),
            ("image/svg+xml", AssetKind::Svg)
        );
        assert!(asset.file.ends_with(".svg"));
        assert_eq!((asset.width, asset.height), (Some(120.0), Some(80.0)));

        assert_eq!(
            svg_size(r#"<svg viewBox="0 0 24 16" width="100%"><path/></svg>"#),
            Some((24.0, 16.0))
        );
        assert_eq!(svg_size(r#"<svg width="2em" height="1em"/>"#), None);
        // An HTML page that contains an SVG is not an SVG.
        assert_eq!(
            svg_root_attributes("<!DOCTYPE html><html><svg></svg></html>"),
            None
        );
        assert_eq!(svg_root_attributes("<svgx/>"), None);
        Ok(())
    }

    #[test]
    fn fonts_are_assets_of_kind_font() -> TestResult {
        let dir = tempfile::tempdir()?;
        let cases: [(&[u8], &str, &str); 4] = [
            (b"wOF2\0\x01\0\0 more font bytes", "font/woff2", "woff2"),
            (b"wOFF\0\x01\0\0 more font bytes", "font/woff", "woff"),
            (
                b"\0\x01\0\0\0\x0c\0\x80\0\x03\0\x40 more font bytes",
                "font/ttf",
                "ttf",
            ),
            (
                b"OTTO\0\x0c\0\x80\0\x03\0\x40 more font bytes",
                "font/otf",
                "otf",
            ),
        ];
        for (bytes, mime, extension) in cases {
            let asset = import_bytes(dir.path(), Some("Heebo".into()), bytes)?;
            assert_eq!(
                (asset.mime.as_str(), asset.kind),
                (mime, AssetKind::Font),
                "{mime}"
            );
            assert!(
                asset.file.ends_with(&format!(".{extension}")),
                "{}",
                asset.file
            );
            assert_eq!(asset.width, None);
        }
        Ok(())
    }

    #[test]
    fn the_name_decides_when_the_content_does_not() {
        let text = b"plain text";
        assert_eq!(detect(text, Some("Logo.SVG")).kind, AssetKind::Svg);
        assert_eq!(detect(text, Some("clip.JPEG")).extension, "jpg");
        assert_eq!(detect(text, Some("Font.woff2")).mime, "font/woff2");
        assert_eq!(
            detect(text, Some("notes.txt")),
            Detected::other("txt", "application/octet-stream")
        );
        assert_eq!(
            detect(text, Some("weird.../")),
            Detected::other("bin", "application/octet-stream")
        );
        assert_eq!(
            detect(text, None),
            Detected::other("bin", "application/octet-stream")
        );
        assert_eq!(detect(b"", Some("empty.png")).kind, AssetKind::Image);
    }

    #[test]
    fn a_missing_source_file_is_not_found() -> TestResult {
        let dir = tempfile::tempdir()?;
        let error = import_file(dir.path(), &dir.path().join("missing.png"))
            .map_err(|e| e.kind)
            .err();
        assert_eq!(error, Some(crate::error::ErrorKind::NotFound));
        Ok(())
    }
}
