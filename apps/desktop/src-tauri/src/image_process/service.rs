//! Runs an operation on an asset of a workspace and stores the result as a new asset. The
//! source stays as it is (IMG-12).

use std::{
    collections::HashMap,
    ffi::OsStr,
    fs,
    io::Cursor,
    path::{Path, PathBuf},
    sync::{
        Arc, Mutex, MutexGuard, PoisonError,
        atomic::{AtomicBool, Ordering},
    },
    time::Instant,
};

use image::{
    DynamicImage, GrayImage, ImageDecoder, ImageFormat, ImageReader, RgbImage, RgbaImage,
    codecs::jpeg::JpegEncoder, error::ImageError as CodecError, imageops,
};
use tokio::sync::Semaphore;

use super::{
    chroma::{self, KeyOptions},
    matte,
    model::{self, Found, Place, Places},
    types::{
        MAX_RESULT_PIXELS, MAX_SOURCE_PIXELS, MattingStatus, Operation, Processed, UpscaleProgress,
        UpscaleStatus, Upscaled,
    },
    upscale::{self, UPSCALERS, UpscalerSpec},
};
use crate::{
    assets,
    image_providers::{ImageError, ImageErrorKind, Result},
    storage::Storage,
};

/// The largest picture an operation takes, in pixels: a phone's 50 megapixels. Beyond it the
/// working memory runs into gigabytes.
const MAX_PIXELS: u64 = 50_000_000;

/// Longest job id, in bytes: the image providers' rule for theirs.
const MAX_JOB_ID: usize = 64;
/// How a photograph that is upscaled is stored again: a JPEG that loses nothing an eye finds.
const JPEG_QUALITY: u8 = 92;

/// Local image processing. Shared by the IPC commands; testable without Tauri.
pub struct ImageProcessService {
    places: Places,
    /// One model at a time, matting or upscaling: a run takes hundreds of megabytes and every
    /// core it is given.
    matting: Semaphore,
    /// The upscales that were asked for and have not returned, each with the flag that
    /// cancels it.
    upscales: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

/// An operation with everything it needs settled before the work starts.
enum Work {
    Matte(Found),
    Key(KeyOptions),
}

impl ImageProcessService {
    /// A service that looks for its model in `places`.
    pub fn new(places: Places) -> Self {
        Self {
            places,
            matting: Semaphore::new(1),
            upscales: Mutex::new(HashMap::new()),
        }
    }

    /// Whether background removal can run: the model that is installed and where it was found.
    pub fn status(&self) -> MattingStatus {
        MattingStatus::of(self.places.find().as_ref(), self.places.install_dir())
    }

    /// Runs `operation` on the asset `asset_id` of the workspace and stores the result, a PNG
    /// with transparency of the picture's own size, as a new asset.
    pub async fn process(
        &self,
        storage: &Arc<Storage>,
        workspace_id: &str,
        asset_id: &str,
        operation: Operation,
    ) -> Result<Processed> {
        let began = Instant::now();
        let assets_dir = storage.assets_dir(workspace_id)?;
        let work = match operation {
            Operation::RemoveBackground => Work::Matte(self.places.find().ok_or_else(|| {
                ImageError::new(
                    ImageErrorKind::NotInstalled,
                    format!(
                        "no background-removal model is installed: put {} into {}. A picture \
                         on a flat background can be cut out without one, with chroma_key.",
                        model::MODELS[0].file,
                        self.places.install_dir().display()
                    ),
                )
            })?),
            Operation::ChromaKey {
                color,
                tolerance,
                contiguous,
            } => Work::Key(KeyOptions {
                color: match color {
                    Some(text) => Some(chroma::parse_colour(&text).ok_or_else(|| {
                        ImageError::invalid_input(format!(
                            "color must be written #rrggbb, not {text:?}"
                        ))
                    })?),
                    None => None,
                },
                tolerance,
                contiguous,
            }),
        };
        let _turn = match &work {
            Work::Matte(_) => Some(self.matting.acquire().await.map_err(ImageError::internal)?),
            Work::Key(_) => None,
        };

        let storage = Arc::clone(storage);
        let workspace_id = workspace_id.to_owned();
        let asset_id = asset_id.to_owned();
        tokio::task::spawn_blocking(move || {
            let source = asset_file(&assets_dir, &asset_id)?;
            let bytes = fs::read(&source).map_err(|e| ImageError::io("read the picture", &e))?;
            let picture = decode(&bytes)?;
            drop(bytes);
            let (cut, model, key_color) = match work {
                Work::Matte(found) => (
                    remove_background(picture, &found)?,
                    Some(found.spec.id),
                    None,
                ),
                Work::Key(options) => {
                    let keyed = chroma::chroma_key(&picture.into_rgba8(), &options)
                        .map_err(|error| ImageError::invalid_input(error.0))?;
                    (keyed.image, None, Some(chroma::hex(keyed.color)))
                }
            };
            let png = encode(cut)?;
            // Looked up now, not when the work began: a workspace closed since is not written.
            let dir = storage.assets_dir(&workspace_id)?;
            let asset = assets::import_bytes(&dir, None, &png)?;
            Ok(Processed {
                asset,
                duration_ms: u64::try_from(began.elapsed().as_millis()).unwrap_or(u64::MAX),
                model: model.map(Into::into),
                key_color,
            })
        })
        .await
        .map_err(ImageError::internal)?
    }

    /// The upscaling model that is installed, and where it was found.
    fn upscaler(&self) -> Option<(&'static UpscalerSpec, PathBuf, Place)> {
        let files: Vec<&str> = UPSCALERS.iter().map(|spec| spec.file).collect();
        let (index, path, place) = self.places.find_file(&files)?;
        Some((&UPSCALERS[index], path, place))
    }

    /// Whether a picture can be upscaled: the model that is installed, and how far it goes.
    pub fn upscale_status(&self) -> UpscaleStatus {
        let found = self.upscaler();
        UpscaleStatus::of(
            found
                .as_ref()
                .map(|(spec, path, place)| (*spec, path.as_path(), *place)),
            self.places.install_dir(),
        )
    }

