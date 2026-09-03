/**
 * JStudio Block 文档模型（只读子集）。
 *
 * 与 desktop/src/types/document.ts、desktop/src/types/richText.ts 同源，
 * 去掉了 TipTap 依赖（rawContent / collapsibleChildren 用 unknown[] 保管，
 * 渲染时经 flattenTiptapText 降级抽取文本）。字段结构改动需双向同步。
 */

/** 行内格式注解（Notion 风格分段富文本）。 */
export interface RichTextAnnotations {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strikethrough?: boolean
  /** 行内代码。 */
  code?: boolean
  /** CSS 颜色值（通常是 #hex；'default' 表示继承）。 */
  color?: string
  /** 链接 URL。 */
  href?: string
}

/** 单段带注解的文本。 */
export interface RichText {
  text: string
  annotations: RichTextAnnotations
}

export type BlockType =
  | 'text'
  | 'heading-1'
  | 'heading-2'
  | 'heading-3'
  | 'heading-4'
  | 'heading-5'
  | 'heading-6'
  | 'quote'
  | 'code'
  | 'image'
  | 'file'
  | 'table'
  | 'bullet-list'
  | 'ordered-list'
  | 'todo-list'
  | 'divider'
  | 'collapsible'
  | 'link'
  | 'diagram'
  | 'math'

export interface Block {
  id: string
  type: BlockType
  /**
   * - 文本类块（text / heading-N / quote）：RichText[]
   * - code 块：RichText[]，content[0].text 是源码
   * - image 块：资源路径（'assets/<fileName>'）或 URL / base64
   */
  content: RichText[] | string
  children?: string[]
  properties?: BlockProperties
}

/** 单元格：每段是一个 RichText[]。 */
export interface TableCellData {
  content: RichText[][]
  /** 桌面端保真 TipTap JSON（含列表等块级内容时存在），本端降级抽文本。 */
  rawContent?: unknown[]
  colspan?: number
  rowspan?: number
  align?: 'left' | 'center' | 'right'
  vAlign?: 'top' | 'middle' | 'bottom'
  colwidth?: number[]
}

export interface TableRowData {
  isHeader: boolean
  cells: TableCellData[]
}

export interface TableData {
  rows: TableRowData[]
  collapsed?: boolean
}

export interface TodoItemData {
  checked: boolean
  richText: RichText[]
  children?: TodoItemData[]
}

export interface ListItemData {
  content: RichText[]
  children?: ListItemData[]
}

export interface BlockProperties {
  // code
  language?: string
  codeCollapsed?: boolean
  codeTitle?: string
  // image
  caption?: string
  imageType?: 'url' | 'base64' | 'asset'
  widthPct?: number
  heightPct?: number
  align?: 'left' | 'center'
  // file
  fileType?: string
  fileName?: string
  fileSize?: number
  // table
  tableData?: TableData
  // collapsible
  collapsibleOpen?: boolean
  collapsibleSummary?: string
  /** TipTap JSONContent[]，降级抽文本。 */
  collapsibleChildren?: unknown[]
  // list / todo
  listItems?: ListItemData[]
  todoItems?: TodoItemData[]
  // link
  linkUrl?: string
  linkTitle?: string
  linkDescription?: string
  linkFavicon?: string
  linkOgImage?: string
  linkSiteName?: string
  // diagram
  diagramSnapshot?: string
  // math
  mathLatex?: string
}
