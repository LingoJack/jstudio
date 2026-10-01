# PORTING — Rust sidecar → Node backend 方法面对照表

> 任务 1.2 产物（migrate-rust-sidecar-to-node）。权威契约以 `src/lib/core/ipc.ts`
> 的参数名/返回类型为准（Rust `take(&params, "…")` 与之匹配），Rust 语义以
> `src-tauri/src/commands/*.rs` 为准。本表是逐方法移植与 parity 冒烟的清单。

## 架构边界（先读）

```
renderer invoke(method, params)
  → tauriShim/core.ts invoke()
    → [native 方法表] copy_image_to_clipboard / copy_image_bytes_to_clipboard → Electron main（nativeImage）
    → preload 'sidecar-invoke' → electron/main.ts
        → handleMainOnly()：下方「main 拦截」清单内的方法，永远不进任何 sidecar
        → agent_* 九法 → Rust sidecar（agent 宿主，内嵌 j_agent 引擎，不迁移）
          其余        → Node sidecar（electron/backend/，本表迁移范围）
```

- 协议（两个 sidecar 相同）：stdio 换行 JSON。请求 `{id, method, params}`，响应
  `{id, result?|error?}`，通知 `{event, label?, payload?}`。stdout 只出协议帧，日志走 stderr。
- 端到端行为验收 = 与迁移前逐方法一致（含错误文案形态：`{id, error: string}`）。

## 存储布局事实（移植前必读）

- **数据目录 `~/.jdata/studio/`**：`studio.db`（**SQLite，WAL 模式**）+ `documents/{docId}/`（正文文件）
  + `assets/` + `logs/app-YYYY-MM-DD.log`；`index.json.bak` / `settings.json.bak` / `folders.json.bak`
  是 JSON 时代遗留，不再读写（reconcile/backfill 只做修复回填）。
- **DB 层**：Rust 侧原 `src-tauri/src/db/`（connection/schema/migrate/reconcile/backfill）已按行移植到
  `electron/backend/db.ts`，驱动用 **node:sqlite**（Electron 内置，零原生模块），DDL 与迁移链逐行对照。
  （已删除：storage/terminal/bundle/fetch/jcli/fonts/debug 非 agent 部分的 Rust 实现。）
- **j-agent 数据**：`~/.jdata/agent/`（会话、agent_config.json）——agent 宿主（Rust）管辖，Node 不碰。
- **jcli**：安装位置 `~/.jdata/bin/j`，symlink `/usr/local/bin/j`，候选资源 `<resource_dir>/bin/j`。
- **基线留样**：`~/jstudio-migration-baseline/`（build-info / fonts / settings / folders / index /
  sample.jnote / sample-document.json）——parity 对照用。

## 迁移范围：Node sidecar（65 法）

### 1. misc / KV / 日志（electron/backend/kv.ts, logs.ts, index）

| 方法 | 参数 | 返回 | Rust 源 | 备注 |
|---|---|---|---|---|
| echo | `{msg?}`（任意） | 原样回显 | sidecar.rs | 协议冒烟用 |
| get_build_info | `{}` | BuildInfo | debug.rs | 与基线对照 |
| set_preview_data | `{label, data}` | void | sidecar.rs/detach | 内存 KV，按 label 键 |
| get_preview_data | `{label}` | data \| null（**破坏性读**，取出即删） | 同上 | StrictMode 去重靠它 |
| clear_preview_data | `{label?}` | void | 同上 | |
| set/get/clear_diagram_update | 同上三态 | 同上 | 同上 | |
| set/get/clear_terminal_detach_payload | 同上三态 | 同上 | 同上 | |
| append_log_line | `{line}` | void | debug.rs | 原样写入 logs/app-YYYY-MM-DD.log + 换行 |
| get_log_file_path | `{}` | string | debug.rs | 今日日志绝对路径 |
| open_logs_dir | `{}` | void | debug.rs | reveal in Finder |
| clear_logs | `{}` | number（删除数） | debug.rs | |
| list_system_fonts | `{}` | string[]（排序） | fonts.rs | 高风险：枚举范围/排序对照基线 |

### 2. 存储域（storage.ts / assets.ts；node:sqlite）

| 方法 | 参数 | 返回 | Rust 源 | 备注 |
|---|---|---|---|---|
| ensure_studio_dir | `{}` | string（目录） | paths.rs | 建 `~/.jdata/studio/{documents,assets}` |
| open_studio_dir / open_doc_dir | `{}` / `{docId}` | void | paths.rs | reveal in Finder |
| get_doc_path | `{docId}` | string | paths.rs | document.json 绝对路径 |
| read_file_bytes | `{path}` | number[] | paths.rs | 任意路径读 |
| write_file_bytes | `{path, data}` | void | paths.rs | |
| copy_image_to_clipboard | `{path}` | void | paths.rs | **→ main nativeImage**（不经 Node） |
| copy_image_bytes_to_clipboard | `{data}` | void | paths.rs | **→ main**（PNG 字节） |
| read_index | `{}` | DocumentMeta[] | documents.rs | SQL: documents ORDER BY updated_at DESC |
| write_index | `{entries}` | void | documents.rs | 全量覆写 |
| read_document | `{docId}` | Document | documents.rs | |
| write_document | `{docId, doc}` | void | documents.rs | |
| delete_document | `{docId}` | void | documents.rs | 含资产/回收站联动——逐行对照 |
| list_doc_backups | `{docId}` | DocBackup[] | backups.rs | 最新在前 |
| read_doc_backup | `{docId, backupId}` | Document | backups.rs | |
| restore_doc_backup | `{docId, backupId}` | void | backups.rs | 恢复前先快照现值 |
| save_doc_snapshot | `{docId, sections}` | void | snapshots.rs | 绕过 Block[] 序列化的活快照 |
| read_doc_snapshot | `{docId}` | DocSnapshot \| null | snapshots.rs | |
| read_folders | `{}` | FolderMeta[] | folders.rs | 无则 `[]` |
| write_folders | `{entries}` | void | folders.rs | |
| read_settings | `{}` | AppSettings | settings.rs | |
| write_settings | `{settings}` | void | settings.rs | **合并语义**：未提及字段保持 |
| read_agent_config | `{}` | AgentConfigFile | settings.rs | 文件缺失返回 `{}` |
| write_agent_config | `{config}` | void | settings.rs | 自动建父目录 |
| save_doc_asset | `{docId, fileName, data}` | string（相对路径） | assets.rs | |
| delete_doc_asset | `{docId, fileName}` | void | assets.rs | |
| list_doc_assets | `{docId}` | AssetInfo[] | assets.rs | |
| clean_global_assets | `{}` | void | assets.rs | 一次性清理旧全局 assets |
| trash_doc_asset | `{docId, fileName}` | void | assets.rs | 移入 `.trash/` + DB 记录 |
| list_trashed_assets | `{}` | TrashedAsset[] | assets.rs | 全文档，最新在前 |
| restore_trashed_asset | `{id}` | void | assets.rs | |
| delete_trashed_asset | `{id}` | void | assets.rs | 文件 + 记录 |
| list_markdown_files | `{dir}` | MarkdownEntry[] | markdown.rs | 目录在前排序 |