    /// Draws the asset `asset_id` of the workspace again at `factor` times its size, with the
    /// installed model, and stores the result as a new asset: a JPEG when the source is one, a
    /// PNG otherwise, transparency kept. The source stays (IMG-12).
    ///
    /// `job_id` is the caller's, so that [`Self::cancel_upscale`] can name a job whose call has
    /// not returned; `on_progress` hears how many of the picture's tiles are done.
    pub async fn upscale(
        &self,
        storage: &Arc<Storage>,
        job_id: &str,
        workspace_id: &str,
        asset_id: &str,
        factor: u32,
        on_progress: impl Fn(UpscaleProgress) + Send + 'static,
    ) -> Result<Upscaled> {
        let began = Instant::now();
        if !upscale::FACTORS.contains(&factor) {
            return Err(ImageError::invalid_input(format!(
                "a picture can be upscaled {:?} times, not {factor}",
                upscale::FACTORS
            )));
        }
        let assets_dir = storage.assets_dir(workspace_id)?;
        let (spec, file, _) = self.upscaler().ok_or_else(|| {
            ImageError::new(
                ImageErrorKind::NotInstalled,
                format!(
                    "no upscaling model is installed: put {} into {}",
                    UPSCALERS[0].file,
                    self.places.install_dir().display()
                ),
            )
        })?;
        let job = self.register(job_id)?;
        let cancelled = Arc::clone(&job.cancelled);
        let _turn = self.matting.acquire().await.map_err(ImageError::internal)?;
        // Cancelled while it waited for its turn: nothing was started.
        if cancelled.load(Ordering::Relaxed) {
            return Err(ImageError::cancelled());
        }

        let storage = Arc::clone(storage);
        let workspace_id = workspace_id.to_owned();
        let asset_id = asset_id.to_owned();
        tokio::task::spawn_blocking(move || {
            let source = asset_file(&assets_dir, &asset_id)?;
            let bytes = fs::read(&source).map_err(|e| ImageError::io("read the picture", &e))?;
            let (picture, format) = open(&bytes, &|w, h| check_upscale(w, h, factor))?;
            drop(bytes);
            // The model draws colour; what is seen through is scaled beside it.
            let alpha = picture.color().has_alpha().then(|| alpha_of(&picture));
            let picture = picture.into_rgb8();
            let mut report = |done: usize, total: usize| {
                on_progress(UpscaleProgress {
                    done: u32::try_from(done).unwrap_or(u32::MAX),
                    total: u32::try_from(total).unwrap_or(u32::MAX),
                });
            };
            let large = upscale::upscale(&file, spec, &picture, factor, &cancelled, &mut report)?;
            drop(picture);
            let stored = match alpha {
                Some(alpha) => encode(with_alpha(large, &alpha))?,
                None if format == ImageFormat::Jpeg => encode_jpeg(&large)?,
                None => encode_png(DynamicImage::ImageRgb8(large))?,
            };
            // Asked once more, now that the long part is over: a job cancelled in its last
            // tile stores nothing.
            if cancelled.load(Ordering::Relaxed) {
                return Err(ImageError::cancelled());
            }
            let dir = storage.assets_dir(&workspace_id)?;
            let asset = assets::import_bytes(&dir, None, &stored)?;
            Ok(Upscaled {
                asset,
                duration_ms: u64::try_from(began.elapsed().as_millis()).unwrap_or(u64::MAX),
                model: spec.id.into(),
                factor,
            })
        })
        .await
        .map_err(ImageError::internal)?
    }

    /// Cancels an upscale: it stops after the tiles it is working on, stores nothing, and its
    /// call ends as `cancelled`. A job that is over, or was never there, is left alone.
    pub fn cancel_upscale(&self, job_id: &str) {
        if let Some(cancelled) = lock(&self.upscales).get(job_id) {
            cancelled.store(true, Ordering::Relaxed);
        }
    }

    /// Enters an upscale in the list of running ones, under the caller's id.
    fn register(&self, job_id: &str) -> Result<Registered<'_>> {
        let plain = !job_id.is_empty()
            && job_id.len() <= MAX_JOB_ID
            && job_id
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_');
        if !plain {
            return Err(ImageError::invalid_input(format!(
                "invalid job id {job_id:?}: expected letters, digits, '-' and '_'"
            )));
        }
        let mut jobs = lock(&self.upscales);
        if jobs.contains_key(job_id) {
            return Err(ImageError::invalid_input(format!(
                "a job with the id {job_id} is already running"
            )));
        }
        let cancelled = Arc::new(AtomicBool::new(false));
        jobs.insert(job_id.to_owned(), Arc::clone(&cancelled));
        Ok(Registered {
            jobs: &self.upscales,
            id: job_id.to_owned(),
            cancelled,
        })
    }
}

/// An upscale in the list of running ones, for as long as this lives.
struct Registered<'a> {
    jobs: &'a Mutex<HashMap<String, Arc<AtomicBool>>>,
    id: String,
    cancelled: Arc<AtomicBool>,
}

