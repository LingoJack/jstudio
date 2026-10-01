# Design

## Context

现状链路：renderer `invoke()`（vite alias → `src/lib/core/tauriShim/core.ts`）→ preload `sidecarInvoke` → main 的 `Sidecar` 类（`electron/sidecar.ts`，换行 JSON-RPC over stdio）→ **Rust 二进制 `jstudio-sidecar`**（dev 取 `src-tauri/target/debug/`，打包取 resources）。命令面约 70 个方法、8 个域（见 proposal），事件通知经 main 的统一 `jstudio-event` 总线广播。`scripts/sidecar-smoke.mjs` 是协议级冒烟（echo / settings 合并语义 / build info / pty_list / 未知方法错误 / stdout 静默断言 / PTY 事件生命周期）。

vite alias 已无条件把 `@tauri-apps/*` 指到 tauriShim——Tauri 壳已死，唯一存活的 Rust 就是 sidecar。用户已拍板：Node sidecar 子进程形态；parity 后删除全部 Rust。

## Goals / Non-Goals

**Goals:**

- Node sidecar 完整对等实现全部方法与事件，协议字节级形状不变。
- 原生能力（剪贴板图片）上移 Electron main，sidecar 保持纯 Node 零原生模块。
- 构建链路去 Cargo；打包去 sidecar 二进制；最终删除 `src-tauri/` 与 Tauri 依赖。
- 切换期可用环境变量一键回退到 Rust sidecar。

**Non-Goals:**

- 不改渲染层：44 个文件的 `@tauri-apps/*` import 与 tauriShim 模块面、`ipc.ts` 的方法签名全部保持（shim 重命名/收敛是后续清理）。
- 不改协议（不换 gRPC/HTTP，不合并到 ipcMain 直达）。
- 不借机重构任何业务行为；一切以"行为不变"为验收。

## Decisions

### D1. Node sidecar 运行方式：Electron 内置 Node（ELECTRON_RUN_AS_NODE）

`electron/sidecar.ts` 的 `Sidecar` 类保留两个实例：`nodeSidecar`（backend.cjs）与 `rustSidecar`（agent 宿主）。Node 侧 spawn 用 `process.execPath` + env `ELECTRON_RUN_AS_NODE=1`——Electron 二进制即 Node 运行时，**零新增运行时依赖**。dev 读 `dist-electron/backend.cjs`，打包放 `extraResources`（`ELECTRON_RUN_AS_NODE` 是纯 Node，**读不了 asar**，脚本必须落 asar 外）。

代码组织：`electron/backend/`（TypeScript，分域模块 + `index.mts` 路由器），并入现有 esbuild 步骤打包为 `dist-electron/backend.cjs`。分域文件与 Rust `commands/*` 一一对应，便于逐文件对照移植。

备选：并入 Electron main（用户已否决：PTY/阻塞 IO 会卡窗口事件）；独立系统 Node（引入版本管理负担，否决）。

### D1a. 双后端按方法静态路由（A2 修正）

`handleMainOnly` 之后、`rustSidecar.invoke` 之前插入路由：**`agent_` 前缀九法 → Rust 宿主；其余 → Node sidecar**。`JSTUDIO_BACKEND=rust` 时绕过分流全部走 Rust（旧行为回退，parity 全绿后移除该分支，静态双路由成为常态）。两个子进程随 main 启停，退出顺序不变（先 pty_kill_all —— Node 侧 —— 再停两个进程）。事件帧两路都进既有 `jstudio-event` 总线，label 语义不变。

### D2. 命令分流：原生方法走 main，其余走 sidecar

`tauriShim/core.ts` 的 `invoke()` 增加一张 **native 方法表**：`copy_image_to_clipboard`、`copy_image_bytes_to_clipboard` 命中时改调 preload 新通道 `nativeInvoke('copy-image-to-clipboard', …)` → main 用 `nativeImage.createFromPath/FromBuffer` + `clipboard.writeImage` 实现（字节版即本次会话已加的 `clipboard-write-image`，补路径版）。其余方法名原样 `sidecarInvoke`。`ipc.ts` 与各调用点零改动。

