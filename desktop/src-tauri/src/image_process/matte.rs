//! Between a picture and a matting model: the picture as the model reads it, and the model's
//! matte brought back to a cut-out of the picture's own size.
//!
//! ```text
//! picture ──scale to the model's square, normalise──► the model ──► matte, at the model's size
//!    │                                                                 │
//!    └──────────── the guide ──────────────► alpha ◄───────────────────┘   edges follow the picture
//!                                              │
//! picture ───────────────────────────────► cutout: the subject's own colour where it is half seen
//! ```
//!
//! A matte is far coarser than the picture (320 or 1024 pixels a side, whatever the picture's
//! proportions). Stretched back as it is, its edge is a blur several pixels wide. [`alpha`]
//! instead fits, around every pixel of the matte, the straight line that best predicts the matte
//! from the picture's colours there (a guided filter), and applies those lines to the picture at
//! full size: where the picture has an edge, the alpha has it too, as sharp as the picture's.
//!
//! A pixel that is half subject and half background shows a mix of both colours. [`cutout`]
//! takes the background's share out of it, so that a strand of hair cut from a green hedge is
//! not green on the slide.
//!
//! Nothing here knows a model or a file; the numbers that describe a model are a [`Shape`].

use image::{ImageBuffer, Luma, RgbImage, Rgba, RgbaImage, imageops};

/// How a model takes a picture, and what its output means.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Shape {
    /// The side of the square the model looks at; its matte has the same size.
    pub side: u32,
    /// Subtracted from each channel, after scaling to 0..1.
    pub mean: [f32; 3],
    /// Each channel is then divided by this.
    pub std: [f32; 3],
    /// The picture is scaled by its own largest value instead of by 255.
    pub by_max: bool,
    /// The matte is stretched so that its smallest value is 0 and its largest 1.
    pub stretch: bool,
}

/// The radius, in pixels of the matte, of the neighbourhood a line is fitted in.
const FIT_RADIUS: usize = 3;
/// How flat a neighbourhood must be for the fit to ignore the picture there (colours are 0..1).
const FIT_EPSILON: f64 = 1e-4;
/// The matte below this is background, and above [`SOLID`] is subject: models leave a haze of
/// small values over the background and are a little short of 1 inside the subject.
const CLEAR: f32 = 0.04;
const SOLID: f32 = 0.96;
/// The longer side of the grid the subject's colours are estimated on.
const COLOUR_GRID: u32 = 1024;

/// The picture as the model reads it: scaled to the model's square, normalised, channel after
/// channel. Also returns the scaled picture, which [`alpha`] uses as its guide.
pub fn input(picture: &RgbImage, shape: &Shape) -> (Vec<f32>, RgbImage) {
    let side = shape.side;
    let small = imageops::resize(picture, side, side, imageops::FilterType::Triangle);
    let scale = if shape.by_max {
        let largest = small.pixels().flat_map(|p| p.0).max().unwrap_or(u8::MAX);
        f32::from(largest.max(1))
    } else {
        255.0
    };
    let plane = small.as_raw().len() / 3;
    let mut tensor = vec![0.0_f32; plane * 3];
    for (i, pixel) in small.pixels().enumerate() {
        for c in 0..3 {
            tensor[c * plane + i] = (f32::from(pixel[c]) / scale - shape.mean[c]) / shape.std[c];
        }
    }
    (tensor, small)
}

/// The model's output as a matte: one value per pixel of its square, from 0 (background) to 1
/// (subject). `None` when the output is not of the model's size.
pub fn matte(output: &[f32], shape: &Shape) -> Option<Vec<f32>> {
    let plane = (shape.side as usize).pow(2);
    // A model may return several maps; the first is the finest.
    let output = output.get(..plane)?;
    let (low, high) = if shape.stretch {
        output.iter().fold((f32::MAX, f32::MIN), |(low, high), v| {
            (low.min(*v), high.max(*v))
        })
    } else {
        (0.0, 1.0)
    };
    let range = (high - low).max(1e-6);
    Some(
        output
            .iter()
            .map(|v| ((v - low) / range).clamp(0.0, 1.0))
            .collect(),
    )
}

