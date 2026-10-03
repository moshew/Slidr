//! A provider that draws placeholder pictures (SPEC 14.5): the image flows, their timing, their
//! failures and their cancellation without a CLI and without cost. Used by the Rust tests, and
//! selectable in the app (debug builds, or with `SLIDR_IMAGE_MOCK` set) for UI work and
//! end-to-end tests.
//!
//! Each image is a two-colour gradient of the requested shape. The colours follow the prompt and
//! differ from one image to the next, so the images of a job are different assets. An image takes
//! the mock's delay, and up to three quarters more, so a job's images do not land together.
//!
//! A word in the prompt (or in the edit instruction) picks a failure instead:
//!
//! | word                 | what happens                                    |
//! |----------------------|-------------------------------------------------|
//! | `mock:quota`         | fails with `quota`                              |
//! | `mock:not_logged_in` | fails with `not_logged_in`                      |
//! | `mock:not_installed` | fails with `not_installed`                      |
//! | `mock:timeout`       | fails with `timeout`                            |
//! | `mock:fail`          | fails with `generation_failed`                  |
//! | `mock:flaky`         | every third image fails, the others are made    |
//! | `mock:hang`          | never finishes; only cancelling the job ends it |

use std::{
    hash::{DefaultHasher, Hash, Hasher},
    sync::atomic::{AtomicU64, Ordering},
    time::Duration,
};

use async_trait::async_trait;

use super::{
    Aspect, Cancel, Capabilities, EditRequest, EditSupport, GenerateRequest, GeneratedImage,
    ImageError, ImageErrorKind, ImageProvider, ProviderDescriptor, ProviderState, ProviderStatus,
    Result,
};

/// The longer side of a placeholder, in pixels. A gradient needs no more.
const LONG_SIDE: u32 = 320;

const FAILURES: [(&str, ImageErrorKind); 5] = [
    ("mock:quota", ImageErrorKind::Quota),
    ("mock:not_logged_in", ImageErrorKind::NotLoggedIn),
    ("mock:not_installed", ImageErrorKind::NotInstalled),
    ("mock:timeout", ImageErrorKind::Timeout),
    ("mock:fail", ImageErrorKind::GenerationFailed),
];
const FLAKY: &str = "mock:flaky";
const HANG: &str = "mock:hang";

/// The placeholder provider.
pub struct MockProvider {
    delay: Duration,
    max_parallel: u32,
    /// Images asked for so far: what makes each one different, and its delay.
    made: AtomicU64,
}

impl MockProvider {
    /// A provider whose images take `delay` and a little more.
    pub fn new(delay: Duration) -> Self {
        Self {
            delay,
            max_parallel: 4,
            made: AtomicU64::new(0),
        }
    }

    /// The provider the app offers: slow enough to see the skeletons, fast enough to work with.
    pub fn builtin() -> Self {
        Self::new(Duration::from_millis(1500))
    }

    /// With room for `max_parallel` images at once.
    #[cfg(test)]
    pub fn with_parallel(mut self, max_parallel: u32) -> Self {
        self.max_parallel = max_parallel;
        self
    }

    async fn make(
        &self,
        text: &str,
        (width, height): (u32, u32),
        mut cancel: Cancel,
    ) -> Result<GeneratedImage> {
        let serial = self.made.fetch_add(1, Ordering::Relaxed);
        let quarters = u32::try_from(serial % 4).unwrap_or(0);
        let work = async {
            if text.contains(HANG) {
                std::future::pending::<()>().await;
            }
            tokio::time::sleep(self.delay + self.delay / 4 * quarters).await;
        };
        tokio::select! {
            () = cancel.cancelled() => return Err(ImageError::cancelled()),
            () = work => {}
        }
        let flaky = text.contains(FLAKY) && serial % 3 == 2;
        let asked = FAILURES
            .iter()
            .find(|(word, _)| text.contains(word))
            .copied()
            .or_else(|| flaky.then_some((FLAKY, ImageErrorKind::GenerationFailed)));
        if let Some((word, kind)) = asked {
            return Err(ImageError::new(
                kind,
                format!("the mock provider was asked to fail ({word})"),
            ));
        }
        let mut seed = DefaultHasher::new();
        (text, serial).hash(&mut seed);
        Ok(GeneratedImage {
            bytes: gradient(width, height, seed.finish()),
        })
    }
}

#[async_trait]
impl ImageProvider for MockProvider {
    fn descriptor(&self) -> ProviderDescriptor {
        ProviderDescriptor {
            id: "mock".into(),
            name: "Mock images".into(),
            // Everything a provider can offer, so the UI for each can be worked on.
            capabilities: Capabilities {
                edit: EditSupport::Exact,
                mask: true,
                transparent: false,
                max_parallel: self.max_parallel,
                quality: false,
            },
            key: None,
        }
    }

    async fn probe(&self) -> ProviderStatus {
        ProviderStatus {
            state: ProviderState::Ready,
            version: Some(env!("CARGO_PKG_VERSION").into()),
            account: None,
            detail: None,
        }
    }

    async fn generate(&self, request: &GenerateRequest, cancel: Cancel) -> Result<GeneratedImage> {
        self.make(&request.prompt, size(request.aspect.ratio()), cancel)
            .await
    }

    /// A placeholder in the shape of the source; the source is not read beyond its header.
    async fn edit(&self, request: &EditRequest, cancel: Cancel) -> Result<GeneratedImage> {
        let shape = imagesize::size(&request.source)
            .ok()
            .and_then(|s| Some((u32::try_from(s.width).ok()?, u32::try_from(s.height).ok()?)))
            .filter(|(width, height)| *width > 0 && *height > 0)
            .unwrap_or_else(|| Aspect::Wide.ratio());
        self.make(&request.instruction, size(shape), cancel).await
    }
}

