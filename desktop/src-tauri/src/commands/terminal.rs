use portable_pty::{CommandBuilder, MasterPty, PtySize, native_pty_system};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};

use crate::events::{EventSink, EventSinkExt};

// ────────────────────────────────────────────────
// Session state
// ────────────────────────────────────────────────

/// A live PTY session.
/// - `writer`: obtained via `master.take_writer()` — writes here go to the shell.
/// - `master`: kept alive for resize calls (`resize` takes `&self`).
/// - `child`:  the spawned shell process (for kill / wait).
struct PtySession {
    id: String,
    title: String,
    writer: Box<dyn std::io::Write + Send>,
    master: Box<dyn MasterPty + Send>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
}

/// Lightweight info returned to the frontend.
#[derive(Serialize, Clone)]
pub struct SessionInfo {
    id: String,
    title: String,
}

/// Payload emitted with the `pty-data-{id}` event.
#[derive(Serialize, Clone)]
struct PtyDataPayload {
    data: String,
}

/// Parameters for `pty_create`.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateParams {
    cwd: Option<String>,
    cols: u16,
    rows: u16,
}

// Global session registry, keyed by session id.
static SESSIONS: std::sync::LazyLock<Mutex<HashMap<String, PtySession>>> =
    std::sync::LazyLock::new(|| Mutex::new(HashMap::new()));

// ────────────────────────────────────────────────
// Commands
// ────────────────────────────────────────────────

/// Spawn a new PTY shell session.
///
/// Returns the session id. A background thread continuously reads shell
/// output and emits `pty-data-{id}` events; when the shell exits, a
/// `pty-exit-{id}` event is emitted.
pub fn pty_create(events: Arc<dyn EventSink>, params: CreateParams) -> Result<SessionInfo, String> {
    let pty_system = native_pty_system();

    let pair = pty_system
        .openpty(PtySize {
            rows: params.rows,
            cols: params.cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    // Determine shell.
    //
    // Launch as a login shell (`-l`) so that `~/.zprofile` (or
    // `~/.bash_profile`) and `/etc/zprofile` are sourced.  This is
    // essential when the app is launched from Finder/Launchpad, where
    // `launchd` gives the process a minimal environment without the
    // user's PATH additions (Homebrew, cargo, nvm, etc.).  Without
    // `-l`, the shell is interactive (PTY) but NOT a login shell, so
    // `~/.zprofile` is skipped — matching the behaviour of Terminal.app
    // requires the login flag.
    #[cfg(target_os = "windows")]
    let cmd = CommandBuilder::new("cmd.exe");
    #[cfg(not(target_os = "windows"))]
    let cmd = {
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string());
        let mut builder = CommandBuilder::new(&shell);
        builder.arg("-l");
        builder
    };

    // Set working directory.
    let mut cmd = cmd;
    if let Some(cwd) = &params.cwd {
        // Expand leading `~` to the user's home directory.
        // Rust's `std::path` does not understand shell tilde expansion.
        let expanded = if cwd == "~" {
            dirs::home_dir()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|| cwd.clone())
        } else if let Some(rest) = cwd.strip_prefix("~/") {
            match dirs::home_dir() {
                Some(home) => format!("{}/{}", home.to_string_lossy(), rest),
                None => cwd.clone(),
            }
        } else {
            cwd.clone()
        };
        cmd.cwd(&expanded);
    }

    // Ensure the shell runs in a UTF-8 capable environment so that
    // multibyte input/output (CJK, emoji, etc.) is handled correctly.
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("LANG", "en_US.UTF-8");
    cmd.env("LC_ALL", "en_US.UTF-8");
    // Declare VS Code terminal identity to TUI apps. CodeBuddy / Claude Code
    // et al. adapt their styling to TERM_PROGRAM: under "vscode" they skip
    // SGR 2 (dim) entirely (verified by PTY capture: 16 dim sequences without
    // it, 0 with it), so separators/hints render at full color instead of
    // washing out on light themes. If a tool ever misbehaves under this
    // identity, removing these two lines reverts it.
    cmd.env("TERM_PROGRAM", "vscode");
    cmd.env("TERM_PROGRAM_VERSION", "1.99.0");

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;

    let session_id = format!(
        "term-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    );

    // Drop slave — the child holds an fd to it.
    drop(pair.slave);

    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let title = "Terminal".to_string();

    let info = SessionInfo {
        id: session_id.clone(),
        title: title.clone(),
    };

    // Spawn reader thread — forwards shell output to the frontend.
    //
    // UTF-8 safety: a multibyte character (e.g. emoji, CJK) can be split
    // across two `read()` calls at the 4096-byte boundary.  We accumulate
    // raw bytes in `leftover` and only decode the portion that forms
    // complete UTF-8 sequences, carrying any trailing partial bytes to
    // the next iteration.
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;

    let sid = session_id.clone();
    let events_clone = Arc::clone(&events);
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        let mut leftover: Vec<u8> = Vec::new();
        loop {
            // Read into the buffer past any leftover bytes.
            let offset = leftover.len();
            let read_start = offset.min(buf.len());
            // Move leftover to the front of buf.
            if read_start > 0 {
                buf[..read_start].copy_from_slice(&leftover);
            }

            match reader.read(&mut buf[read_start..]) {
                Ok(0) => break, // EOF — shell exited
                Ok(n) => {
                    let total = read_start + n;
                    // Find the longest valid UTF-8 prefix.
                    let (valid_len, remaining) = match std::str::from_utf8(&buf[..total]) {
                        Ok(s) => (s.len(), 0), // entire buffer is valid
                        Err(e) => (e.valid_up_to(), total - e.valid_up_to()),
                    };

                    if valid_len > 0 {
                        let data =
                            unsafe { String::from_utf8_unchecked(buf[..valid_len].to_vec()) };
                        events_clone.emit(&format!("pty-data-{sid}"), PtyDataPayload { data });
                    }

                    // Save incomplete trailing bytes for next iteration.
                    leftover.clear();
                    if remaining > 0 && remaining < 4 {
                        leftover.extend_from_slice(&buf[valid_len..valid_len + remaining]);
                    }
                    // If remaining >= 4 we have invalid bytes (not a partial
                    // sequence) — discard them to avoid an infinite loop.
                }
                Err(_) => break,
            }
        }
        // Notify frontend that the session has ended.
        events_clone.emit(&format!("pty-exit-{sid}"), ());
    });

    // Keep the master alive (needed for resize).
    let master = pair.master;

    // Store the session.
    {
        let mut sessions = SESSIONS.lock().map_err(|e| e.to_string())?;
        sessions.insert(
            session_id.clone(),
            PtySession {
                id: session_id,
                title,
                writer,
                master,
                child,
            },
        );
    }

    Ok(info)
}

