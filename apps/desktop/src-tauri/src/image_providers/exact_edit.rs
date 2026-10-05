//! What makes an edit `exact` (ADR-025, ADR-051): the picture a service returns is laid back
//! over the source, so the result has the source's size, and every pixel outside the mask is the
//! source's own.
//!
//! An image service accepts only certain sizes and draws the whole picture again, mask or not;
//! a mask only tells it where to change things. So an edit goes in two halves around the call:
//!
//! ```text
//! prepare:  source ──scale to fit──► canvas of an accepted size ──► the service
//!           mask ───same placement─► transparent where it may draw
//! finish:   answer ──cut the source's place, scale back──► blend over the source by the mask
//! ```
//!
//! Without a mask the whole picture may change, and the answer replaces it; the size and the
//! framing are still the source's. Nothing here knows a particular service.

use std::io::Cursor;

use image::{DynamicImage, GrayImage, ImageFormat, ImageReader, Luma, Rgba, RgbaImage, imageops};

use super::{ImageError, Result};
use crate::assets;

/// A picture and its mask as a service receives them, and what it takes to bring the answer
/// back onto the source.
pub struct Prepared {
    /// PNG of the source on a canvas of an accepted size.
    pub picture: Vec<u8>,
    /// PNG of the canvas's size, transparent where the service may draw. `None` when it may
    /// draw everywhere.
    pub mask: Option<Vec<u8>>,
    /// The size of the canvas: what to ask the service for.
    pub canvas: (u32, u32),
    source: RgbaImage,
    /// How much of the answer each pixel of the source takes, 0 (keep) to 255 (replace).
    /// `None`: all of it, everywhere.
    weight: Option<GrayImage>,
    /// Where the source sits in the canvas.
    place: Place,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Place {
    x: u32,
    y: u32,
    w: u32,
    h: u32,
}

/// The picture sizes a service accepts.
#[derive(Debug, Clone, Copy)]
pub enum Sizes {
    /// A closed list, as width and height.
    #[allow(
        dead_code,
        reason = "for a service with fixed sizes; the tests cover it"
    )]
    Fixed(&'static [(u32, u32)]),
    /// Any size whose sides are multiples of `step`, with a pixel count between the two limits
    /// and proportions no more extreme than `max_ratio` to one.
    Free {
        step: u32,
        min_pixels: u32,
        max_pixels: u32,
        max_ratio: f64,
    },
}

impl Sizes {
    /// The accepted size that suits a picture of `w` by `h` best.
    fn canvas(self, w: u32, h: u32) -> Option<(u32, u32)> {
        match self {
            Self::Fixed(sizes) => closest(sizes, w, h),
            Self::Free {
                step,
                min_pixels,
                max_pixels,
                max_ratio,
            } => Some(free(w, h, step, min_pixels, max_pixels, max_ratio)),
        }
    }
}

