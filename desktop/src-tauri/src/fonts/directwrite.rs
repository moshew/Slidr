//! The system font collection of DirectWrite. It is the collection the webview draws text
//! from, so a family listed here is a name CSS finds. COM calls in windows-rs are `unsafe`; this
//! file and `capture::webview2` are the two places the app allows it.

use windows::{
    Win32::Graphics::DirectWrite::{
        DWRITE_FACTORY_TYPE_SHARED, DWRITE_FONT_SIMULATIONS_NONE, DWRITE_FONT_STRETCH_NORMAL,
        DWRITE_FONT_STYLE_NORMAL, DWRITE_FONT_WEIGHT_NORMAL, DWriteCreateFactory, IDWriteFactory,
        IDWriteFontFamily, IDWriteLocalizedStrings,
    },
    core::{BOOL, Result, w},
};

use super::SystemFont;

/// The first letter of the Hebrew alphabet: a font with Hebrew has it.
const ALEF: u32 = 0x05D0;

/// Every family of the system collection, in the collection's order.
pub(super) fn families() -> Result<Vec<SystemFont>> {
    // SAFETY: DirectWrite objects are free-threaded and need no COM apartment, so they may be
    // made and used on a worker thread. `collection` outlives the call that fills it, and each
    // interface is a counted reference that lives until its wrapper is dropped.
    let collection = unsafe {
        let factory: IDWriteFactory = DWriteCreateFactory(DWRITE_FACTORY_TYPE_SHARED)?;
        let mut collection = None;
        factory.GetSystemFontCollection(&mut collection, false)?;
        collection
    };
    let Some(collection) = collection else {
        return Ok(Vec::new());
    };
    let mut fonts = Vec::new();
    // SAFETY: `collection` is live, and an index below its count is one it has.
    for index in 0..unsafe { collection.GetFontFamilyCount() } {
        // A family that cannot be read (a damaged file) is left out; the rest are listed.
        // SAFETY: as above.
        if let Ok(font) = unsafe { collection.GetFontFamily(index) }.and_then(|f| family(&f)) {
            fonts.push(font);
        }
    }
    Ok(fonts)
}

fn family(family: &IDWriteFontFamily) -> Result<SystemFont> {
    // SAFETY: `family` is a live interface, and so is every interface it hands out.
    unsafe {
        let name = english(&family.GetFamilyNames()?)?;
        // The face that plain text is set in stands for the family.
        let regular = family.GetFirstMatchingFont(
            DWRITE_FONT_WEIGHT_NORMAL,
            DWRITE_FONT_STRETCH_NORMAL,
            DWRITE_FONT_STYLE_NORMAL,
        )?;
        Ok(SystemFont {
            family: name,
            hebrew: regular.HasCharacter(ALEF)?.as_bool(),
            symbol: regular.IsSymbolFont().as_bool(),
            weights: weights(family),
        })
    }
}

/// The weights of the faces a family has, ascending, each once. A face DirectWrite would only
/// simulate (a bold made by thickening the regular one) is not a face of the family.
fn weights(family: &IDWriteFontFamily) -> Vec<u16> {
    let mut weights = Vec::new();
    // SAFETY: `family` is a live interface, and an index below its count is a font it has.
    unsafe {
        for index in 0..family.GetFontCount() {
            // A face that cannot be read is left out; the rest are listed.
            let Ok(font) = family.GetFont(index) else {
                continue;
            };
            if font.GetSimulations() != DWRITE_FONT_SIMULATIONS_NONE {
                continue;
            }
            if let Ok(weight) = u16::try_from(font.GetWeight().0) {
                weights.push(weight);
            }
        }
    }
    weights.sort_unstable();
    weights.dedup();
    weights
}

/// The English name of a family, which is the one decks and CSS use; a font that has none
/// gives the first name it has.
fn english(names: &IDWriteLocalizedStrings) -> Result<String> {
    // SAFETY: `names` is a live interface. `index` and `found` outlive the call that writes
    // them, and `text` is as long as `GetString` is told: the string and its terminator.
    unsafe {
        let mut index = 0;
        let mut found = BOOL(0);
        names.FindLocaleName(w!("en-us"), &mut index, &mut found)?;
        if !found.as_bool() {
            index = 0;
        }
        let length = names.GetStringLength(index)? as usize;
        let mut text = vec![0u16; length + 1];
        names.GetString(index, &mut text)?;
        Ok(String::from_utf16_lossy(&text[..length]))
    }
}
