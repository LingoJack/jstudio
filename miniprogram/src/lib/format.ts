/** 展示格式化工具（列表页 / 块渲染共用）。 */

/** KB / MB 换算阈值。 */
const SIZE_KB = 1024
const SIZE_MB = 1024 * 1024

/** 文件大小：B / KB / MB。 */
export function formatSize(bytes: number | undefined): string {
  if (bytes === undefined) {
    return ''
  }
  if (bytes >= SIZE_MB) {
    return `${(bytes / SIZE_MB).toFixed(1)} MB`
  }
  if (bytes >= SIZE_KB) {
    return `${Math.round(bytes / SIZE_KB)} KB`
  }
  return `${bytes} B`
}

/** RFC3339 → 'YYYY-MM-DD HH:mm'（本地时区）。解析失败原样返回。 */
export function formatDateTime(iso: string | undefined): string {
  if (!iso) {
    return ''
  }
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) {
    return iso
  }
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
