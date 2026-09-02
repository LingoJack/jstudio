# 部署 JStudio backend 到 k3s

用 podman 构建镜像 → 推到集群内自建的 registry:2 → helm chart 部署 backend（可选带 MinIO）→
Service 用 LoadBalancer 暴露。MySQL 走外部已有实例，不由 k8s 纳管。

配套目录：`../build/`（镜像构建）。两者共用的 registry 地址变量要保持一致（主机 + 30500 端口）。

## 前提

| 工具 | 用途 | 安装 |
|---|---|---|
| podman | 构建/推送镜像（本机 docker 只是 podman 的 alias） | `brew install podman && podman machine init && podman machine start` |
| helm | 渲染/安装 chart | `brew install helm kubectl` |
| kubectl | 操作集群 | 同上 |

集群侧：一个 k3s 节点（默认 storageClass 用 k3s 自带的 local-path），节点 IP 对开发机可达。

## 首次落地步骤

### 1. 起集群内 registry，并让节点信任它

```bash
make -C deploy bootstrap REGISTRY_HOST=192.168.1.10
```

这条会：部署 `registry:2`（PVC + NodePort 30500），并打印出每个节点上要写入的
`/etc/rancher/k3s/registries.yaml` 内容。照着在节点上执行并重启 k3s：

```bash
sudo mkdir -p /etc/rancher/k3s && sudo tee /etc/rancher/k3s/registries.yaml >/dev/null <<'EOF'
... # bootstrap 打印的内容
EOF
sudo systemctl restart k3s
```

containerd 默认只认 https 仓库，不做这步集群拉不到镜像。镜像名必须与 registries.yaml 里的
key 逐字相同，所以 `REGISTRY_HOST` 一旦改了，节点上的配置也要重刷。

### 2. 建库建表（外部 MySQL，只做一次）

后端不自动迁移。`make -C deploy schema-apply DB_HOST=...` 会打印命令，确认后手动执行
`backend/schema.sql`（幂等，可重复跑）。

### 3. 构建并推送镜像

```bash
make -C build image-push REGISTRY_HOST=192.168.1.10
# arm64 节点：make -C build image-push REGISTRY_HOST=... PLATFORM=linux/arm64
```

tag 取 git short sha；`make -C build version` 可查看。

### 4. 部署

```bash
make -C deploy install REGISTRY_HOST=192.168.1.10 \
  DB_HOST=10.0.0.5 DB_USER=root DB_PASSWORD=xxx DB_NAME=jstudio
```

`install` 会先跑 `secret-ensure`：命名空间里没有 Secret 就创建（jwt_secret 随机生成），
已存在则跳过——**不要每次都重建**，换 jwt_secret 会把所有已登录客户端踢下线。

### 5. 验证

```bash
make -C deploy ip                       # 看 Service 的 EXTERNAL-IP
curl http://<EXTERNAL-IP>:8080/healthz  # 期望 {"status":"ok"}
make -C deploy logs                     # 跟踪 backend 日志
```

## 变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `NS` | `jstudio` | 命名空间 |
| `RELEASE` | `jstudio` | helm release 名（同时作为 Secret 名） |
| `REGISTRY_HOST` | 空（必填） | registry 对外地址，节点 IP 或主机名 |
| `REGISTRY_NODEPORT` | `30500` | registry NodePort |
| `TAG` | git short sha | 镜像 tag |
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | 空 / 3306 / root / 空 / jstudio | 外部 MySQL；`DB_HOST`、`DB_PASSWORD` 部署时必填 |
| `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` | `minioadmin` / `minioadmin` | MinIO root 凭据，同时作为 backend 的 storage 凭据 |
| `PLATFORM` | `linux/amd64` | 目标节点架构 |
| `EXTRA_ARGS` | 空 | 追加给 helm 的参数，如 `EXTRA_ARGS="--set replicaCount=2"` |

## 配置是怎么注入的

backend 的配置有三条来源，优先级从高到低：env > config.yaml > 代码默认值。chart 这样用：

- **ConfigMap** 挂整份 `config.yaml` 到 `/etc/jstudio/`，放非敏感项，包括
  `server.allowed_origins`——它是切片，viper 的 AutomaticEnv 解析不了列表，**只能走文件**。
- **Secret** 用 `envFrom` 注入 `JS_AUTH_JWT_SECRET`、`JS_DATABASE_PASSWORD`、
  `JS_STORAGE_ACCESS_KEY`、`JS_STORAGE_SECRET_KEY`。config.yaml 里 `jwt_secret` 刻意留空串：
  viper 的 `AllowEmptyEnv` 默认关闭，空串 env 不会被误判为已设置，Secret 注入后校验能过。

改任何配置键都要对照 `backend/internal/config/config.go` 里 `setDefaults` 的名字：
**没在 setDefaults 里注册的键，env 覆盖会静默失效**。

ConfigMap 更新不会自动重启 Pod，deployment 上的 `checksum/config` 注解负责触发滚动更新。

## MinIO

默认随 chart 起（`minio.enabled=true`），Service 名 `<release>-minio:9000`，backend 自动指向它，
启动时自动建桶。看控制台：

```bash
kubectl -n jstudio port-forward svc/jstudio-minio 9001:9001
```

接外部 S3 兼容服务：

```bash
make -C deploy install ... --set minio.enabled=false --set config.storage.endpoint=xxx:9000
```

（`--set` 通过 `EXTRA_ARGS` 传，或自己拼 helm 命令。）

## 对外暴露

Service 默认 `type: LoadBalancer`。k3s 自带 klipper-lb 就能分配 LB IP，单节点下就是节点 IP，开箱可用。

需要独立 IP 段（多节点、或不想和节点 IP 混用）时再装 MetalLB：

```bash
# 先在 k3s 的 /etc/rancher/k3s/config.yaml 里 disable servicelb，否则会和 klipper-lb 抢 Service
make -C deploy metallb-up LB_IP_RANGE=192.168.1.200-192.168.1.220
```

IP 段要与节点同二层且排除在 DHCP 池之外。LB 是明文 HTTP，公网暴露需自行加 TLS 反代
（后续可接 Ingress + cert-manager，本次未做）。

## 多节点扩展

目前按单节点落地，扩展前有两个点要处理：

1. **registry 的 PVC**：local-path 是节点本地存储，registry 漂到别的节点就起不来。
   要么换共享 storageClass（`minio.persistence.storageClass` / registry 的 PVC 同理），
   要么 hostPath + nodeSelector 把它钉在一个节点上。
2. **镜像地址**：`REGISTRY_HOST` 要换成对所有节点都可达的地址（前面挂个 LB 或固定节点 + hosts）。

`replicaCount`、`storageClass`、`nodeSelector` 都是 values 里的可调项，扩展不用改目录结构。

## 常用运维

```bash
make -C deploy status      # Pod / Service 状态
make -C deploy logs        # 跟踪 backend 日志
make -C deploy template    # 只渲染不落集群，改 chart 后先拿这个自查
make -C deploy lint        # helm lint
make -C deploy rollback    # 回滚到上一版本
make -C deploy uninstall   # 卸载 release（PVC 与 Secret 需另行清理）
```
