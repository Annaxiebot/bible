import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useGeneralResearch } from '../hooks/useGeneralResearch';
import { GeneralResearchEntry } from '../hooks/useGeneralResearch';

interface GeneralResearchDialogProps {
  onClose: () => void;
}

const GeneralResearchDialog: React.FC<GeneralResearchDialogProps> = ({ onClose }) => {
  const { entries, loading, deleteEntry } = useGeneralResearch();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [imageEnlarged, setImageEnlarged] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Auto-select first entry when data loads
  useEffect(() => {
    if (!loading && entries.length > 0 && !selectedId) {
      setSelectedId(entries[0].id);
    }
  }, [loading, entries, selectedId]);

  // Reset image enlarged state when switching entries
  useEffect(() => {
    setImageEnlarged(false);
  }, [selectedId]);

  // Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Focus trap
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  const selectedEntry = entries.find(e => e.id === selectedId);

  // Build a displayable src from image data (may be raw base64 or full data URL)
  const getImageSrc = (image: { data: string; mimeType?: string }) => {
    if (image.data.startsWith('data:')) return image.data;
    return `data:${image.mimeType || 'image/jpeg'};base64,${image.data}`;
  };

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString(navigator.language || 'zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleDelete = useCallback(async () => {
    if (!selectedId) return;

    if (confirm('确定删除这条研究记录吗？\nAre you sure you want to delete this research entry?')) {
      const currentIndex = entries.findIndex(e => e.id === selectedId);
      const nextId = entries.length > 1
        ? (entries[currentIndex + 1] || entries[currentIndex - 1])?.id ?? null
        : null;

      const success = await deleteEntry(selectedId);
      if (success) {
        setSelectedId(nextId);
      }
    }
  }, [selectedId, entries, deleteEntry]);

  const parseBilingualResponse = useMemo(() => {
    const response = selectedEntry?.response ?? '';
    const parts = response.split('[SPLIT]');
    if (parts.length === 2) {
      return {
        chinese: parts[0].trim(),
        english: parts[1].trim(),
      };
    }
    return {
      chinese: response,
      english: null,
    };
  }, [selectedEntry?.response]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="General Research Viewer"
        tabIndex={-1}
        className="general-research-dialog bg-white rounded-xl shadow-2xl w-[95%] max-w-5xl h-[85vh] flex flex-col overflow-hidden outline-none"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b bg-slate-50">
          <h3 id="general-research-title" className="font-bold text-base text-slate-800">🌟 通用研究 General Research</h3>
          <button onClick={onClose} aria-label="Close dialog" className="p-1 hover:bg-slate-200 rounded-lg transition-colors">
            <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-sm text-slate-400">加载中 Loading...</div>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-slate-400">
              <div className="text-4xl mb-2">📭</div>
              <div className="text-sm">暂无通用研究</div>
              <div className="text-xs">No general research yet</div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            {/* Left pane - List */}
            <div className="w-full md:w-[35%] max-h-[40%] md:max-h-full border-r overflow-y-auto bg-slate-50">
              <div className="p-2 space-y-1">
                {entries.map(entry => (
                  <button
                    key={entry.id}
                    onClick={() => setSelectedId(entry.id)}
                    className={`w-full text-left p-3 rounded-lg transition-colors ${
                      selectedId === entry.id
                        ? 'bg-indigo-100 border-2 border-indigo-400'
                        : 'bg-white hover:bg-slate-100 border-2 border-transparent'
                    }`}
                  >
                    {/* Thumbnail image if present */}
                    {entry.image && (
                      <div className="mb-2 rounded overflow-hidden">
                        <img
                          src={getImageSrc(entry.image)}
                          alt={entry.image.filename || 'Research image'}
                          className="w-full h-20 object-cover"
                        />
                      </div>
                    )}

                    {/* Question preview */}
                    <div className="text-xs font-medium text-slate-700 line-clamp-2 mb-1">
                      {entry.query}
                    </div>

                    {/* Timestamp */}
                    <div className="text-[10px] text-slate-400">
                      {formatTimestamp(entry.timestamp)}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Right pane - Details */}
            <div className="flex-1 overflow-y-auto p-4 max-h-[60%] md:max-h-full">
              {selectedEntry ? (
                <div className="space-y-4">
                  {/* Image if present */}
                  {selectedEntry.image && (
                    <div className="relative">
                      <button
                        onClick={() => setImageEnlarged(!imageEnlarged)}
                        className="block border-0 bg-transparent p-0 cursor-pointer"
                        aria-label={imageEnlarged ? 'Shrink image' : 'Enlarge image'}
                      >
                        <img
                          src={getImageSrc(selectedEntry.image)}
                          alt={selectedEntry.image.filename || 'Research image'}
                          className={`rounded-lg shadow-lg transition-all ${
                            imageEnlarged ? 'max-w-full' : 'max-w-md'
                          }`}
                        />
                      </button>
                      {selectedEntry.image.caption && (
                        <div className="mt-1 text-xs text-slate-500 italic">
                          {selectedEntry.image.caption}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Question */}
                  <div>
                    <div className="text-xs font-semibold text-slate-500 uppercase mb-1">
                      问题 Question:
                    </div>
                    <div className="text-sm text-slate-800 bg-slate-50 p-3 rounded-lg">
                      {selectedEntry.query}
                    </div>
                  </div>

                  {/* Response */}
                  <div>
                    <div className="text-xs font-semibold text-slate-500 uppercase mb-1">
                      回复 Response:
                    </div>
                    <div className="text-sm text-slate-800 bg-slate-50 p-3 rounded-lg space-y-3">
                      <div className="whitespace-pre-wrap">{parseBilingualResponse.chinese}</div>
                      {parseBilingualResponse.english && (
                        <>
                          <div className="border-t border-slate-200 pt-3"></div>
                          <div className="whitespace-pre-wrap text-slate-600">{parseBilingualResponse.english}</div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Metadata */}
                  <div className="text-xs text-slate-400">
                    <div>时间 Timestamp: {formatTimestamp(selectedEntry.timestamp)}</div>
                    {selectedEntry.tags && selectedEntry.tags.length > 0 && (
                      <div className="mt-1">
                        标签 Tags: {selectedEntry.tags.join(', ')}
                      </div>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2 pt-2 border-t">
                    <button
                      onClick={handleDelete}
                      className="px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                    >
                      🗑️ 删除 Delete
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                  选择一条记录查看详情
                  <br />
                  Select an entry to view details
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GeneralResearchDialog;
