//! Chroma key: a flat background colour made transparent, without a model.
//!
//! This is how a picture drawn by a provider that cannot draw transparency gets a transparent
//! background: it is drawn on one flat colour, and the colour is keyed out here.
//!
//! ```text
//! key colour:  given, or the colour most of the picture's border has
//! background:  every pixel within the tolerance of the key (or only those the border reaches)
//! edge:        a pixel beside the background is the subject's colour mixed with the key, as
//!              the renderer smoothed the outline; the share of the subject becomes its alpha,
//!              and the key's share is taken out of its colour
//! the rest:    untouched
//! ```
//!
//! Along an edge the picture shows `seen = a · subject + (1 - a) · key`. The subject's colour is
//! read from the picture itself: from the edge pixel inwards, as long as the next pixel lies in
//! the same direction from the key and further from it, that pixel is a purer sample of the same
//! colour. Where the walk ends is the subject; `a` follows, and the pixel's own colour is what
//! laid over the key with that `a` gives back exactly what was seen. So the result laid over the
//! key colour is the original picture, and laid over anything else it has no rim of the key.
//!
//! What it does not do: a shadow or a glow painted on the background is not the key colour, and
//! stays, opaque.

use image::{Rgba, RgbaImage};

/// The longest distance between two colours: black to white.
const FULL: f32 = 441.672_97;
/// The border pixels within this of the key are the background's own noise.
const NEAR: f32 = 48.0;
/// The share of the border that must be near one colour for that colour to be the background.
const FLAT_SHARE: f32 = 0.6;
/// How much further from the key the next pixel must be for the walk to go on.
const STEP: f32 = 6.0;
/// The cosine of the widest angle, seen from the key, between a pixel and a purer one.
const SAME_DIRECTION: f32 = 0.94;
/// A pixel that is this much subject is all subject: the subject's own unevenness reads as a
/// few percent of key, and such a pixel is left as it is.
const WHOLE: f32 = 0.94;

/// What to key out, and how.
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct KeyOptions {
    /// The background colour. `None`: the colour of the picture's border.
    pub color: Option<[u8; 3]>,
    /// How far from the key a colour is still background, 0 to 1 of the distance between black
    /// and white. `None`: measured from the border's own noise.
    pub tolerance: Option<f32>,
    /// Only background the border reaches is removed; the key colour inside the subject stays.
    pub contiguous: bool,
}

/// A keyed picture and the colour that was removed.
#[derive(Debug, Clone)]
pub struct Keyed {
    pub image: RgbaImage,
    pub color: [u8; 3],
}

/// Why a picture could not be keyed. The text is for the caller's error message.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct KeyError(pub String);

/// Makes the background colour of `picture` transparent.
pub fn chroma_key(picture: &RgbaImage, options: &KeyOptions) -> Result<Keyed, KeyError> {
    let (w, h) = (picture.width() as usize, picture.height() as usize);
    if w < 3 || h < 3 {
        return Err(KeyError("the picture is too small to key".into()));
    }
    if let Some(tolerance) = options.tolerance
        && !(tolerance > 0.0 && tolerance <= 1.0)
    {
        return Err(KeyError(format!(
            "tolerance must be above 0 and at most 1, not {tolerance}"
        )));
    }
    let border = border(picture);
    let key = match options.color {
        Some(color) => color.map(f32::from),
        None => border_colour(&border)?,
    };
    let tolerance = match options.tolerance {
        Some(tolerance) => tolerance * FULL,
        None => noise(&border, key),
    };

    // How far every pixel is from the key, and which are background.
    let distance: Vec<f32> = picture.pixels().map(|p| apart(rgb(p), key)).collect();
    let within: Vec<bool> = distance.iter().map(|d| *d <= tolerance).collect();
    let background = if options.contiguous {
        reached_from_border(&within, w, h)
    } else {
        within
    };
    if !background.iter().any(|b| *b) {
        return Err(KeyError(format!(
            "the picture has no {} to remove",
            hex(key.map(to_u8))
        )));
    }

    let reach = band(w.max(h));
    let near = beside(&background, w, h, reach);
    let mut image = picture.clone();
    for y in 0..h {
        for x in 0..w {
            let i = y * w + x;
            let pixel = image.get_pixel_mut(x as u32, y as u32);
            if background[i] {
                *pixel = Rgba([0, 0, 0, 0]);
            } else if near[i] {
                let seen = rgb(picture.get_pixel(x as u32, y as u32));
                let subject = purest(picture, &background, &distance, key, (x, y), reach + 2);
                let share = share_of(seen, subject, key);
                if share < WHOLE {
                    *pixel = unmixed(seen, subject, key, share, pixel[3]);
                }
            }
        }
    }
    Ok(Keyed {
        image,
        color: key.map(to_u8),
    })
}

