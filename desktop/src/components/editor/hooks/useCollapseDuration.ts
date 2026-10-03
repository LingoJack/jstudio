/**
 * useCollapseDuration — 收起/展开动画按"固定速率"计时长。
 *
 * 高度延伸动画（grid 0fr↔1fr）的 transition-duration 若是固定值，
 * 100px 的小块和 1000px 的大块用同一时长，大块的延伸速率会非常快，
 * 观感是"唰一下弹开"。这里改为按固定速率（px/ms）折算时长：块越高
 * 延伸越久，小块不拖沓、大块不闪过，任意块的延伸速度一致。
 *
 * ── 写入必须先于任何样式读取（实测踩坑）──
 *
 * transition 的时长取自"样式计算时刻"的 transition-* 计算值。layout
 * effect 运行时 React 的 DOM mutation（class 切换）已发生，此 effect
 * 里对 scrollHeight / clientHeight / getBoundingClientRect 的任何读取
 * 都会强制样式计算 —— 过渡当场启动，此刻变量还是上一次写入的值；
 * 之后才写入的新值对已启动的过渡无效（Chrome/WebKit 实测：transition
 * duration 在 recalc 时刻定格）。旧实现"先读距离、再写变量"因此在
 * 变量陈旧时回落到 CSS fallback（240ms），收起快得像瞬间塌掉。
 *
 * 修正后的时序：
 *   1. 先写变量 —— 距离用 lastDistanceRef 里上一次测得的"内容自然
 *      高度"（稳态下与本次相同），不触发任何样式计算；
 *   2. 再读 inner.scrollHeight 刷新 ref —— 这次强制样式计算会以刚
 *      写入的变量启动过渡，读到的值供下一次切换使用。
 *      scrollHeight 恒等于内容自然高：展开态 inner 高 1fr、收起态高 0
 *      但内容溢出，过渡动画的起始帧也不改变它 —— 两个方向通读。
 *
 * 变量挂在 host（块 figure）上而不是 clip：折叠块的分割线
 * （.collapsible-block-header::after）与 clip 是兄弟节点，它的延迟要
 * 取 var(--collapse-out-ms)，只有挂到共同祖先才能继承到。
 *
 * 内容不做 opacity 淡入 —— 显现完全由高度裁切驱动（从上到下逐渐
 * 露出，图片 likewise 一点一点展开），visibility 的 discrete 延迟等于
 * 收起主时长（焦点管理）。收起与展开是两套速率参数（收起更慢，见
 * COLLAPSE_SPEED_PX_PER_MS 的说明）；收起曲线为匀速 linear（见 CSS
 * 共用段）。收起条塌陷层（.code-block-bar-clip）保持固定短时长 ——
 * 30px 的距离用短时长本身就是高速率，且条不该在长块延伸时拖泥带水。
 */

import { useLayoutEffect, useRef, type RefObject } from "react";

/** 展开速率基准：0.5 px/ms ≈ 500px/s —— 固定时长版约 940px/s 的一半。 */
const EXPAND_SPEED_PX_PER_MS = 0.5;
/**
 * 收起速率基准：0.3 px/ms ≈ 300px/s —— 故意比展开慢。内容"消失"的
 * 过程人眼对速度更敏感（同样速率下收起总显得比展开快，实测多轮用户
 * 反馈"收起太快"），收起放慢后往返观感才均衡；收起曲线同时改为匀速
 * （linear），S 曲线中段 1.5× 的速度峰值也是"偏快"感的来源。
 */
const COLLAPSE_SPEED_PX_PER_MS = 0.3;
/**
 * 时长钳制（各方向独立）。下限防小块瞬间弹开；上限只防极端超长块拖沓，
 * 钳内严格固定速率 —— 上限曾是 1200ms，导致 600px 以上的块全部被钳、
 * 实际速率远超基准（"固定速率"名存实亡，收起显得快），已放宽。
 */
const MIN_MS = 150;
const EXPAND_MAX_MS = 3000;
const COLLAPSE_MAX_MS = 4500;

function clampDuration(distancePx: number, speed: number, maxMs: number): string {
  return Math.min(maxMs, Math.max(MIN_MS, distancePx / speed)).toFixed(0);
}

export function useCollapseDuration(
  /** CSS 变量的挂载点（块 figure）—— clip 与 header 的共同祖先。 */
  hostRef: RefObject<HTMLDivElement | null>,
  /** 内容容器的测量点：inner（行子项），其 scrollHeight 恒等于内容
      自然高（两个方向、过渡动画的任意时刻都成立）。 */
  clipRef: RefObject<HTMLDivElement | null>,
  innerRef: RefObject<HTMLDivElement | null>,
  collapsed: boolean,
): void {
  // 上一次测得的内容自然高度（px）。挂载时首次测量，之后每次切换
  // 先用它写变量、再用本次读取刷新 —— 稳态下两次测量值相同。
  const lastDistanceRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const host = hostRef.current;
    const inner = innerRef.current;
    const clip = clipRef.current;
    if (!host || !inner || !clip) return;

    // 1. 先写：绝不能让下面第 2 步的读取成为本次切换后第一次样式
    //    计算 —— 那会让过渡以上一次的变量值（或 fallback）定格。
    const last = lastDistanceRef.current;
    if (last != null) {
      host.style.setProperty(
        "--collapse-ms",
        clampDuration(last, EXPAND_SPEED_PX_PER_MS, EXPAND_MAX_MS),
      );
      host.style.setProperty(
        "--collapse-out-ms",
        clampDuration(last, COLLAPSE_SPEED_PX_PER_MS, COLLAPSE_MAX_MS),
      );
    }

    // 2. 后读：这次强制样式计算会以刚写入的变量启动过渡；读到的
    //    内容自然高（布局值，不受过渡插值影响）记给下一次切换。
    lastDistanceRef.current = inner.scrollHeight;
  }, [hostRef, clipRef, innerRef, collapsed]);
}
