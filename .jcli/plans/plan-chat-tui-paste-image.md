# jcli TUI 输入框支持 Ctrl+V 粘贴图片

## 需求
在 jcli 命令行 agent 的聊天输入框中支持 Ctrl+V 粘贴图片：
- 按下 Ctrl+V 时，若系统剪贴板中有图片，将其作为附件添加到输入框（显示提示 chips）
- 再次按 Enter 发送时，图片以多模态 `ContentPart::ImageUrl` 随用户消息发给 LLM
- 支持 Backspace 删除最后一张附件；发送时清空附件

## 已确认的现状（无需改动后端）
- 后端 LLM 链路已支持多模态：
  - `j-agent/src/storage/types.rs:60` `ImageData { base64, media_type }`
  - `j-agent/src/storage/types.rs` `ChatMessage.images: Option<Vec<ImageData>>`（运行时有效，`#[serde(skip)]` 不持久化，与既有 read 工具图片行为一致）
  - `j-agent/src/agent/api.rs` `to_llm_messages` 会把 `msg.images` 转成 `ContentPart::ImageUrl`（受 `supports_vision` 门控）
- 文本粘贴已有 bracketed paste（`Event::Paste`）路径；**图片不会**通过 bracketed paste 传输，必须监听 Ctrl+V 按键后主动读系统剪贴板
- `arboard = { version = "3.6.1", default-features = false }` 已是依赖，但缺 `image-data` feature（`get_image()` 不可用）
- `image = "0.25"`、`base64 = "0.22"` 已是依赖
- 输入区高度固定 5 行，文本最多占 3 行，第 4/5 行空闲，可用于渲染附件提示行
- 发送链路：`ChatApp::send_message()`（app/message.rs:24）→ `send_message_internal(text)` → `ChatMessage::text(User, ...)` → `push_both_channels` → `spawn_agent_loop`
  - `send_message_internal` 另有 3 个调用点（stream_poll.rs×2、chat_app.rs:983），保持其签名不变
- loading 中 Enter 走排队：handler/chat.rs `handle_enter_key` → `pending_user_messages`（`Vec<ChatMessage>`，drain 时 images 字段保留，天然支持）
- `ModelProvider.supports_vision` 可通过 `app.active_provider()` 获取

## 实现方案

### 1. `desktop/jcli/Cargo.toml`
```toml
arboard = { version = "3.6.1", default-features = false, features = ["image-data"] }
```

### 2. `src/command/chat/app/ui_state.rs`
- 新增 `PendingImage` 结构体：`{ data: ImageData, width: u32, height: u32, size_bytes: usize }`（用于 UI chips 显示格式/尺寸）
- `UIState` 新增字段 `pending_images: Vec<PendingImage>`

### 3. `src/command/chat/app/chat_app.rs`
- UIState 构造处（约 line 496-602）加 `pending_images: Vec::new()`

### 4. 新文件 `src/command/chat/app/clipboard_image.rs`（在 app.rs 注册 mod）
- 纯函数 `read_clipboard_image() -> Result<PendingImage, String>`：
  arboard `get_image()`（RGBA8）→ `image::RgbaImage` → PNG 编码 → base64 → `ImageData { base64, media_type: "image/png" }`
- `impl ChatApp { pub fn paste_from_clipboard(&mut self) }`：
  1. 优先尝试图片 → 成功则 `ui.pending_images.push` + toast「已添加剪贴板图片 N」（模型不支持 vision 时 toast 警告但仍附加）
  2. 无图片 → 尝试 `get_text()` → `input_buffer.insert_str()`（复用 bracketed paste 的换行处理逻辑）
  3. 都没有 → toast 提示剪贴板无内容

### 5. `src/command/chat/handler/chat.rs`
- `handle_ctrl_shortcut` 加 `'v' => { app.paste_from_clipboard(); true }`
- `handle_main_key` 的 Backspace：输入框为空且有附件时 `pop` 移除最后一张图片
- `handle_enter_key`（loading 排队路径）：允许纯图片消息，附件随排队消息一起入队

### 6. `src/command/chat/ui/input.rs`（draw_input）
- 有附件时在输入区第 4 行（`area.y + area.height - 2`）渲染暗色提示行：
  `📎 [1] PNG 800x600 56KB  [2] JPEG 1920x1080 210KB`（超宽截断，不用 emoji 宽字符，📎 改用 `[图1]` 风格避免宽度计算问题）
  实际用：`图片[1] PNG 800x600 56KB  图片[2] ...`

### 7. `src/command/chat/app/message.rs`
- 新增 `send_message_with_images(&mut self, text: String, images: Vec<PendingImage>)`：
  text 为空且有图片时 content 用 `[图片]` 占位；`ChatMessage.images = Some(...)`
- `send_message()`：`take` 附件后调用之；`send_message_internal` 保持签名，内部调 `send_message_with_images(text, vec![])`

## 不做的事
- 不改 j-agent 后端（多模态链路已完备）
- 图片不持久化到 transcript（沿用 ChatMessage.images 的 serde skip 行为，会话还原后历史图片丢失——与 read 工具图片一致）
- remote/oneshot 路径不加图片支持（仅本地 TUI）

## 验证
- `cargo build -p jcli`（或整个 workspace）编译通过
- `cargo clippy` 无新警告
- 手动测试说明：复制图片到剪贴板 → Ctrl+V → 输入区显示附件行 → Enter 发送
