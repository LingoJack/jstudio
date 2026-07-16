<!--
  Sync Impact Report
  ==================
  Version change: 1.0.0 → 2.0.0
  Reason: MAJOR — Principle I redefined. The previous "离线优先 /
  纯文件系统 JSON 存储" description was factually wrong: the app has
  migrated its canonical store to SQLite (`~/.jdata/studio/studio.db`,
  see `src-tauri/src/db/`). JSON files are now only a legacy migration
  source / recovery backup, not the primary store. This is a backward
  -incompatible redefinition of a core principle, not a clarification.
  Also added a new principle (V) covering graph-model cycle tolerance
  ("Circularity"), which was previously undocumented and could have
  been mistaken for a bug if a contributor assumed the whole app is a
  strict acyclic tree.

  Modified principles:
    - I. 离线优先 (Offline-First, JSON-only) → I. 混合持久化架构
      (Hybrid Persistence: SQLite + Filesystem)
    - (II–IV unchanged in substance; renumbered position preserved)

  Added principles:
    - V. 图模型允许环 (Graph Model Permits Cycles) — new
    - VI. 类型安全与代码质量 (was V, renumbered)

  Removed sections: None

  Templates requiring updates:
    - .specify/templates/plan-template.md — ✅ no change needed (generic gate)
    - .specify/templates/spec-template.md — ✅ no change needed
    - .specify/templates/tasks-template.md — ✅ no change needed
    - .codebuddy/commands/speckit.*.md — ✅ no outdated references found

  Follow-up TODOs:
    - README.md still states "无数据库" / "纯文件系统 JSON 存储" —
      this is now outdated given the SQLite migration and SHOULD be
      corrected in a follow-up doc PR (not done here; out of scope for
      constitution update, flagged for manual follow-up).
-->

# JStudio Constitution

## Core Principles

### I. 混合持久化架构 (Hybrid Persistence: SQLite + Filesystem)

JStudio 的规范存储（canonical store）是本地 **SQLite** 数据库
（`~/.jdata/studio/studio.db`，`rusqlite` + `bundled` feature），而非纯
JSON 文件。文档正文、元数据、文件夹树、设置项均以数据库表持久化：

- `documents`（含 `body` 列存正文）、`folders`、`settings`（key/value，
  value 为 JSON 编码字符串）、`deleted_documents`（删除墓碑）、
  `trashed_assets`（资源回收站记录）。
- 数据库连接 MUST 通过全局单例（`Mutex<Connection>`）访问，启用 WAL
  journal mode 以支持多窗口并发读。
- 所有写路径 MUST 使用事务（`transaction()`），批量写入 MUST 在单个
  事务内完成，避免部分写入导致状态不一致。
- 文档私有二进制资源（图片等）与写前备份（`.backups/`）MUST 保留在
  文件系统（`documents/{docId}/assets/`、`documents/{docId}/.backups/`），
  不进数据库——大二进制数据不适合塞进 SQLite 行。
- 遗留 JSON 文件（`index.json`/`folders.json`/`settings.json`/
  `document.json`）仅作为**一次性迁移来源**与**灾难恢复回退路径**
  （`read_document` 的 legacy fallback、孤儿文档 reconcile）。迁移成功
  后原文件 MUST 重命名为 `*.json.bak`，不得删除。新功能 MUST NOT 反向
  依赖 JSON 文件作为主存储。
- 任何引入网络依赖（云端同步、远程 API、在线服务）的提案 MUST 在
  Constitution Check 阶段明确标注并证明其必要性——本地优先（local
  -first）而非纯文件系统是不可动摇的边界。

**Rationale**: SQLite 提供事务性、索引查询与并发读能力，解决了纯 JSON
索引文件在大量文档下的性能与一致性问题，同时保留本地优先、无云端
依赖的产品定位。

### II. 分层架构与单向依赖 (Layered Architecture & Unidirectional Dependencies)

源码 MUST 遵循 `components/` → `lib/` 的单向依赖方向。

