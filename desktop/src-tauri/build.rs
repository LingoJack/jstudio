use std::env;
use std::path::PathBuf;

const CARGO_MANIFEST_DIR: &str = "CARGO_MANIFEST_DIR";

fn main() {
    // Best-effort: stage the bundled `j` binary into resources/bin/ so the
    // Electron packaging (electron-builder extraResources) can ship it.
    if let Err(e) = stage_bundled_j() {
        println!("cargo:warning=[jcli-bundle] Skipping bundled j: {}", e);
    }

    // Inject the git commit hash at build time so the frontend can display it
    // (About page + Debug section). `cargo:rustc-env` makes it available as an
    // env var at compile time via `env!("JSTUDIO_BUILD_COMMIT")`.
    inject_build_commit();

    // Tell Cargo to re-run this script when the staged binary changes.
    println!(
        "cargo:rerun-if-changed={}",
        resources_bin_dir().join(j_binary_name()).display()
    );
}

/// The binary name for the current target platform.
fn j_binary_name() -> &'static str {
    if env::var_os("CARGO_CFG_WINDOWS").is_some() {
        "j.exe"
    } else {
        "j"
    }
}

/// `src-tauri/resources/bin/`
fn resources_bin_dir() -> PathBuf {
    manifest_dir().join("resources").join("bin")
}

/// `CARGO_MANIFEST_DIR` = `src-tauri/`
fn manifest_dir() -> PathBuf {
    PathBuf::from(env::var(CARGO_MANIFEST_DIR).expect("CARGO_MANIFEST_DIR not set"))
}

/// `../jcli/` relative to `src-tauri/` = the jcli submodule root.
///   src-tauri/  →  ../  = jstudio root
///                →  ../jcli/  = jcli submodule
fn jcli_workspace_root() -> PathBuf {
    manifest_dir()
        .join("..")
        .join("jcli")
        .canonicalize()
        .unwrap_or_else(|_| manifest_dir().join("..").join("jcli"))
}

/// Stage the `j` binary into `resources/bin/`.
///
/// Strategy:
///   1. If `resources/bin/<j>` already exists (manually placed), use it.
///   2. If jcli workspace has a compiled binary, copy it.
///   3. If neither exists, automatically compile jcli workspace and copy.
fn stage_bundled_j() -> Result<(), String> {
    let bin_dir = resources_bin_dir();
    let bin_name = j_binary_name();
    let dest = bin_dir.join(bin_name);

    // Case 1: already staged (developer placed it manually or a previous build
    // already copied it).
    if dest.exists() {
        println!(
            "cargo:warning=[jcli-bundle] Found existing bundled j at {}",
            dest.display()
        );
        return Ok(());
    }

    // Create the resources/bin/ directory.
    std::fs::create_dir_all(&bin_dir)
        .map_err(|e| format!("create_dir_all {}: {}", bin_dir.display(), e))?;

    // Case 2: check jcli workspace target dir for existing compiled binary.
    let ws_root = jcli_workspace_root();
    let ws_candidates = [
        ws_root.join("target").join("release").join(bin_name),
        ws_root.join("target").join("debug").join(bin_name),
    ];

    for candidate in &ws_candidates {
        if candidate.exists() {
            copy_binary(candidate, &dest)?;
            println!(
                "cargo:warning=[jcli-bundle] Staged j from jcli workspace {} → {}",
                candidate.display(),
                dest.display()
            );
            return Ok(());
        }
    }

    // Case 3: no binary found, compile jcli automatically.
    println!(
        "cargo:warning=[jcli-bundle] No compiled `j` binary found, compiling jcli workspace..."
    );

    let profile = if env::var_os("CARGO_CFG_DEBUG").is_some() {
        "debug"
    } else {
        "release"
    };

    let compile_output = std::process::Command::new("cargo")
        .args(["build", "--profile", profile])
        .current_dir(&ws_root)
        .output()
        .map_err(|e| format!("Failed to run cargo build in jcli workspace: {}", e))?;

    if !compile_output.status.success() {
        let stderr = String::from_utf8_lossy(&compile_output.stderr);
        return Err(format!(
            "jcli compilation failed: {}",
            stderr.lines().take(10).collect::<Vec<_>>().join("\n")
        ));
    }

    // After compilation, check for the binary again.
    let compiled_binary = ws_root.join("target").join(profile).join(bin_name);
    if compiled_binary.exists() {
        copy_binary(&compiled_binary, &dest)?;
        println!(
            "cargo:warning=[jcli-bundle] Compiled and staged j from {} → {}",
            compiled_binary.display(),
            dest.display()
        );
        return Ok(());
    }

    Err(format!(
        "jcli compilation succeeded but binary not found at {}",
        compiled_binary.display()
    ))
}

/// Copy a binary file and set executable permissions on Unix.
fn copy_binary(src: &PathBuf, dest: &PathBuf) -> Result<(), String> {
    std::fs::copy(src, dest)
        .map_err(|e| format!("copy {} → {}: {}", src.display(), dest.display(), e))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = std::fs::metadata(dest)
            .map_err(|e| e.to_string())?
            .permissions();
        let mut perms = perms.clone();
        perms.set_mode(0o755);
        std::fs::set_permissions(dest, perms).map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Inject the current git commit hash as `JSTUDIO_BUILD_COMMIT` so the Rust
/// code can read it via `env!("JSTUDIO_BUILD_COMMIT")` at compile time.
/// Falls back to "unknown" if git is unavailable or not in a repo.
fn inject_build_commit() {
    let commit = std::process::Command::new("git")
        .args(["rev-parse", "--short", "HEAD"])
        .output()
        .ok()
        .and_then(|o| {
            if o.status.success() {
                String::from_utf8(o.stdout)
                    .ok()
                    .map(|s| s.trim().to_string())
            } else {
                None
            }
        })
        .unwrap_or_else(|| "unknown".to_string());

    println!("cargo:rustc-env=JSTUDIO_BUILD_COMMIT={}", commit);
    // Re-run if HEAD changes (best-effort: just re-run on any change in the repo).
    // The repo root (and its .git) sits one level above the desktop/ directory.
    println!("cargo:rerun-if-changed=../../.git/HEAD");
}
