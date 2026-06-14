import React, { useEffect, useRef, useState, useCallback } from 'react';
import Prism from 'prismjs';
import { Copy, Check, Eye, Edit3 } from 'lucide-react';

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
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(code);
  const [showPreview, setShowPreview] = useState(false);
  const codeRef = useRef<HTMLElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isHtml = resolveLanguage(selectedLanguage) === 'markup';

  useEffect(() => {
    if (!isHtml) setShowPreview(false);
  }, [isHtml]);

  useEffect(() => {
    setEditValue(code);
  }, [code]);

  useEffect(() => {
    setSelectedLanguage(language);
  }, [language]);

  useEffect(() => {
    if (codeRef.current && !isEditing) {
      const lang = resolveLanguage(selectedLanguage);
      const finalLang = hasLanguage(selectedLanguage) ? lang : 'text';
      codeRef.current.className = `language-${finalLang}`;
      Prism.highlightElement(codeRef.current);
    }
  }, [code, selectedLanguage, isEditing]);

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

  const handleStartEdit = useCallback(() => {
    if (editable) {
      setIsEditing(true);
      setEditValue(code);
    }
  }, [editable, code]);

  const handleEndEdit = useCallback(() => {
    setIsEditing(false);
    if (onChange && editValue !== code) {
      onChange(editValue);
    }
  }, [onChange, editValue, code]);

  const lines = code.split('\n');
  const lineCount = lines.length;

  return (
    <div className={`code-block-container group/code ${className}`}>
      {/* Slim header — language input on left, action icons on right (hover only) */}
      <div className="flex items-center justify-between px-3 pt-2 pb-1 bg-[var(--vscode-textCodeBlock-background)]">
        <input
          type="text"
          value={selectedLanguage}
          onChange={(e) => {
            setSelectedLanguage(e.target.value);
            onLanguageChange?.(e.target.value);
          }}
          placeholder="语言"
          className="text-xs font-mono bg-transparent border-none outline-none text-[var(--vscode-descriptionForeground)] focus:text-[var(--vscode-foreground)] w-28 transition-colors"
        />

        {/* Icons — hidden by default, shown on hover */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover/code:opacity-100 transition-opacity duration-150">
          {editable && !isEditing && (
            <button
              onClick={handleStartEdit}
              className="p-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] text-[var(--vscode-icon-foreground)] transition-colors"
              title="编辑代码"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
          )}
          {isHtml && (
            <button
              onClick={() => setShowPreview((v) => !v)}
              className={`p-1 rounded transition-colors ${
                showPreview
                  ? 'text-[var(--vscode-foreground)] bg-[var(--vscode-toolbar-hoverBackground)]'
                  : 'text-[var(--vscode-icon-foreground)] hover:bg-[var(--vscode-toolbar-hoverBackground)]'
              }`}
              title={showPreview ? '隐藏预览' : '渲染预览'}
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={handleCopy}
            className="p-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] text-[var(--vscode-icon-foreground)] transition-colors"
            title={copied ? '已复制' : '复制'}
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-green-500" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Code content */}
      <div className="relative overflow-auto max-h-[500px]">
        {isEditing ? (
          <textarea
            ref={textareaRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleEndEdit}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setIsEditing(false);
                setEditValue(code);
              }
              if (e.key === 'Tab') {
                e.preventDefault();
                const start = e.currentTarget.selectionStart;
                const end = e.currentTarget.selectionEnd;
                setEditValue(editValue.substring(0, start) + '    ' + editValue.substring(end));
                setTimeout(() => {
                  e.currentTarget.selectionStart = e.currentTarget.selectionEnd = start + 4;
                }, 0);
              }
            }}
            className="w-full min-h-[100px] p-3 font-mono text-sm bg-[var(--vscode-editor-background)] text-[var(--vscode-editor-foreground)] border-none resize-none focus:outline-none focus:ring-1 focus:ring-[var(--vscode-focusBorder)]"
            spellCheck={false}
            autoFocus
          />
        ) : (
          <div className="flex">
            {showLineNumbers && (
              <div className="line-numbers shrink-0 py-3 pr-3 pl-4 text-right select-none bg-[var(--vscode-textCodeBlock-background)]">
                {Array.from({ length: lineCount }, (_, i) => (
                  <div
                    key={i}
                    className="text-xs leading-[1.6] text-[var(--vscode-editorLineNumber-foreground)]"
                  >
                    {i + 1}
                  </div>
                ))}
              </div>
            )}
            <pre
              className="flex-1 overflow-auto m-0 p-3 bg-[var(--vscode-textCodeBlock-background)]"
            >
              <code
                ref={codeRef}
                className={`language-${hasLanguage(selectedLanguage) ? resolveLanguage(selectedLanguage) : 'text'}`}
              >
                {code}
              </code>
            </pre>
          </div>
        )}
      </div>

      {/* HTML preview */}
      {isHtml && showPreview && (
        <div className="bg-white dark:bg-slate-900">
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
