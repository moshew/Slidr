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
    /// Reads the fields. Fails with `invalid_input` when the first two are missing or when an asset
    /// name is anything but a plain file name.
    pub(crate) fn parse(deck_json: &str) -> Result<Self> {
        let probe: DeckProbe = serde_json::from_str(deck_json)
            .map_err(|e| AppError::invalid_input(format!("deck JSON is not a deck: {e}")))?;
        let mut asset_files = BTreeSet::new();
        for asset in probe.assets.into_values() {
            if !is_plain_file_name(&asset.file) {
                return Err(AppError::invalid_input(format!(
                    "asset file is not a plain file name: {}",
                    asset.file
                )));
            }
            asset_files.insert(asset.file);
        }
        Ok(Self {
            schema_version: probe.schema_version,
            asset_files,
            slide_ids: probe.slides.into_iter().filter_map(|s| s.id).collect(),
        })
    }
}

/// A name that stays inside the directory it is joined to.
fn is_plain_file_name(name: &str) -> bool {
    !name.is_empty() && name != "." && name != ".." && !name.contains(['/', '\\', ':', '\0'])
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
    fn rejects_asset_names_that_leave_the_assets_directory() {
        for file in [
            "../deck.json",
            "a/b.png",
            "a\\b.png",
            "C:evil.png",
            "..",
            "",
        ] {
            let deck =
                serde_json::json!({ "schemaVersion": 1, "assets": { "x": { "file": file } } });
            let error = DeckInfo::parse(&deck.to_string()).expect_err(file);
            assert_eq!(error.kind, ErrorKind::InvalidInput, "{file}");
        }
    }
}
