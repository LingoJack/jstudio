# Spec Delta

## Purpose

定义去 Rust 之后后端命令运行时（Node sidecar + Electron main 原生层）的行为契约：stdio JSON-RPC 协议形状、方法面行为对等、终端 PTY 与 Agent 事件流、.jnote 捆绑包格式兼容、原生能力归属、无 Rust 构建打包，以及退出清理顺序。验收原则是**用户可见行为与迁移前完全一致**。

## ADDED Requirements

### Requirement: 进程形态与协议形状

后端 SHALL 由双子进程承载，main 的 `sidecar-invoke` 通道按方法名静态路由：**Node sidecar**（Electron 内置 Node 以 `ELECTRON_RUN_AS_NODE` 运行，不要求独立 Node 运行时）承载 agent 域以外全部方法；**Rust sidecar（agent 宿主）**承载 `agent_*` 九法（内嵌 j_agent 引擎）。协议为 stdio 换行分隔 JSON：请求 `{id, method, params}`，响应 `{id, result?|error?}`，通知 `{event, label?, payload?}`；两个子进程的 stdout SHALL 只承载协议帧——任何非 JSON 行都视为协议破坏。切换期 `JSTUDIO_BACKEND=rust` SHALL 使全部方法回退到 Rust sidecar（旧行为），parity 全绿后默认 node 路由。渲染层、preload、main 的既有调用链 MUST 保持不变（`invoke(方法名, 参数)` 语义一致）。

#### Scenario: 方法调用路由正确
- **WHEN** 渲染层调用 `read_settings`（Node 域）或 `agent_send_message`（Rust 域）
- **THEN** 请求分别到达 Node sidecar / Rust agent 宿主，返回 `{id, result}`，结果与迁移前同方法一致

#### Scenario: 未知方法报错
- **WHEN** 调用不存在的方法名
- **THEN** 返回 `{id, error}`，渲染层 Promise reject

#### Scenario: stdout 协议纯净
- **WHEN** 任一子进程处理命令、输出日志、推送事件
- **THEN** 其 stdout 每一行都是合法协议 JSON（冒烟脚本断言），日志只走 stderr

### Requirement: 方法面行为对等

Rust sidecar 现有的 **agent 域以外**全部方法 SHALL 在 Node sidecar 中以相同入参/出参/错误语义实现，覆盖：studio 目录与文档读写、索引与文件夹、设置（含合并语义）、agent 配置文件、文档资产、资产回收站、正文备份、编辑器快照、预览/图表/终端分离负载的内存 KV 中继、日志（append/路径/清理/打开目录）、构建信息、markdown 文件列举、链接元数据抓取、AI 图谱抓取、图表日志。设置写入的**合并语义**（部分字段更新不覆盖其余字段）MUST 保持。

#### Scenario: 各域冒烟通过
- **WHEN** 对每个方法域执行代表性调用（读/写/删除/列举往返）
- **THEN** 结果与 Rust 版行为一致（同文件系统效果、同返回形状）

#### Scenario: 设置合并语义
- **WHEN** 写入仅含部分字段的设置对象
- **THEN** 未提及的字段保持原值（与 `sidecar-smoke` 既有断言一致）

### Requirement: 终端 PTY 会话语义

Node sidecar SHALL 用等价 PTY 能力（node-pty）实现 `pty_create / pty_write / pty_write_batch / pty_resize / pty_kill / pty_kill_all / pty_list / pty_set_title / pty_is_alive`，并按原有事件名推送 data/exit 通知。应用退出时 SHALL 先请求 `pty_kill_all`（有界等待）再停止 sidecar，避免孤儿 PTY。PTY 输出 MUST NOT 污染协议 stdout。

#### Scenario: 终端会话生命周期
- **WHEN** `pty_create` → 收到 data 事件 → `pty_kill`
- **THEN** 事件按原名称与顺序到达，kill 后收到 exit 事件

#### Scenario: 退出清理
- **WHEN** 用户在终端开启时退出应用
- **THEN** 全部 PTY 先被请求终止（有界等待），随后 sidecar 进程停止