impl Drop for Registered<'_> {
    /// A job whose caller went away stops with it: the work that is left is nobody's.
    fn drop(&mut self) {
        lock(self.jobs).remove(&self.id);
        self.cancelled.store(true, Ordering::Relaxed);
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

/// Refuses a picture that is not upscaled `factor` times here, from its header, saying what is.
fn check_upscale(w: u32, h: u32, factor: u32) -> Result<()> {
    check_size(w, h)?;
    let pixels = u64::from(w) * u64::from(h);
    let megapixels = |pixels: u64| pixels as f64 / 1_000_000.0;
    if pixels > MAX_SOURCE_PIXELS {
        return Err(ImageError::invalid_input(format!(
            "the picture is too large to upscale here: {w} by {h} pixels, and the limit is \
             {:.1} megapixels",
            megapixels(MAX_SOURCE_PIXELS)
        )));
    }
    let result = pixels * u64::from(factor) * u64::from(factor);
    if result > MAX_RESULT_PIXELS {
        return Err(ImageError::invalid_input(format!(
            "the picture is too large to upscale {factor} times: {w} by {h} pixels would \
             become {:.0} megapixels, and the limit is {:.0}; a smaller factor is possible",
            megapixels(result),
            megapixels(MAX_RESULT_PIXELS)
        )));
    }
    Ok(())
}

/// How much of each pixel of a picture is seen.
fn alpha_of(picture: &DynamicImage) -> GrayImage {
    let rgba = picture.to_rgba8();
    GrayImage::from_fn(rgba.width(), rgba.height(), |x, y| {
        image::Luma([rgba.get_pixel(x, y)[3]])
    })
}

/// An upscaled picture with the transparency of its source, scaled to its size. Smoothly: a
/// soft edge stays soft, and the model is not asked to draw a mask.
fn with_alpha(large: RgbImage, alpha: &GrayImage) -> RgbaImage {
    let (w, h) = large.dimensions();
    let alpha = imageops::resize(alpha, w, h, imageops::FilterType::CatmullRom);
    RgbaImage::from_fn(w, h, |x, y| {
        let [r, g, b] = large.get_pixel(x, y).0;
        image::Rgba([r, g, b, alpha.get_pixel(x, y)[0]])
    })
}

/// The picture cut out by the model in `found`.
fn remove_background(picture: DynamicImage, found: &Found) -> Result<RgbaImage> {
    // A picture that has transparency of its own keeps it, on top of what the model clears.
    let own = picture.color().has_alpha().then(|| picture.to_rgba8());
    let picture = picture.into_rgb8();
    let shape = &found.spec.shape;
    let (tensor, small) = matte::input(&picture, shape);
    let output = model::run(&found.path, found.spec, &tensor)?;
    drop(tensor);
    let matte = matte::matte(&output, shape).ok_or_else(|| {
        ImageError::new(
            ImageErrorKind::GenerationFailed,
            format!(
                "the model {} returned {} values, not a matte of {} by {}",
                found.spec.id,
                output.len(),
                shape.side,
                shape.side
            ),
        )
    })?;
    let alpha = matte::alpha(&picture, &small, &matte);
    let mut cut = matte::cutout(&picture, &alpha);
    if let Some(own) = own {
        matte::keep_transparency(&mut cut, &own);
    }
    Ok(cut)
}

/// The picture in `bytes`, turned the way its file says it is to be shown.
fn decode(bytes: &[u8]) -> Result<DynamicImage> {
    open(bytes, &check_size).map(|(picture, _)| picture)
}

/// The picture in `bytes`, turned the way its file says it is to be shown, and the format of
/// the file. `check` sees the picture's size before a pixel is read, and may refuse it.
fn open(
    bytes: &[u8],
    check: &dyn Fn(u32, u32) -> Result<()>,
) -> Result<(DynamicImage, ImageFormat)> {
    let unreadable = |error: CodecError| match error {
        CodecError::Unsupported(_) => ImageError::new(
            ImageErrorKind::Unsupported,
            "this picture's format cannot be processed here; PNG, JPEG and WebP can",
        ),
        other => ImageError::invalid_input(format!("the picture could not be read: {other}")),
    };
    let reader = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|e| ImageError::io("read the picture", &e))?;
    let Some(format) = reader.format() else {
        return Err(unreadable(CodecError::Unsupported(
            image::error::ImageFormatHint::Unknown.into(),
        )));
    };
    let mut decoder = reader.into_decoder().map_err(unreadable)?;
    let (w, h) = decoder.dimensions();
    check(w, h)?;
    // A photo taken with the camera turned says so in its file, and is shown turned; the
    // result has no such note, so its pixels are turned.
    let orientation = assets::shown_orientation(format, &mut decoder);
    let mut picture = DynamicImage::from_decoder(decoder).map_err(unreadable)?;
    picture.apply_orientation(orientation);
    Ok((picture, format))
}

/// Refuses a picture too large to work on, from its header, before any pixel is read.
fn check_size(w: u32, h: u32) -> Result<()> {
    if u64::from(w) * u64::from(h) > MAX_PIXELS {
        return Err(ImageError::invalid_input(format!(
            "the picture is too large to process here: {w} by {h} pixels, and the limit is {} \
             megapixels",
            MAX_PIXELS / 1_000_000
        )));
    }
    Ok(())
}

fn encode(picture: RgbaImage) -> Result<Vec<u8>> {
    encode_png(DynamicImage::ImageRgba8(picture))
}

fn encode_png(picture: DynamicImage) -> Result<Vec<u8>> {
    let mut png = Vec::new();
    picture
        .write_to(&mut Cursor::new(&mut png), ImageFormat::Png)
        .map_err(ImageError::internal)?;
    Ok(png)
}

/// A photograph stays a photograph: as a PNG it would weigh ten times as much.
fn encode_jpeg(picture: &RgbImage) -> Result<Vec<u8>> {
    let mut jpeg = Vec::new();
    JpegEncoder::new_with_quality(&mut jpeg, JPEG_QUALITY)
        .encode_image(picture)
        .map_err(ImageError::internal)?;
    Ok(jpeg)
}

/// The file of asset `id` in a workspace's store: `<id>.<ext>`, a raster image. (The same
/// lookup as the image providers' edit makes.)
fn asset_file(assets_dir: &Path, id: &str) -> Result<PathBuf> {
    // The id is compared with file names; anything but a plain token could not be one.
    let plain = !id.is_empty() && id.len() <= 128 && id.bytes().all(|b| b.is_ascii_alphanumeric());
    if !plain {
        return Err(ImageError::invalid_input(format!(
            "invalid asset id {id:?}"
        )));
    }
    let entries = fs::read_dir(assets_dir).map_err(|e| ImageError::io("read the assets", &e))?;
    let file = entries
        .flatten()
        .map(|entry| entry.path())
        .find(|path| path.file_stem() == Some(OsStr::new(id)) && path.is_file())
        .ok_or_else(|| {
            ImageError::new(
                ImageErrorKind::NotFound,
                format!("asset {id} is not in the workspace"),
            )
        })?;
    let raster = infer::get_from_path(&file)
        .ok()
        .flatten()
        .is_some_and(|found| found.matcher_type() == infer::MatcherType::Image);
    if raster {
        Ok(file)
    } else {
        Err(ImageError::new(
            ImageErrorKind::Unsupported,
            format!("asset {id} is not a raster image; only those can be processed"),
        ))
    }
}

#[cfg(test)]
mod tests {
    use image::{Rgb, RgbImage, Rgba};

    use super::*;
    use crate::image_process::types::Upscaled;
    use crate::{assets::AssetKind, image_process::types::MattingState};

    type TestResult = std::result::Result<(), Box<dyn std::error::Error>>;

    /// A storage with one open workspace and a service whose only place is a temp folder.
    struct Bench {
        root: tempfile::TempDir,
        storage: Arc<Storage>,
        workspace: String,
        assets: PathBuf,
        service: ImageProcessService,
    }

