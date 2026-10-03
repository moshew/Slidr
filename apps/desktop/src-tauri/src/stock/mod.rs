//! Stock photos (SPEC 11.9, GEN-08, ADR-052): one interface over photo libraries that are web
//! APIs, so the rest of the app knows sources, photos and credits, never a particular library.
//!
//! ```text
//! webview ──stock_search──► StockService ──► dyn StockProvider ──► the library's API
//!    │                          │  remembers what it found: id ─► the photo's addresses
//!    ├──stock_thumbnail(id)────►│ ──► the library's image host ──► bytes
//!    └──stock_import(id)───────►│ ──► bytes ──► assets::import_bytes ──► <workspace>/assets/
//!                               └──► "this photo was taken", where the library counts it
//! ```
//!
//! This is the same shape as the image providers (ADR-025): a provider in Rust, a thin adapter
//! in the webview. It is also why the webview's content security policy can stay closed to the
//! network (SEC-05): the page never loads a picture from a library's host; Rust fetches it, from
//! the address the library gave, and hands over bytes. The webview names a photo by its id only,
//! so it cannot make Rust fetch an address of its own choosing.
//!
//! A source needs the user's key, from the credential store ([`crate::secrets`]). The key goes
//! in a header to the library's API host and to no other: image hosts are asked without it.
//!
//! Sources live next to this file; [`registry`] is the only place that names them.

pub mod ipc;
mod mock;
mod registry;
mod service;

use std::fmt;

use async_trait::async_trait;
use reqwest::{RequestBuilder, StatusCode, Url};
use serde::{Deserialize, Serialize};

use crate::{
    error::{AppError, ErrorKind},
    net,
};

pub use registry::builtin;
pub use service::StockService;

/// Result of every stock operation.
pub type Result<T> = std::result::Result<T, StockError>;

/// The app, as the libraries' links know it (`utm_source`).
pub const APP: &str = "slidr";

/// How long a search or a thumbnail may take.
const TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30);
/// The largest picture taken in, in bytes. A photo at slide size is two or three megabytes.
const MAX_IMAGE: usize = 40 * 1024 * 1024;

/// A photo library.
///
/// `search` asks the library; the other calls work on what a search found. By the time any call
/// returns, the source has nothing of it still running.
#[async_trait]
pub trait StockProvider: Send + Sync {
    /// Id, name and the link the app shows next to results. Cheap and constant.
    fn descriptor(&self) -> SourceDescriptor;

    /// Whether the source can be searched now. No network: only whether its key is stored.
    fn state(&self) -> SourceState;

    /// One page of photos for a query.
    async fn search(&self, query: &StockQuery) -> Result<Page>;

    /// A small picture of a photo, for the results grid.
    async fn thumbnail(&self, found: &Found) -> Result<Vec<u8>>;

    /// The photo at the size a slide needs.
    async fn image(&self, found: &Found) -> Result<Vec<u8>>;

    /// Called once the user has taken a photo into a deck. A library that counts such uses is
    /// told here.
    async fn taken(&self, _found: &Found) -> Result<()> {
        Ok(())
    }
}

/// What a source is.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceDescriptor {
    /// Stable id, used in settings and in requests.
    pub id: String,
    /// Display name. Also what a credit ends with: "Photo by … on <name>".
    pub name: String,
    /// The library's own page, to link next to its results as its terms ask.
    pub home_url: String,
    /// The name of the licence its photos come under, kept with every asset.
    pub license: String,
}

/// Whether a source can be searched.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SourceState {
    Ready,
    /// The user has not entered the source's key.
    NoKey,
}

/// A source with its state, as the webview lists them.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceStatus {
    #[serde(flatten)]
    pub descriptor: SourceDescriptor,
    pub state: SourceState,
}

/// The shape of photo wanted.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Orientation {
    Landscape,
    Portrait,
    Square,
}

/// `stock_search`: one page of results.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StockQuery {
    pub query: String,
    /// From 1.
    #[serde(default = "first_page")]
    pub page: u32,
    /// 1 to 30.
    #[serde(default = "page_size")]
    pub per_page: u32,
    #[serde(default)]
    pub orientation: Option<Orientation>,
}

fn first_page() -> u32 {
    1
}

fn page_size() -> u32 {
    20
}

/// A photo as the webview sees it: what to show, and whom to credit. Its addresses stay in Rust.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StockPhoto {
    /// The library's id of the photo.
    pub id: String,
    /// The source it came from.
    pub source: String,
    pub width: u32,
    pub height: u32,
    /// The photo's average colour (`#rrggbb`), to fill its tile until the thumbnail arrives.
    pub color: Option<String>,
    /// What the photo shows, in the library's words.
    pub description: Option<String>,
    /// The photographer's name.
    pub author: String,
    /// The photographer's page at the library.
    pub author_url: String,
    /// The photo's page at the library.
    pub page_url: String,
}

