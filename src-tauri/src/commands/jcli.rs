use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use tauri::{AppHandle, Manager};

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
/// In production (bundled app), the binary is at `<resource_dir>/bin/j`.
/// In dev mode (`tauri dev`), resources are unpacked to various locations
/// depending on the platform, so we check multiple candidates.
fn bundled_j_path(app: &AppHandle) -> Option<PathBuf> {
    let bin_name = if cfg!(windows) { "j.exe" } else { "j" };

    // Candidate 1: <resource_dir>/bin/j  (production)
    if let Ok(resource_dir) = app.path().resource_dir() {
        let candidate = resource_dir.join("bin").join(bin_name);
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
fn get_version(binary: &PathBuf) -> Option<String> {
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

/// Check the current `j` status on the system PATH.
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
        _ => (false, None, None),
    }
}

/// Try to resolve the absolute path of `j` on the current system.
fn which_j() -> Option<String> {
    let cmd = if cfg!(windows) {
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
    };
    cmd
}

// ────────────────────────────────────────────────
// Tauri Commands
// ────────────────────────────────────────────────

/// Check the current installation status of jcli.
#[tauri::command]
pub fn check_jcli(app: AppHandle) -> Result<JcliStatus, String> {
    let (installed, version, path) = check_system_j();

    let bundled_j = bundled_j_path(&app);
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
#[tauri::command]
pub fn install_jcli(app: AppHandle) -> Result<String, String> {
    // 1. Locate bundled binary
    let bundled = bundled_j_path(&app).ok_or_else(|| {
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
#[tauri::command]
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
fn run_osascript_unlink(link: &PathBuf) -> Result<(), String> {
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
fn run_osascript_symlink(dest: &PathBuf, link: &PathBuf) -> Result<(), String> {
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
