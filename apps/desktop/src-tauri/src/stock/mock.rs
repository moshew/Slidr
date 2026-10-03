//! A photo library that draws its pictures (SPEC 14.5): the stock flows without a key, without
//! the network and without anyone's photos. Used by the Rust tests, and offered in the app
//! (debug builds, or with `SLIDR_STOCK_MOCK` set) for UI work and end-to-end tests.
//!
//! Every query finds 57 photos, each a two-colour gradient that follows the query and the
//! photo's number, credited to one of four made-up photographers. A word in the query picks a
//! failure instead:
//!
//! | word                | what happens                 |
//! |---------------------|------------------------------|
//! | `mock:empty`        | no photos                    |
//! | `mock:rate_limit`   | fails with `rate_limit`      |
//! | `mock:invalid_key`  | fails with `invalid_key`     |
//! | `mock:offline`      | fails with `network`         |

use std::{
    hash::{DefaultHasher, Hash, Hasher},
    io::Cursor,
    time::Duration,
};

use async_trait::async_trait;
use image::{DynamicImage, ImageFormat, Rgb, RgbImage};

use super::{
    Found, Orientation, Page, Result, SourceDescriptor, SourceState, StockError, StockErrorKind,
    StockPhoto, StockProvider, StockQuery,
};

const ID: &str = "mock";
/// How many photos every query finds.
const TOTAL: u32 = 57;
const AUTHORS: [&str; 4] = ["Dana Levi", "Omar Haddad", "Mika Tanaka", "Sam Carter"];

const FAILURES: [(&str, StockErrorKind); 3] = [
    ("mock:rate_limit", StockErrorKind::RateLimit),
    ("mock:invalid_key", StockErrorKind::InvalidKey),
    ("mock:offline", StockErrorKind::Network),
];

/// The drawn library.
pub struct MockStock {
    /// How long a search takes: long enough to see the UI wait.
    delay: Duration,
}

impl MockStock {
    pub fn new(delay: Duration) -> Self {
        Self { delay }
    }

    /// The source the app offers.
    pub fn builtin() -> Self {
        Self::new(Duration::from_millis(400))
    }
}

fn seed(text: &str, number: u32) -> u64 {
    let mut hasher = DefaultHasher::new();
    (text, number).hash(&mut hasher);
    hasher.finish()
}

/// The shape of photo `number`: the one asked for, or a mix when none was.
fn shape(orientation: Option<Orientation>, number: u32) -> (u32, u32) {
    let orientation = orientation.unwrap_or(match number % 3 {
        0 => Orientation::Landscape,
        1 => Orientation::Portrait,
        _ => Orientation::Square,
    });
    match orientation {
        Orientation::Landscape => (2400, 1600),
        Orientation::Portrait => (1600, 2400),
        Orientation::Square => (2000, 2000),
    }
}

/// A diagonal gradient of the photo's proportions, `long` pixels on its longer side, as a PNG.
fn draw(found: &Found, long: u32) -> Result<Vec<u8>> {
    let StockPhoto { width, height, .. } = found.photo;
    let scale = |side: u32| (side * long / width.max(height).max(1)).max(1);
    let (w, h) = (scale(width), scale(height));
    let [r1, g1, b1, r2, g2, b2, ..] = seed(&found.photo.id, 0).to_le_bytes();
    let steps = (w + h).saturating_sub(2).max(1);
    let image = RgbImage::from_fn(w, h, |x, y| {
        let t = (x + y) * 255 / steps;
        let mix = |from: u8, to: u8| {
            let mixed = (u32::from(from) * (255 - t) + u32::from(to) * t) / 255;
            u8::try_from(mixed).unwrap_or(u8::MAX)
        };
        Rgb([mix(r1, r2), mix(g1, g2), mix(b1, b2)])
    });
    let mut out = Vec::new();
    DynamicImage::ImageRgb8(image)
        .write_to(&mut Cursor::new(&mut out), ImageFormat::Png)
        .map_err(StockError::internal)?;
    Ok(out)
}

#[async_trait]
impl StockProvider for MockStock {
    fn descriptor(&self) -> SourceDescriptor {
        SourceDescriptor {
            id: ID.into(),
            name: "Mock photos".into(),
            home_url: "https://example.com/mock-photos".into(),
            license: "Mock License".into(),
            key: None,
        }
    }

    fn state(&self) -> SourceState {
        SourceState::Ready
    }

