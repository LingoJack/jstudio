/// Global OS-level shortcut commands.
///
/// The frontend stores `GlobalShortcutConfig[]` in `settings.json`.
/// On app start (and whenever the user edits settings), the frontend calls
/// `unregister_all_global_shortcuts` followed by `register_global_shortcut`
/// for each enabled config.
///
/// Each registered shortcut carries its action config as a JSON value.
/// When the OS fires the shortcut, the handler emits a
/// `"global-shortcut-triggered"` Tauri event with that config as payload.
/// The main window listens for this event and dispatches to the appropriate
/// action handler via the frontend `ACTION_REGISTRY`.
use serde_json::Value;
use tauri::{AppHandle, Emitter};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

/// The Tauri event channel used for shortcut → frontend communication.
pub const SHORTCUT_EVENT: &str = "global-shortcut-triggered";

/// Convert the frontend binding format (e.g. `"mod+shift+p"`) to the
/// `global-hotkey` crate's parse format (e.g. `"CommandOrControl+Shift+P"`).
///
/// Frontend tokens:
///   `mod`   → platform-adaptive (`CommandOrControl`)
///   `alt`   → `Alt`
///   `shift` → `Shift`
///   `ctrl`  → `Control`
///   letters → uppercased single char
fn to_global_hotkey_format(binding: &str) -> Result<String, String> {
    let mut parts: Vec<String> = Vec::new();
    for token in binding.split('+') {
        let token = token.trim();
        if token.is_empty() {
            continue;
        }
        match token.to_lowercase().as_str() {
            "mod" | "cmd" | "meta" | "super" => parts.push("CommandOrControl".to_string()),
            "alt" | "option" | "opt" => parts.push("Alt".to_string()),
            "shift" => parts.push("Shift".to_string()),
            "ctrl" | "control" => parts.push("Control".to_string()),
            _ => {
                // Single char → uppercase letter
                if token.len() == 1 {
                    parts.push(token.to_uppercase());
                } else {
                    // Pass through (e.g. "Enter", "Space", "F1")
                    // Capitalize first letter
                    let mut chars = token.chars();
                    if let Some(first) = chars.next() {
                        parts.push(format!("{}{}", first.to_uppercase(), chars.as_str()));
                    }
                }
            }
        }
    }
    if parts.len() < 2 {
        return Err(format!(
            "Invalid shortcut '{}': at least one modifier + one key is required",
            binding
        ));
    }
    Ok(parts.join("+"))
}

/// Register a single global shortcut.
///
/// - `shortcut_str`: frontend format, e.g. `"mod+shift+p"`
/// - `action_config_json`: serialized `GlobalShortcutConfig` from the frontend
#[tauri::command]
pub fn register_global_shortcut(
    app: AppHandle,
    shortcut_str: String,
    action_config_json: Value,
) -> Result<(), String> {
    let hotkey_str = to_global_hotkey_format(&shortcut_str)?;
    app.global_shortcut()
        .on_shortcut(hotkey_str.as_str(), move |app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                let _ = app.emit(SHORTCUT_EVENT, &action_config_json);
            }
        })
        .map_err(|e| format!("Failed to register shortcut '{}': {}", shortcut_str, e))?;
    Ok(())
}

/// Unregister a single global shortcut.
#[tauri::command]
pub fn unregister_global_shortcut(app: AppHandle, shortcut_str: String) -> Result<(), String> {
    let hotkey_str = to_global_hotkey_format(&shortcut_str)?;
    app.global_shortcut()
        .unregister(hotkey_str.as_str())
        .map_err(|e| format!("Failed to unregister shortcut '{}': {}", shortcut_str, e))?;
    Ok(())
}

/// Unregister all global shortcuts. Called before re-registering on settings change.
#[tauri::command]
pub fn unregister_all_global_shortcuts(app: AppHandle) -> Result<(), String> {
    app.global_shortcut()
        .unregister_all()
        .map_err(|e| format!("Failed to unregister all shortcuts: {}", e))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_conversion() {
        assert_eq!(
            to_global_hotkey_format("mod+shift+p").unwrap(),
            "CommandOrControl+Shift+P"
        );
        assert_eq!(
            to_global_hotkey_format("mod+k").unwrap(),
            "CommandOrControl+K"
        );
        assert_eq!(
            to_global_hotkey_format("ctrl+alt+delete").unwrap(),
            "Control+Alt+Delete"
        );
    }

    #[test]
    fn test_no_modifier_fails() {
        assert!(to_global_hotkey_format("p").is_err());
    }
}
