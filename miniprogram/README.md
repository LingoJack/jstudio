# jstudio-miniprogram

JStudio 微信小程序伴读端：登录 backend（用户名密码）、文档列表、快照只读渲染、历史快照浏览。
渲染与样式逐值对齐桌面端暗色主题。桌面端生产数据，本端消费。

## 跑起来

```bash
make deps        # npm install
make dev         # watch 构建 weapp（或 make build 出生产产物）
```

微信开发者工具（本机未预装，去官网下）：

1. 导入项目，目录选 **miniprogram/**（project.config.json 的 `miniprogramRoot` 指向 `./dist`）
2. `appid` 当前是占位 `touristappid`，真机预览前换成你在 mp.weixin.qq.com 注册的 AppID
3. 详情 - 本地设置 - 勾选 **不校验合法域名**（自建 backend 是 http/IP，不满足小程序的 https 域名要求）
4. 真机预览：右上角「预览」后手机上打开调试模式（同样为了跳过域名校验）

backend 就绪（见 `../backend/README.md` 与 `../deploy/README.md`），登录页填服务器地址
（开发者工具里可用 `http://127.0.0.1:8080` 或局域网 IP）。

冒烟链路：注册（用户名 3-32 字符、密码 >= 8 位）→ 登录 → 列表。桌面端尚未实现快照上传，
列表会是空的；可用 curl 手动造数：

```bash
TOKEN=$(curl -s -X POST http://127.0.0.1:8080/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"alice","password":"password123"}' | jq -r .token)
curl -X PUT http://127.0.0.1:8080/api/v1/documents/doc-test \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"title":"测试文档","body":{"blocks":[{"id":"b1","type":"heading-1","content":[{"text":"标题","annotations":{}}]},{"id":"b2","type":"text","content":[{"text":"正文","annotations":{"bold":true}}]}]}}'
```

## 上线前提（正式发布前必须解决）

- backend 必须是 **https + 已备案域名**，并在小程序后台「开发管理 - 服务器域名」配置
  request 合法域名（api 用）与 downloadFile 合法域名（asset 下载用）。
  当前部署形态（明文 HTTP LoadBalancer，见 ../deploy/）不满足，需要前置 TLS 反代或 Ingress。
- 替换 project.config.json 的 `touristappid` 为真实 AppID。

## 架构与契约

见 `CODEBUDDY.md`。要点：

- 快照 body 契约：Block[] / `{blocks: [...]}` / JSON 字符串（desktop 未来实现上传需对齐）
- asset 引用 `assets/<fileName>` 走 Bearer downloadFile（`<Image>` 带不了 header）
- `lib/remote`、`lib/blocks/types.ts` 与 desktop 同源，改动双向同步

## 与桌面端的已知差异（刻意取舍）

| 差异 | 原因 |
|------|------|
| 表格 colspan/rowspan/colwidth 不生效 | weapp 无 display:table，用 flex 行渲染 |
| 代码块无语法高亮 | hljs 色板不移植，源码纯等宽呈现（13px/1.6 与桌面端一致） |
| 画板（diagram）只显示占位 | jgraph/Excalidraw 依赖 canvas 交互，不渲染 |
| 公式（math）显示 LaTeX 源码 | KaTeX 依赖 DOM |
| 行内 code 无左右 3px 内边距 | 小程序 Text 不支持 padding，保留底色/等宽/0.9em |
| 图片无 caption | 桌面端本身就不渲染 caption |
| 链接点击是复制而非打开 | 小程序不能唤起外部浏览器 |
| 字体用系统栈（Monaco/PingFang SC 回退） | 桌面端内置的 Maple Mono CN 16MB，超小程序 2MB 主包限制；如需完全一致可后续用 wx.loadFontFace 远程加载 |
| 文件卡片图标是扩展名文字 | 无图标库；点击可下载并用 openDocument 打开（doc/docx/xls/xlsx/ppt/pptx/pdf） |

## 测试

```bash
make lint   # tsc --noEmit + eslint
make test   # remote client（注入假 transport）+ 快照解析
```
