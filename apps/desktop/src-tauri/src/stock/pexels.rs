//! Pexels (GEN-08, ADR-052), as its documentation describes it.
//!
//! ```text
//! search:  GET https://api.pexels.com/v1/search?query=…     Authorization: <key>
//! picture: GET https://images.pexels.com/…                  the addresses in `src`, no key
//! ```
//!
//! What its guidelines ask: a prominent link to Pexels where its photos are shown, and a credit
//! to the photographer with a link to the photo's page. There is no call to report a use, and
//! only the renditions the API lists are fetched: the documentation does not say that their
//! addresses may be changed.
//!
//! `fixtures/pexels-search.json` is the sample of the documentation, verbatim.

use std::sync::Arc;

use async_trait::async_trait;
use reqwest::Url;
use serde::Deserialize;

use crate::stock::{
    Found, Orientation, Page, Result, SourceDescriptor, SourceState, StockError, StockErrorKind,
    StockPhoto, StockProvider, StockQuery, answer, fetch_image, refusal, short,
};
use crate::{
    net,
    secrets::{Secret, SecretName, Secrets},
};

const ID: &str = "pexels";
const NAME: &str = "Pexels";
const API: &str = "https://api.pexels.com/v1";
/// A development build can be pointed at a stand-in on this machine (see [`net::base_url`]).
const API_VARIABLE: &str = "SLIDR_PEXELS_BASE_URL";
const IMAGE_HOSTS: [&str; 1] = ["images.pexels.com"];

/// The Pexels API.
pub struct Pexels {
    secrets: Arc<Secrets>,
    base: String,
}

impl Pexels {
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
        match self.secrets.get(SecretName::Pexels) {
            Ok(Some(key)) => Ok(key),
            _ => Err(StockError::no_key(NAME)),
        }
    }
}

#[derive(Deserialize)]
struct SearchAnswer {
    #[serde(default)]
    total_results: u32,
    #[serde(default)]
    next_page: Option<String>,
    #[serde(default)]
    photos: Vec<Photo>,
}

#[derive(Deserialize)]
struct Photo {
    id: u64,
    width: u32,
    height: u32,
    /// The photo's page.
    url: String,
    photographer: String,
    photographer_url: String,
    #[serde(default)]
    avg_color: Option<String>,
    src: Renditions,
    #[serde(default)]
    alt: Option<String>,
}

#[derive(Deserialize)]
struct Renditions {
    /// 940 by 650 at twice the density: up to 1880 pixels wide, the largest sized rendition.
    large2x: String,
    /// 350 pixels high.
    medium: String,
}

impl From<Photo> for Found {
    fn from(photo: Photo) -> Self {
        Self {
            thumb_url: photo.src.medium,
            image_url: photo.src.large2x,
            track_url: None,
            // The guidelines point the credit at the photo's page.
            credit_url: photo.url.clone(),
            photo: StockPhoto {
                id: photo.id.to_string(),
                source: ID.into(),
                width: photo.width,
                height: photo.height,
                color: photo.avg_color,
                description: photo
                    .alt
                    .map(|text| short(&text, 200))
                    .filter(|text| !text.is_empty()),
                author: photo.photographer,
                author_url: photo.photographer_url,
                page_url: photo.url,
            },
        }
    }
}

