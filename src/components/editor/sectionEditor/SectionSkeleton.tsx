/** Skeleton overlay shown while section editors are loading content.
 *  Prevents the user from seeing empty editors / placeholder text during the
 *  load. OPAQUE: sits on top of the still-mounted editors. */
export function EditorSkeleton() {
  return (
    <div
      className="absolute inset-0 z-10 overflow-hidden px-4 md:px-12 lg:px-20 pt-2 bg-[var(--vscode-editor-background)]"
      aria-hidden="true"
    >
      <div className="space-y-3 animate-pulse">
        <div className="h-4 w-3/4 rounded bg-[var(--vscode-input-background)]" />
        <div className="h-4 w-11/12 rounded bg-[var(--vscode-input-background)]" />
        <div className="h-4 w-2/3 rounded bg-[var(--vscode-input-background)]" />
        <div className="h-4 w-5/6 rounded bg-[var(--vscode-input-background)]" />
        <div className="mt-8 h-24 w-full rounded bg-[var(--vscode-input-background)]" />
        <div className="mt-8 h-4 w-1/2 rounded bg-[var(--vscode-input-background)]" />
        <div className="h-4 w-4/5 rounded bg-[var(--vscode-input-background)]" />
        <div className="h-4 w-3/5 rounded bg-[var(--vscode-input-background)]" />
      </div>
    </div>
  );
}