/// Lays `source` out for a service that accepts `sizes`. `mask` is an image whose transparent
/// area is where the edit may happen; it is stretched to the source's size.
pub fn prepare(source: &[u8], mask: Option<&[u8]>, sizes: Sizes) -> Result<Prepared> {
    let source = decode(source, "image")?.to_rgba8();
    let (sw, sh) = source.dimensions();
    let canvas = sizes
        .canvas(sw, sh)
        .ok_or_else(|| ImageError::internal("the image service accepts no size"))?;
    let place = fit(sw, sh, canvas);

    let weight = match mask {
        Some(bytes) => {
            let mask = decode(bytes, "mask")?.to_rgba8();
            let mask = if mask.dimensions() == (sw, sh) {
                mask
            } else {
                imageops::resize(&mask, sw, sh, imageops::FilterType::Triangle)
            };
            let weight = GrayImage::from_fn(sw, sh, |x, y| Luma([255 - mask.get_pixel(x, y)[3]]));
            if weight.pixels().all(|p| p[0] == 0) {
                return Err(ImageError::invalid_input(
                    "the mask has no transparent area: make the area to edit transparent",
                ));
            }
            Some(weight)
        }
        None => None,
    };

    // The source in its place, on a canvas filled with its average colour. A source that is
    // already of an accepted size goes as it is.
    let scaled = if (place.w, place.h) == (sw, sh) {
        source.clone()
    } else {
        imageops::resize(&source, place.w, place.h, imageops::FilterType::CatmullRom)
    };
    let mut picture = RgbaImage::from_pixel(canvas.0, canvas.1, average(&source));
    imageops::replace(
        &mut picture,
        &scaled,
        i64::from(place.x),
        i64::from(place.y),
    );

    let padded = place.w != canvas.0 || place.h != canvas.1;
    let sent_mask = if weight.is_some() || padded {
        // Opaque (keep) everywhere, transparent where the service may draw.
        let mut sent = RgbaImage::from_pixel(canvas.0, canvas.1, Rgba([0, 0, 0, 255]));
        let editable = match &weight {
            Some(weight) => {
                imageops::resize(weight, place.w, place.h, imageops::FilterType::Triangle)
            }
            None => GrayImage::from_pixel(place.w, place.h, Luma([255])),
        };
        for (x, y, pixel) in editable.enumerate_pixels() {
            let alpha = if pixel[0] >= 128 { 0 } else { 255 };
            sent.put_pixel(place.x + x, place.y + y, Rgba([0, 0, 0, alpha]));
        }
        Some(png(&DynamicImage::ImageRgba8(sent))?)
    } else {
        None
    };

    Ok(Prepared {
        picture: png(&DynamicImage::ImageRgba8(picture))?,
        mask: sent_mask,
        canvas,
        weight: weight.map(|weight| soften(&weight)),
        source,
        place,
    })
}

impl Prepared {
    /// The edited picture: the service's `answer` cut to the source's place, scaled back to the
    /// source's size, and blended over the source by the mask. Returns a PNG.
    pub fn finish(&self, answer: &[u8]) -> Result<Vec<u8>> {
        let answer = image::load_from_memory(answer)
            .map_err(|_| {
                ImageError::new(
                    super::ImageErrorKind::GenerationFailed,
                    "the image service returned a file that is not an image",
                )
            })?
            .to_rgba8();
        // A service that answers in another size than asked still covers the same canvas.
        let answer = if answer.dimensions() == self.canvas {
            answer
        } else {
            let (w, h) = self.canvas;
            imageops::resize(&answer, w, h, imageops::FilterType::CatmullRom)
        };
        let Place { x, y, w, h } = self.place;
        let cut = imageops::crop_imm(&answer, x, y, w, h).to_image();
        let (sw, sh) = self.source.dimensions();
        let drawn = if (w, h) == (sw, sh) {
            cut
        } else {
            imageops::resize(&cut, sw, sh, imageops::FilterType::CatmullRom)
        };
        let out = match &self.weight {
            None => drawn,
            Some(weight) => RgbaImage::from_fn(sw, sh, |x, y| {
                let take = u32::from(weight.get_pixel(x, y)[0]);
                let kept = self.source.get_pixel(x, y);
                let new = drawn.get_pixel(x, y);
                let mix = |old: u8, new: u8| {
                    let mixed = (u32::from(old) * (255 - take) + u32::from(new) * take + 127) / 255;
                    u8::try_from(mixed).unwrap_or(u8::MAX)
                };
                // Where the mask keeps, the source's pixel exactly, its transparency included.
                Rgba([
                    mix(kept[0], new[0]),
                    mix(kept[1], new[1]),
                    mix(kept[2], new[2]),
                    mix(kept[3], new[3]),
                ])
            }),
        };
        png(&DynamicImage::ImageRgba8(out))
    }
}

/// The picture in `bytes`, turned the way its file says it is to be shown: a photo taken with
/// the camera turned is shown turned, and its mask is painted over it so.
fn decode(bytes: &[u8], what: &str) -> Result<DynamicImage> {
    let refuse = || {
        ImageError::invalid_input(format!(
            "the {what} is in a format this provider cannot edit; use PNG, JPEG or WebP"
        ))
    };
    let reader = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|_| refuse())?;
    let format = reader.format().ok_or_else(refuse)?;
    let mut decoder = reader.into_decoder().map_err(|_| refuse())?;
    let orientation = assets::shown_orientation(format, &mut decoder);
    let mut picture = DynamicImage::from_decoder(decoder).map_err(|_| refuse())?;
    picture.apply_orientation(orientation);
    Ok(picture)
}