/// A photo with the addresses the source works from. Never serialized.
#[derive(Debug, Clone)]
pub struct Found {
    pub photo: StockPhoto,
    /// A small rendition, for the grid.
    pub thumb_url: String,
    /// The rendition a slide gets.
    pub image_url: String,
    /// Where the library is told that the photo was taken, when it wants to be.
    pub track_url: Option<String>,
    /// The link a credit carries: where the library's terms point it.
    pub credit_url: String,
}

/// One page of a search, as a source returns it.
#[derive(Debug, Clone)]
pub struct Page {
    pub found: Vec<Found>,
    /// How many photos the library has for the query.
    pub total: u32,
    pub has_more: bool,
}

/// One page of a search, as the webview receives it.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StockResults {
    /// The source that answered.
    pub source: String,
    pub photos: Vec<StockPhoto>,
    pub total: u32,
    pub page: u32,
    pub has_more: bool,
}

/// Whom an asset is credited to (`AssetMeta.attribution` in `packages/model`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Attribution {
    pub author: String,
    /// The link the credit carries: where the library's terms point it.
    pub url: String,
    pub license: String,
}

/// A photo now in the workspace's assets.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedPhoto {
    pub asset: crate::assets::ImportedAsset,
    pub attribution: Attribution,
    /// What the photo shows, for the asset's name and the image's alt text.
    pub description: Option<String>,
}

/// Closed set of failure categories.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StockErrorKind {
    /// No source with that id.
    UnknownSource,
    /// The source's key is not stored.
    NoKey,
    /// The library rejected the key.
    InvalidKey,
    /// The library's request limit was reached.
    RateLimit,
    /// A malformed argument: an empty query, a page out of range.
    InvalidInput,
    /// The photo is not among the recent results; search again.
    NotFound,
    /// The workspace is not open in this process.
    UnknownWorkspace,
    /// The library could not be reached.
    Network,
    /// The library answered, but not with what was asked for.
    Failed,
    /// Reading or writing a file failed.
    Io,
    /// A bug on the Rust side.
    Internal,
}

/// An error as the webview receives it: `{ kind, message }`. The message is English and may
/// reach the agent as the result of its tool call, so it says what to do where there is
/// something to do. It never holds a key or an address with a query string.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct StockError {
    pub kind: StockErrorKind,
    pub message: String,
}

impl StockError {
    /// An error of the given kind.
    pub fn new(kind: StockErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }

    /// The webview sent something malformed.
    pub fn invalid_input(message: impl Into<String>) -> Self {
        Self::new(StockErrorKind::InvalidInput, message)
    }

    /// A bug on the Rust side.
    pub fn internal(message: impl fmt::Display) -> Self {
        Self::new(StockErrorKind::Internal, message.to_string())
    }

    /// The user has not entered the key of the source named `name`.
    pub fn no_key(name: &str) -> Self {
        Self::new(
            StockErrorKind::NoKey,
            format!("No {name} key is stored. The user can enter one in Settings."),
        )
    }
}

impl fmt::Display for StockError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for StockError {}

/// Storage and asset failures keep their category.
impl From<AppError> for StockError {
    fn from(error: AppError) -> Self {
        let kind = match error.kind {
            ErrorKind::NotFound => StockErrorKind::NotFound,
            ErrorKind::InvalidInput => StockErrorKind::InvalidInput,
            ErrorKind::Io => StockErrorKind::Io,
            ErrorKind::UnknownWorkspace => StockErrorKind::UnknownWorkspace,
            ErrorKind::InvalidFile | ErrorKind::Internal => StockErrorKind::Internal,
        };
        Self::new(kind, error.message)
    }
}

/// Sends a request to a library and returns the status and the body.
async fn answer(name: &str, request: RequestBuilder) -> Result<(StatusCode, Vec<u8>)> {
    let unreachable = |error: reqwest::Error| {
        StockError::new(
            StockErrorKind::Network,
            format!("{name}: {}", net::failure(&error)),
        )
    };
    let response = request.timeout(TIMEOUT).send().await.map_err(unreachable)?;
    let status = response.status();
    let body = response.bytes().await.map_err(unreachable)?;
    Ok((status, body.to_vec()))
}

