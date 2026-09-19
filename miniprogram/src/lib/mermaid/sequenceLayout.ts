/**
 * 时序图布局：SequenceModel → 绝对定位渲染数据（px）。
 *
 * 文本测宽用字符估算（小程序端没有同步的 DOM / canvas 测量）：CJK 等全宽字符
 * 按 1em、其他按 0.62em、空格按 0.4em 计，思路同桌面端 graphTextFit 的无 DOM 兜底。
 * 尺寸与配色对齐 mermaid 默认渲染（参考截图）：参与者盒高 40、消息行距 50、
 * 生命线 #999 细线、参与者盒 #ECECFF/#9370DB、消息线与编号圆点 #333。
 */

import type { SeqArrowKind, SeqItem, SeqMessage, SeqNote, SequenceModel } from './sequenceParser'

// —— 字号（与 blockView.scss 的 .bv-mermaid-* 字号一一对应）——
/** 参与者盒子文字。 */
export const FONT_ACTOR = 16
/** 消息 / 注释文字。 */
export const FONT_MESSAGE = 14
/** 标签行高（多行标签按行数乘此值）。 */
export const SEQ_LINE_HEIGHT = 20

// —— 几何常量 ——
/** 参与者盒子最小高度。 */
const ACTOR_HEIGHT = 40
/** 参与者盒子水平内边距（总宽 = 文字宽 + 2 * 此值）。 */
const ACTOR_PAD_X = 24
/** 参与者盒子最小宽度。 */
const ACTOR_MIN_WIDTH = 60
/** 相邻参与者盒子之间的最小空隙（mermaid 默认 actorMargin）。 */
const ACTOR_EDGE_GAP = 50
/** 画布左右留白。 */
const CANVAS_PAD_X = 30
/** 画布底部留白。 */
const CANVAS_PAD_BOTTOM = 8
/** 生命线最短长度（参与者盒顶到底部盒顶）。 */
const LIFELINE_MIN_HEIGHT = 160
/** 相邻消息线的最小间距。 */
const MESSAGE_SPACING = 50
/** 消息标签底边与消息线的间距。 */
const LABEL_LINE_PAD = 4
/** 上一条内容的底边与本条标签顶部的最小空隙。 */
const LABEL_ROW_PAD = 8
/** autonumber 圆点在发送端占用的水平空间（参与间隙约束）。 */
const CIRCLE_ALLOWANCE = 28
/** 消息标签与两侧生命线的最小水平留白。 */
const LABEL_EDGE_MARGIN = 10
/** 自环回路向右伸出的最小宽度。 */
const SELF_LOOP_MIN_W = 35
/** 自环回路的最小高度。 */
const SELF_LOOP_MIN_H = 32
/** 自环标签宽度相对回路宽度的加量（回路宽 = max(35, 标签宽 + 12)）。 */
const SELF_LOOP_LABEL_SPARE = 12
/** 注释盒与上下相邻内容的间距。 */
const NOTE_GAP = 8
/** 注释盒水平内边距（总宽 = 文字宽 + 2 * 此值）。 */
const NOTE_PAD_X = 14
/** 注释盒垂直内边距。 */
const NOTE_PAD_Y = 8
/** 注释盒最小宽度。 */
const NOTE_MIN_WIDTH = 50
/** 注释盒左/右放置时与生命线的间距。 */
const NOTE_EDGE_PAD = 12
/** over 注释与两侧生命线的留白（参与跨度约束）。 */
const NOTE_SPAN_MARGIN = 20
/** 帧顶边与上一条内容底边的间距。 */
const FRAME_GAP_TOP = 4
/** 帧头标签区高度（首条内容从其下方开始）。 */
const FRAME_LABEL_H = 26
/** 帧内容底边到帧底边的间距。 */
const FRAME_PAD_BOTTOM = 14
/** 帧边到内容的最小水平间距。 */
const FRAME_PAD_X = 18
/** 上一段内容底边到分段虚线的间距。 */
const BRANCH_DIVIDER_PAD = 12
/** 分段虚线到带标签下一段内容的间距。 */
const BRANCH_LABEL_CLEARANCE = 22
/** 分段虚线到无标签下一段内容的间距。 */
const BRANCH_DIVIDER_CLEARANCE = 14
/** 最后一条内容底边到底部参与者盒的留白。 */
const BOTTOM_TAIL = 30
/** 画布内容的最小左缘。 */
const CANVAS_MIN_X = 2
/** 自环底线在生命线处留出的填充三角箭头长度。 */
export const ARROW_FILLED_LEN = 9

