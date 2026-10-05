//! The fonts installed on this computer, which the font picker offers after the built-in
//! library (SPEC appendix B). A deck names a font by its family, and the webview finds an
//! installed font by that name on its own; this module only says which names there are.

use serde::Serialize;

use crate::error::{AppError, Result};

#[cfg(windows)]
// COM calls into DirectWrite: one of the app's three places for `unsafe`, with
// `capture/webview2.rs` and `import_window/network.rs`.
#[allow(unsafe_code)]
mod directwrite;

/// One installed font family.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemFont {
    /// The family name, as CSS finds it.
    pub family: String,
    /// The regular face has Hebrew letters.
    pub hebrew: bool,
    /// A symbol font (Wingdings): it draws pictures in place of letters, those of its own name
    /// too.
    pub symbol: bool,
}

/// `fonts_system()`: the installed font families, by name. Empty on a system this module
/// cannot ask (anything but Windows).
#[tauri::command]
pub async fn fonts_system() -> Result<Vec<SystemFont>> {
    // Hundreds of font files are opened to look for a Hebrew letter: not on the main thread.
    tauri::async_runtime::spawn_blocking(installed)
        .await
        .map_err(AppError::internal)?
}

fn installed() -> Result<Vec<SystemFont>> {
    #[cfg(windows)]
    let fonts = directwrite::families()
        .map_err(|e| AppError::internal(format!("could not list the installed fonts: {e}")))?;
    #[cfg(not(windows))]
    let fonts = Vec::new();
    Ok(listed(fonts))
}

/// In the order a person reads a list of names, each name once.
fn listed(mut fonts: Vec<SystemFont>) -> Vec<SystemFont> {
    fonts.retain(|font| !font.family.trim().is_empty());
    fonts.sort_by(|a, b| {
        let by_name = a.family.to_lowercase().cmp(&b.family.to_lowercase());
        by_name.then_with(|| a.family.cmp(&b.family))
    });
    fonts.dedup_by(|a, b| a.family == b.family);
    fonts
}

#[cfg(test)]
mod tests {
    use super::{SystemFont, listed};

    fn font(family: &str) -> SystemFont {
        SystemFont {
            family: family.into(),
            hebrew: false,
            symbol: false,
        }
    }

    #[test]
    fn lists_each_name_once_in_reading_order() {
        let fonts = listed(vec![
            font("Verdana"),
            font("arial nova"),
            font(""),
            font("Arial"),
            font("Verdana"),
            font("David"),
        ]);
        let names: Vec<_> = fonts.iter().map(|f| f.family.as_str()).collect();
        assert_eq!(names, ["Arial", "arial nova", "David", "Verdana"]);
    }

    #[test]
    fn crosses_ipc_in_camel_case() {
        let json = serde_json::to_value(SystemFont {
            family: "David".into(),
            hebrew: true,
            symbol: false,
        })
        .expect("a font is plain data");
        assert_eq!(
            json,
            serde_json::json!({ "family": "David", "hebrew": true, "symbol": false })
        );
    }

    /// The fonts every Windows has: enough to see that the list is the real one, with names CSS
    /// knows, and that the two marks are read from the fonts.
    #[cfg(windows)]
    #[test]
    fn reads_the_fonts_of_windows() {
        let fonts = super::installed().expect("DirectWrite lists the system fonts");
        let find = |name: &str| fonts.iter().find(|f| f.family == name);

        let arial = find("Arial").expect("Arial is installed");
        assert!(arial.hebrew, "Arial has Hebrew letters");
        assert!(!arial.symbol);

        let consolas = find("Consolas").expect("Consolas is installed");
        assert!(!consolas.hebrew, "Consolas has no Hebrew letters");

        let wingdings = find("Wingdings").expect("Wingdings is installed");
        assert!(wingdings.symbol);
        assert!(!wingdings.hebrew);

        assert!(fonts.len() > 20, "only {} families", fonts.len());
        let mut names: Vec<_> = fonts.iter().map(|f| f.family.to_lowercase()).collect();
        assert!(names.is_sorted(), "the list is in reading order");
        names.dedup();
        assert_eq!(names.len(), fonts.len(), "a name is listed once");
    }
}
