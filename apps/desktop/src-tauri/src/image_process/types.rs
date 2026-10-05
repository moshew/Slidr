//! The contract of local image processing as data: the operations, what one returns, and
//! whether background removal can run.
//!
//! Every type that derives `Serialize` or `Deserialize` here crosses IPC. Field names are
//! camelCase and enum values snake_case on the JavaScript side; `fixtures/contract.json` pins
//! the exact shapes for both sides. Errors are the image providers' `{ kind, message }`.

use std::path::Path;

use serde::{Deserialize, Serialize};

use super::{
    model::{Found, MODELS, ModelSpec, Place},
    upscale::{FACTORS, UPSCALERS, UpscalerSpec},
};
use crate::assets::ImportedAsset;

/// The largest picture that is upscaled, in pixels: 2048 by 2048, about a minute's work on
/// eight threads. A picture beyond it has more pixels than a slide shows.
pub const MAX_SOURCE_PIXELS: u64 = 4_194_304;
/// The largest picture an upscale gives, in pixels: an 8K frame and a little more. Past it a
/// deck carries tens of megabytes for detail no screen shows.
pub const MAX_RESULT_PIXELS: u64 = 40_000_000;

/// What to do to a picture. The picture is never changed: the result is a new asset.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum Operation {
    /// Cuts the subject out with the installed matting model.
    RemoveBackground,
    /// Makes a flat background colour transparent. No model.
    ChromaKey {
        /// The colour to remove, `#rrggbb`. Absent: the colour of the picture's border.
        #[serde(default)]
        color: Option<String>,
        /// How far from that colour is still background, above 0 and up to 1 (black to white
        /// is 1). Absent: measured from the border's own unevenness.
        #[serde(default)]
        tolerance: Option<f32>,
        /// Remove only the background the border reaches, and keep the same colour where the
        /// subject encloses it.
        #[serde(default)]
        contiguous: bool,
    },
}

/// What an operation returns: the new asset, as `image_generate` returns a stored image's.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Processed {
    pub asset: ImportedAsset,
    /// From reading the picture to the stored asset.
    pub duration_ms: u64,
    /// `remove_background`: the id of the model that made the matte.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    /// `chroma_key`: the colour that was removed, `#rrggbb`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub key_color: Option<String>,
}

/// Whether background removal can run, and with what.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MattingStatus {
    pub state: MattingState,
    /// The model that will run.
    pub model: Option<ModelInfo>,
    /// The model's file.
    pub path: Option<String>,
    /// Where the file was found.
    pub place: Option<Place>,
    /// The folder a model file goes into when it is installed after the app.
    pub install_dir: String,
    /// The models the app can run, the default first: the file names it looks for.
    pub supported: Vec<ModelInfo>,
}

/// Whether a model is there.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum MattingState {
    Ready,
    /// No model file in any of the places. `chroma_key` works all the same.
    NotInstalled,
}

/// A model as the settings screen shows it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    /// The file's name in a models folder.
    pub file: String,
    /// SPDX id of the licence the weights were published under.
    pub license: String,
    /// The size of the published file.
    pub bytes: u64,
}

impl From<&ModelSpec> for ModelInfo {
    fn from(spec: &ModelSpec) -> Self {
        Self {
            id: spec.id.into(),
            name: spec.name.into(),
            file: spec.file.into(),
            license: spec.license.into(),
            bytes: spec.bytes,
        }
    }
}

impl From<&UpscalerSpec> for ModelInfo {
    fn from(spec: &UpscalerSpec) -> Self {
        Self {
            id: spec.id.into(),
            name: spec.name.into(),
            file: spec.file.into(),
            license: spec.license.into(),
            bytes: spec.bytes,
        }
    }
}

