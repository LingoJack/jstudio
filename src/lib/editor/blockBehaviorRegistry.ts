/**
 * BlockBehaviorRegistry — centralized registry for block-type-specific behaviors.
 *
 * This enables each block extension to define its own deletion behavior (and potentially
 * other behaviors in the future) in a high-cohesion, low-coupling manner:
 *
 * - Each extension registers its behavior handler at module load time.
 * - BlockNavigation delegates to the registry via `handleBackspace()`.
 * - New block types only need to register their own handler — no central code changes.
 *
 * This follows the Open-Closed Principle: open for extension, closed for modification.
 */

import type { Editor } from '@tiptap/core';
import type { ResolvedPos } from '@tiptap/pm/model';

/**
 * Handler for a specific block type's deletion behavior.
 */
export interface BlockBehaviorHandler {
  /** Block type name (e.g., 'codeBlock', 'collapsible') */
  nodeType: string;

  /**
   * Determine whether the block can be deleted in the current state.
   * Called when Backspace is pressed inside or near the block.
   *
   * @param editor TipTap editor instance
   * @param $head Current cursor position (resolved position)
   * @returns true if the block should be deleted, false to skip
   */
  canDelete: (editor: Editor, $head: ResolvedPos) => boolean;

  /**
   * Execute the deletion operation.
   *
   * @param editor TipTap editor instance
   * @param $head Current cursor position (used to find the block position)
   * @returns true if deletion was performed, false if not
   */
  delete: (editor: Editor, $head: ResolvedPos) => boolean;
}

/**
 * Registry for block-type-specific behavior handlers.
 *
 * Usage:
 * 1. Each extension imports `blockBehaviorRegistry` and calls `register()`.
 * 2. BlockNavigation calls `handleBackspace()` to delegate deletion logic.
 */
class BlockBehaviorRegistry {
  private handlers: Map<string, BlockBehaviorHandler> = new Map();

  /**
   * Register a behavior handler for a block type.
   * Extensions should call this at module load time.
   */
  register(handler: BlockBehaviorHandler) {
    this.handlers.set(handler.nodeType, handler);
  }

  /**
   * Handle Backspace key by delegating to registered handlers.
   *
   * Walks up the ancestor chain from the cursor position, checking each
   * ancestor node type against registered handlers. If a handler's
   * `canDelete()` returns true, its `delete()` is called.
   *
   * @param editor TipTap editor instance
   * @returns true if a handler processed the deletion, false otherwise
   */
  handleBackspace(editor: Editor): boolean {
    const { selection } = editor.state;
    // Only handle collapsed (non-range) selections
    if (!selection.empty) return false;

    const $head = selection.$head;
    if ($head.depth < 1) return false;

    // Walk up the ancestor chain, looking for registered handlers
    for (let d = $head.depth; d >= 1; d--) {
      const node = $head.node(d);
      const handler = this.handlers.get(node.type.name);
      if (handler && handler.canDelete(editor, $head)) {
        return handler.delete(editor, $head);
      }
    }

    return false;
  }
}

/**
 * Singleton registry instance.
 * Extensions should import this and register their handlers.
 */
export const blockBehaviorRegistry = new BlockBehaviorRegistry();