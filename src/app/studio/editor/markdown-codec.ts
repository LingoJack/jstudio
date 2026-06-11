import type { DocBlock } from './block-model'
import { newBlock } from './block-model'

function uid(): string {
  return `block-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function plain(text: string): string {
  return text.replace(/\r/g, '')
}

export function markdownToBlocks(source: string): DocBlock[] {
  const lines = plain(source).split('\n')
  const blocks: DocBlock[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    if (!line.trim()) {
      index += 1
      continue
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line)
    if (heading) {
      blocks.push({
        id: uid(),
        type: 'heading',
        level: heading[1].length as 1 | 2 | 3,
        text: heading[2],
      })
      index += 1
      continue
    }

    if (/^---+$/.test(line.trim())) {
      blocks.push({ id: uid(), type: 'divider' })
      index += 1
      continue
    }

    const codeStart = /^```\s*(.*)$/.exec(line)
    if (codeStart) {
      const codeLines: string[] = []
      index += 1
      while (index < lines.length && !/^```\s*$/.test(lines[index])) {
        codeLines.push(lines[index])
        index += 1
      }
      if (index < lines.length) index += 1
      blocks.push({ id: uid(), type: 'code', lang: codeStart[1] ?? '', code: codeLines.join('\n') })
      continue
    }

    const todo = /^[-*]\s+\[([ xX])]\s+(.*)$/.exec(line)
    if (todo) {
      blocks.push({
        id: uid(),
        type: 'todo',
        checked: todo[1].toLowerCase() === 'x',
        text: todo[2],
      })
      index += 1
      continue
    }

    const bullet = /^[-*]\s+(.*)$/.exec(line)
    if (bullet) {
      blocks.push({ id: uid(), type: 'bullet', text: bullet[1] })
      index += 1
      continue
    }

    const numbered = /^\d+[.)]\s+(.*)$/.exec(line)
    if (numbered) {
      blocks.push({ id: uid(), type: 'numbered', text: numbered[1] })
      index += 1
      continue
    }

    const quote = /^>\s?(.*)$/.exec(line)
    if (quote) {
      const quoteLines = [quote[1]]
      index += 1
      while (index < lines.length) {
        const next = /^>\s?(.*)$/.exec(lines[index])
        if (!next) break
        quoteLines.push(next[1])
        index += 1
      }
      blocks.push({ id: uid(), type: 'quote', text: quoteLines.join('\n') })
      continue
    }

    const paragraph = [line]
    index += 1
    while (index < lines.length && lines[index].trim()) {
      const next = lines[index]
      if (
        /^(#{1,3})\s+/.test(next) ||
        /^```/.test(next) ||
        /^[-*]\s+/.test(next) ||
        /^>/.test(next)
      ) {
        break
      }
      paragraph.push(next)
      index += 1
    }
    blocks.push({ id: uid(), type: 'paragraph', text: paragraph.join('\n') })
  }

  return blocks.length ? blocks : [newBlock('paragraph')]
}

export function blocksToMarkdown(blocks: DocBlock[]): string {
  const chunks = blocks.map((block, index) => {
    switch (block.type) {
      case 'heading':
        return `${'#'.repeat(block.level)} ${block.text || (index === 0 ? '未命名文档' : '')}`.trimEnd()
      case 'todo':
        return `- [${block.checked ? 'x' : ' '}] ${block.text}`.trimEnd()
      case 'quote':
        return block.text
          .split('\n')
          .map((line) => `> ${line}`.trimEnd())
          .join('\n')
      case 'code':
        return `\`\`\`${block.lang}\n${block.code}\n\`\`\``
      case 'divider':
        return '---'
      case 'bullet':
        return `- ${block.text}`.trimEnd()
      case 'numbered':
        return `1. ${block.text}`.trimEnd()
      case 'paragraph':
        return block.text
    }
  })
  return `${chunks.join('\n\n').replace(/\s+$/g, '')}\n`
}

export function titleFromBlocks(blocks: DocBlock[], fallback: string): string {
  const firstHeading = blocks.find((block) => block.type === 'heading' && block.level === 1)
  if (firstHeading?.type === 'heading' && firstHeading.text.trim()) return firstHeading.text.trim()
  const firstText = blocks.find((block) => block.type !== 'divider')
  if (firstText) {
    const text = firstText.type === 'code' ? firstText.code : firstText.text
    const line = text.trim().split('\n')[0]
    if (line) return line.slice(0, 48)
  }
  return fallback || '未命名文档'
}

export function updateTitleBlock(blocks: DocBlock[], title: string): DocBlock[] {
  const nextTitle = title || '未命名文档'
  const first = blocks[0]
  if (first?.type === 'heading' && first.level === 1) {
    return [{ ...first, text: nextTitle }, ...blocks.slice(1)]
  }
  return [{ id: uid(), type: 'heading', level: 1, text: nextTitle }, ...blocks]
}
