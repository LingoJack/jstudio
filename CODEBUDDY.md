# CODEBUDDY.md

本仓库是 monorepo，包含六个顶层目录：

| 目录 | 内容 | 详细指引 |
|------|------|---------|
| `desktop/` | JStudio 桌面应用（Electron + React + Rust sidecar，本地笔记） | `desktop/CODEBUDDY.md` |
| `miniprogram/` | 微信小程序伴读端（Taro + React 18，只读渲染远程快照） | `miniprogram/CODEBUDDY.md` |
| `backend/` | 远程保存后台服务（Go + Gin + Viper + MySQL + MinIO SDK） | `backend/README.md` |
| `build/` | 容器镜像构建（podman，不用 docker） | `build/Makefile` |
| `deploy/` | k3s 部署物（helm chart + registry/MetalLB 引导） | `deploy/README.md` |
| `minio/` | MinIO 对象存储部署物（本地开发用 docker/podman compose） | `minio/README.md` |

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

### 小程序（在 miniprogram/ 下执行）

| 任务 | 命令 |
|------|------|
| 开发模式（watch 构建 weapp） | `cd miniprogram && make dev` |
| 生产构建 | `cd miniprogram && make build` |
| 类型检查 + eslint | `cd miniprogram && make lint` |
| 测试 | `cd miniprogram && make test` |

产物在 `miniprogram/dist/`，微信开发者工具导入 `miniprogram/` 目录；详见 `miniprogram/README.md`。

### 构建与部署（在仓库根目录或对应子目录下执行）

| 任务 | 命令 |
|------|------|
| 构建 backend 镜像 | `make image REGISTRY_HOST=<k3s 节点IP>` |
| 构建并推送镜像 | `make image-push REGISTRY_HOST=<k3s 节点IP>` |
| 部署到 k3s | `make deploy REGISTRY_HOST=... DB_HOST=... DB_PASSWORD=...` |
| 更多（registry 引导、MetalLB、日志、回滚） | `cd deploy && make help` |

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
- `miniprogram/` 与 `desktop/` 存在同源代码（remote client、Block 类型）：backend API 或块类型变更时两端必须一起改，契约细节见 `miniprogram/CODEBUDDY.md`。
- 容器一律用 podman，不用 docker（`docker` 在本机只是 podman 的 alias）；部署面用 helm + k3s。

创建 commit 之前必须取得用户的明确同意
commit 格式规范：
```text
{category}(module_name)/{change_concise_description}
{description} 改动文件、改动点、影响面、预期行为
1. ...
2. ...
```

被允许的 category 有
- feat 新增功能
- bugfix bug 修复
- chore 日常事务/杂活

## 和我沟通的原则
内容原则：
1. 解释性文字为主，意义性文字删掉：只写“它是什么、干了什么、怎么干的”，不写“这样做有什么好处/付出了什么代价/是什么架构基础”这类点评和升华。 
2. 总结腔换具体事实：不写“一切皆 REST 请求”这种抽象概括，要写成“每种资源对应一条 URL，如 /apis/apps/v1/namespaces/xxx/deployments”；不写“可用某命令查询”，直接给出可查到什么。 
3. 概念词保留，机制描述说人话：Flannel、CoreDNS 这类名字绕不开可以留，但解释它时用大白话讲过程（“流量装进 UDP 包里运过去”），不堆术语。 
4. 讲原理要讲到能听懂的程度：关键链路要一步步拆开走完（比如 curl http://backend 背后的 6 步解析过程），不能一句“实时监听生成记录”就带过——听不懂的段落不算讲清楚了。