fn png(image: &DynamicImage) -> Result<Vec<u8>> {
    let mut out = Vec::new();
    image
        .write_to(&mut Cursor::new(&mut out), ImageFormat::Png)
        .map_err(ImageError::internal)?;
    Ok(out)
}

/// The accepted size whose proportions are nearest to `w : h`.
fn closest(sizes: &[(u32, u32)], w: u32, h: u32) -> Option<(u32, u32)> {
    let wanted = (f64::from(w.max(1)) / f64::from(h.max(1))).ln();
    sizes.iter().copied().min_by(|a, b| {
        let distance =
            |size: &(u32, u32)| ((f64::from(size.0) / f64::from(size.1)).ln() - wanted).abs();
        distance(a).total_cmp(&distance(b))
    })
}

/// The size nearest to `w` by `h` among those with sides that are multiples of `step`, a pixel
/// count within the limits, and proportions within `max_ratio` to one.
fn free(w: u32, h: u32, step: u32, min_pixels: u32, max_pixels: u32, max_ratio: f64) -> (u32, u32) {
    let step = step.max(1);
    let (mut cw, mut ch) = (f64::from(w.max(1)), f64::from(h.max(1)));
    // A picture more extreme than the service allows gets a canvas at the limit, and bars.
    if cw / ch > max_ratio {
        ch = cw / max_ratio;
    } else if ch / cw > max_ratio {
        cw = ch / max_ratio;
    }
    let pixels = cw * ch;
    let scale = if pixels < f64::from(min_pixels) {
        (f64::from(min_pixels) / pixels).sqrt()
    } else if pixels > f64::from(max_pixels) {
        (f64::from(max_pixels) / pixels).sqrt()
    } else {
        1.0
    };
    let side = |length: f64| {
        let steps = length * scale / f64::from(step);
        // Away from the limit that was crossed; to the nearest otherwise.
        let steps = if scale > 1.0 {
            steps.ceil()
        } else if scale < 1.0 {
            steps.floor()
        } else {
            steps.round()
        };
        #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
        let steps = steps.max(1.0) as u32;
        steps * step
    };
    let (mut cw, mut ch) = (side(cw), side(ch));
    // Rounding may have left the size a step short of a limit.
    while u64::from(cw) * u64::from(ch) < u64::from(min_pixels) {
        if cw <= ch {
            cw += step;
        } else {
            ch += step;
        }
    }
    while f64::from(cw) > f64::from(ch) * max_ratio {
        ch += step;
    }
    while f64::from(ch) > f64::from(cw) * max_ratio {
        cw += step;
    }
    (cw, ch)
}

/// Where a picture of `w` by `h` goes in `canvas`: over all of it when the proportions are as
/// good as equal (a stretch of under two percent, undone on the way back), and otherwise the
/// largest box of the picture's proportions, centred, with bars around it.
fn fit(w: u32, h: u32, canvas: (u32, u32)) -> Place {
    let proportions = |w: u32, h: u32| (f64::from(w.max(1)) / f64::from(h.max(1))).ln();
    if (proportions(w, h) - proportions(canvas.0, canvas.1)).abs() < 0.02 {
        return Place {
            x: 0,
            y: 0,
            w: canvas.0,
            h: canvas.1,
        };
    }
    let scale = f64::min(
        f64::from(canvas.0) / f64::from(w.max(1)),
        f64::from(canvas.1) / f64::from(h.max(1)),
    );
    let side = |source: u32, limit: u32| {
        // Rounded, at least one pixel, never past the canvas.
        let scaled = (f64::from(source) * scale)
            .round()
            .clamp(1.0, f64::from(limit));
        #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
        let scaled = scaled as u32;
        scaled
    };
    let (w, h) = (side(w, canvas.0), side(h, canvas.1));
    Place {
        x: (canvas.0 - w) / 2,
        y: (canvas.1 - h) / 2,
        w,
        h,
    }
}

