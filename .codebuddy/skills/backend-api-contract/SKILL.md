---
name: backend-api-contract
description: 后台开发的需求与接口管理——把需求背景、预期表现写成需求文档，把接口的入参、出参、字段含义、错误码、状态、实现位置写成一份 OpenAPI 3.0 的 openapi.yaml（x- 扩展承载 OpenAPI 没有的信息），先约定后实现，实现完再逐项核对回填。This skill should be used whenever the user 要新增或修改后端接口、要写/更新接口文档、要约定接口契约、问某个接口的入参出参或字段含义、要定错误码、要记需求背景与预期表现、要盘点某个需求下有哪些接口、或要核对代码与接口文档是否一致。只要话题落在后台接口的定义、约定、联调对齐、需求开发管理上就用这个 skill，即使用户只说了「加个接口」「接口文档更新一下」。
---

# 后台接口契约（backend-api-contract）

## Overview

一个需求进来，到接口可以给调用方用，中间要留下两样东西：

- **需求文档**：`docs/apis/reqs/<需求id>.md`，记这个需求为什么存在、预期表现是什么、包含哪些接口、怎么算做完。一个需求一个文件。
- **接口契约**：`docs/apis/openapi.yaml`，OpenAPI 3.0 单文件。一个 `path` + `method` 是一个接口条目，`operationId`
  就是条目 id；路径参数、查询参数、请求体、响应、鉴权用 OpenAPI 原生写法；OpenAPI 没有的信息（需求、状态、背景、预期、实现位置）用 `x-`
  扩展写在同一层。

不需要另外渲染 markdown：openapi.yaml 本身就是给人和工具看的唯一事实源，Swagger 类查看器、编辑器跳转、客户端代码生成都直接吃它。

顺序是 **先约定、后实现、再核对**：契约在写代码之前定下来并取得调用方（桌面端、小程序）确认；代码写完回来逐项对照
handler，一致了才把条目标成 `implemented` 并填上核对日期。这样"接口文档"和"代码实际行为"之间不会各说各话。

契约库默认在执行脚本时当前目录下的 `docs/apis/`（从仓库根执行就落在仓库根，没有就创建）。别处用 `contract.py --dir <目录>`。

## 何时触发

- 要新增接口、改接口（加字段、改状态码、加错误码、改语义）。
- 要写或更新接口文档、约定接口契约、和调用方对齐入参出参。
- 问"这个接口入参是什么""这个字段什么含义""有哪些错误码""这个需求下有哪些接口"。
- 一个后端需求刚开始做：先落需求背景与预期表现，再拆接口。
- 接口实现完了：回来核对代码与契约是否一致并回填。
- 怀疑文档与代码漂移了：按核对清单逐项对。

## 何时不触发

- 纯内部重构，对外行为（路径、方法、字段、状态码、错误码）一个都没变。
- 只是问某段后端代码怎么写、某个库怎么用，不涉及对外接口定义。
- 数据库表结构设计本身（那属于 `backend/schema.sql`），除非表变更导致接口字段变。

## 产物结构

```
docs/apis/
├── openapi.yaml                    # 接口契约，OpenAPI 3.0（唯一事实源）
└── reqs/
    └── req-2026-0910-remote-save.md    # 需求文档，一需求一文件
```

一个接口条目的键（完整定义与填写粒度见 `references/contract-spec.md`）：

| 键                          | 内容                                                            |
|-----------------------------|-----------------------------------------------------------------|
| `operationId`               | 条目 id，kebab-case，稳定不变（路径改了也别改它）               |
| `summary` / `tags`          | 一句话接口名 / 所属功能域（`documents`、`auth`、`assets`）      |
| `security`                  | 鉴权：`bearerAuth` / `internalAuth` / `[]`（公开）              |
| `parameters`                | `in: path` / `query` / `header` 的参数，每项带 description       |
| `requestBody`               | 请求体，JSON 用 `application/json`，上传用 `multipart/form-data` |
| `responses`                 | 恰好一个 2xx 成功响应 + 每个错误码一个响应                      |
| `x-requirement`             | 关联需求 id，对应 `reqs/<id>.md`                                |
| `x-status`                  | `draft` → `agreed` → `implemented`（或 `deprecated`）           |
| `x-owner`                   | 负责人，联调时找谁                                              |
| `x-created` / `x-updated`   | 建条目日期 / 最后一次改契约的日期，`YYYY-MM-DD`                 |
| `x-background`              | 需求背景：现在缺什么、谁在等它                                  |
| `x-expected`                | 预期表现：调用后发生什么、幂等性、并发与边界                    |
| `x-errors`（在非 2xx 响应里） | 该状态码会返回的错误码：`code` / `message` / `when`             |
| `x-impl`                    | `handler`（文件:行）/ `verified`（核对日期）/ `notes`           |

字段含义就落在 schema 每个 property 的 `description` 上——这是契约里最值钱的部分，校验会强制它非空。

## 工作流

### Step 1 立需求

拿到需求先问清三件事再落盘：为什么要做（现在什么场景走不通）、做完之后调用方能观察到什么、哪些情况算失败。答不上来的先问用户，不要自己编。

按 `assets/requirement-template.md` 建 `docs/apis/reqs/req-YYYY-MMDD-<slug>.md`。日期用 `date +%F` 取当天，不要凭记忆写。

### Step 2 拆接口，建骨架

一个需求拆成若干接口，每个接口跑一次：

```bash
python3 scripts/contract.py --new --id doc-put-snapshot --title "上传一份文档快照" \
    --module documents --method PUT --path /documents/{docId} \
    --requirement req-2026-0910-remote-save --owner jack
```

