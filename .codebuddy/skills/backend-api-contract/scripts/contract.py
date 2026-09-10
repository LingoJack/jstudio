#!/usr/bin/env python3
"""接口契约的骨架生成、校验与查询。

契约是 docs/apis/openapi.yaml（OpenAPI 3.0），唯一事实源：
一个 path + method 是一个接口条目，operationId 是条目 id；
OpenAPI 没有的信息（需求、状态、背景、预期、实现位置）用 x- 扩展写在 operation 上；
错误码写在各响应的 x-errors 里；字段含义写在 schema 的 description 上。

  python3 scripts/contract.py --new --id doc-put-snapshot --title "上传一份文档快照" \
      --module documents --method PUT --path /documents/{docId} \
      --requirement req-2026-0910-remote-save --owner jack
  python3 scripts/contract.py --validate
  python3 scripts/contract.py --list --requirement req-2026-0910-remote-save

契约库默认在执行脚本时当前目录下的 docs/apis/，别处用 --dir 指。
"""

from __future__ import annotations

import argparse
import re
import sys
from datetime import date
from pathlib import Path

import yaml

CONTRACT_FILE = "openapi.yaml"
REQ_SUBDIR = "reqs"

METHODS = ("get", "post", "put", "patch", "delete")
PARAM_INS = ("path", "query", "header")
STATUSES = ("draft", "agreed", "implemented", "deprecated")
ID_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
REQ_RE = re.compile(r"^req-\d{4}-\d{4}-[a-z0-9]+(-[a-z0-9]+)*$")
ERROR_CODE_RE = re.compile(r"^[A-Z][A-Z0-9_]*$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
HANDLER_RE = re.compile(r"^[^\s:]+:\d+$")
STATUS_KEY_RE = re.compile(r"^[1-5]\d{2}$")
EMOJI_RE = re.compile("[\U0001f000-\U0001faff\u2600-\u27bf\ufe0f]")
TODO_RE = re.compile(r"TODO", re.IGNORECASE)

DEFAULT_SUCCESS_STATUS = {"post": "201", "delete": "204"}

HEADER = """\
# 接口契约（唯一事实源）
#
# 一个 path + method 是一个接口条目，operationId 是条目 id（kebab-case，建了不改）。
# OpenAPI 没有的信息用 x- 扩展写在 operation 上：
#   x-requirement  关联需求 id，对应 reqs/<id>.md
#   x-status       draft / agreed / implemented / deprecated
#   x-owner/x-created/x-updated  负责人 / 建条目日期 / 最后改契约日期
#   x-background   需求背景：现在什么场景走不通、谁在等它
#   x-expected     预期表现：调用后发生什么、幂等性、并发与边界
#   x-impl         handler（文件:行）/ verified（核对日期）/ notes
# 错误码写在每个非 2xx 响应的 x-errors 里（code / message / when）。
# 字段含义写在每个 schema property 的 description 上，校验强制非空。
#
# 改完跑：python3 scripts/contract.py --validate
openapi: 3.0.3
info:
  title: 后端接口
  version: "1.0.0"
  description: 接口契约唯一事实源。需求背景见 reqs/ 下按 x-requirement 关联的需求文档。
servers:
  - url: http://localhost:8080/api/v1
    description: 本地开发
tags: []
paths: {}
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      description: 登录态 access token，缺失或过期按未登录处理
    internalAuth:
      type: apiKey
      in: header
      name: X-Internal-Token
      description: 仅服务间调用，token 由部署侧注入
  schemas:
    Error:
      type: object
      description: 统一错误响应体，所有非 2xx 响应都是这个形状
      properties:
        error:
          type: object
          description: 错误主体
          properties:
            code:
              type: string
              description: 错误码常量，UPPER_SNAKE_CASE
            message:
              type: string
              description: 面向调用方的错误描述，与代码里返回的字符串一致
          required:
            - code
            - message
      required:
        - error
"""


class StrictLoader(yaml.SafeLoader):
    """重复键报错：YAML 默认静默取最后一个，契约里等于整个接口被悄悄覆盖。"""


def _construct_mapping(loader, node, deep=False):
    mapping = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        if key in mapping:
            raise yaml.constructor.ConstructorError(
                "while constructing a mapping",
                node.start_mark,
                f"重复的键 {key!r}（YAML 会静默覆盖，改键名或删掉一个）",
                key_node.start_mark,
            )
        mapping[key] = loader.construct_object(value_node, deep=deep)
    return mapping


StrictLoader.add_constructor(
    yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, _construct_mapping
)


def contract_path(root: Path) -> Path:
    return root / CONTRACT_FILE


def load_contract(path: Path) -> dict:
    try:
        with path.open(encoding="utf-8") as fh:
            return yaml.load(fh, Loader=StrictLoader) or {}
    except yaml.constructor.ConstructorError as exc:
        mark = exc.problem_mark
        raise SystemExit(f"{path}:{mark.line + 1} {exc.problem}")
    except yaml.YAMLError as exc:
        raise SystemExit(f"{path} 不是合法 YAML: {exc}")


def iter_operations(doc: dict):
    """产出 (path, method, operation)。"""
    for path, item in (doc.get("paths") or {}).items():
        if not isinstance(item, dict):
            continue
        for method, op in item.items():
            if method in METHODS:
                yield str(path), method, op


def normalize_path(path: str) -> str:
    """Gin 的 :docId 写法换成 OpenAPI 的 {docId}。"""
    return re.sub(r":([A-Za-z0-9_]+)", r"{\1}", path).rstrip("/") or "/"


def path_params(path: str) -> list[str]:
    return re.findall(r"\{([A-Za-z0-9_]+)\}", path)


def security_of(auth: str) -> list:
    return [] if auth == "none" else [{f"{auth}Auth": []}]


def skeleton(args) -> tuple[str, str, dict]:
    today = date.today().isoformat()
    method = args.method.lower()
    path_key = normalize_path(args.path)
    params = [
        {
            "name": name,
            "in": "path",
            "required": True,
            "description": f"TODO {name} 是什么、取值来源、作用域",
            "schema": {"type": "string"},
        }
        for name in path_params(path_key)
    ]
    if method in ("get", "delete"):
        params.append(
            {
                "name": "TODO_param",
                "in": "query",
                "required": False,
                "description": "TODO 这个参数是什么、默认值、越界怎么处理",
                "schema": {"type": "string"},
            }
        )

    op = {
        "operationId": args.id,
        "summary": args.title,
        "tags": [args.module],
        "security": security_of(args.auth),
        "x-requirement": args.requirement,
        "x-status": "draft",
        "x-owner": args.owner or "TODO 负责人",
        "x-created": today,
        "x-updated": today,
        "x-background": "TODO 为什么要有这个接口：现在缺什么、谁在等它",
        "x-expected": "TODO 调用后发生什么：写入哪些数据、返回什么、幂等性、并发与边界",
    }
    if params:
        op["parameters"] = params

    if method in ("post", "put", "patch"):
        op["requestBody"] = {
            "required": True,
            "content": {
                "application/json": {
                    "schema": {
                        "type": "object",
                        "properties": {
                            "TODO_field": {
                                "type": "string",
                                "description": "TODO 这个字段是什么、取值范围、默认值",
                            }
                        },
                        "required": [],
                    }
                }
            },
        }

    status = DEFAULT_SUCCESS_STATUS.get(method, "200")
    success = {"description": "TODO 成功后返回什么"}
    if status != "204":
        success["content"] = {
            "application/json": {
                "schema": {
                    "type": "object",
                    "properties": {
                        "TODO_field": {
                            "type": "string",
                            "description": "TODO 这个字段是什么、由什么决定",
                        }
                    },
                    "required": [],
                }
            }
        }
    else:
        success["description"] = "无响应体，客户端只看状态码"

    op["responses"] = {
        status: success,
        "400": {
            "description": "请求不合法",
            "content": {
                "application/json": {
                    "schema": {"$ref": "#/components/schemas/Error"},
                    "example": {
                        "error": {
                            "code": "INVALID_REQUEST",
                            "message": "invalid request",
                        }
                    },
                }
            },
            "x-errors": [
                {
                    "code": "INVALID_REQUEST",
                    "message": "invalid request",
                    "when": "TODO 什么输入会触发",
                }
            ],
        },
    }
    op["x-impl"] = {"handler": "", "verified": "", "notes": ""}
    return path_key, method, op


def indent_block(block: str, indent: str) -> str:
    return "".join(
        indent + line if line.strip() else line
        for line in block.splitlines(keepends=True)
    )


def cmd_new(root: Path, args) -> int:
    if not ID_RE.match(args.id):
        raise SystemExit(f"id 必须是 kebab-case（小写字母数字与短横线）：{args.id}")
    if not args.path.startswith("/"):
        raise SystemExit(f"path 必须以 / 开头：{args.path}")
    if not REQ_RE.match(args.requirement):
        raise SystemExit(
            f"requirement 必须是 req-YYYY-MMDD-<slug>：{args.requirement}"
        )

    root.mkdir(parents=True, exist_ok=True)
    (root / REQ_SUBDIR).mkdir(exist_ok=True)
    target = contract_path(root)
    if not target.exists():
        target.write_text(HEADER, encoding="utf-8")
        print(f"已建契约库 {target}")

    doc = load_contract(target)
    for path, method, op in iter_operations(doc):
        if op.get("operationId") == args.id:
            raise SystemExit(f"operationId 已存在：{args.id}（更新原条目，不要新建）")
        if path == normalize_path(args.path) and method == args.method.lower():
            raise SystemExit(
                f"{args.method.upper()} {normalize_path(args.path)} "
                f"已由条目 {op.get('operationId')} 描述"
            )

    path_key, method, op = skeleton(args)
    block = indent_block(
        yaml.dump(
            {path_key: {method: op}},
            allow_unicode=True,
            sort_keys=False,
            default_flow_style=False,
            width=4096,
        ),
        "  ",
    )
    _insert_into_paths(target, block)
    print(f"已追加条目 {args.id} -> {target}")
    req_doc = root / REQ_SUBDIR / f"{args.requirement}.md"
    if not req_doc.exists():
        print(f"需求文档还不存在，按模板建：{req_doc}")
    print("下一步：填掉所有 TODO，然后跑 --validate")
    return 0


def _insert_into_paths(target: Path, block: str) -> None:
    """把新 path 块插到 paths 段末尾，其余内容保持字节不变（注释与顺序不丢）。"""
    lines = target.read_text(encoding="utf-8").splitlines(keepends=True)
    if lines and not lines[-1].endswith("\n"):
        lines[-1] += "\n"

    inline = next(
        (i for i, line in enumerate(lines) if re.match(r"^paths:\s*\{\s*\}\s*$", line)),
        None,
    )
    if inline is not None:
        lines[inline] = "paths:\n" + block
        target.write_text("".join(lines), encoding="utf-8")
        return

    start = next((i for i, line in enumerate(lines) if line.rstrip() == "paths:"), None)
    if start is None:
        raise SystemExit(f"{target} 里找不到 paths: 段")

    end = len(lines)
    for i in range(start + 1, len(lines)):
        line = lines[i]
        if line.strip() and not line[:1].isspace() and not line.startswith("#"):
            end = i
            break
    lines[end:end] = [block]
    target.write_text("".join(lines), encoding="utf-8")


def walk_schema(schema, prefix: str, errors: list[str], where: str) -> None:
    """每个字段都要有 type 与非空 description；数组要有 items。"""
    if not isinstance(schema, dict):
        errors.append(f"{where}{prefix or '(根)'} 不是对象")
        return
    if "$ref" in schema:
        return
    if "type" not in schema:
        errors.append(f"{where}{prefix or '(根)'} 缺 type")
    kind = schema.get("type")
    if kind == "object":
        props = schema.get("properties")
        # 原样透传、服务端不解析结构的载荷用 additionalProperties: true 声明，
        # 与"忘了写字段"区分开。
        if props in (None, {}) and "additionalProperties" in schema:
            return
        if not isinstance(props, dict):
            errors.append(f"{where}{prefix or '(根)'} 是 object 但缺 properties")
            return
        if not props:
            errors.append(
                f"{where}{prefix or '(根)'} 的 properties 为空："
                "没有字段就删掉这个 schema；结构不解析就写 additionalProperties: true"
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


def walk_content(content, errors: list[str], where: str) -> None:
    if not isinstance(content, dict) or not content:
        errors.append(f"{where}content 为空")
        return
    for media, body in content.items():
        if not isinstance(body, dict) or "schema" not in body:
            errors.append(f"{where}content.{media} 缺 schema")
            continue
        walk_schema(body["schema"], "", errors, f"{where}content.{media} ")


def check_refs(doc: dict, errors: list[str]) -> None:
    """只查本文件内的 #/components/schemas/X 引用是否存在。"""
    defined = set((doc.get("components") or {}).get("schemas") or {})

    def walk(node, trail: str) -> None:
        if isinstance(node, dict):
            for key, value in node.items():
                if key == "$ref" and isinstance(value, str) and value.startswith("#/"):
                    target = value[2:].split("/")[-1]
                    if value.startswith("#/components/schemas/") and target not in defined:
                        errors.append(f"{trail} 引用了不存在的 schema：{value}")
                else:
                    walk(value, f"{trail}.{key}" if trail else key)
        elif isinstance(node, list):
            for index, value in enumerate(node):
                walk(value, f"{trail}[{index}]")

    walk(doc.get("paths") or {}, "")


def check_root(doc: dict, root: Path, errors: list[str]) -> None:
    if not str(doc.get("openapi", "")).startswith("3."):
        errors.append("根节点 openapi 必须是 3.x")
    info = doc.get("info") or {}
    if not str(info.get("title", "")).strip():
        errors.append("根节点缺 info.title")

    for name, schema in ((doc.get("components") or {}).get("schemas") or {}).items():
        walk_schema(schema, "", errors, f"[components.schemas.{name}] ")

    req_dir = root / REQ_SUBDIR
    if req_dir.is_dir():
        known = {p.stem for p in req_dir.glob("*.md")}
        for _, _, op in iter_operations(doc):
            req = str((op or {}).get("x-requirement", ""))
            if req and req not in known:
                errors.append(
                    f"[{op.get('operationId')}] 需求文档不存在：{REQ_SUBDIR}/{req}.md"
                )


def check_operation(path: str, method: str, op, doc: dict, errors: list[str]) -> None:
    label = f"{method.upper()} {path}"
    if not isinstance(op, dict):
        errors.append(f"[{label}] 不是对象")
        return
    op_id = str(op.get("operationId", "")).strip()
    where = f"[{op_id or label}] "

    if not op_id:
        errors.append(f"[{label}] 缺 operationId（条目 id，kebab-case）")
    elif not ID_RE.match(op_id):
        errors.append(f"[{label}] operationId 必须是 kebab-case：{op_id}")
    if not str(op.get("summary", "")).strip():
        errors.append(f"{where}缺 summary（一句话接口名）")
    tags = op.get("tags")
    if not isinstance(tags, list) or not [t for t in tags if str(t).strip()]:
        errors.append(f"{where}缺 tags（所属功能域，如 documents）")

    if "security" not in op:
        errors.append(f"{where}缺 security（公开接口写 security: []）")
    else:
        schemes = set((doc.get("components") or {}).get("securitySchemes") or {})
        for entry in op["security"] or []:
            if not isinstance(entry, dict):
                errors.append(f"{where}security 每项必须是对象")
                continue
            for name in entry:
                if name not in schemes:
                    errors.append(
                        f"{where}security 引用了未定义的 scheme {name}，"
                        f"可选 {sorted(schemes)}"
                    )

    req = str(op.get("x-requirement", "")).strip()
    if not req:
        errors.append(f"{where}缺 x-requirement")
    elif not REQ_RE.match(req):
        errors.append(f"{where}x-requirement 必须是 req-YYYY-MMDD-<slug>：{req}")

    status = str(op.get("x-status", "")).strip()
    if status not in STATUSES:
        errors.append(f"{where}x-status 必须是 {'/'.join(STATUSES)}：{status or '(空)'}")
    for field in ("x-created", "x-updated"):
        if not DATE_RE.match(str(op.get(field, ""))):
            errors.append(f"{where}{field} 必须是 YYYY-MM-DD")
    for field in ("x-background", "x-expected"):
        if not str(op.get(field, "")).strip():
            errors.append(f"{where}缺 {field}")

    _check_parameters(path, op, errors, where)
    if "requestBody" in op:
        body = op["requestBody"]
        if not isinstance(body, dict):
            errors.append(f"{where}requestBody 必须是对象")
        else:
            walk_content(body.get("content"), errors, f"{where}requestBody ")
    _check_responses(op, errors, where)

    impl = op.get("x-impl") or {}
    if status == "implemented":
        handler = str(impl.get("handler", ""))
        if not HANDLER_RE.match(handler):
            errors.append(
                f"{where}status=implemented 必须填 x-impl.handler 为 文件:行（当前 {handler!r}）"
            )
        if not DATE_RE.match(str(impl.get("verified", ""))):
            errors.append(f"{where}status=implemented 必须填 x-impl.verified 核对日期")
    if status == "deprecated" and not str(impl.get("notes", "")).strip():
        errors.append(f"{where}status=deprecated 必须在 x-impl.notes 写清替代接口的 operationId")


def _check_parameters(path: str, op: dict, errors: list[str], where: str) -> None:
    declared = set()
    params = op.get("parameters")
    if params is None:
        params = []
    if not isinstance(params, list):
        errors.append(f"{where}parameters 必须是数组")
        return
    for param in params:
        if not isinstance(param, dict):
            errors.append(f"{where}parameters 每项必须是对象")
            continue
        name = str(param.get("name", "")).strip()
        location = param.get("in")
        if not name:
            errors.append(f"{where}有参数缺 name")
            continue
        if location not in PARAM_INS:
            errors.append(f"{where}参数 {name} 的 in 必须是 {'/'.join(PARAM_INS)}")
        if not str(param.get("description", "")).strip():
            errors.append(f"{where}参数 {name} 缺 description")
        if "schema" not in param:
            errors.append(f"{where}参数 {name} 缺 schema")
        else:
            walk_schema(param["schema"], "", errors, f"{where}参数 {name} ")
        if location == "path":
            declared.add(name)
            if param.get("required") is not True:
                errors.append(f"{where}路径参数 {name} 必须 required: true")

    for name in path_params(path):
        if name not in declared:
            errors.append(f"{where}路径 {path} 有 {{{name}}} 但没有对应的 in: path 参数")
    for name in declared - set(path_params(path)):
        errors.append(f"{where}参数 {name} 声明为 in: path 但路径 {path} 里没有 {{{name}}}")


def _check_responses(op: dict, errors: list[str], where: str) -> None:
    responses = op.get("responses")
    if not isinstance(responses, dict) or not responses:
        errors.append(f"{where}缺 responses")
        return

    success = []
    for key, response in responses.items():
        status = str(key)
        if not isinstance(key, str):
            # 不加引号的 404 会被 YAML 解析成整数，OpenAPI 工具要求响应键是字符串
            errors.append(f"{where}响应键 {key!r} 必须加引号写成 '{status}'")
        elif not STATUS_KEY_RE.match(status):
            errors.append(
                f"{where}响应键 {key!r} 必须是带引号的三位状态码字符串（写成 '200' 而不是 200）"
            )
            continue
        if not isinstance(response, dict):
            errors.append(f"{where}响应 {status} 不是对象")
            continue
        if not str(response.get("description", "")).strip():
            errors.append(f"{where}响应 {status} 缺 description")

        if status.startswith("2"):
            success.append(status)
            if "content" in response:
                walk_content(response["content"], errors, f"{where}响应 {status} ")
            continue

        errs = response.get("x-errors")
        if not isinstance(errs, list) or not errs:
            errors.append(f"{where}响应 {status} 缺 x-errors（至少一条错误码）")
            continue
        codes = []
        for err in errs:
            if not isinstance(err, dict):
                errors.append(f"{where}响应 {status} 的 x-errors 每项必须是对象")
                continue
            code = str(err.get("code", ""))
            if not ERROR_CODE_RE.match(code):
                errors.append(f"{where}错误码 {code!r} 必须是 UPPER_SNAKE_CASE")
            if code in codes:
                errors.append(f"{where}错误码 {code} 在本条目内重复")
            codes.append(code)
            if not str(err.get("message", "")).strip():
                errors.append(f"{where}错误码 {code} 缺 message")
            if not str(err.get("when", "")).strip():
                errors.append(f"{where}错误码 {code} 缺 when（触发条件）")

        example = ((response.get("content") or {}).get("application/json") or {}).get(
            "example"
        )
        if isinstance(example, dict):
            code = ((example.get("error") or {}).get("code"))
            if code and code not in codes:
                errors.append(f"{where}响应 {status} 的 example.error.code {code} 不在 x-errors 里")

    if not success:
        errors.append(f"{where}没有 2xx 成功响应")
    elif len(success) > 1:
        errors.append(f"{where}有 {len(success)} 个 2xx 响应（{', '.join(success)}），只允许一个")


def scan_text(text: str, path: Path) -> list[str]:
    errors = []
    for lineno, line in enumerate(text.splitlines(), 1):
        if EMOJI_RE.search(line):
            errors.append(f"{path}:{lineno} 含 emoji（仓库约定不允许）")
        if TODO_RE.search(line):
            errors.append(f"{path}:{lineno} 还留着 TODO 占位，填完再校验")
    return errors


def cmd_validate(root: Path, args) -> int:
    target = contract_path(root)
    if not target.exists():
        raise SystemExit(f"{target} 不存在，先跑 --new 建条目")
    text = target.read_text(encoding="utf-8")
    doc = load_contract(target)

    errors = scan_text(text, target)
    check_root(doc, root, errors)
    check_refs(doc, errors)

    ids: dict[str, str] = {}
    routes: dict[tuple, str] = {}
    count = 0
    for path, method, op in iter_operations(doc):
        count += 1
        if args.id and (op or {}).get("operationId") != args.id:
            continue
        check_operation(path, method, op, doc, errors)
        op_id = str((op or {}).get("operationId", ""))
        if op_id in ids:
            errors.append(f"[{op_id}] operationId 重复（{ids[op_id]} 与 {method.upper()} {path}）")
        ids.setdefault(op_id, f"{method.upper()} {path}")
        route = (method, path)
        if route in routes:
            errors.append(
                f"{method.upper()} {path} 被两个条目描述：{routes[route]} 与 {op_id}"
            )
        routes[route] = op_id

    if errors:
        for line in errors:
            print(line)
        print(f"\n不合格：{len(errors)} 处问题")
        return 1
    print(f"通过：{count} 个接口条目 -> {target}")
    return 0


def cmd_list(root: Path, args) -> int:
    doc = load_contract(contract_path(root))
    rows = []
    for path, method, op in iter_operations(doc):
        op = op or {}
        if args.requirement and op.get("x-requirement") != args.requirement:
            continue
        if args.status and op.get("x-status") != args.status:
            continue
        rows.append(
            (
                str(op.get("x-status", "")),
                f"{method.upper()} {path}",
                str(op.get("operationId", "")),
                ",".join(op.get("tags") or []),
                str(op.get("summary", "")),
            )
        )
    if not rows:
        print("没有匹配的接口")
        return 0
    for status, route, op_id, module, summary in sorted(rows):
        print(f"{status:<12} {route:<40} {op_id:<24} [{module}] {summary}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="接口契约的骨架生成、校验与查询")
    parser.add_argument("--dir", default=None, help="契约库目录，默认 ./docs/apis")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--new", action="store_true", help="追加一个接口条目骨架")
    mode.add_argument("--validate", action="store_true", help="校验契约")
    mode.add_argument("--list", action="store_true", help="列出接口条目")
    parser.add_argument("--id", help="条目 id，即 operationId（kebab-case）")
    parser.add_argument("--title", help="一句话接口名，写进 summary")
    parser.add_argument("--module", help="功能域，写进 tags（documents / auth / assets）")
    parser.add_argument("--method", help="GET / POST / PUT / PATCH / DELETE")
    parser.add_argument("--path", help="路径，相对 server url，如 /documents/{docId}")
    parser.add_argument("--requirement", help="关联需求 id，对应 reqs/<id>.md")
    parser.add_argument("--auth", default="bearer", help="bearer / none / internal，默认 bearer")
    parser.add_argument("--owner", default="")
    parser.add_argument("--status", help="--list 时按状态过滤")
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
        if args.method.lower() not in METHODS:
            raise SystemExit(f"method 必须是 {'/'.join(m.upper() for m in METHODS)}")
        if args.auth not in ("bearer", "none", "internal"):
            raise SystemExit("auth 必须是 bearer / none / internal")
        return cmd_new(root, args)
    if args.validate:
        return cmd_validate(root, args)
    return cmd_list(root, args)


if __name__ == "__main__":
    sys.exit(main())
