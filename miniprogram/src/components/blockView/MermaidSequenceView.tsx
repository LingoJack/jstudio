import { ScrollView, Text, View } from '@tarojs/components'

import {
  ARROW_FILLED_LEN,
  SEQ_LINE_HEIGHT,
  type SequenceLayout,
  type SequenceMessageView,
} from '../../lib/mermaid/sequenceLayout'

/**
 * mermaid 时序图只读渲染：按 sequenceLayout 的绝对定位数据画图。
 * 配色为 mermaid 默认亮色主题（浅紫参与者盒 / 深灰消息线 / 浅黄注释），
 * 样式见 blockView.scss 的 .bv-mermaid-* 段。
 * 渲染顺序即 z 序：帧（底）→ 生命线 → 激活段 → 注释 → 消息 → 参与者盒子（顶）。
 */

function px(v: number): string {
  return `${v}px`
}

function boxStyle(x: number, y: number, w: number, h: number): Record<string, string> {
  return { left: px(x), top: px(y), width: px(w), height: px(h) }
}

/** 消息线 / 回路线的类名（虚线用 border-top 实现）。 */
function lineClass(view: SequenceMessageView): string {
  return view.dashed ? 'bv-mermaid-msg-line-dashed' : 'bv-mermaid-msg-line-solid'
}

/** 箭头端点（x2 处）按样式与方向渲染。 */
function ArrowView({ view }: { view: SequenceMessageView }) {
  const { x2, y, dir, arrow } = view
  if (arrow === 'filled') {
    const style = dir === 'right'
      ? { left: px(x2 - ARROW_FILLED_LEN), top: px(y - 5) }
      : { left: px(x2), top: px(y - 5) }
    return <View className={`bv-mermaid-arrow-filled-${dir}`} style={style} />
  }
  if (arrow === 'open') {
    const style = dir === 'right'
      ? { left: px(x2 - 8.5), top: px(y - 3.5) }
      : { left: px(x2 + 1.5), top: px(y - 3.5) }
    return <View className={`bv-mermaid-arrow-open-${dir}`} style={style} />
  }
  // cross（-x / --x）：两根交叉短线组成 X，中心落在端点上。
  const style = { left: px(x2 - 5.5), top: px(y - 0.75) }
  return (
    <View>
      <View className='bv-mermaid-arrow-cross-bar bv-mermaid-rotate-45' style={style} />
      <View className='bv-mermaid-arrow-cross-bar bv-mermaid-rotate-neg-45' style={style} />
    </View>
  )
}

/** autonumber 编号圆点：普通消息在发送端线内缩进处，自环在回路右竖线上。 */
function NumberBadge({ view }: { view: SequenceMessageView }) {
  if (view.number === undefined) return null
  const inset = 14
  const cx = view.self
    ? view.x1 + view.self.loopW
    : view.dir === 'right' ? view.x1 + inset : view.x1 - inset
  const cy = view.self ? view.y + view.self.loopH * 0.4 : view.y
  return (
    <View className='bv-mermaid-seq-num' style={{ left: px(cx - 9), top: px(cy - 9) }}>
      <Text className='bv-mermaid-seq-num-text'>{view.number}</Text>
    </View>
  )
}

