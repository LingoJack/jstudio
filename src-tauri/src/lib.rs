mod commands;
mod db;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            // ── storage: paths ──
            commands::storage::paths::ensure_studio_dir,
            commands::storage::paths::open_studio_dir,
            commands::storage::paths::open_doc_dir,
            commands::storage::paths::get_doc_path,
            commands::storage::paths::read_file_bytes,
            // ── storage: documents ──
            commands::storage::documents::read_index,
            commands::storage::documents::write_index,
            commands::storage::documents::read_document,
            commands::storage::documents::write_document,
            commands::storage::documents::delete_document,
            // ── storage: folders ──
            commands::storage::folders::read_folders,
            commands::storage::folders::write_folders,
            // ── storage: settings ──
            commands::storage::settings::read_settings,
            commands::storage::settings::write_settings,
            commands::storage::settings::read_agent_config,
            commands::storage::settings::write_agent_config,
            // ── storage: assets ──
            commands::storage::assets::save_doc_asset,
            commands::storage::assets::delete_doc_asset,
            commands::storage::assets::list_doc_assets,
            commands::storage::assets::clean_global_assets,
            // ── storage: markdown ──
            commands::storage::markdown::list_markdown_files,
            // ── storage: cache ──
            commands::storage::cache::set_preview_data,
            commands::storage::cache::get_preview_data,
            commands::storage::cache::set_diagram_update,
            commands::storage::cache::get_diagram_update,
            commands::storage::cache::clear_diagram_update,
            // ── document backup bundles (.jnote) ──
            commands::bundle::export_document_bundle,
            commands::bundle::import_document_bundle,
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
            commands::link::open_link_preview,
            // ── terminal detach (tear-off window mailbox) ──
            commands::detach::set_terminal_detach_payload,
            commands::detach::get_terminal_detach_payload,
            commands::detach::clear_terminal_detach_payload,
            // ── global OS shortcuts ──
            commands::global_shortcut::register_global_shortcut,
            commands::global_shortcut::unregister_global_shortcut,
            commands::global_shortcut::unregister_all_global_shortcuts,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run jstudio tauri application");
}