- `src/lib/` = 逻辑层：可复用纯逻辑——纯函数、store 适配、tiptap 扩展
  定义、内容转换、主题/快捷键/命令注册、i18n、常量。不含业务容器组件。
- `src/components/` = 视图层：所有 React 组件——容器组件、节点视图
  （`nodes/*`）、通用 UI（`ui/*`）、布局、多窗口入口、设置页、Agent 面板。
- `lib/` MUST NOT 反向 import `components/` 的业务组件。
- 唯一例外：与某个 tiptap 扩展 / suggestion 插件强绑定、且被 `lib/` 侧
  渲染的 React UI，可留在 `lib/editor` 对应目录（如 `slashMenu/`）。
- 巨型文件红线：单文件 > 400 行（组件）/ > 500 行（逻辑）SHOULD 拆分。

**Rationale**: 单向依赖保障可测试性与可维护性，避免循环依赖与逻辑泄漏。

### III. IPC 封装 (Encapsulated IPC)

前端 MUST NOT 直接调用 Tauri `invoke`；所有 Tauri IPC MUST 通过
`src/lib/core/storage.ts` 统一封装层访问。

- Rust 命令 MUST 返回 `Result<T, String>`，错误以字符串形式上抛。
- 新增 Rust 命令 MUST 在 `src-tauri/src/lib.rs` 注册。
- 封装层负责类型安全转换、错误处理与调用约束，禁止在组件或 store 中
  绕过封装层直接 IPC。

**Rationale**: 集中化 IPC 封装统一类型契约与错误处理，降低前后端耦合，
便于审计与演进。

### IV. 状态管理纪律 (State Management Discipline)

全局状态 MUST 通过 Zustand slice 模式管理；组件 MUST NOT 直接修改
store。

- 块组件（`blocks/*`、`nodes/*`）MUST 只做展示，编辑逻辑 MUST 统一在
  `useSurfaceEditor` 处理。
- Store slice 之间 SHOULD 避免循环依赖；跨 slice 协作通过显式 action。
- 组件内局部状态可用 React state，但跨组件共享状态 MUST 进 store。

**Rationale**: 统一状态入口避免数据流混乱，保障编辑器一致性与可预测性。

### V. 图模型允许环 (Graph Model Permits Cycles)

**画板/图表块（graph block，maxGraph 内核）的数据模型是通用的
node+edge 图，MUST 允许环（circularity）与自环（self-loop）**——它不是
树、也不是 DAG。用户可以合法绘制流程图回边、时序图往返消息、UML
关联环等结构；序列化（`GraphSnapshot`）、反序列化与撤销/重做 MUST NOT
假设无环，MUST NOT 引入基于拓扑排序或"祖先检测"的环检查来拒绝合法
输入。

与此相对，以下结构 MUST 保持严格无环（strict acyclic tree），因为它们
承载层级语义而非自由拓扑：

- **文件夹树**（`folders` 表，`parentId` 链）：当前前端未提供"重新挂载
  文件夹到其子孙"的操作，无环性由创建时的初始父子关系隐式保证。若
  未来新增文件夹拖拽重挂载功能，MUST 在写入前做环检测（祖先链遍历），
  防止 `collectDescendantFolderIds` 之类的 BFS/DFS 遍历因环而死循环。
- **组件依赖方向**（见原则 II）：`components/` → `lib/` 单向。

**Rationale**: 混淆"图表块内部的自由图"与"应用层级结构（文件夹/依赖）"
会导致两类错误：一是在图表块里错误地加环检测拒绝用户合法输入；二是在
层级结构里疏于环检测导致遍历死循环或数据损坏。两者的正确性要求截然
相反，必须在设计与代码评审中明确区分。

### VI. 类型安全与代码质量 (Type Safety & Code Quality)

TypeScript MUST 启用 strict 模式；样式 MUST 使用 Tailwind CSS v4 +
VSCode 主题 CSS 变量，禁止硬编码颜色值。

- 所有新增代码 MUST 通过 `tsc`（strict）与 `clippy`（Rust）检查。
- 提交 PR 前 MUST 运行 `npm run knip` 确认无新增未用导出。
- 运行 `npm run fmt` 与 `npm run lint` 通过后方可合并。
- 公共 API 与类型定义 SHOULD 有文档注释。