/// The matte at the picture's size, one value per pixel from 0 to 1, with edges that follow the
/// picture's. `small` is the picture at the matte's size, as [`input`] returned it.
pub fn alpha(picture: &RgbImage, small: &RgbImage, matte: &[f32]) -> Vec<f32> {
    let (w, h) = (picture.width() as usize, picture.height() as usize);
    let (sw, sh) = (small.width() as usize, small.height() as usize);
    if w == 0 || h == 0 || sw == 0 || sh == 0 || matte.len() != sw * sh {
        return vec![0.0; w * h];
    }
    let lines = fit(small, matte, FIT_RADIUS);
    let columns = taps(w, sw);
    let rows = taps(h, sh);
    let mut out = vec![0.0_f32; w * h];
    for (y, row) in out.chunks_exact_mut(w).enumerate() {
        let (y0, y1, fy) = rows[y];
        for (x, value) in row.iter_mut().enumerate() {
            let (x0, x1, fx) = columns[x];
            let sample = |plane: &[f32]| {
                let top = plane[y0 * sw + x0] * (1.0 - fx) + plane[y0 * sw + x1] * fx;
                let bottom = plane[y1 * sw + x0] * (1.0 - fx) + plane[y1 * sw + x1] * fx;
                top * (1.0 - fy) + bottom * fy
            };
            let pixel = picture.get_pixel(x as u32, y as u32);
            let predicted = sample(&lines.slope[0]) * f32::from(pixel[0]) / 255.0
                + sample(&lines.slope[1]) * f32::from(pixel[1]) / 255.0
                + sample(&lines.slope[2]) * f32::from(pixel[2]) / 255.0
                + sample(&lines.offset);
            *value = ((predicted - CLEAR) / (SOLID - CLEAR)).clamp(0.0, 1.0);
        }
    }
    out
}

/// The cut-out: the picture with `alpha` (one value per pixel, 0 to 1) as its transparency.
/// Where a pixel is partly transparent its colour is the subject's alone, with the background's
/// share taken out. Fully transparent pixels are transparent black.
pub fn cutout(picture: &RgbImage, alpha: &[f32]) -> RgbaImage {
    let (w, h) = picture.dimensions();
    let mut out = RgbaImage::new(w, h);
    if w == 0 || h == 0 || alpha.len() != (w as usize) * (h as usize) {
        return out;
    }
    let colours = Colours::estimate(picture, alpha);
    let columns = taps(w as usize, colours.w);
    let rows = taps(h as usize, colours.h);
    for (y, row) in out.enumerate_rows_mut() {
        let y = y as usize;
        for (x, _, pixel) in row {
            let a = alpha[y * w as usize + x as usize];
            let level = (a * 255.0).round().clamp(0.0, 255.0);
            let source = picture.get_pixel(x, y as u32);
            *pixel = if level <= 0.0 {
                Rgba([0, 0, 0, 0])
            } else if level >= 255.0 {
                Rgba([source[0], source[1], source[2], 255])
            } else {
                let [subject, background] = colours.at(columns[x as usize], rows[y]);
                let own = |c: usize| {
                    // What the pixel shows is a mix of subject and background by `a`; what
                    // the estimates do not explain is laid back on the subject's colour.
                    let seen = f32::from(source[c]) / 255.0;
                    let left = seen - a * subject[c] - (1.0 - a) * background[c];
                    to_u8((subject[c] + a * left) * 255.0)
                };
                Rgba([own(0), own(1), own(2), to_u8(level)])
            };
        }
    }
    out
}

/// Multiplies a cut-out's transparency by the picture's own, for a picture that came with some.
pub fn keep_transparency(cutout: &mut RgbaImage, original: &RgbaImage) {
    for (pixel, source) in cutout.pixels_mut().zip(original.pixels()) {
        if source[3] < u8::MAX {
            let product = (u16::from(pixel[3]) * u16::from(source[3]) + 127) / 255;
            pixel[3] = u8::try_from(product).unwrap_or(u8::MAX);
            if pixel[3] == 0 {
                *pixel = Rgba([0, 0, 0, 0]);
            }
        }
    }
}

