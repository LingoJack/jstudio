//! Markdown import helpers — recursive directory scan.

use std::fs;
use std::path::Path;

/// Recursively list all Markdown files inside `dir`, returning their absolute
/// paths and their path relative to `dir` (using `/` separators).
///
/// Each entry also records whether it is a directory. This lets the frontend
/// recreate the folder hierarchy before importing the documents.
///
/// # Arguments
/// * `dir` — absolute path to the directory to scan.
pub fn list_markdown_files(dir: String) -> Result<Vec<MarkdownEntry>, String> {
    let root = Path::new(&dir);
    if !root.is_dir() {
        return Err(format!("not a directory: {dir}"));
    }

    let mut entries = Vec::new();
    collect_markdown(root, root, &mut entries)?;
    // Sort by relative path so that directories always appear before the files
    // they contain — the frontend relies on this to create folders first.
    entries.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
    Ok(entries)
}

/// A single entry returned by [`list_markdown_files`].
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownEntry {
    /// Absolute filesystem path.
    pub path: String,
    /// Path relative to the scanned root, using `/` as separator.
    pub relative_path: String,
    /// `true` for directories, `false` for files.
    pub is_dir: bool,
}

/// Recursive helper for [`list_markdown_files`].
fn collect_markdown(
    root: &Path,
    current: &Path,
    out: &mut Vec<MarkdownEntry>,
) -> Result<(), String> {
    let rd = fs::read_dir(current)
        .map_err(|e| format!("failed to read dir {}: {e}", current.display()))?;

    for entry in rd {
        let entry = entry.map_err(|e| format!("dir entry error: {e}"))?;
        let path = entry.path();
        // Skip hidden files/directories (dotfiles like .git, .DS_Store, …)
        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            if name.starts_with('.') {
                continue;
            }
        }

        let rel = path
            .strip_prefix(root)
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .replace('\\', "/");

        if path.is_dir() {
            out.push(MarkdownEntry {
                path: path.to_string_lossy().into_owned(),
                relative_path: rel,
                is_dir: true,
            });
            collect_markdown(root, &path, out)?;
        } else if is_markdown(&path) {
            out.push(MarkdownEntry {
                path: path.to_string_lossy().into_owned(),
                relative_path: rel,
                is_dir: false,
            });
        }
    }
    Ok(())
}

/// Returns `true` if the file extension looks like Markdown.
fn is_markdown(path: &Path) -> bool {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .as_deref()
    {
        Some("md") | Some("markdown") | Some("mdown") => true,
        _ => false,
    }
}
