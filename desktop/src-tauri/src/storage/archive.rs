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
const CARRIED_DIRS: [&str; 2] = ["thumbs", "source"];
/// The chats of the deck (AGT-05). Carried through too, except the chats of slides the deck no
/// longer has (see [`add_chats`]).
const CHAT_DIR: &str = "chat";
/// The index of the chats: `{ "threads": { "<thread id>": { … } } }`.
const CHAT_INDEX: &str = "threads.json";
/// What the id of a slide's chat begins with: `slide-<slide id>`, and `slide-<slide id>-c…` for
/// the conversations it has beside its first (`threadIdOf` in the webview's `agentService.ts`).
const SLIDE_THREAD: &str = "slide-";

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
///
/// The chat of a slide that is not among `slide_ids` stays out of the archive, as an asset the
/// deck no longer refers to does. Both stay in the workspace: an undo may bring the slide back.
pub(crate) fn pack(
    workspace: &Path,
    target: &Path,
    asset_files: &BTreeSet<String>,
    slide_ids: &BTreeSet<String>,
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
    add_chats(&mut zip, workspace, slide_ids)?;

    let writer = zip.finish().map_err(|e| write_error(&e))?;
    writer
        .into_inner()
        .map_err(|e| AppError::io("flush the archive", e.error()))?;
    temp.persist(target)
        .map_err(|e| AppError::io(format_args!("replace {}", target.display()), &e))?;
    Ok(missing)
}

