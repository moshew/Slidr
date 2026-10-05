//! Upscaling (SPEC AIO-04): a picture drawn again at two or four times its size by a
//! super-resolution network, which adds the detail that resampling cannot.
//!
//! Like background removal it runs here, in Rust, with `tract`, on a model file somebody put in
//! a models folder on purpose and that the app knows by its name ([`UPSCALERS`]); see [`model`]
//! for the folders. The file is not in the repository and the app never fetches it.
//!
//! ```text
//! picture ──tiles, each with a margin of its neighbours──► the network, a tile per thread
//!                                                               │  four times the size
//! result ◄──the margins dropped, the tiles laid side by side────┘  (halved, for two times)
//! ```
//!
//! The network is convolutions all the way, so a pixel of the result depends only on the
//! pixels near it in the picture: [`OVERLAP`] of them on every side. A tile that carries that
//! much of its neighbours gives, inside the margin, what the whole picture would have given in
//! one piece, so a large picture costs the memory of a tile, and its tiles run side by side.
//! A tile is also where progress is counted and where a cancelled job stops.

use std::{
    path::Path,
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        mpsc,
    },
    thread,
};

use image::RgbImage;
use tract_onnx::prelude::*;

use super::model;
use crate::image_providers::{ImageError, ImageErrorKind, Result};

/// A super-resolution model the app knows how to run.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct UpscalerSpec {
    /// Stable id: what a result names as its model.
    pub id: &'static str,
    /// Display name.
    pub name: &'static str,
    /// The file's name in a models folder.
    pub file: &'static str,
    /// The licence its authors published the network's code under (SPDX id). The weights were
    /// released with it and say nothing more; the round's ADR has what their training data says.
    pub license: &'static str,
    /// The size of the file.
    pub bytes: u64,
    /// How many times the size the network gives.
    pub scale: u32,
}

/// The models, the default first.
///
/// One for now: the compact general model of Real-ESRGAN (`SRVGGNetCompact`: 34 convolutions
/// 64 channels wide and a pixel shuffle), written as ONNX from the authors' checkpoint by
/// `apps/desktop/scripts/fetch-upscale-model.mjs`. It takes a picture as RGB in 0..1, one
/// picture of any size, and returns it four times the size.
pub const UPSCALERS: [UpscalerSpec; 1] = [UpscalerSpec {
    id: "realesr-general-x4v3",
    name: "Real-ESRGAN (general, compact)",
    file: "realesr-general-x4v3.onnx",
    license: "BSD-3-Clause",
    bytes: 4_862_660,
    scale: 4,
}];

/// The sizes a picture can be asked for: two times is the network's four, halved, the way the
/// network's own authors give the sizes below four.
pub const FACTORS: [u32; 2] = [2, 4];

/// The side of a tile, in pixels of the picture.
const TILE: usize = 256;
/// How much of its neighbours a tile carries on each side. The network's last pixel looks 34
/// pixels away, through 34 convolutions; what lies beyond 32 no longer changes a level of the
/// result (measured: a tiled picture and the same picture in one piece differ by 1 of 255 at
/// most, and by 10 with a margin of 16).
const OVERLAP: usize = 32;

/// A tile's share of one axis, in pixels of the picture.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Span {
    /// Where the tile starts.
    start: usize,
    /// The part of the tile that goes into the result, `from..to` in the tile's own pixels.
    from: usize,
    to: usize,
}

/// The tiles along an axis `length` long, each `tile` long (`tile` is the whole axis when the
/// picture is shorter than a tile). What they keep covers the axis once, with no gap, and
/// every kept pixel is [`OVERLAP`] or more from an edge of its tile that is not also an edge of
/// the picture. The last tile is moved back to end where the picture ends, so that all are full.
fn spans(length: usize, tile: usize) -> Vec<Span> {
    if length <= tile {
        return vec![Span {
            start: 0,
            from: 0,
            to: length,
        }];
    }
    let step = tile - 2 * OVERLAP;
    let mut spans: Vec<Span> = Vec::new();
    let mut start = 0;
    loop {
        let last = start + tile >= length;
        let start_here = if last { length - tile } else { start };
        // From where the tile before stopped: at the margin, or further in for the tile that
        // was moved back.
        let covered = spans.last().map_or(0, |before| before.start + before.to);
        spans.push(Span {
            start: start_here,
            from: covered - start_here,
            to: if last { tile } else { tile - OVERLAP },
        });
        if last {
            return spans;
        }
        start += step;
    }
}

