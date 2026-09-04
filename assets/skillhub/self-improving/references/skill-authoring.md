# 写新 skill

## 建骨架

用 `skill-creator` 自带的初始化脚本（需要时先 `use_skill skill-creator`）：

```bash
python3 "<skill-creator 目录>/scripts/init_skill.py" <skill-name> --path /Users/jacklingo/dev_custom/jstudio/assets/skillhub
```

脚本会生成 `SKILL.md` 模板和 `scripts/`、`references/`、`assets/` 三个示例目录。用不到的目录直接删，不要留占位文件。

## 目录结构

```
<skill-name>/
├── SKILL.md              # 必需，正文控制在 5k words 以内
├── scripts/              # 需要确定性执行的脚本（Python/Bash）
├── references/           # 需要时再读进上下文的文档
└── assets/               # 用于产出的模板、样例文件
```

渐进披露三段：frontmatter（常驻）→ SKILL.md 正文（触发时加载）→ references（按需加载）。细节一律往 `references/` 放，SKILL.md 只留流程与决策，不要两边重复同一段内容。

## frontmatter 要求

```yaml
---
name: <skill-name>
description: <做什么 + 什么时候用，第三人称>
---
```

- `name`：小写字母、数字、连字符，不超过 40 字符，必须与目录名完全一致，不能以连字符开头或结尾，不能出现连续连字符。
- `description`：单行；必须同时写清"做什么"和"什么场景触发"；用第三人称（"This skill should be used when..." 或"本 skill 用于..."）；不能含尖括号。
- 触发场景要写具体的用户说法、文件类型、任务类型，描述越具体越容易被正确触发。

## 正文写法

- 用祈使句（"打开文件""执行脚本"），不用第二人称（"你应该"）。
- 结构按用途选：流程型（Step 1 / Step 2）、任务型（按能力分节）、规范型（条目罗列），可混用。
- 引用的每个 `scripts/`、`references/`、`assets/` 文件都要在正文里说明什么时候用，否则等于没有。
- 给具体命令、路径、参数样例，不给抽象建议。

## 资源取舍

| 放哪 | 判据 |
|------|------|
| `scripts/` | 每次都在重写同一段代码，或需要确定性结果（格式化、生成、校验） |
| `references/` | 内容长、只在特定场景需要（schema、API 文档、详细流程） |
| `assets/` | 会被复制进最终产物的文件（模板、样板工程、图标） |

## 校验

```bash
python3 "<skill-creator 目录>/scripts/quick_validate.py" /Users/jacklingo/dev_custom/jstudio/assets/skillhub/<skill-name>
python3 "<skill-creator 目录>/scripts/package_skill.py" /Users/jacklingo/dev_custom/jstudio/assets/skillhub/<skill-name>
```

`quick_validate.py` 检查 frontmatter 是否存在、`name` 命名是否合规、`description` 是否含尖括号。`package_skill.py` 先校验再打包成 zip。

## 反哺已有 skill

1. 先读目标 skill 的 `SKILL.md` 和 `references/` 目录，确认结论是否已在其中。
2. 用 `replace_in_file` 做增量修改，不整体重写文件（大文件重写容易丢内容）。
3. 结论是细节 → 加进对应 `references/*.md`；结论改变流程 → 改 `SKILL.md` 正文；结论只是新增场景 → 在正文中补一行触发条件。
4. 改完把变更点写进汇报，说明影响了哪些已有用法。

## 仓库约定（产物必须遵守）

- 不出现 emoji：正文、注释、命令输出、文件名都不用。
- 不出现魔法值：阈值、超时、端口、路径等有语义的字面量，在脚本里命名成常量。
- 路径优先用绝对路径；脚本里引用本 skill 内文件时，用 `Path(__file__).resolve().parents[N]` 推导，不写死机器相关路径。
