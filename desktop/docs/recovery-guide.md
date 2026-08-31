# 内容恢复方案

> JStudio 的三层数据丢失防护体系：检测、备份、崩溃恢复。
> 当编辑器内容意外丢失时，按本文流程找回。

---

## 背景：为什么需要三层防护

JStudio 是离线优先的本地笔记应用，所有数据存在 `~/.jdata/studio/`。编辑器采用分段式 ProseMirror（每段独立实例），内容通过 `tiptapAdapter` 在 TipTap JSON 与自有 `Block[]` 格式之间双向转换后写入 SQLite `documents.body`。

这套链路存在一个历史漏洞：**序列化 bug 丢失的数据会污染备份链**。因为备份（`backup_before_write`）快照的是 DB 里写前的旧 body——如果上一次保存已经写入了被序列化 bug 损坏的 Block[]，下次备份快照的「旧 body」本身就是坏的，恢复也救不回。

典型案例：在表格单元格里敲 `1.` 触发有序列表，`tiptapToTableData` 只认 `paragraph` 子节点，`orderedList` 被静默丢弃 → 空 cell 写入 body → 备份链从第一次损坏写入起被污染。

为彻底兜底，JStudio 现在部署了三层防护：

| 层 | 名称 | 作用 | 触发时机 |
|------|------|------|----------|
| B | 序列化往返测试 | CI 阶段拦住适配器 bug | `make pre-commit` / `npm test` |
| A | 内容指纹告警 | 保存时检测内容级损坏并弹窗 | 每次 `write_document` |
| D | 编辑器内存态快照 | 周期性写原始 TipTap JSON 到磁盘 | 每 30s + 页面卸载 |

---

## 第一层 B：序列化往返测试（CI 预防）

### 原理

每个 block 类型写 round-trip 测试：`Block → TipTap → Block` 和 `TipTap → Block → TipTap`，断言转换前后等价。序列化不对称在进仓库前就被抓住。

### 文件

- `src/lib/editor/tiptapAdapter/tiptapAdapter.roundtrip.test.ts` — 30 个测试，覆盖全部 20 种 block 类型 + 专项回归（表格内嵌列表、嵌套列表、todo 子项、collapsible 子节点、空代码块、richText 全注解）

### 运行

```bash
npm test                    # 全部 6 个测试文件
npm run test:adapter        # 仅适配器往返测试
make pre-commit             # fmt + lint + test（含前端测试）
```

> 注意：`make test-fe` 之前因 `package.json` 缺 `"test"` 脚本而静默失效，已修复。

### 新增 block 类型时

在 `tiptapAdapter.roundtrip.test.ts` 加两个测试（forward + backward），再加一个专项回归测试覆盖该类型的边界情况（空内容、嵌套子节点、全部可选属性）。参见已有的 `REGRESSION: table cell with orderedList inside survives via rawContent`。

---

## 第二层 A：内容指纹告警（保存时检测）

### 原理

`backup_before_write`（`src-tauri/src/commands/storage/backups.rs`）在每次写入前对比新旧内容，两个信号任一触发即告警：

| 信号 | 条件 | 抓什么 |
|------|------|--------|
| 块数收缩 | `old_count > 5 && new_count < old_count * 0.2` | 整块被吞 |
| 字符数收缩 | `old_chars > 200 && new_chars < old_chars * 0.5` | 内容级损坏（块数不变但内部文本丢失，如表格内列表被吞） |

字符数和节点数都是递归计数，会深入列表、表格单元格（含 `rawContent` 无损路径）、todo 子项、collapsible 子节点、代码块、引用。

### 告警表现

检测到异常时，后端 emit `document:abnormal-shrink` 事件，前端弹出一个 warning toast（8 秒）：

```
检测到「文档标题」内容大幅减少（142 → 8 块，12800 → 120 字符），已自动备份。如非预期，可点击恢复。
[恢复备份]
```

点击 toast 上的「恢复备份」按钮直接打开恢复对话框——不用再右键文档找菜单。

### 文件

- `src-tauri/src/commands/storage/backups.rs` — `count_text_chars` / `count_nodes` 递归计数器，envelope 加 `charCount`/`nodeCount`，富化 shrink 检测
- `src/App.tsx` — 事件监听器 + toast action 按钮
- `src/store/uiSlice.ts` — `openBackupRestore` / `closeBackupRestore`（对话框打开状态提升到 store，让 toast 能触发）
- `src/store/toastSlice.ts` + `src/lib/core/toast.ts` + `src/components/ui/Toast.tsx` — toast 加可选 action 按钮

### 备份存储位置

```
~/.jdata/studio/documents/{docId}/.backups/{epochMs}.json
```

保留最近 50 份（`MAX_BACKUPS`），超出按修改时间淘汰最旧的。每份是完整 body 快照（写前旧内容），envelope 格式：

```json
{ "timestampMs": 1720472340000, "blockCount": 142, "charCount": 12800, "nodeCount": 380, "body": "<raw doc JSON>" }
```

---

## 第三层 D：编辑器内存态快照（崩溃恢复）

### 原理

这是最强的兜底：**完全绕过 Block[] 序列化**。每 30 秒把每个 section 编辑器的 `editor.getJSON()` 原样写到磁盘，外加页面卸载时最后刷一份。如果序列化 bug 损坏了 `documents.body`，原始编辑器状态仍然存活在磁盘上。

### 存储位置与轮转

```
~/.jdata/studio/documents/{docId}/.snapshots/
  editor.0.json   ← 最新
  editor.1.json   ← 上一次
  editor.2.json   ← 上上次
```

保留 3 份轮转（`SNAPSHOT_ROTATION_KEEP`）。每次写入时 `editor.{n} → editor.{n+1}` 平移，新内容原子写入 `editor.0.json`（先写 `.tmp` 再 `rename`，崩溃不损坏最新快照）。

