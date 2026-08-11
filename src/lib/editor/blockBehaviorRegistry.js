class BlockBehaviorRegistry {
  handlers = /* @__PURE__ */ new Map();
  /**
   * Register a behavior handler for a block type.
   * Extensions should call this at module load time.
   */
  register(handler) {
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
  handleBackspace(editor) {
    const { selection } = editor.state;
    if (!selection.empty) return false;
    const $head = selection.$head;
    if ($head.depth < 1) return false;
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
const blockBehaviorRegistry = new BlockBehaviorRegistry();
export {
  blockBehaviorRegistry
};
