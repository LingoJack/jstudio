import type { ReactNode } from 'react'
import { FileText, FolderOpen } from '../../../Icon'

export function EmptyState({ onOpenRoot }: { onOpenRoot: () => void }) {
  const isMac = navigator.platform.toLowerCase().includes('mac')
  const mod = isMac ? '⌘' : 'Ctrl'

  return (
    <div className="h-full bg-seeyue-bg text-seeyue-fg-dim">
      <div className="mx-auto flex h-full max-w-[860px] flex-col justify-center px-16 pb-16">
        <div className="mb-8 flex items-center gap-3 text-seeyue-fg-strong">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-seeyue-border bg-seeyue-panel text-seeyue-accent">
            <FileText size={20} />
          </span>
          <div>
            <div className="text-[24px] font-semibold tracking-[-0.02em]">J Reader</div>
            <div className="mt-1 text-[13px] font-normal text-seeyue-fg-muted">
              选择左侧 Explorer 中的文件开始阅读或编辑
            </div>
          </div>
        </div>

        <div className="mb-7">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-md border border-seeyue-border bg-seeyue-panel px-4 py-2 text-[13px] font-medium text-seeyue-fg-strong cursor-pointer transition-all duration-150 hover:border-seeyue-accent hover:text-seeyue-accent"
            onClick={onOpenRoot}
          >
            <FolderOpen size={15} />
            打开文件夹…
          </button>
        </div>

        <div className="grid max-w-[640px] gap-7 md:grid-cols-2">
          <WelcomeSection title="开始">
            <WelcomeAction label="从 Explorer 打开文件" hint="点击左侧文件树" />
            <WelcomeAction label="打开 / 切换工具面板" hint={`${mod} 2`} />
            <WelcomeAction label="切回文件面板" hint={`${mod} 1`} />
            <WelcomeAction label="切换侧边栏" hint={`${mod} B`} />
          </WelcomeSection>
          <WelcomeSection title="编辑器快捷键">
            <WelcomeAction label="保存当前文件" hint={`${mod} S`} />
            <WelcomeAction label="关闭当前编辑器" hint={`${mod} W`} />
            <WelcomeAction label="切换前后 Tab" hint={`${mod} Alt ←/→`} />
            <WelcomeAction label="Diff 对比" hint={`${mod} D`} />
          </WelcomeSection>
        </div>
      </div>
    </div>
  )
}

function WelcomeSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-seeyue-fg-dim">
        {title}
      </h2>
      <div className="grid gap-1.5">{children}</div>
    </section>
  )
}

function WelcomeAction({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="group flex min-h-8 items-center justify-between gap-4 rounded-md px-2 py-1.5 text-[13px] text-seeyue-fg-muted transition-colors hover:bg-seeyue-elevated hover:text-seeyue-fg">
      <span>{label}</span>
      <kbd className="shrink-0 rounded border border-seeyue-border bg-seeyue-panel px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-[11px] text-seeyue-fg-dim shadow-[inset_0_-1px_0_var(--color-seeyue-border)]">
        {hint}
      </kbd>
    </div>
  )
}
