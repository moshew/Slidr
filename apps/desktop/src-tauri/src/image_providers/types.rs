//! The image provider contract as data: what a provider is, what goes into a job, what comes
//! out, and the errors.
//!
//! Every type that derives `Serialize` or `Deserialize` here crosses IPC. Field names are
//! camelCase and enum values snake_case on the JavaScript side;
//! `apps/desktop/src/images/images.ts` mirrors them, and `fixtures/contract.json` pins the exact
//! shapes for both sides.

use std::{fmt, path::PathBuf};

use serde::{Deserialize, Serialize};

use crate::{
    assets::ImportedAsset,
    error::{AppError, ErrorKind},
    secrets::SecretName,
};

/// Result of every image operation.
pub type Result<T> = std::result::Result<T, ImageError>;

/// The shape of the picture (GEN-05), chosen by the caller from the frame it is for. A provider
/// gets as close as it can; the crop of the image element does the rest.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Aspect {
    #[serde(rename = "16:9")]
    Wide,
    #[serde(rename = "4:3")]
    Landscape,
    #[serde(rename = "1:1")]
    Square,
    #[serde(rename = "3:4")]
    Portrait,
    #[serde(rename = "9:16")]
    Tall,
}

impl Aspect {
    /// Width to height.
    pub fn ratio(self) -> (u32, u32) {
        match self {
            Self::Wide => (16, 9),
            Self::Landscape => (4, 3),
            Self::Square => (1, 1),
            Self::Portrait => (3, 4),
            Self::Tall => (9, 16),
        }
    }
}

/// What a provider is and can do (GEN-01). The UI hides what a provider does not support.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderDescriptor {
    /// Stable id, used in settings, in jobs and in an asset's `lineage.provider`.
    pub id: String,
    /// Display name.
    pub name: String,
    pub capabilities: Capabilities,
    /// The key the provider needs, for one that calls a web API with the user's key. The
    /// settings screen offers a field for it; `probe` says whether the key works.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub key: Option<SecretName>,
}

/// Feature flags of a provider.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Capabilities {
    /// What `edit` does to the source image.
    pub edit: EditSupport,
    /// `edit` can be confined to a mask.
    pub mask: bool,
    /// Images can have a transparent background.
    pub transparent: bool,
    /// How many images the provider makes at once; the rest of a job waits its turn.
    pub max_parallel: u32,
    /// The provider reads the `quality` of the image settings (low, medium, high, auto):
    /// what an image costs and how long it takes.
    pub quality: bool,
}

/// How a provider edits.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum EditSupport {
    /// No editing.
    None,
    /// A new image drawn after the source: similar, but no pixel of the source is kept.
    Regenerate,
    /// The source with only what the instruction asks changed.
    Exact,
}

/// The result of `probe`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderStatus {
    pub state: ProviderState,
    pub version: Option<String>,
    /// How the provider is signed in, as it describes it; no personal data.
    pub account: Option<String>,
    /// English guidance or error text: what to install, how to sign in, what failed.
    pub detail: Option<String>,
}

/// Whether a provider can make images.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ProviderState {
    Ready,
    NotInstalled,
    NotLoggedIn,
    /// Installed, but the check failed; `detail` says how.
    Unavailable,
}

/// `image_generate`: `count` images from one prompt.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateJob {
    pub prompt: String,
    pub count: u32,
    pub aspect: Aspect,
    /// A provider id; the default provider when absent.
    #[serde(default)]
    pub provider: Option<String>,
}

/// `image_edit`: `count` new images made from an asset of the workspace.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditJob {
    /// The image to edit: its id in the workspace's asset store.
    pub asset_id: String,
    pub instruction: String,
    /// An image whose transparent area is where the edit may happen.
    #[serde(default)]
    pub mask_asset_id: Option<String>,
    pub count: u32,
    #[serde(default)]
    pub provider: Option<String>,
}

/// One image to generate, as a provider receives it.
#[derive(Debug, Clone)]
pub struct GenerateRequest {
    pub prompt: String,
    pub aspect: Aspect,
}

/// One edit, as a provider receives it. The files are in the workspace; a provider only reads
/// them.
#[derive(Debug, Clone)]
pub struct EditRequest {
    pub source: PathBuf,
    /// Present only for a provider whose capabilities say `mask`.
    #[allow(
        dead_code,
        reason = "read by a provider that edits inside a mask (WG12-T03)"
    )]
    pub mask: Option<PathBuf>,
    pub instruction: String,
}

/// What a provider hands back: the image file's content, in whatever format it made.
#[derive(Debug, Clone)]
pub struct GeneratedImage {
    pub bytes: Vec<u8>,
}

/// Progress of one image of a job (GEN-04). Providers have no finer progress to report
/// (ADR-004), so the UI shows a skeleton between the two.
///
/// Per image: `started` once, unless the job was cancelled while the image waited for a free
/// slot; then `finished` exactly once.
#[derive(Debug, Clone, Serialize)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum ImageEvent {
    /// The provider began work on image `index`.
    Started { index: u32 },
    /// Image `index` is settled, either way.
    Finished { index: u32, outcome: ImageOutcome },
}

