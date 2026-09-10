---
name: regular-commit
description: 按固定格式生成并执行 git commit——category(module)/简述 + 补充说明 + 编号改动点，且提交前必须取得用户明确同意。This skill should be used whenever the user asks to commit、提交、提交代码、生成 commit message、帮我提交、make a commit、commit 一下，也适用于任务做完工作区还堆着未提交改动、或用户说「规范化提交」「按格式提交」「打个 commit」「存一下」时。只要涉及创建 git commit 就用这个 skill，即使用户只说了「提交吧」两个字。
---

# 规范化提交（regular-commit）

## Overview

把一次工作区改动变成一个格式统一、信息可读的 commit。

产出只有一样：一条 commit message，以及它对应的那个 commit。

格式是三段式的，看的人不用读 diff 就知道改了什么、为什么改、影响面在哪：

```
{category}({module})/{change_concise_description}
{description}

1. {detail}
2. {detail}
```

## 提交格式

### 第 1 行：subject

`{category}({module})/{简述}`

- **category**：只能是三个之一，取值规则见下节。
- **module**：这次改动所属的功能域，小写英文，单词或短横线连接（如 `auth`、`export`、`terminal`、`build`）。从改动内容推断，不要照抄目录名，也不要带仓库名、包名前缀。
- **简述**：一句话说清改了什么，结尾不写句号。

### 第 2 行：description

紧贴第 1 行，不空行。交代这次改动的整体说明：为什么要改、影响面、预期行为。改动简单到一句话能说清时，也要写，不能留空。

### 编号列表

第 2 行之后**空一行**再写。git 以第一个空行切分标题段和正文，不空行的话整条 message 会被当成标题，`git log --oneline` 会把编号列表一起并进去。

每条讲清「改了哪个文件/模块 + 改了什么」，逐条列：

```
1. 新增 internal/auth/jwt.go：签发 access token（15 分钟）与 refresh token（7 天），密钥从配置读
2. handler 新增 POST /api/auth/login，登录失败统一返回 401
3. 预期行为：access 过期后凭 refresh 换发，refresh 过期需重新登录
```

## category 取值

| category | 用于 |
|----------|------|
| `feat` | 新增功能或能力——用户能感知到的新行为、新接口、新入口 |
| `bugfix` | 修正错误行为——原本跑不对、跑崩了、结果不符合预期 |
| `chore` | 日常事务——格式整理、依赖升级、配置与构建脚本、清理、文档琐碎改动 |

判定不清时看这条：改动之后系统的**行为边界**变了没有。变了是 `feat` 或 `bugfix`，没变（只是让同样的行为跑得更省事）是 `chore`。

不要发明第四个 category。碰到 `refactor`、`docs`、`test`、`perf` 这类想用的词，归入 `chore`；如果改动主体确实是新功能或修 bug，就分别归入 `feat`/`bugfix`，不要因为顺手重构了点代码就降级成 `chore`。

## 工作流

### Step 1 采集改动

```bash
git status --short
git diff --cached --stat     # 已暂存
git diff --stat              # 未暂存
git log -5 --format='%s'     # 看既有风格
```

有提交历史就对齐仓库已有风格；没有历史或历史混乱，按本 skill 的格式写。

读 diff 时看的是实际改动内容，不是文件名猜测。改动太大读不完时，优先读改动文件的头部和 hunk 上下文。

### Step 2 确定提交范围

把改动文件列给用户，并标出可疑项（日志、构建产物、临时文件、凭据文件、与本任务无关的改动）。

- **不擅自执行 `git add`**，包括 `git add -A` 和 `git add .`。暂存哪些文件由用户确认后再做。
- 用户已经自己暂存好了、且范围没问题，就用已暂存的内容，不再问一遍。
- 工作区干净但有已暂存内容 → 直接走下一步。

### Step 3 定 category 与 module

