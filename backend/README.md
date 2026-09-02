# jstudio backend

JStudio 远程保存后台服务：用户账号体系（JWT）、文档快照同步（MySQL）、二进制资源对象存储（S3 兼容 / MinIO）。

技术栈：Go + Gin + Viper + go-sql-driver/mysql + minio-go。

## 目录

```
backend/
├── cmd/jstudio-backend/     # 入口
├── internal/
│   ├── api/                 # HTTP 层（路由/handler/中间件/统一错误）
│   ├── auth/                # bcrypt 密码哈希 + HS256 JWT（纯逻辑，无 HTTP）
│   ├── config/              # viper 配置（yaml + JS_ 前缀 env 覆盖）
│   ├── storage/             # ObjectStorage 接口 + MinIO 实现 + 内存 fake
│   ├── store/               # MySQL 数据访问
│   └── testsupport/         # 测试脚手架（按测试建一次性数据库）
├── config.example.yaml      # 配置样例（真实 config.yaml 不入库）
└── schema.sql               # 建表 DDL（手动执行，见下）
```

## 初始化数据库（手动）

后端**不做自动迁移**：建库建表由运维执行 `schema.sql`（语句幂等，可重复执行）。

```bash
# 1. 建库（库名统一叫 jstudio）
mysql -h <host> -u <user> -p -e "CREATE DATABASE IF NOT EXISTS jstudio CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci"

# 2. 建表
mysql -h <host> -u <user> -p jstudio < schema.sql
```

后端启动时 `CheckSchema` 只校验 4 张表是否存在，缺表即 fail-fast 并提示执行 schema.sql。

## 配置

```bash
cp config.example.yaml config.yaml   # 然后填入真实值；config.yaml 已 gitignore
```

所有配置均可被 `JS_` 前缀环境变量覆盖（如 `JS_AUTH_JWT_SECRET`、`JS_DATABASE_DBNAME`、`JS_SERVER_ADDR`）。
注意：viper 的 AutomaticEnv 只覆盖已注册默认值的键——新增配置项必须同时加 SetDefault，否则 env 静默失效。

`auth.jwt_secret` 必填且 >= 32 字节（生成：`openssl rand -base64 48`）。

本地对象存储（MinIO）的启动方式见 `../minio/README.md`；backend 启动时自动建桶（带 30 次重试，MinIO 后起也能就绪）。

## 运行与构建

```bash
make run      # go run ./cmd/jstudio-backend（默认 127.0.0.1:8080）
make build    # 输出 bin/jstudio-backend
make test     # go test ./...
make lint     # go vet ./...
```

交叉编译部署到 Linux 服务器：

```bash
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o bin/jstudio-backend-linux ./cmd/jstudio-backend
```

无 CGO 依赖，产物为静态二进制。

## 容器化部署

镜像构建与 k3s 部署都在仓库最外层：

```bash
make -C ../build image-push REGISTRY_HOST=<k3s 节点IP>          # 构建并推送镜像
make -C ../deploy install REGISTRY_HOST=... DB_HOST=... DB_PASSWORD=...
```

完整步骤、变量说明与排障见 `../deploy/README.md`。

容器内的配置注入方式（与本地跑 `config.yaml` 的区别）：

- 配置文件路径由 `-config /etc/jstudio/config.yaml` 显式指定（helm 的 ConfigMap 挂载），
  不再依赖工作目录下有没有 config.yaml。
- `server.allowed_origins` 是切片，viper 的 AutomaticEnv 解析不了列表，**只能写在 config.yaml 里**。
- 其余敏感项走 Secret 的 env 注入：`JS_AUTH_JWT_SECRET`、`JS_DATABASE_PASSWORD`、
  `JS_STORAGE_ACCESS_KEY`、`JS_STORAGE_SECRET_KEY`。config.yaml 里 `jwt_secret` 留空串是安全的——
  env 优先级高于文件，且 viper 默认 `AllowEmptyEnv=false`，空串 env 不会被误判为已设置。
- 容器里 `server.addr` 必须是 `0.0.0.0:8080`（默认 127.0.0.1 只能本机访问，探针会失败）。

## 测试

store/api 层测试需要一台 MySQL 管理员连接（测试会自建 `jstudio_test_<纳秒>` 一次性数据库并应用 schema.sql，测试结束即 DROP）：

```bash
export JS_TEST_MYSQL_DSN='user:pass@tcp(host:3306)/'
make test
```

未设置该环境变量时 MySQL 相关测试自动跳过（auth 纯逻辑测试不受影响）。对象存储用内存 fake，测试不依赖 MinIO。

## API 概览

Base path `/api/v1`，JSON 字段 snake_case，错误统一 `{"error":{"code":"...","message":"..."}}`。

| 方法 | 路径 | 认证 | 说明 |
|---|---|---|---|
| GET | /healthz | 无 | 存活探针 |
| POST | /auth/register | 无 | 注册（用户名 3-32 字符，密码 >= 8） |
| POST | /auth/login | 无 | 登录，返回 Bearer token（默认 30 天） |
| GET | /auth/me | Bearer | 校验 token |
| GET | /documents | Bearer | 文档列表（元数据） |
| PUT | /documents/{docId} | Bearer | 保存快照（追加 revision；body 为任意 JSON 原样存储） |
| GET | /documents/{docId} | Bearer | 取最新快照 |
| GET | /documents/{docId}/snapshots | Bearer | 历史快照列表（limit 默认 50 上限 200） |
| GET | /documents/{docId}/snapshots/{revision} | Bearer | 取指定历史快照 |
| DELETE | /documents/{docId} | Bearer | 墓碑删除；再 PUT 复活且 revision 续接 |
| POST | /documents/{docId}/assets | Bearer | multipart 上传资产（字段 file；同名覆盖） |
| GET | /documents/{docId}/assets | Bearer | 资产列表 |
| GET | /documents/{docId}/assets/{fileName} | Bearer | 流式下载（backend 代理 MinIO） |
| DELETE | /documents/{docId}/assets/{fileName} | Bearer | 删除资产 |

限额：文档快照请求封顶 8MiB（413），资产上传封顶 12MiB。

认证错误码区分 `UNAUTHORIZED`（无/伪 token）与 `TOKEN_EXPIRED`（过期），客户端可据此静默重登。

## 安全提醒

自部署时务必：更换 MinIO 默认凭据、使用强 `jwt_secret`、MySQL 账号最小权限（生产无需 root）、将服务置于 TLS 反代之后。
