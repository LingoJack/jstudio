import type { PageDocument } from '../editor/block-model'

interface Props {
  page: PageDocument
  workspaceName: string
  onTitleChange: (title: string) => void
  onSave: () => void
  onShowInFolder: () => void
}

function countWords(source: string): number {
  const zh = source.match(/[\u4e00-\u9fa5]/g)?.length ?? 0
  const en = source.match(/[a-zA-Z0-9_]+/g)?.length ?? 0
  return zh + en
}

export function PageHeader({ page, workspaceName, onTitleChange, onSave, onShowInFolder }: Props) {
  return (
    <section className="studio-page-header">
      <div className="studio-breadcrumb">
        <span>{workspaceName}</span>
        <span>/</span>
        <span>{page.title || '未命名文档'}</span>
      </div>
      <div className="studio-page-cover">
        <span className="studio-page-icon">文</span>
        <div className="studio-page-meta">
          <span>{page.dirty ? '有未保存改动' : '已保存到本地'}</span>
          <span>{countWords(page.source)} 字</span>
          <span>{page.sourceFormat.toUpperCase()} 兼容</span>
        </div>
      </div>
      <div className="studio-title-row">
        <textarea
          value={page.title}
          rows={1}
          placeholder="未命名文档"
          onChange={(event) => onTitleChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.preventDefault()
          }}
        />
        <div className="studio-header-actions">
          <button type="button" className="studio-secondary-button" onClick={onShowInFolder}>
            定位
          </button>
          <button
            type="button"
            className="studio-primary-button"
            onClick={onSave}
            disabled={page.saving === 'saving'}
          >
            {page.saving === 'saving' ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </section>
  )
}