    fn bench(dev: Option<PathBuf>) -> std::result::Result<Bench, Box<dyn std::error::Error>> {
        let root = tempfile::tempdir()?;
        let storage = Arc::new(Storage::new(root.path().to_path_buf()));
        let workspace = storage.new_workspace()?.id;
        let places = Places::new(root.path(), None, dev);
        Ok(Bench {
            assets: storage.assets_dir(&workspace)?,
            service: ImageProcessService::new(places),
            workspace,
            storage,
            root,
        })
    }

    impl Bench {
        fn import(&self, picture: DynamicImage, format: ImageFormat) -> Result<String> {
            let mut bytes = Vec::new();
            picture
                .write_to(&mut Cursor::new(&mut bytes), format)
                .map_err(ImageError::internal)?;
            Ok(assets::import_bytes(&self.assets, None, &bytes)?.id)
        }

        async fn run(&self, asset_id: &str, operation: Operation) -> Result<Processed> {
            self.service
                .process(&self.storage, &self.workspace, asset_id, operation)
                .await
        }

        fn stored(&self, processed: &Processed) -> image::ImageResult<RgbaImage> {
            Ok(image::open(self.assets.join(&processed.asset.file))?.to_rgba8())
        }
    }

    const KEY: Operation = Operation::ChromaKey {
        color: None,
        tolerance: None,
        contiguous: false,
    };

    /// A red square in the middle of a green picture.
    fn square_on_green(w: u32, h: u32) -> RgbImage {
        RgbImage::from_fn(w, h, |x, y| {
            let inside = (w / 4..w * 3 / 4).contains(&x) && (h / 4..h * 3 / 4).contains(&y);
            if inside {
                Rgb([200, 30, 40])
            } else {
                Rgb([0, 255, 0])
            }
        })
    }

    #[tokio::test]
    async fn a_chroma_key_stores_a_new_png_of_the_same_size_and_keeps_the_source() -> TestResult {
        let bench = bench(None)?;
        let picture = DynamicImage::ImageRgb8(square_on_green(120, 80));
        let source = bench.import(picture, ImageFormat::Png)?;
        let before = fs::read(bench.assets.join(format!("{source}.png")))?;

        let processed = bench.run(&source, KEY).await?;
        assert_eq!(processed.key_color.as_deref(), Some("#00ff00"));
        assert_eq!(processed.model, None);
        let asset = &processed.asset;
        assert_ne!(asset.id, source);
        assert_eq!(
            (asset.mime.as_str(), asset.kind),
            ("image/png", AssetKind::Image)
        );
        assert_eq!((asset.width, asset.height), (Some(120.0), Some(80.0)));
        assert_eq!(asset.file, format!("{}.png", asset.id));

        let stored = bench.stored(&processed)?;
        assert_eq!(stored.get_pixel(3, 3), &Rgba([0, 0, 0, 0]));
        assert_eq!(stored.get_pixel(60, 40), &Rgba([200, 30, 40, 255]));
        // The source is where it was, byte for byte (IMG-12).
        assert_eq!(
            fs::read(bench.assets.join(format!("{source}.png")))?,
            before
        );
        assert_eq!(fs::read_dir(&bench.assets)?.count(), 2);

        // The same operation on the same picture is the same asset: nothing piles up.
        let again = bench.run(&source, KEY).await?;
        assert_eq!(again.asset.id, processed.asset.id);
        assert_eq!(fs::read_dir(&bench.assets)?.count(), 2);
        Ok(())
    }

    #[tokio::test]
    async fn a_photo_is_keyed_the_way_it_is_shown_and_a_given_colour_is_read() -> TestResult {
        let bench = bench(None)?;
        // A JPEG: the green is no longer exactly green, and the edge of the square is smeared.
        let picture = DynamicImage::ImageRgb8(square_on_green(160, 120));
        let source = bench.import(picture, ImageFormat::Jpeg)?;
        let given = Operation::ChromaKey {
            color: Some("#00FF00".into()),
            tolerance: None,
            contiguous: true,
        };
        let processed = bench.run(&source, given).await?;
        assert_eq!(processed.key_color.as_deref(), Some("#00ff00"));
        let stored = bench.stored(&processed)?;
        assert_eq!(stored.dimensions(), (160, 120));
        assert_eq!(stored.get_pixel(5, 5)[3], 0);
        assert_eq!(stored.get_pixel(80, 60)[3], 255);
        // What compression smeared across the edge is not left as a green rim: of the
        // pixels that are seen, next to none is green.
        let green = stored
            .pixels()
            .filter(|p| p[3] > 128 && p[1] > 150 && p[0] < 120)
            .count();
        assert!(green < 160 * 120 / 100, "{green} green pixels are left");

        for bad in ["green", "#0f0", ""] {
            let operation = Operation::ChromaKey {
                color: Some(bad.into()),
                tolerance: None,
                contiguous: false,
            };
            let error = bench
                .run(&source, operation)
                .await
                .err()
                .ok_or("accepted")?;
            assert_eq!(error.kind, ImageErrorKind::InvalidInput, "{bad:?}");
        }
        Ok(())
    }

    #[tokio::test]
    async fn a_picture_with_no_flat_background_is_refused_with_what_to_do() -> TestResult {
        let bench = bench(None)?;
        let noisy = RgbImage::from_fn(64, 64, |x, y| Rgb([(x * 4) as u8, (y * 4) as u8, 128]));
        let source = bench.import(DynamicImage::ImageRgb8(noisy), ImageFormat::Png)?;
        let error = bench.run(&source, KEY).await.err().ok_or("accepted")?;
        assert_eq!(error.kind, ImageErrorKind::InvalidInput);
        assert!(
            error.message.contains("remove_background"),
            "{}",
            error.message
        );
        assert_eq!(
            fs::read_dir(&bench.assets)?.count(),
            1,
            "nothing was stored"
        );
        Ok(())
    }