/// The average colour of a picture, opaque: what fills the canvas around it.
fn average(image: &RgbaImage) -> Rgba<u8> {
    let small = imageops::thumbnail(image, 8, 8);
    let count = u64::from(small.width()) * u64::from(small.height());
    let mut sum = [0_u64; 3];
    for pixel in small.pixels() {
        for (total, channel) in sum.iter_mut().zip(pixel.0) {
            *total += u64::from(channel);
        }
    }
    let mean = |total: u64| u8::try_from(total / count.max(1)).unwrap_or(u8::MAX);
    Rgba([mean(sum[0]), mean(sum[1]), mean(sum[2]), 255])
}

/// Lets the edit fade in over a few pixels just inside the mask's edge, so the seam between
/// what the service drew and what was kept does not show. Outside the mask nothing changes:
/// a weight of zero stays zero.
fn soften(weight: &GrayImage) -> GrayImage {
    let shorter = weight.width().min(weight.height());
    #[allow(clippy::cast_precision_loss)]
    let sigma = (shorter as f32 / 300.0).clamp(1.0, 6.0);
    let blurred = imageops::blur(weight, sigma);
    GrayImage::from_fn(weight.width(), weight.height(), |x, y| {
        let hard = weight.get_pixel(x, y)[0];
        // A blurred edge is half way at the edge itself; the ramp runs from there inwards.
        let ramp = (i32::from(blurred.get_pixel(x, y)[0]) * 2 - 255).clamp(0, 255);
        Luma([hard.min(u8::try_from(ramp).unwrap_or(u8::MAX))])
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    type TestResult = std::result::Result<(), Box<dyn std::error::Error>>;

    const SIZES: Sizes = Sizes::Fixed(&[(1024, 1024), (1536, 1024), (1024, 1536)]);
    /// Multiples of 16, between 655,360 pixels and 2560x1440, up to three to one.
    const FREE: Sizes = Sizes::Free {
        step: 16,
        min_pixels: 655_360,
        max_pixels: 3_686_400,
        max_ratio: 3.0,
    };

    /// A picture with a different colour in every pixel, so a moved pixel shows.
    fn source(w: u32, h: u32) -> RgbaImage {
        RgbaImage::from_fn(w, h, |x, y| {
            let channel = |v: u32| u8::try_from(v % 251).unwrap_or(0);
            Rgba([channel(x * 3), channel(y * 5), channel(x + y), 255])
        })
    }

    fn encoded(image: RgbaImage) -> TestResultOf<Vec<u8>> {
        Ok(png(&DynamicImage::ImageRgba8(image))?)
    }

    type TestResultOf<T> = std::result::Result<T, Box<dyn std::error::Error>>;

    /// A mask of the picture's size: transparent (editable) inside the box, opaque outside.
    fn mask(w: u32, h: u32, hole: (u32, u32, u32, u32)) -> RgbaImage {
        RgbaImage::from_fn(w, h, |x, y| {
            let inside = x >= hole.0 && x < hole.0 + hole.2 && y >= hole.1 && y < hole.1 + hole.3;
            Rgba([0, 0, 0, if inside { 0 } else { 255 }])
        })
    }

    /// What a service answers with: one flat colour over the whole canvas.
    fn answer(canvas: (u32, u32), colour: [u8; 4]) -> TestResultOf<Vec<u8>> {
        encoded(RgbaImage::from_pixel(canvas.0, canvas.1, Rgba(colour)))
    }

    #[test]
    fn a_photo_taken_sideways_is_edited_as_it_is_shown() -> TestResult {
        // A JPEG 40 wide and 20 high whose Exif says: turn a quarter clockwise to show. It is
        // shown 20 wide and 40 high, and its mask is painted over it so (ADR-057, finding 13).
        let mut plain = Vec::new();
        DynamicImage::ImageRgba8(source(40, 20))
            .to_rgb8()
            .write_to(&mut Cursor::new(&mut plain), ImageFormat::Jpeg)?;
        let exif: &[u8] = &[
            0xff, 0xe1, 0x00, 0x22, b'E', b'x', b'i', b'f', 0, 0, b'M', b'M', 0, 42, 0, 0, 0, 8, 0,
            1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0, 0, 0, 0, 0,
        ];
        let mut turned = plain[..2].to_vec();
        turned.extend_from_slice(exif);
        turned.extend_from_slice(&plain[2..]);
        // A mask of the picture as shown: the top half may change.
        let prepared = prepare(
            &turned,
            Some(&encoded(mask(20, 40, (0, 0, 20, 20)))?),
            SIZES,
        )?;
        // Upright: the canvas and the place are of a tall picture.
        assert_eq!(prepared.canvas, (1024, 1536));
        let Place { w, h, .. } = prepared.place;
        assert!(h > w, "placed {w}x{h}");
        Ok(())
    }

    #[test]
    fn the_canvas_is_the_accepted_size_nearest_to_the_source() -> TestResult {
        for ((w, h), canvas, place) in [
            ((1672, 941), (1536, 1024), (0, 80, 1536, 864)),
            ((800, 800), (1024, 1024), (0, 0, 1024, 1024)),
            ((600, 1200), (1024, 1536), (128, 0, 768, 1536)),
            ((300, 200), (1536, 1024), (0, 0, 1536, 1024)),
            // Proportions within two percent of the canvas's fill it, with no bars.
            ((1530, 1024), (1536, 1024), (0, 0, 1536, 1024)),
        ] {
            let prepared = prepare(&encoded(source(w, h))?, None, SIZES)?;
            assert_eq!(prepared.canvas, canvas, "{w}x{h}");
            let Place { x, y, w: pw, h: ph } = prepared.place;
            assert_eq!((x, y, pw, ph), place, "{w}x{h}");
            let sent = image::load_from_memory(&prepared.picture)?;
            assert_eq!((sent.width(), sent.height()), canvas);
            // A mask is sent exactly when part of the canvas is not the picture.
            assert_eq!(prepared.mask.is_some(), (pw, ph) != canvas, "{w}x{h}");
        }
        Ok(())
    }

    #[test]
    fn a_free_canvas_follows_the_source_within_the_limits_of_the_service() -> TestResult {
        for ((w, h), canvas, place) in [
            // Rounded to multiples of 16; the picture fills the canvas.
            ((1672, 941), (1680, 944), (0, 0, 1680, 944)),
            // Already an accepted size: sent as it is.
            ((1792, 1008), (1792, 1008), (0, 0, 1792, 1008)),
            // Too few pixels: scaled up past the lower limit.
            ((300, 200), (992, 672), (0, 0, 992, 672)),
            // Too many: scaled down under the upper limit.
            ((6000, 4000), (2336, 1552), (0, 0, 2336, 1552)),
            // More extreme than three to one: a canvas at the limit, and bars.
            ((4000, 500), (3312, 1104), (0, 345, 3312, 414)),
        ] {
            let prepared = prepare(&encoded(source(w, h))?, None, FREE)?;
            assert_eq!(prepared.canvas, canvas, "{w}x{h}");
            let Place { x, y, w: pw, h: ph } = prepared.place;
            assert_eq!((x, y, pw, ph), place, "{w}x{h}");
            let (cw, ch) = canvas;
            assert!(cw % 16 == 0 && ch % 16 == 0, "{w}x{h}");
            assert!((655_360..=3_686_400).contains(&(cw * ch)), "{w}x{h}");
            assert_eq!(prepared.mask.is_some(), (pw, ph) != canvas, "{w}x{h}");
        }
        // A source of an accepted size is not resampled on the way out.
        let original = source(1792, 1008);
        let prepared = prepare(&encoded(original.clone())?, None, FREE)?;
        assert_eq!(
            image::load_from_memory(&prepared.picture)?.to_rgba8(),
            original
        );
        Ok(())
    }

    #[test]
    fn the_mask_sent_is_transparent_only_where_the_edit_may_happen() -> TestResult {
        let (w, h) = (1536, 864);
        let hole = (400, 200, 300, 300);
        let prepared = prepare(
            &encoded(source(w, h))?,
            Some(&encoded(mask(w, h, hole))?),
            SIZES,
        )?;
        let sent = image::load_from_memory(prepared.mask.as_deref().ok_or("no mask")?)?.to_rgba8();
        assert_eq!(sent.dimensions(), (1536, 1024));
        let alpha = |x: u32, y: u32| sent.get_pixel(x, y)[3];
        // The source sits 80 pixels down the canvas.
        assert_eq!(alpha(500, 80 + 300), 0, "inside the hole");
        assert_eq!(alpha(100, 80 + 100), 255, "outside the hole");
        assert_eq!(alpha(500, 10), 255, "the padding above the picture");
        assert_eq!(alpha(500, 1000), 255, "the padding below the picture");
        Ok(())
    }

    #[test]
    fn outside_the_mask_every_pixel_is_the_sources_own() -> TestResult {
        let (w, h) = (1672, 941);
        let original = source(w, h);
        let hole = (600, 300, 400, 300);
        let prepared = prepare(
            &encoded(original.clone())?,
            Some(&encoded(mask(w, h, hole))?),
            SIZES,
        )?;
        let edited = prepared.finish(&answer(prepared.canvas, [255, 0, 255, 255])?)?;
        let edited = image::load_from_memory(&edited)?.to_rgba8();
        assert_eq!(edited.dimensions(), (w, h), "the source's size");

        let inside = |x: u32, y: u32| {
            x >= hole.0 && x < hole.0 + hole.2 && y >= hole.1 && y < hole.1 + hole.3
        };
        let changed_outside = original
            .enumerate_pixels()
            .filter(|(x, y, pixel)| !inside(*x, *y) && edited.get_pixel(*x, *y) != *pixel)
            .count();
        assert_eq!(changed_outside, 0);
        // Well inside the hole the answer has taken over; at its edge it fades in.
        assert_eq!(edited.get_pixel(800, 450), &Rgba([255, 0, 255, 255]));
        let at_edge = edited.get_pixel(hole.0, 450);
        assert_ne!(at_edge, &Rgba([255, 0, 255, 255]));
        Ok(())
    }

    #[test]
    fn without_a_mask_the_answer_replaces_the_picture_at_the_sources_size() -> TestResult {
        let (w, h) = (1672, 941);
        let prepared = prepare(&encoded(source(w, h))?, None, SIZES)?;
        // The service drew over the whole canvas, padding included.
        let edited = prepared.finish(&answer(prepared.canvas, [10, 200, 30, 255])?)?;
        let edited = image::load_from_memory(&edited)?.to_rgba8();
        assert_eq!(edited.dimensions(), (w, h));
        assert!(edited.pixels().all(|p| p == &Rgba([10, 200, 30, 255])));
        // An answer in another size than asked is taken as the same canvas.
        let small = prepared.finish(&answer((768, 512), [1, 2, 3, 255])?)?;
        assert_eq!(
            image::load_from_memory(&small)?.to_rgba8().dimensions(),
            (w, h)
        );
        Ok(())
    }

    #[test]
    fn a_mask_of_another_size_is_stretched_and_one_without_a_hole_is_rejected() -> TestResult {
        let (w, h) = (1024, 1024);
        // Half the size: the hole covers the same quarter of the picture.
        let half = mask(512, 512, (0, 0, 256, 256));
        let prepared = prepare(&encoded(source(w, h))?, Some(&encoded(half)?), SIZES)?;
        let edited = prepared.finish(&answer(prepared.canvas, [0, 0, 0, 255])?)?;
        let edited = image::load_from_memory(&edited)?.to_rgba8();
        assert_eq!(edited.get_pixel(100, 100), &Rgba([0, 0, 0, 255]));
        assert_eq!(edited.get_pixel(900, 900), source(w, h).get_pixel(900, 900));

        let opaque = RgbaImage::from_pixel(w, h, Rgba([0, 0, 0, 255]));
        let rejected = prepare(&encoded(source(w, h))?, Some(&encoded(opaque)?), SIZES);
        assert_eq!(
            rejected.err().map(|e| e.kind),
            Some(super::super::ImageErrorKind::InvalidInput)
        );
        let garbage = prepare(b"not an image", None, SIZES);
        assert_eq!(
            garbage.err().map(|e| e.kind),
            Some(super::super::ImageErrorKind::InvalidInput)
        );
        Ok(())
    }
}
