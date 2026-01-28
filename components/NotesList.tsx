import React, { useState, useEffect, useMemo } from 'react';
import { verseDataStorage } from '../services/verseDataStorage';
import { notesStorage } from '../services/notesStorage';
import { BIBLE_BOOKS } from '../constants';
import { VerseData } from '../types/verseData';

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
  aiResearchCount: number;
  updatedAt: number;
  verseText?: string;
}

type SortMode = 'bible-order' | 'latest-first';

const NotesList: React.FC<NotesListProps> = ({ onSelectNote, onClose }) => {
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('latest-first');
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadNotes();
  }, []);

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
            aiResearchCount: data.aiResearch.length,
            updatedAt: data.personalNote?.updatedAt || data.aiResearch[0]?.timestamp || 0,
            verseText: data.verseText
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
                aiResearchCount: 0,
                updatedAt: Date.now() // Old notes don't have timestamps
              });
            }
          }
        }
      });
      
      setNotes(noteItems);
    } catch (error) {
      console.error('Failed to load notes:', error);
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
        `${note.chapter}`.includes(term) ||
        note.verses.some(v => `${v}`.includes(term))
      );
    }
    
    // Apply sort
    const sorted = [...filtered];
    if (sortMode === 'latest-first') {
      sorted.sort((a, b) => b.updatedAt - a.updatedAt);
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
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
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

        {/* Results Count */}
        <div className="text-xs text-slate-500">
          {filteredAndSortedNotes.length} 条笔记 notes
          {searchTerm && ` (搜索: "${searchTerm}")`}
        </div>
      </div>

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
                          {formatDate(note.updatedAt)}
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

                  {/* Note Content Preview */}
                  {note.personalNote && (
                    <div className="text-sm text-slate-600 mt-2">
                      {isExpanded ? (
                        <div 
                          dangerouslySetInnerHTML={{ 
                            __html: note.personalNote 
                          }} 
                          className="prose prose-sm max-w-none"
                        />
                      ) : (
                        <div 
                          dangerouslySetInnerHTML={{ 
                            __html: truncateText(note.personalNote.replace(/<[^>]*>/g, '')) 
                          }} 
                        />
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