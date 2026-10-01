# Proposal

## Why

GUI 壳已完成 Electron 迁移（渲染层 44 个文件的 `@tauri-apps/*` import 经 vite alias 无条件落到 tauriShim），但后端仍是一个 **Rust sidecar 子进程**（`jstudio-sidecar`，stdio JSON-RPC，承载约 70 个命令：文档/索引/设置、资产与回收站、备份/快照、.jnote 捆绑包、终端 PTY、Agent 会话、jcli 管理、日志、字体、图片剪贴板）。用户拍板**全面去 Rust**：后端改用 Node 实现，删除 `src-tauri/` 与全部 Tauri/Cargo 痕迹，让项目构建、运行、打包只依赖 npm + Electron。

已确认的决策（用户拍板）：
- **后端形态 = Node sidecar 子进程**（沿用现有 stdio JSON-RPC 协议；用 Electron 内置 Node 运行，不引入独立 Node 运行时）。渲染层、preload、main 的传输链路基本不动，`scripts/sidecar-smoke.mjs` 协议级冒烟直接复用为 parity 验收。
- **A2 修正（实施期发现 agent 引擎不可迁后拍板）**：sidecar 内嵌的 `j_agent` crate（来自兄弟项目 `../jcli/j-agent`）是共享在役引擎，**agent 域保留 Rust**。最终形态：**Node sidecar 承载 agent 以外全部命令；Rust sidecar 瘦身为 agent 引擎宿主**（双后端按方法名静态路由）。"全面去 Rust"修正为"Rust 仅剩 agent 引擎宿主"。
- **遗留清理**：parity 验证通过后，删除 Tauri 应用壳残留（lib.rs/main.rs/tauri.conf.json 等）与 Rust 路由中已迁走的命令；Cargo 工具链仅为瘦身后的 agent 宿主保留。

## What Changes

- **新增 Node sidecar**：按现有 Rust `commands/*` 的分域结构用 TypeScript/Node 重实现 **agent 域以外**的全部方法（存储/资产/回收站/备份/快照/.jnote/KV 中继/日志/抓取/jcli 管理/终端 PTY/字体）+ 事件通知，协议（换行分隔 JSON-RPC）与 stdout 纯净性约束不变。
- **双后端按方法静态路由**：main 的 `sidecar-invoke` 通道按方法名分流——`agent_*` 九法走 Rust sidecar（瘦身宿主），其余走 Node sidecar；`JSTUDIO_BACKEND=rust` 时全部走 Rust（旧行为，一键回退），parity 全绿后默认 `node` 并移除回退分支。
- **Rust sidecar 瘦身**：删除路由中已迁走的命令与对应 commands 模块（storage/terminal/bundle/fetch/jcli/fonts/debug 的非 agent 部分），保留 `commands/agent.rs` + `j_agent` 依赖 + echo/build_info；删除 Tauri 应用壳残留（lib.rs / main.rs / tauri.conf.json 等），`src-tauri` 仅保留 sidecar bin。
- **原生能力上移 Electron main**：`copy_image_to_clipboard`（文件/字节两版）改为 main 进程 `nativeImage` 直接实现，invoke shim 内分流；对话框/窗口操作本来就在 main。
- **终端 PTY**：Rust `portable-pty` → `node-pty`（native 模块，electron-rebuild），事件流（data/exit）语义保持。
- **.jnote 捆绑包格式兼容**：Node 版 export/import 必须能读写 Rust 版产生的包（ZIP 结构 + manifest 不变）。
- **构建/打包**：`electron:build:sidecar` 脚本保留但仅构建瘦身 Rust agent 宿主；sidecar JS 经 esbuild 打到 `dist-electron/backend.cjs`，打包配置以 extraResources 携带（asar 外）。
- **不受影响**：渲染层代码（44 个文件的 `@tauri-apps/*` import 与 tauriShim 模块面保持原样）；所有用户可见行为（迁移的验收标准就是行为不变）。

## Capabilities

### New Capabilities

- `backend-runtime`: 后端命令运行时的行为契约——stdio JSON-RPC 协议形状、方法面行为对等、PTY/Agent 事件流语义、.jnote 格式兼容、原生能力归属 Electron main、构建打包无 Rust、退出清理顺序。

### Modified Capabilities

（无——`openspec/specs/` 为空，无既有能力被修改。）

## Impact

- **新增**：`electron/backend/`（Node sidecar 分域模块，esbuild 随 `electron:build:main` 一起打到 `dist-electron/`）。
- **修改**：`electron/sidecar.ts`（spawn 目标）、`electron/main.ts`（native 方法分流 + 退出顺序保持）、`electron/preload.ts`、`src/lib/core/tauriShim/core.ts`（方法分流）、`package.json`（脚本/依赖/打包配置）、`vite.config.ts`（注释与 alias 收敛）。
- **删除（最后阶段）**：`src-tauri/` 全目录、`electron:build:sidecar(-release)` 脚本、`@tauri-apps/cli`、`tauri.conf.json`、打包配置里的 sidecar 二进制资源。
- **风险集中点**：`node-pty` 原生模块与 Electron 版本匹配；`ELECTRON_RUN_AS_NODE` 子进程读不到 asar（sidecar.js 需放 asar 外）；ZIP 与字体枚举的输出对等。
- 依赖变化：+`node-pty`；DB 层用 Electron 44 内置的 `node:sqlite`（实施期验证，免原生模块）；−`@tauri-apps/cli` 及 Tauri 壳。