/** 一条消息的渲染数据。 */
export interface SequenceMessageView {
  /** 消息线 y（非自环：线与箭头所在行；自环：U 形顶线 y）。 */
  y: number
  x1: number
  x2: number
  /** 箭头指向（x2 端）。自环恒为 right（回路向右伸出）。 */
  dir: 'left' | 'right'
  dashed: boolean
  arrow: SeqArrowKind
  lines: string[]
  /** 标签估宽（居中文本定位用）。 */
  textW: number
  /** autonumber 编号。 */
  number?: number
  /** 自环回路（from === to）：向右 loopW、向下 loopH 的 U 形。 */
  self?: { loopW: number; loopH: number }
}

export interface SequenceLayoutNote {
  x: number
  y: number
  w: number
  h: number
  lines: string[]
}

export interface SequenceLayoutFrame {
  x: number
  y: number
  w: number
  h: number
  /** 帧头标签（kind + 条件；rect 等无标签时为空串）。 */
  label: string
  /** 分段虚线（alt 的 else / par 的 and 等）。 */
  dividers: Array<{ y: number; label: string }>
}

export interface SequenceLayout {
  width: number
  height: number
  /** 底部镜像参与者盒子的 y。 */
  bottomY: number
  /** 顶部参与者盒子（底部镜像复用同一组 x / w / h）。 */
  actors: Array<{ display: string; x: number; y: number; w: number; h: number }>
  lifelines: Array<{ x: number; top: number; bottom: number }>
  /** 激活段竖条（x 为生命线中心）。 */
  activations: Array<{ x: number; top: number; bottom: number }>
  notes: SequenceLayoutNote[]
  frames: SequenceLayoutFrame[]
  messages: SequenceMessageView[]
}

/** 字符估宽：全宽字符 1em，空格 0.4em，其余 0.62em。多行取最宽一行。 */
function textWidth(text: string, fontSize: number): number {
  let max = 0
  for (const line of text.split('\n')) {
    let units = 0
    for (const ch of line) {
      const cp = ch.codePointAt(0) ?? 0
      if (cp > 0xff) units += 1
      else if (ch === ' ') units += 0.4
      else units += 0.62
    }
    max = Math.max(max, units * fontSize)
  }
  return max
}

function lineCount(text: string): number {
  return Math.max(text.split('\n').length, 1)
}

function noteWidth(note: SeqNote): number {
  return Math.max(textWidth(note.text, FONT_MESSAGE) + NOTE_PAD_X * 2, NOTE_MIN_WIDTH)
}

interface ActorBox {
  display: string
  w: number
  h: number
  half: number
  center: number
}

interface FlowResult {
  /** 本层最后内容的底边（下一条内容从此起算）。 */
  endBottom: number
  /** 本层最后一条消息线的 y（行距节奏用；无消息为 -Infinity）。 */
  lastLineY: number
  minX: number
  maxX: number
}

