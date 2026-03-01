import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { verseDataStorage } from '../services/verseDataStorage';
import { notesStorage } from '../services/notesStorage';
import { useStorageUpdate } from '../hooks/useStorageUpdate';
import { BIBLE_BOOKS } from '../constants';
import { VerseData, AIResearchEntry } from '../types/verseData';
import { exportImportService } from '../services/exportImportService';
import { stripHTML } from '../utils/textUtils';

interface NotesListProps {
  onSelectNote?: (bookId: string, chapter: number, verses?: number[]) => void;
  onClose?: () => void;
}

interface NoteItem {
  id: string;
  bookId: string;
  bookName: string;
  chapter: number;
  verses: number[];
  personalNote?: string;
  aiResearch: AIResearchEntry[];
  aiResearchCount: number;
  createdAt: number;
  updatedAt: number;
  verseText?: string;
}

type SortMode = 'bible-order' | 'latest-first';

const NotesList: React.FC<NotesListProps> = ({ onSelectNote, onClose }) => {
  const storageTick = useStorageUpdate();
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('latest-first');
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const [selectedForExport, setSelectedForExport] = useState<Set<string>>(new Set());
  const [exportMode, setExportMode] = useState(false);
  const [exportStatus, setExportStatus] = useState('');
  const importInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadNotes();
  }, [storageTick]);

  const loadNotes = async () => {
    try {
      setLoading(true);
      
      // Get all verse data
      const verseData = await verseDataStorage.getAllData();
      
      // Get old notes
      const oldNotes = await notesStorage.getAllNotes();
      
      // Convert to NoteItem format
      const noteItems: NoteItem[] = [];
      
      // Process verse data
      verseData.forEach((data: VerseData) => {
        const book = BIBLE_BOOKS.find(b => b.id === data.bookId);
        if (book && (data.personalNote || data.aiResearch.length > 0)) {
          noteItems.push({
            id: data.id,
            bookId: data.bookId,
            bookName: book.name,
            chapter: data.chapter,
            verses: data.verses,
            personalNote: data.personalNote?.text,
            aiResearch: data.aiResearch,
            aiResearchCount: data.aiResearch.length,
            createdAt: data.personalNote?.createdAt
              || (data.aiResearch.length > 0 ? Math.min(...data.aiResearch.map(r => r.timestamp || 0)) : 0),
            updatedAt: data.personalNote?.updatedAt
              || (data.aiResearch.length > 0 ? Math.max(...data.aiResearch.map(r => r.timestamp || 0)) : 0),
            verseText: (data as VerseData & { verseText?: string }).verseText
          });
        }
      });
      
      // Process old notes
      Object.entries(oldNotes).forEach(([noteId, content]) => {
        const parts = noteId.split(':');
        if (parts.length >= 2) {
          const bookId = parts[0];
          const chapter = parseInt(parts[1]);
          const verses = parts[2] ? [parseInt(parts[2])] : [];
          const book = BIBLE_BOOKS.find(b => b.id === bookId);
          
          if (book && content) {
            // Check if this note already exists in verse data
            const exists = noteItems.some(n => 
              n.bookId === bookId && n.chapter === chapter && 
              JSON.stringify(n.verses) === JSON.stringify(verses)
            );
            
            if (!exists) {
              noteItems.push({
                id: noteId,
                bookId,
                bookName: book.name,
                chapter,
                verses,
                personalNote: content,
                aiResearch: [],
                aiResearchCount: 0,
                createdAt: 0, // Old notes don't have timestamps
                updatedAt: 0,
              });
            }
          }
        }
      });
      
      setNotes(noteItems);
    } catch (error) {
      // silently handle
    } finally {
      setLoading(false);
    }
  };

  const filteredAndSortedNotes = useMemo(() => {
    let filtered = notes;
    
    // Apply search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = notes.filter(note =>
        note.bookName.toLowerCase().includes(term) ||
        note.personalNote?.toLowerCase().includes(term) ||
        note.verseText?.toLowerCase().includes(term) ||
        note.aiResearch.some(r => r.query.toLowerCase().includes(term) || r.response.toLowerCase().includes(term)) ||
        `${note.chapter}`.includes(term) ||
        note.verses.some(v => `${v}`.includes(term))
      );
    }
    
    // Apply sort
    const sorted = [...filtered];
    if (sortMode === 'latest-first') {
      sorted.sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
    } else {
      // Bible order: sort by book index, then chapter, then verse
      sorted.sort((a, b) => {
        const bookIndexA = BIBLE_BOOKS.findIndex(book => book.id === a.bookId);
        const bookIndexB = BIBLE_BOOKS.findIndex(book => book.id === b.bookId);
        
        if (bookIndexA !== bookIndexB) return bookIndexA - bookIndexB;
        if (a.chapter !== b.chapter) return a.chapter - b.chapter;
        if (a.verses[0] !== b.verses[0]) return (a.verses[0] || 0) - (b.verses[0] || 0);
        return 0;
      });
    }
    
    return sorted;
  }, [notes, searchTerm, sortMode]);

  const toggleExpanded = (noteId: string) => {
    setExpandedNotes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(noteId)) {
        newSet.delete(noteId);
      } else {
        newSet.add(noteId);
      }
      return newSet;
    });
  };

  const formatVerseReference = (note: NoteItem) => {
    let ref = `${note.bookName} ${note.chapter}`;
    if (note.verses.length > 0) {
      if (note.verses.length === 1) {
        ref += `:${note.verses[0]}`;
      } else {
        ref += `:${note.verses[0]}-${note.verses[note.verses.length - 1]}`;
      }
    }
    return ref;
  };

  const formatDate = (timestamp: number) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    // Compare calendar dates, not raw time difference
    const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffDays = Math.round((today.getTime() - dateDay.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return '今天 Today';
    if (diffDays === 1) return '昨天 Yesterday';
    if (diffDays < 7) return `${diffDays}天前 ${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}周前 ${Math.floor(diffDays / 7)} weeks ago`;
    return date.toLocaleDateString();
  };

  const truncateText = (text: string, maxLength: number = 150) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  // Group notes by book+chapter for export selection
  const chapterGroups = useMemo(() => {
    const groups: Record<string, { bookId: string; bookName: string; chapter: number; noteCount: number; key: string }> = {};
    for (const note of notes) {
      const key = `${note.bookId}:${note.chapter}`;
      if (!groups[key]) {
        groups[key] = { bookId: note.bookId, bookName: note.bookName, chapter: note.chapter, noteCount: 0, key };
      }
      groups[key].noteCount++;
    }
    return Object.values(groups).sort((a, b) => {
      const ai = BIBLE_BOOKS.findIndex(bk => bk.id === a.bookId);
      const bi = BIBLE_BOOKS.findIndex(bk => bk.id === b.bookId);
      if (ai !== bi) return ai - bi;
      return a.chapter - b.chapter;
    });
  }, [notes]);

  const toggleChapterSelection = (key: string) => {
    setSelectedForExport(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleExportSelected = useCallback(async () => {
    try {
      const allData = await verseDataStorage.getAllData();
      const filtered = allData.filter(d => {
        const key = `${d.bookId}:${d.chapter}`;
        return selectedForExport.has(key);
      });
      if (filtered.length === 0) return;

      const dataObj: Record<string, VerseData> = {};
      filtered.forEach(d => { dataObj[d.id] = d; });

      const booksSet = new Set(filtered.map(d => d.bookId));
      const exportData = {
        version: '1.0' as const,
        exportDate: new Date().toISOString(),
        metadata: {
          totalNotes: filtered.filter(d => d.personalNote).length,
          totalResearch: filtered.reduce((acc, d) => acc + d.aiResearch.length, 0),
          booksIncluded: Array.from(booksSet),
        },
        data: dataObj,
      };

      const timestamp = new Date().toISOString().split('T')[0];
      const content = JSON.stringify(exportData);
      const blob = new Blob([content], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bible-notes-${timestamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setExportStatus(`Exported ${filtered.length} entries`);
      setTimeout(() => { setExportStatus(''); setExportMode(false); setSelectedForExport(new Set()); }, 2000);
    } catch (err) {
      setExportStatus('Export failed');
      setTimeout(() => setExportStatus(''), 2000);
    }
  }, [selectedForExport]);

  const handleExportAll = useCallback(async () => {
    try {
      setExportStatus('Exporting...');
      await exportImportService.exportAndDownload('json');
      setExportStatus('Exported all notes!');
      setTimeout(() => setExportStatus(''), 2000);
    } catch {
      setExportStatus('Export failed');
      setTimeout(() => setExportStatus(''), 2000);
    }
  }, []);

  const handleImportNotes = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setExportStatus('Importing...');
      const content = await file.text();
      const result = await exportImportService.importFromJSON(content, 'merge_combine');
      setExportStatus(`Imported ${result.imported} notes (${result.skipped} skipped)`);
      loadNotes();
      setTimeout(() => setExportStatus(''), 3000);
    } catch {
      setExportStatus('Import failed');
      setTimeout(() => setExportStatus(''), 2000);
    }
    e.target.value = '';
  }, []);

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="text-lg font-semibold text-slate-800">
          笔记列表 Notes List
        </h2>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Search and Controls */}
      <div className="p-4 space-y-3 border-b">
        {/* Search Bar */}
        <div className="relative">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="搜索笔记... Search notes..."
            className="w-full px-4 py-2 pl-10 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <svg className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        {/* Sort Options */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">排序 Sort:</span>
          <button
            onClick={() => setSortMode('latest-first')}
            className={`px-3 py-1 text-xs rounded-lg transition-colors ${
              sortMode === 'latest-first'
                ? 'bg-indigo-100 text-indigo-700'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            最新 Latest
          </button>
          <button
            onClick={() => setSortMode('bible-order')}
            className={`px-3 py-1 text-xs rounded-lg transition-colors ${
              sortMode === 'bible-order'
                ? 'bg-indigo-100 text-indigo-700'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            圣经顺序 Bible Order
          </button>
        </div>

        {/* Export/Import Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-500">{filteredAndSortedNotes.length} notes</span>
          <div className="flex-1" />
          <input ref={importInputRef} type="file" accept=".json" onChange={handleImportNotes} className="hidden" />
          <button
            onClick={() => importInputRef.current?.click()}
            className="px-2.5 py-1 text-xs rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
          >
            导入 Import
          </button>
          <button
            onClick={handleExportAll}
            className="px-2.5 py-1 text-xs rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
          >
            导出全部 Export All
          </button>
          <button
            onClick={() => { setExportMode(!exportMode); setSelectedForExport(new Set()); }}
            className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${
              exportMode ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {exportMode ? '取消 Cancel' : '选择导出 Select'}
          </button>
        </div>
        {exportStatus && (
          <div className="text-xs text-indigo-600 font-medium">{exportStatus}</div>
        )}
      </div>

      {/* Chapter selection for export */}
      {exportMode && (
        <div className="p-3 border-b bg-indigo-50/50 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-600">Select chapters to export:</span>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedForExport(new Set(chapterGroups.map(g => g.key)))}
                className="text-xs text-indigo-600 hover:underline"
              >
                Select all
              </button>
              <button
                onClick={() => setSelectedForExport(new Set())}
                className="text-xs text-slate-500 hover:underline"
              >
                Clear
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
            {chapterGroups.map(g => (
              <button
                key={g.key}
                onClick={() => toggleChapterSelection(g.key)}
                className={`px-2 py-0.5 text-xs rounded-md border transition-colors ${
                  selectedForExport.has(g.key)
                    ? 'bg-indigo-100 border-indigo-300 text-indigo-700'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                {g.bookName.split(' ')[0]} {g.chapter} ({g.noteCount})
              </button>
            ))}
          </div>
          {selectedForExport.size > 0 && (
            <button
              onClick={handleExportSelected}
              className="w-full py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Export {selectedForExport.size} chapters
            </button>
          )}
        </div>
      )}

      {/* Notes List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="text-sm text-slate-500">加载中... Loading...</div>
          </div>
        ) : filteredAndSortedNotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <svg className="w-12 h-12 text-slate-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm text-slate-500">
              {searchTerm ? '没有找到匹配的笔记 No matching notes' : '暂无笔记 No notes yet'}
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {filteredAndSortedNotes.map((note) => {
              const isExpanded = expandedNotes.has(note.id);
              const hasContent = note.personalNote || note.aiResearchCount > 0;
              
              return (
                <div
                  key={note.id}
                  className="p-4 hover:bg-slate-50 transition-colors cursor-pointer"
                  onClick={() => {
                    if (onSelectNote) {
                      onSelectNote(note.bookId, note.chapter, note.verses);
                    }
                  }}
                >
                  {/* Note Header */}
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="font-medium text-sm text-indigo-600">
                        {formatVerseReference(note)}
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        {note.personalNote && (
                          <span className="flex items-center gap-1 text-xs text-slate-500">
                            <span>📝</span>
                            <span>笔记 Note</span>
                          </span>
                        )}
                        {note.aiResearchCount > 0 && (
                          <span className="flex items-center gap-1 text-xs text-slate-500">
                            <span>🔍</span>
                            <span>{note.aiResearchCount} 研究 research</span>
                          </span>
                        )}
                        <span className="text-xs text-slate-400">
                          {formatDate(note.createdAt)}
                        </span>
                      </div>
                    </div>
                    {hasContent && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpanded(note.id);
                        }}
                        className="p-1 hover:bg-slate-100 rounded transition-colors"
                      >
                        <svg 
                          className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
                          fill="none" 
                          viewBox="0 0 24 24" 
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* Personal Note Content */}
                  {note.personalNote && (
                    <div className="text-sm text-slate-600 mt-2">
                      {isExpanded ? (
                        <div
                          dangerouslySetInnerHTML={{ __html: note.personalNote }}
                          className="prose prose-sm max-w-none"
                        />
                      ) : (
                        <div
                          dangerouslySetInnerHTML={{
                            __html: truncateText(stripHTML(note.personalNote))
                          }}
                        />
                      )}
                    </div>
                  )}

                  {/* AI Research Preview */}
                  {note.aiResearch.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {(isExpanded ? note.aiResearch : note.aiResearch.slice(0, 1)).map((research) => (
                        <div key={research.id} className="p-2.5 bg-indigo-50 rounded-lg border border-indigo-100">
                          <div className="flex items-start gap-1.5">
                            <span className="text-xs mt-0.5">🔍</span>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-medium text-indigo-700">
                                {truncateText(research.query, 80)}
                              </div>
                              <div className="text-xs text-slate-600 mt-1">
                                {isExpanded
                                  ? research.response
                                  : truncateText(stripHTML(research.response), 120)}
                              </div>
                              {research.tags && research.tags.length > 0 && isExpanded && (
                                <div className="flex gap-1 mt-1.5 flex-wrap">
                                  {research.tags.map((tag, i) => (
                                    <span key={i} className="px-1.5 py-0.5 text-[10px] bg-indigo-100 text-indigo-600 rounded">
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                      {!isExpanded && note.aiResearch.length > 1 && (
                        <div className="text-xs text-indigo-500 pl-5">
                          +{note.aiResearch.length - 1} more research
                        </div>
                      )}
                    </div>
                  )}

                  {/* Verse Text Preview (if available) */}
                  {note.verseText && isExpanded && (
                    <div className="mt-3 p-2 bg-amber-50 rounded text-xs text-slate-600 italic">
                      {note.verseText}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default NotesList;