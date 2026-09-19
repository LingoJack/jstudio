/**
 * mermaid 时序图（sequenceDiagram）文本解析器。
 *
 * 小程序端跑不了 mermaid 官方解析器（依赖 DOM 与异步初始化），这里对
 * sequenceDiagram 的文本语法做独立解析，产出结构化模型供 sequenceLayout 布局。
 * 只覆盖时序图；其余图类型（flowchart 等）返回 null，由调用方降级为源码展示。
 *
 * 语义对齐 mermaid v11 产物的 jison 动作（sequenceDiagram-*.mjs case 70/71）：
 * - `A->>+B: m`：+ 后面跟着谁就激活谁（activeStart 的 actor 是目标 B）。
 * - `A->>-B: m`：- 关闭的是发送方 A 的激活段（activeEnd 的 actor 取 from），
 *   与直觉相反；官方文档示例 `John-->>-Alice` 结束的正是 John 的激活段。
 * - `activate X` / `deactivate X` 语句在当前流位置开/关 X 的激活段。
 */

/** 消息箭头样式：filled 填充三角（->> / -->>）/ open 开口（-> / --> / -)）/ cross 十字（-x / --x）。 */
export type SeqArrowKind = 'filled' | 'open' | 'cross'

/** 参与者。 */
export interface SeqActor {
  /** 语法中的参与者 id。 */
  id: string
  /** 显示名（`participant A as 客户端` 的「客户端」；未写 as 时与 id 相同）。 */
  display: string
}

/** 激活段开合标记。 */
export interface SeqActivation {
  actorId: string
  /** true = 开启（activate / +），false = 关闭（deactivate / -）。 */
  activate: boolean
}

/** 一条消息。 */
export interface SeqMessage {
  from: string
  to: string
  /** 消息文本（<br> 已规整为换行）。 */
  text: string
  /** `--` 开头的虚线（返回）消息。 */
  dashed: boolean
  arrow: SeqArrowKind
  /** autonumber 开启期间的顺序编号（从 start 起，默认 1）。 */
  number?: number
  /** 本条消息行携带的激活开合（+B / -B 夹在箭头与目标之间）。 */
  activations: SeqActivation[]
}

export type SeqNotePlacement = 'over' | 'left' | 'right'

/** 注释。 */
export interface SeqNote {
  /** 作用参与者（over 可为 1-2 个；left of / right of 恒为 1 个）。 */
  actorIds: string[]
  placement: SeqNotePlacement
  text: string
}

/**
 * 控制流帧类型。box 是参与者视觉分组，本端不渲染分组框本身，
 * 仅消费它的 end 与消息流配对，避免其 end 误关外层帧。
 */
export type SeqFrameKind = 'loop' | 'alt' | 'opt' | 'par' | 'critical' | 'break' | 'rect' | 'box'

/** 帧内分段：帧头是 branches[0]，alt 的 else / par 的 and / critical 的 option 追加后续段。 */
export interface SeqFrameBranch {
  label: string
  items: SeqItem[]
}

/** 控制流帧（loop/alt/opt/...，可嵌套）。 */
export interface SeqFrame {
  kind: SeqFrameKind
  branches: SeqFrameBranch[]
}

/** 时序图内容条目（保持源码顺序）。 */
export type SeqItem =
  | { kind: 'message'; message: SeqMessage }
  | { kind: 'note'; note: SeqNote }
  | { kind: 'activation'; activation: SeqActivation }
  | { kind: 'frame'; frame: SeqFrame }

/** 解析产物。 */
export interface SequenceModel {
  /** 参与者，按首次出现顺序（声明或消息引用）。 */
  actors: SeqActor[]
  items: SeqItem[]
}

/** 空白类 HTML 实体到对应 Unicode 空格（移植 desktop mermaidParser.decodeEntities 白名单）。 */
const WHITESPACE_ENTITIES: Record<string, string> = {
  '&emsp;': '\u2003',
  '&ensp;': '\u2002',
  '&thinsp;': '\u2009',
  '&nbsp;': '\u00a0',
}

/** 控制流帧关键字（box 仅用于 end 配对）。 */
const FRAME_KINDS = ['loop', 'alt', 'opt', 'par', 'critical', 'break', 'rect', 'box'] as const

/** 分段关键字（归到最内层帧）。 */
const SECTION_KEYWORDS = ['else', 'and', 'option'] as const

/** 消息行冒号前部分的正则：from 箭头 to。 */
const MESSAGE_HEAD_RE = /^(\S+?)\s*(-{1,2}(?:>>|>|x|\)))\s*(\S+)$/

