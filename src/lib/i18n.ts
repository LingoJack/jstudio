/**
 * Lightweight i18n module — no external dependencies.
 *
 * Usage:
 *   import { useI18n } from '../lib/i18n';
 *   const { t } = useI18n();
 *   <p>{t('settings.general')}</p>
 *
 * The current language is stored in the Zustand UI slice and persisted
 * via AppSettings. Components re-render automatically when the language
 * changes because `useI18n()` subscribes to the store.
 */

import { useStore } from '../store/useStore';

export type Language = 'zh' | 'en';

// ──────────────────────────────────────────────────────────────────
// Translation dictionaries
// ──────────────────────────────────────────────────────────────────

export const translations = {
  zh: {
    // ── App / Activity Bar ──
    'app.documents': '文档',
    'app.settings': '设置',
    'app.terminal': '终端',

    // ── Common ──
    'common.moveUp': '上移',
    'common.moveDown': '下移',
    'common.show': '显示',
    'common.hide': '隐藏',

    // ── SearchBar ──
    'search.placeholder': '搜索文档...',

    // ── TitleBar ──
    'titlebar.collapseSidebar': '收起侧边栏',
    'titlebar.expandSidebar': '展开侧边栏',
    'titlebar.moreActions': '更多操作',

    // ── DocumentList ──
    'doclist.allDocuments': '全部文档',
    'doclist.moreActions': '更多操作',
    'doclist.noMatch': '暂无匹配文档',
    'doclist.untitled': '无标题',
    'doclist.newDocument': '新建文档',
    'doclist.importMarkdown': '导入 Markdown',
    'doclist.importDirectory': '导入目录',
    'doclist.importBundle': '导入备份 (.jnote)',
    'doclist.exportBundle': '导出备份 (.jnote)',
    'doclist.exportBundleSuccess': '已导出备份',
    'doclist.exportBundleFailed': '导出备份失败',
    'doclist.importBundleSuccess': '已导入备份',
    'doclist.importBundleFailed': '导入备份失败',
    'doclist.importDirEmpty': '所选目录中没有 Markdown 文件',
    'doclist.importDirSuccess': '已导入 {count} 篇文档',
    'doclist.importDirFailed': '导入目录失败',
    'doclist.rename': '重命名',
    'doclist.delete': '删除',
    'doclist.renamePlaceholder': '输入文档名称',

    // ── DocumentList context menu ──
    'doclist.openInFinder': '在访达中显示',
    'doclist.copyPath': '复制路径',
    'doclist.copyRelativePath': '复制相对路径',
    'doclist.copied': '已复制到剪贴板',

    // ── DocumentList folders ──
    'doclist.newFolder': '新建文件夹',
    'doclist.newSubfolder': '新建子文件夹',
    'doclist.renameFolder': '重命名文件夹',
    'doclist.deleteFolder': '删除文件夹',
    'doclist.moveTo': '移动到',
    'doclist.untitledFolder': '新建文件夹',
    'doclist.rootLevel': '根目录',
    'doclist.folderNamePlaceholder': '文件夹名称',
    'doclist.deleteFolderConfirm': '确定删除文件夹「{name}」吗？文件夹内的文档将移至根目录。',

    // ── DocumentList batch operations ──
    'doclist.batchSelected': '已选 {count} 篇',
    'doclist.batchDelete': '删除选中',
    'doclist.batchMove': '移动选中',
    'doclist.batchDeleteConfirm': '确定删除选中的 {count} 篇文档吗？此操作不可撤销。',
    'doclist.batchClear': '取消选择',

    // ── Document List: Trash ──
    'doclist.trash': '回收站',
    'doclist.moveToTrash': '移入回收站',
    'doclist.moveToTrashConfirm': '确定将「{name}」移入回收站吗？',
    'doclist.batchMoveToTrash': '移入回收站',
    'doclist.batchMoveToTrashConfirm': '确定将选中的 {count} 项移入回收站吗？',
    'doclist.restore': '恢复',
    'doclist.permanentlyDelete': '永久删除',
    'doclist.permanentlyDeleteConfirm': '确定永久删除「{name}」吗？此操作不可撤销。',
    'doclist.emptyTrash': '清空回收站',
    'doclist.emptyTrashConfirm': '确定永久删除回收站中的所有项目吗？此操作不可撤销。',
    'doclist.trashEmpty': '回收站为空',
    'doclist.deletedDate': '删除于 {date}',
    'doclist.deleteFolderToTrashConfirm': '确定将文件夹「{name}」移入回收站吗？文件夹内的文档将一并移入回收站。',
    'doclist.trashedAssetFrom': '来自 {name}',

    // ── Workspace tabs ──
    'workspace.newTab': '新建标签页',
    'workspace.closeTab': '关闭标签页',
    'workspace.closeOthers': '关闭其他标签页',
    'workspace.detachToWindow': '分离到新窗口',
    'workspace.releaseToDetach': '松开以分离到新窗口',

    // ── Terminal ──
    'terminal.sessions': '终端会话',
    'terminal.newSession': '新建终端',
    'terminal.close': '关闭',
    'terminal.untitled': '终端',
    'terminal.fontFamily': '字体',
    'terminal.fontFamilyDesc': '终端使用的等宽字体',
    'terminal.cursorStyle': '光标样式',
    'terminal.cursorStyleDesc': '终端光标的形状，拖尾效果会自动跟随光标形状',
    'terminal.cursorStyle_block': '块状',
    'terminal.cursorStyle_underline': '下划线',
    'terminal.cursorStyle_bar': '竖线',
    // Template
    'terminal.templates': '模板',
    'terminal.newTemplate': '新建模板',
    'terminal.noTemplates': '没有模板，点击 + 创建',
    'terminal.edit': '编辑',
    'terminal.delete': '删除',
    'terminal.spawn': '启动会话',
    'terminal.spawnFromTemplate': '从此模板启动',
    'terminal.namePlaceholder': '名称',
    'terminal.clickTemplateHint': '在左侧选择一个模板启动终端',

    // ── Terminal tab context menu / history ──
    'terminal.rename': '重命名',
    'terminal.recentDirs': '最近打开的目录',
    'terminal.clearRecent': '清除历史',
    'terminal.noRecentDirs': '暂无历史记录',
    'terminal.detachTab': '分离到新窗口',
    'terminal.releaseToDetach': '释放以分离到新窗口',

    // ── DocumentOutline ──
    'outline.title': '大纲',
    'outline.empty': '文档中暂无标题',
    'outline.show': '显示大纲',
    'outline.hide': '隐藏大纲',

    // ── BlockEditor ──
    'editor.titlePlaceholder': '文档标题',

    // ── Settings nav ──
    'settings.title': '设置',
    'settings.general': '通用',
    'settings.agent': '模型能力',
    'settings.editor': '编辑器',
    'settings.terminal': '终端',
    'settings.about': '关于',
    'settings.help': '帮助',
    'settings.shortcuts': '快捷键',
    'settings.debug': '调试',

    // ── Debug section ──
    'debug.openDevtools': '打开开发者工具',
    'debug.openDevtoolsDesc': '打开 WebView 检查器（Console / Network / Elements）',
    'debug.buildInfo': '构建信息',
    'debug.buildCommit': 'Git Commit',
    'debug.buildMode': '构建模式',
    'debug.buildModeDev': 'Debug (开发)',
    'debug.buildModeRelease': 'Release (生产)',
    'debug.editorInUse': '当前编辑器',
    'debug.editorMain': 'BlockEditor (主编辑器)',
    'debug.editorSectioned': 'SectionedBlockEditor (POC)',
    'debug.sectionedFlag': 'Sectioned 开关',
    'debug.clearSectioned': '清除并刷新',
    'debug.clearSectionedDesc': '移除 localStorage 中的 jstudio.sectioned 标记并重载页面',

    // ── General section ──
    'general.latinFont': '英文字体',
    'general.latinFontDesc': '编辑器和界面的拉丁字母字体',
    'general.cjkFont': '中文字体',
    'general.cjkFontDesc': '编辑器和界面的中文字体',
    'general.fontSize': '字体大小',
    'general.fontSizeDesc': '编辑器正文的基准字号（{min}–{max} px）',
    'general.lineHeight': '行间距',
    'general.lineHeightDesc': '调整编辑器正文行与行之间的间距',
    'general.editorCursorStyle': '光标样式',
    'general.editorCursorStyleDesc': '编辑器光标的形状，拖尾效果会自动跟随光标形状',
    'general.editorCursorStyle_bar': '竖线',
    'general.editorCursorStyle_block': '块状',
    'general.editorCursorStyle_underline': '下划线',
    'general.terminalFontSize': '终端字号',
    'general.terminalFontSizeDesc': '终端的独立字号（{min}–{max} px）',
    'general.dataLocation': '数据存储位置',
    'general.dataLocationDesc': '所有笔记、附件和设置均保存在此目录',
    'general.open': '打开',
    'general.loading': '加载中…',
    'general.language': '语言',
    'general.languageDesc': '选择应用界面的显示语言',
    'general.fontPreview': 'Hello 世界 — 这是字体预览 AaBbCc 你好',

    // ── Appearance section ──
    'appearance.theme': '主题',
    'appearance.themeDesc': '选择应用的外观风格',
    'appearance.light': '浅色',
    'appearance.lightDesc': '始终使用浅色主题',
    'appearance.dark': '深色',
    'appearance.darkDesc': '始终使用深色主题',
    'appearance.system': '跟随系统',
    'appearance.systemDesc': '自动匹配操作系统外观',
    'appearance.activityBarBorder': '图标边框',
    'appearance.activityBarBorderDesc': '为左侧导航栏的选中图标显示彩色边框',
    'appearance.activityBarItems': '活动栏图标',
    'appearance.activityBarItemsDesc': '勾选以显示图标，拖拽手柄可调整顺序（设置始终位于底部）',
    'appearance.activityBarItem_documents': '文档',
    'appearance.activityBarItem_terminal': '终端',
    'appearance.activityBarItem_settings': '设置',
    'appearance.terminalTheme': '终端主题',
    'appearance.terminalThemeDesc': '选择终端配色方案（对齐 kitty 主题）',
    'appearance.terminalThemeDark': '深色终端主题',
    'appearance.terminalThemeDarkDesc': '应用处于深色模式（或跟随系统且系统为深色）时使用此主题',
    'appearance.terminalThemeLight': '浅色终端主题',
    'appearance.terminalThemeLightDesc': '应用处于浅色模式（或跟随系统且系统为浅色）时使用此主题',
    'appearance.terminalTheme_ink-dark': 'Ink Dark',
    'appearance.terminalTheme_ink-light': 'Ink Light',
    'appearance.terminalTheme_jstudio-dark': 'JStudio Dark',
    'appearance.terminalTheme_jstudio-light': 'JStudio Light',

    // ── About section ──
    'about.contactAuthor': '联系作者',
    'about.helpGuide': '帮助指南',
    'about.helpGuideDesc': '快速了解 JStudio 的核心功能与操作方式',
    'about.help.editor': '编辑器与块',
    'about.help.slashMenu': '斜杠命令菜单',
    'about.help.slashMenuDesc': '在空行输入 / 即可唤起命令面板，快速插入各种内容块：',
    'about.help.blockTypes': '支持的块类型',
    'about.help.editorShortcuts': '编辑器快捷键',
    'about.help.markdownShortcuts': 'Markdown 快捷输入',
    'about.help.markdownShortcutsDesc': '在行首输入 Markdown 标记，自动转换为对应格式：',
    'about.help.formatToolbar': '选中文字后，会自动浮现格式工具栏，可快速加粗、斜体、删除线、行内代码。',
    'about.help.outline': '点击编辑器右上角的大纲图标，可展开文档大纲，快速跳转到各标题。',
    'about.help.terminal': '终端',
    'about.help.terminalTabs': '标签页管理',
    'about.help.terminalSplit': '分屏与面板',
    'about.help.terminalLayout': '面板布局',
    'about.help.terminalLayoutDesc': '使用快捷键在以下 5 种布局间循环切换：',
    'about.help.cursorTrail': '光标拖尾动画',
    'about.help.cursorTrailDesc': '终端光标移动时，会出现彗星尾巴般的拖尾动画效果（移植自 Kitty 终端）。拖尾形状会自动跟随光标样式（块状 / 下划线 / 竖线）变化。可在「设置 → 终端」中切换光标样式。',
    'about.help.terminalTemplates': '终端模板',
    'about.help.terminalTemplatesDesc': '在「设置 → 终端 → 模板」中可创建终端模板，预设名称和工作目录，方便一键启动特定项目的终端。',

    // ── jcli section ──
    'jcli.title': 'JCLI 命令行工具',
    'jcli.desc': '将 jcli 安装到系统，安装后可在终端中使用 j 命令',
    'jcli.installed': '已安装',
    'jcli.notInstalled': '未安装',
    'jcli.version': '版本',
    'jcli.path': '路径',
    'jcli.install': '安装',
    'jcli.uninstall': '卸载',
    'jcli.reinstall': '重新安装',
    'jcli.installing': '安装中…',
    'jcli.uninstalling': '卸载中…',
    'jcli.installSuccess': 'jcli 已成功安装',
    'jcli.installFailed': '安装失败',
    'jcli.uninstallSuccess': 'jcli 已卸载',
    'jcli.uninstallFailed': '卸载失败',
    'jcli.bundled': '内置版本',
    'jcli.checking': '检查中…',
    'jcli.notBundled': '当前应用未内置 jcli 二进制文件',

    // ── Agent Model section ──
    'agent.providers': '模型提供方',
    'agent.providersDesc': '管理 AI Agent 使用的模型提供方（OpenAI 兼容）。配置保存在 ~/.jdata/agent/data/agent_config.json',
    'agent.activeModel': '当前模型',
    'agent.noProviders': '尚未配置任何模型提供方',
    'agent.noProvidersDesc': '添加一个 OpenAI 兼容的 API 端点即可开始使用，配置文件将自动创建',
    'agent.addProvider': '添加提供方',
    'agent.editProvider': '编辑提供方',
    'agent.deleteConfirm': '确定删除「{name}」？',
    'agent.setActive': '设为当前模型',
    'agent.active': '当前使用',
    'agent.configError': '读取 agent 配置失败',
    'agent.loading': '加载配置中…',
    'agent.retry': '重试',

    // Agent form fields
    'agent.field.name': '名称',
    'agent.field.namePlaceholder': '我的模型',
    'agent.field.apiBase': 'API Base URL',
    'agent.field.apiBasePlaceholder': 'https://api.openai.com/v1',
    'agent.field.apiKey': 'API Key',
    'agent.field.apiKeyPlaceholder': 'sk-...',
    'agent.field.model': '模型名称',
    'agent.field.modelPlaceholder': 'gpt-4o',
    'agent.field.supportsVision': '支持视觉',
    'agent.field.supportsVisionDesc': '模型支持图片等多模态输入',
    'agent.field.toolCallMode': '工具调用模式',
    'agent.field.toolCallModeDesc': '原生模式使用 OpenAI function calling 协议；禁用则关闭工具调用',
    'agent.field.toolCallModeNative': '原生 (Native)',
    'agent.field.toolCallModeDisabled': '禁用 (Disabled)',

    // Agent actions
    'agent.save': '保存',
    'agent.cancel': '取消',
    'agent.delete': '删除',
    'agent.edit': '编辑',
    'agent.showKey': '显示',
    'agent.hideKey': '隐藏',
    'agent.saveSuccess': '配置已保存',
    'agent.saveFailed': '保存失败：{error}',
    'agent.fillRequired': '请填写名称、API Base 和模型名称',

    // ── FontDropdown ──
    'font.searchPlaceholder': '搜索字体…',
    'font.noMatch': '无匹配字体',

    // ── FormatBubbleMenu ──
    'bubble.bold': '加粗',
    'bubble.italic': '斜体',
    'bubble.strike': '删除线',
    'bubble.code': '行内代码',

    // ── BlockEditor placeholder ──
    'editor.placeholder': '输入 / 唤起命令菜单…',

    // ── Command Palette ──
    'palette.placeholder': '输入命令名称…',
    'palette.docPlaceholder': '搜索文档…',
    'palette.tabCommands': '命令',
    'palette.tabDocuments': '文档',
    'palette.tabTerminal': '终端会话',
    'palette.tabSettings': '设置',
    'palette.shortcutHint': '⌘P',
    'palette.noResults': '无匹配结果',
    'palette.footer': '↑↓ 导航 · Enter 执行 · Esc 关闭',

    // ── CodeBlockView ──
    'code.copy': '复制代码',
    'code.searchLang': '搜索语言…',
    'code.noLangMatch': '无匹配语言',

    // ── ImageView / FileView ──
    'image.selectImage': '点击选择图片',
    'image.selectFile': '点击选择文件',
    'image.uploadFile': '点击上传文件',
    'image.alignLeft': '左对齐',
    'image.alignCenter': '居中',
    'image.loading': '加载中…',
    'image.cardMode': '切换到卡片模式',
    'image.previewMode': '切换到预览模式',
    'image.zoomNewWindow': '放大预览（新窗口）',
    'image.parsingDocx': '正在解析 DOCX…',
    'image.cannotRead': '无法读取文件内容',

    // ── PreviewWindow ──
    'preview.loading': '正在加载预览…',
    'preview.close': '关闭窗口',
    'preview.unsupported': '此文件类型不支持预览',
    'preview.zoomOut': '缩小',
    'preview.zoomIn': '放大',
    'preview.reset': '重置 (双击图片)',

    // ── TableControls ──
    'table.insertRowAbove': '上方插入行',
    'table.insertRowBelow': '下方插入行',
    'table.deleteRow': '删除行',
    'table.insertColLeft': '左侧插入列',
    'table.insertColRight': '右侧插入列',
    'table.deleteCol': '删除列',
    'table.alignLeft': '左对齐',
    'table.alignCenter': '居中对齐',
    'table.alignRight': '右对齐',
    'table.deleteTable': '删除表格',

    // ── ErrorBoundary ──
    'error.title': '应用遇到了一个错误。',
    'error.retry': '重试',

    // ── Keyboard Shortcuts ──
    'shortcut.description': '自定义应用内的键盘快捷键。点击按键组合即可重新绑定。',
    'shortcut.pressKeys': '按下快捷键…',
    'shortcut.clickToRecord': '点击录制',
    'shortcut.resetToDefault': '重置为默认值',
    'shortcut.resetAll': '重置全部为默认值',
    'shortcut.reference': '参考快捷键（只读）',
    'shortcut.conflictWith': '与「{name}」冲突',
    'shortcut.conflictWarning': '此快捷键已绑定到「{name}」，保存后存在冲突。',

    // ── Global shortcuts (OS-level) ──
    'settings.globalShortcuts': '全局快捷键',
    'globalShortcut.title': '全局快捷键',
    'globalShortcut.description': '配置系统级全局快捷键，在应用外也能触发操作（如打开命令面板、在指定目录启动终端）。',
    'globalShortcut.add': '添加全局快捷键',
    'globalShortcut.empty': '尚未配置全局快捷键，点击上方按钮添加。',
    'globalShortcut.shortcutKey': '快捷键',
    'globalShortcut.action': '动作',
    'globalShortcut.conflict': '快捷键冲突',
    'globalShortcut.test': '测试',
    'globalShortcut.edit': '编辑',
    'globalShortcut.editBtn': '编辑',
    'globalShortcut.delete': '删除',
    'globalShortcut.cancel': '取消',
    'globalShortcut.save': '保存',
    'globalShortcut.linkHint': '需要在应用外（任意应用前台时）触发快捷键？',
    'globalShortcut.linkAction': '配置全局快捷键',
    'globalShortcut.action.openPanel': '打开面板',
    'globalShortcut.action.openPanelDesc': '弹出独立浮窗面板（如命令面板）',
    'globalShortcut.action.openTerminal': '打开终端',
    'globalShortcut.action.openTerminalDesc': '在指定目录启动终端，可自动执行命令',
    'globalShortcut.action.toggleWindow': '显示/隐藏窗口',
    'globalShortcut.action.toggleWindowDesc': '切换主窗口的显示状态',
    'globalShortcut.param.panel': '面板',
    'globalShortcut.panel.commandPalette': '命令面板',
    'globalShortcut.param.workingDirectory': '工作目录',
    'globalShortcut.param.workingDirectoryPlaceholder': '~ 或绝对路径',
    'globalShortcut.param.command': '命令',
    'globalShortcut.param.commandPlaceholder': '可选：要执行的命令',
    'globalShortcut.badgeGlobal': '全局',
    'globalShortcut.enabled': '启用',
    'globalShortcut.enabledDesc': '启用此快捷键（注册到系统）',
    'globalShortcut.testFailed': '测试执行失败',
    'globalShortcut.noShortcut': '请先录制快捷键',

    // Shortcut categories
    'shortcut.category.general': '通用',
    'shortcut.category.navigation': '导航',
    'shortcut.category.appearance': '外观',
    'shortcut.category.terminal': '终端',
    'shortcut.category.terminalTabs': '标签页',
    'shortcut.category.terminalPanes': '分屏',
    'shortcut.category.editorBlocks': '块操作',

    // General shortcuts
    'shortcut.app.commandPalette': '打开命令面板',
    'shortcut.app.commandPalette.desc': '全局打开命令搜索面板',
    'shortcut.app.newDocument': '新建文档',
    'shortcut.app.newDocument.desc': '创建一篇新文档',
    'shortcut.app.toggleSidebar': '切换侧边栏',
    'shortcut.app.toggleSidebar.desc': '展开或收起侧边栏',
    'shortcut.app.toggleOutline': '切换大纲',
    'shortcut.app.toggleOutline.desc': '展开或收起文档大纲',
    'shortcut.app.openSettings': '打开设置',
    'shortcut.app.openSettings.desc': '打开应用设置页面',
    'shortcut.app.importMarkdown': '导入 Markdown',
    'shortcut.app.importMarkdown.desc': '从 Markdown 文件导入文档',
    'shortcut.app.goToDocuments': '转到文档',
    'shortcut.app.goToDocuments.desc': '切换到文档列表视图',
    'shortcut.app.goToTerminal': '转到终端',
    'shortcut.app.goToTerminal.desc': '切换到终端视图',
    'shortcut.app.cycleTabLeft': '上一个标签页',
    'shortcut.app.cycleTabLeft.desc': '切换到左边的标签页',
    'shortcut.app.cycleTabRight': '下一个标签页',
    'shortcut.app.cycleTabRight.desc': '切换到右边的标签页',
    'shortcut.app.closeTab': '关闭标签页',
    'shortcut.app.closeTab.desc': '关闭当前标签页',
    'shortcut.app.toggleDarkMode': '切换深色模式',
    'shortcut.app.toggleDarkMode.desc': '在深色和浅色模式之间切换',
    'shortcut.app.setDarkTheme': '切换到深色主题',
    'shortcut.app.setDarkTheme.desc': '将主题设置为深色',
    'shortcut.app.setLightTheme': '切换到浅色主题',
    'shortcut.app.setLightTheme.desc': '将主题设置为浅色',
    'shortcut.app.setSystemTheme': '跟随系统主题',
    'shortcut.app.setSystemTheme.desc': '将主题设置为跟随系统',
    'shortcut.unbound': '未设置',

    // Terminal shortcuts
    'shortcut.terminal.newTab': '新建标签页',
    'shortcut.terminal.closeTab': '关闭标签页',
    'shortcut.terminal.cycleTabLeft': '切换到左标签页',
    'shortcut.terminal.cycleTabRight': '切换到右标签页',
    'shortcut.terminal.detachTab': '分离标签页到新窗口',
    'shortcut.terminal.splitPane': '分屏',
    'shortcut.terminal.closePane': '仅关闭当前面板',
    'shortcut.terminal.focusPrevPane': '焦点切到上一面板',
    'shortcut.terminal.focusNextPane': '焦点切到下一面板',
    'shortcut.terminal.cycleLayout': '循环面板布局',
    'shortcut.terminal.movePane': '移动面板位置',

    // Editor shortcuts
    'shortcut.editor.insertBlockBelow': '下方插入空行',
    'shortcut.editor.insertBlockAbove': '上方插入空行',

    // Reference shortcuts (read-only)
    'shortcut.ref.editorFormatting': '编辑器格式化',
    'shortcut.ref.markdown': 'Markdown 输入',
    'shortcut.ref.bold': '粗体',
    'shortcut.ref.italic': '斜体',
    'shortcut.ref.underline': '下划线',
    'shortcut.ref.strikethrough': '删除线',
    'shortcut.ref.inlineCode': '行内代码',
    'shortcut.ref.undo': '撤销',
    'shortcut.ref.redo': '重做',
    'shortcut.ref.selectAll': '全选',
    'shortcut.ref.heading1': '一级标题',
    'shortcut.ref.heading2': '二级标题',
    'shortcut.ref.heading3': '三级标题',
    'shortcut.ref.quote': '引用',
    'shortcut.ref.bulletList': '无序列表',
    'shortcut.ref.orderedList': '有序列表',
    'shortcut.ref.codeBlock': '代码块',
    'shortcut.ref.divider': '分隔线',
  },

  en: {
    // ── App / Activity Bar ──
    'app.documents': 'Documents',
    'app.settings': 'Settings',
    'app.terminal': 'Terminal',

    // ── Common ──
    'common.moveUp': 'Move Up',
    'common.moveDown': 'Move Down',
    'common.show': 'Show',
    'common.hide': 'Hide',

    // ── SearchBar ──
    'search.placeholder': 'Search documents...',

    // ── TitleBar ──
    'titlebar.collapseSidebar': 'Collapse Sidebar',
    'titlebar.expandSidebar': 'Expand Sidebar',
    'titlebar.moreActions': 'More Actions',

    // ── DocumentList ──
    'doclist.allDocuments': 'All Documents',
    'doclist.moreActions': 'More Actions',
    'doclist.noMatch': 'No matching documents',
    'doclist.untitled': 'Untitled',
    'doclist.newDocument': 'New Document',
    'doclist.importMarkdown': 'Import Markdown',
    'doclist.importDirectory': 'Import Directory',
    'doclist.importBundle': 'Import Backup (.jnote)',
    'doclist.exportBundle': 'Export Backup (.jnote)',
    'doclist.exportBundleSuccess': 'Backup exported',
    'doclist.exportBundleFailed': 'Failed to export backup',
    'doclist.importBundleSuccess': 'Backup imported',
    'doclist.importBundleFailed': 'Failed to import backup',
    'doclist.importDirEmpty': 'No Markdown files found in the selected directory',
    'doclist.importDirSuccess': 'Imported {count} documents',
    'doclist.importDirFailed': 'Failed to import directory',
    'doclist.rename': 'Rename',
    'doclist.delete': 'Delete',
    'doclist.renamePlaceholder': 'Enter document name',

    // ── DocumentList context menu ──
    'doclist.openInFinder': 'Reveal in Finder',
    'doclist.copyPath': 'Copy Path',
    'doclist.copyRelativePath': 'Copy Relative Path',
    'doclist.copied': 'Copied to clipboard',

    // ── DocumentList folders ──
    'doclist.newFolder': 'New Folder',
    'doclist.newSubfolder': 'New Subfolder',
    'doclist.renameFolder': 'Rename Folder',
    'doclist.deleteFolder': 'Delete Folder',
    'doclist.moveTo': 'Move to',
    'doclist.untitledFolder': 'Untitled Folder',
    'doclist.rootLevel': 'Root',
    'doclist.folderNamePlaceholder': 'Folder name',
    'doclist.deleteFolderConfirm': 'Delete folder "{name}"? All documents inside this folder and its sub-folders will be permanently deleted.',

    // ── DocumentList batch operations ──
    'doclist.batchSelected': '{count} selected',
    'doclist.batchDelete': 'Delete Selected',
    'doclist.batchMove': 'Move Selected',
    'doclist.batchDeleteConfirm': 'Delete {count} selected documents? This action cannot be undone.',
    'doclist.batchClear': 'Clear Selection',

    // ── Document List: Trash ──
    'doclist.trash': 'Trash',
    'doclist.moveToTrash': 'Move to Trash',
    'doclist.moveToTrashConfirm': 'Move "{name}" to trash?',
    'doclist.batchMoveToTrash': 'Move to Trash',
    'doclist.batchMoveToTrashConfirm': 'Move {count} selected items to trash?',
    'doclist.restore': 'Restore',
    'doclist.permanentlyDelete': 'Delete Permanently',
    'doclist.permanentlyDeleteConfirm': 'Permanently delete "{name}"? This action cannot be undone.',
    'doclist.emptyTrash': 'Empty Trash',
    'doclist.emptyTrashConfirm': 'Permanently delete all items in trash? This action cannot be undone.',
    'doclist.trashEmpty': 'Trash is empty',
    'doclist.deletedDate': 'Deleted {date}',
    'doclist.deleteFolderToTrashConfirm': 'Move folder "{name}" to trash? All documents inside will be moved to trash as well.',
    'doclist.trashedAssetFrom': 'From {name}',

    // ── Workspace tabs ──
    'workspace.newTab': 'New Tab',
    'workspace.closeTab': 'Close Tab',
    'workspace.closeOthers': 'Close Others',
    'workspace.detachToWindow': 'Detach to New Window',
    'workspace.releaseToDetach': 'Release to detach to new window',

    // ── Terminal ──
    'terminal.sessions': 'Terminal Sessions',
    'terminal.newSession': 'New Terminal',
    'terminal.close': 'Close',
    'terminal.untitled': 'Terminal',
    'terminal.fontFamily': 'Font',
    'terminal.fontFamilyDesc': 'Monospace font used by the terminal',
    'terminal.cursorStyle': 'Cursor Style',
    'terminal.cursorStyleDesc': 'Shape of the terminal cursor — the trail follows this shape',
    'terminal.cursorStyle_block': 'Block',
    'terminal.cursorStyle_underline': 'Underline',
    'terminal.cursorStyle_bar': 'Bar',
    // Template
    'terminal.templates': 'Templates',
    'terminal.newTemplate': 'New Template',
    'terminal.noTemplates': 'No templates yet, click + to create',
    'terminal.edit': 'Edit',
    'terminal.delete': 'Delete',
    'terminal.spawn': 'Spawn Session',
    'terminal.spawnFromTemplate': 'Spawn from this template',
    'terminal.namePlaceholder': 'Name',
    'terminal.clickTemplateHint': 'Select a template from the sidebar to start',

    // ── Terminal tab context menu / history ──
    'terminal.rename': 'Rename',
    'terminal.recentDirs': 'Recent Directories',
    'terminal.clearRecent': 'Clear History',
    'terminal.noRecentDirs': 'No recent directories',
    'terminal.detachTab': 'Detach to New Window',
    'terminal.releaseToDetach': 'Release to detach into a new window',

    // ── DocumentOutline ──
    'outline.title': 'Outline',
    'outline.empty': 'No headings in this document',
    'outline.show': 'Show outline',
    'outline.hide': 'Hide outline',

    // ── BlockEditor ──
    'editor.titlePlaceholder': 'Document title',

    // ── Settings nav ──
    'settings.title': 'Settings',
    'settings.general': 'General',
    'settings.agent': 'AI Agent',
    'settings.editor': 'Editor',
    'settings.terminal': 'Terminal',
    'settings.about': 'About',
    'settings.help': 'Help',
    'settings.shortcuts': 'Shortcuts',
    'settings.debug': 'Debug',

    // ── Debug section ──
    'debug.openDevtools': 'Open DevTools',
    'debug.openDevtoolsDesc': 'Open the WebView inspector (Console / Network / Elements)',
    'debug.buildInfo': 'Build Info',
    'debug.buildCommit': 'Git Commit',
    'debug.buildMode': 'Build Mode',
    'debug.buildModeDev': 'Debug (dev)',
    'debug.buildModeRelease': 'Release (production)',
    'debug.editorInUse': 'Active Editor',
    'debug.editorMain': 'BlockEditor (main)',
    'debug.editorSectioned': 'SectionedBlockEditor (POC)',
    'debug.sectionedFlag': 'Sectioned Flag',
    'debug.clearSectioned': 'Clear & Reload',
    'debug.clearSectionedDesc': 'Remove jstudio.sectioned from localStorage and reload the page',

    // ── General section ──
    'general.latinFont': 'Latin Font',
    'general.latinFontDesc': 'Font for Latin characters in the editor and UI',
    'general.cjkFont': 'CJK Font',
    'general.cjkFontDesc': 'Font for Chinese characters in the editor and UI',
    'general.fontSize': 'Font Size',
    'general.fontSizeDesc': 'Base font size for the editor body ({min}–{max} px)',
    'general.lineHeight': 'Line Spacing',
    'general.lineHeightDesc': 'Adjust the vertical spacing between lines in the editor',
    'general.editorCursorStyle': 'Cursor Style',
    'general.editorCursorStyleDesc': 'Shape of the editor cursor — the trail follows this shape',
    'general.editorCursorStyle_bar': 'Bar',
    'general.editorCursorStyle_block': 'Block',
    'general.editorCursorStyle_underline': 'Underline',
    'general.terminalFontSize': 'Terminal Font Size',
    'general.terminalFontSizeDesc': 'Independent font size for the terminal ({min}–{max} px)',
    'general.dataLocation': 'Data Location',
    'general.dataLocationDesc': 'All notes, attachments and settings are stored here',
    'general.open': 'Open',
    'general.loading': 'Loading…',
    'general.language': 'Language',
    'general.languageDesc': 'Choose the display language for the interface',
    'general.fontPreview': 'Hello World — Font preview AaBbCc',

    // ── Appearance section ──
    'appearance.theme': 'Theme',
    'appearance.themeDesc': 'Choose the visual style of the application',
    'appearance.light': 'Light',
    'appearance.lightDesc': 'Always use the light theme',
    'appearance.dark': 'Dark',
    'appearance.darkDesc': 'Always use the dark theme',
    'appearance.system': 'System',
    'appearance.systemDesc': 'Automatically match the OS appearance',
    'appearance.activityBarBorder': 'Icon Border',
    'appearance.activityBarBorderDesc': 'Show a colored border on the selected sidebar icon',
    'appearance.activityBarItems': 'Activity Bar Icons',
    'appearance.activityBarItemsDesc': 'Check to show an icon; drag the handle to reorder (Settings always stays at the bottom)',
    'appearance.activityBarItem_documents': 'Documents',
    'appearance.activityBarItem_terminal': 'Terminal',
    'appearance.activityBarItem_settings': 'Settings',
    'appearance.terminalTheme': 'Terminal Theme',
    'appearance.terminalThemeDesc': 'Choose a terminal color scheme (matches kitty themes)',
    'appearance.terminalThemeDark': 'Dark Terminal Theme',
    'appearance.terminalThemeDarkDesc': 'Used when the app is in dark mode (or system mode while OS is dark)',
    'appearance.terminalThemeLight': 'Light Terminal Theme',
    'appearance.terminalThemeLightDesc': 'Used when the app is in light mode (or system mode while OS is light)',
    'appearance.terminalTheme_ink-dark': 'Ink Dark',
    'appearance.terminalTheme_ink-light': 'Ink Light',
    'appearance.terminalTheme_jstudio-dark': 'JStudio Dark',
    'appearance.terminalTheme_jstudio-light': 'JStudio Light',

    // ── About section ──
    'about.contactAuthor': 'Contact Author',
    'about.helpGuide': 'Help Guide',
    'about.helpGuideDesc': 'Quickly learn the core features and operations of JStudio',
    'about.help.editor': 'Editor & Blocks',
    'about.help.slashMenu': 'Slash Command Menu',
    'about.help.slashMenuDesc': 'Type / on an empty line to bring up the command palette and quickly insert various blocks:',
    'about.help.blockTypes': 'Supported block types',
    'about.help.editorShortcuts': 'Editor Shortcuts',
    'about.help.markdownShortcuts': 'Markdown Shortcuts',
    'about.help.markdownShortcutsDesc': 'Type Markdown markers at the start of a line to auto-convert:',
    'about.help.formatToolbar': 'Select text to show a floating format toolbar for bold, italic, strikethrough, and inline code.',
    'about.help.outline': 'Click the outline icon in the top-right corner of the editor to open the document outline and jump to headings.',
    'about.help.terminal': 'Terminal',
    'about.help.terminalTabs': 'Tab Management',
    'about.help.terminalSplit': 'Split Panes',
    'about.help.terminalLayout': 'Pane Layouts',
    'about.help.terminalLayoutDesc': 'Cycle through 5 layouts with a shortcut:',
    'about.help.cursorTrail': 'Cursor Trail Animation',
    'about.help.cursorTrailDesc': 'When the terminal cursor moves, a comet-tail trail animation appears (ported from Kitty terminal). The trail shape adapts to the cursor style (block / underline / bar). Cursor style can be changed in Settings > Terminal.',
    'about.help.terminalTemplates': 'Terminal Templates',
    'about.help.terminalTemplatesDesc': 'Create terminal templates in Settings > Terminal > Templates with preset names and working directories for quick project launches.',

    // ── jcli section ──
    'jcli.title': 'JCLI Command Line Tool',
    'jcli.desc': 'Install jcli to your system so you can use the j command in the terminal',
    'jcli.installed': 'Installed',
    'jcli.notInstalled': 'Not installed',
    'jcli.version': 'Version',
    'jcli.path': 'Path',
    'jcli.install': 'Install',
    'jcli.uninstall': 'Uninstall',
    'jcli.reinstall': 'Reinstall',
    'jcli.installing': 'Installing…',
    'jcli.uninstalling': 'Uninstalling…',
    'jcli.installSuccess': 'jcli installed successfully',
    'jcli.installFailed': 'Installation failed',
    'jcli.uninstallSuccess': 'jcli uninstalled',
    'jcli.uninstallFailed': 'Uninstall failed',
    'jcli.bundled': 'Bundled version',
    'jcli.checking': 'Checking…',
    'jcli.notBundled': 'This app does not include a bundled jcli binary',

    // ── Agent Model section ──
    'agent.providers': 'Model Providers',
    'agent.providersDesc': 'Manage AI Agent model providers (OpenAI-compatible). Config saved to ~/.jdata/agent/data/agent_config.json',
    'agent.activeModel': 'Active Model',
    'agent.noProviders': 'No model providers configured',
    'agent.noProvidersDesc': 'Add an OpenAI-compatible API endpoint to get started — the config file will be created automatically',
    'agent.addProvider': 'Add Provider',
    'agent.editProvider': 'Edit Provider',
    'agent.deleteConfirm': 'Delete "{name}"?',
    'agent.setActive': 'Set as active',
    'agent.active': 'Active',
    'agent.configError': 'Failed to read agent config',
    'agent.loading': 'Loading config…',
    'agent.retry': 'Retry',

    // Agent form fields
    'agent.field.name': 'Name',
    'agent.field.namePlaceholder': 'My Provider',
    'agent.field.apiBase': 'API Base URL',
    'agent.field.apiBasePlaceholder': 'https://api.openai.com/v1',
    'agent.field.apiKey': 'API Key',
    'agent.field.apiKeyPlaceholder': 'sk-...',
    'agent.field.model': 'Model Name',
    'agent.field.modelPlaceholder': 'gpt-4o',
    'agent.field.supportsVision': 'Supports Vision',
    'agent.field.supportsVisionDesc': 'The model supports image and multimodal input',
    'agent.field.toolCallMode': 'Tool Call Mode',
    'agent.field.toolCallModeDesc': 'Native uses the OpenAI function calling protocol; Disabled turns off tool calls',
    'agent.field.toolCallModeNative': 'Native',
    'agent.field.toolCallModeDisabled': 'Disabled',

    // Agent actions
    'agent.save': 'Save',
    'agent.cancel': 'Cancel',
    'agent.delete': 'Delete',
    'agent.edit': 'Edit',
    'agent.showKey': 'Show',
    'agent.hideKey': 'Hide',
    'agent.saveSuccess': 'Configuration saved',
    'agent.saveFailed': 'Save failed: {error}',
    'agent.fillRequired': 'Please fill in name, API Base and model name',

    // ── FontDropdown ──
    'font.searchPlaceholder': 'Search fonts…',
    'font.noMatch': 'No matching fonts',

    // ── FormatBubbleMenu ──
    'bubble.bold': 'Bold',
    'bubble.italic': 'Italic',
    'bubble.strike': 'Strikethrough',
    'bubble.code': 'Inline code',

    // ── BlockEditor placeholder ──
    'editor.placeholder': 'Type / for commands…',

    // ── Command Palette ──
    'palette.placeholder': 'Type a command name…',
    'palette.docPlaceholder': 'Search documents…',
    'palette.tabCommands': 'Commands',
    'palette.tabDocuments': 'Documents',
    'palette.tabTerminal': 'Sessions',
    'palette.tabSettings': 'Settings',
    'palette.shortcutHint': '⌘P',
    'palette.noResults': 'No matching results',
    'palette.footer': '↑↓ Navigate · Enter Select · Esc Close',

    // ── CodeBlockView ──
    'code.copy': 'Copy code',
    'code.searchLang': 'Search language…',
    'code.noLangMatch': 'No matching languages',

    // ── ImageView / FileView ──
    'image.selectImage': 'Click to select an image',
    'image.selectFile': 'Click to select a file',
    'image.uploadFile': 'Click to upload a file',
    'image.alignLeft': 'Align left',
    'image.alignCenter': 'Center',
    'image.loading': 'Loading…',
    'image.cardMode': 'Switch to card mode',
    'image.previewMode': 'Switch to preview mode',
    'image.zoomNewWindow': 'Zoom (new window)',
    'image.parsingDocx': 'Parsing DOCX…',
    'image.cannotRead': 'Cannot read file content',

    // ── PreviewWindow ──
    'preview.loading': 'Loading preview…',
    'preview.close': 'Close window',
    'preview.unsupported': 'This file type cannot be previewed',
    'preview.zoomOut': 'Zoom out',
    'preview.zoomIn': 'Zoom in',
    'preview.reset': 'Reset (double-click image)',

    // ── TableControls ──
    'table.insertRowAbove': 'Insert row above',
    'table.insertRowBelow': 'Insert row below',
    'table.deleteRow': 'Delete row',
    'table.insertColLeft': 'Insert column left',
    'table.insertColRight': 'Insert column right',
    'table.deleteCol': 'Delete column',
    'table.alignLeft': 'Align left',
    'table.alignCenter': 'Align center',
    'table.alignRight': 'Align right',
    'table.deleteTable': 'Delete table',

    // ── ErrorBoundary ──
    'error.title': 'The app encountered an error.',
    'error.retry': 'Retry',

    // ── Keyboard Shortcuts ──
    'shortcut.description': 'Customize keyboard shortcuts for the app. Click a key binding to rebind it.',
    'shortcut.pressKeys': 'Press keys…',
    'shortcut.clickToRecord': 'Click to record',
    'shortcut.resetToDefault': 'Reset to default',
    'shortcut.resetAll': 'Reset all to defaults',
    'shortcut.reference': 'Reference shortcuts (read-only)',
    'shortcut.conflictWith': 'Conflicts with "{name}"',
    'shortcut.conflictWarning': 'This shortcut is already bound to "{name}". Saving will create a conflict.',

    // ── Global shortcuts (OS-level) ──
    'settings.globalShortcuts': 'Global Shortcuts',
    'globalShortcut.title': 'Global Shortcuts',
    'globalShortcut.description': 'Configure system-wide global shortcuts that work even when the app is not focused (e.g. open command palette, launch terminal in a specific directory).',
    'globalShortcut.add': 'Add Global Shortcut',
    'globalShortcut.empty': 'No global shortcuts configured yet. Click the button above to add one.',
    'globalShortcut.shortcutKey': 'Shortcut Key',
    'globalShortcut.action': 'Action',
    'globalShortcut.conflict': 'Shortcut conflict',
    'globalShortcut.test': 'Test',
    'globalShortcut.edit': 'Edit',
    'globalShortcut.editBtn': 'Edit',
    'globalShortcut.delete': 'Delete',
    'globalShortcut.cancel': 'Cancel',
    'globalShortcut.save': 'Save',
    'globalShortcut.linkHint': 'Need shortcuts that work outside the app (from any application)?',
    'globalShortcut.linkAction': 'Configure Global Shortcuts',
    'globalShortcut.action.openPanel': 'Open Panel',
    'globalShortcut.action.openPanelDesc': 'Open a floating panel window (e.g. Command Palette)',
    'globalShortcut.action.openTerminal': 'Open Terminal',
    'globalShortcut.action.openTerminalDesc': 'Launch a terminal in a specified directory, optionally running a command',
    'globalShortcut.action.toggleWindow': 'Toggle Window',
    'globalShortcut.action.toggleWindowDesc': 'Show or hide the main application window',
    'globalShortcut.param.panel': 'Panel',
    'globalShortcut.panel.commandPalette': 'Command Palette',
    'globalShortcut.param.workingDirectory': 'Working Directory',
    'globalShortcut.param.workingDirectoryPlaceholder': '~ or absolute path',
    'globalShortcut.param.command': 'Command',
    'globalShortcut.param.commandPlaceholder': 'Optional: command to execute',
    'globalShortcut.badgeGlobal': 'Global',
    'globalShortcut.enabled': 'Enabled',
    'globalShortcut.enabledDesc': 'Register this shortcut with the OS',
    'globalShortcut.testFailed': 'Test execution failed',
    'globalShortcut.noShortcut': 'Please record a shortcut key first',

    // Shortcut categories
    'shortcut.category.general': 'General',
    'shortcut.category.navigation': 'Navigation',
    'shortcut.category.appearance': 'Appearance',
    'shortcut.category.terminal': 'Terminal',
    'shortcut.category.terminalTabs': 'Tabs',
    'shortcut.category.terminalPanes': 'Panes',
    'shortcut.category.editorBlocks': 'Blocks',

    // General shortcuts
    'shortcut.app.commandPalette': 'Open command palette',
    'shortcut.app.commandPalette.desc': 'Open the command search palette globally',
    'shortcut.app.newDocument': 'New document',
    'shortcut.app.newDocument.desc': 'Create a new document',
    'shortcut.app.toggleSidebar': 'Toggle sidebar',
    'shortcut.app.toggleSidebar.desc': 'Show or hide the sidebar',
    'shortcut.app.toggleOutline': 'Toggle outline',
    'shortcut.app.toggleOutline.desc': 'Show or hide the document outline',
    'shortcut.app.openSettings': 'Open settings',
    'shortcut.app.openSettings.desc': 'Open the application settings page',
    'shortcut.app.importMarkdown': 'Import Markdown',
    'shortcut.app.importMarkdown.desc': 'Import a document from a Markdown file',
    'shortcut.app.goToDocuments': 'Go to documents',
    'shortcut.app.goToDocuments.desc': 'Switch to the document list view',
    'shortcut.app.goToTerminal': 'Go to terminal',
    'shortcut.app.goToTerminal.desc': 'Switch to the terminal view',
    'shortcut.app.cycleTabLeft': 'Previous Tab',
    'shortcut.app.cycleTabLeft.desc': 'Switch to the previous tab',
    'shortcut.app.cycleTabRight': 'Next Tab',
    'shortcut.app.cycleTabRight.desc': 'Switch to the next tab',
    'shortcut.app.closeTab': 'Close Tab',
    'shortcut.app.closeTab.desc': 'Close the current tab',
    'shortcut.app.toggleDarkMode': 'Toggle dark mode',
    'shortcut.app.toggleDarkMode.desc': 'Switch between dark and light mode',
    'shortcut.app.setDarkTheme': 'Set dark theme',
    'shortcut.app.setDarkTheme.desc': 'Set the theme to dark',
    'shortcut.app.setLightTheme': 'Set light theme',
    'shortcut.app.setLightTheme.desc': 'Set the theme to light',
    'shortcut.app.setSystemTheme': 'Follow system theme',
    'shortcut.app.setSystemTheme.desc': 'Set the theme to follow the system',
    'shortcut.unbound': 'Unbound',

    // Terminal shortcuts
    'shortcut.terminal.newTab': 'New tab',
    'shortcut.terminal.closeTab': 'Close tab',
    'shortcut.terminal.cycleTabLeft': 'Switch to left tab',
    'shortcut.terminal.cycleTabRight': 'Switch to right tab',
    'shortcut.terminal.detachTab': 'Detach tab to new window',
    'shortcut.terminal.splitPane': 'Split pane',
    'shortcut.terminal.closePane': 'Close active pane only',
    'shortcut.terminal.focusPrevPane': 'Focus previous pane',
    'shortcut.terminal.focusNextPane': 'Focus next pane',
    'shortcut.terminal.cycleLayout': 'Cycle pane layout',
    'shortcut.terminal.movePane': 'Move pane position',

    // Editor shortcuts
    'shortcut.editor.insertBlockBelow': 'Insert block below',
    'shortcut.editor.insertBlockAbove': 'Insert block above',

    // Reference shortcuts (read-only)
    'shortcut.ref.editorFormatting': 'Editor formatting',
    'shortcut.ref.markdown': 'Markdown input',
    'shortcut.ref.bold': 'Bold',
    'shortcut.ref.italic': 'Italic',
    'shortcut.ref.underline': 'Underline',
    'shortcut.ref.strikethrough': 'Strikethrough',
    'shortcut.ref.inlineCode': 'Inline code',
    'shortcut.ref.undo': 'Undo',
    'shortcut.ref.redo': 'Redo',
    'shortcut.ref.selectAll': 'Select all',
    'shortcut.ref.heading1': 'Heading 1',
    'shortcut.ref.heading2': 'Heading 2',
    'shortcut.ref.heading3': 'Heading 3',
    'shortcut.ref.quote': 'Quote',
    'shortcut.ref.bulletList': 'Bullet list',
    'shortcut.ref.orderedList': 'Ordered list',
    'shortcut.ref.codeBlock': 'Code block',
    'shortcut.ref.divider': 'Divider',
  },
} as const;

// ──────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────

export type TranslationKey = keyof typeof translations.zh;

// ──────────────────────────────────────────────────────────────────
// Hook
// ──────────────────────────────────────────────────────────────────

/** Replaces {placeholders} in a string with provided values. */
function interpolate(str: string, vars?: Record<string, string | number>): string {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? `{${key}}`));
}

/**
 * React hook that returns a `t()` function bound to the current language.
 * Components using this hook will re-render when the language changes.
 */
export function useI18n() {
  const language = useStore((s) => s.language);
  const dict = translations[language];

  const t = (key: TranslationKey, vars?: Record<string, string | number>): string => {
    const value = dict[key] ?? translations.zh[key] ?? key;
    return interpolate(value, vars);
  };

  return { t, language };
}
