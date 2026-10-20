//! Unsplash (GEN-08, ADR-051), as its documentation and API guidelines describe it.
//!
//! ```text
//! search:  GET https://api.unsplash.com/search/photos?query=…      Authorization: Client-ID <key>
//! picture: GET https://images.unsplash.com/…                        the addresses in `urls`, no key
//! taken:   GET <links.download_location>                            Authorization: Client-ID <key>
//! ```
//!
//! What the guidelines ask, and where it is done:
//!
//! - Pictures are fetched from the addresses the API returned, with their `ixid` parameter
//!   kept; sizing parameters are only added to `urls.raw`.
//! - When the user takes a photo, `links.download_location` is requested, as given.
//! - A photo is credited to its photographer with a link to their profile, and links back carry
//!   `utm_source` and `utm_medium=referral` ([`referral`]).
//!
//! `fixtures/unsplash-search.json` is put together from the samples in the documentation; there
//! was no key to record a live answer with.

use std::sync::Arc;

use async_trait::async_trait;
use reqwest::Url;
use serde::Deserialize;

use crate::stock::{
    Found, Orientation, Page, Result, SourceDescriptor, SourceState, StockError, StockErrorKind,
    StockPhoto, StockProvider, StockQuery, answer, fetch_image, referral, refusal, short,
};
use crate::{
    net,
    secrets::{Secret, SecretName, Secrets},
};

const ID: &str = "unsplash";
const NAME: &str = "Unsplash";
const API: &str = "https://api.unsplash.com";
/// A development build can be pointed at a stand-in on this machine (see [`net::base_url`]).
const API_VARIABLE: &str = "SLIDR_UNSPLASH_BASE_URL";
/// The host of the API itself: the only one the key is sent to.
const API_HOST: &str = "api.unsplash.com";
const IMAGE_HOSTS: [&str; 2] = ["images.unsplash.com", "plus.unsplash.com"];
/// The width asked of `urls.raw` for a slide: a full-bleed picture on a 1920 slide, with room
/// to crop.
const SLIDE_WIDTH: u32 = 2400;

/// The Unsplash API.
pub struct Unsplash {
    secrets: Arc<Secrets>,
    base: String,
}

impl Unsplash {
    pub fn new(secrets: Arc<Secrets>) -> Self {
        Self::at(net::base_url(API, API_VARIABLE), secrets)
    }

    /// The source against another base URL: a stand-in server.
    pub fn at(base: impl Into<String>, secrets: Arc<Secrets>) -> Self {
        Self {
            secrets,
            base: base.into(),
        }
    }

    fn key(&self) -> Result<Secret> {
        match self.secrets.get(SecretName::Unsplash) {
            Ok(Some(key)) => Ok(key),
            _ => Err(StockError::no_key(NAME)),
        }
    }

    /// A request to the API with the key. Refused before anything is sent unless the address
    /// is the API's own host: the address of the "taken" call comes from a response.
    fn authorized(&self, url: Url) -> Result<reqwest::RequestBuilder> {
        let own = Url::parse(&self.base)
            .ok()
            .is_some_and(|base| base.host_str() == url.host_str() && base.port() == url.port());
        if !(net::allowed(&url) && (own || url.host_str() == Some(API_HOST))) {
            return Err(StockError::new(
                StockErrorKind::Failed,
                format!("{NAME} pointed at an address that is not its own."),
            ));
        }
        let key = self.key()?;
        Ok(net::client()
            .get(url)
            .header("Authorization", format!("Client-ID {}", key.expose()))
            .header("Accept-Version", "v1"))
    }
}

#[derive(Deserialize)]
struct SearchAnswer {
    #[serde(default)]
    total: u32,
    #[serde(default)]
    total_pages: u32,
    #[serde(default)]
    results: Vec<Photo>,
}

#[derive(Deserialize)]
struct Photo {
    id: String,
    width: u32,
    height: u32,
    #[serde(default)]
    color: Option<String>,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    alt_description: Option<String>,
    urls: Urls,
    links: Links,
    user: User,
}

#[derive(Deserialize)]
struct Urls {
    raw: String,
    small: String,
}

