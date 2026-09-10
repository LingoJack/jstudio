#!/usr/bin/env python3
"""接口契约条目的生成、校验与渲染。

契约库默认在当前目录下的 docs/apis/，条目一行一个接口，存于 contract.jsonl。
用 --dir 指到别处。

  python3 new_api.py --new --id doc-list --title "拉取文档列表" \
      --module documents --method GET --path /api/v1/documents --requirement req-2026-0910-doc-sync
  python3 new_api.py --validate
  python3 new_api.py --render
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import date
from pathlib import Path

CONTRACT_FILE = "contract.jsonl"
RENDER_FILE = "API.md"
REQ_SUBDIR = "reqs"

METHODS = ("GET", "POST", "PUT", "PATCH", "DELETE")
STATUSES = ("draft", "agreed", "implemented", "deprecated")
REQUEST_PARTS = ("headers", "path_params", "query", "body")
ID_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
ERROR_CODE_RE = re.compile(r"^[A-Z][A-Z0-9_]*$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
HANDLER_RE = re.compile(r"^[^\s:]+:\d+$")
EMOJI_RE = re.compile("[\U0001f000-\U0001faff\u2600-\u27bf\ufe0f]")
TODO_RE = re.compile(r"TODO", re.IGNORECASE)

REQUIRED_FIELDS = (
    "id",
    "requirement",
    "title",
    "module",
    "method",
    "path",
    "status",
    "auth",
    "created",
    "updated",
    "background",
    "expected",
    "request",
    "response",
    "errors",
)


def contract_path(root: Path) -> Path:
    return root / CONTRACT_FILE


def load_entries(root: Path) -> list[dict]:
    path = contract_path(root)
    if not path.exists():
        return []
    entries = []
    for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = line.strip()
        if not line:
            continue
        try:
            entries.append(json.loads(line))
        except json.JSONDecodeError as exc:
            raise SystemExit(f"{path}:{lineno} 不是合法 JSON: {exc}")
    return entries


def request_skeleton(auth: str) -> dict:
    """只放确定需要的部位；headers/path_params/query/body 按实际接口增删。"""
    request = {}
    if auth == "bearer":
        request["headers"] = {
            "type": "object",
            "properties": {
                "Authorization": {
                    "type": "string",
                    "description": "Bearer <access token>，缺失或过期按未登录处理",
                }
            },
            "required": ["Authorization"],
        }
    request["query"] = {
        "type": "object",
        "properties": {
            "TODO_field": {
                "type": "string",
                "description": "TODO 这个字段是什么、取值范围、默认值",
            }
        },
        "required": [],
    }
    return request


def skeleton(args) -> dict:
    today = date.today().isoformat()
    return {
        "id": args.id,
        "requirement": args.requirement,
        "title": args.title,
        "module": args.module,
        "method": args.method.upper(),
        "path": args.path,
        "status": "draft",
        "auth": args.auth,
        "owner": args.owner or "TODO 负责人",
        "created": today,
        "updated": today,
        "background": "TODO 为什么要有这个接口：现在缺什么、谁在等它",
        "expected": "TODO 调用后发生什么：写入哪些数据、返回什么、幂等性、并发与边界",
        "request": request_skeleton(args.auth),
        "response": {
            "success": {
                "http_status": 200,
                "schema": {
                    "type": "object",
                    "properties": {
                        "TODO_field": {
                            "type": "string",
                            "description": "TODO 这个字段是什么、由什么决定",
                        }
                    },
                    "required": [],
                },
            }
        },
        "errors": [
            {
                "code": "INVALID_REQUEST",
                "http_status": 400,
                "message": "invalid request",
                "when": "TODO 什么输入会触发",
            }
        ],
        "impl": {"handler": "", "verified": "", "notes": ""},
    }


def cmd_new(root: Path, args) -> int:
    if not ID_RE.match(args.id):
        raise SystemExit(f"id 必须是 kebab-case（小写字母数字与短横线）：{args.id}")
    entries = load_entries(root)
    for entry in entries:
        if entry.get("id") == args.id:
            raise SystemExit(f"id 已存在：{args.id}（更新原条目，不要新建）")
        same_route = (
            entry.get("method") == args.method.upper() and entry.get("path") == args.path
        )
        if same_route:
            raise SystemExit(
                f"{args.method.upper()} {args.path} 已由条目 {entry.get('id')} 描述"
            )
    root.mkdir(parents=True, exist_ok=True)
    (root / REQ_SUBDIR).mkdir(exist_ok=True)
    with contract_path(root).open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(skeleton(args), ensure_ascii=False) + "\n")
    print(f"已追加条目 {args.id} -> {contract_path(root)}")
    req_doc = root / REQ_SUBDIR / f"{args.requirement}.md"
    if not req_doc.exists():
        print(f"需求文档还不存在，按 assets/requirement-template.md 建：{req_doc}")
    print("下一步：填掉所有 TODO，然后跑 --validate")
    return 0


def walk_schema(schema, prefix: str, errors: list[str], where: str) -> None:
    """检查 schema 每个字段都有 type 与非空 description。"""
    if not isinstance(schema, dict):
        errors.append(f"{where}{prefix} 不是对象")
        return
    if "type" not in schema:
        errors.append(f"{where}{prefix or '(根)'} 缺 type")
    kind = schema.get("type")
    if kind == "object":
        props = schema.get("properties")
        # 原样透传的载荷（服务端不解析内部结构）用 additionalProperties: true 声明，
        # 与"忘了写字段"区分开。
        if props in (None, {}) and "additionalProperties" in schema:
            return
        if not isinstance(props, dict):
            errors.append(f"{where}{prefix or '(根)'} 是 object 但缺 properties")
            return
        if not props:
            errors.append(
                f"{where}{prefix or '(根)'} 的 properties 为空："
                "没有字段就删掉这一部位；结构不解析就写 additionalProperties: true"
            )
            return
        required = schema.get("required", [])
        if not isinstance(required, list):
            errors.append(f"{where}{prefix or '(根)'} 的 required 必须是数组")
            required = []
        for name in required:
            if name not in props:
                errors.append(
                    f"{where}{prefix or '(根)'} required 里的 {name} 不在 properties 中"
                )
        for name, sub in props.items():
            child = f"{prefix}.{name}" if prefix else name
            if isinstance(sub, dict) and not str(sub.get("description", "")).strip():
                errors.append(f"{where}{child} 缺 description（字段含义必填）")
            walk_schema(sub, child, errors, where)
    elif kind == "array":
        items = schema.get("items")
        if items is None:
            errors.append(f"{where}{prefix or '(根)'} 是 array 但缺 items")
        else:
            walk_schema(items, f"{prefix}[]", errors, where)


def check_entry(entry: dict, index: int) -> list[str]:
    errors: list[str] = []
    eid = entry.get("id") or f"第 {index} 条"
    where = f"[{eid}] "

    for field in REQUIRED_FIELDS:
        if field not in entry or entry[field] in ("", None, [], {}):
            errors.append(f"{where}缺字段 {field}")
    if errors:
        return errors

    if not ID_RE.match(str(entry["id"])):
        errors.append(f"{where}id 必须是 kebab-case")
    if entry["method"] not in METHODS:
        errors.append(f"{where}method 必须是 {'/'.join(METHODS)}")
    if not str(entry["path"]).startswith("/"):
        errors.append(f"{where}path 必须以 / 开头")
    if entry["status"] not in STATUSES:
        errors.append(f"{where}status 必须是 {'/'.join(STATUSES)}")
    for field in ("created", "updated"):
        if not DATE_RE.match(str(entry[field])):
            errors.append(f"{where}{field} 必须是 YYYY-MM-DD")

    request = entry["request"]
    if not isinstance(request, dict):
        errors.append(f"{where}request 必须是对象")
    else:
        unknown = set(request) - set(REQUEST_PARTS)
        if unknown:
            errors.append(
                f"{where}request 出现未知部位 {sorted(unknown)}，只允许 {list(REQUEST_PARTS)}"
            )
        for part, schema in request.items():
            walk_schema(schema, "", errors, f"{where}request.{part} ")

    response = entry["response"]
    success = response.get("success") if isinstance(response, dict) else None
    if not isinstance(success, dict):
        errors.append(f"{where}response.success 缺失")
    else:
        if not isinstance(success.get("http_status"), int):
            errors.append(f"{where}response.success.http_status 必须是整数")
        if "schema" not in success:
            errors.append(f"{where}response.success.schema 缺失")
        else:
            walk_schema(success["schema"], "", errors, f"{where}response.success ")

    seen_codes = set()
    if not isinstance(entry["errors"], list):
        errors.append(f"{where}errors 必须是数组")
    else:
        for err in entry["errors"]:
            if not isinstance(err, dict):
                errors.append(f"{where}errors 每项必须是对象")
                continue
            code = err.get("code", "")
            if not ERROR_CODE_RE.match(str(code)):
                errors.append(f"{where}错误码 {code!r} 必须是 UPPER_SNAKE_CASE")
            if code in seen_codes:
                errors.append(f"{where}错误码 {code} 在本条目内重复")
            seen_codes.add(code)
            if not isinstance(err.get("http_status"), int):
                errors.append(f"{where}错误码 {code} 缺 http_status（整数）")
            for field in ("message", "when"):
                if not str(err.get(field, "")).strip():
                    errors.append(f"{where}错误码 {code} 缺 {field}")

    if entry["status"] == "implemented":
        impl = entry.get("impl") or {}
        handler = str(impl.get("handler", ""))
        if not HANDLER_RE.match(handler):
            errors.append(
                f"{where}status=implemented 必须填 impl.handler 为 文件:行（当前 {handler!r}）"
            )
        if not DATE_RE.match(str(impl.get("verified", ""))):
            errors.append(f"{where}status=implemented 必须填 impl.verified 核对日期")

    blob = json.dumps(entry, ensure_ascii=False)
    if EMOJI_RE.search(blob):
        errors.append(f"{where}含 emoji（仓库约定不允许）")
    if TODO_RE.search(blob):
        errors.append(f"{where}还留着 TODO 占位，填完再校验")
    return errors


def cmd_validate(root: Path, args) -> int:
    entries = load_entries(root)
    if not entries:
        print(f"{contract_path(root)} 没有条目")
        return 0
    errors: list[str] = []
    ids: dict[str, int] = {}
    routes: dict[tuple, str] = {}
    for index, entry in enumerate(entries, 1):
        if args.id and entry.get("id") != args.id:
            continue
        errors.extend(check_entry(entry, index))
        eid = entry.get("id")
        if eid in ids:
            errors.append(f"[{eid}] id 重复（第 {ids[eid]} 条与第 {index} 条）")
        ids[eid] = index
        route = (entry.get("method"), entry.get("path"))
        if route in routes:
            errors.append(
                f"{route[0]} {route[1]} 被两个条目描述：{routes[route]} 与 {eid}"
            )
        routes[route] = eid

    if errors:
        for line in errors:
            print(line)
        print(f"\n不合格：{len(errors)} 处问题")
        return 1
    print(f"通过：{len(ids)} 个接口条目")
    return 0


def flatten(
    schema, prefix: str = "", required: bool = False, emit_self: bool = True
) -> list[tuple]:
    """展平 schema 为 (字段, 类型, 必填, 说明) 行。

    嵌套对象自身也占一行（说明写在对象上，如"按 revision 倒序"）；数组元素是对象时
    不再为元素本身开一行，直接以 field[].sub 展开，避免和数组那行重复。
    """
    rows = []
    if not isinstance(schema, dict):
        return rows
    kind = schema.get("type")
    if prefix and emit_self:
        rows.append(
            (prefix, kind or "", "是" if required else "否", schema.get("description", ""))
        )
    if kind == "object":
        req = set(schema.get("required", []))
        for name, sub in (schema.get("properties") or {}).items():
            child = f"{prefix}.{name}" if prefix else name
            rows.extend(flatten(sub, child, name in req))
    elif kind == "array":
        items = schema.get("items") or {}
        items_is_object = isinstance(items, dict) and items.get("type") == "object"
        rows.extend(flatten(items, f"{prefix}[]", False, emit_self=not items_is_object))
    return rows


def schema_table(schema, title: str) -> list[str]:
    rows = flatten(schema)
    if not rows:
        return []
    out = [f"**{title}**", "", "| 字段 | 类型 | 必填 | 说明 |", "|------|------|------|------|"]
    for name, kind, req, desc in rows:
        out.append(f"| `{name}` | {kind} | {req} | {desc} |")
    out.append("")
    return out


def render_entry(entry: dict) -> list[str]:
    out = [f"### {entry['method']} {entry['path']}", ""]
    out.append(f"{entry['title']}")
    out.append("")
    meta = [
        f"- 条目 id：`{entry['id']}`",
        f"- 需求：`{entry['requirement']}`",
        f"- 状态：{entry['status']}",
        f"- 鉴权：{entry.get('auth', '')}",
        f"- 创建 / 更新：{entry['created']} / {entry['updated']}",
    ]
    if entry.get("owner"):
        meta.append(f"- 负责人：{entry['owner']}")
    impl = entry.get("impl") or {}
    if impl.get("handler"):
        verified = impl.get("verified") or "未核对"
        meta.append(f"- 实现：`{impl['handler']}`（核对 {verified}）")
    out.extend(meta)
    out.append("")
    out.append(f"需求背景：{entry['background']}")
    out.append("")
    out.append(f"预期表现：{entry['expected']}")
    out.append("")

    labels = {
        "headers": "请求头",
        "path_params": "路径参数",
        "query": "查询参数",
        "body": "请求体",
    }
    for part in REQUEST_PARTS:
        if part in (entry.get("request") or {}):
            out.extend(schema_table(entry["request"][part], labels[part]))

    success = entry["response"]["success"]
    out.extend(schema_table(success["schema"], f"响应体（{success['http_status']}）"))

    out.append("**错误码**")
    out.append("")
    out.append("| code | HTTP | message | 触发条件 |")
    out.append("|------|------|---------|----------|")
    for err in entry["errors"]:
        out.append(
            f"| `{err['code']}` | {err['http_status']} | {err['message']} | {err['when']} |"
        )
    out.append("")
    if impl.get("notes"):
        out.append(f"备注：{impl['notes']}")
        out.append("")
    return out


def cmd_render(root: Path, args) -> int:
    entries = load_entries(root)
    if not entries:
        raise SystemExit(f"{contract_path(root)} 没有条目，无从渲染")
    modules: dict[str, list[dict]] = {}
    for entry in entries:
        modules.setdefault(entry.get("module", "unknown"), []).append(entry)

    lines = [
        "# 接口文档",
        "",
        f"由 `scripts/new_api.py --render` 从 `{CONTRACT_FILE}` 生成，不要手改本文件；",
        f"改内容请改 `{CONTRACT_FILE}` 后重跑。",
        "",
        "## 索引",
        "",
        "| 接口 | 模块 | 状态 | 说明 |",
        "|------|------|------|------|",
    ]
    for module in sorted(modules):
        for entry in sorted(modules[module], key=lambda e: (e["path"], e["method"])):
            lines.append(
                f"| `{entry['method']} {entry['path']}` | {module} | {entry['status']} | {entry['title']} |"
            )
    lines.append("")
    for module in sorted(modules):
        lines.append(f"## {module}")
        lines.append("")
        for entry in sorted(modules[module], key=lambda e: (e["path"], e["method"])):
            lines.extend(render_entry(entry))

    out_path = Path(args.out) if args.out else root / RENDER_FILE
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    print(f"已渲染 {len(entries)} 个接口 -> {out_path}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="接口契约条目的生成、校验与渲染")
    parser.add_argument("--dir", default=None, help="契约库目录，默认 ./docs/apis")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--new", action="store_true", help="追加一个条目骨架")
    mode.add_argument("--validate", action="store_true", help="校验条目")
    mode.add_argument("--render", action="store_true", help="渲染 markdown 接口文档")
    parser.add_argument("--id", help="条目 id（kebab-case）")
    parser.add_argument("--title")
    parser.add_argument("--module")
    parser.add_argument("--method")
    parser.add_argument("--path")
    parser.add_argument("--requirement", help="关联需求 id，对应 reqs/<id>.md")
    parser.add_argument("--auth", default="bearer", help="鉴权方式，默认 bearer")
    parser.add_argument("--owner", default="")
    parser.add_argument("--out", help="--render 的输出路径，默认 <dir>/API.md")
    args = parser.parse_args()

    root = Path(args.dir) if args.dir else Path.cwd() / "docs" / "apis"

    if args.new:
        missing = [
            name
            for name in ("id", "title", "module", "method", "path", "requirement")
            if not getattr(args, name)
        ]
        if missing:
            raise SystemExit(f"--new 需要 {', '.join('--' + m for m in missing)}")
        if args.method.upper() not in METHODS:
            raise SystemExit(f"method 必须是 {'/'.join(METHODS)}")
        return cmd_new(root, args)
    if args.validate:
        return cmd_validate(root, args)
    return cmd_render(root, args)


if __name__ == "__main__":
    sys.exit(main())