/// The lines fitted around every pixel of the matte: `matte ≈ slope · colour + offset`, already
/// averaged over the neighbourhoods a pixel belongs to.
struct Lines {
    slope: [Vec<f32>; 3],
    offset: Vec<f32>,
}

/// The guided filter (He, Sun and Tang) with the picture's three colours as the guide.
fn fit(small: &RgbImage, matte: &[f32], radius: usize) -> Lines {
    let (w, h) = (small.width() as usize, small.height() as usize);
    let mean = |values: &[f32]| box_mean(values, w, h, radius);
    let colour: [Vec<f32>; 3] =
        std::array::from_fn(|c| small.pixels().map(|p| f32::from(p[c]) / 255.0).collect());
    let product =
        |a: &[f32], b: &[f32]| -> Vec<f32> { a.iter().zip(b).map(|(a, b)| a * b).collect() };

    let mean_colour: [Vec<f32>; 3] = std::array::from_fn(|c| mean(&colour[c]));
    let mean_matte = mean(matte);
    let mean_both: [Vec<f32>; 3] = std::array::from_fn(|c| mean(&product(&colour[c], matte)));
    // The six different products of two colours: rr, rg, rb, gg, gb, bb.
    const PAIRS: [(usize, usize); 6] = [(0, 0), (0, 1), (0, 2), (1, 1), (1, 2), (2, 2)];
    let mean_pair: [Vec<f32>; 6] =
        std::array::from_fn(|i| mean(&product(&colour[PAIRS[i].0], &colour[PAIRS[i].1])));

    let mut slope: [Vec<f32>; 3] = std::array::from_fn(|_| vec![0.0; w * h]);
    let mut offset = vec![0.0_f32; w * h];
    for i in 0..w * h {
        let m = [mean_colour[0][i], mean_colour[1][i], mean_colour[2][i]].map(f64::from);
        let p = f64::from(mean_matte[i]);
        // How the matte varies with each colour, and how the colours vary together.
        let with: [f64; 3] = std::array::from_fn(|c| f64::from(mean_both[c][i]) - m[c] * p);
        let var = |pair: usize| {
            let (a, b) = PAIRS[pair];
            let flat = if a == b { FIT_EPSILON } else { 0.0 };
            f64::from(mean_pair[pair][i]) - m[a] * m[b] + flat
        };
        let (rr, rg, rb, gg, gb, bb) = (var(0), var(1), var(2), var(3), var(4), var(5));
        // The inverse of the symmetric matrix of variances, by cofactors.
        let (c0, c1, c2) = (gg * bb - gb * gb, rb * gb - rg * bb, rg * gb - rb * gg);
        let determinant = rr * c0 + rg * c1 + rb * c2;
        let line = if determinant.abs() < 1e-18 {
            [0.0; 3]
        } else {
            let (c3, c4, c5) = (rr * bb - rb * rb, rg * rb - rr * gb, rr * gg - rg * rg);
            [
                (c0 * with[0] + c1 * with[1] + c2 * with[2]) / determinant,
                (c1 * with[0] + c3 * with[1] + c4 * with[2]) / determinant,
                (c2 * with[0] + c4 * with[1] + c5 * with[2]) / determinant,
            ]
        };
        for c in 0..3 {
            slope[c][i] = narrow(line[c]);
        }
        offset[i] = narrow(p - line[0] * m[0] - line[1] * m[1] - line[2] * m[2]);
    }
    Lines {
        slope: slope.map(|plane| mean(&plane)),
        offset: mean(&offset),
    }
}

/// The colour of the subject alone and of the background alone around every pixel, on a grid
/// no larger than [`COLOUR_GRID`]: both are smooth, so a coarse grid is enough.
struct Colours {
    w: usize,
    h: usize,
    subject: [Vec<f32>; 3],
    background: [Vec<f32>; 3],
}

