import type { BaseBlockProps } from './types';
import CodeBlock from './CodeBlock';

/**
 * TYPE: code — a thin wrapper around the existing standalone CodeBlock.
 *
 * Maps block.content → CodeBlock `code`, and block.properties.language → `language`.
 */
export default function CodeBlockWrapper({
  block,
  onUpdateBlock,
}: BaseBlockProps) {
  const language: string = block.properties?.language || 'text';

  return (
    <CodeBlock
      code={block.content}
      language={language}
      editable
      showLineNumbers
      className="rounded-lg overflow-hidden border border-[var(--vscode-widget-border)] bg-[var(--vscode-textCodeBlock-background)]"
      onChange={(code) => onUpdateBlock({ content: code })}
      onLanguageChange={(lang) =>
        onUpdateBlock({
          properties: { ...block.properties, language: lang },
        })
      }
    />
  );
}
