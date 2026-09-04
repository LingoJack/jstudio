/**
 * ChildWindowDragBar — invisible drag strip at the top of chrome-less
 * child windows (document / terminal / diagram / preview detach windows).
 *
 * These windows use `titleBarStyle: 'hiddenInset'` (electron/main.ts
 * createChildWindow), which removes the native title-bar strip but keeps
 * the traffic lights. This bar provides the window drag region across the
 * top — same 36px height as the main window's AppTitleBar; the
 * `[data-tauri-drag-region]` attribute maps to `-webkit-app-region: drag`
 * in vscode-theme.css.
 *
 * z-10 keeps it above static content (page text, canvas) but below the
 * interactive overlays that need clicks — the terminal tab strip (z-20)
 * and floating widgets like FindBar (z-popover, already `.no-drag`).
 * Empty areas of the strip drag the window; covered areas stay clickable.
 */
export default function ChildWindowDragBar() {
  return (
    <div
      data-tauri-drag-region
      className="absolute top-0 inset-x-0 h-9 z-10"
    />
  );
}