/// One tile of the picture: where it is, and what of it is kept.
#[derive(Debug, Clone, Copy)]
struct Tile {
    x: Span,
    y: Span,
}

/// The kept part of a tile of the result, as RGB bytes, row after row.
struct Piece {
    tile: Tile,
    rgb: Vec<u8>,
}

/// The tile of `picture` at (`x`, `y`), `w` by `h`, as the network reads it: RGB in 0..1,
/// channel after channel.
fn tensor_of(picture: &RgbImage, x: usize, y: usize, w: usize, h: usize) -> Vec<f32> {
    let width = picture.width() as usize;
    let source = picture.as_raw();
    let mut tensor = vec![0.0_f32; 3 * w * h];
    for row in 0..h {
        let line = &source[((y + row) * width + x) * 3..][..w * 3];
        for (column, pixel) in line.as_chunks::<3>().0.iter().enumerate() {
            for (channel, value) in pixel.iter().enumerate() {
                tensor[channel * w * h + row * w + column] = f32::from(*value) / 255.0;
            }
        }
    }
    tensor
}

/// The kept part of a tile, from the network's output for it (`values`: three channels, each
/// `side_w` by `side_h`), brought down to `factor` times the tile by averaging every block of
/// `reduce` by `reduce` values: the network gives `factor * reduce` times the size.
fn piece_of(
    values: &[f32],
    (side_w, side_h): (usize, usize),
    tile: Tile,
    factor: usize,
    reduce: usize,
) -> Vec<u8> {
    let plane = side_w * side_h;
    let (x0, x1) = (tile.x.from * factor, tile.x.to * factor);
    let (y0, y1) = (tile.y.from * factor, tile.y.to * factor);
    let area = (reduce * reduce) as f32;
    let mut rgb = Vec::with_capacity((x1 - x0) * (y1 - y0) * 3);
    for y in y0..y1 {
        for x in x0..x1 {
            for channel in 0..3 {
                let mut sum = 0.0;
                for dy in 0..reduce {
                    let row = channel * plane + (y * reduce + dy) * side_w + x * reduce;
                    sum += values[row..row + reduce].iter().sum::<f32>();
                }
                // Rounded to the nearest level; `as` saturates what little is out of range.
                rgb.push(((sum / area).clamp(0.0, 1.0) * 255.0 + 0.5) as u8);
            }
        }
    }
    rgb
}

