mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
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
            commands::storage::read_folders,
            commands::storage::write_folders,
            commands::storage::read_file_bytes,
            commands::storage::open_studio_dir,
            commands::storage::open_doc_dir,
            commands::storage::get_doc_path,
            commands::storage::set_preview_data,
            commands::storage::get_preview_data,
            // ── terminal (PTY) ──
            commands::terminal::pty_create,
            commands::terminal::pty_write,
            commands::terminal::pty_resize,
            commands::terminal::pty_kill,
            commands::terminal::pty_list,
            commands::terminal::pty_set_title,
            // ── jcli ──
            commands::jcli::check_jcli,
            commands::jcli::install_jcli,
            commands::jcli::uninstall_jcli,
            // ── link preview ──
            commands::link::fetch_link_metadata,
        ])
        .register_asynchronous_uri_scheme_protocol("webpreview", |_app, request, responder| {
            // Move the blocking HTTP work off the main thread to prevent
            // the macOS rainbow cursor during page loads.
            std::thread::spawn(move || {
                let response = commands::link::handle_webpreview_request(&request);
                responder.respond(response);
            });
        })
        .run(tauri::generate_context!())
        .expect("failed to run jstudio tauri application");
}