#[derive(Deserialize)]
struct Links {
    html: String,
    #[serde(default)]
    download_location: Option<String>,
}

#[derive(Deserialize)]
struct User {
    name: String,
    links: UserLinks,
}

#[derive(Deserialize)]
struct UserLinks {
    html: String,
}

/// `urls.raw` with the size a slide needs. The address keeps what it came with (`ixid`).
fn slide_rendition(raw: &str) -> String {
    match Url::parse(raw) {
        Ok(mut url) => {
            url.query_pairs_mut()
                .append_pair("w", &SLIDE_WIDTH.to_string())
                .append_pair("fit", "max")
                .append_pair("q", "85")
                .append_pair("fm", "jpg");
            url.into()
        }
        Err(_) => raw.to_owned(),
    }
}

impl From<Photo> for Found {
    fn from(photo: Photo) -> Self {
        let description = photo
            .description
            .or(photo.alt_description)
            .map(|text| short(&text, 200))
            .filter(|text| !text.is_empty());
        Self {
            thumb_url: photo.urls.small,
            image_url: slide_rendition(&photo.urls.raw),
            track_url: photo.links.download_location,
            // The guidelines point the credit at the photographer's profile.
            credit_url: referral(&photo.user.links.html),
            photo: StockPhoto {
                id: photo.id,
                source: ID.into(),
                width: photo.width,
                height: photo.height,
                color: photo.color,
                description,
                author: photo.user.name,
                author_url: referral(&photo.user.links.html),
                page_url: referral(&photo.links.html),
            },
        }
    }
}

#[async_trait]
impl StockProvider for Unsplash {
    fn descriptor(&self) -> SourceDescriptor {
        SourceDescriptor {
            id: ID.into(),
            name: NAME.into(),
            home_url: referral("https://unsplash.com/"),
            license: "Unsplash License".into(),
            key: Some(SecretName::Unsplash),
        }
    }

    fn state(&self) -> SourceState {
        if self.key().is_ok() {
            SourceState::Ready
        } else {
            SourceState::NoKey
        }
    }

    async fn search(&self, query: &StockQuery) -> Result<Page> {
        let mut url =
            Url::parse(&format!("{}/search/photos", self.base)).map_err(StockError::internal)?;
        {
            let mut pairs = url.query_pairs_mut();
            pairs
                .append_pair("query", &query.query)
                .append_pair("page", &query.page.to_string())
                .append_pair("per_page", &query.per_page.to_string())
                // A deck is shown to an audience: the library's stricter filter.
                .append_pair("content_filter", "high");
            if let Some(orientation) = query.orientation {
                pairs.append_pair(
                    "orientation",
                    match orientation {
                        Orientation::Landscape => "landscape",
                        Orientation::Portrait => "portrait",
                        Orientation::Square => "squarish",
                    },
                );
            }
        }
        let (status, body) = answer(NAME, self.authorized(url)?).await?;
        if !status.is_success() {
            // Past its limit the API answers 403 with the words, not with a status of its own.
            let limited = String::from_utf8_lossy(&body).contains("Rate Limit");
            return Err(refusal(
                NAME,
                status,
                if limited { &[403, 429] } else { &[429] },
            ));
        }
        let found: SearchAnswer = serde_json::from_slice(&body).map_err(|_| {
            StockError::new(
                StockErrorKind::Failed,
                format!("{NAME} answered in a form the app does not know."),
            )
        })?;
        Ok(Page {
            has_more: query.page < found.total_pages,
            total: found.total,
            found: found.results.into_iter().map(Found::from).collect(),
        })
    }

    async fn thumbnail(&self, found: &Found) -> Result<Vec<u8>> {
        fetch_image(NAME, &found.thumb_url, &IMAGE_HOSTS).await
    }

    async fn image(&self, found: &Found) -> Result<Vec<u8>> {
        fetch_image(NAME, &found.image_url, &IMAGE_HOSTS).await
    }