/// How one image of a job ended.
#[derive(Debug, Clone, Serialize)]
#[serde(
    tag = "status",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum ImageOutcome {
    /// The image is in the workspace's assets. `duration_ms` is the provider's time.
    Stored {
        asset: ImportedAsset,
        duration_ms: u64,
    },
    Failed {
        error: ImageError,
    },
}

/// What a job returns: one outcome per image, in order. The events were only its progress.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JobResult {
    /// The provider that ran the job.
    pub provider: String,
    pub images: Vec<ImageOutcome>,
}

/// Closed set of failure categories, for both rejected calls and failed images.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ImageErrorKind {
    /// No provider with that id.
    UnknownProvider,
    /// The workspace is not open in this process.
    UnknownWorkspace,
    /// The asset to edit is not in the workspace.
    NotFound,
    /// A malformed argument: empty prompt, count out of range, job id.
    InvalidInput,
    /// The provider cannot do this: edit at all, or edit inside a mask.
    Unsupported,
    /// The provider's program is not installed.
    NotInstalled,
    /// The provider is installed but not signed in, or its sign-in has expired.
    NotLoggedIn,
    /// A usage limit was reached.
    Quota,
    /// The provider did not finish in time and was stopped.
    Timeout,
    /// The job was cancelled.
    Cancelled,
    /// The provider ran and produced no usable image; `message` says what it reported.
    GenerationFailed,
    /// Reading or writing a file failed.
    Io,
    /// A bug on the Rust side.
    Internal,
}

/// An error as the webview receives it: `{ kind, message }`, like the other commands' errors.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ImageError {
    pub kind: ImageErrorKind,
    /// English details. Unlike the storage errors, this text may reach the agent as the result
    /// of its tool call, so it says what to do next where there is something to do.
    pub message: String,
}

impl ImageError {
    /// An error of the given kind.
    pub fn new(kind: ImageErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }

    /// The webview sent something malformed.
    pub fn invalid_input(message: impl Into<String>) -> Self {
        Self::new(ImageErrorKind::InvalidInput, message)
    }

    /// The job was cancelled before this image was done.
    pub fn cancelled() -> Self {
        Self::new(ImageErrorKind::Cancelled, "the job was cancelled")
    }

    /// A file operation failed while doing `action`.
    pub fn io(action: impl fmt::Display, error: &std::io::Error) -> Self {
        Self::new(ImageErrorKind::Io, format!("could not {action}: {error}"))
    }

    /// A bug on the Rust side.
    pub fn internal(message: impl fmt::Display) -> Self {
        Self::new(ImageErrorKind::Internal, message.to_string())
    }
}

impl fmt::Display for ImageError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for ImageError {}

/// Storage and asset failures keep their category.
impl From<AppError> for ImageError {
    fn from(error: AppError) -> Self {
        let kind = match error.kind {
            ErrorKind::NotFound => ImageErrorKind::NotFound,
            ErrorKind::InvalidInput => ImageErrorKind::InvalidInput,
            ErrorKind::Io => ImageErrorKind::Io,
            ErrorKind::UnknownWorkspace => ImageErrorKind::UnknownWorkspace,
            ErrorKind::InvalidFile | ErrorKind::Internal => ImageErrorKind::Internal,
        };
        Self::new(kind, error.message)
    }
}

#[cfg(test)]
mod tests {
    use serde_json::Value;

    use super::*;
    use crate::assets::AssetKind;

    type TestResult = std::result::Result<(), Box<dyn std::error::Error>>;

    /// One sample of every shape that crosses IPC. The webview's types are checked against the
    /// same file (`apps/desktop/src/images/images.test.ts`).
    fn contract() -> serde_json::Result<Value> {
        serde_json::from_str(include_str!("fixtures/contract.json"))
    }

    fn asset() -> ImportedAsset {
        ImportedAsset {
            id: "ab".repeat(32),
            file: format!("{}.png", "ab".repeat(32)),
            mime: "image/png".into(),
            kind: AssetKind::Image,
            bytes: 2_148_301,
            width: Some(1672.0),
            height: Some(941.0),
            name: None,
        }
    }

    #[test]
    fn events_and_results_have_the_contract_shape() -> TestResult {
        let contract = contract()?;
        let stored = ImageOutcome::Stored {
            asset: asset(),
            duration_ms: 51_300,
        };
        let failed = ImageOutcome::Failed {
            error: ImageError::cancelled(),
        };
        let events = vec![
            ImageEvent::Started { index: 0 },
            ImageEvent::Finished {
                index: 0,
                outcome: stored.clone(),
            },
            ImageEvent::Finished {
                index: 1,
                outcome: failed.clone(),
            },
        ];
        assert_eq!(serde_json::to_value(&events)?, contract["events"]);
        let result = JobResult {
            provider: "example".into(),
            images: vec![stored, failed],
        };
        assert_eq!(serde_json::to_value(&result)?, contract["result"]);
        Ok(())
    }

