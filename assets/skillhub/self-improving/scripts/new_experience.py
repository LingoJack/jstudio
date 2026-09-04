#!/usr/bin/env python3
"""经验条目骨架生成与格式校验。

创建条目（默认写入本 skill 所在 hub 的 experiences/ 目录）:

    new_experience.py --title "tab 栏关闭时底部闪白条" \
        --area desktop/ui \
        --summary "排查滚动条样式遮挡时查这条" \
        --tags wkwebview,css

校验已有条目:

    new_experience.py --validate experiences/desktop-ui-tab-bar-flash.md

退出码:
    0 成功
    1 参数或路径错误
    2 目标已存在或标题重复（改用 --force 覆盖重建，或更新原条目）
    3 校验未通过
"""

from __future__ import annotations

import argparse
from datetime import datetime
from pathlib import Path
import re
import sys

SKILL_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_HUB = SKILL_ROOT.parent
EXPERIENCES_DIRNAME = "experiences"
INDEX_FILENAME = "INDEX.md"
ENTRIES_MARKER = "<!-- entries -->"
INDEX_TEMPLATE_PATH = SKILL_ROOT / "assets" / "index-template.md"

REQUIRED_SECTIONS = ("背景", "表现", "根因", "解决", "相关改动")
SLUG_MAX_LENGTH = 50
SLUG_SEPARATOR_PATTERN = re.compile(r"[^\w]+", re.UNICODE)
FRONTMATTER_PATTERN = re.compile(r"^---\n(.*?)\n---", re.DOTALL)
TITLE_PATTERN = re.compile(r"^title:\s*(.+)$", re.MULTILINE)
EMOJI_PATTERN = re.compile("[\U0001f000-\U0001faff\u2600-\u27bf\ufe0f]")


def slugify(text: str) -> str:
    """把标题转成文件名片段，保留字母数字与 CJK 字符。"""
    slug = SLUG_SEPARATOR_PATTERN.sub("-", text).strip("-").lower()
    if len(slug) > SLUG_MAX_LENGTH:
        slug = slug[:SLUG_MAX_LENGTH].rstrip("-")
    return slug or "experience"


def area_to_prefix(area: str) -> str:
    """把 area（可含斜杠）转成文件名前缀，如 desktop/ui -> desktop-ui。"""
    prefix = SLUG_SEPARATOR_PATTERN.sub("-", area).strip("-").lower()
    return prefix or "general"


def read_frontmatter_title(path: Path) -> str | None:
    """读取 markdown 文件 frontmatter 中的 title 字段。"""
    try:
        content = path.read_text(encoding="utf-8")
    except OSError:
        return None
    match = FRONTMATTER_PATTERN.match(content)
    if match is None:
        return None
    title_match = TITLE_PATTERN.search(match.group(1))
    return title_match.group(1).strip() if title_match else None


def find_duplicate(experiences_dir: Path, title: str) -> Path | None:
    """查找已有条目中是否有相同标题，用于查重。"""
    if not experiences_dir.is_dir():
        return None
    for candidate in sorted(experiences_dir.glob("*.md")):
        if candidate.name == INDEX_FILENAME:
            continue
        if read_frontmatter_title(candidate) == title:
            return candidate
    return None


def build_entry(
    title: str, entry_date: str, area: str, tags: list[str], source: str
) -> str:
    """按「背景 / 表现 / 根因 / 解决 / 相关改动」结构生成条目骨架。"""
    tag_list = ", ".join(tags)
    lines = [
        "---",
        f"title: {title}",
        f"date: {entry_date}",
        f"area: {area}",
        f"tags: [{tag_list}]",
        "status: active",
    ]
    if source:
        lines.append(f"source: {source}")
    lines.extend(["---", ""])

    hints = {
        "背景": "事情发生在哪：模块、场景、触发动作、版本或环境。写成可复现的前置条件，不写评价。",
        "表现": "观测到的事实：报错原文、日志片段、界面现象、复现步骤、与预期的差异。数字写具体。",
        "根因": "机制层面的原因，拆到能按步骤讲通。落到可验证位置：文件:行、函数名、规范条款、版本号。",
        "解决": "实际改法：具体改动、关键代码或命令、为什么这样改命中了根因。",
        "相关改动": "- `path/to/file:line` —— 改了什么",
        "复用提示": "下次遇到同类现象第一步查什么、哪些做法已验证不可用。没有就删掉这一节。",
    }
    sections = list(REQUIRED_SECTIONS) + ["复用提示"]
    for index, section in enumerate(sections):
        lines.append(f"## {section}")
        lines.append("")
        lines.append(f"<!-- {hints[section]} -->")
        if index < len(sections) - 1:
            lines.append("")

    return "\n".join(lines) + "\n"


