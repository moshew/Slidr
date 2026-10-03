//! The `.slidr` file: a ZIP of the workspace (SPEC 5.8).

use std::{
    collections::BTreeSet,
    fs::{self, File},
    io::{self, BufReader, BufWriter, Read, Seek, Write},
    path::{Path, PathBuf},
};

use zip::{CompressionMethod, ZipArchive, ZipWriter, result::ZipError, write::SimpleFileOptions};

use super::{
    ASSETS_DIR, DECK_FILE, LOCK_FILE, META_FILE, STATE_FILE,
    atomic::{self, TempFile},
};
use crate::error::{AppError, Result};

/// Directories other work groups fill; open and save carry them through as they are.
const CARRIED_DIRS: [&str; 3] = ["thumbs", "chat", "source"];

/// Formats that are already compressed: deflating them again costs time and saves nothing.
const STORED_EXTENSIONS: [&str; 21] = [
    "png", "jpg", "jpeg", "gif", "webp", "avif", "heif", "heic", "mp4", "m4v", "webm", "mov",
    "mkv", "mp3", "m4a", "aac", "ogg", "ogv", "flac", "woff", "woff2",
];

/// Builds the archive at `target` from the workspace: `deck.json`, `meta.json`, the carried
/// directories, and of `assets/` only the files named in `asset_files`.
///
/// The archive is written to a temp file next to `target` and renamed over it once it is
/// complete and synced, so a failure at any point leaves an existing `target` as it was and
/// no temp file behind.
///
/// Returns the referenced asset files that are not in the workspace; they are skipped rather
/// than failing the save, so the user never loses the deck over a missing picture.
pub(crate) fn pack(
    workspace: &Path,
    target: &Path,
    asset_files: &BTreeSet<String>,
) -> Result<Vec<String>> {
    let parent = target
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .ok_or_else(|| AppError::invalid_input(format!("not a file path: {}", target.display())))?;
    let temp = TempFile::new_in(parent).map_err(|e| AppError::path(parent, &e))?;
    let file = temp
        .file()
        .map_err(|e| AppError::io("open the temp file", &e))?;
    let mut zip = ZipWriter::new(BufWriter::new(file));

    for name in [DECK_FILE, META_FILE] {
        if !add_file(&mut zip, name, &workspace.join(name))? {
            return Err(AppError::internal(format!(
                "{name} is missing from the workspace"
            )));
        }
    }
    let mut missing = Vec::new();
    for name in asset_files {
        let entry = format!("{ASSETS_DIR}/{name}");
        if !add_file(&mut zip, &entry, &workspace.join(ASSETS_DIR).join(name))? {
            missing.push(name.clone());
        }
    }
    for dir in CARRIED_DIRS {
        add_dir(&mut zip, workspace, dir)?;
    }

    let writer = zip.finish().map_err(|e| write_error(&e))?;
    writer
        .into_inner()
        .map_err(|e| AppError::io("flush the archive", e.error()))?;
    temp.persist(target)
        .map_err(|e| AppError::io(format_args!("replace {}", target.display()), &e))?;
    Ok(missing)
}

/// Adds one file under `name`. Returns `false` when the file does not exist.
fn add_file<W: Write + Seek>(zip: &mut ZipWriter<W>, name: &str, path: &Path) -> Result<bool> {
    let read_error = |e: &io::Error| AppError::io(format_args!("read {}", path.display()), e);
    let mut file = match File::open(path) {
        Ok(file) => file,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(false),
        Err(e) => return Err(read_error(&e)),
    };
    let size = file.metadata().map_err(|e| read_error(&e))?.len();
    let options = SimpleFileOptions::default()
        .compression_method(compression_for(name))
        // ZIP64 sizes are needed from 4 GiB up (a long video).
        .large_file(size >= u64::from(u32::MAX));
    zip.start_file(name, options).map_err(|e| write_error(&e))?;
    io::copy(&mut file, zip).map_err(|e| AppError::io(format_args!("pack {name}"), &e))?;
    Ok(true)
}

/// Adds every file under `workspace/relative`, recursively, in a stable order.
fn add_dir<W: Write + Seek>(
    zip: &mut ZipWriter<W>,
    workspace: &Path,
    relative: &str,
) -> Result<()> {
    let dir = workspace.join(relative);
    let read_error = |e: &io::Error| AppError::io(format_args!("read {}", dir.display()), e);
    let entries = match fs::read_dir(&dir) {
        Ok(entries) => entries,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(read_error(&e)),
    };
    let mut entries = entries
        .collect::<io::Result<Vec<_>>>()
        .map_err(|e| read_error(&e))?;
    entries.sort_by_key(fs::DirEntry::file_name);
    for entry in entries {
        // A ZIP entry name is text; a name that is not Unicode cannot have come from the app.
        let Ok(name) = entry.file_name().into_string() else {
            continue;
        };
        if atomic::is_temp_name(&name) {
            continue;
        }
        let child = format!("{relative}/{name}");
        let file_type = entry.file_type().map_err(|e| read_error(&e))?;
        if file_type.is_dir() {
            add_dir(zip, workspace, &child)?;
        } else if file_type.is_file() {
            add_file(zip, &child, &entry.path())?;
        }
    }
    Ok(())
}

