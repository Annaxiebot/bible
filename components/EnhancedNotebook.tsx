import React, { useState, useEffect, useRef } from 'react';
import { SelectionInfo } from '../types';
import { VerseData, PersonalNote, AIResearchEntry } from '../types/verseData';
import { verseDataStorage } from '../services/verseDataStorage';
import { useStorageUpdate } from '../hooks/useStorageUpdate';
import DrawingCanvas, { DrawingCanvasHandle } from './DrawingCanvas';
import LazyMarkdown from './LazyMarkdown';
import 'katex/dist/katex.min.css';
import { CHINESE_ABBREV_TO_BOOK_ID, BIBLE_BOOKS } from '../constants';

const _allBookNames = Object.keys(CHINESE_ABBREV_TO_BOOK_ID)
  .sort((a, b) => b.length - a.length)
  .map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
const _nameGroup = _allBookNames.join('|');
const _namedRefSrc = `(?:${_nameGroup})\\s*\\d+(?:[章篇]|:\\d+(?:-\\d+)?(?:[，,]\\s*\\d+(?:-\\d+)?)*)`;
const _bareRefSrc = `(?<!\\d)\\d+:\\d+(?:-\\d+)?(?:[，,]\\s*\\d+(?:-\\d+)?)*`;
const _combinedRefRe = new RegExp(`${_namedRefSrc}|${_bareRefSrc}`, 'gi');

const _parseVerseList = (s: string): number[] => {
  const v: number[] = [];
  for (const seg of s.split(/[，,]\s*/)) {
    const [a, b] = seg.split('-').map(Number);
    for (let i = a; i <= (b || a); i++) v.push(i);
  }
  return v;
};

const _parseRef = (m: string, fallbackBookId?: string): { bookId: string; chapter: number; verses?: number[] } | null => {
  const vRe = new RegExp(`^(${_nameGroup})\\s*(\\d+):(\\d+(?:-\\d+)?(?:[，,]\\s*\\d+(?:-\\d+)?)*)$`, 'i');
  const cRe = new RegExp(`^(${_nameGroup})\\s*(\\d+)[章篇]$`, 'i');
  let r = m.match(vRe);
  if (r) { const id = CHINESE_ABBREV_TO_BOOK_ID[r[1]]; return id ? { bookId: id, chapter: +r[2], verses: _parseVerseList(r[3]) } : null; }
  r = m.match(cRe);
  if (r) { const id = CHINESE_ABBREV_TO_BOOK_ID[r[1]]; return id ? { bookId: id, chapter: +r[2] } : null; }
  if (fallbackBookId) {
    const br = m.match(/^(\d+):(\d+(?:-\d+)?(?:[，,]\s*\d+(?:-\d+)?)*)$/);
    if (br) return { bookId: fallbackBookId, chapter: +br[1], verses: _parseVerseList(br[2]) };
  }
  return null;
};

const _linkStyle: React.CSSProperties = { color: '#2563eb', backgroundColor: '#eff6ff', textDecoration: 'underline', textUnderlineOffset: '2px', padding: '0 3px', borderRadius: '3px', cursor: 'pointer' };