### 3. 捆绑包（bundle.ts，fflate）

| 方法 | 参数 | 返回 | Rust 源 | 备注 |
|---|---|---|---|---|
| export_document_bundle | `{docId, destPath}` | void | bundle.rs | document.json + assets/ + manifest 的 ZIP |
| import_document_bundle | `{srcPath, newDocId}` | Document（id 重写为 newDocId） | bundle.rs | **必须能导入 Rust 版包**（基线 sample.jnote 门禁） |

### 4. 终端 PTY（terminal.ts，node-pty）

| 方法 | 参数 | 返回 | Rust 源 | 备注 |
|---|---|---|---|---|
| pty_create | `{params:{cwd?, cols, rows}}` | TerminalSessionInfo | terminal.rs | 注册表 + 默认标题 |
| pty_write | `{sessionId, data}` | void | terminal.rs | |
| pty_write_batch | `{sessionId, chunks}` | void | terminal.rs | 单次 flush 多块 |
| pty_resize | `{sessionId, cols, rows}` | void | terminal.rs | |
| pty_kill | `{sessionId}` | void | terminal.rs | 注册表移除 |
| pty_kill_all | `{}` | void | terminal.rs | 退出时 main 有界等待调用 |
| pty_list | `{}` | TerminalSessionInfo[] | terminal.rs | |
| pty_set_title | `{sessionId, title}` | void | terminal.rs | |
| pty_is_alive | `{sessionId}` | boolean | terminal.rs | |

事件：data/exit 通知**事件名从 `terminal.rs` 的通知构造处逐个抄**（任务 5.2），高频 data 帧行式写 stdout。

### 5. jcli 管理（jcli.ts）

| 方法 | 参数 | 返回 | Rust 源 | 备注 |
|---|---|---|---|---|
| check_jcli | `{}` | JcliStatus | jcli.rs | 系统 PATH + 打包资源双候选 |
| install_jcli | `{}` | string | jcli.rs | 装到 `~/.jdata/bin/j` + symlink |
| uninstall_jcli | `{}` | void | jcli.rs | 移除 symlink 与二进制 |

### 6. 抓取 / 图谱（fetch.ts）

| 方法 | 参数 | 返回 | Rust 源 | 备注 |
|---|---|---|---|---|
| fetch_link_metadata | `{url}` | LinkMetadata | link.rs | 标题/描述/favicon/OG 图 |
| ai_graph_fetch | `{request}` | AiGraphFetchResponse | ai_graph.rs | POST 代理绕 webview CORS |
| write_graph_log | `{…}` | void | ai_graph.rs | |

## 保留 Rust 宿主（9 法，不迁移）

`agent_list_sessions` / `agent_create_session {title,workspace}` / `agent_load_session {sessionId}` /
`agent_delete_session {sessionId}` / `agent_send_message {params}` / `agent_tool_result {params}` /
`agent_cancel {sessionId}` / `agent_set_auto_approve {sessionId,enabled}` / `agent_submit_ask_answer {sessionId,answer}`

- 引擎：`j_agent` crate（`../jcli/j-agent`）内嵌于 sidecar —— 会话循环/工具执行/plan/hooks 全在此层。
- Node sidecar **不得**实现这九法（直调须返回 unknown method，作为路由正确性的反证测试）。
- 事件：agent 流式通知原样经 Rust 宿主发出，main 总线已兼容。

## main 拦截（永不进 sidecar，已 Electron 原生）

`quit_app` `close_window` `open_devtools` `report_window_focus` `set_native_menu_accelerator`
`disable_text_interaction` `register/unregister_global_shortcut(s)` `open_link_preview*`
`open_or_focus_link_preview` `get/add/switch/close/navigate/refresh_link_preview_tab*`
`show/hide_browser_panel` `update_browser_panel_rect` `get_browser_panel_tabs_state`
`import_chrome_login_state` `browser_go_back/forward` `open_url_in_browser`
（清单见 `electron/main.ts` `handleMainOnly`；增删需同步本文档。）

## Parity 冒烟映射

`scripts/sidecar-smoke.mjs` 扩展后按上表逐域断言（域 1-6 + agent 宿主域），每个方法至少一条
往返；stdout 静默断言覆盖含 PTY 压测在内的全场景；`.jnote` 用基线 sample.jnote 做导入门禁。
