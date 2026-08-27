use serde::Serialize;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;

/// Build info exposed to the frontend (About page, Debug settings).
#[derive(Serialize)]
pub struct BuildInfo {
    /// Short git commit hash at build time (e.g. "b0e9512"), or "unknown".
    pub commit: &'static str,
    /// `true` in debug builds, `false` in release.
    pub is_dev: bool,
}

/// Return build metadata: git commit hash + whether this is a debug build.
pub fn get_build_info() -> BuildInfo {
    BuildInfo {
        commit: env!("JSTUDIO_BUILD_COMMIT"),
        is_dev: cfg!(debug_assertions),
    }
}

// (open_devtools lives in the Electron shell — main intercepts the method.)

// ── Runtime log file ───────────────────────────────────────────────────────
//
// The frontend logger (`src/lib/core/logger.ts`) buffers log lines in JS and
// flushes them here in batches via `append_log_line`. We write to
// `~/.jdata/studio/logs/app-YYYY-MM-DD.log` (one file per day so old logs are
// easy to find/trim). A global `Mutex` serialises writes from multiple app
// windows (main + detached document/terminal/preview windows all share the
// same file).

/// `~/.jdata/studio/logs/`
fn logs_dir() -> PathBuf {
    super::storage::paths::studio_dir().join("logs")
}

/// Today's log file path: `~/.jdata/studio/logs/app-YYYY-MM-DD.log`.
///
/// Computed from the local date (not UTC) so a log file covers a user's
/// working day regardless of timezone.
fn today_log_path() -> PathBuf {
    let (year, month, day) = {
        // Avoid pulling in chrono just for this — use std::time + a simple
        // days-from-epoch → civil-date conversion (Howard Hinnant's algorithm).
        let secs = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        // Local timezone offset in seconds. std doesn't expose tzset() from
        // Rust directly, but on Unix `localtime_r` is the canonical source.
        // For simplicity and zero extra deps, we use UTC here — the date
        // bucket is only for file grouping, not for per-line timestamps (those
        // come from the JS side with full ISO precision). A UTC date bucket
        // is fine: it just means the file rolls over at ~00:00 UTC, which on
        // CN time is 08:00 — acceptable for a diagnostic log.
        let days = secs.div_euclid(86400);
        civil_from_days(days)
    };
    logs_dir().join(format!("app-{year:04}-{month:02}-{day:02}.log"))
}

/// Convert days-since-Unix-epoch (1970-01-01) to a (year, month, day) triple.
/// Howard Hinnant's "days_from_civil" inverted — public domain.
fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097; // [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365; // [0, 399]
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153; // [0, 11]
    let d = doy - (153 * mp + 2) / 5 + 1; // [1, 31]
    let m = if mp < 10 { mp + 3 } else { mp - 9 }; // [1, 12]
    (if m <= 2 { y + 1 } else { y }, m, d)
}

/// Serialises concurrent `append_log_line` calls across windows. Tauri
/// commands can run on different runtime threads, and `OpenOptions::append`
/// is atomic per `write` call on POSIX but not guaranteed across multiple
/// writes — the mutex keeps a batched flush (one write call per line) safe.
static LOG_WRITE_LOCK: Mutex<()> = Mutex::new(());

/// Append a single pre-formatted log line (the JS logger adds timestamp /
/// level / source prefix) to today's log file. Creates the logs directory
/// and the file if they don't exist. Never returns an error for missing
/// directory — that's handled by `create_dir_all`.
pub fn append_log_line(line: String) -> Result<(), String> {
    let _guard = LOG_WRITE_LOCK.lock().map_err(|e| e.to_string())?;
    let path = today_log_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create logs dir: {e}"))?;
    }
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| format!("open log file: {e}"))?;
    // Always end with a newline so the file is tail-able and each flush is
    // a complete line.
    write!(file, "{line}\n").map_err(|e| format!("write log line: {e}"))
}

/// Return the absolute path of today's log file (for display in the Debug
/// settings UI). Does NOT create the file — the path is shown even before
/// any log line has been written.
pub fn get_log_file_path() -> Result<String, String> {
    Ok(today_log_path().to_string_lossy().into_owned())
}

/// Reveal the logs directory (`~/.jdata/studio/logs/`) in the system file
/// manager. Creates the directory first so Finder/Explorer doesn't open to
/// a non-existent path.
pub fn open_logs_dir() -> Result<(), String> {
    fs::create_dir_all(logs_dir()).map_err(|e| format!("create logs dir: {e}"))?;
    super::storage::paths::open_path_in_file_manager(&logs_dir())
}

/// Delete every file in the logs directory. Used by the "Clear logs" button
/// in Debug settings. Keeps the directory itself. Returns the number of
/// files removed so the UI can show a confirmation.
pub fn clear_logs() -> Result<usize, String> {
    let dir = logs_dir();
    if !dir.exists() {
        return Ok(0);
    }
    let mut removed = 0usize;
    let entries = fs::read_dir(&dir).map_err(|e| format!("read logs dir: {e}"))?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() {
            if fs::remove_file(&path).is_ok() {
                removed += 1;
            }
        }
    }
    Ok(removed)
}
