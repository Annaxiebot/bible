import React, { useEffect, useRef, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';

interface JournalEditorProps {
  content: string;
  onChange: (html: string, plainText: string) => void;
  placeholder?: string;
}

const ToolbarButton: React.FC<{
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
}> = ({ onClick, active, title, children }) => (
  <button
    type="button"
    onMouseDown={(e) => {
      e.preventDefault();
      onClick();
    }}
    title={title}
    style={{
      background: active ? '#eef2ff' : 'transparent',
      color: active ? '#4f46e5' : '#6b7280',
      border: 'none',
      borderRadius: 6,
      padding: '4px 8px',
      cursor: 'pointer',
      fontSize: 14,
      fontWeight: active ? 600 : 400,
      lineHeight: 1,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 28,
      height: 28,
      transition: 'all 0.15s',
    }}
  >
    {children}
  </button>
);

const Separator: React.FC = () => (
  <span
    style={{
      width: 1,
      height: 18,
      background: '#e5e7eb',
      margin: '0 4px',
      flexShrink: 0,
    }}
  />
);

const JournalEditor: React.FC<JournalEditorProps> = ({
  content,
  onChange,
  placeholder = 'Write your thoughts, reflections, prayers...',
}) => {
  const isExternalUpdate = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({ placeholder }),
      Underline,
    ],
    content,
    onUpdate: ({ editor: ed }) => {
      if (isExternalUpdate.current) return;
      onChange(ed.getHTML(), ed.getText());
    },
    editorProps: {
      attributes: {
        class: 'journal-editor-content',
        style:
          'outline: none; min-height: 200px; padding: 16px 20px; font-size: 16px; line-height: 1.7; color: #1f2937; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
      },
    },
  });

  // Sync external content changes (e.g. switching entries)
  useEffect(() => {
    if (!editor) return;
    const currentHTML = editor.getHTML();
    // Only reset if content actually differs (avoids cursor jump)
    if (content !== currentHTML) {
      isExternalUpdate.current = true;
      editor.commands.setContent(content || '', { emitUpdate: false });
      isExternalUpdate.current = false;
    }
  }, [content, editor]);

  if (!editor) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          padding: '6px 12px',
          borderBottom: '1px solid #f3f4f6',
          background: '#fafafa',
          flexWrap: 'wrap',
          flexShrink: 0,
        }}
      >
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive('bold')}
          title="Bold"
        >
          <strong>B</strong>
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive('italic')}
          title="Italic"
        >
          <em>I</em>
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive('underline')}
          title="Underline"
        >
          <span style={{ textDecoration: 'underline' }}>U</span>
        </ToolbarButton>

        <Separator />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          active={editor.isActive('heading', { level: 1 })}
          title="Heading 1"
        >
          H1
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive('heading', { level: 2 })}
          title="Heading 2"
        >
          H2
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          active={editor.isActive('heading', { level: 3 })}
          title="Heading 3"
        >
          H3
        </ToolbarButton>

        <Separator />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive('bulletList')}
          title="Bullet List"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
            <circle cx="4" cy="6" r="1" fill="currentColor" />
            <circle cx="4" cy="12" r="1" fill="currentColor" />
            <circle cx="4" cy="18" r="1" fill="currentColor" />
          </svg>
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive('orderedList')}
          title="Ordered List"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="10" y1="6" x2="21" y2="6" />
            <line x1="10" y1="12" x2="21" y2="12" />
            <line x1="10" y1="18" x2="21" y2="18" />
            <text x="2" y="8" fontSize="8" fill="currentColor" stroke="none" fontFamily="sans-serif">1</text>
            <text x="2" y="14" fontSize="8" fill="currentColor" stroke="none" fontFamily="sans-serif">2</text>
            <text x="2" y="20" fontSize="8" fill="currentColor" stroke="none" fontFamily="sans-serif">3</text>
          </svg>
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          active={editor.isActive('blockquote')}
          title="Blockquote"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z" />
            <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z" />
          </svg>
        </ToolbarButton>
      </div>

      {/* Editor */}
      <div style={{ flex: 1, overflow: 'auto', background: '#ffffff' }}>
        <EditorContent editor={editor} />
      </div>

      {/* TipTap global styles */}
      <style>{`
        .journal-editor-content p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: #9ca3af;
          pointer-events: none;
          height: 0;
          font-style: italic;
        }
        .journal-editor-content h1 { font-size: 1.5em; font-weight: 700; margin: 0.6em 0 0.3em; }
        .journal-editor-content h2 { font-size: 1.25em; font-weight: 600; margin: 0.5em 0 0.25em; }
        .journal-editor-content h3 { font-size: 1.1em; font-weight: 600; margin: 0.4em 0 0.2em; }
        .journal-editor-content p { margin: 0 0 0.5em; }
        .journal-editor-content ul, .journal-editor-content ol { padding-left: 1.5em; margin: 0 0 0.5em; }
        .journal-editor-content blockquote {
          border-left: 3px solid #c7d2fe;
          padding-left: 1em;
          margin: 0.5em 0;
          color: #4b5563;
          font-style: italic;
        }
        .journal-editor-content u { text-decoration: underline; }
        .tiptap:focus { outline: none; }
      `}</style>
    </div>
  );
};

export default JournalEditor;
