//! JStudio 后端 — 只负责注册 Tauri 命令。

mod commands;
mod error;
mod markdown;
mod models;
mod renderer;
mod services;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::app::get_initial,
            commands::file::read_file,
            commands::dir::list_dir,
            commands::app::parse_markdown,
            commands::file::save_file,
            commands::file::create_file,
            commands::file::create_dir,
            commands::file::delete_path,
            commands::file::rename_path,
            commands::file::show_in_folder,
            commands::dir::open_dir,
            commands::asset::read_asset,
            commands::studio::open_workspace,
            commands::studio::list_pages,
            commands::studio::create_page,
            commands::studio::get_page,
            commands::studio::save_page,
            commands::studio::delete_page,
            commands::studio::rebuild_graph,
            commands::studio::get_graph,
            commands::studio::get_backlinks,
            commands::studio::list_plugins,
            commands::studio::get_sync_status,
            commands::app::quit_reader,
        ])
        .run(tauri::generate_context!())
        .inspect_err(|e| eprintln!("JStudio 启动失败：{e}"))
        .ok();
}
