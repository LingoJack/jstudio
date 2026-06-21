# Agent Model Settings — 实施方案

## 目标

在 JStudio 的设置页面中增加 **Agent Model 管理**功能，让用户可以直接在 JStudio 中查看和管理 jcli agent 的模型 Provider 配置（`~/.jdata/agent/data/agent_config.json`），包括：增/删/改 Provider、切换激活的 Provider。

> **设计原则**：JStudio 只管理 agent 配置中的 **providers + active_index** 部分（模型提供方），不触碰 agent 的其他配置字段（system_prompt、compact 等）。Rust 层读取整个 JSON，前端只修改 providers/active_index 后写回——保证不丢失其他字段。

---

## 涉及文件清单（7 个文件）

| # | 文件 | 操作 | 说明 |
|---|------|------|------|
| 1 | `src-tauri/src/commands/storage.rs` | 修改 | 新增 2 个命令：`read_agent_config` / `write_agent_config` |
| 2 | `src-tauri/src/lib.rs` | 修改 | 注册 2 个新命令到 `generate_handler!` |
| 3 | `src/lib/storage.ts` | 修改 | 新增 `ModelProvider` / `AgentConfigFile` 类型 + `loadAgentConfig` / `saveAgentConfig` 方法 |
| 4 | `src/lib/i18n.ts` | 修改 | 新增 agent 相关翻译键（zh + en） |
| 5 | `src/components/settings/AgentModelSection.tsx` | 新建 | Agent Model 设置面板组件 |
| 6 | `src/components/Settings.tsx` | 修改 | 导航树新增 "Agent" 分类 + 路由到 AgentModelSection |
| 7 | `src/store/uiSlice.ts` | 修改 | `SettingsSectionId` 联合类型新增 `'agent'` |

---

## 第一步：Rust 后端 — 读写 agent 配置命令

### 文件：`src-tauri/src/commands/storage.rs`

新增路径辅助函数 + 2 个命令：

```rust
/// `~/.jdata/agent/data/agent_config.json`  (jcli agent 主配置)
fn agent_config_path() -> PathBuf {
    let home = dirs::home_dir().expect("cannot determine home directory");
    home.join(".jdata").join("agent").join("data").join("agent_config.json")
}

/// Read the jcli agent configuration file.
/// Returns {} if the file does not exist (agent not yet initialized).
#[tauri::command]
pub fn read_agent_config() -> Result<Value, String> {
    let path = agent_config_path();
    if !path.exists() {
        return Ok(serde_json::json!({}));
    }
    let data = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&data).map_err(|e| e.to_string())
}

/// Write the full jcli agent configuration file.
#[tauri::command]
pub fn write_agent_config(config: Value) -> Result<(), String> {
    let path = agent_config_path();
    // Ensure parent directory exists
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}
```

### 文件：`src-tauri/src/lib.rs`

在 `generate_handler!` 中追加注册：
```rust
commands::storage::read_agent_config,
commands::storage::write_agent_config,
```

---

## 第二步：前端存储层 — 类型 + 方法

### 文件：`src/lib/storage.ts`

新增类型定义（与 Rust `ModelProvider` 对齐）：

```typescript
/** 工具调用模式 — 对应 jcli 的 ToolCallMode enum */
export type ToolCallMode = 'native' | 'disabled';

/** 单个模型提供方 — 对应 Rust ModelProvider */
export interface ModelProvider {
  name: string;
  api_base: string;       // OpenAI 兼容 API base URL
  api_key: string;
  model: string;
  supports_vision: boolean;
  tool_call_mode: ToolCallMode;
}

/**
 * Agent 配置文件结构（JStudio 只关心 providers + active_index）。
 * 其余字段（system_prompt, compact 等）通过 [key: string] 透传，
 * 读取后原样保留，写回时不丢失。
 */
export interface AgentConfigFile {
  providers: ModelProvider[];
  active_index: number;
  [key: string]: unknown;
}
```

storage 对象新增 2 个方法：

```typescript
// ---- agent config (jcli agent model providers) ----

/** Read jcli agent config (~/.jdata/agent/data/agent_config.json). */
loadAgentConfig: () => invoke<AgentConfigFile>('read_agent_config'),

/** Write jcli agent config (full overwrite). */
saveAgentConfig: (config: AgentConfigFile) =>
  invoke<void>('write_agent_config', { config }),
```

---

## 第三步：UI — Agent Model 设置面板

### 文件：`src/components/settings/AgentModelSection.tsx`（新建）

**功能设计**：

1. **当前激活 Provider 卡片**：展示当前 active provider 的 name + model + api_base，右侧有切换下拉
2. **Provider 列表**：所有 providers 的卡片列表，每张卡片显示 name / model / api_base，可编辑、删除
3. **新增 Provider 按钮**：点击展开内联表单（或弹出编辑面板）
4. **编辑面板**：点击 provider 卡片的编辑按钮，展开内联编辑表单

**编辑表单字段**：

| 字段 | 输入类型 | 占位符 |
|------|----------|--------|
| 名称 (name) | text input | "My Provider" |
| API Base (api_base) | text input | "https://api.openai.com/v1" |
| API Key (api_key) | password input | "sk-..." |
| 模型 (model) | text input | "gpt-4o" |
| 支持视觉 (supports_vision) | toggle switch | — |
| 工具调用模式 (tool_call_mode) | dropdown (native / disabled) | — |