#[async_trait]
impl StockProvider for Pexels {
    fn descriptor(&self) -> SourceDescriptor {
        SourceDescriptor {
            id: ID.into(),
            name: NAME.into(),
            home_url: "https://www.pexels.com".into(),
            license: "Pexels License".into(),
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
        let key = self.key()?;
        let mut url = Url::parse(&format!("{}/search", self.base))
            .ok()
            .filter(net::allowed)
            .ok_or_else(|| {
                StockError::internal("the address of the photo library is not allowed")
            })?;
        {
            let mut pairs = url.query_pairs_mut();
            pairs
                .append_pair("query", &query.query)
                .append_pair("page", &query.page.to_string())
                .append_pair("per_page", &query.per_page.to_string());
            if let Some(orientation) = query.orientation {
                pairs.append_pair(
                    "orientation",
                    match orientation {
                        Orientation::Landscape => "landscape",
                        Orientation::Portrait => "portrait",
                        Orientation::Square => "square",
                    },
                );
            }
        }
        // The key alone, with no scheme word: that is how this API reads the header.
        let request = net::client().get(url).header("Authorization", key.expose());
        let (status, body) = answer(NAME, request).await?;
        if !status.is_success() {
            return Err(refusal(NAME, status, &[429]));
        }
        let found: SearchAnswer = serde_json::from_slice(&body).map_err(|_| {
            StockError::new(
                StockErrorKind::Failed,
                format!("{NAME} answered in a form the app does not know."),
            )
        })?;
        Ok(Page {
            has_more: found.next_page.is_some(),
            total: found.total_results,
            found: found.photos.into_iter().map(Found::from).collect(),
        })
    }

    async fn thumbnail(&self, found: &Found) -> Result<Vec<u8>> {
        fetch_image(NAME, &found.thumb_url, &IMAGE_HOSTS).await
    }

    async fn image(&self, found: &Found) -> Result<Vec<u8>> {
        fetch_image(NAME, &found.image_url, &IMAGE_HOSTS).await
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

    const KEY: &str = "pexels-key-0123456789abcdef";

    fn query(text: &str) -> StockQuery {
        StockQuery {
            query: text.into(),
            page: 2,
            per_page: 15,
            orientation: Some(Orientation::Landscape),
        }
    }

    #[test]
    fn the_documented_answer_maps_to_photos_with_credits() -> TestResult {
        let answer: SearchAnswer =
            serde_json::from_str(include_str!("fixtures/pexels-search.json"))?;
        assert_eq!(answer.total_results, 10000);
        assert!(answer.next_page.is_some());
        let found: Vec<Found> = answer.photos.into_iter().map(Found::from).collect();
        let [first] = &found[..] else {
            return Err("expected one photo".into());
        };
        assert_eq!(
            first.photo,
            StockPhoto {
                id: "3573351".into(),
                source: "pexels".into(),
                width: 3066,
                height: 3968,
                color: Some("#374824".into()),
                description: Some("Brown Rocks During Golden Hour".into()),
                author: "Lukas Rodriguez".into(),
                author_url: "https://www.pexels.com/@lukas-rodriguez-1845331".into(),
                page_url: "https://www.pexels.com/photo/trees-during-day-3573351/".into(),
            }
        );
        assert!(first.image_url.contains("dpr=2") && first.thumb_url.contains("h=350"));
        assert_eq!(first.track_url, None);
        Ok(())
    }

    #[tokio::test]
    async fn search_sends_the_bare_key_and_pictures_are_fetched_without_it() -> TestResult {
        let image = {
            let image = image::RgbaImage::from_pixel(4, 3, image::Rgba([9, 9, 9, 255]));
            let mut out = Vec::new();
            image::DynamicImage::ImageRgba8(image)
                .write_to(&mut std::io::Cursor::new(&mut out), image::ImageFormat::Png)?;
            out
        };
        let server = serve({
            let image = image.clone();
            move |seen: &Seen| match seen.path.as_str() {
                "/v1/search" => {
                    let base = format!("http://{}", seen.header("host").unwrap_or_default());
                    let body = include_str!("fixtures/pexels-search.json")
                        .replace("https://images.pexels.com", &base);
                    Reply::json(200, body.into_bytes())
                }
                path if path.starts_with("/photos/") => {
                    Reply::bytes(200, "image/png", image.clone())
                }
                _ => Reply::json(404, Vec::new()),
            }
        })
        .await?;
        let source = Pexels::at(
            format!("{}/v1", server.base),
            Arc::new(secrets::memory(&[(SecretName::Pexels, KEY)])),
        );
        let page = source.search(&query("golden hour")).await?;
        assert_eq!(
            (page.total, page.has_more, page.found.len()),
            (10000, true, 1)
        );
        assert_eq!(source.thumbnail(&page.found[0]).await?, image);
        assert_eq!(source.image(&page.found[0]).await?, image);
        // Nothing to report: this library does not count uses.
        source.taken(&page.found[0]).await?;

        let seen = server.seen();
        let [search, thumb, full] = &seen[..] else {
            return Err(format!("expected three requests, saw {}", seen.len()).into());
        };
        assert_eq!(search.header("authorization").as_deref(), Some(KEY));
        assert_eq!(
            search.query,
            "query=golden+hour&page=2&per_page=15&orientation=landscape"
        );
        assert_eq!(thumb.header("authorization"), None);
        assert_eq!(full.header("authorization"), None);
        Ok(())
    }

    #[tokio::test]
    async fn refusals_are_sorted_by_status() -> TestResult {
        for (status, body, kind) in [
            (
                401,
                r#"{"status":401,"code":"Unauthorized","message":"Invalid API key"}"#,
                StockErrorKind::InvalidKey,
            ),
            (429, "", StockErrorKind::RateLimit),
            (403, "", StockErrorKind::Failed),
        ] {
            let server = serve(move |_| Reply::json(status, body.as_bytes().to_vec())).await?;
            let source = Pexels::at(
                format!("{}/v1", server.base),
                Arc::new(secrets::memory(&[(SecretName::Pexels, KEY)])),
            );
            let error = source.search(&query("x")).await.err().ok_or("searched")?;
            assert_eq!(error.kind, kind, "{status}");
            assert!(!error.message.contains(KEY));
        }
        let none = Pexels::at("http://127.0.0.1:9/v1", Arc::new(secrets::memory(&[])));
        assert_eq!(none.state(), SourceState::NoKey);
        let error = none.search(&query("x")).await.err().ok_or("searched")?;
        assert_eq!(error.kind, StockErrorKind::NoKey);
        Ok(())
    }
}
