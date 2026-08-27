<div align="center">

# JStudio

**离线优先的 Notion 风格本地笔记应用**

基于 Electron（Chromium）+ Rust sidecar + React 19 的桌面应用，所有数据存储在本地（SQLite + 文件系统），无云端依赖。

</div>

---

## 特性

- **块编辑器** — Notion 风格的统一 surface 模式，支持文本、标题、Callout、Toggle、代码块、表格、图片、画布、白板、Web 嵌入、附件等多种块类型
- **离线优先** — 全部数据存储在本地 `~/.jdata/studio/`（SQLite 数据库 + 文件系统），无服务器、无云端同步
- **内置终端** — 基于 xterm.js + portable-pty，可在应用内直接执行命令
- **Markdown 快捷输入** — `# ` 自动转标题、`/` 唤出 Slash 命令菜单
- **暗色 / 亮色主题** — VSCode 风格 CSS 变量体系
- **跨平台** — macOS / Windows / Linux（基于 Electron）

## 技术栈

| 层 | 技术 |
|----|------|
| 桌面框架 | Electron (Chromium) + Rust sidecar (stdio JSON-RPC) |
| 前端 | React 19 + TypeScript (strict) |
| 构建 | Vite 6 |
| 状态管理 | Zustand (slice 模式) |
| 样式 | Tailwind CSS v4 |
| 编辑器内核 | TipTap v3 (ProseMirror) |
| 画板/图表内核 | maxGraph（自研 `jgraph` 快照格式） |
| 数据库 | SQLite (rusqlite, WAL 模式) |
| 图标 | lucide-react |
| 终端 | xterm.js + portable-pty |

## 快速开始

### 环境要求

- **Node.js** >= 20
- **Rust** (stable toolchain) — [安装指南](https://rustup.rs/)
- **Tauri v2 系统依赖**：
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`)
  - **Linux**: `webkit2gtk`, `libgtk-3`, `libappindicator` 等（参考 [Tauri Prerequisites](https://v2.tauri.app/start/prerequisites/))
  - **Windows**: WebView2 runtime (Windows 10+ 默认已安装)

### 安装 & 运行

```bash
# 1. 安装前端依赖
npm install

# 2. 开发模式（vite + Rust sidecar + Electron，热重载）
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
│   ├── lib/                    # 逻辑层：core/storage、editor、documents、i18n 等
│   └── types/                  # TypeScript 类型定义
└── src-tauri/                  # Rust 后端
    ├── tauri.conf.json         # Tauri 配置
    └── src/
        ├── lib.rs              # 插件注册 + 命令绑定
        ├── db/                 # SQLite 数据层（schema / connection / 迁移 / 孤儿回收）
        └── commands/storage/   # 存储命令（documents/folders/settings 走 SQLite，assets/backups 走文件系统）
```

> 完整的开发规范见 [AGENTS.md](./AGENTS.md)。

## 构建 DMG 分发包（macOS）

本节说明如何将 JStudio 打包为 `.dmg` 安装镜像并分发给其他 macOS 用户。

### 基础构建（生成 .app）

```bash
npm run tauri:build
```

产物路径：
```
src-tauri/target/release/bundle/
├── macos/JStudio.app          # macOS 应用包
├── dmg/JStudio_0.1.0_x64.dmg  # DMG 安装镜像（默认会自动生成）
└── ...
```

### 签名与公证（给其他人使用的关键步骤）

未签名的 `.dmg` 在 macOS 上会被 Gatekeeper 拦截，用户会看到 **「无法打开，因为来自身份不明的开发者」**。
要让其他人顺利使用，必须完成 **代码签名 (Code Signing) + 公证 (Notarization)**：

#### 1. 获取 Apple 开发者证书

| 项目 | 说明 | 费用 |
|------|------|------|
| Apple Developer Program | 注册 [developer.apple.com](https://developer.apple.com/programs/) | $99/年 |
| Developer ID Application | 用于签名分发到 App Store 之外的应用 | 包含在会员资格中 |

注册后在「Certificates, Identifiers & Profiles」中创建 **Developer ID Application** 证书，安装到钥匙串。

#### 2. 获取 App-Specific Password（公证用）

1. 登录 [appleid.apple.com](https://appleid.apple.com/) → App-Specific Passwords
2. 生成一个专用密码，记录你的 **Apple ID** 和这个密码

#### 3. 配置 Tauri 签名信息

在 `~/.zshrc` 或 `~/.bashrc` 中设置环境变量：

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"
export APPLE_ID="youremail@example.com"
export APPLE_PASSWORD="xxxx-xxxx-xxxx-xxxx"      # App-Specific Password
export APPLE_TEAM_ID="TEAMID"                      # 开发者团队 ID
```

#### 4. 构建 + 自动签名 + 自动公证

```bash
npm run tauri:build
```

Tauri v2 检测到上述环境变量后会自动：
1. 用 `codesign` 对 `.app` 签名
2. 用 `codesign` 对 `.dmg` 签名
3. 提交到 Apple 进行公证 (Notarize)
4. Staple 公证票据 (Staple)

完成后生成的 `.dmg` 即可直接分发给其他 macOS 用户，双击安装不会被拦截。

#### 5. 验证签名（可选）

```bash
# 检查签名
codesign -dv --verbose=4 src-tauri/target/release/bundle/macos/JStudio.app

# 检查公证状态
xcrun stapler validate src-tauri/target/release/bundle/macos/JStudio.app
```

### 无签名分发的临时方案

如果没有 Apple 开发者账号，可以构建未签名版本分发给信任的用户：
用户首次打开时需右键 → **「打开」**，或在 **系统设置 → 隐私与安全性** 中点击 **「仍要打开」**。

```bash
# 仅构建，不签名不公证
npm run tauri:build
```

> 分发 `.dmg` 文件即可，用户拖拽到 Applications 安装。

## 开发规范

- 前端禁止直接调用 `invoke`，所有 Tauri IPC 通过 `src/lib/core/storage.ts`
- 状态管理通过 Zustand slice，不在组件内直接修改 store
- 块组件只做展示，编辑逻辑在 `useSurfaceEditor` 统一处理
- 使用 Tailwind CSS v4 + VSCode 主题 CSS 变量，不硬编码颜色
- Rust 命令返回 `Result<T, String>`，新增命令在 `lib.rs` 注册

## 许可证

私有项目，保留所有权利。