/** 单条消息：普通消息是「线 + 箭头 + 居中标签」，自环是 U 形回路 + 左对齐标签。 */
function MessageItems({ view }: { view: SequenceMessageView }) {
  if (view.self) {
    const { loopW, loopH } = view.self
    const labelH = view.lines.length * SEQ_LINE_HEIGHT
    return (
      <View>
        <View className={lineClass(view)} style={{ left: px(view.x1), top: px(view.y - 0.75), width: px(loopW) }} />
        <View
          className='bv-mermaid-msg-line-solid'
          style={{ left: px(view.x1 + loopW - 0.75), top: px(view.y), width: px(1.5), height: px(loopH) }}
        />
        <View
          className={lineClass(view)}
          style={{
            left: px(view.x1 + ARROW_FILLED_LEN),
            top: px(view.y + loopH - 0.75),
            width: px(Math.max(loopW - ARROW_FILLED_LEN, 0)),
          }}
        />
        <View className='bv-mermaid-arrow-filled-left' style={{ left: px(view.x1), top: px(view.y + loopH - 5) }} />
        <View
          className='bv-mermaid-msg-text bv-mermaid-msg-text-left'
          style={{ left: px(view.x1 + 8), top: px(view.y - 6 - labelH) }}
        >
          {view.lines.map((line, i) => <Text key={i} className='bv-mermaid-msg-text-line'>{line}</Text>)}
        </View>
      </View>
    )
  }
  const left = Math.min(view.x1, view.x2)
  const mid = (view.x1 + view.x2) / 2
  const boxW = view.textW + 16
  return (
    <View>
      <View
        className={lineClass(view)}
        style={{
          left: px(left),
          top: px(view.y - 0.75),
          width: px(Math.max(Math.abs(view.x2 - view.x1) - ARROW_FILLED_LEN, 0)),
        }}
      />
      <ArrowView view={view} />
      <View
        className='bv-mermaid-msg-text'
        style={{ left: px(mid - boxW / 2), top: px(view.y - 4 - view.lines.length * SEQ_LINE_HEIGHT), width: px(boxW) }}
      >
        {view.lines.map((line, i) => <Text key={i} className='bv-mermaid-msg-text-line'>{line}</Text>)}
      </View>
    </View>
  )
}

/**
 * 时序图画布。宽度超出可视区时横向滚动（与代码块一致，不做缩放）。
 */
export function MermaidSequenceView({ layout }: { layout: SequenceLayout }) {
  return (
    <ScrollView className='bv-mermaid-scroll' scrollX>
      <View className='bv-mermaid-canvas' style={{ width: px(layout.width), height: px(layout.height) }}>
        {layout.frames.map((frame, i) => (
          <View key={`frame-${i}`}>
            <View className='bv-mermaid-frame' style={boxStyle(frame.x, frame.y, frame.w, frame.h)} />
            {frame.label !== '' && (
              <Text className='bv-mermaid-frame-label' style={{ left: px(frame.x + 12), top: px(frame.y + 5) }}>
                {frame.label}
              </Text>
            )}
            {frame.dividers.map((div, j) => (
              <View key={`div-${j}`}>
                <View
                  className='bv-mermaid-frame-divider'
                  style={{ left: px(frame.x + 8), top: px(div.y), width: px(frame.w - 16) }}
                />
                {div.label !== '' && (
                  <Text className='bv-mermaid-frame-label' style={{ left: px(frame.x + 16), top: px(div.y - 18) }}>
                    {div.label}
                  </Text>
                )}
              </View>
            ))}
          </View>
        ))}
        {layout.lifelines.map((line, i) => (
          <View
            key={`life-${i}`}
            className='bv-mermaid-lifeline'
            style={{ left: px(line.x - 0.5), top: px(line.top), height: px(line.bottom - line.top) }}
          />
        ))}
        {layout.activations.map((act, i) => (
          <View
            key={`act-${i}`}
            className='bv-mermaid-activation'
            style={{ left: px(act.x - 5), top: px(act.top), height: px(act.bottom - act.top) }}
          />
        ))}
        {layout.notes.map((note, i) => (
          <View key={`note-${i}`} className='bv-mermaid-note' style={boxStyle(note.x, note.y, note.w, note.h)}>
            {note.lines.map((line, j) => <Text key={j} className='bv-mermaid-msg-text-line'>{line}</Text>)}
          </View>
        ))}
        {layout.messages.map((view, i) => (
          <View key={`msg-${i}`}>
            <MessageItems view={view} />
            <NumberBadge view={view} />
          </View>
        ))}
        {[0, 1].map((row) =>
          layout.actors.map((actor, i) => (
            <View
              key={`actor-${row}-${i}`}
              className='bv-mermaid-actor'
              style={boxStyle(actor.x, row === 0 ? actor.y : layout.bottomY, actor.w, actor.h)}
            >
              {actor.display.split('\n').map((line, j) => (
                <Text key={j} className='bv-mermaid-actor-text'>{line}</Text>
              ))}
            </View>
          )),
        )}
      </View>
    </ScrollView>
  )
}
