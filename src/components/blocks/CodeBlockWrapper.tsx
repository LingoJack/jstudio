import type { BaseBlockProps } from './types';
import type { RichText } from '../../types';
import CodeBlock from './CodeBlock';

/**
 * Extract a plain code string from a code block's `content` field.
 *
 * Code blocks store their source as `RichText[]` where `content[0].text`
 * holds the raw code (matching Notion's model).  For backward compatibility
 * we also accept a legacy raw string.
 */
function codeFromContent(content: RichText[] | string): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content) && content.length > 0) return content[0]?.text ?? '';
  return '';
}

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
  const code = codeFromContent(block.content);

  return (
    <CodeBlock
      code={code}
      language={language}
      editable
      showLineNumbers
      className="rounded-lg overflow-hidden border border-[var(--vscode-widget-border)] bg-[var(--vscode-textCodeBlock-background)]"
      onChange={(newCode) =>
        onUpdateBlock({
          content: [{ text: newCode, annotations: {} }] as RichText[],
        })
      }
      onLanguageChange={(lang) =>
        onUpdateBlock({
          properties: { ...block.properties, language: lang },
        })
      }
    />
  );
}