    #[tokio::test]
    async fn without_a_model_background_removal_says_where_to_put_one() -> TestResult {
        let bench = bench(None)?;
        let status = bench.service.status();
        assert_eq!(status.state, MattingState::NotInstalled);
        assert_eq!(status.model, None);
        let install = bench.root.path().join("models");
        assert_eq!(status.install_dir, install.to_string_lossy());

        let picture = DynamicImage::ImageRgb8(square_on_green(64, 64));
        let source = bench.import(picture, ImageFormat::Png)?;
        let error = bench
            .run(&source, Operation::RemoveBackground)
            .await
            .err()
            .ok_or("ran without a model")?;
        assert_eq!(error.kind, ImageErrorKind::NotInstalled);
        assert!(error.message.contains("u2net.onnx"), "{}", error.message);
        assert!(
            error.message.contains(&*install.to_string_lossy()),
            "{}",
            error.message
        );
        // The key needs no model.
        assert!(bench.run(&source, KEY).await.is_ok());

        // A file of the right name that is not a model: found, and then refused by name.
        fs::create_dir_all(&install)?;
        fs::write(install.join("u2netp.onnx"), b"not a model")?;
        let status = bench.service.status();
        assert_eq!(status.state, MattingState::Ready);
        assert_eq!(status.model.map(|m| m.id).as_deref(), Some("u2netp"));
        let error = bench
            .run(&source, Operation::RemoveBackground)
            .await
            .err()
            .ok_or("a text file ran as a model")?;
        assert_eq!(error.kind, ImageErrorKind::NotInstalled);
        assert!(
            error.message.contains("could not be loaded"),
            "{}",
            error.message
        );
        Ok(())
    }

    #[tokio::test]
    async fn what_is_not_a_picture_of_an_open_workspace_is_refused() -> TestResult {
        let bench = bench(None)?;
        let kind = |result: Result<Processed>| result.err().map(|e| e.kind);
        assert_eq!(
            kind(bench.run(&"0".repeat(64), KEY).await),
            Some(ImageErrorKind::NotFound)
        );
        assert_eq!(
            kind(bench.run("../deck", KEY).await),
            Some(ImageErrorKind::InvalidInput)
        );
        let svg = assets::import_bytes(&bench.assets, None, b"<svg width=\"1\" height=\"1\"/>")?;
        assert_eq!(
            kind(bench.run(&svg.id, KEY).await),
            Some(ImageErrorKind::Unsupported)
        );
        // A format the webview shows but this build does not decode.
        let gif = assets::import_bytes(&bench.assets, None, b"GIF89a\x01\0\x01\0\0\0\0;")?;
        assert_eq!(
            kind(bench.run(&gif.id, KEY).await),
            Some(ImageErrorKind::Unsupported)
        );
        // A PNG that is only a header.
        let broken = assets::import_bytes(&bench.assets, None, &assets::tiny_png(10, 10))?;
        assert_eq!(
            kind(bench.run(&broken.id, KEY).await),
            Some(ImageErrorKind::InvalidInput)
        );
        // A phone's largest photo passes; a picture beyond it is refused, with its size.
        assert!(check_size(8_160, 6_120).is_ok());
        let error = check_size(10_000, 6_000).err().ok_or("accepted")?;
        assert_eq!(error.kind, ImageErrorKind::InvalidInput);
        assert!(error.message.contains("10000 by 6000"), "{}", error.message);

        let closed = bench
            .service
            .process(&bench.storage, "no-such-workspace", &broken.id, KEY);
        assert_eq!(kind(closed.await), Some(ImageErrorKind::UnknownWorkspace));
        Ok(())
    }

    #[test]
    fn a_photo_taken_sideways_is_turned_as_it_is_shown() -> TestResult {
        // A JPEG 40 wide and 20 high whose Exif says: turn a quarter clockwise to show.
        let picture = RgbImage::from_pixel(40, 20, Rgb([10, 200, 30]));
        let mut plain = Vec::new();
        DynamicImage::ImageRgb8(picture)
            .write_to(&mut Cursor::new(&mut plain), ImageFormat::Jpeg)?;
        assert_eq!(decode(&plain)?.width(), 40);
        // The Exif block goes right after the start-of-image marker.
        let exif: &[u8] = &[
            0xff, 0xe1, 0x00, 0x22, b'E', b'x', b'i', b'f', 0, 0, b'M', b'M', 0, 42, 0, 0, 0, 8, 0,
            1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0, 0, 0, 0, 0,
        ];
        let mut turned = plain[..2].to_vec();
        turned.extend_from_slice(exif);
        turned.extend_from_slice(&plain[2..]);
        let shown = decode(&turned)?;
        assert_eq!((shown.width(), shown.height()), (20, 40));
        Ok(())
    }

    /// An upscale of an asset of the bench, under a job id of its own, hearing no progress.
    async fn upscaled(bench: &Bench, job: &str, asset: &str, factor: u32) -> Result<Upscaled> {
        bench
            .service
            .upscale(&bench.storage, job, &bench.workspace, asset, factor, |_| ())
            .await
    }

    #[tokio::test]
    async fn without_a_model_upscaling_says_where_to_put_one() -> TestResult {
        let bench = bench(None)?;
        let status = bench.service.upscale_status();
        assert_eq!(status.state, MattingState::NotInstalled);
        assert_eq!(status.model, None);
        assert_eq!(status.factors, Vec::<u32>::new(), "nothing is offered");
        let install = bench.root.path().join("models");
        assert_eq!(status.install_dir, install.to_string_lossy());
        assert_eq!(status.supported.len(), UPSCALERS.len());

        let picture = DynamicImage::ImageRgb8(square_on_green(64, 64));
        let source = bench.import(picture, ImageFormat::Png)?;
        let error = upscaled(&bench, "job-1", &source, 4)
            .await
            .err()
            .ok_or("ran without a model")?;
        assert_eq!(error.kind, ImageErrorKind::NotInstalled);
        assert!(
            error.message.contains("realesr-general-x4v3.onnx"),
            "{}",
            error.message
        );
        assert!(
            error.message.contains(&*install.to_string_lossy()),
            "{}",
            error.message
        );
        assert_eq!(
            fs::read_dir(&bench.assets)?.count(),
            1,
            "nothing was stored"
        );

        // A matting model is not an upscaling model, and the other way round.
        fs::create_dir_all(&install)?;
        fs::write(install.join("u2netp.onnx"), b"not a model")?;
        assert_eq!(
            bench.service.upscale_status().state,
            MattingState::NotInstalled
        );
        fs::remove_file(install.join("u2netp.onnx"))?;
        fs::write(install.join(UPSCALERS[0].file), b"not a model")?;
        assert_eq!(bench.service.status().state, MattingState::NotInstalled);

        // A file of the right name that is not a model: found, offered, and then refused by name.
        let status = bench.service.upscale_status();
        assert_eq!(status.state, MattingState::Ready);
        assert_eq!(status.factors, [2, 4]);
        assert_eq!(
            status.model.map(|m| m.id).as_deref(),
            Some("realesr-general-x4v3")
        );
        let error = upscaled(&bench, "job-2", &source, 2)
            .await
            .err()
            .ok_or("a text file ran as a model")?;
        assert_eq!(error.kind, ImageErrorKind::NotInstalled);
        assert!(
            error.message.contains("could not be loaded"),
            "{}",
            error.message
        );
        // The job is over: its id is free again.
        assert!(lock(&bench.service.upscales).is_empty());
        Ok(())
    }

