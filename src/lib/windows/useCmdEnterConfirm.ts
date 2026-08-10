/**
 * useCmdEnterConfirm — 在 Cmd/Ctrl+Enter 按下时触发"确认"回调。
 *
 * 用于 diagram 编辑场景（嵌入式 block 与独立窗口两种入口）：
 *   - 嵌入式 DiagramBlockView：editing 时按 Cmd+Enter 退出编辑模式
 *   - 独立 DiagramWindowApp：按 Cmd+Enter 关闭窗口（提交最新快照）
 *
 * 使用 capture 阶段监听，先于 maxGraph 内置 keymap 处理，
 * 避免 Cmd+Enter 被画板引擎拦截成"绑定文本到形状"等内部行为。
 *
 * 例外：当正在内联编辑某个 shape 的文本时，useGraphKeyboard（子组件 effect，
 * 注册更早）会先拦截 Cmd+Enter，调用 graph.stopEditing(false) 确认 shape 文本编辑，
 * 并用 stopImmediatePropagation 阻止本 hook 触发，避免误退出整个块的编辑模式。
 *
 * @param callback 触发确认时的回调（exitEditing / close window）
 * @param enabled  是否启用监听，默认 true。false 时不挂任何监听器。
 */
import { useEffect } from 'react';

export function useCmdEnterConfirm(
  callback: () => void,
  enabled: boolean = true,
): void {
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      // IME 组合中忽略，避免中断中文/日文输入
      if (e.isComposing || e.keyCode === 229) return;
      // 仅匹配 Mod+Enter，不接受 Shift/Alt 修饰（避免与 Cmd+Shift+Enter 冲突）
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.altKey || e.shiftKey) return;
      if (e.key !== 'Enter') return;

      e.preventDefault();
      e.stopPropagation();
      callback();
    };

    // capture 阶段：先于 maxGraph 的 bubble 阶段 keymap。
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [callback, enabled]);
}