### D3. 逐域移植对照表（Rust → Node）

| Rust `commands/` | Node `electron/backend/` | 关键点 |
|---|---|---|
| storage/paths.rs（文档/索引/folders/设置/agent 配置/KV 中继/日志/打开目录） | `storage.ts` `kv.ts` `logs.ts` | **存储在 SQLite**（见 D9），不是平面 JSON；设置合并语义照抄 smoke 断言 |
| storage/assets.rs（资产/回收站） | `assets.ts` | 路径布局与 trash/restore 语义逐条对照 |
| storage/backups.rs（备份/快照） | `backups.ts` | 轮换规则照抄 |
| bundle.rs（.jnote export/import） | `bundle.ts` | zip 库用 `fflate`；**用真实 Rust 版 .jnote 做导入测试**；manifest 字段逐一对照 |
| terminal.rs（pty_* 9 法 + data/exit 事件） | `terminal.ts` | `node-pty`；事件名从 `terminal.rs` 的 `format!` 串里逐个抄；`pty_kill_all` + 有界等待的退出顺序保持 |
| agent.rs（agent_* 9 法 + 流事件） | `agent.ts` | 依旧 spawn `jcli`；stdout 解析与事件转发逻辑对照移植 |
| jcli.rs（check/install/uninstall） | `jcli.ts` | 下载/安装路径与版本探测逻辑对照 |
| fetch.rs / graph.rs（链接元数据 / ai_graph_fetch / 图表日志） | `fetch.ts` | Node `fetch`；响应形状对齐 |
| fonts（list_system_fonts） | `fonts.ts` | JXA（osascript -l JavaScript → AppKit availableFontFamilies），与 Rust CoreText 基线 **248/248 逐家族一致**；非 macOS 返回 [] |
| misc（echo/build_info/append_log/open_logs/clear_logs） | `index.mts` | 直接移植 |

### D4. 事件通知：协议帧原样转发

sidecar → main 的通知帧 `{event, label, payload}` 已由 `Sidecar` 类统一进 `jstudio-event` 总线；Node 版按相同事件名发帧即可，main 侧零改动。PTY data 高频帧注意**按行写 stdout + 立即 flush**（Node stdout 到 pipe 默认不阻塞，但需禁用任何缓冲/漂亮打印）。

### D5. node-pty 原生模块

新增依赖 `node-pty`，配 `electron-rebuild`（或 electron-builder 的 `npmRebuild`）针对 Electron ABI 重编译；`postinstall` 接入。这是 sidecar 唯一的原生依赖——它运行在 Electron Node 下，ABI 与 Electron 一致，可用。

### D6. 切换与回滚：JSTUDIO_BACKEND 开关

`JSTUDIO_BACKEND`（默认 `node`）：`rust` = 全部方法走 Rust sidecar（迁移前行为，一键回退）；`node` = D1a 静态分流。切换只需改环境变量重启；parity 全绿并观察后，删除阶段移除 `rust` 分支与开关读取，静态双路由固化。

### D7. 打包配置

electron-builder：`extraResources` 增加 `backend.cjs`（从 dist-electron 拷入），移除 sidecar 二进制资源与相关 afterPack 逻辑；`package.json` 删 `electron:build:sidecar(-release)`，`electron:build` 链条去 Cargo。dev 无需任何预构建步骤（esbuild 顺带产出 backend.cjs）。

### D8. 验收门禁顺序

1. 扩展 `sidecar-smoke.mjs`：全方法面往返 + 设置合并 + stdout 静默 + PTY 生命周期 + .jnote 往返（对 Node sidecar 跑）。
2. 真实 Rust .jnote 导入测试（迁移前先导出一份留样）。
3. 打包产物（asar 外 backend.cjs）启动全量走查：文档/资产/回收站/备份/预览窗口/终端/Agent/日志。
4. 以上全绿 → 执行删除阶段 → 复跑 1-3。

