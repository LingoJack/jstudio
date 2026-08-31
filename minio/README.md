# minio

JStudio 远程保存服务的本地对象存储（S3 兼容）部署物。backend 通过 minio-go SDK 连接此处，资源上传/下载均由 backend 代理转发，MinIO 端点不直接暴露给客户端。

## 启动

docker 环境：

```bash
docker compose up -d
```

podman 环境（本机 docker 实为 podman alias）：

```bash
podman-compose up -d
# 或
podman compose up -d
```

## 端口与凭据（与 ../backend/config.example.yaml 默认值对齐）

| 项 | 值 | 对应配置 |
|----|----|---------|
| S3 API | http://127.0.0.1:9000 | storage.endpoint |
| Web Console | http://127.0.0.1:9001 | - |
| access_key | minioadmin | storage.access_key |
| secret_key | minioadmin | storage.secret_key |
| bucket | jstudio（backend 启动时自动创建，带重试） | storage.bucket |

数据持久化在命名卷 `minio-data`（podman rootless 下位于 `~/.local/share/containers/storage/volumes/`）。

## 说明

- podman-compose 1.x 对 `depends_on` healthcheck 编排支持不完整，所以 backend 的建桶逻辑带 30 次重试：先起 backend 再起 MinIO 也能最终就绪。
- 生产部署请更换默认凭据，或将 `storage.endpoint` 指向任意 S3 兼容服务（云厂商 COS/OSS 的 S3 网关等）。
