use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

// ────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct JcliStatus {
    /// Whether `j` is available on the system PATH.
    pub installed: bool,
    /// Version string reported by `j --version` (e.g. "j 12.11.5").
    pub version: Option<String>,
    /// Absolute path to the resolved binary, if found.
    pub path: Option<String>,
    /// Whether the bundled version embedded in JStudio is available.
    pub bundled: bool,
    /// Version of the bundled binary, if extractable.
    pub bundled_version: Option<String>,
}

// ────────────────────────────────────────────────
// Path helpers
// ────────────────────────────────────────────────

/// `~/.jdata/bin/` — the canonical install location for the bundled j.
fn jdata_bin_dir() -> PathBuf {
    crate::commands::storage::paths::jdata_dir().join("bin")
}

/// `~/.jdata/bin/j` (macOS/Linux) or `j.exe` (Windows).
fn jdata_bin_path() -> PathBuf {
    let mut p = jdata_bin_dir();
    if cfg!(windows) {
        p.push("j.exe");
    } else {
        p.push("j");
    }
    p
}

/// The symlink target: `/usr/local/bin/j` (Unix) or equivalent.
fn global_link_path() -> PathBuf {
    if cfg!(windows) {
        // On Windows there's no single "global bin". We skip global linking
        // and rely on `~/.jdata/bin` being added to PATH (user-side action).
        jdata_bin_path()
    } else {
        PathBuf::from("/usr/local/bin/j")
    }
}

/// Locate the `j` binary bundled inside the app resources.
///
/// The caller supplies the resource dir (Tauri:
/// `app.path().resource_dir()`; Electron sidecar: `JSTUDIO_RESOURCE_DIR`
/// env, set by Electron main from `process.resourcesPath`).
pub fn bundled_j_path_impl(resource_dir: Option<PathBuf>) -> Option<PathBuf> {
    let bin_name = if cfg!(windows) { "j.exe" } else { "j" };

    // Candidate 0: JSTUDIO_RESOURCE_DIR env (Electron sidecar in production).
    if let Ok(dir) = std::env::var("JSTUDIO_RESOURCE_DIR") {
        let candidate = PathBuf::from(dir).join("bin").join(bin_name);
        if candidate.exists() {
            return Some(candidate);
        }
    }

    // Candidate 1: <resource_dir>/bin/j  (production)
    if let Some(dir) = resource_dir {
        let candidate = dir.join("bin").join(bin_name);
        if candidate.exists() {
            return Some(candidate);
        }
    }

    // Candidate 2: <manifest_dir>/resources/bin/j  (dev mode — the build script
    // stages the binary here). CARGO_MANIFEST_DIR is the src-tauri/ directory,
    // compiled in at build time.
    let manifest_dir = option_env!("CARGO_MANIFEST_DIR");
    if let Some(manifest) = manifest_dir {
        let candidate = PathBuf::from(manifest)
            .join("resources")
            .join("bin")
            .join(bin_name);
        if candidate.exists() {
            return Some(candidate);
        }
    }

    None
}

// ────────────────────────────────────────────────
// Internal utilities
// ────────────────────────────────────────────────

/// Try to get the version string from a `j` binary path.
///
/// `j` uses `j version` (subcommand) to display version info, not `j --version`.
/// We try both for compatibility with other CLI tools that use `--version`.
fn get_version(binary: &PathBuf) -> Option<String> {
    // Try `j version` first — this is the canonical command for j-cli
    let output = Command::new(binary).arg("version").output().ok()?;
    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let trimmed = stdout.trim();
        if !trimmed.is_empty() {
            // Parse the kernel version from the table output.
            // Format: "│ kernel   │ 12.11.5                            │"
            return extract_kernel_version(trimmed);
        }
    }

    // Fallback: try `--version` (common for many CLI tools)
    let output = Command::new(binary).arg("--version").output().ok()?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let trimmed = stdout.trim();
    if trimmed.is_empty() {
        // Some versions print to stderr
        let stderr = String::from_utf8_lossy(&output.stderr);
        let s = stderr.trim();
        if !s.is_empty() {
            return Some(s.to_string());
        }
        return None;
    }
    Some(trimmed.to_string())
}

/// Extract the kernel version from `j version` table output.
///
/// The output format is a Unicode table like:
/// ```text
/// │ kernel   │ 12.11.5                            │
/// ```
/// The raw output may contain ANSI escape codes which must be stripped
/// before parsing.
fn extract_kernel_version(table: &str) -> Option<String> {
    // Find the line containing "kernel"
    for line in table.lines() {
        if line.contains("kernel") {
            // Strip ANSI escape codes before splitting
            let clean = strip_ansi_escapes(line);
            // Split by "│" (Unicode box-drawing character)
            let parts: Vec<&str> = clean.split('│').collect();
            // parts[0] = "", parts[1] = " kernel   ", parts[2] = " 12.11.5  "
            if parts.len() >= 3 {
                let value = parts[2].trim();
                if !value.is_empty() {
                    return Some(value.to_string());
                }
            }
        }
    }
    None
}

