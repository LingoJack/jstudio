# Tasks

## 1. 留样与基线（迁移前）

- [x] 1.1 导出一份真实 .jnote 留样（Rust 版导出，存到仓库外安全位置），记录 `get_build_info`、`list_system_fonts` 输出基线。验证：留样文件与基线文本存在
- [x] 1.2 梳理方法面清单：从 `src-tauri/src/bin/sidecar.rs` 路由表 + `ipc.ts` 调用点产出「方法 → 参数 → 返回」对照表（存 `electron/backend/PORTING.md`）；agent_* 九法标注「保留 Rust 宿主」。验证：Node 范围内全部方法入表并逐域分组

## 2. Node sidecar 骨架

- [x] 2.1 新建 `electron/backend/`：入口路由器（method → 处理器）+ 帧读写（换行 JSON，stdout 只出协议帧、日志走 stderr），与 `electron/sidecar.ts` 协议一致。验证：`echo` 方法往返成功
- [x] 2.2 双后端接线：esbuild 增打 `dist-electron/backend.cjs`；main 持双 Sidecar 实例（Node backend.cjs 用 `process.execPath + ELECTRON_RUN_AS_NODE=1`，Rust agent 宿主照旧），`sidecar-invoke` 按方法名分流（`agent_*`→Rust，其余→Node；`JSTUDIO_BACKEND=rust` 全走 Rust）。验证：两种模式下 echo / agent 往返都成功
- [x] 2.3 移植 misc 域：`get_build_info` / `append_log_line` / `get_log_file_path` / `open_logs_dir` / `clear_logs` / KV 中继三组（preview/diagram/terminal detach）。验证：smoke 逐方法往返通过

## 3. 存储域移植

- [x] 3.1 `storage.ts`：studio 目录、文档读写/删除、索引、folders、设置（**合并语义**）、agent 配置文件。验证：对同一 `~/.jdata/studio` 目录，Rust/Node 双跑同方法结果一致；smoke 设置合并断言通过
- [x] 3.2 `assets.ts`：save/delete/list 资产、trash/list/restore/delete 回收站（路径布局与语义对照 PORTING.md）。验证：资产保存→列举→入回收站→还原→彻底删除 全链路一致
- [x] 3.3 `backups.ts`：正文备份列表/读取/恢复（轮换规则照抄）、编辑器快照存取。验证：备份轮换与恢复结果与 Rust 版一致
- [x] 3.4 `fetch.ts` + `jcli.ts` + 杂项：链接元数据抓取、ai_graph_fetch、图表日志、markdown 列举、jcli check/install/uninstall。验证：同输入返回形状一致（网络域允许内容时变，仅校验结构）；jcli 三方法行为与 Rust 版一致

## 4. .jnote 捆绑包

- [x] 4.1 `bundle.ts`：fflate 实现 export/import，manifest 字段与 ZIP entry 布局逐项对照 Rust 版。验证：Node 导出→Node 导入往返无损（smoke 或独立脚本断言）
- [x] 4.2 旧包兼容：导入 1.1 的 Rust 版留样 .jnote，正文与资产完整还原。验证：导入结果与 Rust 版导入一致

## 5. 终端 PTY 域

- [x] 5.1 依赖接入：+`node-pty`，electron-rebuild 进 postinstall。验证：`npm install` 后 Node sidecar 内 `require('node-pty')` 成功
- [x] 5.2 `terminal.ts`：pty 9 方法 + data/exit 事件（事件名从 `terminal.rs` 逐个对照），行式写 stdout。验证：smoke PTY 生命周期断言（create→data→kill→exit）通过；PTY 大输出压测下 stdout 静默断言不破
- [x] 5.3 退出顺序回归：开终端退出应用 → `pty_kill_all`（有界等待）→ sidecar 停止。验证：无孤儿 PTY 进程残留（`ps` 检查）

## 6. Agent 域（保留 Rust 宿主，仅验证路由）

- [x] 6.1 验证 agent 域在 node 路由下行为不变：创建会话→发消息→流式事件→cancel，请求确认由 Rust 宿主处理（加日志/断点），会话落盘与迁移前同构。验证：smoke agent 域往返通过
- [x] 6.2 确认 Node sidecar 未实现 agent_* 九法（未知方法报错路径即预期）。验证：smoke 对 Node backend 直调 agent_create_session 返回 unknown method

## 7. 原生能力上移 main

- [x] 7.1 `tauriShim/core.ts` native 方法表：`copy_image_to_clipboard`（路径版，main 用 `nativeImage.createFromPath`）与字节版分流到 main；preload 加对应通道。验证：ImageView 复制图片、mermaid 复制图片两条路径在 node 后端下正常
- [x] 7.2 `fonts.ts`：系统字体枚举（对照 Rust 实现的目录与排序）。验证：与 1.1 基线对照，输出形状一致、家族集合无缺失

## 8. 门禁与切换

- [x] 8.1 扩展 `scripts/sidecar-smoke.mjs` 至全方法面（各域往返 + 设置合并 + stdout 静默 + PTY 生命周期 + .jnote 往返），支持 `--backend node|rust`。验证：对 Node sidecar 跑全绿（退出码 0）
- [x] 8.2 默认后端翻 `node`，真机全量走查：文档编辑保存、资产、回收站、备份、预览窗口（HTML/Mermaid/图片）、终端、Agent、日志。验证：走查清单逐项通过，无行为差异
- [x] 8.3 打包验证：electron-builder 产物含 asar 外 `backend.cjs`、不含 sidecar 二进制；打包产物启动并复跑 8.2 走查。验证：打包应用全功能正常

## 9. Rust 瘦身与遗留清理（8.1-8.3 全绿后）

- [x] 9.1 Rust sidecar 路由瘦身：移除已迁走的命令与对应 commands 模块（storage/terminal/bundle/fetch/jcli/fonts/debug 非 agent 部分），保留 agent.rs + j_agent 依赖 + echo/build_info；Node 侧 jcli 管理域已含 check/install/uninstall。验证：瘦身后 8.1 smoke 与 8.2 走查复跑全绿
- [x] 9.2 删除 Tauri 应用壳残留：lib.rs / main.rs / tauri.conf.json 等（保留 src-tauri 内 sidecar bin 与其依赖），移除 `JSTUDIO_BACKEND` 回退分支，`electron:build:sidecar` 保留但仅构建瘦身宿主。验证：全仓 grep 无 Tauri 壳引用；`npm run dev` / `build` / 打包正常
- [x] 9.3 更新 README/CLAUDE.md 等文档中的构建说明（Rust 工具链仅用于 agent 宿主）。验证：文档与实际构建步骤一致