impl Colours {
    /// Blur-fusion (Forte and Pitié): the subject's colour around a pixel is the average of the
    /// picture weighted by alpha, the background's the average weighted by what is left; a
    /// second, narrower pass starts from the first one's answer.
    fn estimate(picture: &RgbImage, alpha: &[f32]) -> Self {
        let (pw, ph) = picture.dimensions();
        let scale = f64::from(COLOUR_GRID) / f64::from(pw.max(ph));
        let (w, h) = if scale < 1.0 {
            (scaled(pw, scale), scaled(ph, scale))
        } else {
            (pw, ph)
        };
        let (picture, alpha) = if (w, h) == (pw, ph) {
            (picture.clone(), alpha.to_vec())
        } else {
            let filter = imageops::FilterType::Triangle;
            let alpha: ImageBuffer<Luma<f32>, Vec<f32>> =
                ImageBuffer::from_raw(pw, ph, alpha.to_vec()).unwrap_or_default();
            (
                imageops::resize(picture, w, h, filter),
                imageops::resize(&alpha, w, h, filter).into_raw(),
            )
        };
        let (w, h) = (w as usize, h as usize);
        let seen: [Vec<f32>; 3] =
            std::array::from_fn(|c| picture.pixels().map(|p| f32::from(p[c]) / 255.0).collect());
        let longer = w.max(h);
        let wide = Self::pass(&seen, &seen, &seen, &alpha, w, h, (longer / 16).max(2));
        // The first pass's subject, sharpened by what the picture shows.
        let sharper: [Vec<f32>; 3] = std::array::from_fn(|c| {
            (0..w * h)
                .map(|i| {
                    let a = alpha[i];
                    let left = seen[c][i] - a * wide.0[c][i] - (1.0 - a) * wide.1[c][i];
                    (wide.0[c][i] + a * left).clamp(0.0, 1.0)
                })
                .collect()
        });
        let (subject, background) = Self::pass(
            &seen,
            &sharper,
            &wide.1,
            &alpha,
            w,
            h,
            (longer / 170).max(2),
        );
        Self {
            w,
            h,
            subject,
            background,
        }
    }

    /// One pass: the averages of `subject` weighted by alpha and of `background` weighted by
    /// the rest, over a neighbourhood of `radius`.
    fn pass(
        seen: &[Vec<f32>; 3],
        subject: &[Vec<f32>; 3],
        background: &[Vec<f32>; 3],
        alpha: &[f32],
        w: usize,
        h: usize,
        radius: usize,
    ) -> ([Vec<f32>; 3], [Vec<f32>; 3]) {
        let mean = |values: &[f32]| box_mean(values, w, h, radius);
        let weight = mean(alpha);
        let average = |colour: &[f32], fallback: &[f32], of_subject: bool| -> Vec<f32> {
            let weighted: Vec<f32> = colour
                .iter()
                .zip(alpha)
                .map(|(v, a)| v * if of_subject { *a } else { 1.0 - a })
                .collect();
            mean(&weighted)
                .iter()
                .zip(&weight)
                .zip(fallback)
                .map(|((sum, weight), fallback)| {
                    let share = if of_subject { *weight } else { 1.0 - weight };
                    // No subject (or no background) anywhere near: the picture itself.
                    if share < 1e-4 {
                        *fallback
                    } else {
                        (sum / share).clamp(0.0, 1.0)
                    }
                })
                .collect()
        };
        (
            std::array::from_fn(|c| average(&subject[c], &seen[c], true)),
            std::array::from_fn(|c| average(&background[c], &seen[c], false)),
        )
    }

    /// The subject's and the background's colour at one pixel of the picture.
    fn at(&self, column: Tap, row: Tap) -> [[f32; 3]; 2] {
        let (x0, x1, fx) = column;
        let (y0, y1, fy) = row;
        let sample = |plane: &[f32]| {
            let top = plane[y0 * self.w + x0] * (1.0 - fx) + plane[y0 * self.w + x1] * fx;
            let bottom = plane[y1 * self.w + x0] * (1.0 - fx) + plane[y1 * self.w + x1] * fx;
            top * (1.0 - fy) + bottom * fy
        };
        [
            std::array::from_fn(|c| sample(&self.subject[c])),
            std::array::from_fn(|c| sample(&self.background[c])),
        ]
    }
}

/// Where a pixel of the large picture falls between two pixels of the small one: the two
/// indices and the weight of the second.
type Tap = (usize, usize, f32);