路径相对 `servers` 里的前缀（本仓库是 `/api/v1`），所以写 `/documents/{docId}` 而不是 `/api/v1/documents/{docId}`；写 Gin 的
`:docId` 也会被自动换成 `{docId}`。

脚本会查重（operationId 重复、method+path 重复都会拦住）并把带 TODO 占位的骨架追加到 `paths` 段末尾，文件里其余内容（含注释）保持不动。
operationId 重复说明该接口已有条目——更新原条目，不新建。

### Step 3 填契约

把 TODO 全部换成实际内容，规则见 `references/contract-spec.md`，一份填好的真实文件见 `assets/openapi-example.yaml`。

填的时候只写 **外部可观测的行为**：请求什么、返回什么、什么情况报什么错。不写"查哪张表""调哪个函数"——实现细节属于代码，写进契约就会随重构过期。

错误码逐条写清 `when`（什么输入或什么状态会触发）。"参数错误"这种同义反复没有信息量，要写成"limit 不是正整数"。

填完校验：

```bash
python3 scripts/contract.py --validate
```

校验会拦下：字段缺 description、schema 缺 type/items、参数与路径占位对不上、响应键没加引号、非 2xx 响应缺 x-errors、错误码不是
UPPER_SNAKE、日期格式不对、TODO 没填完、emoji、引用了不存在的 schema、YAML 重复键、operationId 与路由重复。

### Step 4 定稿

把 `docs/apis/openapi.yaml` 直接交给调用方（桌面端 / 小程序开发同学）确认——它能被任意 OpenAPI 查看器打开，也能用来生成客户端调用代码。

对齐无异议后把 `x-status` 改成 `agreed`，并把接口清单补进需求文档的"接口清单"表（只记 operationId 与方法路径，详细入参出参不复制）。
**`agreed` 意味着调用方已经可以按它写代码了**，所以确认要拿到明确答复，不能自己替调用方点头。

### Step 5 实现

按契约写 handler。契约是唯一事实源：写代码时发现契约不合理（字段不够、错误码漏了、状态码该换）， **先改契约再改代码**，并更新
`x-updated` 日期，然后告诉调用方哪里变了。不许代码单方面偏离契约默默跑。

### Step 6 核对回填

代码写完，按 `references/verify-implementation.md` 的清单逐项对照 handler：路径与方法、鉴权、字段名与类型、必填、默认值与截断行为、成功状态码、每一个错误码及其触发条件。

全部一致后回填并复跑：

```bash
# 条目里改：x-status=implemented, x-impl.handler=backend/internal/api/documents_handler.go:36,
#           x-impl.verified=<当天日期>
python3 scripts/contract.py --validate
```

没真的逐项对过，不许标 `implemented`——这个标记的全部价值就在于"有人对过了"。

### Step 7 变更与下线

- 改接口：改条目 + 更新 `x-updated` + 在需求文档的变更记录里写清改了什么。
- 破坏性变更（删字段、改字段语义、改错误码、改状态码）：在变更记录里写清对调用方的影响，并同步改 `desktop/` 与 `miniprogram/`
  两端的调用代码——这两端与后端契约同源（见根 `CODEBUDDY.md`），只改一端会留下静默不兼容。
- 下线接口：`x-status` 改 `deprecated`，在 `x-impl.notes` 写替代接口的 operationId，不删条目（历史要能查到它曾经存在过）。

### Step 8 汇报

输出三块：新增或修改的文件绝对路径、接口清单（`METHOD path — 一句话`）、每条的当前 `x-status`。

## 质量红线

- 每个 schema property、每个 parameter 都有非空 `description`；不解析内部结构的透传载荷写 `additionalProperties: true` 明示，不许留空
  `properties`。
- 错误码 UPPER_SNAKE_CASE，写在非 2xx 响应的 `x-errors` 里，每条都有 `when`，且 `message` 与代码实际返回的字符串一致。
- 响应键是加引号的三位状态码字符串（`'200'`），一个条目只允许一个 2xx。
- 契约只写外部可观测行为；实现位置只出现在 `x-impl.handler`。
- `x-status=implemented` 必须同时有 `x-impl.handler`（文件:行）与 `x-impl.verified`（核对日期）。
- 日期一律 `date +%F` 取真实当天日期。
- `openapi.yaml` 是唯一事实源，不另写一份 markdown 文档（写了就会漂移）。
- 落盘前查重：同一个 method+path 只能有一个条目。
- 只写事实，不写评价（"设计更合理""扩展性好"这类删掉）。
- 产物中不出现 emoji（仓库约定）。

## Resources

### scripts/

- `scripts/contract.py`：`--new` 建条目骨架并查重；`--validate` 校验结构、字段含义、错误码、日期、引用与唯一性；`--list` 列接口。

```bash
python3 scripts/contract.py --new --id <id> --title <标题> --module <模块> \
    --method GET --path /documents/{docId} --requirement <需求id> [--auth none] [--dir docs/apis]
python3 scripts/contract.py --validate [--id <id>]
python3 scripts/contract.py --list [--requirement <需求id>] [--status agreed]
```

常用查询：

```bash
python3 scripts/contract.py --list --status draft          # 还没定稿的
python3 scripts/contract.py --list --requirement req-2026-0910-remote-save
rg -N '- code: ' docs/apis/openapi.yaml | sort -u           # 全仓错误码总览
```

### references/

- `references/contract-spec.md`：openapi.yaml 的结构、x- 扩展字段全表、错误码与状态机规则、命名规则、合格与不合格写法。
- `references/verify-implementation.md`：实现后的逐项核对清单、常见漂移点、怎么从 Gin handler 读出实际行为。

### assets/

- `assets/requirement-template.md`：需求文档模板（含每章填写提示）。
- `assets/openapi-example.yaml`：一份填好的契约（透传载荷、数组嵌套、四个错误码、两个接口）。
