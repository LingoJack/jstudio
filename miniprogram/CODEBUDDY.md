# CODEBUDDY.md

> 本文件描述 monorepo 中的 `miniprogram/` 子目录（微信小程序伴读端）。仓库整体布局见根目录 `../CODEBUDDY.md`。

## 项目定位

JStudio 的微信小程序端，**只读伴读**：登录 backend（用户名密码 + JWT）、拉取远程文档列表、
只读渲染快照（Block[]）、浏览历史快照。不做编辑。桌面端是数据的生产者，小程序是消费者。

技术栈：Taro 4.2.1 + React 18（Taro 4 的 peer 是 @types/react ^18，**不能升 React 19**） +
TypeScript strict + sass，只编译 weapp 端，webpack5 runner。样式 px 直写（config/index.ts
关闭了 pxtransform），与桌面端保持同一套逻辑像素。

## 常用命令

| 任务 | 命令 |
|------|------|
| 安装依赖 | `make deps` |
| 开发模式（watch） | `make dev`（产物进 dist/，微信开发者工具导入本目录） |
| 生产构建 | `make build` |
| 类型检查 + eslint | `make lint` |
| 测试 | `make test` |

微信开发者工具：导入 `miniprogram/` 目录（project.config.json 的 miniprogramRoot=./dist），
详情-本地设置勾选「不校验合法域名」才能连自建 backend。

## 目录结构

```
src/
├── app.config.ts            # pages：documents 首页（老用户直达），login/viewer/history
├── styles/theme.scss        # 暗色主题 CSS 变量（逐值移植 desktop vscode-theme.css）
├── constants.ts             # 路由、分批大小、limit、openDocument 文件类型
├── lib/                     # 纯逻辑层（禁止放组件）
│   ├── remote/              # API client（与 desktop/src/lib/remote 同源）
│   ├── blocks/              # Block 类型移植 + 快照 body 防御式解析 + TipTap 文本抽取
│   ├── storage/             # 登录态持久化（Taro storage）
│   └── format.ts            # 日期 / 文件大小格式化
├── hooks/useAuthGuard.ts    # 页面级鉴权守卫 + 401 统一处理
├── pages/                   # login / documents / viewer / history
└── components/blockView/    # 块只读渲染器（11 个组件 + blockView.scss）
```

## 与 desktop 的同源契约（改动必须双向同步）

1. **`lib/remote/constants.ts` + `types.ts`**：与 `desktop/src/lib/remote/` 同源
   （新增了 documents/snapshots DTO）。backend API 变更时两端一起改。
2. **`lib/blocks/types.ts`**：与 `desktop/src/types/document.ts` + `richText.ts` 同源
   （去 TipTap 依赖：rawContent/collapsibleChildren 用 unknown[] + flattenTiptapText 降级）。
   desktop 新增块类型时这里同步加类型 + BlockRenderer 加分支。
3. **快照 body 契约**（本端是第一个消费者，desktop 上传实现需对齐）：
   `parseSnapshotBody` 接受 Block[] / `{blocks: Block[]}` / JSON 字符串，其余降级 raw 展示。
   desktop PUT /documents 时 body 应为 `{ emoji, blocks }` 或直接 blocks。
4. **asset 引用**：`assets/<fileName>` 相对路径（desktop assetUrl.ts 的约定），
   下载地址 = `${serverUrl}/api/v1/documents/${docId}/assets/${fileName}`，需 Bearer header。

## 样式对齐机制

`styles/theme.scss` 的 CSS 变量逐值来自 `desktop/src/lib/themes/jstudio-dark.ts` +
`desktop/src/styles/vscode-theme.css`（桌面端默认暗色主题）。块样式在
`components/blockView/blockView.scss`，每段注释标了桌面端源规则行号。
**改任何视觉规格先查桌面端对应规则，把同一组值搬过来**，不要凭感觉调。

平台差异（刻意取舍，完整清单见 README「已知差异」）：WXSS 无兄弟选择器
（标题相邻 margin 归零由 BlockRenderer 算好传类名）、行内 code 无内边距、
表格无 colspan/rowspan、画板/公式只做占位。

## 关键实现点

- **Transport 抽象**：`lib/remote/types.ts` 里的 `Transport` 是纯类型，
  `transport.ts` 是 Taro.request 实现。client 的默认传输是**惰性 require** ——
  Node 测试（tsx --test）只加载纯逻辑，`require('@tarojs/taro')` 在 Node 里会崩
  （Taro 运行时依赖 webpack define 常量）。测试一律注入假 transport。
- **Taro.request 的坑**：任何 HTTP 状态码都走 success（fail 只覆盖网络层失败），
  状态码判断全部在 success 分支；`dataType: 'text'` 才能拿到原始 body 文本。
- **Bearer 资源**：`<Image>` 带不了 Authorization header，asset 图片/附件统一走
  `Taro.downloadFile({header})` → tempFilePath；file 块再接 `Taro.openDocument`
  （必须显式 fileType，合法集合在 constants.ts 的 OPEN_DOCUMENT_FILE_TYPES）。
- **viewer 分批渲染**：backend 快照 body 上限 8MiB，小程序 setData 有 1MB 传输上限，
  先渲染 VIEWER_CHUNK_SIZE=50 块再「加载更多」。
- **鉴权**：documents/viewer/history 三页用 `useAuthGuard()`（useDidShow 查 storage，
  无 token reLaunch 到 login）；请求 401 走 `handleAuthFailure` 清态回登录页。

## 约定

- 禁止 emoji（代码、注释、UI 文案）；禁止魔法值（阈值/尺寸/key 一律常量，进 `constants.ts` 或就近 constants）。
- `lib/` 纯逻辑、`components/` 视图，依赖单向 components → lib（同 desktop）。
- 文件大小红线同 desktop：组件 > 400 行、逻辑 > 500 行须拆分。
- WXSS 不支持的选择器（兄弟、:has、属性选择器受限）一律改为 JS 计算 + class。
