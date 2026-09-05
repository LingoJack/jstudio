import { useEffect, useRef } from 'react';
import { useStore } from '../../store/useStore';
import { getTerminalThemeFromAppTheme } from '../../lib/terminal/themes';
import TerminalTabs from './TerminalTabs';
import PaneLayoutView from './PaneLayoutView';
import '@xterm/xterm/css/xterm.css';

// ── 终端网格的 chrome 避让（背景上穿、文字不上穿）──────────────────
// 文档是流式内容，文字只在滚动瞬间掠过玻璃栏；终端是像素网格，首行/末行
// 常驻（提示符通常就在最后一行），被红绿灯/胶囊压住就成了永久遮挡，且顶部
// 36px 是拖拽区，落进去的行点不到选不中。因此背景照常上穿保持连续观感，
// 网格本体让出 chrome 区域（kitty 窗口内边距的思路）。
// 数字来源（见 TabBar.tsx 胶囊注释）：玻璃标题栏 36px；胶囊 ~46px，停靠时
// translate-y-1/2 下垂到 ~59px；底部浮动胶囊 = pb-3.5(14px) + 胶囊 ≈ 60px。
const DOCKED_TOP_INSET_PX = 64;   // 主窗口 'top'：胶囊停靠标题栏（与 DocumentPanel 的 pt-16 对齐）
const DETACHED_TOP_INSET_PX = 56; // 拆离窗口 'top'：浮动胶囊 top-0 + pt-1 + ~46px
const CHROME_TOP_INSET_PX = 40;   // 顶部无胶囊：仅玻璃栏/子窗口拖拽条 36px + 4px 余量
const BOTTOM_INSET_PX = 64;       // 'bottom'：底部浮动胶囊 ~60px + 4px 余量

/**
 * TerminalPanel — top-level container for the terminal view.
 *
 * Always renders its own `<TerminalTabs />` tab bar.
 * NOTE: All keyboard shortcuts are now handled centrally by ShortcutManager.
 */
export default function TerminalPanel({
  hidden,
  tabStripLeftInsetPx = 0,
  detached = false,
}: {
  hidden?: boolean;
  /** Left padding for the floating tab strip — used by detached terminal
   *  windows to keep the strip clear of the macOS traffic lights. */
  tabStripLeftInsetPx?: number;
  /** True in the torn-off child window (no AppTitleBar / title-bar slot;
   *  the tab strip floats and the chrome to clear is only the drag bar +
   *  traffic lights). Drives the grid inset heights. */
  detached?: boolean;
}) {
  const groups = useStore((s) => s.groups);
  const activeGroupId = useStore((s) => s.activeGroupId);
  const sessions = useStore((s) => s.sessions);
  const createSession = useStore((s) => s.createSession);
  const appThemeIdDark = useStore((s) => s.appThemeIdDark);
  const appThemeIdLight = useStore((s) => s.appThemeIdLight);
  const isDarkMode = useStore((s) => s.isDarkMode);
  const tabBarPosition = useStore((s) => s.tabBarPosition);

  // Terminal theme follows app theme (same IDs: jstudio-dark, jstudio-light, ink-dark, ink-light)
  const appThemeId = isDarkMode ? appThemeIdDark : appThemeIdLight;
  const theme = getTerminalThemeFromAppTheme(appThemeId, isDarkMode);

  const activeGroup = groups.find((g) => g.id === activeGroupId);
  const hasSessions = activeGroup && activeGroup.sessionIds.length > 0;

  // ── 网格避让：顶部让出玻璃栏/停靠/浮动胶囊，底部让出浮动胶囊 ──
  // 'bottom' 的胶囊永远是浮动条（只有 'top' 会停靠标题栏），压住的是
  // 提示符所在的末行，所以底部同样要避让。
  const topInsetPx = tabBarPosition === 'top'
    ? (detached ? DETACHED_TOP_INSET_PX : DOCKED_TOP_INSET_PX)
    : CHROME_TOP_INSET_PX;
  const bottomInsetPx = tabBarPosition === 'bottom' ? BOTTOM_INSET_PX : 0;

  // ── Auto-create: if no sessions exist, spawn one automatically ──
  // Use a ref guard so createSession is only called once, even under
  // React StrictMode (which double-invokes effects in development).
  const initRef = useRef(false);
  useEffect(() => {
    if (!hasSessions && !initRef.current) {
      initRef.current = true;
      createSession();
    }
  }, [hasSessions, createSession]);

  // While the first session is being created, show a minimal loading shell.
  if (!hasSessions) {
    return (
      <div
        className="w-full h-full flex flex-col relative overflow-hidden"
        style={{ background: theme.ui.panelBg }}
      >
        {/* Tab bar 悬浮在内容上方，根据 tabBarPosition 决定位置；
            'top' 时由 TerminalTabs 自行 portal 进标题栏槽位 */}
        <div
          className={`absolute left-0 right-0 z-20 pointer-events-none ${tabBarPosition === 'top' ? 'top-0' : 'bottom-0'}`}
          style={tabBarPosition === 'top' ? { paddingLeft: tabStripLeftInsetPx } : undefined}
        >
          <div className="pointer-events-auto">
            <TerminalTabs hidden={hidden} />
          </div>
        </div>
        <div className="flex-1" />
      </div>
    );
  }

  // ── Resolve session ids for the active group ─────────────────────
  const groupSessionIds = activeGroup.sessionIds.filter((sid) =>
    sessions.some((s) => s.id === sid),
  );

  return (
    <div
      className="w-full h-full flex flex-col relative overflow-hidden"
      style={{ background: theme.ui.panelBg }}
    >
      {/* Tab bar 悬浮在内容上方，根据 tabBarPosition 决定位置；
          'top' 时由 TerminalTabs 自行 portal 进标题栏槽位 */}
      <div
        className={`absolute left-0 right-0 z-20 pointer-events-none ${tabBarPosition === 'top' ? 'top-0' : 'bottom-0'}`}
        style={tabBarPosition === 'top' ? { paddingLeft: tabStripLeftInsetPx } : undefined}
      >
        <div className="pointer-events-auto">
          <TerminalTabs hidden={hidden} />
        </div>
      </div>
      {/* 内容区域：背景铺满（含标题栏/胶囊下方），文字网格由
          PaneLayoutView 按 topInsetPx/bottomInsetPx 避让 chrome */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <PaneLayoutView
          groupId={activeGroup.id}
          sessionIds={groupSessionIds}
          activeSessionId={activeGroup.activeSessionId}
          layout={activeGroup.layout}
          resizeState={activeGroup.resizeState}
          hidden={hidden}
          topInsetPx={topInsetPx}
          bottomInsetPx={bottomInsetPx}
        />
      </div>
    </div>
  );
}