    #[tokio::test]
    async fn an_upscale_is_refused_for_what_it_cannot_do_before_any_work() -> TestResult {
        let models = tempfile::tempdir()?;
        fs::write(models.path().join(UPSCALERS[0].file), b"not a model")?;
        let bench = bench(Some(models.path().to_path_buf()))?;
        let picture = DynamicImage::ImageRgb8(square_on_green(64, 64));
        let source = bench.import(picture, ImageFormat::Png)?;
        let kind = |result: Result<Upscaled>| result.err().map(|e| e.kind);

        // Three times is not a size the model gives; a job id is letters, digits, '-' and '_'.
        for factor in [0, 1, 3, 8] {
            assert_eq!(
                kind(upscaled(&bench, "job", &source, factor).await),
                Some(ImageErrorKind::InvalidInput),
                "{factor} times"
            );
        }
        for job in ["", "a b", "../x", &"j".repeat(MAX_JOB_ID + 1)] {
            assert_eq!(
                kind(upscaled(&bench, job, &source, 2).await),
                Some(ImageErrorKind::InvalidInput),
                "{job:?}"
            );
        }
        assert_eq!(
            kind(upscaled(&bench, "job", &"0".repeat(64), 2).await),
            Some(ImageErrorKind::NotFound)
        );
        let svg = assets::import_bytes(&bench.assets, None, b"<svg width=\"1\" height=\"1\"/>")?;
        assert_eq!(
            kind(upscaled(&bench, "job", &svg.id, 2).await),
            Some(ImageErrorKind::Unsupported)
        );

        // A picture of full HD goes four times; one of 2048 by 2048 two times only, and says
        // so; a larger one not at all.
        assert!(check_upscale(1920, 1080, 4).is_ok());
        assert!(check_upscale(2048, 2048, 2).is_ok());
        let error = check_upscale(2048, 2048, 4).err().ok_or("accepted")?;
        assert_eq!(error.kind, ImageErrorKind::InvalidInput);
        assert!(
            error.message.contains("2048 by 2048") && error.message.contains("smaller factor"),
            "{}",
            error.message
        );
        let error = check_upscale(3000, 2000, 2).err().ok_or("accepted")?;
        assert!(
            error.message.contains("too large to upscale here"),
            "{}",
            error.message
        );
        // The limits the status gives are the ones that are applied.
        let status = bench.service.upscale_status();
        assert_eq!(
            (status.max_source_pixels, status.max_result_pixels),
            (MAX_SOURCE_PIXELS, MAX_RESULT_PIXELS)
        );
        Ok(())
    }

    #[tokio::test]
    async fn an_upscale_cancelled_while_it_waits_for_its_turn_does_nothing() -> TestResult {
        let models = tempfile::tempdir()?;
        fs::write(models.path().join(UPSCALERS[0].file), b"not a model")?;
        let bench = bench(Some(models.path().to_path_buf()))?;
        let picture = DynamicImage::ImageRgb8(square_on_green(64, 64));
        let source = bench.import(picture, ImageFormat::Png)?;

        // Another model is running: the upscale waits behind it.
        let turn = bench.service.matting.acquire().await?;
        let job = upscaled(&bench, "waits", &source, 2);
        tokio::pin!(job);
        assert!(
            tokio::time::timeout(std::time::Duration::from_millis(50), &mut job)
                .await
                .is_err(),
            "it started without its turn"
        );
        // The same id cannot be used twice while the first is running.
        let twice = upscaled(&bench, "waits", &source, 2).await.err();
        assert_eq!(twice.map(|e| e.kind), Some(ImageErrorKind::InvalidInput));

        bench.service.cancel_upscale("no-such-job");
        bench.service.cancel_upscale("waits");
        drop(turn);
        // Not "the model could not be loaded": the file was never opened.
        let error = job.await.err().ok_or("it ran")?;
        assert_eq!(error.kind, ImageErrorKind::Cancelled);
        assert_eq!(
            fs::read_dir(&bench.assets)?.count(),
            1,
            "nothing was stored"
        );
        assert!(lock(&bench.service.upscales).is_empty());
        Ok(())
    }

    #[test]
    fn transparency_is_scaled_beside_the_colour() {
        // Left half clear, right half solid.
        let alpha = GrayImage::from_fn(8, 4, |x, _| image::Luma([if x < 4 { 0 } else { 255 }]));
        let large = RgbImage::from_pixel(32, 16, Rgb([10, 20, 30]));
        let whole = with_alpha(large, &alpha);
        assert_eq!(whole.dimensions(), (32, 16));
        assert_eq!(whole.get_pixel(2, 8).0, [10, 20, 30, 0]);
        assert_eq!(whole.get_pixel(29, 8).0, [10, 20, 30, 255]);
        // The edge is where it was, four times as far along.
        assert!(whole.get_pixel(13, 8)[3] < 40 && whole.get_pixel(18, 8)[3] > 215);
    }