/// Adds one file under `name`. Returns `false` when the file does not exist, or cannot: a name
/// the file system turns down (too long for it, say) names no file either.
fn add_file<W: Write + Seek>(zip: &mut ZipWriter<W>, name: &str, path: &Path) -> Result<bool> {
    let read_error = |e: &io::Error| AppError::io(format_args!("read {}", path.display()), e);
    let mut file = match File::open(path) {
        Ok(file) => file,
        Err(e)
            if matches!(
                e.kind(),
                io::ErrorKind::NotFound | io::ErrorKind::InvalidFilename
            ) =>
        {
            return Ok(false);
        }
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

/// Whether the chat with this thread id goes into the file: every chat does, except a slide's
/// when the deck no longer has the slide.
fn chat_is_kept(thread: &str, slide_ids: &BTreeSet<String>) -> bool {
    let Some(rest) = thread.strip_prefix(SLIDE_THREAD) else {
        return true;
    };
    slide_ids.iter().any(|id| {
        rest.strip_prefix(id.as_str())
            .is_some_and(|more| more.is_empty() || more.starts_with("-c"))
    })
}

/// Adds `chat/`: the transcripts of the chats that are kept, and the index without the entries
/// of the ones that are not. An index that cannot be read as one is carried as it is.
fn add_chats<W: Write + Seek>(
    zip: &mut ZipWriter<W>,
    workspace: &Path,
    slide_ids: &BTreeSet<String>,
) -> Result<()> {
    let dir = workspace.join(CHAT_DIR);
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
        let Ok(name) = entry.file_name().into_string() else {
            continue;
        };
        if atomic::is_temp_name(&name) {
            continue;
        }
        let child = format!("{CHAT_DIR}/{name}");
        let file_type = entry.file_type().map_err(|e| read_error(&e))?;
        if file_type.is_dir() {
            add_dir(zip, workspace, &child)?;
        } else if !file_type.is_file() {
            continue;
        } else if name == CHAT_INDEX {
            match kept_index(&entry.path(), slide_ids) {
                Some(index) => {
                    let options =
                        SimpleFileOptions::default().compression_method(compression_for(&child));
                    zip.start_file(&child, options)
                        .map_err(|e| write_error(&e))?;
                    zip.write_all(&index)
                        .map_err(|e| AppError::io(format_args!("pack {child}"), &e))?;
                }
                None => {
                    add_file(zip, &child, &entry.path())?;
                }
            }
        } else {
            let thread = name.strip_suffix(".jsonl").unwrap_or(&name);
            if chat_is_kept(thread, slide_ids) {
                add_file(zip, &child, &entry.path())?;
            }
        }
    }
    Ok(())
}

/// The chat index without the chats of slides that are gone, or `None` when the file is not an
/// index this layer can read (it is the webview's, and is then left as it is).
fn kept_index(path: &Path, slide_ids: &BTreeSet<String>) -> Option<Vec<u8>> {
    let mut index: serde_json::Value = serde_json::from_slice(&fs::read(path).ok()?).ok()?;
    let threads = index.get_mut("threads")?.as_object_mut()?;
    let before = threads.len();
    threads.retain(|thread, _| chat_is_kept(thread, slide_ids));
    if threads.len() == before {
        // Nothing to take out: the bytes the webview wrote go in.
        return None;
    }
    serde_json::to_vec_pretty(&index).ok()
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

/// How much an archive may unpack to. A `.slidr` file is a ZIP anyone can send, and a ZIP of a
/// few hundred kilobytes can declare, or simply hold, entries that unpack to many gigabytes, or
/// a million empty files: opening it would fill the disk the workspace is on.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Limits {
    /// Entries in the archive, directories included.
    entries: usize,
    /// Bytes written to the workspace, over all entries: `deck.json`, the assets, the chats,
    /// the thumbnails and `source/` alike.
    bytes: u64,
}

/// More files than any deck has: one for an asset, a few for a slide's chats and thumbnail.
const MAX_ENTRIES: usize = 20_000;
/// What every archive may unpack to, however small it is: room for a deck of text, vector
/// pictures and uncompressed bitmaps, which deflate a hundredfold and more.
const UNPACKED_ALLOWANCE: u64 = 1 << 30;
/// Beyond the allowance, how many times its own size an archive may unpack to. A deck is large
/// because of its media, which is packed as it is (a video of 5 GiB makes a file of 5 GiB), so
/// a large deck is far inside this; a small file that unpacks to gigabytes is not a deck.
const UNPACKED_RATIO: u64 = 100;

impl Limits {
    /// The limits for an archive of `archive_bytes` on disk.
    fn of_archive(archive_bytes: u64) -> Self {
        Self {
            entries: MAX_ENTRIES,
            bytes: UNPACKED_ALLOWANCE.saturating_add(archive_bytes.saturating_mul(UNPACKED_RATIO)),
        }
    }

    fn too_large(self) -> AppError {
        AppError::invalid_file(format!(
            "the archive unpacks to more than {} bytes, which no deck of its size does",
            self.bytes
        ))
    }
}

/// Extracts the archive at `source` into the (fresh) `workspace` directory.
///
/// Every entry name is checked before anything is written: an archive with a path that could
/// land outside the workspace (`..`, absolute, drive prefix) is rejected as a whole, and so is
/// one without `deck.json`, and one that would unpack to more than a deck does ([`Limits`]).
pub(crate) fn unpack(source: &Path, workspace: &Path) -> Result<()> {
    let file = File::open(source).map_err(|e| AppError::path(source, &e))?;
    let size = file
        .metadata()
        .map_err(|e| AppError::path(source, &e))?
        .len();
    extract(file, workspace, Limits::of_archive(size))
}

fn extract(file: File, workspace: &Path, limits: Limits) -> Result<()> {
    let mut archive = ZipArchive::new(BufReader::new(file))
        .map_err(|e| AppError::invalid_file(format!("not a .slidr file: {e}")))?;

    if archive.len() > limits.entries {
        return Err(AppError::invalid_file(format!(
            "the archive holds {} entries; a deck has at most {}",
            archive.len(),
            limits.entries
        )));
    }
    // What the archive says of itself, before a byte is written. It may say less than it
    // holds, or nothing (entries written as a stream): the loop below counts what comes out.
    if archive
        .decompressed_size()
        .is_some_and(|declared| declared > u128::from(limits.bytes))
    {
        return Err(limits.too_large());
    }
    let mut unpacked: u64 = 0;

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
            unpacked = unpacked.saturating_add(read as u64);
            if unpacked > limits.bytes {
                return Err(limits.too_large());
            }
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
    use crate::error::ErrorKind;

    type TestResult = std::result::Result<(), Box<dyn std::error::Error>>;

    const MIB: u64 = 1 << 20;

    /// Writes a ZIP with the given entries into `dir` and opens it for reading. `streamed`
    /// writes it as a stream does: no entry says how large it is before its data.
    fn archive_of(
        dir: &Path,
        entries: &[(&str, &[u8])],
        streamed: bool,
    ) -> std::result::Result<File, Box<dyn std::error::Error>> {
        let path = dir.join("deck.slidr");
        let file = File::create(&path)?;
        if streamed {
            let mut zip = ZipWriter::new_stream(file);
            for &(name, bytes) in entries {
                zip.start_file(name, SimpleFileOptions::default())?;
                zip.write_all(bytes)?;
            }
            zip.finish()?;
        } else {
            let mut zip = ZipWriter::new(file);
            for &(name, bytes) in entries {
                zip.start_file(name, SimpleFileOptions::default())?;
                zip.write_all(bytes)?;
            }
            zip.finish()?;
        }
        Ok(File::open(path)?)
    }

    fn files_under(dir: &Path) -> io::Result<Vec<(PathBuf, u64)>> {
        let mut found = Vec::new();
        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            if entry.file_type()?.is_dir() {
                found.extend(files_under(&entry.path())?);
            } else {
                found.push((entry.path(), entry.metadata()?.len()));
            }
        }
        Ok(found)
    }

    #[test]
    fn an_archive_may_unpack_to_an_allowance_and_a_multiple_of_its_own_size() {
        // A file of a few hundred kilobytes: the allowance, and little more.
        let small = Limits::of_archive(300 * 1024);
        assert_eq!(small.entries, 20_000);
        assert_eq!(small.bytes, (1 << 30) + 100 * 300 * 1024);
        // A deck with a long video is as large on disk as its video, and far inside its limit.
        let video = 5 * 1024 * MIB;
        assert!(Limits::of_archive(video).bytes > 100 * video);
        assert_eq!(Limits::of_archive(u64::MAX).bytes, u64::MAX);
    }

    #[test]
    fn an_archive_that_declares_more_than_the_limit_is_refused_before_anything_is_written()
    -> TestResult {
        let temp = tempfile::tempdir()?;
        let workspace = temp.path().join("w");
        fs::create_dir(&workspace)?;
        // Two megabytes of zeros are two kilobytes of archive.
        let zeros = vec![0_u8; 2 * 1024 * 1024];
        let file = archive_of(
            temp.path(),
            &[(DECK_FILE, b"{}"), ("assets/big.bin", &zeros)],
            false,
        )?;
        assert!(file.metadata()?.len() < 16 * 1024);

        let limits = Limits {
            entries: 10,
            bytes: MIB,
        };
        let refused = extract(file, &workspace, limits);
        assert_eq!(refused.err().map(|e| e.kind), Some(ErrorKind::InvalidFile));
        assert_eq!(files_under(&workspace)?, []);
        Ok(())
    }

    /// The sizes an archive declares are the sender's word. One that declares none (its
    /// entries were written as a stream) is counted as it comes out, and stopped at the limit.
    #[test]
    fn an_archive_that_holds_more_than_the_limit_is_stopped_while_it_unpacks() -> TestResult {
        let temp = tempfile::tempdir()?;
        let workspace = temp.path().join("w");
        fs::create_dir(&workspace)?;
        let zeros = vec![0_u8; 2 * 1024 * 1024];
        let entries: [(&str, &[u8]); 3] = [
            (DECK_FILE, b"{}"),
            ("source/import.html", &zeros),
            ("assets/big.bin", &zeros),
        ];
        let limits = Limits {
            entries: 10,
            bytes: 3 * MIB,
        };
        let streamed = archive_of(temp.path(), &entries, true)?;
        let refused = extract(streamed, &workspace, limits);
        assert_eq!(refused.err().map(|e| e.kind), Some(ErrorKind::InvalidFile));
        // Every entry counts, `source/` too: what reached the disk is inside the limit.
        let written: u64 = files_under(&workspace)?.iter().map(|(_, size)| size).sum();
        assert!(written <= limits.bytes, "{written} bytes were written");
        assert!(written > 2 * MIB, "{written} bytes were written");

        // The same entries inside the limit unpack whole.
        let whole = temp.path().join("whole");
        fs::create_dir(&whole)?;
        let roomy = Limits {
            entries: 10,
            bytes: 5 * MIB,
        };
        extract(archive_of(temp.path(), &entries, true)?, &whole, roomy)?;
        assert_eq!(
            fs::metadata(whole.join("source").join("import.html"))?.len(),
            2 * MIB
        );
        Ok(())
    }

    #[test]
    fn an_archive_with_more_entries_than_the_limit_is_refused() -> TestResult {
        let temp = tempfile::tempdir()?;
        let workspace = temp.path().join("w");
        fs::create_dir(&workspace)?;
        let entries: [(&str, &[u8]); 4] = [
            (DECK_FILE, b"{}"),
            ("assets/a.png", b"a"),
            ("assets/b.png", b"b"),
            ("assets/c.png", b"c"),
        ];
        let limits = Limits {
            entries: 3,
            bytes: MIB,
        };
        let refused = extract(
            archive_of(temp.path(), &entries, false)?,
            &workspace,
            limits,
        );
        assert_eq!(refused.err().map(|e| e.kind), Some(ErrorKind::InvalidFile));
        assert_eq!(files_under(&workspace)?, []);

        let four = Limits {
            entries: 4,
            bytes: MIB,
        };
        extract(archive_of(temp.path(), &entries, false)?, &workspace, four)?;
        assert_eq!(files_under(&workspace)?.len(), 4);
        Ok(())
    }

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
    fn a_chat_is_kept_unless_it_is_of_a_slide_that_is_gone() {
        let slides: BTreeSet<String> = ["s_a1", "s_b2"].map(String::from).into();
        for kept in [
            "deck",
            "deck-cm1x2y3",
            "import",
            "slide-s_a1",
            "slide-s_a1-cm1x2y3",
            "slide-s_b2",
        ] {
            assert!(chat_is_kept(kept, &slides), "{kept}");
        }
        for gone in [
            "slide-s_zz",
            "slide-s_zz-cm1x2y3",
            // The id of another slide that only begins the same way.
            "slide-s_a10",
            "slide-",
        ] {
            assert!(!chat_is_kept(gone, &slides), "{gone}");
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