    #[test]
    fn error_kinds_are_the_contract_list() -> TestResult {
        use ImageErrorKind::*;
        let all = [
            UnknownProvider,
            UnknownWorkspace,
            NotFound,
            InvalidInput,
            Unsupported,
            NotInstalled,
            NotLoggedIn,
            Quota,
            Timeout,
            Cancelled,
            GenerationFailed,
            Io,
            Internal,
        ];
        // Exhaustive: a new kind does not compile here until it is in the list above.
        let position = |kind: ImageErrorKind| match kind {
            UnknownProvider => 0,
            UnknownWorkspace => 1,
            NotFound => 2,
            InvalidInput => 3,
            Unsupported => 4,
            NotInstalled => 5,
            NotLoggedIn => 6,
            Quota => 7,
            Timeout => 8,
            Cancelled => 9,
            GenerationFailed => 10,
            Io => 11,
            Internal => 12,
        };
        assert!(all.iter().enumerate().all(|(i, kind)| position(*kind) == i));
        let contract = contract()?;
        assert_eq!(serde_json::to_value(all)?, contract["errorKinds"]);
        assert_eq!(
            serde_json::to_value(ImageError::cancelled())?,
            contract["error"]
        );
        Ok(())
    }

    #[test]
    fn descriptors_and_statuses_have_the_contract_shape() -> TestResult {
        let contract = contract()?;
        let descriptor = |id: &str, name: &str, edit, mask, max_parallel| ProviderDescriptor {
            id: id.into(),
            name: name.into(),
            capabilities: Capabilities {
                edit,
                mask,
                transparent: false,
                max_parallel,
                quality: false,
            },
            key: None,
        };
        // A provider that is a web API: it needs a key, and takes a quality.
        let mut exact = descriptor("exact", "Exact", EditSupport::Exact, true, 2);
        exact.key = Some(SecretName::OpenaiApi);
        exact.capabilities.quality = true;
        let descriptors = [
            descriptor("example", "Example", EditSupport::Regenerate, false, 4),
            exact,
            descriptor("plain", "Plain", EditSupport::None, false, 1),
        ];
        assert_eq!(serde_json::to_value(descriptors)?, contract["descriptors"]);
        let status =
            |state, version: Option<&str>, account: Option<&str>, detail: &str| ProviderStatus {
                state,
                version: version.map(Into::into),
                account: account.map(Into::into),
                detail: (!detail.is_empty()).then(|| detail.into()),
            };
        let statuses = [
            status(ProviderState::Ready, Some("0.160.0"), Some("ChatGPT"), ""),
            status(ProviderState::NotInstalled, None, None, "Install it."),
            status(
                ProviderState::NotLoggedIn,
                Some("0.160.0"),
                None,
                "Sign in.",
            ),
            status(ProviderState::Unavailable, None, None, "timed out"),
        ];
        assert_eq!(serde_json::to_value(statuses)?, contract["statuses"]);
        Ok(())
    }

    #[test]
    fn jobs_parse_as_the_contract_says() -> TestResult {
        let contract = contract()?;
        let jobs: Vec<GenerateJob> = serde_json::from_value(contract["generateJobs"].clone())?;
        let [plain, picked] = &jobs[..] else {
            return Err("expected two generate jobs".into());
        };
        assert_eq!((plain.count, plain.aspect), (1, Aspect::Wide));
        assert!(plain.provider.is_none());
        assert_eq!((picked.count, picked.aspect), (4, Aspect::Tall));
        assert_eq!(picked.provider.as_deref(), Some("example"));

        let edits: Vec<EditJob> = serde_json::from_value(contract["editJobs"].clone())?;
        let [plain, masked] = &edits[..] else {
            return Err("expected two edit jobs".into());
        };
        assert_eq!(plain.asset_id, "ab".repeat(32));
        assert!(plain.mask_asset_id.is_none() && plain.provider.is_none());
        assert_eq!(masked.mask_asset_id, Some("cd".repeat(32)));

        let aspects: Vec<Aspect> = serde_json::from_value(contract["aspects"].clone())?;
        assert_eq!(
            aspects.iter().map(|a| a.ratio()).collect::<Vec<_>>(),
            [(16, 9), (4, 3), (1, 1), (3, 4), (9, 16)]
        );
        Ok(())
    }

    #[test]
    fn storage_errors_keep_their_category() {
        let unknown = ImageError::from(AppError::unknown_workspace("w1"));
        assert_eq!(unknown.kind, ImageErrorKind::UnknownWorkspace);
        assert_eq!(unknown.message, "unknown workspace: w1");
        let io = std::io::Error::other("disk full");
        assert_eq!(
            ImageError::from(AppError::io("write the asset", &io)).kind,
            ImageErrorKind::Io
        );
    }
}