### Requirement: Agent 域保留 Rust 宿主

`agent_list_sessions / agent_create_session / agent_load_session / agent_delete_session / agent_send_message / agent_tool_result / agent_cancel / agent_set_auto_approve / agent_submit_ask_answer` SHALL 继续由 Rust sidecar（内嵌 j_agent 引擎）承载，路由改造前后行为 MUST 完全一致：会话持久化位置与格式不变，流式事件经原有通知形态转发。Node sidecar MUST NOT 实现这九个方法。

#### Scenario: 路由切换后 agent 行为不变
- **WHEN** 默认路由为 node 后执行 创建会话 → 发消息 → 流式事件 → cancel
- **THEN** 事件与落盘结果与迁移前一致（请求由 Rust 宿主处理）

### Requirement: .jnote 捆绑包格式兼容

Node 版 `export_document_bundle` / `import_document_bundle` SHALL 产出与接受相同的 ZIP 结构（document.json + assets/ + manifest）：**Rust 版导出的 .jnote 必须能被 Node 版导入**，Node 版导出的包也 MUST 能被读回（往返无损）。

#### Scenario: 旧包导入
- **WHEN** 导入一个由 Rust 版导出的 .jnote 文件
- **THEN** 文档正文与全部资产完整还原

#### Scenario: 往返无损
- **WHEN** Node 版导出后立即导入同一包
- **THEN** 文档与资产与导出前一致

### Requirement: 原生能力由 Electron main 承担

依赖 OS 原生 API 的操作 SHALL 在 Electron main 进程实现，sidecar 内不引入原生模块：图片写剪贴板（`copy_image_to_clipboard` 文件路径版与字节版）经 main 的 `nativeImage` 完成；文件对话框、窗口操作维持 main 现状。invoke shim 对这些方法名分流到 main，渲染层调用方式不变。

#### Scenario: 图片复制（文件与字节两条路径）
- **WHEN** ImageView 复制图片文件、或 mermaid 复制按钮复制 canvas 导出的 PNG
- **THEN** 系统剪贴板中出现该图片，行为与迁移前一致

### Requirement: 构建打包与遗留清理

dev 运行、`npm run build` 与 electron-builder 打包 SHALL 不再依赖 Tauri 应用壳：Tauri 壳残留（lib.rs / main.rs / tauri.conf.json 等）删除，`src-tauri` 仅保留 Rust sidecar bin（agent 宿主）及其依赖；Node backend 以 JS 形态随应用分发（asar 外资源，保证 `ELECTRON_RUN_AS_NODE` 子进程可读）；Cargo 工具链仅为构建 agent 宿主保留。parity 全绿后 Rust 路由中已迁走的命令 SHALL 移除，`JSTUDIO_BACKEND` 回退分支移除。

#### Scenario: 干净环境构建
- **WHEN** 在未安装 Tauri 依赖的机器上执行安装、dev、build、打包
- **THEN** 全部成功（Cargo 仅构建 agent 宿主 sidecar），打包产物启动后文档/终端/Agent/预览窗口功能正常

#### Scenario: 瘦身后无死路由
- **WHEN** Rust sidecar 瘦身后渲染层调用任一已迁走的方法
- **THEN** 请求由 Node sidecar 处理并成功返回，Rust 宿主不收到该请求

### Requirement: 行为回归基线

除本变更明确列出的内部形态变化外，任何用户可见行为 MUST 与迁移前一致：文档编辑与保存、资产管理与回收站、备份与快照、预览窗口、终端、Agent 对话、日志排查。回归验证 SHALL 覆盖上述各域的手工全量走查，并以 `scripts/sidecar-smoke.mjs`（扩展至全方法面）作为协议级门禁。

#### Scenario: 冒烟门禁
- **WHEN** 对 Node sidecar 运行扩展后的 sidecar-smoke（全方法面 + stdout 静默断言 + PTY 事件）
- **THEN** 全部断言通过（退出码 0）

#### Scenario: 真机全量走查
- **WHEN** 按回归清单在打包产物上逐域手工验证
- **THEN** 未发现与迁移前的行为差异
