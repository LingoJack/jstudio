# 长期记忆

## 经验沉淀约定（2026-09-04 起）

- 沉淀入口 skill：`assets/skillhub/self-improving/`。用户要求「复盘/沉淀/写成 skill/记经验」时使用。
- 经验条目格式：背景 / 表现 / 根因 / 解决 / 相关改动（可选「复用提示」）。
- 存放位置：经验 doc 在 `assets/skillhub/experiences/<area>-<slug>.md`，索引 `experiences/INDEX.md`；沉淀出的新 skill 在 `assets/skillhub/<skill-name>/`。
- 生成与校验：`assets/skillhub/self-improving/scripts/new_experience.py`。
- 仓库级长期约定写 `CODEBUDDY.md` 或 `.codebuddy/rules/`，只属于单次会话的上下文写 `.codebuddy/memory/YYYY-MM-DD.md`。

## 本机 Python 工具安装方式（2026-09-04）

- `pip install` 直接装会失败两层：环境变量 `PIP_REQUIRE_VIRTUALENV=true`，以及 Homebrew Python 的 PEP 668 externally-managed 限制。
- 装 ruff 这类命令行工具用 `brew install <tool>`（已装 ruff 0.16.6，位于 `/opt/homebrew/bin/ruff`）；不要用 `--break-system-packages`。
- 需要具体版本而 brew 不满足时，用 `python3 -m venv` + `pipx`。
- 本仓库 ruff 启用了 DTZ 规则：`date.today()` 会报 DTZ011，改用 `datetime.now().astimezone().date()`。
- LintBot 的 isort 配置是 `force-sort-within-sections = true`：`import x` 与 `from x import y` 按模块名混排（argparse / datetime / pathlib / re / sys）。本机无 ruff 配置时 ruff 0.16 默认相反（先排 `import`，再排 `from`），两者对同一文件只能满足其一；以 LintBot 为准。仓库根没有 pyproject.toml/ruff.toml，配置冲突暂无仲裁文件。