一次改动只对应一个 category 和一个 module。改了多处但属于同一件事，合并成一条 commit；属于几件不相干的事，在 Step 4 提议拆开，逐个征求意见。

### Step 4 起草 message

按上面的格式写出完整 message，包括编号列表。写的时候只陈述事实，不写评价——「更优雅」「提升了可维护性」「为后续打下基础」这类话删掉，换成具体改了什么。

### Step 5 征求同意

把完整 message 和准备提交的文件列表一起给用户看，等明确同意。

**明确同意**是指「提交吧」「可以」「ok」「就这个」这类不含糊的答复。沉默、转移话题、或者只评价了一句「还行」，都不算同意——继续等。

用户提出修改意见就改，改完再问一次。

### Step 6 执行提交

```bash
git add <用户确认的文件>
git commit -F <message-file>
git show --stat HEAD
```

- 多行 message 写到临时文件（系统临时目录）再用 `-F` 提交，比 `-m` 拼多行更可靠。
- 提交完跑 `git show --stat HEAD` 复核：文件列表和 message 都对。
- **到此为止，不 push。** 用户另行要求推送才推。

## 边界情况

- **没有可提交的改动**：直接说明，不创建空提交。
- **pre-commit 钩子失败**：报告失败原因并修复，不用 `--no-verify` 绕过。用户明确要求绕过时才绕，并说明后果。
- **处在 rebase / merge / 冲突未解决状态**：先提示当前状态，不提交。
- **误提交要改**：已推送的提交不 amend。未推送且用户明确要求，才可以 `--amend`。
- **子模块、二进制、大文件**：照常在 Step 2 列出来，由用户决定是否纳入，不替他排除。
- **一次改动横跨多个不相关主题**：拆成多条 commit，每条单独走一遍 Step 5 的确认。

## 示例

**合格：**

```
bugfix(export)/viewer 守卫自匹配导致导出永远走静态兜底
/@vite/client 的 includes 检测会把自身常量也命中——该常量随打包被内联进 viewer 包，守卫永久触发，导出全部退回无大纲无交互的静态快照

1. 守卫改为正则 /import\s*\(?\s*["']\/@vite\/client/，只匹配真实的 import 语句，不再匹配普通字符串
2. 重新构建的 viewer.js 用新守卫检测为 false（已验证），导出恢复走 viewer 路径
```

```
feat(auth)/新增 JWT 登录与刷新
原来只有 session cookie 登录，移动端拿不到可用凭证

1. 新增 internal/auth/jwt.go：签发 access token（15 分钟）与 refresh token（7 天），密钥从配置读
2. handler 新增 POST /api/auth/login 与 POST /api/auth/refresh
3. middleware 改为解析 Authorization: Bearer，解析失败按未登录处理
4. 预期行为：access 过期后凭 refresh 换发，refresh 过期需重新登录
```

```
chore(build)/清理 clippy 存量警告，pre-commit 门恢复全绿
工具链升级后存量告警阻塞了提交门

1. handler.rs 去掉多余的 &，改为直接传引用
2. Makefile 的 lint 目标补上 -- -D warnings
```

**不合格：**

| 反例 | 问题 |
|------|------|
| `更新代码` | 没有 category 和 module，看不出改了什么 |
| `feat: 优化性能` | 缺 module；「优化性能」没说清改了哪个东西 |
| `bugfix(editor)/修复问题` | 简述空，第 2 行也没补 |
| `feat(ui)/改了按钮颜色顺便修了登录崩溃` | 两件事塞进一条，category 也没法归 |
| subject 里写完所有细节、下面没有编号列表 | 信息全挤在标题，`git log --oneline` 会截断 |

## 质量红线

- 提交前取得用户明确同意。这一条没有例外。
- 不擅自 `git add`；只 commit 不 push。
- category 只能是 `feat` / `bugfix` / `chore`。
- 第 2 行不留空，编号列表前必须空一行。
- 一条 commit 只讲一件事。
- message 里不出现 emoji。
- 只写事实，不写评价。
