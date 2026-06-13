import { useStore } from '../store/useStore';
import { AlignLeft, ListTree } from 'lucide-react';

export default function ArticleOutline() {
  const activeDoc = useStore((s) => s.activeDoc);

  const headings = activeDoc
    ? activeDoc.blocks.filter(
        (block) =>
          block.type === 'heading-1' ||
          block.type === 'heading-2' ||
          block.type === 'heading-3',
      )
    : [];

  const handleHeadingClick = (blockId: string) => {
    const el = window.document.getElementById(`block-row-${blockId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.style.transition = 'background-color 0.3s';
      el.style.backgroundColor = 'var(--vscode-list-activeSelectionBackground)';
      setTimeout(() => {
        el.style.backgroundColor = '';
      }, 1000);
    }
  };

  return (
    <div className="w-full h-full flex flex-col p-2 bg-[var(--vscode-sideBar-background)] select-none">
      <div className="flex items-center justify-between mb-2 px-1.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--vscode-sideBarTitle-foreground)] uppercase tracking-wide">
          <AlignLeft className="w-3.5 h-3.5 text-[var(--vscode-descriptionForeground)]" />
          <span>大纲</span>
        </div>
        <span className="text-[10px] text-[var(--vscode-descriptionForeground)] font-mono">
          {headings.length}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto pr-0.5">
        {headings.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-1.5 text-center rounded-sm border border-dashed border-[var(--vscode-widget-border)] bg-[var(--vscode-editor-background)] px-3 py-6">
            <ListTree className="w-4 h-4 text-[var(--vscode-descriptionForeground)] opacity-60" />
            <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">暂无标题</span>
            <span className="text-[9px] text-[var(--vscode-descriptionForeground)] opacity-70 leading-relaxed">
              添加 H1 / H2 / H3 后会在这里生成导航
            </span>
          </div>
        ) : (
          <div className="space-y-0 text-xs">
            {headings.map((heading) => {
              let indentClass = 'font-medium text-[var(--vscode-foreground)] pl-1.5';
              if (heading.type === 'heading-2') {
                indentClass = 'pl-4 text-[var(--vscode-foreground)] opacity-90';
              } else if (heading.type === 'heading-3') {
                indentClass = 'pl-7 text-[var(--vscode-descriptionForeground)]';
              }

              return (
                <button
                  key={heading.id}
                  onClick={() => handleHeadingClick(heading.id)}
                  className={`group cursor-pointer w-full text-left truncate flex items-center border-l-2 border-transparent py-1 pr-2 transition-colors duration-150 hover:bg-[var(--vscode-list-hoverBackground)] hover:text-[var(--vscode-list-activeSelectionForeground)] hover:border-[var(--vscode-list-activeSelectionBackground)] relative ${indentClass}`}
                  title={heading.content || '未命名'}
                >
                  <span className="truncate">
                    {heading.content ? heading.content : <span className="opacity-50">未命名</span>}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
