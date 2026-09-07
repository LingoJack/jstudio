/**
 * Standalone document viewer — rendered inside an exported HTML file.
 *
 * It is the app's own editor stack in read-only mode: same extensions, same
 * node views, same CSS, same outline rail. That is what makes an exported
 * file behave like the page instead of a screenshot of it.
 *
 * Like the app, it renders one ProseMirror instance *per section* instead of
 * one for the whole document: a single editor holding hundreds of thousands of
 * characters has to build every node view up front — exactly the slowness the
 * sectioned editor exists to avoid, and enough to keep a large export from
 * ever opening. Sections mount in batches so the first screen paints before
 * the rest of the document exists.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';

import SectionOutline from '../components/editor/sectionEditor/SectionOutline';
import EditorScrollCursor from '../components/editor/sectionEditor/EditorScrollCursor';
import { createSectionExtensions } from '../components/editor/sectionEditor/extensions';
import { fitTiptapJSON } from '../lib/editor/schemaFit';
import { splitIntoSections } from '../lib/editor/sectioning';
import { ourBlocksToTiptapJSON } from '../lib/editor/tiptapAdapter';
import type { Block } from '../types';
import type { ViewerPayload } from './viewerPayload';

/**
 * Same editable-element classes `SectionEditor` sets, so the app's
 * `.ProseMirror …` rules apply to the exported page.
 */
const EDITOR_CLASS = 'max-w-none focus:outline-none px-4 md:px-12 lg:px-20';

/** Sections mounted right away (enough to fill the first screen). */
const INITIAL_SECTIONS = 2;

/** Sections mounted per batch while the rest of the document streams in. */
const SECTION_BATCH = 4;

function ViewerSection({ blocks }: { blocks: Block[] }) {
  const editor = useEditor({
    extensions: createSectionExtensions({ placeholder: '' }),
    editable: false,
    editorProps: { attributes: { class: EDITOR_CLASS } },
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
  });

  // Load the section once the editor (and therefore its schema) exists, and
  // refit first: stored blocks can predate a schema change, and an invalid
  // node would otherwise abort the whole setContent.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const json = { type: 'doc', content: ourBlocksToTiptapJSON(blocks) };
    editor.commands.setContent(fitTiptapJSON(json, editor.schema));
  }, [editor, blocks]);

  return <EditorContent editor={editor} />;
}

export function DocumentViewer({ payload }: { payload: ViewerPayload }) {
  const sections = useMemo(() => splitIntoSections(payload.blocks ?? []), [payload.blocks]);
  const [mountedCount, setMountedCount] = useState(Math.min(INITIAL_SECTIONS, sections.length));
  const scrollRef = useRef<HTMLDivElement>(null);
  // The outline reads headings from `staticBlocks` (primary source); no live
  // editor map is needed in the viewer.
  const editorsRef = useRef<Map<string, Editor> | null>(null);

  useEffect(() => {
    if (mountedCount >= sections.length) return;
    // One batch per frame: the browser paints between batches, so the page
    // stays usable while a long document finishes mounting.
    const raf = requestAnimationFrame(() => {
      setMountedCount((count) => Math.min(sections.length, count + SECTION_BATCH));
    });
    return () => cancelAnimationFrame(raf);
  }, [mountedCount, sections.length]);

  return (
    <div className="flex h-screen">
      <div
        ref={scrollRef}
        className="editor-scroll-container flex-1 overflow-y-auto pt-10 pb-8 select-text"
      >
        <EditorScrollCursor scrollContainerRef={scrollRef} />
        <div className="px-4 md:px-12 lg:px-20 pb-4">
          <h1 className="text-4xl font-bold text-[var(--vscode-editor-foreground)] pb-1">
            {payload.doc.title}
          </h1>
        </div>
        <div className="tiptap-editor-container relative">
          {sections.map((section, index) => (
            <div key={section.id}>
              {index < mountedCount ? (
                <ViewerSection blocks={section.blocks} />
              ) : (
                <div className={EDITOR_CLASS} />
              )}
            </div>
          ))}
        </div>
      </div>
      <SectionOutline
        scrollContainerRef={scrollRef}
        sectionEditorsRef={editorsRef}
        staticBlocks={payload.blocks}
      />
    </div>
  );
}
