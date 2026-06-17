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
            commands::storage::save_doc_asset,
            commands::storage::read_doc_asset_base64,
            commands::storage::delete_doc_asset,
            commands::storage::list_doc_assets,
            commands::storage::clean_global_assets,
            commands::storage::read_settings,
            commands::storage::write_settings,
            commands::storage::read_file_bytes,
            commands::storage::open_studio_dir,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run jstudio tauri application");
}
