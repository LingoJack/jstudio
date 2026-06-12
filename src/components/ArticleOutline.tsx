import React from 'react';
import { Document } from '../types';
import { AlignLeft, ListTree } from 'lucide-react';

interface ArticleOutlineProps {
  document: Document;
}

export default function ArticleOutline({ document }: ArticleOutlineProps) {
  const headings = document.blocks.filter(
    (block) =>
      block.type === 'heading-1' || block.type === 'heading-2' || block.type === 'heading-3'
  );

  const handleHeadingClick = (blockId: string) => {
    const el = window.document.getElementById(`block-row-${blockId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('bg-[#0e639c]/10');
      setTimeout(() => {
        el.classList.remove('bg-[#0e639c]/10');
      }, 1000);
    }
  };

  return (
    <div className="w-full h-full flex flex-col p-2 bg-[#f3f3f3] dark:bg-[#252526] select-none">
      <div className="flex items-center justify-between mb-2 px-1.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
          <AlignLeft className="w-3.5 h-3.5 text-slate-500" />
          <span>大纲</span>
        </div>
        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
          {headings.length}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto pr-0.5">
        {headings.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-1.5 text-center rounded-sm border border-dashed border-slate-300 dark:border-white/[0.08] bg-white dark:bg-[#2d2d2d] px-3 py-6">
            <ListTree className="w-4 h-4 text-slate-400 dark:text-slate-500" />
            <span className="text-[10px] text-slate-500 dark:text-slate-400">暂无标题</span>
            <span className="text-[9px] text-slate-400 dark:text-slate-500 leading-relaxed">
              添加 H1 / H2 / H3 后会在这里生成导航
            </span>
          </div>
        ) : (
          <div className="space-y-0 text-xs">
            {headings.map((heading) => {
              let indentClass = 'font-medium text-slate-700 dark:text-slate-200 pl-1.5';
              if (heading.type === 'heading-2') {
                indentClass = 'pl-4 text-slate-600 dark:text-slate-300';
              } else if (heading.type === 'heading-3') {
                indentClass = 'pl-7 text-slate-500 dark:text-slate-400';
              }

              return (
                <button
                  key={heading.id}
                  onClick={() => handleHeadingClick(heading.id)}
                  className={`group cursor-pointer w-full text-left truncate flex items-center border-l-2 border-transparent py-1 pr-2 transition-colors duration-150 hover:bg-[#e8e8e8] dark:hover:bg-white/[0.06] hover:text-[#0e639c] dark:hover:text-[#4fc3f7] hover:border-[#0e639c] relative ${indentClass}`}
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
