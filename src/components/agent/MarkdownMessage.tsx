/**
 * MarkdownMessage — renders markdown content for agent messages.
 *
 * Uses react-markdown + remark-gfm for parsing,
 * lowlight (highlight.js) for code syntax highlighting.
 * Reuses JStudio's CSS variables for theming.
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { lowlight } from '../../lib/editor/extensions/lowlight';
import { Copy, Check } from 'lucide-react';
import type { RootContent, Element } from 'hast';

// ────────────────────────────────────────────────
// Code block with syntax highlighting
// ────────────────────────────────────────────────

function CodeBlock({
  language,
  children,
}: {
  language?: string;
  children: string;
}) {
  const [copied, setCopied] = useState(false);
  const codeRef = useRef<HTMLElement>(null);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(children).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [children]);

  // Syntax highlight using lowlight
  useEffect(() => {
    if (!codeRef.current || !language) return;
    
    try {
      const result = lowlight.highlight(language, children);
      const html = result.children
        .map((node: RootContent) => {
          if (node.type === 'text') {
            return escapeHtml(node.value);
          }
          if (node.type === 'element') {
            const el = node as Element;
            const className = el.properties?.className
              ? (Array.isArray(el.properties.className) 
                  ? el.properties.className.join(' ') 
                  : String(el.properties.className))
              : '';
            const text = el.children
              ?.map((c: RootContent) => (c.type === 'text' ? c.value : ''))
              .join('') || '';
            return `<span class="${className}">${escapeHtml(text)}</span>`;
          }
          return '';
        })
        .join('');
      codeRef.current.innerHTML = html;
    } catch {
      // Fallback to plain text
      codeRef.current.textContent = children;
    }
  }, [language, children]);

  return (
    <div className="relative group my-2">
      <pre
        className="overflow-x-auto rounded-lg p-3 text-[13px]"
        style={{
          background: 'var(--vscode-textCodeBlock-background, rgba(30,30,42,0.9))',
          border: '1px solid var(--vscode-widget-border)',
        }}
      >
        <code
          ref={codeRef}
          className={language ? `hljs language-${language}` : 'hljs'}
          style={{ background: 'none', fontSize: '13px' }}
        >
          {children}
        </code>
      </pre>
      
      {/* Copy button */}
      <button
        onClick={handleCopy}
        className="absolute top-1.5 right-1.5 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
        style={{
          background: 'var(--vscode-button-secondaryBackground)',
          color: 'var(--vscode-button-secondaryForeground)',
        }}
        title={copied ? 'Copied!' : 'Copy'}
      >
        {copied ? (
          <Check className="w-3 h-3" />
        ) : (
          <Copy className="w-3 h-3" />
        )}
      </button>
      
      {/* Language badge */}
      {language && (
        <span
          className="absolute bottom-1 right-1 text-[10px] px-1.5 py-0.5 rounded"
          style={{
            background: 'var(--vscode-badge-background)',
            color: 'var(--vscode-badge-foreground)',
          }}
        >
          {language}
        </span>
      )}
    </div>
  );
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ────────────────────────────────────────────────
// Table wrapper for overflow scrolling
// ────────────────────────────────────────────────

function TableWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="overflow-x-auto my-2 -mx-1"
      style={{ maxWidth: '100%' }}
    >
      {children}
    </div>
  );
}

// ────────────────────────────────────────────────
// Markdown message component
// ────────────────────────────────────────────────

export default function MarkdownMessage({ children }: { children: string }) {
  // Memoize components for performance
  const components = useMemo(
    () => ({
      // Code block handling
      code({ className, children: codeChildren, ...props }: React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }) {
        const match = /language-(\w+)/.exec(className || '');
        const language = match ? match[1] : undefined;
        const codeString = String(codeChildren).replace(/\n$/, '');
        
        // Inline code (no language class)
        if (!language) {
          return (
            <code
              className="px-1.5 py-0.5 rounded text-[13px]"
              style={{
                background: 'var(--vscode-textCodeBlock-background)',
                fontFamily: 'JetBrains Mono, Menlo, Monaco, monospace',
              }}
              {...props}
            >
              {codeChildren}
            </code>
          );
        }
        
        return <CodeBlock language={language}>{codeString}</CodeBlock>;
      },
      
      // Table wrapper
      table({ children: tableChildren }: React.HTMLAttributes<HTMLTableElement>) {
        return <TableWrapper><table>{tableChildren}</table></TableWrapper>;
      },
      
      // Pre tag — handled by code component above
      pre({ children: preChildren }: React.HTMLAttributes<HTMLPreElement>) {
        return <>{preChildren}</>;
      },
      
      // Links
      a({ href, children: aChildren }: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
            style={{ color: 'var(--vscode-textLink-foreground)' }}
          >
            {aChildren}
          </a>
        );
      },
      
      // Headings
      h1: ({ children: hChildren }: React.HTMLAttributes<HTMLHeadingElement>) => (
        <h1 className="my-3 mb-1.5 font-semibold text-lg" style={{ color: 'var(--vscode-foreground)' }}>
          {hChildren}
        </h1>
      ),
      h2: ({ children: hChildren }: React.HTMLAttributes<HTMLHeadingElement>) => (
        <h2 className="my-2 mb-1 font-semibold text-base" style={{ color: 'var(--vscode-foreground)' }}>
          {hChildren}
        </h2>
      ),
      h3: ({ children: hChildren }: React.HTMLAttributes<HTMLHeadingElement>) => (
        <h3 className="my-2 mb-1 font-semibold text-sm" style={{ color: 'var(--vscode-foreground)' }}>
          {hChildren}
        </h3>
      ),
      
      // Lists
      ul: ({ children: ulChildren }: React.HTMLAttributes<HTMLUListElement>) => (
        <ul className="my-1 mb-2 ml-[18px] list-disc" style={{ color: 'var(--vscode-foreground)' }}>
          {ulChildren}
        </ul>
      ),
      ol: ({ children: olChildren }: React.HTMLAttributes<HTMLOListElement>) => (
        <ol className="my-1 mb-2 ml-[18px] list-decimal" style={{ color: 'var(--vscode-foreground)' }}>
          {olChildren}
        </ol>
      ),
      li: ({ children: liChildren }: React.HTMLAttributes<HTMLLIElement>) => (
        <li className="my-0.5" style={{ color: 'var(--vscode-foreground)' }}>
          {liChildren}
        </li>
      ),
      
      // Paragraph
      p: ({ children: pChildren }: React.HTMLAttributes<HTMLParagraphElement>) => (
        <p className="mb-2 last:mb-0" style={{ color: 'var(--vscode-foreground)' }}>
          {pChildren}
        </p>
      ),
      
      // Blockquote
      blockquote: ({ children: bqChildren }: React.HTMLAttributes<HTMLQuoteElement>) => (
        <blockquote>{bqChildren}</blockquote>
      ),
      
      // Horizontal rule
      hr: () => (
        <hr
          className="border-0 border-t my-2.5"
          style={{ borderColor: 'var(--vscode-widget-border)' }}
        />
      ),
    }),
    []
  );

  return (
    <div className="markdown-message text-sm leading-relaxed" style={{ color: 'var(--vscode-foreground)' }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}