    async fn search(&self, query: &StockQuery) -> Result<Page> {
        tokio::time::sleep(self.delay).await;
        if let Some((word, kind)) = FAILURES.iter().find(|(word, _)| query.query.contains(word)) {
            return Err(StockError::new(
                *kind,
                format!("the mock library was asked to fail ({word})"),
            ));
        }
        let total = if query.query.contains("mock:empty") {
            0
        } else {
            TOTAL
        };
        let first = (query.page - 1).saturating_mul(query.per_page);
        let last = first.saturating_add(query.per_page).min(total);
        let found = (first..last)
            .map(|number| {
                let (width, height) = shape(query.orientation, number);
                let [r, g, b, ..] = seed(&query.query, number).to_le_bytes();
                let author = AUTHORS[number as usize % AUTHORS.len()];
                let id = format!("{:016x}", seed(&query.query, number));
                Found {
                    thumb_url: String::new(),
                    image_url: String::new(),
                    track_url: None,
                    credit_url: format!("https://example.com/mock-photos/{id}"),
                    photo: StockPhoto {
                        page_url: format!("https://example.com/mock-photos/{id}"),
                        author_url: format!(
                            "https://example.com/mock-photos/@{}",
                            author.to_lowercase().replace(' ', "-")
                        ),
                        id,
                        source: ID.into(),
                        width,
                        height,
                        color: Some(format!("#{r:02x}{g:02x}{b:02x}")),
                        description: Some(format!("{}, photo {}", query.query.trim(), number + 1)),
                        author: author.into(),
                    },
                }
            })
            .collect();
        Ok(Page {
            found,
            total,
            has_more: last < total,
        })
    }

    async fn thumbnail(&self, found: &Found) -> Result<Vec<u8>> {
        draw(found, 240)
    }

    async fn image(&self, found: &Found) -> Result<Vec<u8>> {
        draw(found, 1200)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    type TestResult = std::result::Result<(), Box<dyn std::error::Error>>;

    fn query(text: &str, page: u32, orientation: Option<Orientation>) -> StockQuery {
        StockQuery {
            query: text.into(),
            page,
            per_page: 20,
            orientation,
        }
    }

    #[tokio::test(start_paused = true)]
    async fn every_query_finds_photos_in_pages_with_credits_and_pictures() -> TestResult {
        let mock = MockStock::builtin();
        let first = mock.search(&query("wheat field", 1, None)).await?;
        assert_eq!(
            (first.total, first.has_more, first.found.len()),
            (57, true, 20)
        );
        let last = mock.search(&query("wheat field", 3, None)).await?;
        assert_eq!((last.has_more, last.found.len()), (false, 17));
        // The same query finds the same photos; another query finds others.
        let again = mock.search(&query("wheat field", 1, None)).await?;
        assert_eq!(again.found[0].photo, first.found[0].photo);
        let other = mock.search(&query("harbour", 1, None)).await?;
        assert_ne!(other.found[0].photo.id, first.found[0].photo.id);

        let photo = &first.found[1];
        assert!(AUTHORS.contains(&photo.photo.author.as_str()));
        assert_eq!(
            photo.photo.description.as_deref(),
            Some("wheat field, photo 2")
        );
        let thumbnail = image::load_from_memory(&mock.thumbnail(photo).await?)?;
        let picture = image::load_from_memory(&mock.image(photo).await?)?;
        // Photo 2 of a query with no shape asked for is a portrait.
        assert_eq!((thumbnail.width(), thumbnail.height()), (160, 240));
        assert_eq!((picture.width(), picture.height()), (800, 1200));

        let wide = mock
            .search(&query("wheat field", 1, Some(Orientation::Landscape)))
            .await?;
        assert!(wide.found.iter().all(|f| f.photo.width > f.photo.height));
        Ok(())
    }

    #[tokio::test(start_paused = true)]
    async fn a_word_in_the_query_picks_the_failure() -> TestResult {
        let mock = MockStock::builtin();
        for (word, kind) in FAILURES {
            let error = mock.search(&query(word, 1, None)).await.err();
            assert_eq!(error.map(|e| e.kind), Some(kind), "{word}");
        }
        let empty = mock.search(&query("mock:empty", 1, None)).await?;
        assert_eq!(
            (empty.total, empty.found.len(), empty.has_more),
            (0, 0, false)
        );
        Ok(())
    }
}