    /// The real thing, end to end: needs the upscaling model, which is not in the repository.
    #[tokio::test(flavor = "multi_thread")]
    #[ignore = "needs a model file: make one with `node apps/desktop/scripts/fetch-upscale-model.mjs` and set SLIDR_MODELS_DIR to its folder"]
    async fn the_installed_model_draws_a_picture_larger_and_sharper() -> TestResult {
        let bench = bench(Some(models_dir()?))?;
        let status = bench.service.upscale_status();
        assert_eq!(
            status.state,
            MattingState::Ready,
            "no upscaling model in SLIDR_MODELS_DIR"
        );

        // A drawing with edges at every angle, made large and then brought down four times:
        // what the model is given is the small one, and the large one is the truth.
        let (w, h) = (1440_u32, 1040_u32);
        let truth = RgbImage::from_fn(w, h, |x, y| {
            let (fx, fy) = (x as f32, y as f32);
            let disc = ((fx - 400.0).powi(2) + (fy - 380.0).powi(2)).sqrt() < 230.0;
            let bar = (fx * 0.6 + fy * 0.8 - 900.0).abs() < 26.0;
            let frame = (900..1300).contains(&x) && (560..900).contains(&y);
            let lines = x > 820 && y < 400 && (x / 24) % 2 == 0;
            if disc {
                Rgb([230, 96, 40])
            } else if bar {
                Rgb([28, 40, 92])
            } else if frame {
                Rgb([40, 150, 110])
            } else if lines {
                Rgb([20, 20, 20])
            } else {
                Rgb([244, 240, 232])
            }
        });
        let small = imageops::resize(&truth, w / 4, h / 4, imageops::FilterType::Lanczos3);
        let source = bench.import(DynamicImage::ImageRgb8(small.clone()), ImageFormat::Png)?;

        let seen = Arc::new(Mutex::new(Vec::new()));
        let heard = Arc::clone(&seen);
        let made = bench
            .service
            .upscale(
                &bench.storage,
                "four",
                &bench.workspace,
                &source,
                4,
                move |p| {
                    lock(&heard).push((p.done, p.total));
                },
            )
            .await?;
        println!(
            "{}: {} ms for {}x{}, 4x",
            made.model,
            made.duration_ms,
            w / 4,
            h / 4
        );
        assert_eq!(
            (made.model.as_str(), made.factor),
            ("realesr-general-x4v3", 4)
        );
        assert_eq!(
            (
                made.asset.width,
                made.asset.height,
                made.asset.mime.as_str()
            ),
            (Some(f64::from(w)), Some(f64::from(h)), "image/png")
        );
        // The picture is 360 by 260: four tiles, counted from none to all.
        let seen = lock(&seen).clone();
        assert_eq!(seen.first(), Some(&(0, 4)));
        assert_eq!(seen.last(), Some(&(4, 4)));
        assert_eq!(seen.len(), 5);

        // Closer to the truth than resampling is, and sharper: across the edge of the disc
        // the model goes from one colour to the other in fewer pixels.
        let large = image::open(bench.assets.join(&made.asset.file))?.to_rgb8();
        let resampled = imageops::resize(&small, w, h, imageops::FilterType::CatmullRom);
        let error = |picture: &RgbImage| -> f64 {
            let sum: f64 = picture
                .pixels()
                .zip(truth.pixels())
                .flat_map(|(a, b)| (0..3).map(move |c| (f64::from(a[c]) - f64::from(b[c])).powi(2)))
                .sum();
            sum / f64::from(w * h * 3)
        };
        let (model_error, plain_error) = (error(&large), error(&resampled));
        println!("mean squared error: model {model_error:.1}, resampling {plain_error:.1}");
        assert!(
            model_error < plain_error * 0.6,
            "the model ({model_error:.1}) is no nearer the truth than resampling ({plain_error:.1})"
        );
        let ramp = |picture: &RgbImage| {
            // Along the row through the middle of the disc, how many pixels are between colours.
            (100..400)
                .filter(|&x| (60..200).contains(&picture.get_pixel(x, 380)[1].abs_diff(96)))
                .count()
        };
        assert!(
            ramp(&large) < ramp(&resampled),
            "the edge is {} pixels wide, and {} resampled",
            ramp(&large),
            ramp(&resampled)
        );

        // Two times: the same picture at half that, and nearer the truth at that size too.
        let half = upscaled(&bench, "two", &source, 2).await?;
        assert_eq!(
            (half.asset.width, half.asset.height, half.factor),
            (Some(f64::from(w / 2)), Some(f64::from(h / 2)), 2)
        );
        // The source is where it was, and the two results beside it.
        assert_eq!(fs::read_dir(&bench.assets)?.count(), 3);
        Ok(())
    }

    /// A photograph stays a JPEG, a cut-out keeps what is seen through it, and a job that is
    /// cancelled stores nothing.
    #[tokio::test(flavor = "multi_thread")]
    #[ignore = "needs a model file: make one with `node apps/desktop/scripts/fetch-upscale-model.mjs` and set SLIDR_MODELS_DIR to its folder"]
    async fn the_installed_model_keeps_the_format_and_stops_when_told() -> TestResult {
        let bench = bench(Some(models_dir()?))?;
        let photo = DynamicImage::ImageRgb8(square_on_green(160, 120));
        let jpeg = bench.import(photo, ImageFormat::Jpeg)?;
        let made = upscaled(&bench, "jpeg", &jpeg, 2).await?;
        assert_eq!(made.asset.mime, "image/jpeg");
        assert_eq!(
            (made.asset.width, made.asset.height),
            (Some(320.0), Some(240.0))
        );

        // A red square on nothing.
        let cut = RgbaImage::from_fn(96, 96, |x, y| {
            if (24..72).contains(&x) && (24..72).contains(&y) {
                Rgba([200, 30, 40, 255])
            } else {
                Rgba([0, 0, 0, 0])
            }
        });
        let png = bench.import(DynamicImage::ImageRgba8(cut), ImageFormat::Png)?;
        let made = upscaled(&bench, "png", &png, 4).await?;
        assert_eq!(made.asset.mime, "image/png");
        let stored = image::open(bench.assets.join(&made.asset.file))?.to_rgba8();
        assert_eq!(stored.dimensions(), (384, 384));
        assert_eq!(stored.get_pixel(20, 20)[3], 0);
        assert_eq!(stored.get_pixel(192, 192)[3], 255);
        let middle = stored.get_pixel(192, 192);
        assert!(middle[0] > 180 && middle[1] < 60, "{middle:?}");

        // A picture of many tiles, cancelled when the first of them is done.
        let large = RgbImage::from_fn(1100, 900, |x, y| {
            Rgb([(x % 256) as u8, (y % 256) as u8, 90])
        });
        let source = bench.import(DynamicImage::ImageRgb8(large), ImageFormat::Png)?;
        let before = fs::read_dir(&bench.assets)?.count();
        let service = Arc::new(ImageProcessService::new(Places::new(
            bench.root.path(),
            None,
            Some(models_dir()?),
        )));
        let canceller = Arc::clone(&service);
        let began = Instant::now();
        let stopped = service
            .upscale(
                &bench.storage,
                "stops",
                &bench.workspace,
                &source,
                4,
                move |p| {
                    if p.done == 1 {
                        canceller.cancel_upscale("stops");
                    }
                },
            )
            .await;
        println!("cancelled after {} ms", began.elapsed().as_millis());
        assert_eq!(
            stopped.err().map(|e| e.kind),
            Some(ImageErrorKind::Cancelled)
        );
        assert_eq!(
            fs::read_dir(&bench.assets)?.count(),
            before,
            "nothing was stored"
        );
        Ok(())
    }

