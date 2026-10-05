//! The only three things Rust reads out of `deck.json`. Everything else is the webview's.

use std::collections::{BTreeMap, BTreeSet};

use serde::Deserialize;

use crate::error::{AppError, Result};

/// What a save needs to know about the deck it packs.
#[derive(Debug)]
pub(crate) struct DeckInfo {
    /// `schemaVersion`, copied to `meta.json` as it is.
    pub(crate) schema_version: serde_json::Number,
    /// `assets[*].file`: the names inside `assets/` the deck refers to, sorted.
    pub(crate) asset_files: BTreeSet<String>,
    /// `assets[*].file` that is not the name of a file at all: a path, an address, a name no
    /// file can have. Such a name is never joined to a path; the save goes on without it and
    /// reports it with the files that were not found.
    pub(crate) unusable_assets: BTreeSet<String>,
    /// `slides[*].id`: the slides the deck has, which decides whose chats go into the file.
    pub(crate) slide_ids: BTreeSet<String>,
}

#[derive(Deserialize)]
struct DeckProbe {
    #[serde(rename = "schemaVersion")]
    schema_version: serde_json::Number,
    assets: BTreeMap<String, AssetProbe>,
    #[serde(default)]
    slides: Vec<SlideProbe>,
}

#[derive(Deserialize)]
struct AssetProbe {
    file: String,
}

#[derive(Deserialize)]
struct SlideProbe {
    #[serde(default)]
    id: Option<String>,
}

impl DeckInfo {
    /// Reads the fields. Fails with `invalid_input` when the first two are missing.
    ///
    /// An asset whose name is not a plain file name does not fail it: the autosave takes any
    /// deck the webview holds, so a save that refused one over an asset entry would leave work
    /// that can never reach a file. The name is set aside in `unusable_assets` instead.
    pub(crate) fn parse(deck_json: &str) -> Result<Self> {
        let probe: DeckProbe = serde_json::from_str(deck_json)
            .map_err(|e| AppError::invalid_input(format!("deck JSON is not a deck: {e}")))?;
        let (asset_files, unusable_assets) = probe
            .assets
            .into_values()
            .map(|asset| asset.file)
            .partition(|file| is_plain_file_name(file));
        Ok(Self {
            schema_version: probe.schema_version,
            asset_files,
            unusable_assets,
            slide_ids: probe.slides.into_iter().filter_map(|s| s.id).collect(),
        })
    }
}

/// Characters no file name holds: the separators of paths, drives and streams, and the ones
/// Windows refuses in a name.
const NOT_IN_A_FILE_NAME: [char; 9] = ['/', '\\', ':', '<', '>', '"', '|', '?', '*'];

/// A name that is a file inside the directory it is joined to, on every system the app runs
/// on: one path component, with nothing Windows would refuse, drop (a dot or a space at the
/// end) or take for a device (`NUL`, `COM1.png`).
///
/// The same rule as `isAssetFileName` in `packages/model`, which keeps such an asset from
/// being registered in the first place; the two are held to one list of names by their tests.
pub(crate) fn is_plain_file_name(name: &str) -> bool {
    let plain = !name.is_empty()
        && name != "."
        && name != ".."
        && !name.ends_with(['.', ' '])
        && !name
            .chars()
            .any(|c| u32::from(c) < 0x20 || NOT_IN_A_FILE_NAME.contains(&c));
    plain && !is_device_name(name)
}

/// Whether Windows reads the name as a device whatever its extension: `con`, `NUL.txt`, `Com1`.
fn is_device_name(name: &str) -> bool {
    let stem = name.split('.').next().unwrap_or(name).trim_end_matches(' ');
    let stem = stem.to_ascii_uppercase();
    let numbered = |prefix: &str| {
        stem.strip_prefix(prefix)
            .is_some_and(|rest| rest.len() == 1 && rest.bytes().all(|b| b.is_ascii_digit()))
    };
    matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL") || numbered("COM") || numbered("LPT")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::ErrorKind;

    type TestResult = std::result::Result<(), Box<dyn std::error::Error>>;

    #[test]
    fn reads_schema_version_and_asset_files() -> TestResult {
        let info = DeckInfo::parse(
            r#"{"schemaVersion":3,"id":"d","slides":[{"elements":[]}],
                "assets":{"b":{"file":"b.png","mime":"image/png"},"a":{"file":"a.woff2"}}}"#,
        )?;
        assert_eq!(info.schema_version.as_u64(), Some(3));
        assert_eq!(
            info.asset_files.into_iter().collect::<Vec<_>>(),
            ["a.woff2", "b.png"]
        );
        assert!(info.slide_ids.is_empty(), "a slide without an id has none");
        Ok(())
    }

    #[test]
    fn reads_the_ids_of_the_slides() -> TestResult {
        let info = DeckInfo::parse(
            r#"{"schemaVersion":1,"assets":{},
                "slides":[{"id":"s_b","elements":[]},{"id":"s_a","name":"שקף"}]}"#,
        )?;
        assert_eq!(
            info.slide_ids.into_iter().collect::<Vec<_>>(),
            ["s_a", "s_b"]
        );
        // A deck text without slides at all is still a deck to this layer.
        let info = DeckInfo::parse(r#"{"schemaVersion":1,"assets":{}}"#)?;
        assert!(info.slide_ids.is_empty());
        Ok(())
    }

    #[test]
    fn rejects_what_is_not_a_deck() {
        for bad in [
            "",
            "[]",
            "{}",
            r#"{"schemaVersion":1}"#,
            r#"{"schemaVersion":"1","assets":{}}"#,
        ] {
            let error = DeckInfo::parse(bad).expect_err(bad);
            assert_eq!(error.kind, ErrorKind::InvalidInput, "{bad}");
        }
    }

    #[test]
    fn sets_aside_asset_names_that_are_not_file_names_and_reads_the_rest() -> TestResult {
        for file in [
            "../deck.json",
            "a/b.png",
            "a\\b.png",
            "C:evil.png",
            "https://example.com/logo.png",
            "..",
            "",
        ] {
            let deck = serde_json::json!({ "schemaVersion": 1, "assets": {
                "x": { "file": file }, "y": { "file": "kept.png" },
            }});
            let info = DeckInfo::parse(&deck.to_string())?;
            // Never among the names that are joined to the assets directory.
            assert_eq!(
                info.asset_files.iter().collect::<Vec<_>>(),
                ["kept.png"],
                "{file}"
            );
            assert_eq!(
                info.unusable_assets.iter().collect::<Vec<_>>(),
                [file],
                "{file}"
            );
        }
        Ok(())
    }

    /// The list the model's `isAssetFileName` is tested against too: one rule on both sides.
    #[test]
    fn judges_a_file_name_as_the_model_does() -> TestResult {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct Cases {
            file_names: Vec<String>,
            not_file_names: Vec<String>,
        }
        let cases: Cases = serde_json::from_str(include_str!(
            "../../../../../packages/model/src/assetFileNames.cases.json"
        ))?;
        assert!(!cases.file_names.is_empty() && !cases.not_file_names.is_empty());
        for name in &cases.file_names {
            assert!(is_plain_file_name(name), "{name:?} is a file name");
        }
        for name in &cases.not_file_names {
            assert!(!is_plain_file_name(name), "{name:?} is not a file name");
        }
        Ok(())
    }
}
