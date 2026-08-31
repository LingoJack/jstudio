/**
 * aiGraph barrel — AI 生成图表功能的统一出口。
 *
 * 调用方只需从此处导入；内部模块组织见各文件头部注释。
 * 仅导出外部（对话框）需要的符号，避免 knip 报未用导出。
 */

export { generateGraphFromAI } from './aiGraphGenerator';
export type { AiGraphErrorCode } from './aiGraphGenerator';
export { buildExamplePromptForClipboard } from './aiGraphPrompt';