/// A colour written `#rrggbb` or `rrggbb`.
pub fn parse_colour(text: &str) -> Option<[u8; 3]> {
    let digits = text.strip_prefix('#').unwrap_or(text);
    if digits.len() != 6 || !digits.is_ascii() {
        return None;
    }
    let channel = |at: usize| u8::from_str_radix(&digits[at..at + 2], 16).ok();
    Some([channel(0)?, channel(2)?, channel(4)?])
}

/// A colour as `#rrggbb`.
pub fn hex(colour: [u8; 3]) -> String {
    format!("#{:02x}{:02x}{:02x}", colour[0], colour[1], colour[2])
}

/// The opaque pixels of a ring one hundredth of the picture wide along its sides.
fn border(picture: &RgbaImage) -> Vec<[f32; 3]> {
    let (w, h) = picture.dimensions();
    let ring = (w.min(h) / 100).max(1);
    picture
        .enumerate_pixels()
        .filter(|(x, y, pixel)| {
            let at_side = *x < ring || *y < ring || *x >= w - ring || *y >= h - ring;
            at_side && pixel[3] >= 128
        })
        .map(|(_, _, pixel)| rgb(pixel))
        .collect()
}

/// The colour most of the border has: the middle value of each channel, then the average of
/// the border pixels near it. Fails when the border is not mostly one colour.
fn border_colour(border: &[[f32; 3]]) -> Result<[f32; 3], KeyError> {
    if border.is_empty() {
        return Err(KeyError(
            "the border of the picture is already transparent: there is no background colour \
             to find"
                .into(),
        ));
    }
    let middle: [f32; 3] = std::array::from_fn(|c| {
        let mut channel: Vec<f32> = border.iter().map(|p| p[c]).collect();
        channel.sort_by(f32::total_cmp);
        channel[channel.len() / 2]
    });
    let mut sum = [0.0_f32; 3];
    let mut count = 0_usize;
    for pixel in border.iter().filter(|p| apart(**p, middle) <= NEAR) {
        for (total, value) in sum.iter_mut().zip(pixel) {
            *total += value;
        }
        count += 1;
    }
    if (count as f32) < FLAT_SHARE * border.len() as f32 {
        return Err(KeyError(
            "the border of the picture is not one flat colour; pass the background colour to \
             remove, or use remove_background"
                .into(),
        ));
    }
    Ok(sum.map(|total| total / count as f32))
}

/// The tolerance a background needs: twice what nearly all of its border pixels are off the
/// key, and a little more; a clean background gets a narrow one.
fn noise(border: &[[f32; 3]], key: [f32; 3]) -> f32 {
    let mut off: Vec<f32> = border
        .iter()
        .map(|p| apart(*p, key))
        .filter(|d| *d <= NEAR)
        .collect();
    if off.is_empty() {
        // A key colour that is not on the border: nothing to measure.
        return 28.0;
    }
    off.sort_by(f32::total_cmp);
    let most = off[(off.len() * 98 / 100).min(off.len() - 1)];
    (most * 2.0 + 10.0).clamp(12.0, 64.0)
}

/// How far from the background a pixel can be and still be part of a smoothed edge.
fn band(longer: usize) -> usize {
    (longer / 250).clamp(3, 8)
}

