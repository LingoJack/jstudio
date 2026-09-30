#!/usr/bin/env python3
"""把 .mmd 文件渲染成 PNG：本机 Chrome headless + 本地 mermaid.min.js，无需 mmdc / puppeteer。

用法：
  render.py a.mmd b.mmd ...                 # 输出同目录同名 .png
  render.py --scale 3 --theme neutral a.mmd
  render.py --out-dir /tmp/out --svg a.mmd  # 同时保留 .svg
"""
import argparse
import html
import os
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile

CHROME_CANDIDATES = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "google-chrome",
    "chromium",
]
NODE_WS = pathlib.Path.home() / ".workbuddy/binaries/node/workspace"
MERMAID_JS = NODE_WS / "node_modules/mermaid/dist/mermaid.min.js"
PADDING = 16


def find_chrome():
    for c in CHROME_CANDIDATES:
        if os.path.isabs(c) and os.path.exists(c):
            return c
        if not os.path.isabs(c) and shutil.which(c):
            return shutil.which(c)
    sys.exit("FAIL 未找到 Chrome/Chromium/Edge")


def run_chrome(chrome, args, timeout):
    base = [chrome, "--headless=new", "--disable-gpu", "--no-sandbox", "--allow-file-access-from-files"]
    return subprocess.run(base + args, capture_output=True, text=True, timeout=timeout)


def render_one(chrome, src_path, out_dir, opts, tmp):
    src = src_path.read_text(encoding="utf-8")
    stem = src_path.stem
    config = (
        '{startOnLoad:true,theme:"%s",securityLevel:"loose",'
        "flowchart:{htmlLabels:true,useMaxWidth:false},"
        "sequence:{useMaxWidth:false},er:{useMaxWidth:false},"
        'themeVariables:{fontFamily:"PingFang SC, Microsoft YaHei, Helvetica, Arial, sans-serif",fontSize:"%dpx"}}'
    ) % (opts.theme, opts.font_size)

    # 第一步：页面里跑 mermaid，dump 出渲染后的 DOM 取 svg
    page = tmp / f"{stem}.render.html"
    page.write_text(
        f'<html><head><meta charset="utf-8"><script src="file://{MERMAID_JS}"></script></head>'
        f'<body style="margin:0;background:{opts.bg}"><pre class="mermaid">{html.escape(src)}</pre>'
        f"<script>mermaid.initialize({config});</script></body></html>",
        encoding="utf-8",
    )
    dump = run_chrome(chrome, [f"--virtual-time-budget={opts.wait_ms}", "--dump-dom", f"file://{page}"], opts.timeout)
    match = re.search(r"<svg[\s\S]*?</svg>", dump.stdout)
    if not match:
        return f"FAIL {src_path} 未生成 svg: {dump.stderr[-300:]}"

    svg = match.group(0)
    if "Syntax error" in svg or 'aria-roledescription="error"' in svg:
        return f"SYNTAX {src_path} mermaid 语法错误"

    view_box = re.search(r'viewBox="([\d.\-]+) ([\d.\-]+) ([\d.]+) ([\d.]+)"', svg)
    if not view_box:
        return f"FAIL {src_path} svg 无 viewBox"
    width, height = float(view_box.group(3)), float(view_box.group(4))

    # 第二步：去掉 max-width 样式、写死宽高，包一层 html 按精确尺寸截图
    svg = re.sub(r'<svg([^>]*?)style="[^"]*"', r"<svg\1", svg, count=1)
    svg = svg.replace("<svg", f'<svg width="{width}" height="{height}"', 1)
    if opts.svg:
        (out_dir / f"{stem}.svg").write_text(svg, encoding="utf-8")

    wrap = tmp / f"{stem}.wrap.html"
    wrap.write_text(
        f'<html><head><meta charset="utf-8"></head>'
        f'<body style="margin:0;padding:{PADDING}px;background:{opts.bg}">{svg}</body></html>',
        encoding="utf-8",
    )
    win_w, win_h = int(width) + PADDING * 2, int(height) + PADDING * 2
    out = out_dir / f"{stem}.png"
    run_chrome(
        chrome,
        [f"--screenshot={out}", f"--window-size={win_w},{win_h}",
         f"--force-device-scale-factor={opts.scale}", "--hide-scrollbars", f"file://{wrap}"],
        opts.timeout,
    )
    if not out.exists():
        return f"FAIL {src_path} 截图失败"
    return f"OK {out} {win_w * opts.scale}x{win_h * opts.scale}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+")
    ap.add_argument("--out-dir", help="输出目录，默认与 .mmd 同目录")
    ap.add_argument("--scale", type=int, default=2, help="像素倍率，默认 2")
    ap.add_argument("--theme", default="default", help="default / neutral / dark / forest")
    ap.add_argument("--bg", default="#fff", help="背景色，默认白")
    ap.add_argument("--font-size", type=int, default=15)
    ap.add_argument("--wait-ms", type=int, default=8000, help="mermaid 渲染等待虚拟时间")
    ap.add_argument("--timeout", type=int, default=90)
    ap.add_argument("--svg", action="store_true", help="同时输出 .svg")
    opts = ap.parse_args()

    if not MERMAID_JS.exists():
        sys.exit(f"FAIL 缺 {MERMAID_JS}，先在 {NODE_WS} 执行 npm install mermaid@10")

    chrome = find_chrome()
    failed = 0
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp = pathlib.Path(tmp_dir).resolve()
        for f in opts.files:
            # file:// 必须是解析后的绝对路径，macOS 下 /tmp 实为 /private/tmp
            src_path = pathlib.Path(f).resolve()
            out_dir = pathlib.Path(opts.out_dir).resolve() if opts.out_dir else src_path.parent
            out_dir.mkdir(parents=True, exist_ok=True)
            result = render_one(chrome, src_path, out_dir, opts, tmp)
            print(result)
            failed += not result.startswith("OK")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
