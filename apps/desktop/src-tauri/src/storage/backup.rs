//! A copy of a `.slidr` file kept next to it before a schema migration (DOC-04).

use std::{
    fs::{self, File},
    io::{self, BufReader, Read},
    path::{Path, PathBuf},
};

use crate::error::{AppError, ErrorKind, Result};

/// Gives up after this many differing backups with the same tag.
const MAX_BACKUPS: u32 = 99;

/// Copies `source` to `<stem>.<tag>.bak.<ext>` in the same directory and returns that path.
///
/// Never overwrites: when a backup with that name already holds the same bytes it is returned
/// as it is (opening an old file twice makes one backup, not two); when it holds something
/// else, the next free `<stem>.<tag>.bak-<n>.<ext>` is used.
pub(crate) fn backup(source: &Path, tag: &str) -> Result<PathBuf> {
    if tag.is_empty()
        || tag.len() > 32
        || !tag
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
    {
        return Err(AppError::invalid_input(format!(
            "invalid backup tag: {tag:?}"
        )));
    }
    let metadata = fs::metadata(source).map_err(|e| AppError::path(source, &e))?;
    if !metadata.is_file() {
        return Err(AppError::invalid_input(format!(
            "not a file: {}",
            source.display()
        )));
    }
    let stem = source
        .file_stem()
        .map(|stem| stem.to_string_lossy())
        .unwrap_or_default();
    let extension = source
        .extension()
        .map_or_else(|| "slidr".into(), |extension| extension.to_string_lossy());

    for number in 1..=MAX_BACKUPS {
        let name = if number == 1 {
            format!("{stem}.{tag}.bak.{extension}")
        } else {
            format!("{stem}.{tag}.bak-{number}.{extension}")
        };
        let candidate = source.with_file_name(name);
        // `create_new` makes "is the name free" and "take it" one step.
        match File::options()
            .write(true)
            .create_new(true)
            .open(&candidate)
        {
            Ok(mut out) => {
                let copied = File::open(source)
                    .and_then(|mut input| io::copy(&mut input, &mut out))
                    .and_then(|_| out.sync_all());
                if let Err(e) = copied {
                    drop(out);
                    let _ = fs::remove_file(&candidate);
                    return Err(AppError::io(
                        format_args!("back up {}", source.display()),
                        &e,
                    ));
                }
                return Ok(candidate);
            }
            Err(e) if e.kind() == io::ErrorKind::AlreadyExists => {
                if same_content(source, &candidate)
                    .map_err(|e| AppError::io(format_args!("read {}", candidate.display()), &e))?
                {
                    return Ok(candidate);
                }
            }
            Err(e) => return Err(AppError::path(&candidate, &e)),
        }
    }
    Err(AppError::new(
        ErrorKind::Io,
        format!("too many backups of {} with tag {tag}", source.display()),
    ))
}

fn same_content(a: &Path, b: &Path) -> io::Result<bool> {
    if fs::metadata(a)?.len() != fs::metadata(b)?.len() {
        return Ok(false);
    }
    let (mut a, mut b) = (
        BufReader::new(File::open(a)?),
        BufReader::new(File::open(b)?),
    );
    let (mut chunk_a, mut chunk_b) = (vec![0_u8; 64 * 1024], vec![0_u8; 64 * 1024]);
    loop {
        let read = a.read(&mut chunk_a)?;
        if read == 0 {
            return Ok(true);
        }
        b.read_exact(&mut chunk_b[..read])?;
        if chunk_a[..read] != chunk_b[..read] {
            return Ok(false);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    type TestResult = std::result::Result<(), Box<dyn std::error::Error>>;

    #[test]
    fn backs_up_next_to_the_file_without_overwriting() -> TestResult {
        let dir = tempfile::tempdir()?;
        let source = dir.path().join("deck.slidr");
        fs::write(&source, b"version one")?;

        let first = backup(&source, "v1")?;
        assert_eq!(first, dir.path().join("deck.v1.bak.slidr"));
        assert_eq!(fs::read(&first)?, b"version one");

        // Same bytes again: the existing backup is the backup.
        assert_eq!(backup(&source, "v1")?, first);

        // Different bytes under the same name: a new backup, the first one untouched.
        fs::write(&source, b"version one, edited elsewhere")?;
        let second = backup(&source, "v1")?;
        assert_eq!(second, dir.path().join("deck.v1.bak-2.slidr"));
        assert_eq!(fs::read(&first)?, b"version one");
        assert_eq!(fs::read(&second)?, b"version one, edited elsewhere");
        Ok(())
    }

    #[test]
    fn rejects_bad_tags_and_missing_files() -> TestResult {
        let dir = tempfile::tempdir()?;
        let source = dir.path().join("deck.slidr");
        fs::write(&source, b"x")?;
        for tag in ["", "../x", "a/b", "a b", "v1:x"] {
            assert_eq!(
                backup(&source, tag).map_err(|e| e.kind).err(),
                Some(ErrorKind::InvalidInput)
            );
        }
        let missing = backup(&dir.path().join("missing.slidr"), "v1")
            .map_err(|e| e.kind)
            .err();
        assert_eq!(missing, Some(ErrorKind::NotFound));
        Ok(())
    }
}