轮转的意义：如果损坏性编辑被快照了一次，`editor.1.json` / `editor.2.json` 可能还保存着损坏前的干净状态。

envelope 格式：

```json
{ "timestampMs": 1720472340000, "docId": "...", "sections": [<editor.getJSON()>, ...] }
```

### 文件

- `src-tauri/src/commands/storage/snapshots.rs` — `save_doc_snapshot` / `read_doc_snapshot` 命令
- `src/components/editor/sectionEditor/useEditorSnapshotTimer.ts` — 30s 定时器 hook，遍历 `sectionEditorsRef` 调 `getJSON()`，错误走项目 logger（不用 console.log）
- `DocumentPanel.tsx` — 挂载 hook（`!isStatic && !readOnly` 时启用）

### 触发时机

- 每 30 秒（`SNAPSHOT_INTERVAL_MS`）
- `pagehide` / `beforeunload`（页面卸载时最后刷一份）
- 仅在 `!isStatic && !readOnly` 且所有 section 已挂载且 `showSkeleton === false` 时才拍快照

### 多窗口行为

每个窗口有自己的快照定时器。两个窗口编辑同一文档会互相覆盖快照（last-write-wins）。这对崩溃恢复可接受——快照是兜底而非权威源。

---

## 恢复操作：一步步找回内容

### 方式 1：从异常告警 toast 恢复（最快）

1. 编辑或重新打开文档时，如果看到「内容大幅减少」的 warning toast
2. 点击 toast 上的「恢复备份」按钮
3. 恢复对话框打开，左侧列表选一个时间点，右侧预览确认
4. 点底部「恢复此版本」按钮，确认后当前内容会先自动备份，再恢复到选中版本

### 方式 2：从文档右键菜单恢复（常规入口）

1. 在侧边栏右键文档
2. 选「备份恢复」
3. 同上

### 方式 3：从实时编辑器快照恢复（最强兜底）

当 `documents.body` 和备份链都被污染时，实时快照是最后一道防线。

1. 打开恢复对话框（上述任一入口）
2. 列表**顶部**有一个置顶条目「实时编辑器快照」（带闪电图标和 accent 左边框），标注着最近一次快照时间
3. 选中它，右侧预览会显示快照里的原始内容
4. 点底部按钮（此时文案变为「从快照恢复」），确认后恢复

**重要限制**：快照恢复会走「当前适配器」把原始 TipTap JSON 转回 Block[]。如果适配器有**新** bug，恢复可能再损坏——但快照本身保留的内容比已损坏的 body 多（例如列表在原始 JSON 里还在），用修复后的适配器转出来能救回更多。这是 strictly better than no snapshot。

### 方式 4：手动从磁盘恢复（终极手段）

如果上述 UI 路径都不可用（例如应用无法启动），可直接读磁盘文件：

```bash
# 备份
ls ~/.jdata/studio/documents/{docId}/.backups/
cat ~/.jdata/studio/documents/{docId}/.backups/{epochMs}.json | jq -r .body | jq .

# 实时快照
ls ~/.jdata/studio/documents/{docId}/.snapshots/
cat ~/.jdata/studio/documents/{docId}/.snapshots/editor.0.json | jq .
cat ~/.jdata/studio/documents/{docId}/.snapshots/editor.1.json | jq .
cat ~/.jdata/studio/documents/{docId}/.snapshots/editor.2.json | jq .
```

备份的 `body` 字段是完整 Document JSON（含 `blocks`），可直接粘贴到新文档或手动修复 SQLite。

快照的 `sections` 字段是原始 TipTap JSON 数组（每个 section 一个 `editor.getJSON()` 结果），需要人工解析或写脚本转换。

---

## 各层防护的分工与互补

| 场景 | B 测试 | A 告警 | D 快照 |
|------|--------|--------|--------|
| 新适配器 bug 进仓库前 | CI 拦住 | — | — |
| 新适配器 bug 漏过 CI | — | 保存时弹窗 + 一键恢复 | 30s 内的原始 JSON 还在 |
| 缓慢累积的损坏（多次保存后才发现） | — | 字符数趋势告警 | `editor.1/2.json` 保留更早的干净状态 |
| 应用崩溃 / 强制退出 | — | — | 卸载时最后刷一份 + 30s 周期快照 |
| 备份链被污染 | — | — | 快照绕过了序列化，不受污染 |

**三层任一层都能兜住数据丢失**：B 从源头防 bug 进仓库，A 在保存时立即告警，D 保留序列化前的原始状态。

---

## 配置常量速查

| 常量 | 值 | 位置 | 含义 |
|------|-----|------|------|
| `MAX_BACKUPS` | 50 | `backups.rs` | 每文档保留的备份份数 |
| `ABNORMAL_FRACTION` | 0.2 | `backups.rs` | 块数收缩告警阈值（新 < 旧 × 0.2） |
| `ABNORMAL_OLD_MIN` | 5 | `backups.rs` | 块数告警的旧值下限（> 5 才判） |
| `ABNORMAL_CHAR_FRACTION` | 0.5 | `backups.rs` | 字符数收缩告警阈值（新 < 旧 × 0.5） |
| `ABNORMAL_CHAR_OLD_MIN` | 200 | `backups.rs` | 字符数告警的旧值下限（> 200 才判） |
| `SNAPSHOT_INTERVAL_MS` | 30000 | `useEditorSnapshotTimer.ts` | 快照周期 |
| `SNAPSHOT_ROTATION_KEEP` | 3 | `snapshots.rs` | 快照轮转保留份数 |

调阈值改这些常量即可，无需改逻辑。