/// The pixel size of a placeholder with the proportions `width : height`.
fn size((width, height): (u32, u32)) -> (u32, u32) {
    let scale = |side: u32, longer: u32| {
        let scaled = u64::from(side) * u64::from(LONG_SIDE) / u64::from(longer);
        u32::try_from(scaled).unwrap_or(LONG_SIDE).max(1)
    };
    if width >= height {
        (LONG_SIDE, scale(height, width))
    } else {
        (scale(width, height), LONG_SIDE)
    }
}

/// A diagonal gradient between two colours taken from `seed`, as a 24-bit BMP: the one image
/// format that takes no encoder to write. The asset store and the webview both read it.
fn gradient(width: u32, height: u32, seed: u64) -> Vec<u8> {
    const HEADERS: u32 = 54;
    let [r1, g1, b1, r2, g2, b2, ..] = seed.to_le_bytes();
    // Rows are padded to a multiple of four bytes.
    let row = (width * 3).next_multiple_of(4);
    let pixels = row * height;
    let mut out = Vec::with_capacity((HEADERS + pixels) as usize);
    // The file header: magic, file size, reserved, where the pixels start.
    out.extend_from_slice(b"BM");
    out.extend_from_slice(&(HEADERS + pixels).to_le_bytes());
    out.extend_from_slice(&[0; 4]);
    out.extend_from_slice(&HEADERS.to_le_bytes());
    // BITMAPINFOHEADER: its size, width, height (positive: rows bottom-up), one plane, 24 bits,
    // no compression, the size of the pixels, then resolution and palette fields left at zero.
    out.extend_from_slice(&40_u32.to_le_bytes());
    out.extend_from_slice(&width.to_le_bytes());
    out.extend_from_slice(&height.to_le_bytes());
    out.extend_from_slice(&1_u16.to_le_bytes());
    out.extend_from_slice(&24_u16.to_le_bytes());
    out.extend_from_slice(&[0; 4]);
    out.extend_from_slice(&pixels.to_le_bytes());
    out.extend_from_slice(&[0; 16]);
    let steps = (width + height).saturating_sub(2).max(1);
    for y in 0..height {
        for x in 0..width {
            let t = (x + y) * 255 / steps;
            let mix = |from: u8, to: u8| {
                let mixed = (u32::from(from) * (255 - t) + u32::from(to) * t) / 255;
                u8::try_from(mixed).unwrap_or(u8::MAX)
            };
            out.extend_from_slice(&[mix(b1, b2), mix(g1, g2), mix(r1, r2)]);
        }
        out.resize(out.len() + (row - width * 3) as usize, 0);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    type TestResult = std::result::Result<(), Box<dyn std::error::Error>>;

    fn request(prompt: &str, aspect: Aspect) -> GenerateRequest {
        GenerateRequest {
            prompt: prompt.into(),
            aspect,
        }
    }

    #[tokio::test(start_paused = true)]
    async fn draws_a_picture_of_the_requested_shape() -> TestResult {
        let mock = MockProvider::new(Duration::from_millis(200));
        let (_job, cancel) = Cancel::new();
        let shapes: [(Aspect, (usize, usize)); 5] = [
            (Aspect::Wide, (320, 180)),
            (Aspect::Landscape, (320, 240)),
            (Aspect::Square, (320, 320)),
            (Aspect::Portrait, (240, 320)),
            (Aspect::Tall, (180, 320)),
        ];
        let mut pictures = Vec::new();
        for (aspect, (width, height)) in shapes {
            let image = mock
                .generate(&request("a red barn", aspect), cancel.clone())
                .await?;
            assert!(infer::is_image(&image.bytes));
            let size = imagesize::blob_size(&image.bytes)?;
            assert_eq!((size.width, size.height), (width, height), "{aspect:?}");
            // The headers, then rows padded to four bytes.
            let row = (width * 3).div_ceil(4) * 4;
            assert_eq!(image.bytes.len(), 54 + row * height);
            pictures.push(image.bytes);
        }
        // The same prompt twice is still two pictures.
        let again = mock
            .generate(&request("a red barn", Aspect::Wide), cancel)
            .await?;
        assert_ne!(again.bytes, pictures[0]);
        Ok(())
    }

    #[tokio::test(start_paused = true)]
    async fn a_word_in_the_prompt_picks_the_failure() -> TestResult {
        let mock = MockProvider::new(Duration::from_millis(200));
        let (job, cancel) = Cancel::new();
        let kind = |prompt: &'static str| {
            let (mock, cancel) = (&mock, cancel.clone());
            async move {
                let made = mock
                    .generate(&request(prompt, Aspect::Square), cancel)
                    .await;
                made.err().map(|e| e.kind)
            }
        };
        for (word, expected) in FAILURES {
            assert_eq!(kind(word).await, Some(expected), "{word}");
        }
        // Images 5, 6 and 7 of this mock; the third of every three fails.
        assert_eq!(
            kind("a barn mock:flaky").await,
            Some(ImageErrorKind::GenerationFailed)
        );
        assert_eq!(kind("a barn mock:flaky").await, None);
        assert_eq!(kind("a barn mock:flaky").await, None);

        let hanging = tokio::spawn({
            let cancel = cancel.clone();
            async move {
                let mock = MockProvider::new(Duration::ZERO);
                mock.generate(&request("mock:hang", Aspect::Square), cancel)
                    .await
            }
        });
        tokio::time::sleep(Duration::from_secs(3600)).await;
        assert!(!hanging.is_finished());
        job.send_replace(true);
        assert_eq!(
            hanging.await?.err().map(|e| e.kind),
            Some(ImageErrorKind::Cancelled)
        );
        Ok(())
    }
}
