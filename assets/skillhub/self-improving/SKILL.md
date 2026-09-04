---
name: self-improving
description: 把一次任务中查明的根因、验证过的做法、用户定下的长期约束，固化为可复用的经验 doc 或新 skill，条目统一采用「背景 / 表现 / 根因 / 解决 / 相关改动」结构。This skill should be used when the user asks to 复盘、沉淀、总结经验、写成 skill、记进经验库，也适用于一轮多轮试错的调试刚收敛、方向被用户纠正、用户给出长期偏好或约束、完成跨文件改造且含非常规做法的场景。
---

# 自我沉淀（self-improving）

## Overview

本 skill 回答一个问题：这次才知道的事，怎么变成下次直接能用的东西。

产物有两类：

- **经验 doc**：记录一次具体问题的因果链（背景 / 表现 / 根因 / 解决 / 相关改动），供下次同类现象检索。
- **新 skill**：记录可复用的流程或领域知识，供下次同类任务直接加载执行。

默认经验库目录为 `<hub>/experiences/`（hub 指本 skill 所在的 `assets/skillhub/`），索引为 `<hub>/experiences/INDEX.md`。

## 何时触发

- 用户明确要求：复盘、沉淀、总结经验、写成 skill、记一下、写进经验库。
- 一轮调试刚收敛，且过程中出现过以下任一信号：
  - 连续 3 次以上试错才命中；
  - 方向被用户或事实纠正过（先做的是错的）；
  - 结论必须读源码或查规范才能得出，不是通用常识。
- 用户给出长期约束或偏好（"以后都这样""不要再那样""这是我的习惯"）。
- 完成一次跨文件改造，其中包含反直觉的取舍、绕过限制的写法、或依赖隐式机制（库内部行为、CSS 规范细节、框架未写明的约定）。
- 主任务已完成但本轮出现了上述信号且用户未提要求：汇报并询问是否沉淀，不擅自落盘。

## 何时不触发

- 一次性笔误、拼写错误、未查明根因的环境抖动。
- 一次 grep 或读一个函数就能得到的信息（可推导的事实不沉淀）。
- 代码与注释已经写清楚的内容。
- 主任务还没完成：先完成主任务，沉淀排在最后，不打断主流程。

## 工作流

### Step 1 收集信号（任务进行中就记，不要事后回忆）

从本轮任务里保留四类原始事实：

1. **错误原文**：完整首行和关键栈行，不转述。
2. **试错序列**：试过什么、每次结果如何、哪一步否定了哪个假设。
3. **代码事实**：文件:行、函数名、配置项、版本号。
4. **用户原话**：约束与偏好按原话记，不改写。

### Step 2 判定价值

命中两条以上才沉淀（完整清单见 `references/extraction.md`）：

- 下次遇到同类现象，能否靠它少走一次试错？
- 结论是否依赖本仓库的特定结构或版本？
- 是否存在"看起来该这样、实际不能这样"的坑？
- 是否涉及用户明确表达的偏好或红线？
- 如果不记，下次是否只能重新读一遍源码才能得出？

### Step 3 选择去向

决策表见 `references/promotion.md`，结论速览：

| 情形 | 去向 |
|------|------|
| 查明根因的具体问题 | `experiences/<area>-<slug>.md` |
| 已第二次用到、或需 3 步以上讲清的做法 | 新建 skill |
| 与已有 skill 主题重合 | 增量更新该 skill，不新建 |
| 属于"这个仓库就这样"的约定 | `CODEBUDDY.md` / `.codebuddy/rules/` |
| 只与本次会话相关 | `.codebuddy/memory/YYYY-MM-DD.md` |

### Step 4 写经验条目

1. 用 `scripts/new_experience.py` 生成骨架（自带 frontmatter、五个必需章节、查重、索引追加）。
2. 按 `references/format-spec.md` 填内容；字段含义和填写粒度以该文件为准，示例见 `assets/experience-template.md`。
3. 填完跑一次 `--validate`，缺章或带 emoji 会直接报出来。

### Step 5 反哺

- 结论是可复用流程 → 按 `references/skill-authoring.md` 新建或更新 skill；新建骨架用 `skill-creator` 的 `init_skill.py`。
- 结论是仓库级约定 → 改 `CODEBUDDY.md` 或 `.codebuddy/rules/`。
- 结论只属于本次会话上下文 → 追加到 `.codebuddy/memory/YYYY-MM-DD.md`。
- 被新结论推翻的旧条目：把 `status` 改成 `superseded-by` 并指向新条目，不删原文。

### Step 6 汇报

输出三块：新增或修改的文件绝对路径、条目的一句话摘要、反哺去向（若有）。

## 质量红线

- 五个必需章节齐全，缺一不得宣称完成。
- 只写事实：改了什么、命中哪条根因、验证了什么。不写"更优雅""提升了可维护性""打下基础"这类评价。
- 出现"应该 / 建议 / 可以考虑"但没有可执行动作时，重写成具体命令、路径或步骤。
- 根因必须落到可验证的位置（文件:行、规范条款、版本号）。写"可能是 / 大概是"的，回去查证；查不到就从条目里删掉推测。
- 一条经验只讲一件事；多件事拆多条。
- 落盘前查重（脚本比对已有条目标题）：重复则更新原条目，不新建。
- 产物中不出现 emoji（仓库约定）。

## Resources

### scripts/

- `scripts/new_experience.py`：生成经验条目骨架、查重、追加索引；`--validate` 校验已有条目的章节与格式。

```bash
python3 scripts/new_experience.py --title "标题" --area editor --summary "一句话摘要" --tags tiptap,css
python3 scripts/new_experience.py --validate experiences/editor-xxx.md
```

### references/

- `references/format-spec.md`：章节定义、frontmatter 字段、合格示例、常见不合格写法。
- `references/extraction.md`：信号清单、价值判定五问、不值得沉淀的清单。
- `references/promotion.md`：去向决策表、目录与命名规则、索引与查重规则。
- `references/skill-authoring.md`：写新 skill 的目录结构、frontmatter 要求、渐进披露原则、验证与反哺方式。

### assets/

- `assets/experience-template.md`：条目模板（含每章填写提示）。
- `assets/index-template.md`：经验库索引模板。
