# 沉淀去向决策

## 决策表

按从上到下的顺序判定，命中即停：

| 条件 | 去向 |
|------|------|
| 结论是"这个仓库就这样"的约定（命令、目录、格式、禁忌） | `CODEBUDDY.md` 或 `.codebuddy/rules/<rule>.md` |
| 只与本次会话相关，下次会话不需要（进行中的上下文、临时决定） | `.codebuddy/memory/YYYY-MM-DD.md` |
| 与已有 skill 主题重合（skillhub 下或 `~/.codebuddy/skills/`） | 增量更新该 skill 的 `references/` 或 `SKILL.md`，不新建 |
| 做法已被用到第二次，或需要 3 步以上才讲得清 | 新建 skill |
| 查明根因的具体问题（一次性的因果链） | `experiences/<area>-<slug>.md` |
| 三者都不是 | 不沉淀 |

判断"流程还是因果"：能写成「遇到 X 就做 A-B-C」的进 skill；只能写成「X 现象是因为 Y」的进 experiences。

## 目录与命名

```
docs/exps/                      # 经验库，固定在执行脚本时当前目录下的 docs/exps/
├── INDEX.md                    # 索引，一条一行
└── <area>-<slug>.md            # 一条经验一个文件
```

- `<area>`：模块标识，斜杠转连字符，如 `desktop/editor` → `desktop-editor`。
- `<slug>`：标题 slug 化，保留中日韩字符与字母数字，其余转连字符，最长 50 字符。
- 例：`desktop-ui-tab-bar-scrollbar-flash.md`

## 作用域选择（新建 skill 时）

| 作用域 | 路径 | 适用 |
|--------|------|------|
| 本仓库共享 | `.codebuddy/skills/<skill-name>/` | 与仓库绑定的流程、给协作者用 |
| 个人跨项目 | `~/.codebuddy/skills/<skill-name>/` | 个人工作流、跨仓库通用 |

## 索引规则

`docs/exps/INDEX.md` 一行一条，格式：

```
- YYYY-MM-DD [标题](<file>.md) —— 一句话摘要
```

索引位于 `docs/exps/` 目录内，链接写文件名即可。

- 由 `scripts/new_experience.py` 追加；手写时保持同一格式，否则后续追加会错位。
- 摘要写"下次什么场景会用到它"，不写"解决了什么问题"（后者在条目里）。
- 文件中保留 `<!-- entries -->` 标记，脚本在标记后插入新行；标记丢失时脚本退化为追加到文件末尾。

## 查重与更新

落盘前必做：

1. 用标题关键词 grep `docs/exps/` 与 `INDEX.md`。
2. 命中同主题条目 → 更新原条目（补 `## 复用提示` 或修正根因），不新建文件。
3. 原结论被推翻 → 原条目 `status` 改为 `superseded-by: <新文件名>`，新条目独立成文，不删原文。
4. 条目对应的代码已删除或架构已变 → `status: deprecated`，保留正文供追溯。

## 反哺的触发条件

- 同一做法第三次被用到 → 从 experiences 提到 skill。
- 同一根因第二次出现 → 说明条目没被检索到，补 `tags` 与索引摘要里的关键词（用代码里的真实标识符）。
- 用户在对话中重复纠正同一个点 → 写进 `CODEBUDDY.md` 或 rules，而不是只记进 experiences。