def append_to_index(
    index_path: Path, entry_path: Path, title: str, summary: str, entry_date: str
) -> None:
    """把条目追加到索引，条目行插入在 entries 标记之后。"""
    if index_path.exists():
        content = index_path.read_text(encoding="utf-8")
    elif INDEX_TEMPLATE_PATH.exists():
        content = INDEX_TEMPLATE_PATH.read_text(encoding="utf-8")
    else:
        content = f"# 经验索引\n\n{ENTRIES_MARKER}\n"

    relative_path = entry_path.relative_to(index_path.parent)
    summary_text = summary or "（待补摘要）"
    entry_line = (
        f"- {entry_date} [{title}]({relative_path.as_posix()}) —— {summary_text}"
    )

    if ENTRIES_MARKER in content:
        content = content.replace(ENTRIES_MARKER, f"{ENTRIES_MARKER}\n{entry_line}", 1)
    else:
        content = content.rstrip("\n") + f"\n{entry_line}\n"

    index_path.parent.mkdir(parents=True, exist_ok=True)
    index_path.write_text(content, encoding="utf-8")


def validate_entry(path: Path) -> list[str]:
    """校验条目是否包含必需章节与合法 frontmatter，返回问题列表。"""
    problems: list[str] = []
    if not path.is_file():
        return [f"文件不存在: {path}"]

    content = path.read_text(encoding="utf-8")

    frontmatter_match = FRONTMATTER_PATTERN.match(content)
    if frontmatter_match is None:
        problems.append("缺少 YAML frontmatter")
    else:
        frontmatter = frontmatter_match.group(1)
        for field in ("title", "date", "area", "status"):
            if not re.search(rf"^{field}:", frontmatter, re.MULTILINE):
                problems.append(f"frontmatter 缺少字段: {field}")

    body = content[frontmatter_match.end() :] if frontmatter_match else content
    for section in REQUIRED_SECTIONS:
        if not re.search(rf"^##\s+{re.escape(section)}\s*$", body, re.MULTILINE):
            problems.append(f"缺少章节: ## {section}")

    for line_number, line in enumerate(content.splitlines(), start=1):
        if EMOJI_PATTERN.search(line):
            problems.append(f"第 {line_number} 行含 emoji，违反仓库约定")
            break

    if "TODO" in content or "待补充" in content:
        problems.append("存在未填写的占位内容（TODO / 待补充）")

    return problems


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="经验条目骨架生成与格式校验")
    parser.add_argument("--title", help="条目标题，格式「现象 + 定位」")
    parser.add_argument("--area", help="子系统或模块，如 desktop/ui")
    parser.add_argument("--summary", default="", help="索引里的一句话摘要")
    parser.add_argument("--tags", default="", help="检索关键词，逗号分隔")
    parser.add_argument("--source", default="", help="来源线索，如任务描述或 commit 号")
    parser.add_argument(
        "--hub", default=str(DEFAULT_HUB), help="经验库根目录，默认为 skill 所在 hub"
    )
    parser.add_argument("--force", action="store_true", help="目标文件已存在时覆盖重建")
    parser.add_argument(
        "--validate", nargs="+", metavar="FILE", help="校验已有条目，不做创建"
    )
    return parser.parse_args(argv)


def run_validate(paths: list[str]) -> int:
    exit_code = 0
    for raw_path in paths:
        path = Path(raw_path).expanduser().resolve()
        problems = validate_entry(path)
        if problems:
            exit_code = 3
            print(f"[FAIL] {path}")
            for problem in problems:
                print(f"  - {problem}")
        else:
            print(f"[OK] {path}")
    return exit_code


def run_create(args: argparse.Namespace) -> int:
    if not args.title or not args.area:
        print("创建条目需要 --title 与 --area")
        return 1

    hub = Path(args.hub).expanduser().resolve()
    if not hub.is_dir():
        print(f"hub 目录不存在: {hub}")
        return 1

    experiences_dir = hub / EXPERIENCES_DIRNAME
    experiences_dir.mkdir(parents=True, exist_ok=True)

    duplicate = find_duplicate(experiences_dir, args.title)
    if duplicate is not None:
        print(f"已存在同标题条目，请更新原条目而不是新建: {duplicate}")
        return 2

    entry_date = datetime.now().astimezone().date().isoformat()
    filename = f"{area_to_prefix(args.area)}-{slugify(args.title)}.md"
    entry_path = experiences_dir / filename

    if entry_path.exists() and not args.force:
        print(f"目标文件已存在: {entry_path}")
        print("改用 --force 覆盖重建，或用编辑工具更新原条目")
        return 2

    tags = [tag.strip() for tag in args.tags.split(",") if tag.strip()]
    entry_path.write_text(
        build_entry(args.title, entry_date, args.area, tags, args.source),
        encoding="utf-8",
    )

    append_to_index(
        experiences_dir / INDEX_FILENAME,
        entry_path,
        args.title,
        args.summary,
        entry_date,
    )

    print(f"已创建条目: {entry_path}")
    print(f"已更新索引: {experiences_dir / INDEX_FILENAME}")
    print("下一步：填写五个必需章节，然后执行")
    print(f"  python3 {Path(__file__).resolve()} --validate {entry_path}")
    return 0


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if args.validate:
        return run_validate(args.validate)
    return run_create(args)


if __name__ == "__main__":
    sys.exit(main())
