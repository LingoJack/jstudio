# 方案：新增 `j reportctl merge` 子命令

## 目标

支持将**另一个 GitHub 仓库 / 本地路径**的日报按日期合并到主仓库，输出到新文件 `week_report.merged.md`，不修改原文件。

## 用法

```
j reportctl merge <source>
```

- `<source>` 以 `http://`、`https://`、`git@` 开头 → 视为远程仓库 URL，clone 到临时目录读取后清理
- 否则 → 视为本地路径（目录则在其下找同名 `week_report.md`，文件则直接读取）

## 合并算法（核心）

### 数据结构

```rust
struct WeekSection {
    range_str: String,       // "2024.01.01-2024.01.07"（用作去重 key）
    start_date: NaiveDate,   // 解析自 range_str，用于排序
    header_line: String,     // 原始标题行 "# Week3[2024.01.01-2024.01.07]"
    entries: Vec<String>,    // 原始条目行 ["- 【2024/01/01】 内容", ...]
}
```

### 解析规则

逐行扫描 report 文件：
1. 匹配 `^#\s+Week\d+\[([\d.]+)-([\d.]+)\]` → 开启新 WeekSection，解析出 start_date / range_str
2. 匹配 `^\s*-\s*【` → 当前周的条目，push 到 `entries`
3. 其他非空行（周标题之前的文件头/说明）→ 收集为 `preamble`（前导文本），原样保留
4. 空行 → 忽略（输出时按格式重新生成空行）

### 合并逻辑

1. 解析主文件 → `target_weeks: Vec<WeekSection>`
2. 解析源文件 → `source_weeks: Vec<WeekSection>`
3. 对每个 source week，按 `range_str` 在 target_weeks 中查找匹配：
   - **找到**：把 source 的 entries 原样追加到 target week 的 entries 末尾（不去重、不排序）
   - **未找到**：加入 `new_weeks` 列表
4. 合并 `target_weeks + new_weeks`，按 `start_date` 升序排列
5. **重新编号**：按排序后的顺序重新赋 Week 编号（Week1, Week2, ...），保持日期范围不变
6. 拼接输出：`preamble` + 各 WeekSection（标题行 + 条目行，周与周之间空一行）

### 输出文件

主 report 文件同目录下，文件名加 `.merged` 后缀：
- `~/.jdata/report/week_report.md` → `~/.jdata/report/week_report.merged.md`
- 输出后提示用户路径，建议用 `j reportctl open` 确认后手动替换

## 改动清单

### 1. `src/constants.rs` — 注册常量（+1 行）

```rust
pub mod rmeta_action {
    pub const NEW: &str = "new";
    pub const SYNC: &str = "sync";
    pub const PUSH: &str = "push";
    pub const PULL: &str = "pull";
    pub const SET_URL: &str = "set-url";
    pub const OPEN: &str = "open";
    pub const MERGE: &str = "merge";   // ← 新增
}
```

### 2. `src/command/report/merge.rs` — 新建合并模块（核心）

公共入口：

```rust
pub fn handle_merge(source: Option<&str>, config: &YamlConfig)
```

内部函数：
- `parse_report(content: &str) -> (preamble: String, weeks: Vec<WeekSection>)`
- `fetch_source_report(source: &str, config) -> Option<String>`
  - 远程 URL → `git clone --depth 1 -b main <url> <tmp>` 到 tempdir，读取同名 report 文件，清理 tempdir
  - 本地路径 → 目录则读 `<dir>/week_report.md`，文件则直接读
- `merge_weeks(target: Vec<WeekSection>, source: Vec<WeekSection>) -> Vec<WeekSection>`
- `render_report(preamble: &str, weeks: &[WeekSection]) -> String`

依赖：复用 `std::env::temp_dir()` + 手动 `fs::remove_dir_all` 管理临时 clone 目录（与 `git.rs` 的 `pull_via_clone` 模式一致，不引入新 crate）。

### 3. `src/command/report.rs` — 注册模块（+1 行）

```rust
pub mod merge;   // ← 新增
```

### 4. `src/command/report/write.rs` — 分发分支 + usage

在 `handle_report` 的 reportctl match 块中新增分支：

```rust
f if f == crate::constants::rmeta_action::MERGE => {
    let source = content.get(1).map(|s| s.as_str());
    super::merge::handle_merge(source, config);
}
```

更新两处 usage/error 提示文本，加入 `merge`。

### 5. `src/interactive/completer.rs` — 补全列表（+1 行）

在 reportctl 的 `ArgHint::Fixed` 列表中加入 `rmeta_action::MERGE`。

### 6. `src/interactive/parser.rs` — usage 提示（+1 词）

更新 `reportctl <new|sync|push|pull|set-url|merge> ...` 提示文本。

### 7. `assets/help/日报/管理命令.md` — 帮助文档（+1 行）

```
| `j reportctl merge <url|path>` | 合并另一个仓库/路径的日报到 merged 文件 |
```

## 边界处理

| 场景 | 处理 |
|------|------|
| source 为空 | 报 usage 错误 |
| 远程 clone 失败 | 报错退出，清理 tempdir |
| 源文件不存在 / 读取失败 | 报错退出 |
| 源文件无可识别的周 | 报错："源日报文件未包含任何周数据" |
| 主文件为空 | 正常合并（结果 = 源文件内容，重新编号）|
| 周标题格式不规范（无法解析日期）| 该周仍保留，但 start_date 取默认值，排序时放最后 |
| 条目行无日期前缀 | 仍作为条目保留在当前周 |

## 验证方式

1. `cargo build` 编译通过
2. 准备两个测试 report 文件，验证合并结果：
   - 相同周的条目被合并到一起（target 在前，source 在后）
   - 不同周按日期排序、重新编号
   - 输出到 `.merged.md`，原文件不变
3. 测试远程 URL 和本地路径两种 source 模式