/// The pixels of `within` that the border reaches through other pixels of `within`.
fn reached_from_border(within: &[bool], w: usize, h: usize) -> Vec<bool> {
    let mut reached = vec![false; within.len()];
    let mut open: Vec<usize> = Vec::new();
    let enter = |i: usize, reached: &mut Vec<bool>, open: &mut Vec<usize>| {
        if within[i] && !reached[i] {
            reached[i] = true;
            open.push(i);
        }
    };
    for x in 0..w {
        enter(x, &mut reached, &mut open);
        enter((h - 1) * w + x, &mut reached, &mut open);
    }
    for y in 0..h {
        enter(y * w, &mut reached, &mut open);
        enter(y * w + w - 1, &mut reached, &mut open);
    }
    while let Some(i) = open.pop() {
        let (x, y) = (i % w, i / w);
        if x > 0 {
            enter(i - 1, &mut reached, &mut open);
        }
        if x + 1 < w {
            enter(i + 1, &mut reached, &mut open);
        }
        if y > 0 {
            enter(i - w, &mut reached, &mut open);
        }
        if y + 1 < h {
            enter(i + w, &mut reached, &mut open);
        }
    }
    reached
}

/// The pixels that are not background but have background within `reach` pixels, in a square.
fn beside(background: &[bool], w: usize, h: usize, reach: usize) -> Vec<bool> {
    // Along the rows, then down the columns: is there background within `reach`?
    let mut across = vec![false; background.len()];
    for y in 0..h {
        let row = &background[y * w..(y + 1) * w];
        let mut count = row[..=reach.min(w - 1)].iter().filter(|b| **b).count();
        for x in 0..w {
            across[y * w + x] = count > 0;
            if x + reach + 1 < w && row[x + reach + 1] {
                count += 1;
            }
            if x >= reach && row[x - reach] {
                count -= 1;
            }
        }
    }
    let mut near = vec![false; background.len()];
    let mut counts = vec![0_usize; w];
    for y in 0..=reach.min(h - 1) {
        for x in 0..w {
            counts[x] += usize::from(across[y * w + x]);
        }
    }
    for y in 0..h {
        for x in 0..w {
            near[y * w + x] = counts[x] > 0 && !background[y * w + x];
        }
        if y + reach + 1 < h {
            for x in 0..w {
                counts[x] += usize::from(across[(y + reach + 1) * w + x]);
            }
        }
        if y >= reach {
            for x in 0..w {
                counts[x] -= usize::from(across[(y - reach) * w + x]);
            }
        }
    }
    near
}

/// The purest sample of the colour an edge pixel is a mix of: from the pixel, step by step to
/// the neighbour furthest from the key that lies in the same direction from it, for as long as
/// that is a real step further.
fn purest(
    picture: &RgbaImage,
    background: &[bool],
    distance: &[f32],
    key: [f32; 3],
    from: (usize, usize),
    steps: usize,
) -> [f32; 3] {
    let (w, h) = (picture.width() as usize, picture.height() as usize);
    let colour = |x: usize, y: usize| rgb(picture.get_pixel(x as u32, y as u32));
    // What lies under a pixel the picture came with as transparent is no sample of anything.
    let seen = |x: usize, y: usize| picture.get_pixel(x as u32, y as u32)[3] >= 128;
    let start = colour(from.0, from.1);
    let (mut x, mut y) = from;
    for _ in 0..steps {
        let here = distance[y * w + x];
        let mut best: Option<(usize, usize, f32)> = None;
        for ny in y.saturating_sub(1)..=(y + 1).min(h - 1) {
            for nx in x.saturating_sub(1)..=(x + 1).min(w - 1) {
                let i = ny * w + nx;
                let further = distance[i] > best.map_or(here + STEP, |(_, _, d)| d);
                let sample = further && !background[i] && seen(nx, ny);
                if sample && same_direction(start, colour(nx, ny), key) {
                    best = Some((nx, ny, distance[i]));
                }
            }
        }
        match best {
            Some((nx, ny, _)) => (x, y) = (nx, ny),
            None => break,
        }
    }
    colour(x, y)
}

/// Whether two colours lie in the same direction from the key: one can be the other, thinned.
fn same_direction(a: [f32; 3], b: [f32; 3], key: [f32; 3]) -> bool {
    let (va, vb) = (minus(a, key), minus(b, key));
    let lengths = (dot(va, va) * dot(vb, vb)).sqrt();
    lengths > 0.0 && dot(va, vb) / lengths >= SAME_DIRECTION
}

/// How much of `seen` is the subject, when it is a mix of the subject and the key.
fn share_of(seen: [f32; 3], subject: [f32; 3], key: [f32; 3]) -> f32 {
    let (to_seen, to_subject) = (minus(seen, key), minus(subject, key));
    let length = dot(to_subject, to_subject);
    if length < 1.0 {
        return 1.0;
    }
    (dot(to_seen, to_subject) / length).clamp(0.0, 1.0)
}