/// Whether a picture can be upscaled, with what, and how far: the upscaling model's own
/// status, beside the matting model's.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpscaleStatus {
    /// `not_installed`: no upscaling model file in any of the places.
    pub state: MattingState,
    /// The model that will run.
    pub model: Option<ModelInfo>,
    /// The model's file.
    pub path: Option<String>,
    /// Where the file was found.
    pub place: Option<Place>,
    /// The folder a model file goes into when it is installed after the app.
    pub install_dir: String,
    /// The models the app can run, the default first: the file names it looks for.
    pub supported: Vec<ModelInfo>,
    /// How many times its size a picture can be asked for. Empty without a model.
    pub factors: Vec<u32>,
    /// The largest picture that is upscaled, in pixels.
    pub max_source_pixels: u64,
    /// The largest result, in pixels: what decides whether a picture can go four times.
    pub max_result_pixels: u64,
}

impl UpscaleStatus {
    /// The status of an app that found the model `found` (the spec, its file and where it
    /// was), and installs into `install_dir`.
    pub fn of(found: Option<(&UpscalerSpec, &Path, Place)>, install_dir: &Path) -> Self {
        Self {
            state: if found.is_some() {
                MattingState::Ready
            } else {
                MattingState::NotInstalled
            },
            model: found.map(|(spec, ..)| spec.into()),
            path: found.map(|(_, path, _)| path.to_string_lossy().into_owned()),
            place: found.map(|(.., place)| place),
            install_dir: install_dir.to_string_lossy().into_owned(),
            supported: UPSCALERS.iter().map(Into::into).collect(),
            factors: found.map_or_else(Vec::new, |_| FACTORS.to_vec()),
            max_source_pixels: MAX_SOURCE_PIXELS,
            max_result_pixels: MAX_RESULT_PIXELS,
        }
    }
}

/// What an upscale returns: the new asset, a picture `factor` times the size of its source.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Upscaled {
    pub asset: ImportedAsset,
    /// From reading the picture to the stored asset.
    pub duration_ms: u64,
    /// The id of the model that drew it.
    pub model: String,
    pub factor: u32,
}

/// How far an upscale is: the picture goes through the model in tiles. Sent first with none
/// done, then once for every tile.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpscaleProgress {
    pub done: u32,
    pub total: u32,
}

