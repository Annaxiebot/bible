import React, { useState, useEffect, useRef, useCallback } from 'react';
import { JournalEntry } from '../types';
import { journalStorage } from '../services/journalStorage';
import SimpleDrawingCanvas, { SimpleDrawingCanvasHandle } from './SimpleDrawingCanvas';
import { printJournalEntries } from '../services/printService';

type JournalMode = 'list' | 'edit';
type EditMode = 'text' | 'draw';

const DRAW_COLORS = ['#000000', '#007AFF', '#FF3B30', '#34C759', '#FFCC00'];

const JournalView: React.FC = () => {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [mode, setMode] = useState<JournalMode>('list');
  const [editMode, setEditMode] = useState<EditMode>('text');
  const [currentEntry, setCurrentEntry] = useState<JournalEntry | null>(null);
  const [title, setTitle] = useState('');
  const [drawingData, setDrawingData] = useState('');
  const [tags, setTags] = useState('');
  const [bibleReference, setBibleReference] = useState('');
  const [isSaved, setIsSaved] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [drawingColor, setDrawingColor] = useState('#000000');
  const [drawingSize, setDrawingSize] = useState(2);

  const editorRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<SimpleDrawingCanvasHandle>(null);
  const autoSaveTimer = useRef<number | null>(null);

  const loadEntries = useCallback(async () => {
    const all = searchQuery
      ? await journalStorage.searchEntries(searchQuery)
      : await journalStorage.getAllEntries();

    if (sortOrder === 'oldest') {
      all.reverse();
    }
    setEntries(all);
  }, [searchQuery, sortOrder]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const startNewEntry = () => {
    setCurrentEntry(null);
    setTitle('');
    setDrawingData('');
    setTags('');
    setBibleReference('');
    setIsSaved(true);
    setEditMode('text');
    setMode('edit');
    // Populate editor after render
    requestAnimationFrame(() => {
      if (editorRef.current) {
        editorRef.current.innerHTML = '';
        editorRef.current.focus();
      }
    });
  };

  const openEntry = (entry: JournalEntry) => {
    setCurrentEntry(entry);
    setTitle(entry.title);
    setDrawingData(entry.drawing || '');
    setTags(entry.tags?.join(', ') || '');
    setBibleReference(entry.bibleReference || '');
    setIsSaved(true);
    setEditMode('text');
    setMode('edit');
    requestAnimationFrame(() => {
      if (editorRef.current) {
        editorRef.current.innerHTML = entry.content;
      }
    });
  };

  const handleSave = async () => {
    const content = editorRef.current?.innerHTML || '';
    const parsedTags = tags.split(',').map(t => t.trim()).filter(Boolean);

    if (currentEntry) {
      const updated = await journalStorage.updateEntry(currentEntry.id, {
        title: title || 'Untitled',
        content,
        drawing: drawingData,
        tags: parsedTags,
        bibleReference: bibleReference || undefined,
      });
      if (updated) setCurrentEntry(updated);
    } else {
      const created = await journalStorage.saveEntry({
        title: title || 'Untitled',
        content,
        drawing: drawingData,
        tags: parsedTags,
        bibleReference: bibleReference || undefined,
      });
      setCurrentEntry(created);
    }

    setIsSaved(true);
    await loadEntries();
  };

  const handleDelete = async () => {
    if (!currentEntry) return;
    if (!confirm('Delete this journal entry?')) return;

    await journalStorage.deleteEntry(currentEntry.id);
    setMode('list');
    setCurrentEntry(null);
    await loadEntries();
  };

  const handleContentChange = () => {
    setIsSaved(false);
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = window.setTimeout(() => {
      handleSave();
    }, 3000);
  };

  const execCommand = (command: string, value: string = '') => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    handleContentChange();
  };

  const handlePrint = () => {
    if (entries.length === 0) {
      alert('No journal entries to print.');
      return;
    }
    printJournalEntries(entries);
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'short',
    });
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getPreview = (content: string) => {
    // Strip HTML tags for preview
    const text = content.replace(/<[^>]*>/g, '').trim();
    return text.length > 120 ? text.substring(0, 120) + '...' : text;
  };

  // Group entries by date
  const groupedEntries = entries.reduce<Record<string, JournalEntry[]>>((groups, entry) => {
    const dateKey = formatDate(entry.createdAt);
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(entry);
    return groups;
  }, {});

  if (mode === 'edit') {
    return (
      <div className="journal-edit">
        {/* Header */}
        <div className="journal-edit-header">
          <button onClick={() => { setMode('list'); }} className="journal-back-btn">
            Back
          </button>
          <div className="journal-edit-actions">
            {currentEntry && (
              <button onClick={handleDelete} className="journal-delete-btn">
                Delete
              </button>
            )}
            <button onClick={handleSave} className="journal-save-btn">
              {isSaved ? 'Saved' : 'Save'}
            </button>
          </div>
        </div>

        {/* Title */}
        <input
          type="text"
          value={title}
          onChange={(e) => { setTitle(e.target.value); setIsSaved(false); }}
          placeholder="Entry title..."
          className="journal-title-input"
        />

        {/* Metadata row */}
        <div className="journal-meta-row">
          <input
            type="text"
            value={bibleReference}
            onChange={(e) => { setBibleReference(e.target.value); setIsSaved(false); }}
            placeholder="Bible ref (e.g. GEN:1:1)"
            className="journal-meta-input"
            style={{ flex: 1 }}
          />
          <input
            type="text"
            value={tags}
            onChange={(e) => { setTags(e.target.value); setIsSaved(false); }}
            placeholder="Tags (comma-separated)"
            className="journal-meta-input"
            style={{ flex: 1 }}
          />
        </div>

        {/* Mode toggle: text vs draw */}
        <div className="journal-mode-toggle">
          <button
            onClick={() => setEditMode('text')}
            className="toolbar-btn"
            style={editMode === 'text' ? { background: '#4f46e5', color: 'white' } : {}}
          >
            Text
          </button>
          <button
            onClick={() => setEditMode('draw')}
            className="toolbar-btn"
            style={editMode === 'draw' ? { background: '#4f46e5', color: 'white' } : {}}
          >
            Draw
          </button>
        </div>

        {editMode === 'text' && (
          <>
            {/* Rich text toolbar */}
            <div className="journal-rich-toolbar">
              <button onClick={() => execCommand('bold')} className="toolbar-btn" title="Bold"><strong>B</strong></button>
              <button onClick={() => execCommand('italic')} className="toolbar-btn" title="Italic"><em>I</em></button>
              <button onClick={() => execCommand('underline')} className="toolbar-btn" title="Underline"><u>U</u></button>
              <span className="toolbar-sep" />
              <button onClick={() => execCommand('formatBlock', 'h2')} className="toolbar-btn" title="Heading">H</button>
              <button onClick={() => execCommand('formatBlock', 'h3')} className="toolbar-btn" title="Subheading">H2</button>
              <button onClick={() => execCommand('formatBlock', 'blockquote')} className="toolbar-btn" title="Quote">&#10077;</button>
              <span className="toolbar-sep" />
              <button onClick={() => execCommand('insertUnorderedList')} className="toolbar-btn" title="Bullet list">&#8801;</button>
              <button onClick={() => execCommand('insertOrderedList')} className="toolbar-btn" title="Numbered list">1.</button>
            </div>

            {/* Content editor */}
            <div
              ref={editorRef}
              className="journal-editor"
              contentEditable
              onInput={handleContentChange}
              data-placeholder="Write your thoughts, reflections, ideas..."
              style={{ minHeight: '300px', padding: '16px', outline: 'none', fontSize: '15px', lineHeight: '1.8' }}
            />
          </>
        )}

        {editMode === 'draw' && (
          <div style={{ position: 'relative', minHeight: '400px', background: '#fafafa', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e0e0e0' }}>
            <SimpleDrawingCanvas
              ref={canvasRef}
              onChange={(data) => {
                setDrawingData(data);
                setIsSaved(false);
                if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
                autoSaveTimer.current = window.setTimeout(() => handleSave(), 3000);
              }}
              initialData={drawingData}
              overlayMode={false}
              isWritingMode={true}
            />
            <div className="journal-draw-palette">
              <button onClick={() => canvasRef.current?.undo()} className="toolbar-btn" title="Undo">Undo</button>
              <button onClick={() => canvasRef.current?.clear()} className="toolbar-btn" title="Clear">Clear</button>
              <span className="toolbar-sep" />
              {DRAW_COLORS.map(color => (
                <button
                  key={color}
                  onClick={() => { setDrawingColor(color); canvasRef.current?.setColor(color); }}
                  style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: color, border: drawingColor === color ? '3px solid #4f46e5' : '2px solid #ccc', cursor: 'pointer', padding: 0 }}
                  title={color}
                />
              ))}
              <input
                type="range" min="1" max="20" value={drawingSize}
                onChange={(e) => { const s = Number(e.target.value); setDrawingSize(s); canvasRef.current?.setSize(s); }}
                style={{ width: '80px', marginLeft: '8px' }}
              />
            </div>
          </div>
        )}

        {/* Timestamp info */}
        {currentEntry && (
          <div className="journal-timestamps">
            <span>Created: {formatDate(currentEntry.createdAt)} {formatTime(currentEntry.createdAt)}</span>
            <span>Modified: {formatDate(currentEntry.updatedAt)} {formatTime(currentEntry.updatedAt)}</span>
          </div>
        )}

        <style>{journalStyles}</style>
      </div>
    );
  }

  // List view
  return (
    <div className="journal-list-view">
      {/* Header */}
      <div className="journal-list-header">
        <h3 className="journal-list-title">Journal</h3>
        <div className="journal-list-actions">
          <button onClick={handlePrint} className="toolbar-btn" title="Print journal">
            Print
          </button>
          <button onClick={startNewEntry} className="journal-new-btn">
            + New Entry
          </button>
        </div>
      </div>

      {/* Search and sort */}
      <div className="journal-search-row">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search journal..."
          className="journal-search-input"
        />
        <button
          onClick={() => setSortOrder(sortOrder === 'newest' ? 'oldest' : 'newest')}
          className="toolbar-btn"
          title={`Sort: ${sortOrder}`}
        >
          {sortOrder === 'newest' ? 'Newest' : 'Oldest'}
        </button>
      </div>

      {/* Entry list */}
      {entries.length === 0 ? (
        <div className="journal-empty">
          <p>{searchQuery ? 'No entries match your search' : 'No journal entries yet'}</p>
          <p className="journal-empty-hint">Tap "+ New Entry" to start writing</p>
        </div>
      ) : (
        <div className="journal-entries">
          {Object.entries(groupedEntries).map(([dateKey, dateEntries]) => (
            <div key={dateKey} className="journal-date-group">
              <div className="journal-date-header">{dateKey}</div>
              {dateEntries.map(entry => (
                <div
                  key={entry.id}
                  className="journal-entry-card"
                  onClick={() => openEntry(entry)}
                >
                  <div className="journal-entry-title">{entry.title || 'Untitled'}</div>
                  <div className="journal-entry-preview">{getPreview(entry.content)}</div>
                  <div className="journal-entry-footer">
                    <span className="journal-entry-time">{formatTime(entry.updatedAt)}</span>
                    {entry.bibleReference && (
                      <span className="journal-entry-ref">{entry.bibleReference}</span>
                    )}
                    {entry.tags && entry.tags.length > 0 && (
                      <div className="journal-entry-tags">
                        {entry.tags.map((tag, i) => (
                          <span key={i} className="journal-tag">#{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <style>{journalStyles}</style>
    </div>
  );
};

const journalStyles = `
  .journal-list-view, .journal-edit {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: white;
  }

  .journal-list-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px;
    border-bottom: 1px solid #e0e0e0;
    background: #f8f8f8;
  }

  .journal-list-title {
    margin: 0;
    font-size: 16px;
    color: #333;
  }

  .journal-list-actions {
    display: flex;
    gap: 8px;
  }

  .journal-new-btn {
    padding: 6px 14px;
    background: #4f46e5;
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    cursor: pointer;
  }

  .journal-new-btn:hover {
    background: #4338ca;
  }

  .journal-search-row {
    display: flex;
    gap: 8px;
    padding: 8px 12px;
    border-bottom: 1px solid #f0f0f0;
  }

  .journal-search-input {
    flex: 1;
    padding: 6px 10px;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 13px;
    outline: none;
  }

  .journal-search-input:focus {
    border-color: #4f46e5;
  }

  .journal-entries {
    flex: 1;
    overflow-y: auto;
    padding: 8px 12px;
  }

  .journal-date-group {
    margin-bottom: 16px;
  }

  .journal-date-header {
    font-size: 12px;
    font-weight: 600;
    color: #666;
    padding: 4px 0;
    margin-bottom: 6px;
    border-bottom: 1px solid #f0f0f0;
  }

  .journal-entry-card {
    padding: 12px;
    background: #f8f9fa;
    border-radius: 8px;
    border: 1px solid #e8e8e8;
    margin-bottom: 8px;
    cursor: pointer;
    transition: background 0.15s, box-shadow 0.15s;
  }

  .journal-entry-card:hover {
    background: #f0f0ff;
    box-shadow: 0 1px 4px rgba(79, 70, 229, 0.1);
  }

  .journal-entry-title {
    font-size: 14px;
    font-weight: 600;
    color: #222;
    margin-bottom: 4px;
  }

  .journal-entry-preview {
    font-size: 13px;
    color: #666;
    line-height: 1.5;
    margin-bottom: 6px;
  }

  .journal-entry-footer {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .journal-entry-time {
    font-size: 11px;
    color: #999;
  }

  .journal-entry-ref {
    font-size: 11px;
    color: #4f46e5;
    background: #e0e7ff;
    padding: 1px 6px;
    border-radius: 10px;
  }

  .journal-entry-tags {
    display: flex;
    gap: 4px;
  }

  .journal-tag {
    font-size: 11px;
    color: #4f46e5;
    background: #f0f0ff;
    padding: 1px 6px;
    border-radius: 10px;
  }

  .journal-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: #999;
    padding: 40px;
  }

  .journal-empty-hint {
    font-size: 12px;
    margin-top: 4px;
  }

  /* Edit mode styles */
  .journal-edit-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    border-bottom: 1px solid #e0e0e0;
    background: #f8f8f8;
  }

  .journal-back-btn {
    padding: 6px 12px;
    background: #f0f0f0;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 13px;
    cursor: pointer;
  }

  .journal-edit-actions {
    display: flex;
    gap: 8px;
  }

  .journal-save-btn {
    padding: 6px 14px;
    background: #4CAF50;
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    cursor: pointer;
  }

  .journal-delete-btn {
    padding: 6px 14px;
    background: #ef4444;
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    cursor: pointer;
  }

  .journal-title-input {
    width: 100%;
    padding: 12px;
    border: none;
    border-bottom: 1px solid #f0f0f0;
    font-size: 18px;
    font-weight: 600;
    outline: none;
    box-sizing: border-box;
  }

  .journal-title-input::placeholder {
    color: #bbb;
  }

  .journal-meta-row {
    display: flex;
    gap: 8px;
    padding: 8px 12px;
    border-bottom: 1px solid #f0f0f0;
  }

  .journal-meta-input {
    padding: 6px 10px;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 12px;
    outline: none;
  }

  .journal-meta-input:focus {
    border-color: #4f46e5;
  }

  .journal-mode-toggle {
    display: flex;
    gap: 4px;
    padding: 8px 12px;
  }

  .journal-rich-toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 6px 12px;
    border-bottom: 1px solid #e0e0e0;
    align-items: center;
  }

  .journal-editor {
    flex: 1;
    overflow-y: auto;
  }

  .journal-editor:empty:before {
    content: attr(data-placeholder);
    color: #bbb;
    pointer-events: none;
  }

  .journal-editor h2, .journal-editor h3 {
    margin: 12px 0 6px;
    color: #222;
  }

  .journal-editor blockquote {
    border-left: 3px solid #4f46e5;
    margin: 8px 0;
    padding-left: 12px;
    color: #555;
  }

  .journal-editor ul, .journal-editor ol {
    padding-left: 24px;
    margin: 6px 0;
  }

  .journal-draw-palette {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 8px 12px;
    background: white;
    border-top: 1px solid #e0e0e0;
    align-items: center;
  }

  .journal-timestamps {
    display: flex;
    justify-content: space-between;
    padding: 8px 12px;
    font-size: 11px;
    color: #999;
    border-top: 1px solid #f0f0f0;
  }

  .toolbar-btn {
    padding: 4px 10px;
    background: #f0f0f0;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 13px;
    cursor: pointer;
  }

  .toolbar-btn:hover {
    background: #e0e0e0;
  }

  .toolbar-sep {
    width: 1px;
    height: 20px;
    background: #d1d5db;
    margin: 0 2px;
  }
`;

export default JournalView;