/// The edge pixel without the key in it: the colour that, laid over the key with `share`,
/// gives back what was seen.
fn unmixed(seen: [f32; 3], subject: [f32; 3], key: [f32; 3], share: f32, alpha: u8) -> Rgba<u8> {
    let level = to_u8(share * f32::from(alpha));
    if level == 0 {
        return Rgba([0, 0, 0, 0]);
    }
    let own: [u8; 3] = std::array::from_fn(|c| {
        // A sliver of the subject says little about its colour; the purer sample says more.
        if share < 0.08 {
            to_u8(subject[c])
        } else {
            to_u8(key[c] + (seen[c] - key[c]) / share)
        }
    });
    Rgba([own[0], own[1], own[2], level])
}

fn rgb(pixel: &Rgba<u8>) -> [f32; 3] {
    [
        f32::from(pixel[0]),
        f32::from(pixel[1]),
        f32::from(pixel[2]),
    ]
}

fn minus(a: [f32; 3], b: [f32; 3]) -> [f32; 3] {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

fn dot(a: [f32; 3], b: [f32; 3]) -> f32 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

/// The distance between two colours.
fn apart(a: [f32; 3], b: [f32; 3]) -> f32 {
    let d = minus(a, b);
    dot(d, d).sqrt()
}

fn to_u8(value: f32) -> u8 {
    #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
    let byte = value.round().clamp(0.0, 255.0) as u8;
    byte
}

#[cfg(test)]
mod tests {
    use super::*;

    type TestResult = std::result::Result<(), Box<dyn std::error::Error>>;

    const GREEN: [u8; 3] = [0, 255, 0];
    const RED: [u8; 3] = [200, 30, 40];

    /// How much of the pixel at (x, y) a disc covers, sampled sixteen times.
    fn coverage(x: u32, y: u32, centre: (f32, f32), radius: f32) -> f32 {
        let mut inside = 0;
        for sy in 0..4 {
            for sx in 0..4 {
                let px = x as f32 + (sx as f32 + 0.5) / 4.0 - centre.0;
                let py = y as f32 + (sy as f32 + 0.5) / 4.0 - centre.1;
                inside += u32::from(px * px + py * py <= radius * radius);
            }
        }
        inside as f32 / 16.0
    }

    /// A disc of `subject` on `back`, its outline smoothed as a renderer smooths it. Returns
    /// the picture and the true share of the disc in every pixel.
    fn disc(size: u32, subject: [u8; 3], back: [u8; 3]) -> (RgbaImage, Vec<f32>) {
        let centre = (size as f32 / 2.0 + 0.3, size as f32 / 2.0 - 0.2);
        let mut truth = Vec::new();
        let picture = RgbaImage::from_fn(size, size, |x, y| {
            let share = coverage(x, y, centre, size as f32 * 0.3);
            truth.push(share);
            let mix = |c: usize| {
                to_u8(f32::from(subject[c]) * share + f32::from(back[c]) * (1.0 - share))
            };
            Rgba([mix(0), mix(1), mix(2), 255])
        });
        (picture, truth)
    }

    /// The keyed picture laid over a flat colour.
    fn over(keyed: &RgbaImage, back: [u8; 3]) -> Vec<[u8; 3]> {
        keyed
            .pixels()
            .map(|p| {
                let a = f32::from(p[3]) / 255.0;
                std::array::from_fn(|c| to_u8(f32::from(p[c]) * a + f32::from(back[c]) * (1.0 - a)))
            })
            .collect()
    }

    #[test]
    fn the_background_goes_the_subject_stays_and_the_edge_has_no_fringe() -> TestResult {
        let (picture, truth) = disc(200, RED, GREEN);
        let keyed = chroma_key(&picture, &KeyOptions::default()).map_err(|e| e.0)?;
        assert_eq!(keyed.color, GREEN, "found from the border");
        assert_eq!(keyed.image.dimensions(), (200, 200));

        let mut edge = 0;
        for (pixel, (original, share)) in keyed.image.pixels().zip(picture.pixels().zip(&truth)) {
            if *share == 0.0 {
                assert_eq!(pixel, &Rgba([0, 0, 0, 0]), "the background is transparent");
            } else if *share == 1.0 {
                assert_eq!(pixel, original, "the subject is opaque and untouched");
            } else {
                edge += 1;
                // The alpha is the share of the disc in the pixel...
                let alpha = f32::from(pixel[3]) / 255.0;
                assert!(
                    (alpha - share).abs() < 0.07,
                    "alpha {alpha} for share {share}"
                );
                // ...and what is seen of the pixel is the disc's red, with no green in it.
                if pixel[3] > 24 {
                    for c in 0..3 {
                        let off = i32::from(pixel[c]) - i32::from(RED[c]);
                        assert!(off.abs() <= 12, "{pixel:?} at share {share}");
                    }
                }
            }
        }
        assert!(edge > 300, "the outline is smoothed: {edge} mixed pixels");

        // Laid over another colour, no pixel is greener than that colour and the disc are.
        let blue = [20, 40, 200];
        for (seen, share) in over(&keyed.image, blue).iter().zip(&truth) {
            let greenest = f32::from(RED[1]).max(f32::from(blue[1]));
            assert!(f32::from(seen[1]) <= greenest + 3.0, "{seen:?} at {share}");
        }
        // Laid over the key colour again, it is the original picture.
        for (seen, original) in over(&keyed.image, GREEN).iter().zip(picture.pixels()) {
            for c in 0..3 {
                assert!((i32::from(seen[c]) - i32::from(original[c])).abs() <= 3);
            }
        }
        Ok(())
    }

    #[test]
    fn a_white_background_with_noise_is_found_and_removed() -> TestResult {
        let (mut picture, truth) = disc(160, [30, 60, 160], [250, 250, 250]);
        // The unevenness of a compressed picture: a few levels up and down.
        for (i, pixel) in picture.pixels_mut().enumerate() {
            let wobble = [0_i16, 3, -2, 1, -4, 2][i % 6];
            for c in 0..3 {
                pixel[c] = u8::try_from((i16::from(pixel[c]) + wobble).clamp(0, 255))?;
            }
        }
        let keyed = chroma_key(&picture, &KeyOptions::default()).map_err(|e| e.0)?;
        for c in 0..3 {
            assert!(keyed.color[c] >= 247, "{:?}", keyed.color);
        }
        for (pixel, share) in keyed.image.pixels().zip(&truth) {
            if *share == 0.0 {
                assert_eq!(pixel[3], 0);
            } else if *share == 1.0 {
                assert_eq!(pixel[3], 255);
            }
        }
        // On a dark slide the disc has no pale rim.
        for (seen, share) in over(&keyed.image, [10, 10, 10]).iter().zip(&truth) {
            if *share > 0.0 && *share < 1.0 {
                assert!(seen[0] <= 60 && seen[1] <= 90, "{seen:?} at share {share}");
            }
        }
        Ok(())
    }

    #[test]
    fn the_key_colour_inside_the_subject_goes_too_unless_only_the_outside_is_asked_for()
    -> TestResult {
        // A red ring: green outside it and green in its hole.
        let size = 120_u32;
        let centre = (60.0, 60.0);
        let picture = RgbaImage::from_fn(size, size, |x, y| {
            let share = coverage(x, y, centre, 40.0) - coverage(x, y, centre, 15.0);
            let mix =
                |c: usize| to_u8(f32::from(RED[c]) * share + f32::from(GREEN[c]) * (1.0 - share));
            Rgba([mix(0), mix(1), mix(2), 255])
        });
        let everywhere = chroma_key(&picture, &KeyOptions::default()).map_err(|e| e.0)?;
        assert_eq!(
            everywhere.image.get_pixel(60, 60)[3],
            0,
            "the hole is keyed out"
        );
        assert_eq!(everywhere.image.get_pixel(2, 2)[3], 0);
        assert_eq!(everywhere.image.get_pixel(60, 30)[3], 255, "the ring stays");

        let outside = KeyOptions {
            contiguous: true,
            ..KeyOptions::default()
        };
        let outside = chroma_key(&picture, &outside).map_err(|e| e.0)?;
        assert_eq!(outside.image.get_pixel(60, 60), &Rgba([0, 255, 0, 255]));
        assert_eq!(outside.image.get_pixel(2, 2)[3], 0);
        // The inner outline, which touches no removed background, is as it was.
        assert_eq!(outside.image.get_pixel(60, 45), picture.get_pixel(60, 45));
        Ok(())
    }

    #[test]
    fn a_given_colour_and_tolerance_are_used_as_given() -> TestResult {
        // Two flat halves; the border is half of each, so no colour is found...
        let picture = RgbaImage::from_fn(60, 40, |x, _| {
            if x < 30 {
                Rgba([240, 240, 240, 255])
            } else {
                Rgba([40, 40, 200, 255])
            }
        });
        let found = chroma_key(&picture, &KeyOptions::default());
        assert!(found.is_err_and(|e| e.0.contains("not one flat colour")));
        // ...but a given one is removed.
        let given = KeyOptions {
            color: Some([255, 255, 255]),
            tolerance: Some(0.1),
            contiguous: false,
        };
        let keyed = chroma_key(&picture, &given).map_err(|e| e.0)?;
        assert_eq!(keyed.color, [255, 255, 255]);
        assert_eq!(keyed.image.get_pixel(10, 20)[3], 0, "26 away, 44 allowed");
        assert_eq!(keyed.image.get_pixel(50, 20), &Rgba([40, 40, 200, 255]));
        // A tolerance too narrow for this background leaves it.
        let narrow = KeyOptions {
            tolerance: Some(0.02),
            ..given
        };
        let none = chroma_key(&picture, &narrow);
        assert!(none.is_err_and(|e| e.0.contains("no #ffffff to remove")));
        for tolerance in [0.0, -0.5, 1.5, f32::NAN] {
            let bad = KeyOptions {
                tolerance: Some(tolerance),
                ..given
            };
            assert!(chroma_key(&picture, &bad).is_err(), "{tolerance}");
        }
        Ok(())
    }

    #[test]
    fn a_thin_line_keeps_its_colour() -> TestResult {
        // A black line three pixels wide with soft sides, on white: all of it is near the
        // background, so there is no solid inside to read the colour from.
        let picture = RgbaImage::from_fn(80, 40, |_, y| {
            let level = match y {
                19 | 21 => 100,
                20 => 0,
                _ => 255,
            };
            Rgba([level, level, level, 255])
        });
        let keyed = chroma_key(&picture, &KeyOptions::default()).map_err(|e| e.0)?;
        assert_eq!(keyed.image.get_pixel(40, 20), &Rgba([0, 0, 0, 255]));
        let side = keyed.image.get_pixel(40, 19);
        assert!(side[0] <= 6 && (150..=160).contains(&side[3]), "{side:?}");
        assert_eq!(keyed.image.get_pixel(40, 10)[3], 0);
        Ok(())
    }

    #[test]
    fn transparency_the_picture_came_with_is_kept_and_not_read_as_background() -> TestResult {
        let (mut picture, _) = disc(100, RED, GREEN);
        // The top rows are transparent already, with black under them.
        for x in 0..100 {
            for y in 0..3 {
                picture.put_pixel(x, y, Rgba([0, 0, 0, 0]));
            }
        }
        let keyed = chroma_key(&picture, &KeyOptions::default()).map_err(|e| e.0)?;
        assert_eq!(keyed.color, GREEN, "the transparent rows did not vote");
        assert_eq!(keyed.image.get_pixel(50, 1)[3], 0);
        assert_eq!(keyed.image.get_pixel(50, 50), &Rgba([200, 30, 40, 255]));

        let clear = RgbaImage::from_pixel(20, 20, Rgba([0, 0, 0, 0]));
        let nothing = chroma_key(&clear, &KeyOptions::default());
        assert!(nothing.is_err_and(|e| e.0.contains("already transparent")));
        let tiny = RgbaImage::from_pixel(2, 2, Rgba([0, 255, 0, 255]));
        assert!(chroma_key(&tiny, &KeyOptions::default()).is_err());
        Ok(())
    }

    #[test]
    fn colours_are_read_and_written_as_hex() {
        assert_eq!(parse_colour("#00ff7F"), Some([0, 255, 127]));
        assert_eq!(parse_colour("FFFFFF"), Some([255, 255, 255]));
        for bad in ["", "#fff", "#gggggg", "#00ff7f00", "green", "#ééé"] {
            assert_eq!(parse_colour(bad), None, "{bad}");
        }
        assert_eq!(hex([0, 255, 127]), "#00ff7f");
    }
}
