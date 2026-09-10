# 实现后核对

代码写完，把 handler 和契约条目并排看一遍。目的不是"走个流程"，而是把调用方将来会踩的坑现在就踩掉——文档与代码不一致时，联调阶段查这种问题要花几倍时间。

核对完才允许把 `status` 改 `implemented`，并填 `impl.handler`（文件:行）与 `impl.verified`（当天日期）。

## 怎么读实际行为（Gin + Go）

按这个顺序看，每一步对应契约里的一块：

1. **路由注册**（本仓库 `backend/internal/api/router.go`）：方法、完整路径（注意 `Group` 前缀叠加）、挂了哪些中间件。中间件决定 `auth`：挂了鉴权中间件的组就是 `bearer`，没挂的是 `none`。
2. **handler 入口**：`c.ShouldBindJSON(&req)` 绑的那个 struct 的 json tag = 请求体字段名；`c.Param("x")` = 路径参数；`c.Query("x")` = 查询参数；`c.GetHeader(...)` = 依赖的头。
3. **参数校验分支**：每个提前 `return` 的分支就是一个错误码，`fail(c, status, code, message)` 三个实参分别对应契约里 `http_status` / `code` / `message`，触发条件就是那个 `if` 的内容。
4. **成功出口**：`c.JSON(status, ...)` 的第一个实参 = `response.success.http_status`，第二个实参的键 = 响应体字段名（`gin.H` 字面量里的键，或 struct 的 json tag）。
5. **上限与默认值常量**：文件顶部的 `const`（如 `defaultSnapshotLimit`、`maxDocumentRequestBytes`）是契约里默认值、上限、截断行为的来源，不要凭印象写。

## 逐项清单

| # | 核对项 | 常见漂移 |
|---|--------|----------|
| 1 | 方法与完整路径 | 契约漏了 Group 前缀（`/api/v1`），或参数名写成 `:id` 而代码是 `:docId` |
| 2 | 鉴权方式 | 路由挪进/挪出鉴权组，契约的 `auth` 没跟着改 |
| 3 | 请求字段名 | 契约用 camelCase，struct json tag 是 snake_case |
| 4 | 必填 | 契约 `required` 里有，但代码没校验（缺了就当零值继续跑），或反过来 |
| 5 | 字段类型 | 契约 integer，实际返回字符串（时间戳、大数被序列化成 string） |
| 6 | 默认值 | 契约写"缺省 20"，代码常量是 50 |
| 7 | 越界行为 | 契约暗示报错，代码其实是静默截断到上限（或相反） |
| 8 | 成功状态码 | 新建资源代码返回 201，契约写 200 |
| 9 | 响应字段齐全 | 代码后来多返回了一个字段，契约没加；或契约有的字段代码没返回 |
| 10 | 每个错误码 | 代码里有一个提前 return 分支，契约里没有对应条目 |
| 11 | 错误码 message | 契约与代码里的字符串对不上，调用方按 message 排查时对不上号 |
| 12 | 幂等性与并发 | `expected` 说"重复调用不产生新记录"，代码其实每次都追加 |
| 13 | 上限 | body 大小、分页上限、上传体积的数值与代码常量一致 |
| 14 | 透传字段 | 声明 `additionalProperties: true` 的载荷，代码确实原样存储、没有偷偷解析或改写 |

## 发现不一致怎么办

先判断哪边是对的，不要默认改文档凑代码：

- **代码写错了**（与 `agreed` 的契约不符）：改代码。契约已经被调用方按着写了，代码单方面偏离就是 bug。
- **契约当初定得不合理**（漏了错误码、状态码该换、字段不够）：改契约 + 更新 `updated` + 告知调用方改了什么。破坏性变更还要同步改 `desktop/` 与 `miniprogram/` 的调用代码。
- **两边都对，是契约没说清**（比如截断行为代码有、契约没写）：补进契约的 `expected` 或字段 `description`，并在 `impl.notes` 记一句为什么值得写明。

## 收尾

```bash
python3 scripts/new_api.py --validate
python3 scripts/new_api.py --render
```

汇报时说清：核对了哪几个接口、发现并修掉了哪些不一致（哪边改的）、当前各条目的 status。