/// The taps of every pixel along one side, `large` pixels read from `small` ones, pixel centres
/// aligned as a resize aligns them.
fn taps(large: usize, small: usize) -> Vec<Tap> {
    let ratio = small as f64 / large as f64;
    (0..large)
        .map(|i| {
            let position = ((i as f64 + 0.5) * ratio - 0.5).clamp(0.0, (small - 1) as f64);
            let first = position.floor();
            let index = float_index(first);
            (index, (index + 1).min(small - 1), narrow(position - first))
        })
        .collect()
}

/// The mean of every pixel's neighbourhood of `radius`, cut at the sides of the plane.
pub(super) fn box_mean(values: &[f32], w: usize, h: usize, radius: usize) -> Vec<f32> {
    if w == 0 || h == 0 || values.len() != w * h {
        return values.to_vec();
    }
    let count =
        |i: usize, length: usize| (i + radius).min(length - 1) - i.saturating_sub(radius) + 1;
    // Along the rows: a sum that takes one value in and lets one out at every step.
    let mut across = vec![0.0_f32; w * h];
    for (row, out) in values.chunks_exact(w).zip(across.chunks_exact_mut(w)) {
        let mut sum: f32 = row[..=radius.min(w - 1)].iter().sum();
        for x in 0..w {
            out[x] = sum / count(x, w) as f32;
            if x + radius + 1 < w {
                sum += row[x + radius + 1];
            }
            if x >= radius {
                sum -= row[x - radius];
            }
        }
    }
    // Down the columns: the same, a whole row of sums at a time.
    let mut out = vec![0.0_f32; w * h];
    let mut sums = vec![0.0_f32; w];
    for row in across.chunks_exact(w).take(radius + 1) {
        for (sum, value) in sums.iter_mut().zip(row) {
            *sum += value;
        }
    }
    for y in 0..h {
        let rows = count(y, h) as f32;
        for (value, sum) in out[y * w..(y + 1) * w].iter_mut().zip(&sums) {
            *value = sum / rows;
        }
        if y + radius + 1 < h {
            let entering = &across[(y + radius + 1) * w..(y + radius + 2) * w];
            for (sum, value) in sums.iter_mut().zip(entering) {
                *sum += value;
            }
        }
        if y >= radius {
            let leaving = &across[(y - radius) * w..(y - radius + 1) * w];
            for (sum, value) in sums.iter_mut().zip(leaving) {
                *sum -= value;
            }
        }
    }
    out
}

/// A length scaled down, at least one pixel.
fn scaled(length: u32, scale: f64) -> u32 {
    let scaled = (f64::from(length) * scale).round().max(1.0);
    #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
    let scaled = scaled as u32;
    scaled
}

/// A value already rounded and within 0..255 as a byte.
fn to_u8(value: f32) -> u8 {
    #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
    let byte = value.round().clamp(0.0, 255.0) as u8;
    byte
}

fn narrow(value: f64) -> f32 {
    #[allow(clippy::cast_possible_truncation)]
    let narrow = value as f32;
    narrow
}

/// A position that is already whole and not negative, as an index.
fn float_index(value: f64) -> usize {
    #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
    let index = value.max(0.0) as usize;
    index
}

#[cfg(test)]
mod tests {
    use image::Rgb;

    use super::*;

    /// A flat picture of one colour.
    fn flat(w: u32, h: u32, colour: [u8; 3]) -> RgbImage {
        RgbImage::from_pixel(w, h, Rgb(colour))
    }

    const SHAPE: Shape = Shape {
        side: 8,
        mean: [0.5, 0.4, 0.3],
        std: [0.5, 0.25, 1.0],
        by_max: false,
        stretch: true,
    };

    /// A picture whose left part is one colour and whose right part another, with the pixels
    /// on the border between them mixed as a camera would mix them.
    fn split(w: u32, h: u32, border: f32, left: [u8; 3], right: [u8; 3]) -> (RgbImage, Vec<f32>) {
        let mut truth = Vec::new();
        let picture = RgbImage::from_fn(w, h, |x, _| {
            // How much of the pixel lies left of the border.
            let share = (border - x as f32).clamp(0.0, 1.0);
            truth.push(share);
            Rgb(std::array::from_fn(|c| {
                to_u8(f32::from(left[c]) * share + f32::from(right[c]) * (1.0 - share))
            }))
        });
        (picture, truth)
    }

