import React from 'react';

/**
 * Reusable icon button — standardises the VS Code-style 24×24 icon button
 * that was previously inlined as a long Tailwind className string in
 * AttachmentBlock, WebEmbedBlock, CodeBlock and several other components.
 *
 * Variants:
 *  - `default`:  transparent background, icon-foreground text
 *  - `active`:   list-activeSelection background
 *  - `danger`:   errorForeground on hover
 */
interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'active' | 'danger';
}

const VARIANT_CLASSES: Record<NonNullable<IconButtonProps['variant']>, string> = {
  default:
    'text-[var(--vscode-icon-foreground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]',
  active:
    'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-foreground)]',
  danger:
    'text-[var(--vscode-icon-foreground)] hover:text-[var(--vscode-errorForeground)] hover:bg-[var(--vscode-list-hoverBackground)]',
};

export const IconButton = React.forwardRef<
  HTMLButtonElement,
  IconButtonProps
>(({ variant = 'default', className = '', ...props }, ref) => {
  return (
    <button
      ref={ref}
      type="button"
      className={`cursor-pointer inline-flex items-center justify-center w-6 h-6 rounded transition-colors ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
});

IconButton.displayName = 'IconButton';
