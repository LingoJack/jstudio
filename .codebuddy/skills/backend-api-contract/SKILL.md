---
name: backend-api-contract
description: 后台开发的需求与接口管理——把需求背景、预期表现写成需求文档，把接口的入参、出参、字段含义、错误码、日期、实现位置写成 JSON Schema 结构化条目存进 contract.jsonl，先约定后实现，实现完再逐项核对回填。This skill should be used whenever the user 要新增或修改后端接口、要写/更新接口文档、要约定接口契约、问某个接口的入参出参或字段含义、要定错误码、要记需求背景与预期表现、要盘点某个需求下有哪些接口、或要核对代码与接口文档是否一致。只要话题落在后台接口的定义、约定、联调对齐、需求开发管理上就用这个 skill，即使用户只说了「加个接口」「接口文档更新一下」。
---

# 后台接口契约（backend-api-contract）

## Overview

一个需求进来，到接口可以给调用方用，中间要留下两样东西：

- **需求文档**：`docs/apis/reqs/<需求id>.md`，记这个需求为什么存在、预期表现是什么、包含哪些接口、怎么算做完。一个需求一个文件。
- **接口契约**：`docs/apis/contract.jsonl`，一行一个接口，入参出参用 JSON Schema 描述，每个字段带 description（字段含义），自带错误码表、创建/更新日期、状态、实现位置。

给人看的 `docs/apis/API.md` 由脚本从 jsonl 渲染，不手写。

顺序是**先约定、后实现、再核对**：契约在写代码之前定下来并取得调用方（桌面端、小程序）确认；代码写完回来逐项对照 handler，一致了才把条目标成 `implemented` 并填上核对日期。这样"接口文档"和"代码实际行为"之间不会各说各话。

契约库默认在执行脚本时当前目录下的 `docs/apis/`（从仓库根执行就落在仓库根，没有就创建）。别处用 `new_api.py --dir <目录>`。

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
├── contract.jsonl          # 接口契约，一行一个接口（唯一事实源）
├── API.md                  # 由 --render 生成的接口文档，不手改
└── reqs/
    └── req-2026-0910-remote-save.md    # 需求文档，一需求一文件
```

条目字段速览（完整定义与填写粒度见 `references/contract-spec.md`）：

| 字段 | 内容 |
|------|------|
| `id` | 条目标识，kebab-case，稳定不变（路径改了也别改 id） |
| `requirement` | 关联需求 id，对应 `reqs/<id>.md` |
| `title` / `module` | 一句话接口名 / 所属功能域（`documents`、`auth`、`assets`） |
| `method` / `path` / `auth` | 方法、路径（含 `:param`）、鉴权方式 |
| `status` | `draft` → `agreed` → `implemented`（或 `deprecated`） |
| `created` / `updated` | 建条目日期 / 最后一次改契约的日期，`YYYY-MM-DD` |
| `background` | 需求背景：现在缺什么、谁在等它 |
| `expected` | 预期表现：调用后发生什么、幂等性、并发与边界 |
| `request` | `headers` / `path_params` / `query` / `body`，各自一个 JSON Schema |
| `response.success` | `http_status` + 响应体 JSON Schema |
| `errors` | 该接口会返回的错误码：`code` / `http_status` / `message` / `when` |
| `impl` | `handler`（文件:行）/ `verified`（核对日期）/ `notes` |

字段含义就落在 Schema 每个 property 的 `description` 上——这是契约里最值钱的部分，校验会强制它非空。

## 工作流

### Step 1 立需求

拿到需求先问清三件事再落盘：为什么要做（现在什么场景走不通）、做完之后调用方能观察到什么、哪些情况算失败。答不上来的先问用户，不要自己编。

按 `assets/requirement-template.md` 建 `docs/apis/reqs/req-YYYY-MMDD-<slug>.md`。日期用 `date +%F` 取当天，不要凭记忆写。

### Step 2 拆接口，建骨架

一个需求拆成若干接口，每个接口跑一次：

```bash
python3 scripts/new_api.py --new --id doc-put-snapshot --title "上传一份文档快照" \
    --module documents --method PUT --path /api/v1/documents/:docId \
    --requirement req-2026-0910-remote-save --owner jack
