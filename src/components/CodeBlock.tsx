import React, { useEffect, useRef, useState, useCallback } from 'react';
import Prism from 'prismjs';
import { Copy, Check, Code2, Eye, Edit3 } from 'lucide-react';

// Import common language definitions
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
import 'prismjs/components/prism-markup'; // HTML/XML

// Language display names and aliases
const LANGUAGE_CONFIG: Record<string, { name: string; aliases: string[] }> = {
  javascript: { name: 'JavaScript', aliases: ['js', 'node', 'nodejs'] },
  typescript: { name: 'TypeScript', aliases: ['ts'] },
  python: { name: 'Python', aliases: ['py'] },
  bash: { name: 'Bash', aliases: ['shell', 'sh', 'zsh', 'terminal', 'cmd'] },
  json: { name: 'JSON', aliases: [] },
  css: { name: 'CSS', aliases: ['scss', 'sass', 'less'] },
  markdown: { name: 'Markdown', aliases: ['md'] },
  yaml: { name: 'YAML', aliases: ['yml'] },
  rust: { name: 'Rust', aliases: ['rs'] },
  go: { name: 'Go', aliases: ['golang'] },
  java: { name: 'Java', aliases: [] },
  c: { name: 'C', aliases: [] },
  cpp: { name: 'C++', aliases: ['c++', 'cxx'] },
  sql: { name: 'SQL', aliases: ['mysql', 'postgresql', 'postgres'] },
  html: { name: 'HTML', aliases: ['htmlmarkup', 'htm'] },
  text: { name: 'Text', aliases: ['plain', 'plaintext'] },
};

// Resolve language alias to canonical name
function resolveLanguage(lang: string): string {
  const normalized = lang.toLowerCase().trim();
  for (const [canonical, config] of Object.entries(LANGUAGE_CONFIG)) {
    if (canonical === normalized || config.aliases.includes(normalized)) {
      return canonical;
    }
  }
  return 'text';
}

// Get display name for a language
function getLanguageName(lang: string): string {
  const canonical = resolveLanguage(lang);
  return LANGUAGE_CONFIG[canonical]?.name || lang;
}

// Check if Prism has the language loaded
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
  const [selectedLanguage, setSelectedLanguage] = useState<string>(resolveLanguage(language));
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(code);
  const [showPreview, setShowPreview] = useState(false);
  const codeRef = useRef<HTMLElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isHtml = selectedLanguage === 'html';

  // When language changes away from HTML, auto-hide the preview pane.
  useEffect(() => {
    if (!isHtml) setShowPreview(false);
  }, [isHtml]);

  // Update edit value when code prop changes
  useEffect(() => {
    setEditValue(code);
  }, [code]);

  // Highlight code when language or code changes
  useEffect(() => {
    if (codeRef.current && !isEditing) {
      const lang = hasLanguage(selectedLanguage) ? selectedLanguage : 'text';
      // Set the language class before highlighting
      codeRef.current.className = `language-${lang}`;
      Prism.highlightElement(codeRef.current);
    }
  }, [code, selectedLanguage, isEditing]);

  // Handle copy
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = code;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [code]);

  // Handle language change
  const handleLanguageChange = useCallback((newLang: string) => {
    const resolved = resolveLanguage(newLang);
    setSelectedLanguage(resolved);
    if (onLanguageChange) {
      onLanguageChange(resolved);
    }
  }, [onLanguageChange]);

  // Handle edit mode
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

  // Generate line numbers
  const lines = code.split('\n');
  const lineCount = lines.length;

  return (
    <div className={`code-block-container ${className}`}>
      {/* Header: Language selector + Copy button */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--vscode-widget-border)] bg-[var(--vscode-textCodeBlock-background)]">
        <div className="flex items-center gap-2">
          <Code2 className="w-3.5 h-3.5 text-[var(--vscode-icon-foreground)] opacity-60" />
          <select
            value={selectedLanguage}
            onChange={(e) => handleLanguageChange(e.target.value)}
            className="text-xs font-medium bg-transparent border-none cursor-pointer text-[var(--vscode-foreground)] focus:outline-none focus:ring-0"
          >
            {Object.entries(LANGUAGE_CONFIG).map(([key, config]) => (
              <option key={key} value={key}>
                {config.name}
              </option>
            ))}
          </select>
        </div>
        
        <div className="flex items-center gap-0.5">
          {editable && !isEditing && (
            <button
              onClick={handleStartEdit}
              className="p-1.5 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] transition-colors text-[var(--vscode-foreground)] opacity-60 hover:opacity-100"
              title="编辑代码"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
          )}
          {isHtml && (
            <button
              onClick={() => setShowPreview((v) => !v)}
              className={`p-1.5 rounded transition-colors ${
                showPreview
                  ? 'text-[var(--vscode-foreground)] bg-[var(--vscode-toolbar-hoverBackground)] opacity-100'
                  : 'text-[var(--vscode-foreground)] opacity-60 hover:opacity-100 hover:bg-[var(--vscode-toolbar-hoverBackground)]'
              }`}
              title={showPreview ? '隐藏渲染预览' : '显示渲染预览'}
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={handleCopy}
            className="p-1.5 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] transition-colors text-[var(--vscode-foreground)] opacity-60 hover:opacity-100"
            title={copied ? '已复制' : '复制代码'}
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
              // Handle Tab key for indentation
              if (e.key === 'Tab') {
                e.preventDefault();
                const start = e.currentTarget.selectionStart;
                const end = e.currentTarget.selectionEnd;
                setEditValue(editValue.substring(0, start) + '    ' + editValue.substring(end));
                // Move cursor position
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
            {/* Line numbers column */}
            {showLineNumbers && (
              <div className="line-numbers shrink-0 py-3 pr-3 pl-4 text-right select-none border-r border-[var(--vscode-widget-border)] bg-[var(--vscode-textCodeBlock-background)]">
                {Array.from({ length: lineCount }, (_, i) => (
                  <div
                    key={i}
                    className="text-xs leading-[1.6] text-[var(--vscode-editorLineNumber-foreground)] hover:text-[var(--vscode-editorLineNumber-activeForeground)]"
                  >
                    {i + 1}
                  </div>
                ))}
              </div>
            )}
            
            {/* Code column */}
            <pre 
              className={`flex-1 overflow-auto m-0 p-3 bg-[var(--vscode-textCodeBlock-background)] ${showLineNumbers ? '' : 'border-none'}`}
              style={{ border: showLineNumbers ? 'none' : '1px solid var(--vscode-widget-border)' }}
            >
              <code
                ref={codeRef}
                className={`language-${hasLanguage(selectedLanguage) ? selectedLanguage : 'text'}`}
              >
                {code}
              </code>
            </pre>
          </div>
        )}
      </div>

      {/* HTML Render Preview Pane */}
      {isHtml && showPreview && (
        <div className="border-t border-[var(--vscode-widget-border)] bg-white dark:bg-slate-900">
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
export { resolveLanguage, getLanguageName, hasLanguage, LANGUAGE_CONFIG };