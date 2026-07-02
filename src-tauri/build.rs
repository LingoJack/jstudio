use std::env;
use std::path::PathBuf;

const CARGO_MANIFEST_DIR: &str = "CARGO_MANIFEST_DIR";

fn main() {
    // Best-effort: stage the bundled `j` binary into resources/bin/ BEFORE
    // tauri_build::build(), because tauri_build validates the `resources` glob
    // pattern in tauri.conf.json and will fail if the directory is empty/missing.
    if let Err(e) = stage_bundled_j() {
        println!("cargo:warning=[jcli-bundle] Skipping bundled j: {}", e);
    }

    // Inject the git commit hash at build time so the frontend can display it
    // (About page + Debug section). `cargo:rustc-env` makes it available as an
    // env var at compile time via `env!("JSTUDIO_BUILD_COMMIT")`.
    inject_build_commit();

    // Run the standard Tauri build steps (validates resources, config, etc.)
    tauri_build::build();

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

/// `../../../` relative to `src-tauri/` = the jcli workspace root.
///   src-tauri/  →  ../  = jstudio/
///                →  ../../  = apps/
///                →  ../../../  = jcli root
fn jcli_workspace_root() -> PathBuf {
    manifest_dir()
        .join("..")
        .join("..")
        .join("..")
        .canonicalize()
        .unwrap_or_else(|_| manifest_dir().join("..").join("..").join(".."))
}

/// Stage the `j` binary into `resources/bin/`.
///
/// Strategy:
///   1. If `resources/bin/<j>` already exists (manually placed), use it.
///   2. Else look for a freshly compiled binary at
///      `../../target/release/j` (the jcli workspace target dir).
///   3. Else look for a prebuilt copy at
///      `../../target/release/j` — try `debug` as a last resort.
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

    // Case 2: compiled binary in the jcli workspace target dir.
    let ws_root = jcli_workspace_root();
    let candidates = [
        ws_root.join("target").join("release").join(bin_name),
        ws_root.join("target").join("debug").join(bin_name),
    ];

    for candidate in &candidates {
        if candidate.exists() {
            std::fs::copy(candidate, &dest)
                .map_err(|e| format!("copy {} → {}: {}", candidate.display(), dest.display(), e))?;

            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let perms = std::fs::metadata(&dest)
                    .map_err(|e| e.to_string())?
                    .permissions();
                let mut perms = perms.clone();
                perms.set_mode(0o755);
                std::fs::set_permissions(&dest, perms).map_err(|e| e.to_string())?;
            }

            println!(
                "cargo:warning=[jcli-bundle] Staged j from {} → {}",
                candidate.display(),
                dest.display()
            );
            return Ok(());
        }
    }

    Err(format!(
        "No compiled `j` binary found under {}. Run `cargo build --release` \
         in the jcli workspace, or manually place a binary at {}",
        ws_root.join("target").display(),
        dest.display()
    ))
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
    println!("cargo:rerun-if-changed=../../.git/HEAD");
}
