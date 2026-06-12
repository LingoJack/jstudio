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
      el.classList.add('bg-indigo-500/10');
      setTimeout(() => {
        el.classList.remove('bg-indigo-500/10');
      }, 1000);
    }
  };

  return (
    <div className="w-full h-full flex flex-col p-3 bg-slate-50/50 dark:bg-white/[0.015] select-none animate-in fade-in slide-in-from-right-2 duration-200">
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
          <AlignLeft className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
          <span>文章大纲</span>
        </div>
        <span className="text-[10px] text-slate-400 dark:text-slate-600 font-mono">
          {headings.length}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto pr-1">
        {headings.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-center rounded-2xl border border-dashed border-slate-200 dark:border-white/[0.06] bg-white/50 dark:bg-white/[0.02] px-4">
            <ListTree className="w-5 h-5 text-slate-300 dark:text-slate-700" />
            <span className="text-xs text-slate-400">暂无标题</span>
            <span className="text-[10px] text-slate-300 dark:text-slate-600 leading-relaxed">
              添加 H1 / H2 / H3 后会在这里生成导航
            </span>
          </div>
        ) : (
          <div className="space-y-1 text-xs">
            {headings.map((heading) => {
              let indentClass = 'font-semibold text-slate-700 dark:text-slate-300 pl-2';
              if (heading.type === 'heading-2') {
                indentClass = 'pl-5 font-medium text-slate-500 dark:text-slate-400';
              } else if (heading.type === 'heading-3') {
                indentClass = 'pl-8 text-slate-400 dark:text-slate-500';
              }

              return (
                <button
                  key={heading.id}
                  onClick={() => handleHeadingClick(heading.id)}
                  className={`group cursor-pointer w-full text-left truncate flex items-center rounded-xl py-2 pr-2 transition-all duration-150 hover:bg-white dark:hover:bg-white/[0.04] hover:text-indigo-600 dark:hover:text-indigo-300 hover:shadow-sm active:scale-[0.98] relative ${indentClass}`}
                  title={heading.content || '未命名'}
                >
                  <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity duration-150" />
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