impl MattingStatus {
    /// The status of an app that found `found`, and installs into `install_dir`.
    pub fn of(found: Option<&Found>, install_dir: &Path) -> Self {
        Self {
            state: if found.is_some() {
                MattingState::Ready
            } else {
                MattingState::NotInstalled
            },
            model: found.map(|found| found.spec.into()),
            path: found.map(|found| found.path.to_string_lossy().into_owned()),
            place: found.map(|found| found.place),
            install_dir: install_dir.to_string_lossy().into_owned(),
            supported: MODELS.iter().map(Into::into).collect(),
        }
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use serde_json::Value;

    use super::*;
    use crate::{
        assets::AssetKind,
        image_providers::{ImageError, ImageErrorKind},
    };

    type TestResult = std::result::Result<(), Box<dyn std::error::Error>>;

    /// One sample of every shape that crosses IPC; the webview's client is written against the
    /// same file.
    fn contract() -> serde_json::Result<Value> {
        serde_json::from_str(include_str!("fixtures/contract.json"))
    }

    fn asset() -> ImportedAsset {
        ImportedAsset {
            id: "ef".repeat(32),
            file: format!("{}.png", "ef".repeat(32)),
            mime: "image/png".into(),
            kind: AssetKind::Image,
            bytes: 1_907_113,
            width: Some(2000.0),
            height: Some(1333.0),
            name: None,
        }
    }

    #[test]
    fn operations_parse_as_the_contract_says() -> TestResult {
        let operations: Vec<Operation> = serde_json::from_value(contract()?["operations"].clone())?;
        let [remove, plain, tuned] = &operations[..] else {
            return Err("expected three operations".into());
        };
        assert_eq!(remove, &Operation::RemoveBackground);
        assert_eq!(
            plain,
            &Operation::ChromaKey {
                color: None,
                tolerance: None,
                contiguous: false
            }
        );
        assert_eq!(
            tuned,
            &Operation::ChromaKey {
                color: Some("#00ff00".into()),
                tolerance: Some(0.12),
                contiguous: true
            }
        );
        // An operation the app does not know is refused at the door.
        let unknown = serde_json::from_str::<Operation>(r#"{ "type": "upscale" }"#);
        assert!(unknown.is_err());
        Ok(())
    }

    #[test]
    fn results_have_the_contract_shape() -> TestResult {
        let results = [
            Processed {
                asset: asset(),
                duration_ms: 1340,
                model: Some("u2net".into()),
                key_color: None,
            },
            Processed {
                asset: asset(),
                duration_ms: 85,
                model: None,
                key_color: Some("#00ff00".into()),
            },
        ];
        assert_eq!(serde_json::to_value(results)?, contract()?["results"]);
        Ok(())
    }

    #[test]
    fn statuses_have_the_contract_shape() -> TestResult {
        let install = PathBuf::from("/data/dev.slidr.app/models");
        let found = Found {
            spec: &MODELS[0],
            path: PathBuf::from("/data/dev.slidr.app/models/u2net.onnx"),
            place: Place::AppData,
        };
        let statuses = [
            MattingStatus::of(Some(&found), &install),
            MattingStatus::of(None, &install),
        ];
        let contract = contract()?;
        assert_eq!(serde_json::to_value(&statuses)?, contract["statuses"]);
        // The list of models is the same in every status: what the app looks for.
        assert_eq!(statuses[0].supported, statuses[1].supported);
        assert_eq!(statuses[1].supported.len(), MODELS.len());
        assert_eq!(
            serde_json::to_value([Place::Dev, Place::AppData, Place::Bundle])?,
            contract["places"]
        );
        Ok(())
    }

    #[test]
    fn errors_are_the_image_providers_errors() -> TestResult {
        let contract = contract()?;
        let missing = ImageError::new(
            ImageErrorKind::NotInstalled,
            "no background-removal model is installed",
        );
        assert_eq!(serde_json::to_value(missing)?, contract["error"]);
        // Every kind an operation can end with is one of the providers' kinds.
        let kinds = [
            ImageErrorKind::NotInstalled,
            ImageErrorKind::NotFound,
            ImageErrorKind::Unsupported,
            ImageErrorKind::InvalidInput,
            ImageErrorKind::UnknownWorkspace,
            ImageErrorKind::GenerationFailed,
            // An upscale that was stopped.
            ImageErrorKind::Cancelled,
            ImageErrorKind::Io,
            ImageErrorKind::Internal,
        ];
        assert_eq!(serde_json::to_value(kinds)?, contract["errorKinds"]);
        Ok(())
    }

    #[test]
    fn an_upscale_has_the_contract_shapes() -> TestResult {
        let contract = contract()?;
        let install = PathBuf::from("/data/dev.slidr.app/models");
        let file = PathBuf::from("/data/dev.slidr.app/models/realesr-general-x4v3.onnx");
        let statuses = [
            UpscaleStatus::of(Some((&UPSCALERS[0], &file, Place::AppData)), &install),
            UpscaleStatus::of(None, &install),
        ];
        assert_eq!(
            serde_json::to_value(&statuses)?,
            contract["upscale"]["statuses"]
        );
        // Without a model no size is offered; the limits are the same either way.
        assert!(statuses[1].factors.is_empty());

        let result = Upscaled {
            asset: ImportedAsset {
                file: format!("{}.jpg", "ef".repeat(32)),
                mime: "image/jpeg".into(),
                bytes: 1_033_749,
                width: Some(3276.0),
                height: Some(4096.0),
                ..asset()
            },
            duration_ms: 11_800,
            model: "realesr-general-x4v3".into(),
            factor: 4,
        };
        assert_eq!(serde_json::to_value(result)?, contract["upscale"]["result"]);

        let progress = [
            UpscaleProgress { done: 0, total: 20 },
            UpscaleProgress {
                done: 20,
                total: 20,
            },
        ];
        assert_eq!(
            serde_json::to_value(progress)?,
            contract["upscale"]["progress"]
        );
        Ok(())
    }
}