/// `picture`, `factor` times its size, drawn by the model in `file`.
///
/// Blocking, for seconds to a minute; it uses [`model::threads`] threads, a tile on each.
/// `progress` is called on the calling thread with the tiles done and the tiles there are,
/// first with none done. When `cancelled` turns true no further tile is started, and the call
/// ends as `cancelled` once the tiles in work have ended.
pub fn upscale(
    file: &Path,
    spec: &UpscalerSpec,
    picture: &RgbImage,
    factor: u32,
    cancelled: &AtomicBool,
    progress: &mut dyn FnMut(usize, usize),
) -> Result<RgbImage> {
    if !FACTORS.contains(&factor) || !spec.scale.is_multiple_of(factor) {
        return Err(ImageError::invalid_input(format!(
            "a picture can be upscaled {FACTORS:?} times, not {factor}"
        )));
    }
    let (width, height) = (picture.width() as usize, picture.height() as usize);
    if width == 0 || height == 0 {
        return Err(ImageError::invalid_input("the picture is empty"));
    }
    let (tile_w, tile_h) = (TILE.min(width), TILE.min(height));
    let scale = spec.scale as usize;
    let factor = factor as usize;

    let unusable = |error: TractError| {
        ImageError::new(
            ImageErrorKind::NotInstalled,
            format!(
                "the model file {} could not be loaded ({error:#}); install it again",
                file.display()
            ),
        )
    };
    let failed = |error: TractError| {
        ImageError::new(
            ImageErrorKind::GenerationFailed,
            format!("the model {} failed on this picture: {error:#}", spec.id),
        )
    };
    let plan = tract_onnx::onnx()
        .model_for_path(file)
        .and_then(|model| model.with_input_fact(0, f32::fact([1, 3, tile_h, tile_w]).into()))
        .and_then(InferenceModel::into_optimized)
        .and_then(TypedModel::into_runnable)
        .map_err(unusable)?;

    let columns = spans(width, tile_w);
    let tiles: Vec<Tile> = spans(height, tile_h)
        .into_iter()
        .flat_map(|y| columns.iter().map(move |&x| Tile { x, y }))
        .collect();
    let total = tiles.len();
    progress(0, total);

    let (side_w, side_h) = (tile_w * scale, tile_h * scale);
    let one = |tile: Tile| -> Result<Piece> {
        let tensor = tensor_of(picture, tile.x.start, tile.y.start, tile_w, tile_h);
        let input = Tensor::from_shape(&[1, 3, tile_h, tile_w], &tensor).map_err(failed)?;
        let outputs = plan.run(tvec!(input.into())).map_err(failed)?;
        let first = outputs
            .first()
            .ok_or_else(|| ImageError::internal("the model returned nothing"))?;
        let view = first.to_plain_array_view::<f32>().map_err(failed)?;
        let values: Vec<f32>;
        let values = match view.as_slice() {
            Some(slice) => slice,
            None => {
                values = view.iter().copied().collect();
                &values
            }
        };
        if values.len() != 3 * side_w * side_h {
            return Err(ImageError::new(
                ImageErrorKind::GenerationFailed,
                format!(
                    "the model {} returned {} values for a tile of {tile_w} by {tile_h}, not a \
                     picture {scale} times its size",
                    spec.id,
                    values.len()
                ),
            ));
        }
        Ok(Piece {
            tile,
            rgb: piece_of(values, (side_w, side_h), tile, factor, scale / factor),
        })
    };

    let (out_w, out_h) = (width * factor, height * factor);
    let mut result = vec![0_u8; out_w * out_h * 3];
    let mut failure: Option<ImageError> = None;
    let next = AtomicUsize::new(0);
    let stop = AtomicBool::new(false);
    thread::scope(|scope| {
        let (sender, receiver) = mpsc::channel::<Result<Piece>>();
        for _ in 0..model::threads().min(total) {
            let sender = sender.clone();
            let (tiles, next, stop, one) = (&tiles, &next, &stop, &one);
            scope.spawn(move || {
                while !stop.load(Ordering::Relaxed) && !cancelled.load(Ordering::Relaxed) {
                    let Some(tile) = tiles.get(next.fetch_add(1, Ordering::Relaxed)) else {
                        return;
                    };
                    let piece = one(*tile);
                    // The receiver is gone only when the whole call is: nothing to tell.
                    if sender.send(piece).is_err() {
                        return;
                    }
                }
            });
        }
        drop(sender);
        let mut done = 0;
        for piece in receiver {
            match piece {
                Ok(piece) => {
                    lay(&mut result, out_w, &piece, factor);
                    done += 1;
                    progress(done, total);
                }
                Err(error) => {
                    // The first failure ends the job: the other threads finish their tile.
                    stop.store(true, Ordering::Relaxed);
                    failure.get_or_insert(error);
                }
            }
        }
    });
    if cancelled.load(Ordering::Relaxed) {
        return Err(ImageError::cancelled());
    }
    if let Some(error) = failure {
        return Err(error);
    }
    RgbImage::from_raw(out_w as u32, out_h as u32, result)
        .ok_or_else(|| ImageError::internal("the upscaled picture has the wrong size"))
}

