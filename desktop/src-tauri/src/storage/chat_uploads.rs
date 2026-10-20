//! Chat attachments live beside a saved deck, outside its ZIP. The workspace keeps a working
//! copy so a new deck can receive attachments before its first save.

use std::{
    fs, io,
    path::{Path, PathBuf},
};

use crate::error::{AppError, Result};

const FOLDER: &str = "chat_uploads";

pub(super) fn thread_dir(workspace: &Path, thread: &str) -> Result<PathBuf> {
    if thread.is_empty()
        || thread.len() > 200
        || !thread
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    {
        return Err(AppError::invalid_input("invalid chat thread id"));
    }
    Ok(workspace.join(FOLDER).join(thread))
}

fn sidecar(deck: &Path) -> Result<PathBuf> {
    let parent = deck
        .parent()
        .ok_or_else(|| AppError::invalid_input("invalid deck path"))?;
    let name = deck
        .file_name()
        .ok_or_else(|| AppError::invalid_input("invalid deck path"))?;
    Ok(parent.join(FOLDER).join(name))
}

fn copy_tree(from: &Path, to: &Path) -> Result<()> {
    if to.starts_with(from) {
        return Err(AppError::invalid_input(
            "the chat uploads folder cannot be copied into itself",
        ));
    }
    let entries = match fs::read_dir(from) {
        Ok(entries) => entries,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(AppError::path(from, &error)),
    };
    fs::create_dir_all(to).map_err(|error| AppError::path(to, &error))?;
    for entry in entries {
        let entry = entry.map_err(|error| AppError::path(from, &error))?;
        let kind = entry
            .file_type()
            .map_err(|error| AppError::path(&entry.path(), &error))?;
        let destination = to.join(entry.file_name());
        if kind.is_dir() {
            copy_tree(&entry.path(), &destination)?;
        } else if kind.is_file() {
            let mut source = fs::File::open(entry.path())
                .map_err(|error| AppError::path(&entry.path(), &error))?;
            let temp =
                super::atomic::TempFile::new_in(to).map_err(|error| AppError::path(to, &error))?;
            let mut writer = temp.file().map_err(|error| AppError::path(to, &error))?;
            io::copy(&mut source, &mut writer)
                .map_err(|error| AppError::path(&destination, &error))?;
            temp.persist(&destination)
                .map_err(|error| AppError::path(&destination, &error))?;
        }
    }
    Ok(())
}

pub(super) fn restore(deck: &Path, workspace: &Path) -> Result<()> {
    copy_tree(&sidecar(deck)?, &workspace.join(FOLDER))
}

pub(super) fn save(workspace: &Path, deck: &Path) -> Result<()> {
    copy_tree(&workspace.join(FOLDER), &sidecar(deck)?)
}

pub(super) fn write(
    workspace: &Path,
    deck: Option<&Path>,
    thread: &str,
    name: &str,
    bytes: &[u8],
) -> Result<()> {
    if !crate::storage::deck::is_plain_file_name(name) {
        return Err(AppError::invalid_input("invalid chat attachment name"));
    }
    let dir = thread_dir(workspace, thread)?;
    fs::create_dir_all(&dir).map_err(|error| AppError::path(&dir, &error))?;
    super::atomic::write(&dir.join(name), bytes)
        .map_err(|error| AppError::path(&dir.join(name), &error))?;
    if let Some(deck) = deck {
        let sidecar = sidecar(deck)?.join(thread);
        fs::create_dir_all(&sidecar).map_err(|error| AppError::path(&sidecar, &error))?;
        super::atomic::write(&sidecar.join(name), bytes)
            .map_err(|error| AppError::path(&sidecar.join(name), &error))?;
    }
    Ok(())
}
