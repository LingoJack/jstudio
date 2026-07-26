/**
 * sequenceConstants — 时序图布局的唯一常量真源（Single Source of Truth）。
 *
 * 历史问题：这些常量此前散落在至少 4 个文件里各自定义（graphCanvasStyle 的
 * DEFAULT_SIZE、sequenceInteraction 的 ACTIVATION_W/H、sequenceConverter 的
 * 各种 *_WIDTH/*_SPACING、aiGraphLayout 的 SEQ_* 前缀），且存在数值漂移
 * （activation 高度一处 60、三处 40；head 高度一处硬编码 50 不引用真源）。
 *
 * 现在所有涉及时序图的代码（手绘交互、Mermaid 导入、AI 布局、快照默认尺寸）
 * 都必须从本文件 import，不允许再本地定义同名常量。
 */

/** lifeline 头部（矩形部分）高度（像素）。 */
export const HEAD_HEIGHT = 50;

/** lifeline（生命线）宽度（像素）——即头部矩形的宽。 */
export const LIFELINE_WIDTH = 100;

/**
 * lifeline 默认高度（像素）。
 * 手绘落点使用此值；生成路径（Mermaid/AI）会按消息数动态放大，
 * 但下界为此值，避免只有 1 条消息时生命线过短。
 */
export const LIFELINE_DEFAULT_HEIGHT = 200;

/** 相邻两条 lifeline 的水平中心间距（像素）。 */
export const PARTICIPANT_SPACING = 150;

/** 相邻两条消息在 Y 方向的间距（像素）。 */
export const MESSAGE_SPACING = 40;

/** 第一条消息距离 lifeline 头部底边的偏移（像素）。 */
export const MESSAGE_TOP_OFFSET = 20;

/** 第一条消息相对 lifeline 顶部的 Y 偏移（= HEAD_HEIGHT + MESSAGE_TOP_OFFSET）。 */
export const MESSAGE_START_Y = HEAD_HEIGHT + MESSAGE_TOP_OFFSET;

/** activation（激活框）宽度（像素）。 */
export const ACTIVATION_WIDTH = 16;

/**
 * activation 高度（像素）。
 *
 * 注意：此前 `graphCanvasStyle.DEFAULT_SIZE.activation.h` 曾错误地设为 60，
 * 而其它三处（sequenceInteraction、sequenceConverter、aiGraphLayout）都用 40。
 * 统一以 40 为准——它对应 UML 时序图里"处理一条消息"的典型活跃时段视觉高度。
 */
export const ACTIVATION_HEIGHT = 40;

/** 注释框（note）默认宽度（像素）。 */
export const NOTE_WIDTH = 100;

/** 注释框（note）默认高度（像素）。 */
export const NOTE_HEIGHT = 60;

/** 画布内容距离画布顶/左的边距（像素）。 */
export const CANVAS_MARGIN = 50;

/**
 * 生命线底部预留 padding（像素）——最后一条消息到 lifeline 底部之间的空白。
 * 用于计算 lifeline 高度：max(默认高, 顶部 + 消息数 * spacing + 底部 padding)。
 */
export const LIFELINE_BOTTOM_PADDING = 50;
