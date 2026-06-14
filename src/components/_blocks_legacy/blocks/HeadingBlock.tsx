import type { BaseBlockProps } from './types';
import BlockLine from './BlockLine';

interface HeadingBlockProps extends BaseBlockProps {
  level: 1 | 2 | 3;
}

const STYLES: Record<number, string> = {
  1: 'w-full text-2xl font-bold tracking-tight py-1',
  2: 'w-full text-xl font-bold tracking-tight py-1',
  3: 'w-full text-lg font-semibold tracking-tight py-0.5',
};

const PLACEHOLDERS: Record<number, string> = {
  1: '主标题 1',
  2: '主题分类 2',
  3: '小标题 3',
};

const TAG_NAMES: Record<number, 'h1' | 'h2' | 'h3'> = {
  1: 'h1',
  2: 'h2',
  3: 'h3',
};

/**
 * TYPE: heading-1 / heading-2 / heading-3
 * A BlockLine with heading tag and styling.
 */
export default function HeadingBlock({ block, level }: HeadingBlockProps) {
  const richText = Array.isArray(block.content) ? block.content : [];
  return (
    <BlockLine
      tagName={TAG_NAMES[level]}
      richText={richText}
      placeholder={PLACEHOLDERS[level]}
      className={STYLES[level]}
    />
  );
}
