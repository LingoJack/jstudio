import { useState, useRef, useCallback, useEffect } from 'react';
import { Send, Square, Paperclip, X } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useI18n } from '../../lib/core/i18n';
import { storage } from '../../lib/core/storage';
import { ModelSelector } from './ModelSelector';
import { handleNativeSelectAll } from '../../lib/shortcuts/nativeSelectAll';
import type { AgentSession } from '../../types/agent';

interface InputAreaProps {
  session: AgentSession;
  onSend: (message: string, images?: { base64: string; mediaType: string }[]) => void;
  onCancel: () => void;
}

export function ChatInput({ session, onSend, onCancel }: InputAreaProps) {
  const { t } = useI18n();
  const [input, setInput] = useState('');
  const [images, setImages] = useState<{ base64: string; mediaType: string }[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const tabBarGlassOpacity = useStore((s) => s.tabBarGlassOpacity);
  const setAgentAutoApprove = useStore((s) => s.setAgentAutoApprove);

  // IME 合成状态（中文输入法选字时按 Enter 不应发送）- 仿 remote 的 composingRef
  const composingRef = useRef(false);

  const isRunning =
    session.runState !== 'idle' &&
    session.runState !== 'error' &&
    session.runState !== 'cancelled';

  // textarea 自动增高（上限 140px）- 仿 remote 的 autoResize
  const autoResize = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 140) + 'px';
  }, []);

  useEffect(() => {
    autoResize();
  }, [input, autoResize]);

  const handleSend = useCallback(() => {
    if (!input.trim() && images.length === 0) return;
    onSend(input.trim(), images.length > 0 ? images : undefined);
    setInput('');
    setImages([]);
    // 发送后重置高度
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) el.style.height = 'auto';
    });
  }, [input, images, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (handleNativeSelectAll(e)) return;
      // IME 合成中（中文/日文/韩文输入法选字）不触发发送
      if (composingRef.current || e.nativeEvent.isComposing || e.keyCode === 229) return;
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleFileSelect = useCallback(async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        multiple: true,
        filters: [
          { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'] },
          { name: 'All files', extensions: ['*'] },
        ],
      });

      if (!selected) return;
      const files = Array.isArray(selected) ? selected : [selected];

      for (const filePath of files) {
        try {
          const bytes = await storage.readFileBytes(filePath);
          const ext = filePath.split('.').pop()?.toLowerCase() || 'png';
          const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
          // Convert number[] to base64
          const uint8 = new Uint8Array(bytes);
          let binary = '';
          const chunkSize = 8192;
          for (let i = 0; i < uint8.length; i += chunkSize) {
            binary += String.fromCharCode(...uint8.slice(i, i + chunkSize));
          }
          const base64 = btoa(binary);
          setImages((prev) => [
            ...prev,
            { base64, mediaType: mime },
          ]);
        } catch (e) {
          console.error('Failed to read file:', e);
        }
      }
    } catch (e) {
      console.error('Failed to open file picker:', e);
    }
  }, []);

  const removeImage = useCallback((index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  return (
    <div className="shrink-0 px-4 pb-3">
      <div
        className="relative rounded-2xl border border-[var(--vscode-menu-border)]"
        style={{
          background: `rgba(255,255,255,${tabBarGlassOpacity})`,
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        }}
      >
        {/* 图片预览 */}
        {images.length > 0 && (
          <div className="flex flex-wrap gap-2 px-4 pt-3">
            {images.map((img, i) => (
              <div key={i} className="relative group">
                <img
                  src={`data:${img.mediaType};base64,${img.base64}`}
                  alt=""
                  className="w-16 h-16 rounded-lg object-cover"
                />
                <button
                  onClick={() => removeImage(i)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{
                    background: 'var(--vscode-button-background)',
                    color: 'var(--vscode-button-foreground)',
                  }}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 输入框 */}
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={() => {
            composingRef.current = false;
          }}
          placeholder={isRunning ? t('agent.appendMessage') : t('agent.inputPlaceholder')}
          rows={1}
          className="w-full resize-none bg-transparent px-4 py-3 text-sm outline-none overflow-y-auto"
          style={{
            color: 'var(--vscode-input-foreground)',
            minHeight: '40px',
            maxHeight: '140px',
          }}
        />

        {/* 底部状态栏 */}
        <div
          className="flex items-center justify-between px-4 py-2 text-xs"
          style={{ color: 'var(--vscode-descriptionForeground)' }}
        >
          <div className="flex items-center gap-2">
            <ModelSelector />
            {/* 文件选择按钮 */}
            <button
              onClick={handleFileSelect}
              className="flex items-center gap-1 px-2 py-1 rounded-lg transition-colors hover:bg-[var(--vscode-list-hoverBackground)]"
              title={t('agent.reference')}
            >
              <Paperclip className="w-3.5 h-3.5" />
            </button>
            {/* 隐藏的文件输入 */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const files = e.target.files;
                if (!files) return;
                for (let i = 0; i < files.length; i++) {
                  const file = files[i];
                  const reader = new FileReader();
                  reader.onload = () => {
                    const result = reader.result as string;
                    const base64 = result.split(',')[1];
                    setImages((prev) => [
                      ...prev,
                      { base64, mediaType: file.type || 'image/png' },
                    ]);
                  };
                  reader.readAsDataURL(file);
                }
                e.target.value = '';
              }}
            />
            {/* 自动批准开关 - 可点击切换（仿 remote 的 autoApprove switch） */}
            <button
              onClick={() => setAgentAutoApprove(session.id, !session.autoApprove)}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg transition-colors hover:bg-[var(--vscode-list-hoverBackground)]"
              title={t('agent.autoApprove')}
            >
              <span
                className="relative inline-block w-6 h-3.5 rounded-full transition-colors"
                style={{
                  background: session.autoApprove
                    ? 'var(--vscode-button-background)'
                    : 'var(--vscode-input-background)',
                  border: '1px solid var(--vscode-widget-border)',
                }}
              >
                <span
                  className="absolute top-[1px] w-2.5 h-2.5 rounded-full transition-all"
                  style={{
                    left: session.autoApprove ? '12px' : '1px',
                    background: session.autoApprove
                      ? 'var(--vscode-button-foreground)'
                      : 'var(--vscode-descriptionForeground)',
                  }}
                />
              </span>
              <span>
                {session.autoApprove ? t('agent.autoApproveOn') : t('agent.autoApproveOff')}
              </span>
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] opacity-40 hidden sm:inline">{t('agent.hintKeys')}</span>
            {isRunning && (
              <button
                onClick={onCancel}
                className="flex items-center gap-1 px-2 py-1 rounded-lg transition-colors hover:bg-[rgba(255,255,255,0.1)]"
                style={{ color: 'var(--vscode-errorForeground)' }}
              >
                <Square className="w-3 h-3" />
                <span>{t('agent.cancel')}</span>
              </button>
            )}
            <button
              onClick={handleSend}
              disabled={!input.trim() && images.length === 0}
              className="flex items-center justify-center w-8 h-8 rounded-full transition-all disabled:opacity-30 hover:opacity-90"
              style={{
                background: input.trim() || images.length > 0
                  ? 'var(--vscode-button-background)'
                  : 'rgba(255,255,255,0.08)',
                color: input.trim() || images.length > 0
                  ? 'var(--vscode-button-foreground)'
                  : 'var(--vscode-descriptionForeground)',
                boxShadow: input.trim() || images.length > 0
                  ? '0 0 12px var(--vscode-button-background)'
                  : 'none',
              }}
              title={t('agent.send')}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
