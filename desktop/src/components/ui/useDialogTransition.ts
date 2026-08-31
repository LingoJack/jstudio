import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

/**
 * 弹窗入场/退场动画状态。
 *
 * - `'closed'` -- 组件未挂载（return null）
 * - `'enter'`  -- 入场动画播放中
 * - `'exit'`   -- 退场动画播放中，结束后自动切回 `'closed'`
 *
 * 用 `useLayoutEffect` 确保状态更新在浏览器绘制前完成，杜绝闪烁。
 */
export type DialogTransitionState = 'closed' | 'enter' | 'exit';

export function useDialogTransition(
  open: boolean,
  exitDuration = 180,
): DialogTransitionState {
  const [state, setState] = useState<DialogTransitionState>(
    open ? 'enter' : 'closed',
  );
  const prevOpen = useRef(open);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useLayoutEffect(() => {
    if (open && !prevOpen.current) {
      // ── 开启：取消任何 pending 的退场计时，切到入场 ──
      if (exitTimer.current) {
        clearTimeout(exitTimer.current);
        exitTimer.current = undefined;
      }
      setState('enter');
    } else if (!open && prevOpen.current) {
      // ── 关闭：切到退场，计时结束后卸载 ──
      setState('exit');
      exitTimer.current = setTimeout(() => {
        setState('closed');
        exitTimer.current = undefined;
      }, exitDuration);
    }
    prevOpen.current = open;
  }, [open, exitDuration]);

  // 卸载时清除计时器
  useEffect(
    () => () => {
      if (exitTimer.current) clearTimeout(exitTimer.current);
    },
    [],
  );

  return state;
}

/**
 * 给**条件渲染**（没有 `open` prop）的弹窗使用。
 *
 * 返回 `{ exiting, close }`：
 * - `close()` -- 触发退场动画，`exitDuration` 后才真正调用 `onClose`
 * - `exiting` -- 是否处于退场中（用于切换 CSS 动画类）
 */
export function useAnimatedExit(onClose: () => void, exitDuration = 180) {
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const close = useCallback(() => {
    if (exiting) return;
    setExiting(true);
    timerRef.current = setTimeout(() => {
      onClose();
    }, exitDuration);
  }, [exiting, onClose, exitDuration]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return { exiting, close };
}
