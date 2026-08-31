-- JStudio backend 元数据库 schema（MySQL 8.0+）。
-- 后端启动时只校验、不迁移：schema 由运维手动执行。
--
--   mysql -h <host> -u <user> -p -e "CREATE DATABASE IF NOT EXISTS jstudio CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci"
--   mysql -h <host> -u <user> -p jstudio < schema.sql
--
-- 所有语句幂等（IF NOT EXISTS），可重复执行。
-- 注意：document_snapshots.body 用 MEDIUMTEXT（快照请求封顶 8MiB，TEXT 只有 64KiB）。

CREATE TABLE IF NOT EXISTS users (
    id            VARCHAR(36)  NOT NULL,              -- UUIDv4
    username      VARCHAR(32)  NOT NULL,              -- 唯一；库级 utf8mb4_0900_ai_ci 排序规则即大小写不敏感
    password_hash VARCHAR(100) NOT NULL,              -- bcrypt
    created_at    VARCHAR(64)  NOT NULL,              -- RFC3339 UTC 文本
    updated_at    VARCHAR(64)  NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_users_username (username)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

-- 文档归属 (user_id, doc_id)：doc id 由客户端生成，只需每用户内唯一。
-- latest_revision = 0 表示只上传过资产、从未保存过快照。
-- deleted_at 为墓碑（NULL = 存活）；追加新快照或上传资产会复活文档。
CREATE TABLE IF NOT EXISTS documents (
    user_id         VARCHAR(36) NOT NULL,
    doc_id          VARCHAR(64) NOT NULL,
    latest_revision BIGINT      NOT NULL DEFAULT 0,
    deleted_at      VARCHAR(64) NULL,
    created_at      VARCHAR(64) NOT NULL,
    updated_at      VARCHAR(64) NOT NULL,
    PRIMARY KEY (user_id, doc_id),
    KEY idx_documents_user_updated (user_id, updated_at DESC),
    CONSTRAINT fk_documents_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

-- 每次远程保存追加一条快照；revision 严格递增、无空洞。
CREATE TABLE IF NOT EXISTS document_snapshots (
    user_id    VARCHAR(36)  NOT NULL,
    doc_id     VARCHAR(64)  NOT NULL,
    revision   BIGINT       NOT NULL,
    title      VARCHAR(255) NOT NULL DEFAULT '',
    body       MEDIUMTEXT   NOT NULL,                 -- 完整文档 JSON 文本，原样存储
    size_bytes BIGINT       NOT NULL,
    created_at VARCHAR(64)  NOT NULL,
    PRIMARY KEY (user_id, doc_id, revision),
    KEY idx_snapshots_doc_created (user_id, doc_id, created_at DESC),
    CONSTRAINT fk_snapshots_document FOREIGN KEY (user_id, doc_id)
        REFERENCES documents (user_id, doc_id),
    CONSTRAINT chk_snapshots_revision CHECK (revision > 0)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

-- 资产元数据；二进制内容在对象存储，object_key = "{user_id}/{doc_id}/{file_name}"。
-- 同名重复上传为覆盖（upsert），与桌面端 assets/ 目录覆写语义一致。
CREATE TABLE IF NOT EXISTS assets (
    user_id      VARCHAR(36)  NOT NULL,
    doc_id       VARCHAR(64)  NOT NULL,
    file_name    VARCHAR(255) NOT NULL,
    content_type VARCHAR(128) NOT NULL DEFAULT 'application/octet-stream',
    size_bytes   BIGINT       NOT NULL,
    object_key   VARCHAR(512) NOT NULL,
    created_at   VARCHAR(64)  NOT NULL,
    updated_at   VARCHAR(64)  NOT NULL,
    PRIMARY KEY (user_id, doc_id, file_name),
    CONSTRAINT fk_assets_document FOREIGN KEY (user_id, doc_id)
        REFERENCES documents (user_id, doc_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;
