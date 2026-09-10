# 契约条目规范

`docs/apis/contract.jsonl` 的字段定义与填写粒度。一行一个 JSON 对象，一个对象描述一个接口。

## 目录

- [字段全表](#字段全表)
- [命名规则](#命名规则)
- [status 状态机](#status-状态机)
- [request：四个部位](#request四个部位)
- [JSON Schema 用法](#json-schema-用法)
- [response](#response)
- [errors](#errors)
- [impl](#impl)
- [合格与不合格](#合格与不合格)

## 字段全表

| 字段 | 类型 | 必填 | 含义与填写粒度 |
|------|------|------|----------------|
| `id` | string | 是 | 条目标识，kebab-case。建了就别改：需求文档、代码注释、聊天记录都会引用它。路径变更也保留原 id |
| `requirement` | string | 是 | 关联需求 id，对应 `reqs/<id>.md`。一个需求带多个接口时，多个条目填同一个值 |
| `title` | string | 是 | 一句话说清这个接口干什么，动词开头（"上传一份文档快照"），不写"文档接口"这种名词短语 |
| `module` | string | 是 | 功能域，小写英文：`auth`、`documents`、`assets`。按业务分，不按代码目录分 |
| `method` | string | 是 | `GET` / `POST` / `PUT` / `PATCH` / `DELETE` |
| `path` | string | 是 | 完整路径含前缀与参数占位，照抄路由注册的写法（`/api/v1/documents/:docId`） |
| `auth` | string | 是 | `bearer`（需登录）/ `none`（公开）/ `internal`（仅服务间调用） |
| `owner` | string | 否 | 负责人，联调时找谁 |
| `status` | string | 是 | 见 [status 状态机](#status-状态机) |
| `created` | string | 是 | 建条目日期，`YYYY-MM-DD`，用 `date +%F` 取 |
| `updated` | string | 是 | 最后一次改契约内容的日期。改了字段/错误码/状态码就要动它 |
| `background` | string | 是 | 需求背景：现在什么场景走不通、谁在等它。不写"为了完善功能"这类空话 |
| `expected` | string | 是 | 预期表现：调用后数据发生什么变化、返回什么、幂等性、并发与边界、越界怎么处理。调用方靠这段判断能不能重试 |
| `request` | object | 是 | 见 [request](#request四个部位) |
| `response` | object | 是 | 见 [response](#response) |
| `errors` | array | 是 | 见 [errors](#errors) |
| `impl` | object | 否 | 见 [impl](#impl)。`status=implemented` 时必填 |

## 命名规则

| 对象 | 规则 | 例 |
|------|------|-----|
| 条目 id | kebab-case，`<资源>-<动作>` | `doc-put-snapshot`、`asset-upload` |
| 需求 id | `req-YYYY-MMDD-<slug>` | `req-2026-0910-remote-save` |
| 需求文档 | `reqs/<需求id>.md` | `reqs/req-2026-0910-remote-save.md` |
| 错误码 | UPPER_SNAKE_CASE | `PAYLOAD_TOO_LARGE` |
| 字段名 | 与代码里 json tag 完全一致（本仓库后端是 snake_case） | `size_bytes` |

## status 状态机

```
draft ──> agreed ──> implemented ──> deprecated
```

| status | 含义 | 进入条件 |
|--------|------|----------|
| `draft` | 还在起草，调用方不要按它写代码 | 建条目即是 |
| `agreed` | 调用方已确认，可以按它并行开发 | 拿到调用方明确答复 |
| `implemented` | 代码已实现且与契约逐项核对一致 | 走完核对清单，填 `impl.handler` 与 `impl.verified` |
| `deprecated` | 已下线或被替代 | `impl.notes` 写清替代接口的 id |

契约改了但代码还没跟上时，把 status 退回 `agreed`——`implemented` 表示"此刻代码与契约一致"，不是"曾经实现过"。

## request：四个部位

只允许 `headers`、`path_params`、`query`、`body` 四个键，每个键的值是一个 JSON Schema（`type: object`）。**没有的部位直接不写这个键**，不要留空 `properties`（校验会拦）。

| 部位 | 写什么 |
|------|--------|
| `headers` | 只写这个接口真正依赖的头：`Authorization`、`Content-Type`（非 JSON 时）、幂等键。不要抄一堆通用头 |
| `path_params` | 路径里每个 `:param` 都要有一条，说明取值来源与作用域（"当前用户下的文档标识"） |
| `query` | 查询参数，写清默认值、取值范围、越界行为（截断还是报错——这是最容易漂移的地方） |
| `body` | 请求体。JSON 以外的形态（multipart 上传）在 `description` 里说明字段是表单项 |

## JSON Schema 用法

用 JSON Schema 的一个小子集，只用这些关键字：

| 关键字 | 用途 |
|--------|------|
| `type` | `object` / `array` / `string` / `integer` / `number` / `boolean`。每一层都必填 |
| `properties` | object 的字段表 |
| `required` | 必填字段名数组；里面的名字必须存在于 `properties` |
| `items` | array 的元素 schema；array 必填 |
| `description` | **每个字段都必须有且非空**，这是"字段含义"的落点 |
| `enum` | 取值有限时列全 |
| `format` | `date-time`、`uri` 这类补充说明；写了也要在 description 里说人话 |
| `additionalProperties` | 只在"服务端不解析内部结构、原样透传"时写 `true`，并在 description 里说明上限与存储方式 |

`description` 要写"这个字段是什么 + 由什么决定 / 取值范围"，不是把字段名翻译一遍：

```
差：{"revision": {"type": "integer", "description": "版本号"}}
好：{"revision": {"type": "integer", "description": "本次写入产生的快照版本号，从 1 起自增，不复用已删除的号"}}
```

嵌套对象自身也要有 description（渲染出来它自己占一行），说明这一坨是什么、顺序如何。

## response

```json
"response": {"success": {"http_status": 201, "schema": { ... }}}
```

- `http_status`：整数，写实际返回的那个。新建资源用 201、无响应体用 204——照代码实际行为写，不要一律写 200。
- `schema`：响应体的 JSON Schema，字段与代码里的 json tag 完全一致。
- 204 无响应体时写 `"schema": {"type": "object", "additionalProperties": false, "description": "无响应体"}`，并在 `expected` 里说明客户端只需看状态码。
- 只描述成功响应。失败一律进 `errors`。

## errors

每一项四个字段全必填：

| 字段 | 内容 |
|------|------|
| `code` | UPPER_SNAKE_CASE，与代码里的常量值一致（本仓库见 `backend/internal/api/errors.go`） |
| `http_status` | 整数 |
| `message` | 与代码实际返回的字符串一致，方便调用方按 message 排查 |
| `when` | 什么输入或什么状态会触发。这一条决定了错误码有没有用 |

`when` 的写法：

```
差：{"code": "INVALID_REQUEST", "when": "参数错误"}
好：{"code": "INVALID_REQUEST", "when": "body 不是合法 JSON，或 body 字段缺失/为空"}
```

同一个 code 在一个条目里只出现一次；同一个 code 在不同接口里触发条件不同是正常的，各自写各自的 `when`。

统一错误响应体形如 `{"error":{"code","message"}}`（本仓库约定），不必在每个条目里重复描述这个包裹结构。

## impl

```json
"impl": {"handler": "backend/internal/api/documents_handler.go:36", "verified": "2026-09-10", "notes": "limit 截断行为已核对"}
```

- `handler`：`文件:行`，指向 handler 函数定义那一行，路径从仓库根算。
- `verified`：走完核对清单那天的日期。契约或代码再改，就要重新核对并更新这个日期。
- `notes`：核对时发现的、值得写下来的差异或约定（例如"超限按 200 截断而不报错，已在契约写明"）。

## 合格与不合格

**合格**：见 `assets/api-entry-example.jsonl`。

**不合格**：

| 写法 | 问题 |
|------|------|
| 字段只有 `type` 没有 `description` | 字段含义丢失，校验直接拦 |
| `description` 是字段名的翻译（`user_id` → "用户 id"） | 没有信息量，写清来源与约束 |
| `errors` 只写 400/500 两条泛化错误 | 调用方无法分辨该重试还是该改参数 |
| `expected` 写"正常返回数据" | 没说清写入了什么、能不能重试、边界怎么处理 |
| 契约里写"从 documents 表查最新一条" | 内部实现，重构即过期；这类信息留给代码 |
| 一个 method+path 拆成两个条目 | 校验会拦；同一路由的不同分支写在同一条目的 `expected` 与 `errors` 里 |
| 改了字段但没动 `updated` | 调用方无法判断契约是否变过 |
