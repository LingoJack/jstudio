import React, { useEffect, useRef, useState, useCallback } from 'react';
import Prism from 'prismjs';
import { Copy, Check, Eye, Code } from 'lucide-react';

import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-markup';

// Resolve language alias to canonical Prism name
function resolveLanguage(lang: string): string {
  const normalized = lang.toLowerCase().trim();
  const aliases: Record<string, string> = {
    js: 'javascript', node: 'javascript', nodejs: 'javascript',
    ts: 'typescript',
    py: 'python',
    shell: 'bash', sh: 'bash', zsh: 'bash', terminal: 'bash', cmd: 'bash',
    scss: 'css', sass: 'css', less: 'css',
    md: 'markdown',
    yml: 'yaml',
    rs: 'rust',
    golang: 'go',
    'c++': 'cpp', cxx: 'cpp',
    mysql: 'sql', postgresql: 'sql', postgres: 'sql',
    htmlmarkup: 'markup', html: 'markup', htm: 'markup', xml: 'markup',
    plain: 'text', plaintext: 'text',
  };
  return aliases[normalized] ?? normalized;
}

function hasLanguage(lang: string): boolean {
  const canonical = resolveLanguage(lang);
  return canonical === 'text' || Prism.languages[canonical] !== undefined;
}

interface CodeBlockProps {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
  editable?: boolean;
  onChange?: (code: string) => void;
  onLanguageChange?: (language: string) => void;
  className?: string;
}

