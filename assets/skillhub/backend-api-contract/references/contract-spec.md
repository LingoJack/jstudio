# 契约条目规范

`docs/apis/openapi.yaml` 的结构与填写粒度。OpenAPI 3.0 单文件，一个 `path` + `method` 是一个接口条目。

## 目录

- [结构总览](#结构总览)
- [x- 扩展字段全表](#x-扩展字段全表)
- [命名规则](#命名规则)
- [x-status 状态机](#x-status-状态机)
- [parameters](#parameters)
- [requestBody](#requestbody)
- [responses 与 x-errors](#responses-与-x-errors)
- [schema 用法](#schema-用法)
- [x-impl](#x-impl)
- [合格与不合格](#合格与不合格)

## 结构总览

```yaml
openapi: 3.0.3
info: {title, version, description}     # 服务级说明
servers:                                # /api/v1 这类公共前缀放这里，paths 里就不重复了
  - url: http://localhost:8080/api/v1
    description: 本地开发
tags:                                   # 可选，给文档工具用的功能域说明
  - name: documents
paths:
  /documents/{docId}:                   # 路径，相对 servers 前缀；参数用 {docId}
    put:                                # 方法：get / post / put / patch / delete
      operationId: doc-put-snapshot     # 条目 id
      summary: 上传一份文档快照
      tags: [documents]
      security: [{bearerAuth: []}]      # 公开接口写 []，服务间调用写 [{internalAuth: []}]
      parameters: [...]
      requestBody: {...}
      responses:
        '201': {...}                    # 成功响应，键必须加引号
        '400': {x-errors: [...]}        # 每个错误码一个响应
      x-requirement: req-2026-0910-remote-save
      x-status: implemented
      x-impl: {handler: ..., verified: ...}
components:
  securitySchemes: {bearerAuth, internalAuth}
  schemas:
    Error: ...                          # 统一错误响应体，所有非 2xx 响应 $ref 它
```

`components.schemas.Error` 与两个 securityScheme 由 `--new` 首次建库时生成，不要改形状：

```yaml
Error:
  type: object
  properties:
    error:
      type: object
      properties:
        code:    {type: string}    # UPPER_SNAKE_CASE
        message: {type: string}    # 与代码返回的字符串一致
      required: [code, message]
  required: [error]
```

统一错误响应体只在 `components` 里定义一次，条目里用 `$ref` 引用，不再重复描述。

## x- 扩展字段全表

OpenAPI 没有的字段一律 `x-` 前缀，写在 operation 这一层（与 `summary`、`parameters` 同级）：

| 字段 | 必填 | 含义与填写粒度 |
|------|------|----------------|
| `x-requirement` | 是 | 关联需求 id，对应 `reqs/<id>.md`。一个需求带多个接口时，多个条目填同一个值 |
| `x-status` | 是 | 见 [状态机](#x-status-状态机) |
| `x-owner` | 否 | 负责人，联调时找谁 |
| `x-created` | 是 | 建条目日期，`YYYY-MM-DD`，用 `date +%F` 取 |
| `x-updated` | 是 | 最后一次改契约内容的日期。改了字段/错误码/状态码就要动它 |
| `x-background` | 是 | 需求背景：现在什么场景走不通、谁在等它。不写"为了完善功能"这类空话 |
| `x-expected` | 是 | 预期表现：调用后数据发生什么变化、返回什么、幂等性、并发与边界、越界怎么处理。调用方靠这段判断能不能重试 |
| `x-impl` | 否 | 见 [x-impl](#x-impl)。`x-status=implemented` 时必填 |

`summary` 写一句话接口名（动词开头："上传一份文档快照"），不写"文档接口"这种名词短语。`tags` 第一个值是功能域（`auth`、
`documents`、`assets`），按业务分不按代码目录分。

## 命名规则

| 对象 | 规则 | 例 |
|------|------|-----|
| operationId | kebab-case，`<资源>-<动作>` | `doc-put-snapshot`、`asset-upload` |
| 需求 id | `req-YYYY-MMDD-<slug>` | `req-2026-0910-remote-save` |
| 需求文档 | `reqs/<需求id>.md` | `reqs/req-2026-0910-remote-save.md` |
| 错误码 | UPPER_SNAKE_CASE | `PAYLOAD_TOO_LARGE` |
| 字段名 | 与代码里 json tag 完全一致（本仓库后端是 snake_case） | `size_bytes` |
| 路径参数 | `{docId}`，与 Gin 路由的 `:docId` 对应 | `/documents/{docId}` |

## x-status 状态机

```
draft ──> agreed ──> implemented ──> deprecated
```

| x-status | 含义 | 进入条件 |
|----------|------|----------|
| `draft` | 还在起草，调用方不要按它写代码 | 建条目即是 |
| `agreed` | 调用方已确认，可以按它并行开发 | 拿到调用方明确答复 |
| `implemented` | 代码已实现且与契约逐项核对一致 | 走完核对清单，填 `x-impl.handler` 与 `x-impl.verified` |
| `deprecated` | 已下线或被替代 | `x-impl.notes` 写清替代接口的 operationId |

契约改了但代码还没跟上时，把 status 退回 `agreed`——`implemented` 表示"此刻代码与契约一致"，不是"曾经实现过"。

## parameters

`in` 只允许 `path` / `query` / `header`，每项都要有 `description` 与 `schema`；`in: path` 的项必须 `required: true`，且与路径里的
`{占位}` 一一对应（校验会两边对着查）。

| in | 写什么 |
|----|--------|
| `path` | 路径里每个 `{param}` 都要有一条，说明取值来源与作用域（"当前用户下的文档标识"） |
| `query` | 查询参数，写清默认值、取值范围、越界行为（截断还是报错——这是最容易漂移的地方） |
| `header` | 只写这个接口真正依赖的头（`X-Idempotency-Key` 之类）。鉴权头走 `security`，不要在这里重复写 `Authorization` |

## requestBody

- JSON 请求体写 `application/json`，schema 直接内联（只被一个接口用的东西不必进 `components`）。
- 非 JSON 形态照实写 media type：multipart 上传写 `multipart/form-data`，schema 里每个 property 是一个表单项，在 `description`
  里说明它是文件还是文本字段。
- `required: true` 表示这个接口不带 body 就没意义。

## responses 与 x-errors

- 键是**加引号**的三位状态码字符串：`'200'`、`'201'`、`'204'`。不加引号会被 YAML 解析成整数，OpenAPI 工具不认（校验会拦）。
- 恰好一个 2xx：新建资源 201、无响应体 204（不要写 content），其余 200。照代码实际行为写，不要一律写 200。
- 每个非 2xx 响应必须挂 `x-errors`，一项一个错误码：

```yaml
'413':
  description: 请求体过大
  content:
    application/json:
      schema: {$ref: '#/components/schemas/Error'}
      example: {error: {code: PAYLOAD_TOO_LARGE, message: document body too large}}
  x-errors:
    - code: PAYLOAD_TOO_LARGE
      message: document body too large
      when: 请求体超过 8MiB
```

| 键 | 内容 |
|----|------|
| `code` | UPPER_SNAKE_CASE，与代码里的常量值一致（本仓库见 `backend/internal/api/errors.go`） |
| `message` | 与代码实际返回的字符串一致，方便调用方按 message 排查 |
| `when` | 什么输入或什么状态会触发。这一条决定了错误码有没有用 |

`when` 的写法：

```
差：{code: INVALID_REQUEST, when: 参数错误}
好：{code: INVALID_REQUEST, when: body 不是合法 JSON，或 body 字段缺失/为空}
```

同一个 `code` 在一个条目里只出现一次。同一个状态码要返回两个不同 code 时，就把两条都写进这个响应的 `x-errors`（这是 `x-errors`
是数组而不是单值的原因）；同一个 code 在不同接口里触发条件不同是正常的，各自写各自的 `when`。

`content` 与 `example` 是给查看器看的：写了 `example`，里面的 `error.code` 必须在本响应的 `x-errors` 里（校验会拦）。

## schema 用法

OpenAPI 3.0 的 schema 是 JSON Schema 的一个子集，只用这些关键字：

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
| `$ref` | 复用 `components.schemas` 里的定义；本文件内的引用校验会查它存在 |

`description` 要写"这个字段是什么 + 由什么决定 / 取值范围"，不是把字段名翻译一遍：

```yaml
差：revision: {type: integer, description: 版本号}
好：revision: {type: integer, description: 本次写入产生的快照版本号，从 1 起自增，不复用已删除的号}
```

嵌套对象自身也要有 description（说明这一坨是什么、顺序如何），数组自身也要有（说明元素是什么、按什么排序）。

## x-impl

```yaml
x-impl:
  handler: backend/internal/api/documents_handler.go:36
  verified: '2026-09-10'
  notes: limit 截断行为已核对
```

- `handler`：`文件:行`，指向 handler 函数定义那一行，路径从仓库根算。
- `verified`：走完核对清单那天的日期。契约或代码再改，就要重新核对并更新这个日期。
- `notes`：核对时发现的、值得写下来的差异或约定（例如"超限按 200 截断而不报错，已在契约写明"）。

## 合格与不合格

**合格**：见 `assets/openapi-example.yaml`。

**不合格**：

| 写法 | 问题 |
|------|------|
| 字段只有 `type` 没有 `description` | 字段含义丢失，校验直接拦 |
| `description` 是字段名的翻译（`user_id` → "用户 id"） | 没有信息量，写清来源与约束 |
| `errors` 只写 400/500 两条泛化错误 | 调用方无法分辨该重试还是该改参数 |
| `x-expected` 写"正常返回数据" | 没说清写入了什么、能不能重试、边界怎么处理 |
| 契约里写"从 documents 表查最新一条" | 内部实现，重构即过期；这类信息留给代码 |
| 响应键写成 `200:` 不加引号 | YAML 解析成整数，OpenAPI 工具与校验都不认 |
| 一个 method+path 拆成两个条目 | 校验会拦；同一路由的不同分支写在同一条目的 `x-expected` 与 `x-errors` 里 |
| 改了字段但没动 `x-updated` | 调用方无法判断契约是否变过 |
