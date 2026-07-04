# JStudio 项目结构优化计划

## 当前结构分析

通过 Glob 扫描，发现以下结构问题：

### 1. 组件目录结构过于扁平

```
src/components/
├── editor/           # 编辑器相关（良好）
├── documents/        # 文档相关（良好）
├── settings/         # 设置相关（良好）
├── terminal/         # 终端相关（良好）
├── layout/           # 布局组件（良好）
├── windows/          # 窗口组件（良好）
├── cursor/           # 光标特效（位置不当）
├── shared/           # 共享组件（与 ui/ 职责重叠）
├── ui/               # UI 基础组件（良好）
├── ErrorBoundary.tsx # 根级组件，位置不当
└── ...
```

### 2. lib 目录职责混杂

```
src/lib/
├── storage.ts           # 存储（核心）
├── i18n.ts              # 国际化
├── commandRegistry.ts   # 命令注册
├── activityMeta.ts      # 活动元数据
├── toast.ts             # 轻提示
├── editor/              # 编辑器相关（良好）
├── extensions/          # TipTap 扩展（应与 editor 合并）
├── content/             # 内容转换（应与 editor 合并）
├── shortcuts/           # 快捷键（应独立）
├── terminal/            # 终端相关（良好）
├── windows/             # 窗口相关（良好）
├── documents/           # 文档相关（良好）
└── ...
```

### 3. 类型文件位置不一致

- `src/types/` 目录存在
- `src/types.ts` 文件不存在（AGENTS.md 提到但已删除）
- 类型文件已整合到 `types/` 目录（良好）

### 4. shared/ 与 ui/ 目录职责重叠

```
src/components/shared/icons.tsx  # 图标组件
src/components/ui/               # 基础 UI 组件
```

两者都是"共享"组件，命名不清晰。

---

## 优化方案

### Phase 1: 组件重组

#### 1.1 合并 shared/ 到 ui/

```
src/components/shared/icons.tsx 
  → src/components/ui/icons.tsx
```

理由：`shared` 和 `ui` 都是可复用的基础组件，合并后更清晰。

#### 1.2 移动 ErrorBoundary.tsx

```
src/components/ErrorBoundary.tsx 
  → src/components/layout/ErrorBoundary.tsx
```

理由：ErrorBoundary 是根级布局组件，应放在 `layout/` 目录。

#### 1.3 cursor/ 移动到 ui/

```
src/components/cursor/ 
  → src/components/ui/cursor/
```

理由：cursor 是 UI 特效组件，属于 UI 基础组件范畴。

### Phase 2: lib 目录重组

#### 2.1 合并 extensions/ 到 editor/

```
src/lib/extensions/ 
  → src/lib/editor/extensions/
```

理由：extensions 都是 TipTap 扩展，与编辑器紧密相关。

#### 2.2 合并 content/ 到 editor/

```
src/lib/content/ 
  → src/lib/editor/content/
```

理由：content 转换是编辑器功能的一部分。

#### 2.3 创建 core/ 目录存放核心模块

```
src/lib/storage.ts      → src/lib/core/storage.ts
src/lib/i18n.ts         → src/lib/core/i18n.ts
src/lib/commandRegistry.ts → src/lib/core/commandRegistry.ts
```

理由：这些是应用核心基础设施，应独立分类。

### Phase 3: 创建 hooks 目录

```
src/hooks/
├── useToast.ts
├── useShortcuts.ts
├── useDocument.ts
└── ...
```

将散落在各处的自定义 hooks 集中管理。

---

## 优化后目标结构

```
src/
├── App.tsx                      # 根组件
├── main.tsx                     # 入口
├── index.css                    # Tailwind 入口
│
├── types/                       # 类型定义（已良好）
│   ├── index.ts
│   ├── document.ts
│   ├── editor.ts
│   └── richText.ts
│
├── lib/                         # 工具库
│   ├── core/                    # 核心基础设施
│   │   ├── storage.ts
│   │   ├── i18n.ts
│   │   └── commandRegistry.ts
│   │
│   ├── editor/                  # 编辑器相关（合并后）
│   │   ├── extensions/          # TipTap 扩展
│   │   ├── content/             # 内容转换
│   │   ├── slashMenu/           # 斜杠菜单
│   │   ├── tiptapAdapter.ts
│   │   └── ...
│   │
│   ├── shortcuts/               # 快捷键
│   ├── terminal/                # 终端相关
│   ├── windows/                 # 窗口管理
│   └── documents/               # 文档工具
│
├── store/                       # Zustand 状态管理
│   ├── index.ts
│   ├── useStore.ts
│   ├── storeHelpers.ts
│   └── *Slice.ts
│
├── components/
│   ├── layout/                  # 布局组件
│   │   ├── TitleBar.tsx
│   │   ├── ActivityBar.tsx
│   │   └── ErrorBoundary.tsx    # 移入
│   │
│   ├── editor/                  # 编辑器组件
│   ├── documents/               # 文档组件
│   ├── settings/                # 设置组件
│   ├── terminal/                # 终端组件
│   ├── windows/                 # 窗口组件
│   │
│   └── ui/                      # 基础 UI 组件（合并后）
│       ├── IconButton.tsx
│       ├── MenuList.tsx
│       ├── Toast.tsx
│       ├── icons.tsx            # 从 shared/ 移入
│       └── cursor/              # 从 components/cursor/ 移入
│
├── hooks/                       # 自定义 Hooks（新增）
│   └── ...
│
├── data/                        # 静态数据
│   └── defaultData.ts
│
└── styles/                      # 样式文件
    └── vscode-theme.css
```

---

## 执行步骤

### Step 1: 合并 shared/ 到 ui/
- 移动 `src/components/shared/icons.tsx` → `src/components/ui/icons.tsx`
- 更新所有 import 路径
- 删除空的 `shared/` 目录

### Step 2: 移动 ErrorBoundary.tsx
- 移动 `src/components/ErrorBoundary.tsx` → `src/components/layout/ErrorBoundary.tsx`
- 更新 `App.tsx` 和 `main.tsx` 中的 import

### Step 3: 移动 cursor/ 到 ui/
- 移动 `src/components/cursor/` → `src/components/ui/cursor/`
- 更新所有 import 路径

### Step 4: 合并 extensions/ 到 editor/
- 移动 `src/lib/extensions/` → `src/lib/editor/extensions/`
- 更新所有 import 路径

### Step 5: 合并 content/ 到 editor/
- 移动 `src/lib/content/` → `src/lib/editor/content/`
- 更新所有 import 路径

### Step 6: 创建 core/ 目录
- 创建 `src/lib/core/`
- 移动 `storage.ts`, `i18n.ts`, `commandRegistry.ts` 到 `core/`
- 更新所有 import 路径

### Step 7: 验证构建
- 运行 `npm run build` 确保无错误
- 运行 `npm run tauri dev` 确保应用正常启动

---

## 预期收益

1. **职责清晰**：每个目录有明确的职责边界
2. **易于查找**：新成员能快速定位代码位置
3. **减少认知负担**：扁平化合理的目录层级
4. **符合惯例**：遵循 React/TypeScript 社区最佳实践
5. **便于扩展**：hooks、extensions 等有独立归属

---

## 注意事项

1. **import 路径更新量大**：需要全局搜索替换
2. **建议使用 IDE 重构功能**：VSCode 的 "Move File" 可自动更新 import
3. **分步执行**：每步完成后验证构建，避免大量错误堆积
4. **保持 AGENTS.md 同步**：优化后更新 AGENTS.md 中的目录结构文档