### D9. 存储层是 SQLite（实施期发现，修订原设计假设）

`~/.jdata/studio/studio.db`（WAL 模式）承载文档索引、folders、设置、备份、bundle、link 元数据、回收站记录等；`src-tauri/src/db/`（connection/schema/migrate/reconcile/backfill，~460 行）+ 各 command 内嵌 SQL 构成数据层。Node 侧：

- 驱动用 **node:sqlite**（DatabaseSync）——Electron 44 内置 Node 24.18 自带，**零原生模块、零 ABI 负担**。修订原因：better-sqlite3 未发布 Electron 44 预编译包，需引入 electron-rebuild 从源码编译（每个 Electron 升级都要重编）；实测 node:sqlite 在 ELECTRON_RUN_AS_NODE 下 WAL + 预编译语句全部可用（任务实施期验证）。API 形状（prepare/run/get/all）与 better-sqlite3 同构，逐行移植 SQL 不受影响。
- `schema.rs` 的 DDL 与 `migrate.rs` 的版本化迁移**逐行移植**：用户机器上的库已存在且带 `schema_version`，Node 版迁移链必须与之完全一致，否则启动即断。`reconcile.rs` / `backfill.rs`（漂移修复 / 旧 JSON 回填）一并移植以保健壮性。
- WAL、连接参数照抄 `connection.rs`。

## Risks / Trade-offs

- [node-pty 与 Electron ABI 不匹配] → electron-rebuild 进 postinstall；CI/本地 `npm install` 后立即 smoke PTY 域。
- [ELECTRON_RUN_AS_NODE 读不了 asar] → backend.cjs 强制 extraResources（asar 外）；打包产物启动验证必查。
- [ZIP 细节差异（manifest 字段、路径分隔符、压缩方式）导致旧包导入失败] → fflate 保留原始 entry 名；用 Rust 版留样包做导入门禁；import 兼容层允许两种来源。
- [list_system_fonts 输出形状对不齐] → 先抓 Rust 实现的枚举目录与排序规则再移植；渲染层消费点做截图对照。
- [PTY 高频输出冲垮 stdout 协议] → 事件帧独立小消息 + 行式写出；smoke 的 stdout 静默断言在 PTY 压测场景下跑。
- [迁移期双实现漂移] → 对照表（D3）逐文件移植并勾选；parity 冒烟覆盖每个方法后才允许翻默认后端。
- [SQLite 迁移链/schema_version 不一致导致用户库打不开] → DDL 与 migrate.rs 逐行对照移植；对现有真实 studio.db 只读验证 schema_version 后再写。
- [链接元数据抓取的 TLS 策略偏差] → Rust 客户端接受无效证书（danger_accept_invalid_certs）；Node fetch 无法按请求放宽且进程级开关会同时削弱 ai_graph（Rust 侧是校验的），故 Node 侧统一严格校验——坏证书站点元数据抓取失败（罕见，可接受的安全改进，已在 PORTING.md 记录）。
- [打包后 node-pty require 失败] → backend.cjs 与 node_modules/node-pty 一起放 extraResources 的 backend/ 目录（asar 外），require 从同目录 node_modules 解析；打包产物启动必查。
- [删除阶段误删仍在用的东西] → 删除前 grep 全仓对 `src-tauri`/`tauri` 的引用清单化；删除后复跑全部门禁。

## Migration Plan

1. 留样：导出一份真实 .jnote + 记录 `get_build_info`/字体列表等输出基线。
2. 建 `electron/backend/` 骨架 + 协议路由，逐域移植（D3 表）。
3. smoke 扩展并对 Node sidecar 全绿。
4. 翻 `JSTUDIO_BACKEND=node` 默认，打包验证，观察期。
5. 瘦身：Rust 路由移除已迁走命令、删除 Tauri 应用壳残留、移除 `rust` 回退分支；复跑门禁。

## Open Questions

（无——后端形态已拍板为 Node sidecar；删除范围与时机已在 proposal 中明确。）