/** 把时序图模型展开成绝对定位渲染数据。 */
export function layoutSequenceDiagram(model: SequenceModel): SequenceLayout {
  const actorIndex = new Map(model.actors.map((a, i) => [a.id, i] as const))

  // 1. 参与者盒子尺寸（显示名支持 <br> 换行，盒高随之增长）。
  const boxes: ActorBox[] = model.actors.map((actor) => {
    const w = Math.max(textWidth(actor.display, FONT_ACTOR) + ACTOR_PAD_X * 2, ACTOR_MIN_WIDTH)
    const h = Math.max(lineCount(actor.display) * SEQ_LINE_HEIGHT + 14, ACTOR_HEIGHT)
    return { display: actor.display, w, h, half: w / 2, center: 0 }
  })

  // 2. 相邻生命线中心距约束：间隙要装下其间最长消息标签（含编号圆点），
  //    自环回路向右伸出的部分占用其右侧间隙；盒子自身不能重叠。
  const gapCount = Math.max(boxes.length - 1, 0)
  const gapNeed: number[] = new Array(gapCount).fill(0)
  const collectMessages = (items: SeqItem[]) => {
    for (const item of items) {
      if (item.kind === 'message') {
        const msg = item.message
        const fi = actorIndex.get(msg.from) ?? 0
        const ti = actorIndex.get(msg.to) ?? 0
        const labelW = textWidth(msg.text, FONT_MESSAGE)
        if (msg.from === msg.to) {
          if (fi < gapCount) {
            const loopW = Math.max(SELF_LOOP_MIN_W, labelW + SELF_LOOP_LABEL_SPARE)
            gapNeed[fi] = Math.max(gapNeed[fi], loopW + LABEL_EDGE_MARGIN)
          }
        } else if (Math.abs(fi - ti) === 1) {
          const lo = Math.min(fi, ti)
          gapNeed[lo] = Math.max(gapNeed[lo], labelW + CIRCLE_ALLOWANCE + LABEL_EDGE_MARGIN * 2)
        }
      } else if (item.kind === 'frame') {
        item.frame.branches.forEach((b) => collectMessages(b.items))
      }
    }
  }
  collectMessages(model.items)
  for (let i = 0; i < gapCount; i++) {
    gapNeed[i] = Math.max(gapNeed[i], boxes[i].half + boxes[i + 1].half + ACTOR_EDGE_GAP)
  }

  // 3. 初始中心线坐标；over 注释要求的跨度不足时把缺口均摊到区间内各间隙。
  boxes[0].center = CANVAS_PAD_X + boxes[0].half
  for (let i = 0; i < gapCount; i++) {
    boxes[i + 1].center = boxes[i].center + gapNeed[i]
  }
  const overNotes: Array<{ lo: number; hi: number; w: number }> = []
  const collectOverNotes = (items: SeqItem[]) => {
    for (const item of items) {
      if (item.kind === 'note' && item.note.placement === 'over' && item.note.actorIds.length > 1) {
        const idxs = item.note.actorIds
          .map((id) => actorIndex.get(id))
          .filter((v): v is number => v !== undefined)
        if (idxs.length > 1) {
          overNotes.push({ lo: Math.min(...idxs), hi: Math.max(...idxs), w: noteWidth(item.note) })
        }
      } else if (item.kind === 'frame') {
        item.frame.branches.forEach((b) => collectOverNotes(b.items))
      }
    }
  }
  collectOverNotes(model.items)
  for (const span of overNotes) {
    const cur = boxes[span.hi].center - boxes[span.lo].center
    const need = span.w + NOTE_SPAN_MARGIN * 2
    if (need > cur && span.hi > span.lo) {
      const extra = (need - cur) / (span.hi - span.lo)
      for (let i = span.lo; i < span.hi; i++) {
        gapNeed[i] += extra
        boxes[i + 1].center = boxes[i].center + gapNeed[i]
      }
    }
  }

  const centerOf = (id: string): number => {
    const idx = actorIndex.get(id)
    return idx === undefined ? boxes[0].center : boxes[idx].center
  }

  // 4. 内容流布局（消息 / 注释 / 激活 / 帧，帧内递归）。
  const messages: SequenceMessageView[] = []
  const notes: SequenceLayoutNote[] = []
  const frames: SequenceLayoutFrame[] = []
  const activations: Array<{ x: number; top: number; bottom: number }> = []
  const activeStacks = new Map<string, number[]>()
  let contentMinX = boxes[0].center - boxes[0].half
  let contentMaxX = boxes[boxes.length - 1].center + boxes[boxes.length - 1].half

  const trackX = (min: number, max: number) => {
    contentMinX = Math.min(contentMinX, min)
    contentMaxX = Math.max(contentMaxX, max)
  }

  const openActivation = (actorId: string, y: number) => {
    const stack = activeStacks.get(actorId) ?? []
    stack.push(y)
    activeStacks.set(actorId, stack)
  }
  const closeActivation = (actorId: string, y: number) => {
    const stack = activeStacks.get(actorId)
    if (!stack || stack.length === 0) return
    const start = stack.pop() as number
    activations.push({ x: centerOf(actorId), top: start, bottom: Math.max(y, start + 2) })
  }

  const emitMessage = (msg: SeqMessage, y: number): SequenceMessageView => {
    const lines = msg.text.split('\n')
    const textW = textWidth(msg.text, FONT_MESSAGE)
    const x1 = centerOf(msg.from)
    if (msg.from === msg.to) {
      const loopW = Math.max(SELF_LOOP_MIN_W, textW + SELF_LOOP_LABEL_SPARE)
      const loopH = Math.max(SELF_LOOP_MIN_H, lines.length * SEQ_LINE_HEIGHT + SELF_LOOP_LABEL_SPARE)
      trackX(x1, x1 + loopW + LABEL_EDGE_MARGIN)
      return {
        y, x1, x2: x1, dir: 'right', dashed: msg.dashed, arrow: msg.arrow, lines, textW,
        number: msg.number, self: { loopW, loopH },
      }
    }
    const x2 = centerOf(msg.to)
    trackX(Math.min(x1, x2) - LABEL_EDGE_MARGIN, Math.max(x1, x2) + LABEL_EDGE_MARGIN)
    return {
      y, x1, x2, dir: x2 >= x1 ? 'right' : 'left', dashed: msg.dashed, arrow: msg.arrow,
      lines, textW, number: msg.number,
    }
  }

  const emitNote = (note: SeqNote, prevBottom: number): { view: SequenceLayoutNote; bottom: number } => {
    const w = noteWidth(note)
    const h = lineCount(note.text) * SEQ_LINE_HEIGHT + NOTE_PAD_Y * 2
    const y = prevBottom + NOTE_GAP
    let x: number
    if (note.placement === 'left') {
      x = centerOf(note.actorIds[0]) - NOTE_EDGE_PAD - w
    } else if (note.placement === 'right') {
      x = centerOf(note.actorIds[0]) + NOTE_EDGE_PAD
    } else {
      const cs = note.actorIds.map(centerOf)
      x = (Math.min(...cs) + Math.max(...cs)) / 2 - w / 2
    }
    x = Math.max(x, CANVAS_MIN_X)
    trackX(x, x + w)
    return { view: { x, y, w, h, lines: note.text.split('\n') }, bottom: y + h + NOTE_GAP }
  }

  const messageY = (msg: SeqMessage, prevBottom: number, lastLineY: number): number => {
    const h = lineCount(msg.text) * SEQ_LINE_HEIGHT
    return Math.max(lastLineY + MESSAGE_SPACING, prevBottom + LABEL_ROW_PAD + h + LABEL_LINE_PAD)
  }

  const layoutFlow = (items: SeqItem[], startBottom: number): FlowResult => {
    let prevBottom = startBottom
    let lastLineY = Number.NEGATIVE_INFINITY
    let minX = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY

    for (const item of items) {
      if (item.kind === 'message') {
        const view = emitMessage(item.message, messageY(item.message, prevBottom, lastLineY))
        messages.push(view)
        minX = Math.min(minX, view.x1, view.x2)
        maxX = Math.max(maxX, view.x1, view.x2)
        // 激活段起点 / 终点都钉在本条消息线上（mermaid 行为）。
        for (const act of item.message.activations) {
          if (act.activate) openActivation(act.actorId, view.y)
          else closeActivation(act.actorId, view.y)
        }
        prevBottom = view.self ? view.y + view.self.loopH : view.y
        lastLineY = view.y
      } else if (item.kind === 'note') {
        const { view, bottom } = emitNote(item.note, prevBottom)
        notes.push(view)
        minX = Math.min(minX, view.x)
        maxX = Math.max(maxX, view.x + view.w)
        prevBottom = bottom
      } else if (item.kind === 'activation') {
        const y = prevBottom
        if (item.activation.activate) openActivation(item.activation.actorId, y)
        else closeActivation(item.activation.actorId, y)
      } else {
        const frame = item.frame
        if (frame.branches.every((b) => b.items.length === 0)) continue
        const frameTop = prevBottom + FRAME_GAP_TOP
        const results: FlowResult[] = []
        const dividers: Array<{ y: number; label: string }> = []
        for (let bi = 0; bi < frame.branches.length; bi++) {
          const branch = frame.branches[bi]
          if (bi === 0) {
            results.push(layoutFlow(branch.items, frameTop + FRAME_LABEL_H))
          } else {
            const divY = results[bi - 1].endBottom + BRANCH_DIVIDER_PAD
            dividers.push({ y: divY, label: branch.label })
            const start = divY + (branch.label ? BRANCH_LABEL_CLEARANCE : BRANCH_DIVIDER_CLEARANCE)
            results.push(layoutFlow(branch.items, start))
          }
        }
        const innerMin = Math.min(...results.map((r) => r.minX))
        const innerMax = Math.max(...results.map((r) => r.maxX))
        const endBottom = Math.max(...results.map((r) => r.endBottom)) + FRAME_PAD_BOTTOM
        const firstLabel = frame.branches[0].label
        const label = frame.kind === 'box' || frame.kind === 'rect'
          ? firstLabel
          : firstLabel === ''
            ? frame.kind
            : `${frame.kind} ${firstLabel}`
        frames.push({
          x: innerMin - FRAME_PAD_X,
          y: frameTop,
          w: innerMax - innerMin + FRAME_PAD_X * 2,
          h: endBottom - frameTop,
          label,
          dividers,
        })
        trackX(innerMin - FRAME_PAD_X, innerMax + FRAME_PAD_X)
        minX = Math.min(minX, innerMin)
        maxX = Math.max(maxX, innerMax)
        prevBottom = endBottom
        lastLineY = Math.max(lastLineY, ...results.map((r) => r.lastLineY))
      }
    }
    return { endBottom: prevBottom, lastLineY, minX, maxX }
  }

  const lifelineTop = Math.max(...boxes.map((b) => b.h))
  const root = layoutFlow(model.items, lifelineTop)

  // 5. 未关闭的激活段按最后内容底边兜底关闭。
  const lastBottom = root.endBottom
  for (const [actorId, stack] of activeStacks) {
    while (stack.length > 0) {
      const start = stack.pop() as number
      activations.push({ x: centerOf(actorId), top: start, bottom: Math.max(lastBottom, start + 2) })
    }
  }

  // 6. 画布尺寸与顶部 / 底部参与者盒子；内容整体平移，保证左侧留白一致。
  const bottomBoxTop = Math.max(lastBottom + BOTTOM_TAIL, lifelineTop + LIFELINE_MIN_HEIGHT)
  const left = Math.min(contentMinX - CANVAS_PAD_X, CANVAS_MIN_X)
  const width = Math.max(contentMaxX - left + CANVAS_PAD_X, CANVAS_PAD_X * 2)
  const height = bottomBoxTop + lifelineTop + CANVAS_PAD_BOTTOM
  const actors = boxes.map((b) => ({ display: b.display, x: b.center - b.half - left, y: 0, w: b.w, h: b.h }))
  const lifelines = boxes.map((b) => ({ x: b.center - left, top: lifelineTop, bottom: bottomBoxTop }))
  for (const msg of messages) {
    msg.x1 -= left
    msg.x2 -= left
  }
  for (const note of notes) note.x -= left
  for (const frame of frames) frame.x -= left
  for (const act of activations) act.x -= left

  return {
    width,
    height,
    bottomY: bottomBoxTop,
    actors,
    lifelines,
    activations,
    notes,
    frames,
    messages,
  }
}
