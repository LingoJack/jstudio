<div align="center">

# JStudio

**离线优先的 Notion 风格本地笔记应用**

基于 Electron（Chromium）+ Node/Rust 双后端 + React 19 的桌面应用，所有数据存储在本地（SQLite + 文件系统），无云端依赖。

</div>

---

## 特性

- **块编辑器** — Notion 风格的统一 surface 模式，支持文本、标题、Callout、Toggle、代码块、表格、图片、画布、白板、Web 嵌入、附件等多种块类型
- **离线优先** — 全部数据存储在本地 `~/.jdata/studio/`（SQLite 数据库 + 文件系统），无服务器、无云端同步
- **内置终端** — 基于 xterm.js + node-pty，可在应用内直接执行命令
- **Markdown 快捷输入** — `# ` 自动转标题、`/` 唤出 Slash 命令菜单
- **暗色 / 亮色主题** — VSCode 风格 CSS 变量体系
- **跨平台** — macOS / Windows / Linux（基于 Electron）

## 技术栈

| 层 | 技术 |
|----|------|
| 桌面框架 | Electron (Chromium) |
| 后端 | Node sidecar（stdio JSON-RPC）+ Rust agent 宿主（j_agent 引擎） |
| 前端 | React 19 + TypeScript (strict) |
| 构建 | Vite 6 + esbuild（main/preload/backend 打包） |
| 状态管理 | Zustand (slice 模式) |
| 样式 | Tailwind CSS v4 |
| 编辑器内核 | TipTap v3 (ProseMirror) |
| 画板/图表内核 | maxGraph（自研 `jgraph` 快照格式） |
| 数据库 | SQLite (`node:sqlite`, WAL 模式) |
| 图标 | lucide-react |
| 终端 | xterm.js + node-pty |

## 后端架构

```
renderer invoke(method, params)
  └─ Electron main 按方法名路由
       ├─ agent_* 九法 ──────── Rust sidecar（j_agent 引擎宿主，stdio JSON-RPC）
       └─ 其余全部命令 ────────── Node sidecar（electron/backend/，ELECTRON_RUN_AS_NODE 运行）
            ├─ 存储域（documents/folders/settings，node:sqlite + WAL）
            ├─ 资产 / 回收站 / 备份 / 快照
            ├─ .jnote 捆绑包（fflate）
            ├─ 终端 PTY（node-pty）
            └─ jcli 管理 / 链接元数据 / 字体枚举 / 日志 / KV 中继
```

- 方法面清单见 `electron/backend/PORTING.md`（方法 → 参数 → 返回 → Rust 源 对照表）
- 剪贴板图片等原生能力由 Electron main 直接承担（`nativeImage` + 异步 `ClipboardItem`）

## 快速开始

### 环境要求

