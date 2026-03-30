import React, { useState, useEffect, useRef, useCallback } from 'react';
import { JournalEntry } from '../services/idbService';
import { journalStorage } from '../services/journalStorage';
import JournalEditor from './JournalEditor';

interface JournalViewProps {
  /** Current Bible reading context for linking new entries */
  bookId?: string;
  chapter?: number;
  bookName?: string;
  onNavigate?: (bookId: string, chapter: number) => void;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + '...';
}

const JournalView: React.FC<JournalViewProps> = ({
  bookId,
  chapter,
  bookName,
  onNavigate,
}) => {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMobile = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  const selectedEntry = entries.find((e) => e.id === selectedId) ?? null;

  // Load entries
  const loadEntries = useCallback(async () => {
    const data = searchQuery.trim()
      ? await journalStorage.searchEntries(searchQuery)
      : await journalStorage.getAllEntries();
    setEntries(data);
  }, [searchQuery]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  // Create new entry
  const handleNew = async () => {
    const verseRef =
      bookId && chapter && bookName ? `${bookName} ${chapter}` : undefined;
    const entry = await journalStorage.createEntry({
      bookId,
      chapter,
      verseRef,
    });
    await loadEntries();
    setSelectedId(entry.id);
  };

  // Delete entry
  const handleDelete = async (id: string) => {
    await journalStorage.deleteEntry(id);
    if (selectedId === id) setSelectedId(null);
    setShowDeleteConfirm(null);
    await loadEntries();
  };

  // Auto-save with debounce
  const handleEditorChange = useCallback(
    (html: string, plainText: string) => {
      if (!selectedId) return;
      // Derive title from first line of plain text
      const firstLine = plainText.split('\n').find((l) => l.trim()) || '';
      const title = truncate(firstLine, 80);

      // Update local state immediately for responsive UI
      setEntries((prev) =>
        prev.map((e) =>
          e.id === selectedId
            ? { ...e, content: html, plainText, title, updatedAt: new Date().toISOString() }
            : e
        )
      );

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        await journalStorage.updateEntry(selectedId, {
          content: html,
          plainText,
          title,
        });
      }, 3000);
    },
    [selectedId]
  );

  // Flush pending save on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  // ---------------------------------------------------------------
  // Mobile: show list OR editor, not both
  // ---------------------------------------------------------------
  const [mobileShowEditor, setMobileShowEditor] = useState(false);

  const selectEntry = (id: string) => {
    setSelectedId(id);
    if (isMobile) setMobileShowEditor(true);
  };

  const mobileBack = () => {
    setMobileShowEditor(false);
  };

  // ---------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------

  const listContent = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Search + New */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '12px 16px',
          borderBottom: '1px solid #f3f4f6',
          flexShrink: 0,
        }}
      >
        <div style={{ position: 'relative', flex: 1 }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search journal..."
            style={{
              width: '100%',
              padding: '8px 12px 8px 32px',
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              fontSize: 14,
              background: '#f9fafb',
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
          <svg
            style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }}
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
        </div>
        <button
          onClick={handleNew}
          title="New entry"
          style={{
            background: '#4f46e5',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            width: 34,
            height: 34,
            fontSize: 20,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          +
        </button>
      </div>

      {/* Entry list */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {entries.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: '#9ca3af',
              padding: 32,
              textAlign: 'center',
            }}
          >
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: 12, color: '#d1d5db' }}>
              <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M17.5 2.5a2.121 2.121 0 013 3L12 14l-4 1 1-4 8.5-8.5z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>No journal entries yet</p>
            <p style={{ margin: '4px 0 0', fontSize: 13 }}>
              Tap + to start writing your reflections
            </p>
          </div>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.id}
              onClick={() => selectEntry(entry.id)}
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid #f3f4f6',
                cursor: 'pointer',
                background: entry.id === selectedId ? '#eef2ff' : '#fff',
                transition: 'background 0.15s',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: '#1f2937',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {entry.title || 'Untitled'}
                  </div>
                  <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
                    {formatDate(entry.createdAt)}
                  </div>
                  {entry.verseRef && (
                    <div
                      style={{
                        fontSize: 11,
                        color: '#6366f1',
                        marginTop: 3,
                        display: 'inline-block',
                        background: '#eef2ff',
                        padding: '1px 6px',
                        borderRadius: 4,
                      }}
                    >
                      {entry.verseRef}
                    </div>
                  )}
                  {entry.plainText && (
                    <div
                      style={{
                        fontSize: 13,
                        color: '#6b7280',
                        marginTop: 4,
                        lineHeight: 1.4,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {truncate(entry.plainText, 120)}
                    </div>
                  )}
                </div>
                {/* Delete button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDeleteConfirm(entry.id);
                  }}
                  title="Delete"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#d1d5db',
                    cursor: 'pointer',
                    padding: 4,
                    marginLeft: 4,
                    flexShrink: 0,
                    borderRadius: 4,
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                  </svg>
                </button>
              </div>
              {/* Delete confirmation */}
              {showDeleteConfirm === entry.id && (
                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    marginTop: 8,
                    padding: '8px 0 0',
                    borderTop: '1px solid #fee2e2',
                  }}
                >
                  <span style={{ fontSize: 12, color: '#ef4444', flex: 1 }}>Delete this entry?</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(entry.id);
                    }}
                    style={{
                      fontSize: 12,
                      color: '#fff',
                      background: '#ef4444',
                      border: 'none',
                      borderRadius: 4,
                      padding: '2px 10px',
                      cursor: 'pointer',
                    }}
                  >
                    Delete
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowDeleteConfirm(null);
                    }}
                    style={{
                      fontSize: 12,
                      color: '#6b7280',
                      background: '#f3f4f6',
                      border: 'none',
                      borderRadius: 4,
                      padding: '2px 10px',
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );

  const editorContent = selectedEntry ? (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid #f3f4f6',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        {isMobile && (
          <button
            onClick={mobileBack}
            style={{
              background: 'none',
              border: 'none',
              color: '#4f46e5',
              cursor: 'pointer',
              padding: 4,
              display: 'flex',
              alignItems: 'center',
              fontSize: 14,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Back
          </button>
        )}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: '#9ca3af' }}>{formatDate(selectedEntry.createdAt)}</div>
          {selectedEntry.verseRef && (
            <div
              onClick={() => {
                if (onNavigate && selectedEntry.bookId && selectedEntry.chapter) {
                  onNavigate(selectedEntry.bookId, selectedEntry.chapter);
                }
              }}
              style={{
                fontSize: 12,
                color: '#6366f1',
                cursor: selectedEntry.bookId ? 'pointer' : 'default',
                marginTop: 2,
              }}
            >
              {selectedEntry.verseRef}
            </div>
          )}
        </div>
      </div>

      {/* Editor */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <JournalEditor
          content={selectedEntry.content}
          onChange={handleEditorChange}
        />
      </div>
    </div>
  ) : (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: '#d1d5db',
        fontSize: 15,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      Select an entry or create a new one
    </div>
  );

  // Mobile layout: show list or editor
  if (isMobile) {
    return (
      <div style={{ height: '100%', background: '#fff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
        {mobileShowEditor && selectedEntry ? editorContent : listContent}
      </div>
    );
  }

  // Desktop layout: side-by-side
  return (
    <div
      style={{
        display: 'flex',
        height: '100%',
        background: '#fff',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div
        style={{
          width: 280,
          minWidth: 220,
          borderRight: '1px solid #f3f4f6',
          flexShrink: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {listContent}
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }}>{editorContent}</div>
    </div>
  );
};

export default JournalView;
