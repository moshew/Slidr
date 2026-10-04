//! Runs an operation on an asset of a workspace and stores the result as a new asset. The
//! source stays as it is (IMG-12).

use std::{
    ffi::OsStr,
    fs,
    io::Cursor,
    path::{Path, PathBuf},
    sync::Arc,
    time::Instant,
};

use image::{
    DynamicImage, ImageDecoder, ImageFormat, ImageReader, RgbaImage,
    error::ImageError as CodecError,
};
use tokio::sync::Semaphore;

use super::{
    chroma::{self, KeyOptions},
    matte,
    model::{self, Found, Places},
    types::{MattingStatus, Operation, Processed},
};
use crate::{
    assets,
    image_providers::{ImageError, ImageErrorKind, Result},
    storage::Storage,
};

/// The largest picture an operation takes, in pixels: a phone's 50 megapixels. Beyond it the
/// working memory runs into gigabytes.
const MAX_PIXELS: u64 = 50_000_000;

/// Local image processing. Shared by the IPC commands; testable without Tauri.
pub struct ImageProcessService {
    places: Places,
    /// One matting at a time: a run takes hundreds of megabytes and every core it is given.
    matting: Semaphore,
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
    if reader.format().is_none() {
        return Err(unreadable(CodecError::Unsupported(
            image::error::ImageFormatHint::Unknown.into(),
        )));
    }
    let mut decoder = reader.into_decoder().map_err(unreadable)?;
    let (w, h) = decoder.dimensions();
    check_size(w, h)?;
    // A photo taken with the camera turned says so in its file, and is shown turned; the
    // result has no such note, so its pixels are turned.
    let orientation = decoder.orientation().map_err(unreadable)?;
    let mut picture = DynamicImage::from_decoder(decoder).map_err(unreadable)?;
    picture.apply_orientation(orientation);
    Ok(picture)
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
    let mut png = Vec::new();
    DynamicImage::ImageRgba8(picture)
        .write_to(&mut Cursor::new(&mut png), ImageFormat::Png)
        .map_err(ImageError::internal)?;
    Ok(png)
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