const _processText = (
  text: string,
  onNav?: (bookId: string, chapter: number, verses?: number[]) => void,
  curBookId?: string
): React.ReactNode => {
  if (!onNav || typeof text !== 'string') return text;
  const re = new RegExp(_combinedRefRe.source, 'gi');
  const parts: React.ReactNode[] = [];
  let last = 0, mt;
  while ((mt = re.exec(text)) !== null) {
    if (mt.index > last) parts.push(text.slice(last, mt.index));
    const ref = _parseRef(mt[0], curBookId);
    if (ref) {
      const txt = mt[0];
      parts.push(<a key={`r${mt.index}`} style={_linkStyle} onClick={(e) => { e.preventDefault(); onNav(ref.bookId, ref.chapter, ref.verses); }}>{txt}</a>);
    } else parts.push(mt[0]);
    last = re.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length === 1 ? parts[0] : <>{parts}</>;
};

const _pc = (nodes: React.ReactNode, onNav?: (bookId: string, chapter: number, verses?: number[]) => void, curBookId?: string): React.ReactNode => {
  if (typeof nodes === 'string') return _processText(nodes, onNav, curBookId);
  if (typeof nodes === 'number') return _processText(String(nodes), onNav, curBookId);
  if (nodes == null || typeof nodes === 'boolean') return nodes;
  if (React.isValidElement(nodes)) return nodes;
  const arr = React.Children.toArray(nodes);
  if (arr.length > 0) return arr.map((n, i) => <React.Fragment key={i}>{_pc(n, onNav, curBookId)}</React.Fragment>);
  return nodes;
};

interface EnhancedNotebookProps {
  selection: SelectionInfo | null;
  onSaveNote: (id: string, content: string, skipTrigger?: boolean) => void;
  initialContent: string;
  initialTab?: TabType;
  researchUpdateTrigger?: number;
  onNavigate?: (bookId: string, chapter: number, verses?: number[]) => void;
}

type TabType = 'research' | 'notes' | 'all';

const EnhancedNotebook: React.FC<EnhancedNotebookProps> = ({
  selection,
  onSaveNote,
  initialContent,
  initialTab = 'research',
  researchUpdateTrigger: _researchUpdateTrigger = 0,
  onNavigate
}) => {
  const storageTick = useStorageUpdate();
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [verseData, setVerseData] = useState<VerseData | null>(null);
  const [personalNote, setPersonalNote] = useState<string>('');
  const [isSaved, setIsSaved] = useState(true);
  const [mode, setMode] = useState<'text' | 'draw'>('text');
  const [drawingData, setDrawingData] = useState<string>('');

  const editorRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<DrawingCanvasHandle>(null);
  const autoSaveTimer = useRef<number | null>(null);
  const previousSelectionIdRef = useRef<string | null>(null);
  const lastActivityTime = useRef<number>(Date.now());
  const hasInsertedTimestamp = useRef(false);

  // Update active tab when initialTab prop changes
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (!selection) return;

    // Only reload data when switching to a different verse, not on every initialContent change
    if (previousSelectionIdRef.current !== selection.id) {
      previousSelectionIdRef.current = selection.id;
      // Reset timestamp tracking when switching to new verse
      lastActivityTime.current = Date.now();
      hasInsertedTimestamp.current = false;
      loadVerseData();
    }
  }, [selection?.id]);

  // Reload data whenever any verseDataStorage write occurs
  useEffect(() => {
    if (selection) loadVerseData();
  }, [storageTick]);

  const loadVerseData = async () => {
    if (!selection) return;
    
    // Reset save state when loading new verse
    setIsSaved(true);
    
    const parts = selection.id.split(':');
    
    if (parts.length >= 3) {
      const bookId = parts[0];
      const chapter = parseInt(parts[1]);
      const verses = [parseInt(parts[2])];
      
      
      const data = await verseDataStorage.getVerseData(bookId, chapter, verses);
      setVerseData(data);
      
      if (data?.personalNote) {
        setPersonalNote(data.personalNote.text);
        setDrawingData(data.personalNote.drawing || '');
        if (editorRef.current) {
          editorRef.current.innerHTML = data.personalNote.text;
        }
        // If note has content, don't insert timestamp
        if (data.personalNote.text && data.personalNote.text.trim()) {
          hasInsertedTimestamp.current = true;
        }
      } else if (initialContent) {
        setPersonalNote(initialContent);
        if (editorRef.current) {
          editorRef.current.innerHTML = initialContent;
        }
        // If has initial content, don't insert timestamp
        if (initialContent.trim()) {
          hasInsertedTimestamp.current = true;
        }
      } else {
        // Clear the editor when switching to a verse without notes
        setPersonalNote('');
        setDrawingData('');
        if (editorRef.current) {
          editorRef.current.innerHTML = '';
        }
        // Allow timestamp insertion for empty notes
        hasInsertedTimestamp.current = false;
      }
    }
  };

  const handleSaveNote = async (isAutoSave = false) => {
    if (!selection) {
      alert('Please select a verse first before saving a note');
      return;
    }

    const parts = selection.id.split(':');
    if (parts.length >= 3) {
      const bookId = parts[0];
      const chapter = parseInt(parts[1]);
      const verses = [parseInt(parts[2])];

      const noteText = editorRef.current?.innerHTML || '';
      const plainText = editorRef.current?.textContent || '';

      if (noteText.trim() || drawingData) {
        const note: PersonalNote = {
          text: noteText,
          drawing: drawingData,
          createdAt: verseData?.personalNote?.createdAt || Date.now(),
          updatedAt: Date.now()
        };

        await verseDataStorage.savePersonalNote(bookId, chapter, verses, note);

        // Call the legacy save handler for backward compatibility
        // Skip trigger update during auto-save to prevent view refresh
        onSaveNote(selection.id, noteText, isAutoSave);

        // Update verseData state without reloading (to preserve cursor position)
        setVerseData(prev => prev ? { ...prev, personalNote: note } : null);
      } else {
        await verseDataStorage.deletePersonalNote(bookId, chapter, verses);
        onSaveNote(selection.id, '', isAutoSave);

        // Update verseData state without reloading
        setVerseData(prev => prev ? { ...prev, personalNote: undefined } : null);
      }

      setIsSaved(true);
      // Don't reload data here - it resets cursor position
    }
  };

  const insertTimestamp = () => {
    if (!editorRef.current || !selection) return;

    const now = new Date();
    const timeStr = now.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    const dateStr = now.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });

    // Create timestamp element
    const timestampSpan = document.createElement('span');
    timestampSpan.contentEditable = 'false';
    timestampSpan.style.fontSize = '14px';
    timestampSpan.style.color = '#94a3b8';
    timestampSpan.style.fontWeight = 'normal';
    timestampSpan.style.userSelect = 'none';
    timestampSpan.textContent = `[${dateStr} ${timeStr}]`;

    // Create a text node with a space after the timestamp
    const spaceNode = document.createTextNode(' ');

    // Save current selection/cursor position
    const windowSelection = window.getSelection();
    let savedRange: Range | null = null;
    let cursorOffset = 0;
    let cursorContainer: Node | null = null;

    if (windowSelection && windowSelection.rangeCount > 0) {
      savedRange = windowSelection.getRangeAt(0).cloneRange();
      cursorOffset = savedRange.startOffset;
      cursorContainer = savedRange.startContainer;
    }

    // Insert timestamp at the very beginning of the editor content
    const firstChild = editorRef.current.firstChild;
    if (firstChild) {
      // Insert before the first child
      editorRef.current.insertBefore(spaceNode, firstChild);
      editorRef.current.insertBefore(timestampSpan, spaceNode);
    } else {
      // No content yet, just append
      editorRef.current.appendChild(timestampSpan);
      editorRef.current.appendChild(spaceNode);
    }

    // Restore cursor position
    if (windowSelection && savedRange && cursorContainer) {
      try {
        const newRange = document.createRange();
        newRange.setStart(cursorContainer, cursorOffset);
        newRange.setEnd(cursorContainer, cursorOffset);
        windowSelection.removeAllRanges();
        windowSelection.addRange(newRange);
      } catch (e) {
        // If restoring fails, place cursor after the space
        const newRange = document.createRange();
        newRange.setStartAfter(spaceNode);
        newRange.setEndAfter(spaceNode);
        windowSelection.removeAllRanges();
        windowSelection.addRange(newRange);
      }
    }

    // Focus the editor
    editorRef.current.focus();

    hasInsertedTimestamp.current = true;
  };

  const handleContentChange = () => {
    const now = Date.now();
    const timeSinceLastActivity = now - lastActivityTime.current;

    // Get current text content from the editor directly
    const currentHTML = editorRef.current?.innerHTML || '';
    const currentText = currentHTML.replace(/<[^>]*>/g, '').trim();

    // Check if content already starts with a timestamp pattern [YYYY年MM月DD日 HH:MM]
    const hasTimestampAtStart = /^\[\d{4}年\d{1,2}月\d{1,2}日\s+\d{1,2}:\d{2}\]/.test(currentText);

    // Insert timestamp when:
    // 1. Starting a new note (empty note, first input)
    // 2. After 2+ minutes of idle time
    if (timeSinceLastActivity > 2 * 60 * 1000) {
      // Reset the flag when idle time has passed, but only if no timestamp exists
      if (!hasTimestampAtStart) {
        hasInsertedTimestamp.current = false;
      }
    }

    // Check if we should insert timestamp
    // Only insert if: no timestamp has been inserted yet, text is not empty, and no timestamp exists at start
    const shouldInsertTimestamp = !hasInsertedTimestamp.current && currentText.length > 0 && !hasTimestampAtStart;

    if (shouldInsertTimestamp) {
      insertTimestamp();
    }

    // Update last activity time
    lastActivityTime.current = now;

    setIsSaved(false);

    // Clear existing timer
    if (autoSaveTimer.current) {
      clearTimeout(autoSaveTimer.current);
    }

    // Set new timer for auto-save
    autoSaveTimer.current = window.setTimeout(() => {
      handleSaveNote(true); // Pass true to indicate this is an auto-save
    }, 2000);
  };

  const handleDeleteResearch = async (researchId: string) => {
    if (!selection || !verseData) return;
    
    const parts = selection.id.split(':');
    if (parts.length >= 3) {
      const bookId = parts[0];
      const chapter = parseInt(parts[1]);
      const verses = [parseInt(parts[2])];
      
      await verseDataStorage.deleteAIResearch(bookId, chapter, verses, researchId);
      loadVerseData();
    }
  };

  // Preprocess text to handle Greek/Hebrew wrapped in unnecessary LaTeX
  const preprocessResearchText = (text: string): string => {
    let processed = text;
    
    // Replace $\text{...}$ with just the content when it contains Greek/Hebrew/special characters
    processed = processed.replace(/\$\\text\{([^}]+)\}\$/g, (match, content) => {
      // Check if content contains Greek, Hebrew, or other special characters
      // Greek: U+0370-U+03FF, U+1F00-U+1FFF
      // Hebrew: U+0590-U+05FF
      // Extended Greek: U+1F00-U+1FFF
      if (/[\u0370-\u03FF\u1F00-\u1FFF\u0590-\u05FF]/.test(content)) {
        return content; // Return just the text without LaTeX wrapping
      }
      return match; // Keep LaTeX for actual math
    });
    
    // Also handle italic formatting around Greek/Hebrew (e.g., *humin*)
    // This will italicize transliterations properly
    processed = processed.replace(/\*([a-zA-Z]+)\*/g, '_$1_');
    
    return processed;
  };

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) {
      return date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit' 
      });
    } else if (days < 7) {
      return `${days}d ago`;
    } else {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      });
    }
  };

  const renderNotesTab = () => {
    // Remove the verse reference prefix from selectedRawText (e.g., "[腓立比书 Philippians 3:8]")
    const getCleanVerseText = (text: string) => {
      if (!text) return '';
      // Remove the reference in brackets at the start
      return text.replace(/^\[.*?\]\s*/, '');
    };

    return (
    <div className="notes-tab">
      {selection?.selectedRawText && (
        <div className="verse-quote-block">
          <div className="verse-quote-header">
            {selection.bookName} {selection.chapter}:{selection.verseNums.join('-')}
          </div>
          <div className="verse-quote-text">
            {getCleanVerseText(selection.selectedRawText)}
          </div>
        </div>
      )}

      {mode === 'text' ? (
        <div
          ref={editorRef}
          className="note-editor"
          contentEditable
          onInput={handleContentChange}
          placeholder="Write your notes here..."
          style={{
            minHeight: '200px',
            padding: '12px',
            outline: 'none',
            fontSize: '14px',
            lineHeight: '1.6'
          }}
        />
      ) : (
        <DrawingCanvas
          ref={canvasRef}
          onChange={(data) => {
            setDrawingData(data);
            handleContentChange();
          }}
          initialData={drawingData}
        />
      )}

      <div className="note-toolbar">
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setMode(mode === 'text' ? 'draw' : 'text')}
            className="toolbar-btn"
          >
            {mode === 'text' ? '✏️ Draw' : '📝 Text'}
          </button>

          <button
            onClick={handleSaveNote}
            className="toolbar-btn"
            style={{ background: '#4CAF50', color: 'white' }}
          >
            💾 Save
          </button>

          {(personalNote || drawingData) && (
            <button
              onClick={() => {
                if (confirm('Are you sure you want to delete this note?')) {
                  if (editorRef.current) {
                    editorRef.current.innerHTML = '';
                  }
                  setDrawingData('');
                  handleSaveNote(false);
                }
              }}
              className="toolbar-btn"
              style={{ background: '#ef4444', color: 'white' }}
            >
              🗑️ Delete
            </button>
          )}
        </div>

        {!isSaved && (
          <span className="save-indicator">Auto-saving...</span>
        )}
      </div>
    </div>
    );
  };

  const renderResearchTab = () => {
    
    return (
    <div className="research-tab">
      {verseData?.aiResearch && verseData.aiResearch.length > 0 ? (
        <div className="research-list">
          {verseData.aiResearch.map((research) => (
            <div key={research.id} className="research-entry">
              <div className="research-header">
                <div className="research-query">
                  <strong>Q:</strong> {research.query}
                </div>
                <div className="research-actions">
                  <span className="timestamp">{formatTimestamp(research.timestamp)}</span>
                  <button
                    onClick={() => handleDeleteResearch(research.id)}
                    className="delete-btn"
                    title="Delete research"
                  >
                    🗑️
                  </button>
                </div>
              </div>
              
              <div className="research-response">
                <LazyMarkdown
                  components={{
                    p: ({ children }) => { const b = selection?.id?.split(':')[0]; return <p style={{ marginBottom: '0.5em' }}>{_pc(children, onNavigate, b)}</p>; },
                    li: ({ children }) => { const b = selection?.id?.split(':')[0]; return <li>{_pc(children, onNavigate, b)}</li>; },
                    strong: ({ children }) => { const b = selection?.id?.split(':')[0]; return <strong style={{ fontWeight: 600 }}>{_pc(children, onNavigate, b)}</strong>; },
                    code: ({ inline, className, children }) => {
                      // Check if this is a math expression
                      const match = /language-(\w+)/.exec(className || '');
                      const isMath = match && match[1] === 'math';
                      
                      if (isMath || inline === false) {
                        return (
                          <pre style={{ 
                            backgroundColor: '#f5f5f5', 
                            padding: '8px', 
                            borderRadius: '4px',
                            overflowX: 'auto'
                          }}>
                            <code>{children}</code>
                          </pre>
                        );
                      }
                      
                      return (
                        <code style={{ 
                          backgroundColor: '#f0f0f0', 
                          padding: '1px 4px', 
                          borderRadius: '3px',
                          fontFamily: 'monospace',
                          fontSize: '0.9em'
                        }}>{children}</code>
                      );
                    }
                  }}
                >
                  {preprocessResearchText(research.response)}
                </LazyMarkdown>
              </div>
              
              {research.tags && research.tags.length > 0 && (
                <div className="research-tags">
                  {research.tags.map((tag, idx) => (
                    <span key={idx} className="tag">#{tag}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <p>No AI research yet</p>
          <p className="hint">Select text and choose "Research with AI" to add research</p>
        </div>
      )}
    </div>
    );
  };

  const renderAllTab = () => {
    const allItems: Array<{
      type: 'note' | 'research';
      timestamp: number;
      content: any;
    }> = [];
    
    if (verseData?.personalNote) {
      allItems.push({
        type: 'note',
        timestamp: verseData.personalNote.updatedAt,
        content: verseData.personalNote
      });
    }
    
    if (verseData?.aiResearch) {
      verseData.aiResearch.forEach(research => {
        allItems.push({
          type: 'research',
          timestamp: research.timestamp,
          content: research
        });
      });
    }
    
    // Sort by timestamp, newest first
    allItems.sort((a, b) => b.timestamp - a.timestamp);
    
    return (
      <div className="all-tab">
        {allItems.length > 0 ? (
          <div className="timeline">
            {allItems.map((item, idx) => (
              <div key={idx} className={`timeline-item ${item.type}`}>
                <div className="timeline-marker">
                  {item.type === 'note' ? '📝' : '🤖'}
                </div>
                
                <div className="timeline-content">
                  <div className="timeline-header">
                    <span className="timeline-type">
                      {item.type === 'note' ? 'Personal Note' : 'AI Research'}
                    </span>
                    <span className="timeline-time">
                      {formatTimestamp(item.timestamp)}
                    </span>
                  </div>
                  
                  {item.type === 'note' ? (
                    <div 
                      className="note-preview"
                      dangerouslySetInnerHTML={{ __html: item.content.text }}
                    />
                  ) : (
                    <div className="research-preview">
                      <div className="research-q">Q: {item.content.query}</div>
                      <div className="research-a">
                        <LazyMarkdown
                          components={{
                            p: ({ children }) => { const b = selection?.id?.split(':')[0]; return <p style={{ marginBottom: '0.5em' }}>{_pc(children, onNavigate, b)}</p>; },
                            li: ({ children }) => { const b = selection?.id?.split(':')[0]; return <li>{_pc(children, onNavigate, b)}</li>; },
                            strong: ({ children }) => { const b = selection?.id?.split(':')[0]; return <strong style={{ fontWeight: 600 }}>{_pc(children, onNavigate, b)}</strong>; },
                            code: ({ inline, className, children }) => {
                              const match = /language-(\w+)/.exec(className || '');
                              const isMath = match && match[1] === 'math';
                              
                              if (isMath || inline === false) {
                                return (
                                  <pre style={{ 
                                    backgroundColor: '#f5f5f5', 
                                    padding: '8px', 
                                    borderRadius: '4px',
                                    overflowX: 'auto'
                                  }}>
                                    <code>{children}</code>
                                  </pre>
                                );
                              }
                              
                              return (
                                <code style={{ 
                                  backgroundColor: '#f0f0f0', 
                                  padding: '1px 4px', 
                                  borderRadius: '3px',
                                  fontFamily: 'monospace',
                                  fontSize: '0.9em'
                                }}>{children}</code>
                              );
                            }
                          }}
                        >
                          {preprocessResearchText(item.content.response)}
                        </LazyMarkdown>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <p>No content yet</p>
          </div>
        )}
      </div>
    );
  };

  if (!selection) {
    return (
      <div className="notebook-empty">
        <p>Select a verse to add notes</p>
      </div>
    );
  }

  return (
    <div className="enhanced-notebook">
      <div className="notebook-header">
        <h3>{selection.bookName} {selection.chapter}:{selection.verseNums.join('-')}</h3>
        
        <div className="tab-selector">
          <button
            className={`tab ${activeTab === 'research' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('research');
            }}
          >
            🤖 AI Research {verseData?.aiResearch?.length ? `(${verseData.aiResearch.length})` : ''}
          </button>
          <button
            className={`tab ${activeTab === 'notes' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('notes');
            }}
          >
            📝 My Notes
          </button>
          <button
            className={`tab ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('all');
            }}
          >
            📚 All
          </button>
        </div>
      </div>
      
      <div className="notebook-content">
        {activeTab === 'notes' && renderNotesTab()}
        {activeTab === 'research' && renderResearchTab()}
        {activeTab === 'all' && renderAllTab()}
      </div>

      <style>{`
        .enhanced-notebook {
          height: 100%;
          display: flex;
          flex-direction: column;
          background: white;
        }

        .notebook-header {
          padding: 12px;
          border-bottom: 1px solid #e0e0e0;
          background: #f8f8f8;
        }

        .notebook-header h3 {
          margin: 0 0 8px 0;
          font-size: 14px;
          color: #333;
        }

        .tab-selector {
          display: flex;
          gap: 8px;
        }

        .tab {
          padding: 6px 12px;
          background: white;
          border: 1px solid #ddd;
          border-radius: 6px;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .tab:hover {
          background: #f0f0f0;
        }

        .tab.active {
          background: #4f46e5;
          color: white;
          border-color: #4f46e5;
        }

        .notebook-content {
          flex: 1;
          overflow-y: auto;
          padding: 12px;
        }

        .verse-quote-block {
          padding: 12px;
          background: #f8f9fa;
          border-left: 4px solid #6366f1;
          border-radius: 4px;
          margin-bottom: 16px;
        }

        .verse-quote-header {
          font-size: 13px;
          font-weight: 600;
          color: #4f46e5;
          margin-bottom: 8px;
        }

        .verse-quote-text {
          font-size: 14px;
          font-style: italic;
          color: #475569;
          line-height: 1.6;
        }

        .note-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 0;
          border-top: 1px solid #e0e0e0;
          margin-top: 12px;
        }

        .toolbar-btn {
          padding: 4px 12px;
          background: #f0f0f0;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 13px;
          cursor: pointer;
        }

        .toolbar-btn:hover {
          background: #e0e0e0;
        }

        .save-indicator {
          font-size: 12px;
          color: #666;
          font-style: italic;
        }

        .research-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .research-entry {
          padding: 12px;
          background: #f8f8f8;
          border-radius: 8px;
          border: 1px solid #e0e0e0;
        }

        .research-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 8px;
        }

        .research-query {
          flex: 1;
          font-size: 13px;
          color: #333;
        }

        .research-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .timestamp {
          font-size: 11px;
          color: #999;
        }

        .delete-btn {
          background: none;
          border: none;
          cursor: pointer;
          padding: 2px;
          opacity: 0.6;
          transition: opacity 0.2s;
        }

        .delete-btn:hover {
          opacity: 1;
        }

        .research-response {
          font-size: 13px;
          line-height: 1.6;
          color: #555;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', 'Noto Sans Hebrew', 'Noto Sans Arabic', system-ui, sans-serif;
        }
        
        .research-response p {
          margin: 0 0 0.5em 0;
        }
        
        .research-response p:last-child {
          margin-bottom: 0;
        }
        
        .research-response ul, .research-response ol {
          margin: 0.5em 0;
          padding-left: 1.5em;
        }
        
        .research-response li {
          margin: 0.25em 0;
        }
        
        /* KaTeX math styling */
        .research-response .katex,
        .research-a .katex {
          font-size: 1em;
        }
        
        .research-response .katex-display,
        .research-a .katex-display {
          margin: 0.5em 0;
        }

        .research-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 8px;
        }

        .tag {
          padding: 2px 8px;
          background: #e0e7ff;
          color: #4f46e5;
          border-radius: 12px;
          font-size: 11px;
        }

        .empty-state {
          text-align: center;
          padding: 40px 20px;
          color: #999;
        }

        .empty-state .hint {
          font-size: 12px;
          margin-top: 8px;
        }

        .timeline {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .timeline-item {
          display: flex;
          gap: 12px;
        }

        .timeline-marker {
          font-size: 20px;
          flex-shrink: 0;
        }

        .timeline-content {
          flex: 1;
          padding: 12px;
          background: #f8f8f8;
          border-radius: 8px;
          border: 1px solid #e0e0e0;
        }

        .timeline-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
        }

        .timeline-type {
          font-size: 12px;
          font-weight: 600;
          color: #666;
        }

        .timeline-time {
          font-size: 11px;
          color: #999;
        }

        .note-preview, .research-preview {
          font-size: 13px;
          line-height: 1.6;
          color: #333;
        }

        .research-q {
          font-weight: 500;
          margin-bottom: 4px;
        }

        .research-a {
          color: #555;
        }
        
        .research-a p {
          margin: 0 0 0.5em 0;
        }
        
        .research-a p:last-child {
          margin-bottom: 0;
        }

        .notebook-empty {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: #999;
          font-size: 14px;
        }
      `}</style>
    </div>
  );
};

export default EnhancedNotebook;