const CodeBlock: React.FC<CodeBlockProps> = ({
  code,
  language = 'text',
  showLineNumbers = true,
  editable = false,
  onChange,
  onLanguageChange,
  className = '',
}) => {
  const [selectedLanguage, setSelectedLanguage] = useState<string>(language);
  const [copied, setCopied] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const codeRef = useRef<HTMLElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editScrollRef = useRef<HTMLDivElement>(null);

  const isHtml = resolveLanguage(selectedLanguage) === 'markup';

  useEffect(() => {
    if (!isHtml) setShowPreview(false);
  }, [isHtml]);

  useEffect(() => {
    setSelectedLanguage(language);
  }, [language]);

  // Re-highlight whenever code or language changes (only in view mode)
  useEffect(() => {
    if (codeRef.current && !isEditing && !showPreview) {
      const lang = resolveLanguage(selectedLanguage);
      const finalLang = hasLanguage(selectedLanguage) ? lang : 'text';
      codeRef.current.className = `language-${finalLang}`;
      codeRef.current.textContent = code;
      Prism.highlightElement(codeRef.current);
    }
  }, [code, selectedLanguage, isEditing, showPreview]);

  // Auto-focus textarea when entering edit mode
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      // Place cursor at end
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
    }
  }, [isEditing]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = code;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  const lines = code.split('\n');
  const lineCount = lines.length;

  return (
    <div className={`code-block-container group/code relative ${className}`}>
      {/* Floating toolbar — top-right, appears on hover */}
      <div className="absolute top-2 right-2 z-20 flex items-center gap-0.5 opacity-0 group-hover/code:opacity-100 transition-opacity duration-150">
        {isHtml && (
          <button
            onClick={() => {
              setShowPreview((v) => !v);
              setIsEditing(false);
            }}
            className={`p-1.5 rounded-md transition-colors backdrop-blur-sm ${
              showPreview
                ? 'text-[var(--vscode-foreground)] bg-[var(--vscode-toolbar-hoverBackground)]'
                : 'text-[var(--vscode-icon-foreground)] hover:bg-[var(--vscode-toolbar-hoverBackground)]'
            }`}
            title={showPreview ? '返回代码' : '渲染预览'}
          >
            {showPreview ? <Code className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        )}
        <button
          onClick={handleCopy}
          className="p-1.5 rounded-md hover:bg-[var(--vscode-toolbar-hoverBackground)] text-[var(--vscode-icon-foreground)] transition-colors backdrop-blur-sm"
          title={copied ? '已复制' : '复制'}
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-green-500" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* Language tag — top-left, always visible as a subtle badge */}
      <input
        type="text"
        value={selectedLanguage}
        onChange={(e) => {
          setSelectedLanguage(e.target.value);
          onLanguageChange?.(e.target.value);
        }}
        placeholder="语言"
        className="absolute top-2 left-3 z-20 text-xs font-mono bg-transparent border-none outline-none text-[var(--vscode-editorLineNumber-foreground)] focus:text-[var(--vscode-foreground)] w-24 transition-colors placeholder:opacity-40"
      />

      {/* --- Code area: edit mode (textarea) --- */}
      {!showPreview && isEditing && editable && (
        <div
          ref={editScrollRef}
          className="overflow-auto max-h-[500px]"
        >
          <div className="flex min-h-[80px]">
            {showLineNumbers && (
              <div className="line-numbers shrink-0 pt-8 pr-3 pl-4 text-right select-none pointer-events-none">
                {Array.from({ length: lineCount }, (_, i) => (
                  <div
                    key={i}
                    className="text-[13px] leading-[1.6] text-[var(--vscode-editorLineNumber-foreground)]"
                  >
                    {i + 1}
                  </div>
                ))}
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={code}
              onChange={(e) => onChange?.(e.target.value)}
              onBlur={() => setIsEditing(false)}
              onScroll={() => {
                // Keep line-number gutter in sync with textarea scroll
                if (showLineNumbers && editScrollRef.current) {
                  editScrollRef.current.scrollTop = e.currentTarget.scrollTop;
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setIsEditing(false);
                }
                if (e.key === 'Tab') {
                  e.preventDefault();
                  const el = e.currentTarget;
                  const start = el.selectionStart;
                  const end = el.selectionEnd;
                  const newValue = code.substring(0, start) + '  ' + code.substring(end);
                  onChange?.(newValue);
                  requestAnimationFrame(() => {
                    el.selectionStart = el.selectionEnd = start + 2;
                  });
                }
              }}
              className="code-edit-area flex-1 m-0 pt-8 pr-4 pb-4 pl-4 font-mono text-[13px] leading-[1.6] bg-transparent text-[var(--vscode-editor-foreground)] border-none resize-none outline-none whitespace-pre"
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
            />
          </div>
        </div>
      )}

      {/* --- Code area: view mode (syntax highlighted) --- */}
      {!showPreview && !(isEditing && editable) && (
        <div
          className="overflow-auto max-h-[500px]"
          onClick={() => {
            if (editable) setIsEditing(true);
          }}
          style={editable ? { cursor: 'text' } : undefined}
        >
          <div className="flex min-h-[80px]">
            {showLineNumbers && (
              <div className="line-numbers shrink-0 pt-8 pr-3 pl-4 text-right select-none">
                {Array.from({ length: lineCount }, (_, i) => (
                  <div
                    key={i}
                    className="text-[13px] leading-[1.6] text-[var(--vscode-editorLineNumber-foreground)]"
                  >
                    {i + 1}
                  </div>
                ))}
              </div>
            )}
            <pre
              className="flex-1 m-0 pt-8 pr-4 pb-4 pl-4 bg-transparent"
            >
              <code
                ref={codeRef}
                className={`block language-${hasLanguage(selectedLanguage) ? resolveLanguage(selectedLanguage) : 'text'}`}
              >
                {code}
              </code>
            </pre>
          </div>
        </div>
      )}

      {/* --- HTML preview area --- */}
      {isHtml && showPreview && (
        <div className="relative">
          <iframe
            title="HTML 渲染预览"
            srcDoc={code}
            sandbox="allow-scripts allow-modals allow-forms allow-popups"
            className="w-full h-[300px] border-none bg-white dark:bg-slate-900"
          />
        </div>
      )}
    </div>
  );
};

export default CodeBlock;
export { resolveLanguage, hasLanguage };
