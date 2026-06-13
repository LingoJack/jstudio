mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::storage::ensure_studio_dir,
            commands::storage::read_index,
            commands::storage::write_index,
            commands::storage::read_document,
            commands::storage::write_document,
            commands::storage::delete_document,
            commands::storage::save_asset,
            commands::storage::delete_asset,
            commands::storage::read_asset_base64,
            commands::storage::list_assets,
            commands::storage::read_settings,
            commands::storage::write_settings,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run jstudio tauri application");
}