/// Puts the kept part of a tile where it belongs in the result, `out_w` pixels wide.
fn lay(result: &mut [u8], out_w: usize, piece: &Piece, factor: usize) {
    let Tile { x, y } = piece.tile;
    let row_len = (x.to - x.from) * factor * 3;
    let left = (x.start + x.from) * factor;
    let top = (y.start + y.from) * factor;
    for (row, line) in piece.rgb.chunks_exact(row_len).enumerate() {
        let at = ((top + row) * out_w + left) * 3;
        result[at..at + row_len].copy_from_slice(line);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_models_have_ids_and_files_of_their_own() {
        for (i, spec) in UPSCALERS.iter().enumerate() {
            assert_eq!(spec.file, format!("{}.onnx", spec.id));
            assert!(UPSCALERS[..i].iter().all(|other| other.id != spec.id));
            // Every size the app offers is one the network gives, whole or halved.
            assert!(FACTORS.iter().all(|f| spec.scale.is_multiple_of(*f)));
            // And no file is taken for a matting model, or the other way round.
            assert!(
                model::MODELS
                    .iter()
                    .all(|matting| matting.file != spec.file)
            );
        }
    }

    #[test]
    fn tiles_cover_an_axis_once_and_keep_clear_of_their_own_edges() {
        for length in [
            1, 31, 255, 256, 257, 300, 448, 449, 512, 1000, 1024, 2048, 4097,
        ] {
            let tile = TILE.min(length);
            let spans = spans(length, tile);
            let mut covered = 0;
            for span in &spans {
                assert!(
                    span.start + tile <= length,
                    "{length}: {span:?} is a full tile"
                );
                assert_eq!(
                    span.start + span.from,
                    covered,
                    "{length}: no gap, no overlap"
                );
                assert!(span.from < span.to && span.to <= tile, "{length}: {span:?}");
                // A kept pixel is a margin away from every edge of the tile inside the picture.
                assert!(
                    span.start == 0 || span.from >= OVERLAP,
                    "{length}: {span:?}"
                );
                assert!(
                    span.start + tile == length || tile - span.to >= OVERLAP,
                    "{length}: {span:?}"
                );
                covered = span.start + span.to;
            }
            assert_eq!(covered, length, "{length}");
        }
        // A picture shorter than a tile is one tile, and one that is a pixel longer is two.
        assert_eq!(spans(200, 200).len(), 1);
        assert_eq!(spans(257, 256).len(), 2);
    }

    #[test]
    fn a_tile_is_read_channel_after_channel_and_laid_back_where_it_was() {
        // A picture whose every pixel says where it is.
        let picture = RgbImage::from_fn(7, 5, |x, y| image::Rgb([x as u8 * 30, y as u8 * 40, 255]));
        let tensor = tensor_of(&picture, 2, 1, 4, 3);
        assert_eq!(tensor.len(), 3 * 4 * 3);
        // Red is the column, green the row, blue full: of the pixel at (2 + 3, 1 + 2).
        assert!((tensor[2 * 4 + 3] - 150.0 / 255.0).abs() < 1e-6);
        assert!((tensor[12 + 2 * 4 + 3] - 120.0 / 255.0).abs() < 1e-6);
        assert!((tensor[24 + 2 * 4 + 3] - 1.0).abs() < 1e-6);

        // A network that only repeats each pixel four times: its output for the tile.
        let (w, h, scale) = (4, 3, 4);
        let (side_w, side_h) = (w * scale, h * scale);
        let mut values = vec![0.0_f32; 3 * side_w * side_h];
        for channel in 0..3 {
            for y in 0..side_h {
                for x in 0..side_w {
                    values[channel * side_w * side_h + y * side_w + x] =
                        tensor[channel * w * h + (y / scale) * w + x / scale];
                }
            }
        }
        // The whole tile is kept, at four times and at two.
        let tile = Tile {
            x: Span {
                start: 2,
                from: 0,
                to: 4,
            },
            y: Span {
                start: 1,
                from: 0,
                to: 3,
            },
        };
        for factor in [4, 2] {
            let rgb = piece_of(&values, (side_w, side_h), tile, factor, scale / factor);
            assert_eq!(rgb.len(), w * factor * h * factor * 3);
            let mut result = vec![0_u8; 7 * factor * 5 * factor * 3];
            lay(&mut result, 7 * factor, &Piece { tile, rgb }, factor);
            let result = RgbImage::from_raw((7 * factor) as u32, (5 * factor) as u32, result)
                .expect("the size is right");
            for (x, y) in [(2, 1), (5, 3), (3, 2)] {
                let at =
                    |dx, dy| *result.get_pixel((x * factor + dx) as u32, (y * factor + dy) as u32);
                assert_eq!(
                    at(0, 0),
                    *picture.get_pixel(x as u32, y as u32),
                    "{factor}x"
                );
                assert_eq!(at(factor - 1, factor - 1), at(0, 0), "{factor}x");
            }
            // Outside the tile nothing was written.
            assert_eq!(result.get_pixel(0, 0).0, [0, 0, 0]);
        }
    }
}