- **Node.js** >= 20
- **Rust** (stable toolchain) — 仅用于构建 agent 宿主 sidecar（[安装指南](https://rustup.rs/)）
- **macOS**: Xcode Command Line Tools (`xcode-select --install`)，node-pty 编译需要

### 安装 & 运行

```bash
# 1. 安装依赖（postinstall 会跑 electron-rebuild 编译 node-pty）
npm install

# 2. 开发模式（vite + Node/Rust sidecar + Electron，热重载）
npm run electron:dev
# 或
make dev

# 3. 构建生产版本（.app/.dmg）
npm run electron:build
# 或
make build
```

> 前端开发服务器运行在 `http://127.0.0.1:1420`。

## 常用 Make 命令

项目内置了一个功能完整的 `Makefile`：

| 命令 | 说明 |
|------|------|
| `make dev` | 启动开发模式 |
| `make build` | 构建应用 |
| `make install` | 构建并安装到 `/Applications`（macOS） |
| `make uninstall` | 卸载应用 |
| `make fmt` | 格式化代码（前端 + Rust） |
| `make lint` | 代码检查（tsc + clippy） |
| `make test` | 运行测试 |
| `make clean` | 清理构建产物 |
| `make bump-version` | 递增 patch 版本号 |
| `make set-version V=1.0.0` | 设置指定版本号 |
| `make help` | 查看所有可用命令 |

## 数据存储

规范存储（canonical store）是本地 **SQLite** 数据库；大二进制资源与写前备份仍留在文件系统：

```
~/.jdata/studio/
├── studio.db                # SQLite 数据库（WAL 模式）
│   ├── documents            # 文档元数据 + 正文（body 列）
│   ├── folders               # 文件夹树
│   ├── settings               # 应用设置（key/value，value 为 JSON 字符串）
│   ├── deleted_documents      # 已删除文档的墓碑记录
│   └── trashed_assets         # 资源回收站记录
├── *.json.bak                # 旧版 JSON 文件迁移后的备份（index/folders/settings）
└── documents/
    └── {docId}/              # 每篇文档独立文件夹
        ├── document.json     # 遗留内容文件（迁移/灾难恢复回退路径，正文已迁至 DB）
        ├── .backups/          # 写前自动快照（覆盖前备份，默认保留最近 50 份）
        └── assets/            # 文档私有资源（图片等，不进数据库）
```

- **数据库为规范存储**：文档正文、元数据、文件夹树、设置均以 SQLite 表持久化，启用 WAL 支持多窗口并发读，写路径使用事务保证一致性
- **文件系统仅存二进制与备份**：文档私有资源（图片等）与写前备份留在文件系统，不适合塞进数据库行
- **JSON 文件仅作迁移来源与回退路径**：应用首次启动时会将旧版 `index.json`/`folders.json`/`settings.json` 一次性导入数据库并重命名为 `*.json.bak`；`document.json` 在正文迁移前也作为 `read_document` 的回退路径
- **孤儿文档自愈**：启动时会扫描 `documents/` 目录，找回存在于磁盘但未注册到数据库的文档（跳过用户已删除的墓碑 id）

## 项目结构

```
jstudio/
├── src/                        # 前端源码 (React + TypeScript)
│   ├── App.tsx                 # 根组件
│   ├── components/              # 视图层：容器组件 / 节点视图 / 通用 UI
│   │   ├── editor/              # 编辑器主体、节点视图（含 graph/ 画板）
│   │   ├── documents/           # 文档侧边栏 / 文件夹树
│   │   ├── terminal/            # 内置终端
│   │   └── ...
│   ├── store/                  # Zustand store (slice 模式)
│   ├── lib/                    # 逻辑层：core/ipc、editor、documents、i18n 等
│   └── types/                  # TypeScript 类型定义
├── electron/                   # Electron 壳 + 双后端
│   ├── main.ts                 # 主进程：窗口/菜单/路由（agent_*→Rust，其余→Node）
│   ├── preload.ts              # 唯一 renderer↔main 桥（contextIsolation）
│   ├── sidecar.ts              # sidecar 子进程管理（stdio JSON-RPC）
│   └── backend/                # Node sidecar（PORTING.md = 方法面对照表）
│       ├── storage.ts          # 文档/文件夹/设置（node:sqlite + WAL）
│       ├── assets.ts           # 资产 / 回收站 / markdown 扫描
│       ├── bundle.ts           # .jnote 捆绑包（fflate）
│       ├── terminal.ts         # PTY（node-pty）
│       └── ...
└── src-tauri/                  # Rust agent 宿主（仅 agent_* 九法 + j_agent 引擎）
    └── src/bin/sidecar.rs      # stdio JSON-RPC 传输 + 方法分发
```

> 完整的开发规范见 [AGENTS.md](./AGENTS.md)。

## 构建 DMG 分发包（macOS）

本节说明如何将 JStudio 打包为 `.dmg` 安装镜像并分发给其他 macOS 用户。

### 基础构建（生成 .app / .dmg）

```bash
npm run electron:build
# 或
make build
```

产物路径：

```
dist-electron-builder/
├── mac-arm64/JStudio.app      # macOS 应用包
├── JStudio-0.1.0-arm64.dmg    # DMG 安装镜像
└── JStudio-0.1.0-arm64.zip    # zip 分发版
```

### 签名与公证（给其他人使用的关键步骤）

未签名的 `.dmg` 在 macOS 上会被 Gatekeeper 拦截，用户会看到 **「无法打开，因为来自身份不明的开发者」**。
要让其他人顺利使用，必须完成 **代码签名 (Code Signing) + 公证 (Notarization)**。

electron-builder 支持标准的 Apple 签名环境变量，在 `~/.zshrc` 或 `~/.bashrc` 中设置：

```bash
export CSC_LINK="Developer ID Application: Your Name (TEAMID)"   # 证书名或 .p12 路径
export CSC_KEYCHAIN="login"                                       # 可选：钥匙串
export APPLE_ID="youremail@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"          # App-Specific Password
export APPLE_TEAM_ID="TEAMID"
```

然后正常执行 `npm run electron:build`：electron-builder 检测到这些变量后会自动对 `.app` 与 `.dmg`
签名、提交 Apple 公证并 staple 票据。

#### 验证签名（可选）

```bash
codesign -dv --verbose=4 dist-electron-builder/mac-arm64/JStudio.app
xcrun stapler validate dist-electron-builder/mac-arm64/JStudio.app
```

### 无签名分发的临时方案

如果没有 Apple 开发者账号，直接使用 `npm run electron:build` 产出的未签名包：
用户首次打开时需右键 → **「打开」**，或在 **系统设置 → 隐私与安全性** 中点击 **「仍要打开」**。

> 分发 `.dmg` 文件即可，用户拖拽到 Applications 安装。

## 开发规范

- 前端禁止直接调用 `invoke`，所有后端 IPC 通过 `src/lib/core/ipc.ts`
- 新增后端方法：在 `electron/backend/` 对应域实现 + 更新 `electron/backend/PORTING.md` + 扩展 `scripts/sidecar-smoke.mjs`（agent 域除外——agent 方法留在 Rust 宿主）
- 状态管理通过 Zustand slice，不在组件内直接修改 store
- 块组件只做展示，编辑逻辑在 `useSurfaceEditor` 统一处理
- 使用 Tailwind CSS v4 + VSCode 主题 CSS 变量，不硬编码颜色

## 许可证

私有项目，保留所有权利。
