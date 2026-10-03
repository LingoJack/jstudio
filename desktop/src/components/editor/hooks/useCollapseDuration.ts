/**
 * useCollapseDuration — 收起/展开动画按"固定速率"计时长。
 *
 * 高度延伸动画（grid 0fr↔1fr）的 transition-duration 若是固定值，
 * 100px 的小块和 1000px 的大块用同一时长，大块的延伸速率会非常快，
 * 观感是"唰一下弹开"。这里改为按固定速率（px/ms）折算时长：块越高
 * 延伸越久，小块不拖沓、大块不闪过，任意块的延伸速度一致。
 *
 * 在 collapsed 切换的 useLayoutEffect 里测量过渡距离并把毫秒数写入
 * host（块 figure）上的 CSS 变量 --collapse-ms / --collapse-out-ms
 * （无单位数字，由共用动画段的 calc() 消费）。挂在 figure 而不是 clip
 * 上，是因为折叠块的分割线（.collapsible-block-header::after）要与
 * 内容延伸衔接 —— 它的延迟取 var(--collapse-ms)，而 header 与 clip
 * 同级，只有挂到共同祖先才能继承到。用 layout effect 是为了赶在浏览
 * 器下一次样式计算之前写入 —— 刚被 class 切换触发的过渡直接以新时长
 * 启动，不会先用 CSS fallback 起跑再被改写。测量目标距离：
 *   - 即将展开：clip 在新布局（1fr）下的 clientHeight；
 *   - 即将收起：inner 的 scrollHeight（0fr 下 inner 高 0，但
 *     scrollHeight 仍等于内容自然高）。
 * 两者都是"内容自然高度"，即本次过渡要走的像素距离。
 *
 * 内容不做 opacity 淡入 —— 显现完全由高度裁切驱动（从上到下逐渐
 * 露出，图片 likewise 一点一点展开），visibility 的 discrete 延迟等于
 * 收起主时长（焦点管理）。收起与展开是两套速率参数（收起更慢，见
 * COLLAPSE_SPEED_PX_PER_MS 的说明）；收起曲线为匀速 linear（见 CSS
 * 共用段）。收起条塌陷层（.code-block-bar-clip）保持固定短时长 ——
 * 30px 的距离用短时长本身就是高速率，且条不该在长块延伸时拖泥带水。
 */

import { useLayoutEffect, type RefObject } from "react";

/** 展开速率基准：0.5 px/ms ≈ 500px/s —— 固定时长版约 940px/s 的一半。 */
const EXPAND_SPEED_PX_PER_MS = 0.5;
/**
 * 收起速率基准：0.3 px/ms ≈ 300px/s —— 故意比展开慢。内容"消失"的
 * 过程人眼对速度更敏感（同样速率下收起总显得比展开快，实测两轮用户
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

export function useCollapseDuration(
  /** CSS 变量的挂载点（块 figure）—— clip 与 header 的共同祖先。 */
  hostRef: RefObject<HTMLDivElement | null>,
  /** 过渡距离的测量点：clip（grid 容器）与 inner（行子项）。 */
  clipRef: RefObject<HTMLDivElement | null>,
  innerRef: RefObject<HTMLDivElement | null>,
  collapsed: boolean,
): void {
  useLayoutEffect(() => {
    const host = hostRef.current;
    const clip = clipRef.current;
    const inner = innerRef.current;
    if (!host || !clip || !inner) return;
    const distancePx = collapsed ? inner.scrollHeight : clip.clientHeight;
    const expandMs = Math.min(
      EXPAND_MAX_MS,
      Math.max(MIN_MS, distancePx / EXPAND_SPEED_PX_PER_MS),
    );
    const collapseMs = Math.min(
      COLLAPSE_MAX_MS,
      Math.max(MIN_MS, distancePx / COLLAPSE_SPEED_PX_PER_MS),
    );
    host.style.setProperty("--collapse-ms", expandMs.toFixed(0));
    host.style.setProperty("--collapse-out-ms", collapseMs.toFixed(0));
  }, [hostRef, clipRef, innerRef, collapsed]);
}