**Rationale**: strict 类型与统一样式体系是防止回归、保障协作一致性的
基线门禁。

## 技术栈与约束 (Technology Stack & Constraints)

| 层 | 技术 | 约束 |
|----|------|------|
| 桌面框架 | Tauri v2 (Rust + WebView) | 跨平台 macOS / Windows / Linux |
| 前端 | React 19 + TypeScript (strict) | strict 模式强制 |
| 构建 | Vite 6 | 开发服务器 `http://127.0.0.1:1420` |
| 状态管理 | Zustand (slice 模式) | 禁止组件直接修改 store |
| 样式 | Tailwind CSS v4 | + VSCode 主题 CSS 变量，禁止硬编码颜色 |
| 编辑器内核 | TipTap v3 (ProseMirror) | 编辑逻辑统一于 `useSurfaceEditor` |
| 画板/图表内核 | maxGraph（自研 `jgraph` 快照格式，旧内核 Excalidraw 兼容读取） | 允许环，见原则 V |
| 数据库 | SQLite（`rusqlite` + `bundled`，WAL 模式） | 规范存储，见原则 I |
| 图标 | lucide-react | — |
| 终端 | xterm.js + portable-pty | — |

- 运行环境：Node.js >= 20，Rust stable toolchain。
- 引入新依赖 MUST 评估体积、维护性与安全风险；优先复用现有依赖。
- 安全基线：SQLite 查询 MUST 使用参数绑定（`rusqlite::params!`），
  禁止字符串拼接 SQL；Rust 命令做权限与所有权校验；前端对用户输入做
  转义（XSS）；避免 shell 执行（RCE）；敏感信息仅限环境变量。

## 开发流程与质量门禁 (Development Workflow & Quality Gates)

- **分支**：特性开发使用 `###-feature-name` 分支，基于 `main`。
- **质量门禁**（合并前 MUST 全部通过）：
  1. `npm run lint`（tsc strict + clippy）无错误；
  2. `npm run fmt` 已执行（前端 + Rust 格式化）；
  3. `npm run knip` 无新增未用导出；
  4. `npm test`（若存在相关测试）通过；
  5. 新增/变更符合分层架构与单向依赖约束（原则 II）；涉及文件夹/图表
     数据结构的改动符合原则 V 的环语义要求。
- **代码审查**：PR MUST 验证 Constitution 合规性；复杂度 MUST 有正当
  理由（填入 plan.md 的 Complexity Tracking 表）。
- **文档同步**：架构变更 MUST 同步更新 `docs/architecture.md`；
  新增块类型参考 `docs/how-to-add-block-type.md`。
- **提交规范**：每个任务或逻辑分组后提交一次；停止于 checkpoint 时
  独立验证当前 user story。

## Governance

本 Constitution 凌驾于所有其他实践与文档之上。任何与原则冲突的实践
MUST 以 Constitution 为准，或通过修正案程序正式修订。

- **修正案程序**：修订 MUST 包含（1）变更说明、（2）影响评估、
  （3）迁移计划、（4）版本号变更依据。
- **版本策略**：遵循语义化版本——
  - MAJOR：移除或重新定义原则（向后不兼容的治理变更）；
  - MINOR：新增原则/章节或实质性扩展指导；
  - PATCH：澄清、措辞、笔误、非语义性修订。
- **合规审查**：所有 PR / 代码审查 MUST 验证 Constitution 合规性；
  违规 MUST 在 Complexity Tracking 表中注明理由或阻止合并。
- **运行时指导**：开发时参考 `README.md` 与 `docs/architecture.md`
  获取目录边界与开发规范细节。**注意**：`README.md` 当前仍描述"无
  数据库 / 纯 JSON 存储"，与本 Constitution 原则 I 不一致，已知
  待修（TODO(README_SYNC): 需单独 PR 更新 README 的存储描述章节）。

**Version**: 2.0.0 | **Ratified**: 2026-07-16 | **Last Amended**: 2026-07-16