/// What a refusal of a library means, by its status. The library's own text is not passed on:
/// it adds nothing the status does not say, and a body is free to echo the request.
fn refusal(name: &str, status: StatusCode, rate_limit: &[u16]) -> StockError {
    let code = status.as_u16();
    if code == 401 {
        StockError::new(
            StockErrorKind::InvalidKey,
            format!("{name} rejected the key. The user can enter a valid one in Settings."),
        )
    } else if rate_limit.contains(&code) {
        StockError::new(
            StockErrorKind::RateLimit,
            format!("{name}'s request limit was reached. Try again within the hour."),
        )
    } else {
        StockError::new(
            StockErrorKind::Failed,
            format!("{name} refused the request ({code})."),
        )
    }
}

/// Fetches a picture from one of a library's image hosts, without the key: a rendition's
/// address is public, and the key belongs to the API host alone.
async fn fetch_image(name: &str, address: &str, hosts: &[&str]) -> Result<Vec<u8>> {
    let url = Url::parse(address)
        .ok()
        .filter(|url| net::allowed(url) && host_is_one_of(url, hosts))
        .ok_or_else(|| {
            StockError::new(
                StockErrorKind::Failed,
                format!("{name} pointed at a picture on a host that is not its own."),
            )
        })?;
    let (status, body) = answer(name, net::client().get(url)).await?;
    if !status.is_success() {
        return Err(StockError::new(
            StockErrorKind::Failed,
            format!(
                "{name}'s picture could not be fetched ({}).",
                status.as_u16()
            ),
        ));
    }
    if body.len() > MAX_IMAGE || !infer::is_image(&body) {
        return Err(StockError::new(
            StockErrorKind::Failed,
            format!("{name} answered with something that is not a picture."),
        ));
    }
    Ok(body)
}

/// Whether `url` is on one of `hosts`. A stand-in on this machine counts as any of them.
fn host_is_one_of(url: &Url, hosts: &[&str]) -> bool {
    net::is_loopback(url) && cfg!(any(test, debug_assertions))
        || url.host_str().is_some_and(|host| hosts.contains(&host))
}

/// `text` cut to a length that suits a name or an alt text, on a character boundary.
fn short(text: &str, max: usize) -> String {
    let text = text.trim();
    if text.chars().count() <= max {
        text.to_owned()
    } else {
        text.chars()
            .take(max)
            .collect::<String>()
            .trim_end()
            .to_owned()
    }
}

/// A link back to a library, marked as coming from the app, as its terms ask
/// (`?utm_source=<app>&utm_medium=referral`). An address that does not parse is left as it is.
fn referral(address: &str) -> String {
    match Url::parse(address) {
        Ok(mut url) => {
            url.query_pairs_mut()
                .append_pair("utm_source", APP)
                .append_pair("utm_medium", "referral");
            url.into()
        }
        Err(_) => address.to_owned(),
    }
}

#[cfg(test)]
mod tests {
    use serde_json::Value;

    use super::*;
    use crate::{
        assets::{AssetKind, ImportedAsset},
        secrets::{SecretName, SecretStatus},
    };

    type TestResult = std::result::Result<(), Box<dyn std::error::Error>>;

    /// One sample of every shape that crosses IPC. The webview's types are checked against the
    /// same file (`apps/desktop/src/media/stock.test.ts`).
    fn contract() -> serde_json::Result<Value> {
        serde_json::from_str(include_str!("fixtures/contract.json"))
    }

    fn photo(id: &str, author: &str, page: &str, profile: &str) -> StockPhoto {
        StockPhoto {
            id: id.into(),
            source: "example".into(),
            width: 0,
            height: 0,
            color: None,
            description: None,
            author: author.into(),
            author_url: profile.into(),
            page_url: page.into(),
        }
    }

