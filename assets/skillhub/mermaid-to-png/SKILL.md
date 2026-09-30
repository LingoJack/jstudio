---
name: mermaid-to-png
description: 把 mermaid 源码渲染成 PNG/SVG 图片，用本机 Chrome headless 加本地 mermaid.min.js，不依赖 mmdc、puppeteer 或联网。适用于目标载体不支持 mermaid 代码块、只能贴图的场景，如企微智能文档 smartpage、腾讯文档、iWiki、PPT、邮件；也用于交付前自检 mermaid 画出来长什么样。当用户说「mermaid 转图片 / 渲染成 png / 出图贴到文档里 / 画图插进企微文档」时使用。
agent_created: true
---

# mermaid 转 PNG

## 原理

分两步，都用 Chrome headless：

1. 生成一个临时 html，引入本地 mermaid.min.js 渲染 `<pre class="mermaid">`，用 `--dump-dom` 拿到渲染后的 DOM，从中抠出 `<svg>`。
2. 读 svg 的 viewBox 宽高，写死 width/height、去掉 mermaid 自带的 max-width 样式，包进一个 padding 16 的 html，用 `--window-size` 按精确尺寸加 `--force-device-scale-factor` 截图。

截图尺寸取自 viewBox，所以不会裁切也不会留大片空白。

## 依赖

| 依赖 | 位置 | 缺了怎么办 |
|---|---|---|
| Chrome | `/Applications/Google Chrome.app`，脚本也会找 Chromium、Edge | 装一个 |
| mermaid 10.x | `~/.workbuddy/binaries/node/workspace/node_modules/mermaid/dist/mermaid.min.js` | `cd ~/.workbuddy/binaries/node/workspace && <managed npm> install mermaid@10 --no-fund --no-audit` |
| Python 3 | managed python | 仅标准库 |

## 用法

```bash
PY=/Users/jacklingo/.workbuddy/binaries/python/versions/3.13.12/bin/python3
S=~/.workbuddy/skills/mermaid-to-png/scripts/render.py

$PY $S diagrams/*.mmd                       # 同目录输出同名 .png，2 倍像素
$PY $S --scale 3 --theme neutral a.mmd      # 更清晰、灰度主题
$PY $S --out-dir /tmp/out --svg a.mmd       # 另存 svg
```

每个文件输出一行：`OK <png> <宽x高>`、`SYNTAX <mmd>`（语法错）或 `FAIL <mmd> <原因>`；有失败时退出码 1。

## 工作流

1. 图源写成独立 `.mmd` 文件，和文档放在一起，如 `docs/xxx/diagrams/m1-arch.mmd`，便于以后改图重渲。
2. 跑 render.py。
3. 必须用 Read 打开 PNG 自己看一遍，检查布局是否混乱、文字是否截断、连线是否交叉成一团。不看不交付。
4. 按目标载体插入：
   - 企微智能文档：`wecom-cli smartpage images upload --json '{"file_path":"<png 绝对路径>","docid":"<docid>"}'` 返回 url，mdx 里写 `![](url)`。先读 wecomcli-shared 与 wecomcli-smartpage 技能。
   - 其他载体：直接给 PNG 路径，用 present_files 交付。
5. 把 `图名 → url` 存一份 urls.json，改图重传后更新它。

## 坑

- **file:// 必须用 resolve 后的绝对路径**：macOS 的 `/tmp` 实为 `/private/tmp`，相对路径或未解析路径会让 Chrome 读不到文件，表现为 dump 出空 DOM。脚本已处理。
- **Read 看图可能命中旧缓存**：同一路径重渲后 Read 仍显示旧图时，先 `cp x.png x-v2.png` 再 Read 新文件名。
- **useMaxWidth 必须关**：不关的话 svg 按容器宽缩放，viewBox 与实际显示尺寸不符，截出来会被压扁。脚本对 flowchart、sequence、er 都已关。
- **中文字体**：主题变量设了 PingFang SC 优先；Linux 上没有时要装中文字体，否则方块字。
- **大图渲染不完**：节点很多时把 `--wait-ms` 调到 15000。
- **图乱的常见原因是一张图塞太多**：超过 15 个节点、或者读写链路混在一起时，拆成两三张图，每张讲一条链路，比调布局有效。其他布局技巧：子图里写 `direction LR` 让同层横排；用 `classDef` 给新增组件上色区分新旧；`==>` 表示主链路，`-.->` 表示异步或控制面。
- **图里不要放代码行号**：图保持干净，只放组件名和动作，行号写在正文。