    /// The folder of model files the tests that need one are pointed at. Read here whatever
    /// the build, so that the timings can be taken in a release build too.
    fn models_dir() -> std::result::Result<PathBuf, Box<dyn std::error::Error>> {
        let dir = std::env::var_os(model::DEV_DIR_VARIABLE).ok_or("SLIDR_MODELS_DIR is not set")?;
        Ok(PathBuf::from(dir))
    }

    /// The real thing, end to end: needs a model file, which is not in the repository.
    #[tokio::test(flavor = "multi_thread")]
    #[ignore = "needs a model file: fetch one with `node apps/desktop/scripts/fetch-matting-model.mjs` and set SLIDR_MODELS_DIR to its folder"]
    async fn the_installed_model_cuts_a_ball_out_of_its_background() -> TestResult {
        let bench = bench(Some(models_dir()?))?;
        let status = bench.service.status();
        assert_eq!(
            status.state,
            MattingState::Ready,
            "no model in SLIDR_MODELS_DIR"
        );

        // An orange ball, lit from the upper left, on a floor under a sky.
        let (w, h) = (1200_u32, 800_u32);
        let picture = RgbImage::from_fn(w, h, |x, y| {
            let (dx, dy) = (x as f32 - 600.0, y as f32 - 420.0);
            let from_centre = (dx * dx + dy * dy).sqrt();
            if from_centre < 230.0 {
                let light = 1.0 - ((dx + 80.0).powi(2) + (dy + 80.0).powi(2)).sqrt() / 420.0;
                let level = |base: f32| (base * (0.45 + 0.55 * light.clamp(0.0, 1.0))) as u8;
                Rgb([level(250.0), level(130.0), level(30.0)])
            } else if y < 520 {
                let t = y as f32 / 520.0;
                Rgb([(120.0 + 70.0 * t) as u8, (170.0 + 50.0 * t) as u8, 235])
            } else {
                let grain = ((x * 7 + y * 13) % 17) as u8;
                Rgb([70 + grain, 95 + grain, 60 + grain / 2])
            }
        });
        let lit = *picture.get_pixel(540, 360);
        let source = bench.import(DynamicImage::ImageRgb8(picture), ImageFormat::Png)?;
        let processed = bench.run(&source, Operation::RemoveBackground).await?;
        println!(
            "{}: {} ms for {w}x{h}",
            processed.model.as_deref().unwrap_or("?"),
            processed.duration_ms
        );
        assert_eq!(processed.model, status.model.map(|m| m.id));
        assert_eq!(
            (processed.asset.width, processed.asset.height),
            (Some(1200.0), Some(800.0))
        );

        let cut = bench.stored(&processed)?;
        // The ball is there, whole and in its own colours; the sky and the floor are gone.
        for (x, y) in [(600, 420), (500, 330), (700, 520), (600, 250), (600, 600)] {
            assert_eq!(cut.get_pixel(x, y)[3], 255, "the ball at {x},{y}");
        }
        assert_eq!(
            cut.get_pixel(540, 360).0[..3],
            lit.0,
            "its colour is the picture's"
        );
        for (x, y) in [
            (40, 40),
            (1150, 60),
            (60, 760),
            (1150, 760),
            (200, 400),
            (1000, 420),
        ] {
            assert_eq!(cut.get_pixel(x, y)[3], 0, "the background at {x},{y}");
        }
        // The outline is where the ball's is, within two pixels, all the way round.
        for step in 0..72 {
            let angle = (step as f32 * 5.0).to_radians();
            let at = |radius: f32| {
                let (x, y) = (600.0 + radius * angle.cos(), 420.0 + radius * angle.sin());
                cut.get_pixel(x.round() as u32, y.round() as u32)[3]
            };
            assert!(
                at(227.0) > 200,
                "inside the outline at {step}: {}",
                at(227.0)
            );
            assert!(
                at(233.0) < 55,
                "outside the outline at {step}: {}",
                at(233.0)
            );
        }
        Ok(())
    }

    /// The measurement behind the model comparison: every picture of a folder cut out with the
    /// installed model, written beside a text file of the timings.
    #[tokio::test(flavor = "multi_thread")]
    #[ignore = "a measurement, not a check: needs SLIDR_MODELS_DIR (a model), SLIDR_MATTE_SAMPLES (a folder of pictures) and SLIDR_MATTE_OUT (a folder for the cut-outs)"]
    async fn cut_out_the_pictures_of_a_folder() -> TestResult {
        let samples = std::env::var("SLIDR_MATTE_SAMPLES")?;
        let out = PathBuf::from(std::env::var("SLIDR_MATTE_OUT")?);
        fs::create_dir_all(&out)?;
        let bench = bench(Some(models_dir()?))?;
        let model = bench
            .service
            .status()
            .model
            .ok_or("no model in SLIDR_MODELS_DIR")?;
        let mut report = String::new();
        let mut files: Vec<PathBuf> = fs::read_dir(samples)?
            .flatten()
            .map(|entry| entry.path())
            .filter(|path| path.is_file())
            .collect();
        files.sort();
        for file in files {
            let stem = file
                .file_stem()
                .and_then(OsStr::to_str)
                .unwrap_or("picture");
            let source = assets::import_file(&bench.assets, &file)?;
            let processed = bench.run(&source.id, Operation::RemoveBackground).await?;
            let line = format!(
                "{}\t{stem}\t{}x{}\t{} ms\t{} bytes\n",
                model.id,
                source.width.unwrap_or(0.0),
                source.height.unwrap_or(0.0),
                processed.duration_ms,
                processed.asset.bytes
            );
            print!("{line}");
            report.push_str(&line);
            fs::copy(
                bench.assets.join(&processed.asset.file),
                out.join(format!("{stem}.{}.png", model.id)),
            )?;
        }
        fs::write(out.join(format!("timings.{}.tsv", model.id)), report)?;
        Ok(())
    }
}
