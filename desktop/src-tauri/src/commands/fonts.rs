//! System font enumeration for the settings font pickers.
//!
//! The editor is rendered with a CSS `font-family` stack, so the renderer
//! only ever needs *family names* — never file paths. Enumeration lives
//! here (sidecar) rather than in the renderer because Electron's Chromium
//! disables the Local Font Access API (`navigator.fonts`).

/// Every font family installed on this machine, sorted and de-duplicated.
///
/// Family names starting with `.` are private macOS faces (`.SF NS Mono`,
/// `.Hiragino Sans GB Interface`, …) — they are not user-selectable, so
/// they are filtered out.
///
/// Only macOS is implemented; other platforms return an empty list, which
/// the settings UI treats as "nothing extra to show".
pub fn list_system_fonts() -> Result<Vec<String>, String> {
    #[cfg(target_os = "macos")]
    {
        use core_text::font_manager::copy_available_font_family_names;

        let families = copy_available_font_family_names();
        let mut names: Vec<String> = families
            .iter()
            .map(|name| name.to_string())
            .filter(|name| !name.starts_with('.'))
            .collect();
        names.sort();
        names.dedup();
        Ok(names)
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(Vec::new())
    }
}
