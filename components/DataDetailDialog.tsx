import React from 'react';
import { NoteDetail, ResearchDetail, ChapterDetail } from '../hooks/useDataStats';

type Mode = 'notes' | 'research' | 'chapters';

interface DataDetailDialogProps {
  mode: Mode;
  noteDetails: NoteDetail[];
  researchDetails: ResearchDetail[];
  chapterDetails: ChapterDetail[];
  onNavigate?: (bookId: string, chapter: number, verses?: number[]) => void;
  onClose: () => void;
}

const TITLES: Record<Mode, string> = {
  notes: '📝 个人笔记 Personal Notes',
  research: '🔍 AI研究 AI Research',
  chapters: '📖 缓存章节 Cached Chapters',
};

const DataDetailDialog: React.FC<DataDetailDialogProps> = ({
  mode, noteDetails, researchDetails, chapterDetails, onNavigate, onClose
}) => {
  const formatRef = (bookName: string, chapter: number, verses: number[]) => {
    let ref = `${bookName} ${chapter}`;
    if (verses.length === 1) ref += `:${verses[0]}`;
    else if (verses.length > 1) ref += `:${verses[0]}-${verses[verses.length - 1]}`;
    return ref;
  };

  // OT/NT split at index 39 (Matthew)
  const otChapters = chapterDetails.filter((_, i) => {
    const idx = chapterDetails.indexOf(chapterDetails[i]);
    // Use the bookId to determine OT vs NT — books before 'matt' are OT
    const otBooks = new Set(['gen','exo','lev','num','deu','jos','jdg','rut','1sa','2sa','1ki','2ki','1ch','2ch','ezr','neh','est','job','psa','pro','ecc','sng','isa','jer','lam','ezk','dan','hos','jol','amo','oba','jon','mic','nam','hab','zep','hag','zec','mal']);
    return otBooks.has(chapterDetails[i].bookId);
  });
  const ntChapters = chapterDetails.filter(c => !otChapters.includes(c));

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-[92%] max-h-[80vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b bg-slate-50">
          <h3 className="font-bold text-sm text-slate-800">{TITLES[mode]}</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-lg transition-colors">
            <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {mode === 'notes' && (
            noteDetails.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">暂无笔记 No notes yet</p>
            ) : (
              <div className="space-y-1">
                {noteDetails.map((n, i) => (
                  <button
                    key={i}
                    onClick={() => { onNavigate?.(n.bookId, n.chapter, n.verses); onClose(); }}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-indigo-50 transition-colors group"
                  >
                    <div className="text-xs font-semibold text-indigo-600 group-hover:text-indigo-800">
                      {formatRef(n.bookName, n.chapter, n.verses)}
                    </div>
                    {n.preview && (
                      <div className="text-xs text-slate-500 mt-0.5 truncate">{n.preview}</div>
                    )}
                  </button>
                ))}
              </div>
            )
          )}

          {mode === 'research' && (
            researchDetails.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">暂无研究 No research yet</p>
            ) : (
              <div className="space-y-1">
                {researchDetails.map((r, i) => (
                  <button
                    key={i}
                    onClick={() => { onNavigate?.(r.bookId, r.chapter, r.verses); onClose(); }}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-indigo-50 transition-colors group"
                  >
                    <div className="text-xs font-semibold text-indigo-600 group-hover:text-indigo-800">
                      {formatRef(r.bookName, r.chapter, r.verses)}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 truncate">Q: {r.query}</div>
                  </button>
                ))}
              </div>
            )
          )}

          {mode === 'chapters' && (
            chapterDetails.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">暂无缓存 No cached chapters</p>
            ) : (
              <div className="space-y-4">
                {otChapters.length > 0 && (
                  <div>
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">旧约 Old Testament</div>
                    <div className="flex flex-wrap gap-1.5">
                      {otChapters.map(c => (
                        <span key={c.bookId} className="px-2 py-1 text-xs bg-amber-50 text-amber-800 border border-amber-200 rounded-md">
                          {c.bookName.split(' ')[0]} <span className="font-semibold">{c.chapterCount}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {ntChapters.length > 0 && (
                  <div>
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">新约 New Testament</div>
                    <div className="flex flex-wrap gap-1.5">
                      {ntChapters.map(c => (
                        <span key={c.bookId} className="px-2 py-1 text-xs bg-blue-50 text-blue-800 border border-blue-200 rounded-md">
                          {c.bookName.split(' ')[0]} <span className="font-semibold">{c.chapterCount}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="pt-2 border-t border-slate-100 text-xs text-slate-400 text-center">
                  共 {chapterDetails.reduce((a, c) => a + c.chapterCount, 0)} 章 chapters cached
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
};

export default DataDetailDialog;
