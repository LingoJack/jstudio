import { useEffect, useRef, useState } from 'react'
import { CheckCircle, Files, Settings, Toolbox as ToolboxIcon } from './Icon'

/**
 * VS Code 风的最左侧"活动栏"。
 *
 * 顶部负责文件 / 工具箱视图切换，底部保留 Reader 设置入口。设置入口是通用菜单，
 * 当前暴露颜色主题配置和编辑器字体大小偏好。
 */
export type ActivityKey = 'files' | 'toolbox'
export type ReaderTheme = 'aliyun' | 'warm'

interface Props {
  active: ActivityKey
  theme: ReaderTheme
  fontScale: number
  onSelect: (key: ActivityKey) => void
  onThemeChange: (theme: ReaderTheme) => void
  onFontScaleChange: (scale: number) => void
}

interface ItemDef {
  key: ActivityKey
  title: string
  Icon: typeof Files
}

const ITEMS: ItemDef[] = [
  { key: 'files', title: '文件 (⌘1)', Icon: Files },
  { key: 'toolbox', title: '工具箱 (⌘2)', Icon: ToolboxIcon },
]

const THEME_OPTIONS: Array<{ key: ReaderTheme; label: string; desc: string }> = [
  { key: 'aliyun', label: 'Aliyun Light', desc: '白底、轻边框，适合文档阅读' },
  { key: 'warm', label: 'Seeyue Warm', desc: '暖色纸张感，适合长时间编辑' },
]

const FONT_SCALE_STEP = 0.1
const FONT_SCALE_MIN = 0.7
const FONT_SCALE_MAX = 2.0