    async fn taken(&self, found: &Found) -> Result<()> {
        let Some(address) = &found.track_url else {
            return Ok(());
        };
        let url = Url::parse(address).map_err(|_| {
            StockError::new(
                StockErrorKind::Failed,
                format!("{NAME} gave no address to report the photo's use to."),
            )
        })?;
        let (status, _) = answer(NAME, self.authorized(url)?).await?;
        if status.is_success() {
            Ok(())
        } else {
            Err(refusal(NAME, status, &[429]))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        net::testing::{Reply, Seen, serve},
        secrets,
    };

    type TestResult = std::result::Result<(), Box<dyn std::error::Error>>;

    const KEY: &str = "unsplash-access-key-0123456789";

    /// The documented answer, with its addresses pointed at the stand-in server.
    fn search_answer(base: &str) -> Vec<u8> {
        include_str!("fixtures/unsplash-search.json")
            .replace("https://images.unsplash.com", base)
            .replace("https://api.unsplash.com", base)
            .into_bytes()
    }

    fn query(text: &str) -> StockQuery {
        StockQuery {
            query: text.into(),
            page: 1,
            per_page: 20,
            orientation: Some(Orientation::Square),
        }
    }

    fn picture() -> Vec<u8> {
        let image = image::RgbaImage::from_pixel(4, 3, image::Rgba([9, 9, 9, 255]));
        let mut out = Vec::new();
        let written = image::DynamicImage::ImageRgba8(image)
            .write_to(&mut std::io::Cursor::new(&mut out), image::ImageFormat::Png);
        assert!(written.is_ok());
        out
    }

    #[test]
    fn the_documented_answer_maps_to_photos_with_credits() -> TestResult {
        let answer: SearchAnswer =
            serde_json::from_str(include_str!("fixtures/unsplash-search.json"))?;
        assert_eq!((answer.total, answer.total_pages), (133, 7));
        let found: Vec<Found> = answer.results.into_iter().map(Found::from).collect();
        let [first] = &found[..] else {
            return Err("expected one photo".into());
        };
        assert_eq!(
            first.photo,
            StockPhoto {
                id: "eOLpJytrbsQ".into(),
                source: "unsplash".into(),
                width: 4000,
                height: 3000,
                color: Some("#A7A2A1".into()),
                description: Some("A man drinking a coffee.".into()),
                author: "Jeff Sheldon".into(),
                author_url: "https://unsplash.com/@ugmonk?utm_source=slidr&utm_medium=referral"
                    .into(),
                page_url:
                    "https://unsplash.com/photos/eOLpJytrbsQ?utm_source=slidr&utm_medium=referral"
                        .into(),
            }
        );
        // The rendition for a slide is `urls.raw` with its own parameters kept, sized.
        assert_eq!(
            first.image_url,
            "https://images.unsplash.com/photo-1416339306562-f3d12fefd36f?ixlib=rb-1.2.1&\
             ixid=eyJhcHBfaWQiOjEyMDd9&w=2400&fit=max&q=85&fm=jpg"
        );
        assert!(first.thumb_url.contains("w=400") && first.thumb_url.contains("ixid="));
        assert_eq!(
            first.track_url.as_deref(),
            Some(
                "https://api.unsplash.com/photos/eOLpJytrbsQ/download?ixid=MnwxMTc4ODl8MHwxfHNl\
                 YXJjaHwxfHxwdXBweXxlbnwwfHx8fDE2MTc3NTA2MTM"
            )
        );
        Ok(())
    }

    #[tokio::test]
    async fn search_sends_the_key_to_the_api_and_pictures_are_fetched_without_it() -> TestResult {
        let image = picture();
        let server = serve({
            let image = image.clone();
            move |seen: &Seen| match seen.path.as_str() {
                "/search/photos" => {
                    let base = format!("http://{}", seen.header("host").unwrap_or_default());
                    Reply::json(200, search_answer(&base))
                }
                path if path.starts_with("/photo-") => {
                    Reply::bytes(200, "image/png", image.clone())
                }
                path if path.ends_with("/download") => Reply::json(200, br#"{"url":"x"}"#.to_vec()),
                _ => Reply::json(404, Vec::new()),
            }
        })
        .await?;
        let source = Unsplash::at(
            server.base.clone(),
            Arc::new(secrets::memory(&[(SecretName::Unsplash, KEY)])),
        );
        assert_eq!(source.state(), SourceState::Ready);

        let page = source.search(&query("coffee cup")).await?;
        assert_eq!(
            (page.total, page.has_more, page.found.len()),
            (133, true, 1)
        );
        let found = &page.found[0];
        assert_eq!(source.thumbnail(found).await?, image);
        assert_eq!(source.image(found).await?, image);
        source.taken(found).await?;

        let seen = server.seen();
        let [search, thumb, full, taken] = &seen[..] else {
            return Err(format!("expected four requests, saw {}", seen.len()).into());
        };
        assert_eq!(
            search.header("authorization"),
            Some(format!("Client-ID {KEY}"))
        );
        assert_eq!(search.header("accept-version").as_deref(), Some("v1"));
        assert_eq!(
            search.query,
            "query=coffee+cup&page=1&per_page=20&content_filter=high&orientation=squarish"
        );
        // The image host never sees the key.
        assert_eq!(thumb.header("authorization"), None);
        assert_eq!(full.header("authorization"), None);
        assert!(full.query.ends_with("&w=2400&fit=max&q=85&fm=jpg"));
        // The use is reported at the address given, parameters and all, with the key.
        assert_eq!(taken.path, "/photos/eOLpJytrbsQ/download");
        assert!(taken.query.starts_with("ixid="));
        assert_eq!(
            taken.header("authorization"),
            Some(format!("Client-ID {KEY}"))
        );
        for request in &seen {
            assert!(!request.path.contains(KEY) && !request.query.contains(KEY));
        }
        Ok(())
    }

    #[tokio::test]
    async fn refusals_say_what_the_user_can_do_and_never_quote_the_library() -> TestResult {
        for (status, body, kind) in [
            (
                401,
                r#"{"errors":["OAuth error: The access token is invalid"]}"#,
                StockErrorKind::InvalidKey,
            ),
            (403, "Rate Limit Exceeded", StockErrorKind::RateLimit),
            (
                403,
                r#"{"errors":["Missing permissions"]}"#,
                StockErrorKind::Failed,
            ),
            (500, "", StockErrorKind::Failed),
        ] {
            let server = serve(move |_| Reply::json(status, body.as_bytes().to_vec())).await?;
            let source = Unsplash::at(
                server.base.clone(),
                Arc::new(secrets::memory(&[(SecretName::Unsplash, KEY)])),
            );
            let error = source
                .search(&query("coffee"))
                .await
                .err()
                .ok_or("searched")?;
            assert_eq!(error.kind, kind, "{status} {body}");
            assert!(!error.message.contains(KEY) && !error.message.contains("OAuth"));
        }
        Ok(())
    }

    #[tokio::test]
    async fn without_a_key_nothing_is_sent_and_the_key_goes_to_no_other_host() -> TestResult {
        let server = serve(|_| Reply::json(200, Vec::new())).await?;
        let none = Unsplash::at(server.base.clone(), Arc::new(secrets::memory(&[])));
        assert_eq!(none.state(), SourceState::NoKey);
        let error = none
            .search(&query("coffee"))
            .await
            .err()
            .ok_or("searched")?;
        assert_eq!(error.kind, StockErrorKind::NoKey);
        assert!(server.seen().is_empty());

        // A "taken" address on a host that is not the API's is not asked, key or no key.
        let source = Unsplash::at(
            server.base.clone(),
            Arc::new(secrets::memory(&[(SecretName::Unsplash, KEY)])),
        );
        let answer: SearchAnswer =
            serde_json::from_str(include_str!("fixtures/unsplash-search.json"))?;
        let mut found: Found = answer.results.into_iter().next().ok_or("no photo")?.into();
        found.track_url = Some("https://example.com/photos/x/download".into());
        let error = source.taken(&found).await.err().ok_or("reported")?;
        assert_eq!(error.kind, StockErrorKind::Failed);
        assert!(server.seen().is_empty());
        Ok(())
    }
}