    #[test]
    fn the_input_is_the_scaled_picture_normalised_channel_after_channel() {
        let picture = flat(40, 20, [255, 102, 0]);
        let (tensor, small) = input(&picture, &SHAPE);
        assert_eq!(small.dimensions(), (8, 8));
        assert_eq!(tensor.len(), 3 * 64);
        // (1.0 - 0.5) / 0.5, (0.4 - 0.4) / 0.25, (0.0 - 0.3) / 1.0
        for (plane, expected) in [(0, 1.0), (1, 0.0), (2, -0.3)] {
            for value in &tensor[plane * 64..(plane + 1) * 64] {
                assert!((value - expected).abs() < 1e-5, "{plane}: {value}");
            }
        }
        // A model trained on pictures scaled by their own brightest value gets that.
        let dim = flat(40, 20, [100, 50, 0]);
        let by_max = Shape {
            by_max: true,
            mean: [0.0; 3],
            std: [1.0; 3],
            ..SHAPE
        };
        let (tensor, _) = input(&dim, &by_max);
        assert!((tensor[0] - 1.0).abs() < 1e-5 && (tensor[64] - 0.5).abs() < 1e-5);
        // A black picture does not divide by zero.
        let (tensor, _) = input(&flat(8, 8, [0, 0, 0]), &by_max);
        assert!(tensor.iter().all(|v| v.is_finite()));
    }

    #[test]
    fn the_matte_is_the_first_map_of_the_output_stretched_to_the_full_range() {
        let mut output: Vec<f32> = (0..64).map(|i| 0.2 + 0.6 * (i as f32 / 63.0)).collect();
        // A second, coarser map after the first is ignored.
        output.extend(std::iter::repeat_n(9.0, 64));
        let stretched = matte(&output, &SHAPE).unwrap_or_default();
        assert_eq!(stretched.len(), 64);
        assert!(stretched[0].abs() < 1e-6 && (stretched[63] - 1.0).abs() < 1e-6);
        let plain = Shape {
            stretch: false,
            ..SHAPE
        };
        let kept = matte(&output, &plain).unwrap_or_default();
        assert!((kept[0] - 0.2).abs() < 1e-6 && (kept[63] - 0.8).abs() < 1e-6);
        // Out of range values of a model that is not stretched are cut, not wrapped.
        let wild = matte(&[-0.5; 64], &plain).unwrap_or_default();
        assert!(wild.iter().all(|v| *v == 0.0));
        // A flat output does not divide by zero, and a short one is refused.
        assert!(
            matte(&[0.5; 64], &SHAPE)
                .unwrap_or_default()
                .iter()
                .all(|v| v.is_finite())
        );
        assert_eq!(matte(&[0.5; 63], &SHAPE), None);
    }

    #[test]
    fn a_box_mean_averages_what_is_inside_the_plane() {
        // 5 by 1: the neighbourhood of radius 1 is cut at both ends.
        let means = box_mean(&[0.0, 3.0, 6.0, 9.0, 12.0], 5, 1, 1);
        assert_eq!(means, [1.5, 3.0, 6.0, 9.0, 10.5]);
        // A radius larger than the plane is the mean of all of it, in both directions.
        let all = box_mean(&[1.0, 2.0, 3.0, 6.0], 2, 2, 10);
        assert!(all.iter().all(|v| (v - 3.0).abs() < 1e-6), "{all:?}");
        // A flat plane stays flat whatever the radius.
        let plane = vec![0.25_f32; 37 * 19];
        for radius in [0, 1, 4, 40] {
            let means = box_mean(&plane, 37, 19, radius);
            assert!(means.iter().all(|v| (v - 0.25).abs() < 1e-5), "{radius}");
        }
    }