**数据流**：
```
组件 mount → storage.loadAgentConfig() → 渲染 providers 列表
用户编辑 → 本地 state 更新 → storage.saveAgentConfig(完整 config) → toast 成功/失败
```

**交互细节**：
- API Key 默认显示为 `••••••••`（mask），点击 "显示" 按钮切换明文
- 删除 provider 需二次确认（内联 confirm，不用 window.confirm）
- 激活 provider 通过列表项左侧 radio 选中
- 空状态：agent_config.json 不存在或 providers 为空时，显示引导文案 + "添加 Provider" 按钮（JStudio 会自动创建配置文件，无需依赖外部工具初始化）
- 保存时有 loading 状态（spinner）
- **新增 provider 时**：如果配置文件不存在，Rust 的 `write_agent_config` 会自动创建目录和文件，前端无需特殊处理

**样式规范**（遵循 AGENTS.md）：
- 使用 `var(--vscode-*)` CSS 变量，不硬编码颜色
- 图标统一 `w-4 h-4`
- 复用 `components/ui/` 中的公共组件（IconButton、MenuList 等）如果需要

---

## 第四步：导航集成

### 文件：`src/store/uiSlice.ts`

`SettingsSectionId` 类型新增 `'agent'`：

```typescript
export type SettingsSectionId = 'general' | 'editor' | 'terminal' | 'shortcuts' | 'help' | 'about' | 'agent';
```

### 文件：`src/components/Settings.tsx`

1. 导入 `AgentModelSection` 和 `Bot` / `Cpu` 图标
2. `NAV_ITEMS` 数组在 `general` 之后插入新条目：
```typescript
{
  id: 'agent',
  labelKey: 'settings.agent',
  icon: Bot,   // lucide-react Bot 图标
  subItems: [
    { anchorId: 'settings-agent-providers', labelKey: 'agent.providers' },
  ],
},
```
3. `SECTIONS` 映射新增：`agent: AgentModelSection`

---

## 第五步：i18n 翻译键

### 文件：`src/lib/i18n.ts`

新增翻译键（zh + en 对称）：

```
// 设置导航
'settings.agent': 'AI Agent' / 'AI Agent'

// Provider 管理
'agent.providers': '模型提供方' / 'Model Providers'
'agent.providersDesc': '管理 jcli agent 的 AI 模型配置...' / '...'
'agent.activeProvider': '当前模型' / 'Active Model'
'agent.noProviders': '尚未配置任何模型提供方' / 'No model providers configured'
'agent.noProvidersDesc': '添加一个 OpenAI 兼容的 API 端点...' / '...'
'agent.addProvider': '添加提供方' / 'Add Provider'
'agent.editProvider': '编辑提供方' / 'Edit Provider'
'agent.deleteProvider': '删除提供方' / 'Delete Provider'
'agent.deleteConfirm': '确定删除「{name}」？' / 'Delete "{name}"?'
'agent.setActive': '设为当前模型' / 'Set as active'
'agent.active': '当前使用' / 'Active'

// 表单字段
'agent.field.name': '名称' / 'Name'
'agent.field.namePlaceholder': '我的模型' / 'My Provider'
'agent.field.apiBase': 'API Base URL' / 'API Base URL'
'agent.field.apiBasePlaceholder': 'https://api.openai.com/v1' / '...'
'agent.field.apiKey': 'API Key' / 'API Key'
'agent.field.apiKeyPlaceholder': 'sk-...' / 'sk-...'
'agent.field.model': '模型名称' / 'Model Name'
'agent.field.modelPlaceholder': 'gpt-4o' / 'gpt-4o'
'agent.field.supportsVision': '支持视觉' / 'Supports Vision'
'agent.field.toolCallMode': '工具调用模式' / 'Tool Call Mode'
'agent.field.toolCallModeNative': '原生 (Native)' / 'Native'
'agent.field.toolCallModeDisabled': '禁用 (Disabled)' / 'Disabled'
'agent.field.toolCallModeDesc': '...' / '...'

// 操作
'agent.save': '保存' / 'Save'
'agent.cancel': '取消' / 'Cancel'
'agent.delete': '删除' / 'Delete'
'agent.edit': '编辑' / 'Edit'
'agent.showKey': '显示' / 'Show'
'agent.hideKey': '隐藏' / 'Hide'
'agent.saveSuccess': '配置已保存' / 'Configuration saved'
'agent.saveFailed': '保存失败' / 'Save failed'
'agent.configNotFound': '尚未创建 agent 配置文件' / 'Agent config file not yet created'
'agent.autoCreate': '点击「添加提供方」即可自动创建配置' / 'Click "Add Provider" to create the config automatically'
```

---

## 验证方式

1. `npx tsc --noEmit` — 类型检查通过
2. `npm run tauri dev` — 启动应用
3. 打开设置 → AI Agent → 验证：
   - 能读取到 `~/.jdata/agent/data/agent_config.json` 中的 providers
   - 能切换 active provider 并写回
   - 能新增/编辑/删除 provider
   - 写回后用 `cat ~/.jdata/agent/data/agent_config.json` 确认其他字段（system_prompt、compact 等）未丢失
4. 切换中/英文语言验证翻译键