export function ActivityBar({
  active,
  theme,
  fontScale,
  onSelect,
  onThemeChange,
  onFontScaleChange,
}: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settingsRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!settingsOpen) return

    function closeOnOutsideClick(e: PointerEvent) {
      const target = e.target
      if (!(target instanceof Node)) return
      if (!settingsRef.current?.contains(target)) {
        setSettingsOpen(false)
      }
    }

    function closeOnEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setSettingsOpen(false)
      }
    }

    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [settingsOpen])

  const fontPercent = Math.round(fontScale * 100)

  return (
    <nav
      className="relative flex flex-col items-center gap-1 py-2 bg-seeyue-bg-deep border-r border-seeyue-border"
      aria-label="侧栏切换"
    >
      {ITEMS.map(({ key, title, Icon }) => (
        <button
          key={key}
          type="button"
          className="relative inline-flex items-center justify-center w-10 h-10 rounded-none bg-transparent border-0 text-seeyue-fg-dim cursor-pointer transition-colors duration-150 hover:text-seeyue-fg-strong hover:bg-seeyue-elevated focus-visible:outline-2 focus-visible:outline-seeyue-accent focus-visible:outline-offset-[-2px] data-[active=true]:text-seeyue-accent before:content-[''] before:absolute before:left-0 before:top-2 before:bottom-2 before:w-0.5 before:rounded-r before:bg-transparent before:transition-colors before:duration-150 data-[active=true]:before:bg-seeyue-accent"
          data-active={key === active ? 'true' : undefined}
          title={title}
          aria-label={title}
          onClick={() => onSelect(key)}
        >
          <Icon size={20} />
        </button>
      ))}

      <div ref={settingsRef} className="mt-auto relative">
        <button
          type="button"
          className="relative inline-flex items-center justify-center w-10 h-10 rounded-none bg-transparent border-0 text-seeyue-fg-dim cursor-pointer transition-colors duration-150 hover:text-seeyue-fg-strong hover:bg-seeyue-elevated focus-visible:outline-2 focus-visible:outline-seeyue-accent focus-visible:outline-offset-[-2px] data-[open=true]:text-seeyue-accent data-[open=true]:bg-seeyue-elevated"
          data-open={settingsOpen ? 'true' : undefined}
          title="设置"
          aria-label="打开 Reader 设置"
          aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen((open) => !open)}
        >
          <Settings size={20} />
        </button>

        {settingsOpen && (
          <div
            className="absolute left-[44px] bottom-0 z-30 w-[300px] rounded-md border border-seeyue-border bg-seeyue-panel shadow-[0_12px_34px_rgba(15,23,42,0.14)] overflow-hidden animate-seeyue-scale-in"
            role="menu"
            aria-label="Reader 设置"
          >
            <div className="px-3 py-2 border-b border-seeyue-border bg-seeyue-bg-deep text-[12px] font-semibold text-seeyue-fg-strong">
              设置
            </div>
            <div className="p-2">
              {/* —— 颜色主题 —— */}
              <div className="px-2 py-1.5 text-[11px] font-semibold tracking-[0.08em] uppercase text-seeyue-fg-dim">
                颜色主题
              </div>
              <div className="grid gap-0.5" role="group" aria-label="颜色主题">
                {THEME_OPTIONS.map((item) => {
                  const selected = item.key === theme
                  return (
                    <button
                      key={item.key}
                      type="button"
                      className="w-full flex items-start gap-2.5 rounded px-2.5 py-2 text-left cursor-pointer border-0 bg-transparent transition-colors duration-150 hover:bg-seeyue-elevated data-[selected=true]:bg-seeyue-accent-soft"
                      data-selected={selected ? 'true' : undefined}
                      role="menuitemradio"
                      aria-checked={selected}
                      onClick={() => onThemeChange(item.key)}
                    >
                      <span className="mt-0.5 inline-flex h-4 w-4 items-center justify-center text-seeyue-accent">
                        {selected ? <CheckCircle size={14} /> : null}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[13px] font-medium text-seeyue-fg-strong">
                          {item.label}
                        </span>
                        <span className="block text-[12px] leading-5 text-seeyue-fg-muted">
                          {item.desc}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>

              {/* —— 字体大小 —— */}
              <div className="mt-2 pt-2 border-t border-seeyue-border">
                <div className="px-2 py-1.5 text-[11px] font-semibold tracking-[0.08em] uppercase text-seeyue-fg-dim">
                  编辑器字体
                </div>
                <div className="flex items-center gap-2 px-2.5 py-2">
                  <button
                    type="button"
                    className="inline-flex items-center justify-center w-7 h-7 rounded border border-seeyue-border bg-transparent text-seeyue-fg-muted cursor-pointer transition-colors duration-150 hover:text-seeyue-fg-strong hover:bg-seeyue-elevated disabled:opacity-30 disabled:cursor-not-allowed"
                    disabled={fontScale <= FONT_SCALE_MIN}
                    onClick={() => onFontScaleChange(fontScale - FONT_SCALE_STEP)}
                    aria-label="减小字体"
                  >
                    <span className="text-[16px] leading-none select-none">−</span>
                  </button>
                  <span className="flex-1 text-center text-[13px] font-medium text-seeyue-fg-strong tabular-nums">
                    {fontPercent}%
                  </span>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center w-7 h-7 rounded border border-seeyue-border bg-transparent text-seeyue-fg-muted cursor-pointer transition-colors duration-150 hover:text-seeyue-fg-strong hover:bg-seeyue-elevated disabled:opacity-30 disabled:cursor-not-allowed"
                    disabled={fontScale >= FONT_SCALE_MAX}
                    onClick={() => onFontScaleChange(fontScale + FONT_SCALE_STEP)}
                    aria-label="增大字体"
                  >
                    <span className="text-[16px] leading-none select-none">+</span>
                  </button>
                  {fontScale !== 1.0 && (
                    <button
                      type="button"
                      className="inline-flex items-center justify-center h-7 px-2 rounded border border-seeyue-border bg-transparent text-[11px] text-seeyue-fg-dim cursor-pointer transition-colors duration-150 hover:text-seeyue-fg-strong hover:bg-seeyue-elevated"
                      onClick={() => onFontScaleChange(1.0)}
                      aria-label="重置字体大小"
                    >
                      重置
                    </button>
                  )}
                </div>
                <div className="px-2.5 pb-1 text-[11px] text-seeyue-fg-dim">
                  范围 70% – 200%，使用 CSS 变量 --jreader-font-scale 控制
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}