const FRAME_RE = new RegExp(`^(${FRAME_KINDS.join('|')})\\b\\s*(.*)$`, 'i')
const SECTION_RE = new RegExp(`^(${SECTION_KEYWORDS.join('|')})\\b\\s*(.*)$`, 'i')
const PARTICIPANT_RE = /^(participant|actor)\s+(\S+)(?:\s+as\s+(.+))?$/i
const ACTIVATE_RE = /^(de)?activate\s+(\S+)\s*$/i
const AUTONUMBER_RE = /^autonumber(?:\s+(.*))?$/i
const NOTE_RE = /^note\s+(over|left\s+of|right\s+of)\s+([^:]*?)(?::\s*(.*))?$/i

/**
 * 预处理：空白类命名实体还原为对应空格字符，数值实体解码为对应字符
 * （会引入 mermaid 语法字符 < > & ; 的保留原文）。
 * 实体里的 `;` 会把按 `;` 切语句的逻辑拦腰截断，必须先解码。
 */
function decodeEntities(code: string): string {
  let out = code
  for (const [entity, ch] of Object.entries(WHITESPACE_ENTITIES)) {
    out = out.split(entity).join(ch)
  }
  out = out.replace(/&#(\d+);|&#x([0-9a-fA-F]+);/g, (entity, dec, hex) => {
    const codePoint = dec !== undefined ? Number(dec) : parseInt(hex, 16)
    if (!Number.isInteger(codePoint) || codePoint <= 0 || codePoint > 0x10ffff) {
      return entity
    }
    const ch = String.fromCodePoint(codePoint)
    return /[<>&;]/.test(ch) ? entity : ch
  })
  return out
}

/**
 * 切语句：换行或 `;` 分隔，`#` 起为行内注释（mermaid 词法同款，消息文本
 * 的词法规则同样排除 `#`）。空白行丢弃。
 */
