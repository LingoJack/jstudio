import appIcon from '../../assets/app-icon.png';
import { Github, Mail } from 'lucide-react';
import { useI18n } from '../../lib/i18n';

export default function AboutSection() {
  const { t } = useI18n();

  return (
    <div className="space-y-8">
      {/* ── Hero ── */}
      <div className="flex flex-col items-center gap-5 pt-8 pb-4">
        <img
          src={appIcon}
          alt="JStudio"
          className="w-32 h-32 rounded-2xl shrink-0 object-cover"
        />
        <h1 className="text-2xl font-bold tracking-tight text-[var(--vscode-foreground)]">
          JStudio
        </h1>
        <span className="px-3 py-1 rounded-full text-sm font-medium bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)]">
          v{__APP_VERSION__}
        </span>
      </div>

      {/* ── Links ── */}
      <div className="border-t border-[var(--vscode-sideBar-border)] pt-6 space-y-2">
        <a
          href="https://github.com/LingoJack/jcli"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors duration-150 cursor-pointer"
        >
          <Github className="w-5 h-5 opacity-70 shrink-0" />
          <span className="opacity-70">GitHub</span>
          <span className="ml-auto truncate font-mono opacity-90">
            LingoJack/jcli
          </span>
        </a>
        <a
          href="mailto:lingojack@qq.com"
          className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors duration-150 cursor-pointer"
        >
          <Mail className="w-5 h-5 opacity-70 shrink-0" />
          <span className="opacity-70">{t('about.contactAuthor')}</span>
          <span className="ml-auto truncate font-mono opacity-90">
            lingojack@qq.com
          </span>
        </a>
      </div>
    </div>
  );
}
