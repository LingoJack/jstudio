# CODEBUDDY.md

本仓库是 monorepo，包含三个顶层目录：

| 目录 | 内容 | 详细指引 |
|------|------|---------|
| `desktop/` | JStudio 桌面应用（Electron + React + Rust sidecar，本地笔记） | `desktop/CODEBUDDY.md` |
| `backend/` | 远程保存后台服务（Go + Gin + Viper + MySQL + MinIO SDK） | `backend/README.md` |
| `minio/` | MinIO 对象存储部署物（docker/podman compose） | `minio/README.md` |

## 常用命令

### 仓库级（在根目录执行）

| 任务 | 命令 |
|------|------|
| 提交并推送整个 monorepo | `make push` |
| 自动生成 commit（不推送） | `make commit` |
| 拉取最新代码 | `make pull` |
| 查看 git 状态 | `make status` |
| 格式化所有子项目 | `make fmt` |
| 检查所有子项目 | `make lint` |

### 桌面应用（在 desktop/ 下执行）

| 任务 | 命令 |
|------|------|
| 开发模式（Electron + Vite 热重载） | `cd desktop && make dev` |
| 构建生产应用（.app/.dmg） | `cd desktop && make build` |
| 安装到 /Applications（macOS） | `cd desktop && make install` |
| 提交前检查门（fmt + lint + test） | `cd desktop && make pre-commit` |

### 后端服务（在 backend/ 下执行）

| 任务 | 命令 |
|------|------|
| 本地运行（读 config.yaml） | `cd backend && make run` |
| 测试（需 MySQL） | `JS_TEST_MYSQL_DSN='user:pass@tcp(host:3306)/' make test`（未设时 MySQL 用例自动跳过） |
| 构建 | `cd backend && make build` |

要点：后端**不做自动迁移**——schema 由运维手动执行 `backend/schema.sql`（建库 `jstudio` + 建表，幂等），启动时仅 CheckSchema 校验；配置一律可被 `JS_` 前缀环境变量覆盖。

### MinIO（在 minio/ 下执行）

| 任务 | 命令 |
|------|------|
| 启动本地 MinIO（9000 API / 9001 console） | `cd minio && podman-compose up -d`（docker 环境用 `docker compose up -d`） |

## 仓库约定（全仓库适用）

- 禁止 emoji：代码、注释、commit message、UI 文案中绝不使用。
- 禁止魔法值：带语义的字面量（阈值、超时、端口、bucket 名等）一律命名常量。
- 本仓库有自动提交守护进程（提交信息格式「更新: 时间戳」，会自动 commit 并 push）；不要 rebase/reset 清理这些自动提交。
- `desktop/jcli/` 是 git submodule（`j` CLI）；Cargo workspace 通过 `path = "../jcli/j-agent"` 引用。

创建 commit 之前必须取得用户的明确同意
commit 格式规范：
```text
{category}/{change_concise_description}
{description} 改动文件、改动点、影响面、预期行为
1. ...
2. ...
```

被允许的 category 有
- feat 新增功能
- bugfix bug 修复
- chore 日常事务/杂活