/// Strip ANSI escape sequences from a string.
/// Handles CSI sequences like `\x1b[0m`, `\x1b[39m`, `\x1b[1;32m`, etc.
fn strip_ansi_escapes(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut chars = s.char_indices().peekable();
    while let Some((_, ch)) = chars.next() {
        if ch == '\x1b' {
            // Check for CSI sequence: ESC [ ... (m | letter)
            if let Some(&(_, next)) = chars.peek()
                && next == '['
            {
                // Skip ESC and '['
                chars.next();
                // Skip until we find the terminating byte (0x40..=0x7E)
                while let Some(&(_, c)) = chars.peek() {
                    chars.next();
                    if ('\x40'..='\x7e').contains(&c) {
                        break;
                    }
                }
                continue;
            }
        }
        result.push(ch);
    }
    result
}

/// Check the current `j` status on the system PATH.
///
/// On macOS, GUI apps inherit a minimal PATH from launchd that typically
/// lacks `/usr/local/bin`, `/opt/homebrew/bin`, etc.  So after the normal
/// PATH lookup fails, we also probe well-known install locations directly.
fn check_system_j() -> (bool, Option<String>, Option<String>) {
    let bin = if cfg!(windows) { "j.exe" } else { "j" };

    // Try `which j` equivalent: run `j --version` directly.
    let output = Command::new(bin).arg("--version").output();
    match output {
        Ok(out) if out.status.success() => {
            let v = String::from_utf8_lossy(&out.stdout).trim().to_string();
            let version = if v.is_empty() { None } else { Some(v) };
            // Best-effort path resolution via `which`
            let path = which_j();
            (true, version, path)
        }
        _ => {
            // PATH lookup failed — probe well-known locations.
            check_j_at_known_locations()
        }
    }
}

/// Probe well-known locations where `j` may be installed.
///
/// This is needed because macOS GUI apps (including Tauri) inherit a
/// minimal PATH from launchd that typically does **not** include
/// `/usr/local/bin` or `/opt/homebrew/bin`.
fn check_j_at_known_locations() -> (bool, Option<String>, Option<String>) {
    let candidates: Vec<PathBuf> = {
        let mut list = vec![];

        // ~/.jdata/bin/j — our own install target
        list.push(jdata_bin_path());

        // /usr/local/bin/j — traditional Unix global bin
        #[cfg(unix)]
        list.push(PathBuf::from("/usr/local/bin/j"));

        // /opt/homebrew/bin/j — Apple Silicon Homebrew
        #[cfg(target_os = "macos")]
        list.push(PathBuf::from("/opt/homebrew/bin/j"));

        // $HOME/.local/bin/j — user-local bin (XDG-style)
        if let Some(home) = std::env::var_os("HOME") {
            list.push(PathBuf::from(home).join(".local/bin/j"));
        }

        list
    };

    for candidate in candidates {
        if !candidate.exists() {
            continue;
        }
        if let Some(version) = get_version(&candidate) {
            let path_str = candidate.to_string_lossy().to_string();
            // Even though we found it at a known location, report as installed
            // so the UI shows the correct status.
            return (true, Some(version), Some(path_str));
        }
        // Binary exists but --version returned nothing — still installed
        let path_str = candidate.to_string_lossy().to_string();
        return (true, None, Some(path_str));
    }

    (false, None, None)
}

/// Try to resolve the absolute path of `j` on the current system.
fn which_j() -> Option<String> {
    if cfg!(windows) {
        let out = Command::new("where").args(["j"]).output().ok()?;
        String::from_utf8_lossy(&out.stdout)
            .lines()
            .next()
            .map(|s| s.to_string())
    } else {
        let out = Command::new("which").arg("j").output().ok()?;
        if out.status.success() {
            Some(String::from_utf8_lossy(&out.stdout).trim().to_string())
        } else {
            None
        }
    }
}

// ────────────────────────────────────────────────
// Tauri Commands
// ────────────────────────────────────────────────

/// Check the current installation status of jcli.
pub fn check_jcli() -> Result<JcliStatus, String> {
    check_jcli_impl(None)
}

/// Implementation: the caller supplies the resource dir (Electron sidecar:
/// `JSTUDIO_RESOURCE_DIR` env, set by Electron main from
/// `process.resourcesPath`; dev: manifest-dir fallback).
pub fn check_jcli_impl(resource_dir: Option<PathBuf>) -> Result<JcliStatus, String> {
    let (installed, version, path) = check_system_j();

    let bundled_j = bundled_j_path_impl(resource_dir);
    let (bundled, bundled_version) = match &bundled_j {
        Some(p) => (true, get_version(p)),
        None => (false, None),
    };

    Ok(JcliStatus {
        installed,
        version,
        path,
        bundled,
        bundled_version,
    })
}

/// Install the bundled jcli: copy to `~/.jdata/bin/j`, then symlink to
/// `/usr/local/bin/j`.
///
/// On macOS/Linux the symlink may require administrator privileges. We first
/// try a direct `ln -sf`; if that fails we fall back to `osascript` to prompt
/// the user for their password.
pub fn install_jcli() -> Result<String, String> {
    install_jcli_impl(None)
}

