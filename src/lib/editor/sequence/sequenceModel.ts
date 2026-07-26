/**
 * sequenceModel — 时序图的领域模型（引擎无关、纯数据）。
 *
 * 这一层不引用 maxGraph / GraphSnapshot，只描述"时序图的抽象结构"：
 *   - 参与者（Participant）：一列生命线
 *   - 消息（SeqMessage）：一次调用/事件
 *
 * 三条生成路径都先构造这些抽象类型，再统一交给 `sequenceLayout.layoutSequence`
 * 转成 `GraphNode[] / GraphEdge[]`。这样"时序图的语义"和"maxGraph 的表达"
 * 只需在一个地方连接。
 */

/** 参与者（lifeline 的语义源）。 */
export interface Participant {
  /** 稳定 id；输出到 GraphNode.id。 */
  id: string;
  /** 显示文本（生命线头部标签）。 */
  label: string;
}

/** 消息线（时序图核心）。 */
export interface SeqMessage {
  /** 稳定 id；输出到 GraphEdge.id。 */
  id: string;
  /** 源参与者 id。 */
  fromParticipantId: string;
  /** 目标参与者 id。 */
  toParticipantId: string;
  /** 消息文字（可选）。 */
  label?: string;
  /** 是否虚线（通常用于"返回消息 / 异步响应"）。 */
  dashed?: boolean;
  /**
   * 目标端箭头样式：'classic' | 'none' | 其它 maxGraph 支持的箭头名。
   * 未指定时默认 'classic'。
   */
  endArrow?: string;
  /**
   * 语义标记：是否为"返回消息"。当前布局不区别对待，仅作为透传的元信息，
   * 允许未来的高级布局（如返回消息不生成 activation）读取。
   */
  isReturn?: boolean;
}