```

脚本会查重（id 重复、method+path 重复都会拦住）并追加一个带 TODO 占位的骨架。id 重复说明该接口已有条目——更新原条目，不新建。

### Step 3 填契约

把 TODO 全部换成实际内容，规则见 `references/contract-spec.md`，一份填好的真实条目见 `assets/api-entry-example.jsonl`。

填的时候只写**外部可观测的行为**：请求什么、返回什么、什么情况报什么错。不写"查哪张表""调哪个函数"——实现细节属于代码，写进契约就会随重构过期。

错误码逐条写清 `when`（什么输入或什么状态会触发）。"参数错误"这种同义反复没有信息量，要写成"limit 不是正整数"。

填完校验：

```bash
python3 scripts/new_api.py --validate
```

校验会拦下：字段缺 description、schema 缺 type/items、错误码不是 UPPER_SNAKE、日期格式不对、TODO 没填完、emoji、路由重复。

### Step 4 定稿

渲染成给人看的文档，连同条目一起交给调用方（桌面端 / 小程序开发同学）确认：

```bash
python3 scripts/new_api.py --render        # -> docs/apis/API.md
```

对齐无异议后把 `status` 改成 `agreed`，并把接口清单补进需求文档。**`agreed` 意味着调用方已经可以按它写代码了**，所以确认要拿到明确答复，不能自己替调用方点头。

### Step 5 实现

按契约写 handler。契约是唯一事实源：写代码时发现契约不合理（字段不够、错误码漏了、状态码该换），**先改契约再改代码**，并更新 `updated` 日期，然后告诉调用方哪里变了。不许代码单方面偏离契约默默跑。

### Step 6 核对回填

代码写完，按 `references/verify-implementation.md` 的清单逐项对照 handler：路径与方法、鉴权、字段名与类型、必填、默认值与截断行为、成功状态码、每一个错误码及其触发条件。

全部一致后回填并复跑：

```bash
# 条目里改：status=implemented, impl.handler=backend/internal/api/documents_handler.go:36,
#           impl.verified=<当天日期>
python3 scripts/new_api.py --validate && python3 scripts/new_api.py --render
```

没真的逐项对过，不许标 `implemented`——这个标记的全部价值就在于"有人对过了"。

### Step 7 变更与下线

- 改接口：改条目 + 更新 `updated` + 在需求文档的变更记录里写清改了什么。
- 破坏性变更（删字段、改字段语义、改错误码、改状态码）：在变更记录里写清对调用方的影响，并同步改 `desktop/` 与 `miniprogram/` 两端的调用代码——这两端与后端契约同源（见根 `CODEBUDDY.md`），只改一端会留下静默不兼容。
- 下线接口：`status` 改 `deprecated`，在 `impl.notes` 写替代接口的 id，不删条目（历史要能查到它曾经存在过）。

### Step 8 汇报

输出三块：新增或修改的文件绝对路径、接口清单（`METHOD path — 一句话`）、每条的当前 status。

## 质量红线

- Schema 里每个字段都有非空 `description`；不解析内部结构的透传载荷写 `additionalProperties: true` 明示，不许留空 `properties`。
- 错误码 UPPER_SNAKE_CASE，每条都有 `when`，且 `message` 与代码实际返回的字符串一致。
- 契约只写外部可观测行为；实现位置只出现在 `impl.handler`。
- `status=implemented` 必须同时有 `impl.handler`（文件:行）与 `impl.verified`（核对日期）。
- 日期一律 `date +%F` 取真实当天日期。
- `contract.jsonl` 一行一条，不做多行美化（否则 `jq` 和 diff 都不好用）；`API.md` 是生成物，改内容改 jsonl 后重跑 `--render`。
- 落盘前查重：同一个 method+path 只能有一个条目。
- 只写事实，不写评价（"设计更合理""扩展性好"这类删掉）。
- 产物中不出现 emoji（仓库约定）。

## Resources

### scripts/

- `scripts/new_api.py`：`--new` 建条目骨架并查重；`--validate` 校验必填字段、Schema 字段含义、错误码、日期、路由唯一；`--render` 渲染 `API.md`。

```bash
python3 scripts/new_api.py --new --id <id> --title <标题> --module <模块> \
    --method GET --path /api/v1/x --requirement <需求id> [--auth none] [--dir docs/apis]
python3 scripts/new_api.py --validate [--id <id>]
python3 scripts/new_api.py --render [--out docs/apis/API.md]
```

常用查询：

```bash
jq -c 'select(.status != "implemented") | {id, method, path, status}' docs/apis/contract.jsonl
jq -c 'select(.requirement == "req-2026-0910-remote-save") | .path' docs/apis/contract.jsonl
jq -r '.errors[].code' docs/apis/contract.jsonl | sort -u        # 全仓错误码总览
```

### references/

- `references/contract-spec.md`：条目字段全表、JSON Schema 允许的关键字、错误码与状态机规则、命名规则、合格与不合格写法。
- `references/verify-implementation.md`：实现后的逐项核对清单、常见漂移点、怎么从 Gin handler 读出实际行为。

### assets/

- `assets/requirement-template.md`：需求文档模板（含每章填写提示）。
- `assets/api-entry-example.jsonl`：两个填好的真实条目（含透传载荷、数组嵌套、四个错误码）。
