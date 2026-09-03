/** 页面路由（与 app.config.ts 的 pages 一致）。 */
export const PAGE_DOCUMENTS = '/pages/documents/index'
export const PAGE_LOGIN = '/pages/login/index'
export const PAGE_VIEWER = '/pages/viewer/index'
export const PAGE_HISTORY = '/pages/history/index'

/** viewer 页分批渲染：每批块数。backend 快照 body 上限 8MiB，一次 setData 全量
 *  渲染会撞小程序 1MB 传输上限，先渲染首批再按需追加。 */
export const VIEWER_CHUNK_SIZE = 50

/** 历史快照列表一次拉取条数（backend 上限 200）。 */
export const SNAPSHOT_LIST_LIMIT = 50

/** Taro.openDocument 支持的文件类型（微信官方枚举），从扩展名推导。 */
export const OPEN_DOCUMENT_FILE_TYPES = [
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'pdf',
] as const

/** 通用提示时长（毫秒）。 */
export const TOAST_DURATION_MS = 2000

/** viewer URL 参数名。 */
export const PARAM_DOC_ID = 'docId'
export const PARAM_TITLE = 'title'
export const PARAM_REVISION = 'revision'