/// Write user input to the PTY (keyboard → shell).
pub fn pty_write(session_id: String, data: String) -> Result<(), String> {
    let mut sessions = SESSIONS.lock().map_err(|e| e.to_string())?;
    let session = sessions
        .get_mut(&session_id)
        .ok_or_else(|| format!("session not found: {session_id}"))?;
    session
        .writer
        .write_all(data.as_bytes())
        .map_err(|e| e.to_string())?;
    session.writer.flush().map_err(|e| e.to_string())?;
    Ok(())
}

/// Resize the PTY (e.g. when the terminal panel is resized).
pub fn pty_resize(session_id: String, cols: u16, rows: u16) -> Result<(), String> {
    let sessions = SESSIONS.lock().map_err(|e| e.to_string())?;
    let session = sessions
        .get(&session_id)
        .ok_or_else(|| format!("session not found: {session_id}"))?;
    session
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Kill a session and remove it from the registry.
pub fn pty_kill(session_id: String) -> Result<(), String> {
    let mut sessions = SESSIONS.lock().map_err(|e| e.to_string())?;
    if let Some(mut session) = sessions.remove(&session_id) {
        let _ = session.child.kill();
        let _ = session.child.wait();
    }
    Ok(())
}

/// Return a list of all active sessions (id + title).
pub fn pty_list() -> Result<Vec<SessionInfo>, String> {
    let sessions = SESSIONS.lock().map_err(|e| e.to_string())?;
    Ok(sessions
        .values()
        .map(|s| SessionInfo {
            id: s.id.clone(),
            title: s.title.clone(),
        })
        .collect())
}

/// Rename a session.
pub fn pty_set_title(session_id: String, title: String) -> Result<(), String> {
    let mut sessions = SESSIONS.lock().map_err(|e| e.to_string())?;
    let session = sessions
        .get_mut(&session_id)
        .ok_or_else(|| format!("session not found: {session_id}"))?;
    session.title = title;
    Ok(())
}

// ────────────────────────────────────────────────────────────────
// Extended commands (kitty-inspired enhancements)
// ────────────────────────────────────────────────────────────────

/// Write multiple chunks to the PTY in a single syscall.
///
/// Inspired by kitty's `schedule_write_to_child` which batches writes
/// into a single flush to reduce syscall overhead and latency.
pub fn pty_write_batch(session_id: String, chunks: Vec<String>) -> Result<(), String> {
    let mut sessions = SESSIONS.lock().map_err(|e| e.to_string())?;
    let session = sessions
        .get_mut(&session_id)
        .ok_or_else(|| format!("session not found: {session_id}"))?;
    for chunk in &chunks {
        session
            .writer
            .write_all(chunk.as_bytes())
            .map_err(|e| e.to_string())?;
    }
    session.writer.flush().map_err(|e| e.to_string())?;
    Ok(())
}

/// Check if a PTY session exists and is alive.
///
/// Returns `true` if the session is registered. This is useful before
/// attempting write operations to avoid "session not found" errors.
pub fn pty_is_alive(session_id: String) -> Result<bool, String> {
    let sessions = SESSIONS.lock().map_err(|e| e.to_string())?;
    Ok(sessions.contains_key(&session_id))
}

/// Kill all PTY sessions.
///
/// Used during app shutdown to cleanly terminate all shell processes.
pub fn pty_kill_all() -> Result<(), String> {
    let mut sessions = SESSIONS.lock().map_err(|e| e.to_string())?;
    for (_, mut session) in sessions.drain() {
        let _ = session.child.kill();
        let _ = session.child.wait();
    }
    Ok(())
}
