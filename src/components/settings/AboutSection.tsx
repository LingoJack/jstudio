import appIcon from '../../assets/app-icon.png';
import { Github, Mail } from 'lucide-react';

export default function AboutSection() {
  return (
    <div className="space-y-6">
      {/* ── Hero ── */}
      <div className="flex flex-col items-center gap-4 pt-6 pb-2">
        <img
          src={appIcon}
          alt="JStudio"
          className="w-32 h-32 rounded-2xl shrink-0 object-cover"
        />
        <h1 className="text-xl font-bold tracking-tight text-[var(--vscode-foreground)]">
          JStudio
        </h1>
        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)]">
          v{__APP_VERSION__}
        </span>
      </div>

      {/* ── Links ── */}
      <div className="border-t border-[var(--vscode-sideBar-border)] pt-4 space-y-1">
        <a
          href="https://github.com/LingoJack/jcli"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 px-3 py-2.5 rounded text-xs text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors duration-150 cursor-pointer"
        >
          <Github className="w-4 h-4 opacity-70 shrink-0" />
          <span className="opacity-70">GitHub</span>
          <span className="ml-auto truncate font-mono opacity-90">
            LingoJack/jcli
          </span>
        </a>
        <a
          href="mailto:lingojack@qq.com"
          className="flex items-center gap-3 px-3 py-2.5 rounded text-xs text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors duration-150 cursor-pointer"
        >
          <Mail className="w-4 h-4 opacity-70 shrink-0" />
          <span className="opacity-70">联系作者</span>
          <span className="ml-auto truncate font-mono opacity-90">
            lingojack@qq.com
          </span>
        </a>
      </div>
    </div>
  );
}