    #[test]
    fn sources_results_and_imports_have_the_contract_shape() -> TestResult {
        let contract = contract()?;
        let source = |id: &str, name: &str, home: &str, state| SourceStatus {
            descriptor: SourceDescriptor {
                id: id.into(),
                name: name.into(),
                home_url: home.into(),
                license: format!("{name} License"),
            },
            state,
        };
        let sources = [
            source(
                "example",
                "Example",
                &referral("https://example.com/"),
                SourceState::Ready,
            ),
            source(
                "other",
                "Other",
                "https://other.example.com",
                SourceState::NoKey,
            ),
        ];
        assert_eq!(serde_json::to_value(sources)?, contract["sources"]);

        let profile = referral("https://example.com/@ugmonk");
        let results = StockResults {
            source: "example".into(),
            photos: vec![
                StockPhoto {
                    width: 4000,
                    height: 3000,
                    color: Some("#A7A2A1".into()),
                    description: Some("A man drinking a coffee.".into()),
                    ..photo(
                        "eOLpJytrbsQ",
                        "Jeff Sheldon",
                        &referral("https://example.com/photos/eOLpJytrbsQ"),
                        &profile,
                    )
                },
                StockPhoto {
                    width: 3066,
                    height: 3968,
                    ..photo(
                        "3573351",
                        "Lukas Rodriguez",
                        "https://example.com/photo/3573351/",
                        "https://example.com/@lukas",
                    )
                },
            ],
            total: 133,
            page: 1,
            has_more: true,
        };
        assert_eq!(serde_json::to_value(&results)?, contract["results"]);

        let imported = ImportedPhoto {
            asset: ImportedAsset {
                id: "ab".repeat(32),
                file: format!("{}.jpg", "ab".repeat(32)),
                mime: "image/jpeg".into(),
                kind: AssetKind::Image,
                bytes: 612_044,
                width: Some(2400.0),
                height: Some(1800.0),
                name: Some("example-eOLpJytrbsQ".into()),
            },
            attribution: Attribution {
                author: "Jeff Sheldon".into(),
                url: profile,
                license: "Example License".into(),
            },
            description: Some("A man drinking a coffee.".into()),
        };
        assert_eq!(serde_json::to_value(&imported)?, contract["imported"]);
        Ok(())
    }

    #[test]
    fn queries_errors_and_key_states_have_the_contract_shape() -> TestResult {
        use StockErrorKind::*;
        let contract = contract()?;
        let queries: Vec<StockQuery> = serde_json::from_value(contract["queries"].clone())?;
        let [plain, full] = &queries[..] else {
            return Err("expected two queries".into());
        };
        assert_eq!(
            (plain.page, plain.per_page, plain.orientation),
            (1, 20, None)
        );
        assert_eq!(
            (full.page, full.per_page, full.orientation),
            (3, 12, Some(Orientation::Portrait))
        );

        let all = [
            UnknownSource,
            NoKey,
            InvalidKey,
            RateLimit,
            InvalidInput,
            NotFound,
            UnknownWorkspace,
            Network,
            Failed,
            Io,
            Internal,
        ];
        // Exhaustive: a new kind does not compile here until it is in the list above.
        let position = |kind: StockErrorKind| match kind {
            UnknownSource => 0,
            NoKey => 1,
            InvalidKey => 2,
            RateLimit => 3,
            InvalidInput => 4,
            NotFound => 5,
            UnknownWorkspace => 6,
            Network => 7,
            Failed => 8,
            Io => 9,
            Internal => 10,
        };
        assert!(all.iter().enumerate().all(|(i, kind)| position(*kind) == i));
        assert_eq!(serde_json::to_value(all)?, contract["errorKinds"]);
        assert_eq!(
            serde_json::to_value(StockError::no_key("Example"))?,
            contract["error"]
        );

        // The keys' states travel beside the sources; their shape is pinned in the same file.
        let states: Vec<_> = SecretName::ALL
            .into_iter()
            .map(|name| SecretStatus {
                name,
                present: name == SecretName::OpenaiApi,
            })
            .collect();
        assert_eq!(serde_json::to_value(states)?, contract["secrets"]);
        Ok(())
    }

    #[test]
    fn a_referral_link_carries_the_app() {
        assert_eq!(
            referral("https://unsplash.com/@ugmonk"),
            "https://unsplash.com/@ugmonk?utm_source=slidr&utm_medium=referral"
        );
        assert_eq!(
            referral("https://unsplash.com/photos/abc?x=1"),
            "https://unsplash.com/photos/abc?x=1&utm_source=slidr&utm_medium=referral"
        );
        assert_eq!(referral("not a link"), "not a link");
    }

    #[test]
    fn storage_errors_keep_their_category() {
        let unknown = StockError::from(AppError::unknown_workspace("w1"));
        assert_eq!(unknown.kind, StockErrorKind::UnknownWorkspace);
    }

    #[test]
    fn a_long_description_is_cut_on_a_character() {
        assert_eq!(short("  a barn  ", 20), "a barn");
        assert_eq!(short("שדה חיטה רחב בשעת שקיעה", 8), "שדה חיטה");
    }

    #[test]
    fn a_refusal_is_sorted_by_its_status() {
        let kind = |code: u16| {
            StatusCode::from_u16(code)
                .map(|status| refusal("Example", status, &[403, 429]).kind)
                .ok()
        };
        assert_eq!(kind(401), Some(StockErrorKind::InvalidKey));
        assert_eq!(kind(403), Some(StockErrorKind::RateLimit));
        assert_eq!(kind(429), Some(StockErrorKind::RateLimit));
        assert_eq!(kind(500), Some(StockErrorKind::Failed));
    }
}
