import React, { useState, useEffect, useRef } from 'react';
import { SelectionInfo } from '../types';
import { VerseData, PersonalNote, AIResearchEntry } from '../types/verseData';
import { verseDataStorage } from '../services/verseDataStorage';
import DrawingCanvas, { DrawingCanvasHandle } from './DrawingCanvas';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

interface EnhancedNotebookProps {
  selection: SelectionInfo | null;
  onSaveNote: (id: string, content: string) => void; // For backward compatibility
  initialContent: string;
}

type TabType = 'research' | 'notes' | 'all';

const EnhancedNotebook: React.FC<EnhancedNotebookProps> = ({ 
  selection, 
  onSaveNote, 
  initialContent 
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('research');
  const [verseData, setVerseData] = useState<VerseData | null>(null);
  const [personalNote, setPersonalNote] = useState<string>('');
  const [isSaved, setIsSaved] = useState(true);
  const [mode, setMode] = useState<'text' | 'draw'>('text');
  const [drawingData, setDrawingData] = useState<string>('');
  
  const editorRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<DrawingCanvasHandle>(null);
  const autoSaveTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!selection) return;
    
    loadVerseData();
  }, [selection, initialContent]);

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
      } else if (initialContent) {
        setPersonalNote(initialContent);
        if (editorRef.current) {
          editorRef.current.innerHTML = initialContent;
        }
      } else {
        // Clear the editor when switching to a verse without notes
        setPersonalNote('');
        setDrawingData('');
        if (editorRef.current) {
          editorRef.current.innerHTML = '';
        }
      }
    }
  };

  const handleSaveNote = async () => {
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
        onSaveNote(selection.id, noteText);
      } else {
        await verseDataStorage.deletePersonalNote(bookId, chapter, verses);
        onSaveNote(selection.id, '');
      }
      
      setIsSaved(true);
      loadVerseData(); // Reload to get updated data
    }
  };

  const handleContentChange = () => {
    setIsSaved(false);
    
    // Clear existing timer
    if (autoSaveTimer.current) {
      clearTimeout(autoSaveTimer.current);
    }
    
    // Set new timer for auto-save
    autoSaveTimer.current = window.setTimeout(() => {
      handleSaveNote();
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

  const renderNotesTab = () => (
    <div className="notes-tab">
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
        
        {!isSaved && (
          <span className="save-indicator">Auto-saving...</span>
        )}
      </div>
    </div>
  );

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
                <ReactMarkdown
                  remarkPlugins={[remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                  components={{
                    // Custom rendering for better formatting
                    p: ({ children }) => <p style={{ marginBottom: '0.5em' }}>{children}</p>,
                    strong: ({ children }) => <strong style={{ fontWeight: 600 }}>{children}</strong>,
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
                </ReactMarkdown>
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
                        <ReactMarkdown
                          remarkPlugins={[remarkMath]}
                          rehypePlugins={[rehypeKatex]}
                          components={{
                            p: ({ children }) => <p style={{ marginBottom: '0.5em' }}>{children}</p>,
                            strong: ({ children }) => <strong style={{ fontWeight: 600 }}>{children}</strong>,
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
                        </ReactMarkdown>
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