fn compression_for(name: &str) -> CompressionMethod {
    let stored = Path::new(name)
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            STORED_EXTENSIONS
                .iter()
                .any(|stored| stored.eq_ignore_ascii_case(extension))
        });
    if stored {
        CompressionMethod::Stored
    } else {
        CompressionMethod::Deflated
    }
}

fn write_error(error: &ZipError) -> AppError {
    match error {
        ZipError::Io(e) => AppError::io("write the archive", e),
        other => AppError::internal(format!("could not write the archive: {other}")),
    }
}

/// Extracts the archive at `source` into the (fresh) `workspace` directory.
///
/// Every entry name is checked before anything is written: an archive with a path that could
/// land outside the workspace (`..`, absolute, drive prefix) is rejected as a whole, and so is
/// one without `deck.json`.
pub(crate) fn unpack(source: &Path, workspace: &Path) -> Result<()> {
    let file = File::open(source).map_err(|e| AppError::path(source, &e))?;
    let mut archive = ZipArchive::new(BufReader::new(file))
        .map_err(|e| AppError::invalid_file(format!("not a .slidr file: {e}")))?;

    for index in 0..archive.len() {
        let name = archive.name_for_index(index).unwrap_or_default();
        if entry_path(name).is_none() {
            return Err(AppError::invalid_file(format!(
                "unsafe path in the archive: {name}"
            )));
        }
    }
    if archive.index_for_name(DECK_FILE).is_none() {
        return Err(AppError::invalid_file("the archive has no deck.json"));
    }

    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|e| AppError::invalid_file(format!("unreadable archive entry: {e}")))?;
        let Some(relative) = entry_path(entry.name()) else {
            return Err(AppError::invalid_file("unsafe path in the archive"));
        };
        // Names the workspace keeps for itself never come from a file.
        let reserved = relative == Path::new(STATE_FILE) || relative == Path::new(LOCK_FILE);
        if relative.as_os_str().is_empty() || reserved || entry.is_symlink() {
            continue;
        }
        let target = workspace.join(relative);
        let write_error =
            |e: &io::Error| AppError::io(format_args!("write {}", target.display()), e);
        if entry.is_dir() {
            fs::create_dir_all(&target).map_err(|e| write_error(&e))?;
            continue;
        }
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|e| write_error(&e))?;
        }
        let mut out = File::create(&target).map_err(|e| write_error(&e))?;
        let mut buffer = vec![0_u8; 64 * 1024];
        loop {
            // A read error is the archive's fault (truncated, bad checksum); a write error is
            // the disk's.
            let read = match entry.read(&mut buffer) {
                Ok(0) => break,
                Ok(read) => read,
                Err(e) if e.kind() == io::ErrorKind::Interrupted => continue,
                Err(e) => {
                    return Err(AppError::invalid_file(format!(
                        "corrupt archive entry: {e}"
                    )));
                }
            };
            out.write_all(&buffer[..read])
                .map_err(|e| write_error(&e))?;
        }
    }
    Ok(())
}

/// Turns a ZIP entry name into a path relative to the workspace, or `None` when the name could
/// escape it. Stricter than needed on purpose: `a/../b` stays inside but no honest writer
/// produces it.
fn entry_path(name: &str) -> Option<PathBuf> {
    // `:` covers drive prefixes (`C:\`) and NTFS alternate data streams (`deck.json:x`).
    if name.contains(['\0', ':']) || name.starts_with(['/', '\\']) {
        return None;
    }
    let mut path = PathBuf::new();
    // ZIP uses `/`; archives written by careless Windows tools use `\`.
    for part in name.split(['/', '\\']) {
        match part {
            "" | "." => {}
            ".." => return None,
            part => path.push(part),
        }
    }
    Some(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn entry_paths_stay_inside_the_workspace() {
        assert_eq!(entry_path("deck.json"), Some(PathBuf::from("deck.json")));
        assert_eq!(
            entry_path("assets/ab.png"),
            Some(Path::new("assets").join("ab.png"))
        );
        assert_eq!(
            entry_path("thumbs\\s1.webp"),
            Some(Path::new("thumbs").join("s1.webp"))
        );
        assert_eq!(
            entry_path("./chat//t.jsonl"),
            Some(Path::new("chat").join("t.jsonl"))
        );
        assert_eq!(entry_path("assets/"), Some(PathBuf::from("assets")));

        for unsafe_name in [
            "../evil.txt",
            "assets/../../evil.txt",
            "assets/../deck.json",
            "..\\evil.txt",
            "/etc/passwd",
            "\\\\server\\share\\x",
            "C:\\Windows\\x",
            "C:evil.txt",
            "deck.json:stream",
            "a\0b",
        ] {
            assert_eq!(entry_path(unsafe_name), None, "{unsafe_name}");
        }
    }

    #[test]
    fn text_is_deflated_and_media_is_stored() {
        for name in [
            "deck.json",
            "chat/t.jsonl",
            "source/import.html",
            "assets/a.svg",
            "assets/a.ttf",
        ] {
            assert_eq!(compression_for(name), CompressionMethod::Deflated, "{name}");
        }
        for name in [
            "assets/a.png",
            "assets/a.JPG",
            "thumbs/s1.webp",
            "assets/a.mp4",
            "assets/a.woff2",
        ] {
            assert_eq!(compression_for(name), CompressionMethod::Stored, "{name}");
        }
    }
}
