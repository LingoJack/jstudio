/**
 * Standalone document viewer — rendered inside an exported HTML file.
 *
 * It is the app's own editor stack in read-only mode: same extensions, same
 * node views, same CSS. That is what makes an exported file behave like the
 * page instead of a screenshot of it.
 */

import { useEffect } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';

import { createSectionExtensions } from '../components/editor/sectionEditor/extensions';
import { fitTiptapJSON } from '../lib/editor/schemaFit';
import { ourBlocksToTiptapJSON } from '../lib/editor/tiptapAdapter';
import type { ViewerPayload } from './viewerPayload';

/**
 * Same editable-element classes `SectionEditor` sets, so the app's
 * `.ProseMirror …` rules apply to the exported page.
 */
const EDITOR_CLASS = 'max-w-none focus:outline-none px-4 md:px-12 lg:px-20';

export function DocumentViewer({ payload }: { payload: ViewerPayload }) {
  const editor = useEditor({
    extensions: createSectionExtensions({ placeholder: '' }),
    editable: false,
    editorProps: { attributes: { class: EDITOR_CLASS } },
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
  });

  // Load the document once the editor (and therefore its schema) exists, and
  // refit it first: stored blocks can predate a schema change, and an invalid
  // node would otherwise abort the whole setContent.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const json = { type: 'doc', content: ourBlocksToTiptapJSON(payload.blocks ?? []) };
    editor.commands.setContent(fitTiptapJSON(json, editor.schema));
  }, [editor, payload.blocks]);

  return (
    <div className="editor-scroll-container">
      <div className="px-4 md:px-12 lg:px-20 pb-4">
        <h1 className="text-4xl font-bold text-[var(--vscode-editor-foreground)] pb-1">
          {payload.doc.title}
        </h1>
      </div>
      <div className="tiptap-editor-container relative">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