function splitStatements(code: string): string[] {
  return decodeEntities(code)
    .split(/\r?\n|;/)
    .map((line) => line.replace(/#.*$/, '').trim())
    .filter((line) => line.length > 0)
}

/** 消息 / 注释文本规整：<br> 转换行、去首尾空白。 */
function normalizeText(text: string): string {
  return text.replace(/<br\s*\/?>/gi, '\n').trim()
}

/** 解析箭头样式：虚线看开头 `--`，样式看结尾。 */
function describeArrow(arrow: string): { dashed: boolean; kind: SeqArrowKind } {
  const dashed = arrow.startsWith('--')
  if (arrow.endsWith('>>')) return { dashed, kind: 'filled' }
  if (arrow.endsWith('x')) return { dashed, kind: 'cross' }
  return { dashed, kind: 'open' }
}

/**
 * 解析 sequenceDiagram 源码。非时序图、无参与者或无消息时返回 null
 * （调用方降级为源码展示）。未知语句一律忽略，不做整体失败。
 */
export function parseSequenceDiagram(code: string): SequenceModel | null {
  const statements = splitStatements(code)
  if (statements.length === 0 || !/^sequenceDiagram(\s|$)/i.test(statements[0])) {
    return null
  }

  const actorMap = new Map<string, SeqActor>()
  const actors: SeqActor[] = []
  const rootItems: SeqItem[] = []
  const frameStack: Array<{ frame: SeqFrame; current: SeqFrameBranch }> = []

  // autonumber 状态：可见性 + 下一个编号 + 步长（mermaid sequenceIndex 语义：
  // off/on 只切可见性，编号计数不受影响；`autonumber N [step]` 重设起点与步长）。
  let autoVisible = false
  let autoNext = 1
  let autoStep = 1
  let messageCount = 0

  const ensureActor = (rawId: string): SeqActor => {
    const id = rawId.trim()
    const existing = actorMap.get(id)
    if (existing) return existing
    const actor: SeqActor = { id, display: id }
    actorMap.set(id, actor)
    actors.push(actor)
    return actor
  }

  const pushItem = (item: SeqItem) => {
    const top = frameStack[frameStack.length - 1]
    if (top) top.current.items.push(item)
    else rootItems.push(item)
  }

  for (let i = 1; i < statements.length; i++) {
    const line = statements[i]
    if (line.startsWith('%%')) continue

    const participantMatch = line.match(PARTICIPANT_RE)
    if (participantMatch) {
      const actor = ensureActor(participantMatch[2])
      if (participantMatch[3]) actor.display = normalizeText(participantMatch[3])
      continue
    }

    const autoMatch = line.match(AUTONUMBER_RE)
    if (autoMatch) {
      const args = (autoMatch[1] ?? '').split(/\s+/).filter(Boolean)
      if (args.length === 0 || args[0].toLowerCase() === 'on') {
        autoVisible = true
      } else if (args[0].toLowerCase() === 'off') {
        autoVisible = false
      } else {
        const start = Number(args[0])
        if (Number.isFinite(start)) {
          autoVisible = true
          autoNext = Math.floor(start)
          const step = Number(args[1])
          if (Number.isFinite(step) && step > 0) autoStep = Math.floor(step)
        }
      }
      continue
    }

    const actMatch = line.match(ACTIVATE_RE)
    if (actMatch) {
      // 只在参与者已声明时生效，避免 deactivate 拼错字凭空造出参与者。
      if (actorMap.has(actMatch[2])) {
        pushItem({ kind: 'activation', activation: { actorId: actMatch[2], activate: !actMatch[1] } })
      }
      continue
    }

    const noteMatch = line.match(NOTE_RE)
    if (noteMatch) {
      const word = noteMatch[1].toLowerCase()
      const placement: SeqNotePlacement = word === 'over' ? 'over' : word.startsWith('left') ? 'left' : 'right'
      const actorIds = noteMatch[2].split(',').map((s) => s.trim()).filter(Boolean)
      if (actorIds.length === 0) continue
      if (placement !== 'over') actorIds.length = 1
      for (const id of actorIds) ensureActor(id)
      pushItem({ kind: 'note', note: { actorIds, placement, text: normalizeText(noteMatch[3] ?? '') } })
      continue
    }

    // 消息行：冒号前是「from 箭头 to」。放在帧关键字之前判断，
    // 因为参与者 id（如 loop）可能撞帧关键字，而消息行一定带箭头。
    const colonIdx = line.indexOf(':')
    if (colonIdx > 0) {
      const head = line.slice(0, colonIdx).trim()
      const headMatch = head.match(MESSAGE_HEAD_RE)
      if (headMatch) {
        const fromActor = ensureActor(headMatch[1])
        let toToken = headMatch[3]
        const activations: SeqActivation[] = []
        // +/- 夹在箭头与目标之间（A->>+B / A->>-B），语义见文件头注释。
        if (toToken.length > 1 && toToken.startsWith('+')) {
          activations.push({ actorId: ensureActor(toToken.slice(1)).id, activate: true })
          toToken = toToken.slice(1)
        } else if (toToken.length > 1 && toToken.startsWith('-')) {
          activations.push({ actorId: fromActor.id, activate: false })
          toToken = toToken.slice(1)
        } else if (toToken === '+' || toToken === '-') {
          continue
        }
        const toActor = ensureActor(toToken)
        const { dashed, kind } = describeArrow(headMatch[2])
        const message: SeqMessage = {
          from: fromActor.id,
          to: toActor.id,
          text: normalizeText(line.slice(colonIdx + 1)),
          dashed,
          arrow: kind,
          activations,
        }
        if (autoVisible) {
          message.number = autoNext
          autoNext += autoStep
        }
        pushItem({ kind: 'message', message })
        messageCount += 1
        continue
      }
    }

    const frameMatch = line.match(FRAME_RE)
    if (frameMatch) {
      const kind = frameMatch[1].toLowerCase() as SeqFrameKind
      const rawLabel = frameMatch[2].trim()
      // rect 的参数是颜色样式（rect rgb(...) / rect #hex），不作为标签。
      const label = kind === 'rect' && /^(rgb|rgba)\s*\(|^#/i.test(rawLabel) ? '' : rawLabel
      const frame: SeqFrame = { kind, branches: [{ label, items: [] }] }
      pushItem({ kind: 'frame', frame })
      frameStack.push({ frame, current: frame.branches[0] })
      continue
    }

    const sectionMatch = line.match(SECTION_RE)
    if (sectionMatch && frameStack.length > 0) {
      const top = frameStack[frameStack.length - 1]
      const branch: SeqFrameBranch = { label: sectionMatch[2].trim(), items: [] }
      top.frame.branches.push(branch)
      top.current = branch
      continue
    }

    if (/^end$/i.test(line) && frameStack.length > 0) {
      frameStack.pop()
      continue
    }
  }

  if (actors.length === 0 || messageCount === 0) return null
  return { actors, items: rootItems }
}