    #[test]
    fn the_alpha_has_the_pictures_size_and_its_edge_is_as_sharp_as_the_pictures() {
        // 640 by 320, the subject on the left up to x = 300.5; the model saw it at 64 by 64.
        let shape = Shape { side: 64, ..SHAPE };
        let (picture, truth) = split(640, 320, 300.5, [200, 60, 40], [20, 90, 30]);
        let (_, small) = input(&picture, &shape);
        // What a model returns: right, but only at its own size.
        let coarse: Vec<f32> = (0..64 * 64)
            .map(|i| ((300.5 / 10.0) - (i % 64) as f32).clamp(0.0, 1.0))
            .collect();
        let fine = alpha(&picture, &small, &coarse);
        assert_eq!(fine.len(), 640 * 320);

        let row = &fine[160 * 640..161 * 640];
        // Solid on the subject and clear on the background, right up to the border...
        assert!(row[..299].iter().all(|a| *a > 0.99), "{:?}", &row[290..299]);
        assert!(row[302..].iter().all(|a| *a < 0.01), "{:?}", &row[302..312]);
        // ...and the one mixed pixel is about as transparent as it is mixed.
        assert!(
            (row[300] - truth[160 * 640 + 300]).abs() < 0.1,
            "{}",
            row[300]
        );
        // Stretched back without the picture, the same matte is a blur ten pixels wide.
        let blurred = (290..310).filter(|x| {
            let m = ((300.5 / 10.0) - (*x as f32 + 0.5) / 10.0 + 0.5).clamp(0.0, 1.0);
            m > 0.05 && m < 0.95
        });
        assert!(blurred.count() >= 8);
    }

    #[test]
    fn a_matte_that_is_all_subject_or_all_background_stays_so() {
        let picture = RgbImage::from_fn(96, 64, |x, y| {
            Rgb([(x * 2) as u8, (y * 3) as u8, ((x + y) % 251) as u8])
        });
        let shape = Shape { side: 16, ..SHAPE };
        let (_, small) = input(&picture, &shape);
        assert!(
            alpha(&picture, &small, &[1.0; 256])
                .iter()
                .all(|a| *a == 1.0)
        );
        assert!(
            alpha(&picture, &small, &[0.0; 256])
                .iter()
                .all(|a| *a == 0.0)
        );
        // A matte of the wrong size gives a clear picture, not a panic.
        assert!(alpha(&picture, &small, &[1.0; 9]).iter().all(|a| *a == 0.0));
    }

    #[test]
    fn a_half_seen_pixel_of_the_cutout_has_the_subjects_colour_not_the_backgrounds() {
        let subject = [200, 60, 40];
        let (picture, truth) = split(200, 60, 100.5, subject, [20, 200, 30]);
        let cut = cutout(&picture, &truth);
        assert_eq!(cut.dimensions(), (200, 60));
        // Solid pixels are the picture's own, clear ones are transparent black.
        assert_eq!(cut.get_pixel(40, 30), &Rgba([200, 60, 40, 255]));
        assert_eq!(cut.get_pixel(160, 30), &Rgba([0, 0, 0, 0]));
        // The mixed pixel shows (110, 130, 35); in the cut-out it is the subject, half seen.
        assert_eq!(picture.get_pixel(100, 30), &Rgb([110, 130, 35]));
        let mixed = cut.get_pixel(100, 30);
        assert_eq!(mixed[3], 128);
        for c in 0..3 {
            let off = i32::from(mixed[c]) - i32::from(subject[c]);
            assert!(off.abs() <= 6, "channel {c}: {mixed:?}");
        }
    }

    #[test]
    fn a_picture_that_came_with_transparency_keeps_it() {
        let picture = flat(4, 1, [10, 20, 30]);
        let mut cut = cutout(&picture, &[1.0, 1.0, 0.5, 0.0]);
        let original = RgbaImage::from_fn(4, 1, |x, _| {
            Rgba([10, 20, 30, [255, 0, 128, 255][x as usize]])
        });
        keep_transparency(&mut cut, &original);
        let alphas: Vec<u8> = cut.pixels().map(|p| p[3]).collect();
        assert_eq!(alphas, [255, 0, 64, 0]);
        assert_eq!(cut.get_pixel(1, 0), &Rgba([0, 0, 0, 0]));
    }
}
