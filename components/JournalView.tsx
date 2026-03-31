import React, { useState, useEffect, useRef, useCallback } from 'react';
import { JournalEntry } from '../services/idbService';
import { journalStorage } from '../services/journalStorage';
import JournalEditor from './JournalEditor';
import SimpleDrawingCanvas, { SimpleDrawingCanvasHandle } from './SimpleDrawingCanvas';
import { compressImage, compressImageFromUrl } from '../services/imageCompressionService';

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
    try {
      setSearchQuery(''); // Clear search so new entry is visible
      const verseRef =
        bookId && chapter && bookName ? `${bookName} ${chapter}` : undefined;
      const entry = await journalStorage.createEntry({
        bookId,
        chapter,
        verseRef,
      });
      const allEntries = await journalStorage.getAllEntries();
      setEntries(allEntries);
      setSelectedId(entry.id);
      if (isMobile) setMobileShowEditor(true);
    } catch (err) {
      console.error('[Journal] Failed to create entry:', err);
    }
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

  // Drawing state
  type NoteMode = 'text' | 'draw' | 'overlay';
  const [noteMode, setNoteMode] = useState<NoteMode>('text');
  const [drawingData, setDrawingData] = useState('');
  const [drawingTool, setDrawingTool] = useState<'pen' | 'marker' | 'highlighter' | 'eraser'>('pen');
  const [drawingColor, setDrawingColor] = useState('#000000');
  const [drawingSize, setDrawingSize] = useState(3);
  const canvasRef = useRef<SimpleDrawingCanvasHandle>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);
  const [showWebcam, setShowWebcam] = useState(false);
  const [showImageMenu, setShowImageMenu] = useState(false);
  const [isWritingMode, setIsWritingMode] = useState(false);

  // Detect mobile/tablet (same logic as ChatInterface)
  const isTouchDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 0 && /Macintosh/i.test(navigator.userAgent));

  const DRAW_COLORS = ['#000000', '#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899'];

  // Load drawing data when entry changes
  useEffect(() => {
    if (selectedEntry) {
      setDrawingData((selectedEntry as any).drawing || '');
    }
  }, [selectedId]);

  // Save drawing data
  const handleDrawingChange = useCallback((data: string) => {
    setDrawingData(data);
    if (!selectedId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      await journalStorage.updateEntry(selectedId, { drawing: data } as any);
    }, 2000);
  }, [selectedId]);

  // File/photo selection (works on all browsers)
  const handleImageSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file);
      insertImageIntoEditor(`data:${compressed.mimeType};base64,${compressed.base64}`);
    } catch {
      const reader = new FileReader();
      reader.onload = (ev) => { if (ev.target?.result) insertImageIntoEditor(ev.target.result as string); };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  }, []);

  // Webcam — open stream first, then show UI (desktop only)
  const openWebcam = useCallback(async () => {
    setShowImageMenu(false);
    setShowWebcam(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      webcamStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      setShowWebcam(false);
    }
  }, []);

  const closeWebcam = useCallback(() => {
    if (webcamStreamRef.current) {
      webcamStreamRef.current.getTracks().forEach(t => t.stop());
      webcamStreamRef.current = null;
    }
    setShowWebcam(false);
  }, []);

  const capturePhoto = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    try {
      const compressed = await compressImageFromUrl(dataUrl);
      insertImageIntoEditor(`data:${compressed.mimeType};base64,${compressed.base64}`);
    } catch {
      insertImageIntoEditor(dataUrl);
    }
    closeWebcam();
  }, []);

  const insertImageIntoEditor = (dataUrl: string) => {
    if (editorRef.current) {
      const img = document.createElement('img');
      img.src = dataUrl;
      img.style.maxWidth = '100%';
      img.style.borderRadius = '8px';
      img.style.margin = '8px 0';
      editorRef.current.appendChild(img);
      // Trigger change
      const html = editorRef.current.innerHTML;
      const text = editorRef.current.innerText;
      handleEditorChange(html, text);
    }
  };

  const execCommand = (cmd: string, value?: string) => {
    document.execCommand(cmd, false, value);
    if (editorRef.current) {
      handleEditorChange(editorRef.current.innerHTML, editorRef.current.innerText);
    }
  };

  const handleContentEditableInput = () => {
    if (editorRef.current) {
      handleEditorChange(editorRef.current.innerHTML, editorRef.current.innerText);
    }
  };

  // Sync editor content when switching entries
  useEffect(() => {
    if (editorRef.current && selectedEntry && (noteMode === 'text' || noteMode === 'overlay')) {
      if (editorRef.current.innerHTML !== selectedEntry.content) {
        editorRef.current.innerHTML = selectedEntry.content || '';
      }
    }
  }, [selectedId, noteMode]);

  const editorContent = selectedEntry ? (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ padding: '8px 16px', borderBottom: '1px solid #f3f4f6', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
        {isMobile && (
          <button onClick={mobileBack} style={{ background: 'none', border: 'none', color: '#4f46e5', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', fontSize: 14 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
            Back
          </button>
        )}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: '#9ca3af' }}>{formatDate(selectedEntry.createdAt)}</div>
          {selectedEntry.verseRef && (
            <div onClick={() => { if (onNavigate && selectedEntry.bookId && selectedEntry.chapter) onNavigate(selectedEntry.bookId, selectedEntry.chapter); }}
              style={{ fontSize: 12, color: '#6366f1', cursor: selectedEntry.bookId ? 'pointer' : 'default', marginTop: 2 }}>
              {selectedEntry.verseRef}
            </div>
          )}
        </div>
      </div>

      {/* Webcam overlay (desktop only) */}
      {showWebcam && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.85)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', maxHeight: '60vh', borderRadius: 8, marginBottom: 12, background: '#000' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={capturePhoto} style={{ background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', cursor: 'pointer', fontSize: 14 }}>Capture</button>
            <button onClick={closeWebcam} style={{ background: '#6b7280', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', cursor: 'pointer', fontSize: 14 }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Off-screen file input (iOS Safari + Chrome compatible) */}
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageSelect} style={{ position: 'fixed', top: '-10000px', left: '-10000px' }} />

      {/* Mode selector */}
      <div style={{ display: 'flex', gap: 4, padding: '6px 12px', borderBottom: '1px solid #f3f4f6', flexShrink: 0, background: '#fafafa' }}>
        {(['text', 'draw', 'overlay'] as NoteMode[]).map(m => (
          <button key={m} onClick={() => setNoteMode(m)}
            style={{ fontSize: 13, padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: noteMode === m ? '#4f46e5' : '#f3f4f6', color: noteMode === m ? '#fff' : '#6b7280', fontWeight: noteMode === m ? 600 : 400 }}>
            {m === 'text' ? '📝 Text' : m === 'draw' ? '✏️ Draw' : '🔀 Both'}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        {/* Camera/photo button — mobile: OS file picker, desktop: menu with webcam + file */}
        {isTouchDevice ? (
          <button onClick={() => fileInputRef.current?.click()}
            style={{ fontSize: 13, padding: '4px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', background: '#f3f4f6', color: '#6b7280' }}
            title="Take photo / choose image">📷</button>
        ) : (
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowImageMenu(!showImageMenu)}
              style={{ fontSize: 13, padding: '4px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', background: showImageMenu ? '#e0e7ff' : '#f3f4f6', color: '#6b7280' }}
              title="Add photo">📷</button>
            {showImageMenu && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setShowImageMenu(false)} />
                <div style={{ position: 'absolute', bottom: '100%', right: 0, marginBottom: 4, background: '#fff', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.15)', border: '1px solid #e5e7eb', padding: '4px 0', width: 150, zIndex: 50 }}>
                  <button onClick={openWebcam}
                    style={{ width: '100%', padding: '8px 12px', textAlign: 'left', fontSize: 13, border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                    📸 Take Photo
                  </button>
                  <label style={{ width: '100%', padding: '8px 12px', textAlign: 'left', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    🖼️ Choose Photo
                    <input type="file" accept="image/*" onChange={(e) => { setShowImageMenu(false); handleImageSelect(e); }} style={{ display: 'none' }} />
                  </label>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Rich text toolbar — text/overlay modes */}
      {(noteMode === 'text' || noteMode === 'overlay') && (
        <div style={{ display: 'flex', gap: 2, padding: '4px 12px', borderBottom: '1px solid #f3f4f6', flexShrink: 0, background: '#fafafa', flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={() => execCommand('bold')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: 4, fontSize: 14, fontWeight: 700 }} title="Bold">B</button>
          <button onClick={() => execCommand('italic')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: 4, fontSize: 14, fontStyle: 'italic' }} title="Italic">I</button>
          <button onClick={() => execCommand('underline')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: 4, fontSize: 14, textDecoration: 'underline' }} title="Underline">U</button>
          <span style={{ width: 1, height: 16, background: '#e5e7eb', margin: '0 4px' }} />
          <button onClick={() => execCommand('formatBlock', 'h2')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: 4, fontSize: 13, fontWeight: 600 }} title="Heading">H</button>
          <button onClick={() => execCommand('formatBlock', 'blockquote')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: 4, fontSize: 14 }} title="Quote">❝</button>
          <button onClick={() => execCommand('insertUnorderedList')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: 4, fontSize: 14 }} title="List">≡</button>
        </div>
      )}

      {/* Drawing palette — draw/overlay modes */}
      {(noteMode === 'draw' || noteMode === 'overlay') && (
        <div style={{ display: 'flex', gap: 4, padding: '4px 12px', borderBottom: '1px solid #f3f4f6', flexShrink: 0, background: '#fafafa', alignItems: 'center', flexWrap: 'wrap' }}>
          {(['pen', 'marker', 'highlighter', 'eraser'] as const).map(t => (
            <button key={t} onClick={() => { setDrawingTool(t); canvasRef.current?.setTool(t); }}
              style={{ fontSize: 13, padding: '3px 6px', borderRadius: 4, border: 'none', cursor: 'pointer',
                background: drawingTool === t ? (t === 'eraser' ? '#fee2e2' : '#e0e7ff') : 'transparent' }}
              title={t}>
              {t === 'pen' ? '✏️' : t === 'marker' ? '🖊️' : t === 'highlighter' ? '🖍️' : '🧹'}
            </button>
          ))}
          <button onClick={() => canvasRef.current?.undo()} style={{ fontSize: 13, padding: '3px 6px', borderRadius: 4, border: 'none', cursor: 'pointer', background: 'transparent' }} title="Undo">↩️</button>
          <button onClick={() => canvasRef.current?.clear()} style={{ fontSize: 13, padding: '3px 6px', borderRadius: 4, border: 'none', cursor: 'pointer', background: 'transparent' }} title="Clear">🗑️</button>
          <span style={{ width: 1, height: 16, background: '#e5e7eb', margin: '0 2px' }} />
          {DRAW_COLORS.map(color => (
            <button key={color} onClick={() => { setDrawingColor(color); canvasRef.current?.setColor(color); }}
              style={{ width: 18, height: 18, borderRadius: '50%', backgroundColor: color, border: drawingColor === color ? '2px solid #4f46e5' : '2px solid transparent', cursor: 'pointer', padding: 0 }}
              title={color} />
          ))}
          <input type="range" min="1" max="20" value={drawingSize}
            onChange={(e) => { const s = Number(e.target.value); setDrawingSize(s); canvasRef.current?.setSize(s); }}
            style={{ width: 50, marginLeft: 4 }} />
        </div>
      )}

      {/* Editor / Canvas area */}
      <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
        {noteMode === 'text' && (
          <div ref={editorRef} contentEditable onInput={handleContentEditableInput}
            data-placeholder="Write your thoughts, reflections, prayers..."
            style={{ minHeight: '100%', padding: '16px 20px', outline: 'none', fontSize: 16, lineHeight: 1.7, color: '#1f2937', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }} />
        )}

        {noteMode === 'draw' && (
          <div style={{ position: 'relative', minHeight: '400px', height: '100%', background: '#f8f8f8' }}>
            <SimpleDrawingCanvas key={`draw-${selectedId}`} ref={canvasRef} onChange={handleDrawingChange} initialData={drawingData} overlayMode={false} isWritingMode={true} />
          </div>
        )}

        {noteMode === 'overlay' && (
          <div style={{ position: 'relative', minHeight: '400px', height: '100%' }}>
            <div ref={editorRef} contentEditable={!isWritingMode} onInput={handleContentEditableInput}
              data-placeholder="Write and draw..."
              style={{ minHeight: '100%', padding: '16px 20px', outline: 'none', fontSize: 16, lineHeight: 1.7, color: '#1f2937', pointerEvents: isWritingMode ? 'none' : 'auto' }} />
            <div style={{ position: 'absolute', inset: 0, zIndex: 10, pointerEvents: isWritingMode ? 'auto' : 'none' }}>
              <SimpleDrawingCanvas key={`overlay-${selectedId}`} ref={canvasRef} onChange={handleDrawingChange} initialData={drawingData} overlayMode={true} isWritingMode={isWritingMode} />
            </div>
            <div style={{ position: 'absolute', bottom: 8, right: 8, zIndex: 20 }}>
              <button onClick={() => setIsWritingMode(!isWritingMode)}
                style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  background: isWritingMode ? '#e0e7ff' : '#f3f4f6', color: isWritingMode ? '#4f46e5' : '#6b7280' }}>
                {isWritingMode ? '✏️ Drawing' : '📝 Typing'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  ) : (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#d1d5db', fontSize: 15 }}>
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