/// Implementation: the caller supplies the resource dir (see `check_jcli`).
pub fn install_jcli_impl(resource_dir: Option<PathBuf>) -> Result<String, String> {
    // 1. Locate bundled binary
    let bundled = bundled_j_path_impl(resource_dir).ok_or_else(|| {
        "Bundled jcli binary not found. The app may have been built without \
         embedding it."
            .to_string()
    })?;

    // 2. Ensure ~/.jdata/bin/ exists
    let bin_dir = jdata_bin_dir();
    fs::create_dir_all(&bin_dir)
        .map_err(|e| format!("Failed to create {}: {}", bin_dir.display(), e))?;

    // 3. Copy bundled binary → ~/.jdata/bin/j
    let dest = jdata_bin_path();
    fs::copy(&bundled, &dest).map_err(|e| format!("Failed to copy binary: {}", e))?;

    // Make executable (Unix)
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(&dest)
            .map_err(|e| e.to_string())?
            .permissions();
        perms.set_mode(0o755);
        fs::set_permissions(&dest, perms).map_err(|e| e.to_string())?;
    }

    // 4. Create symlink to global PATH
    if !cfg!(windows) {
        let link = global_link_path();

        // If /usr/local/bin/j already exists and is our symlink, refresh it.
        let _ = fs::remove_file(&link);

        // Attempt direct symlink (works if user has write access)
        #[cfg(unix)]
        {
            use std::os::unix::fs::symlink;
            match symlink(&dest, &link) {
                Ok(()) => {}
                Err(_) => {
                    // Fall back to osascript with administrator privileges (macOS)
                    #[cfg(target_os = "macos")]
                    {
                        run_osascript_symlink(&dest, &link)?;
                    }
                    #[cfg(not(target_os = "macos"))]
                    {
                        return Err(format!(
                            "Failed to create symlink at {}. The j binary has been \
                             copied to {} — please add it to your PATH manually or run: \
                             `sudo ln -sf {} {}`",
                            link.display(),
                            dest.display(),
                            dest.display(),
                            link.display()
                        ));
                    }
                }
            }
        }

        return Ok(format!(
            "jcli installed to {} and linked to {}",
            dest.display(),
            link.display()
        ));
    }

    Ok(format!(
        "jcli installed to {}. Please add {} to your PATH.",
        dest.display(),
        bin_dir.display()
    ))
}

/// Uninstall jcli: remove the symlink and the binary from `~/.jdata/bin/`.
pub fn uninstall_jcli() -> Result<(), String> {
    // Remove global symlink
    let link = global_link_path();
    if link.exists() || link.is_symlink() {
        // Attempt direct removal (works if user has write access)
        if let Err(e) = fs::remove_file(&link) {
            // On macOS, fall back to osascript with administrator privileges
            #[cfg(target_os = "macos")]
            {
                let _ = e; // error detail unused — we retry via osascript
                run_osascript_unlink(&link)?;
            }
            #[cfg(not(target_os = "macos"))]
            {
                return Err(format!(
                    "Failed to remove {}: {}. Please run: `sudo rm -f {}`",
                    link.display(),
                    e,
                    link.display()
                ));
            }
        }
    }

    // Remove ~/.jdata/bin/j
    let dest = jdata_bin_path();
    if dest.exists() {
        fs::remove_file(&dest)
            .map_err(|e| format!("Failed to remove {}: {}", dest.display(), e))?;
    }

    Ok(())
}

// ────────────────────────────────────────────────
// macOS osascript helper
// ────────────────────────────────────────────────

#[cfg(target_os = "macos")]
fn run_osascript_unlink(link: &Path) -> Result<(), String> {
    let script = format!(
        "do shell script \"rm -f '{}'\" with administrator privileges",
        link.display()
    );

    let output = Command::new("osascript")
        .args(["-e", &script])
        .output()
        .map_err(|e| format!("Failed to invoke osascript: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("User canceled") || stderr.contains("-128") {
            return Err("Uninstall cancelled by user.".to_string());
        }
        return Err(format!(
            "Failed to remove symlink with administrator privileges: {}",
            stderr.trim()
        ));
    }

    Ok(())
}

#[cfg(target_os = "macos")]
fn run_osascript_symlink(dest: &Path, link: &Path) -> Result<(), String> {
    let script = format!(
        "do shell script \"mkdir -p /usr/local/bin && ln -sf '{}' '{}'\" \
         with administrator privileges",
        dest.display(),
        link.display()
    );

    let output = Command::new("osascript")
        .args(["-e", &script])
        .output()
        .map_err(|e| format!("Failed to invoke osascript: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // User cancelled or wrong password
        if stderr.contains("User canceled") || stderr.contains("-128") {
            return Err("Installation cancelled by user.".to_string());
        }
        return Err(format!(
            "Failed to create symlink with administrator privileges: {}",
            stderr.trim()
        ));
    }

    Ok(())
}
