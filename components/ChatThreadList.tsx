/**
 * ChatThreadList.tsx
 *
 * ChatGPT-style sidebar listing all chat threads, grouped by date.
 * Supports new thread, select, delete, and search.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChatHistoryRecord } from '../services/idbService';
import { getAllThreads, createThread, deleteThread, updateThread } from '../services/chatHistoryStorage';

interface ChatThreadListProps {
  activeThreadId: string | null;
  onSelectThread: (threadId: string) => void;
  onNewThread: (thread: ChatHistoryRecord) => void;
  bookId?: string;
  chapter?: number;
}

function formatRelativeDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export type SortMode = 'modified' | 'created' | 'title' | 'messages';

const SORT_STORAGE_KEY = 'chatThreadList.sortMode';

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'modified', label: 'Last modified' },
  { value: 'created', label: 'Created' },
  { value: 'title', label: 'Title (A–Z)' },
  { value: 'messages', label: 'Message count' },
];

function sortThreads(threads: ChatHistoryRecord[], mode: SortMode): ChatHistoryRecord[] {
  const copy = [...threads];
  switch (mode) {
    case 'created':
      return copy.sort((a, b) => {
        const at = a.createdAt ? new Date(a.createdAt).getTime() : a.lastModified || 0;
        const bt = b.createdAt ? new Date(b.createdAt).getTime() : b.lastModified || 0;
        return bt - at; // newest first
      });
    case 'title':
      return copy.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    case 'messages':
      return copy.sort((a, b) => (b.messages?.length || 0) - (a.messages?.length || 0));
    case 'modified':
    default:
      return copy.sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));
  }
}

function groupByDate(
  threads: ChatHistoryRecord[],
  mode: SortMode,
): Array<{ label: string; threads: ChatHistoryRecord[] }> {
  // For date-based sorts, group by the relevant timestamp with relative labels.
  // For non-date sorts, skip grouping (single implicit group) so the alphabetical
  // / message-count order reads top-to-bottom without spurious date headers.
  if (mode !== 'modified' && mode !== 'created') {
    return [{ label: mode === 'title' ? 'By title' : 'By message count', threads }];
  }
  const groups = new Map<string, ChatHistoryRecord[]>();
  for (const t of threads) {
    const iso = mode === 'created'
      ? (t.createdAt || (t.lastModified ? new Date(t.lastModified).toISOString() : new Date().toISOString()))
      : (t.lastModified ? new Date(t.lastModified).toISOString() : (t.createdAt || new Date().toISOString()));
    const label = formatRelativeDate(iso);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(t);
  }
  return Array.from(groups.entries()).map(([label, threads]) => ({ label, threads }));
}

interface ThreadItemProps {
  thread: ChatHistoryRecord;
  isActive: boolean;
  confirmDelete: boolean;
  onSelect: (threadId: string) => void;
  onRequestDelete: (threadId: string) => void;
  onConfirmDelete: (threadId: string) => void;
  onCancelDelete: () => void;
  onRename: (threadId: string, newTitle: string) => void;
}

const ThreadItem = React.memo<ThreadItemProps>(({
  thread,
  isActive,
  confirmDelete,
  onSelect,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
  onRename,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(thread.title || '');
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Refocus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSelect = () => {
    if (isEditing) return; // don't switch threads while editing the title
    onSelect(thread.id);
  };
  const handleRequestDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRequestDelete(thread.id);
  };
  const handleConfirmDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onConfirmDelete(thread.id);
  };
  const handleCancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCancelDelete();
  };
  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditValue(thread.title || '');
    setIsEditing(true);
  };
  const commitEdit = () => {
    const next = editValue.trim();
    if (next && next !== (thread.title || '')) {
      onRename(thread.id, next);
    }
    setIsEditing(false);
  };
  const cancelEdit = () => {
    setEditValue(thread.title || '');
    setIsEditing(false);
  };

  return (
    <button
      type="button"
      onClick={handleSelect}
      className={`group/thread relative w-full text-left mx-2 mb-0.5 px-3 py-2 rounded-lg text-sm ${
        isActive
          ? 'bg-indigo-50 text-indigo-700'
          : 'active:bg-slate-100 text-slate-700'
      }`}
    >
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
            else if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
          }}
          onBlur={commitEdit}
          maxLength={200}
          className="block w-full px-1.5 py-0.5 text-xs font-medium bg-white border border-indigo-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-400"
          aria-label="Edit thread title"
          data-testid={`thread-title-input-${thread.id}`}
        />
      ) : (
        <div className="truncate font-medium text-xs pr-12">
          {thread.title || 'New Chat'}
        </div>
      )}
      <div className="flex items-center gap-1.5 mt-0.5">
        {thread.bookId && (
          <span className="text-[10px] text-slate-400">
            {thread.bookId} {thread.chapter}
          </span>
        )}
        <span className="text-[10px] text-slate-300">
          {thread.messages.length} msg{thread.messages.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Delete button */}
      {confirmDelete ? (
        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-1">
          <button
            type="button"
            onClick={handleConfirmDelete}
            className="px-2 py-0.5 text-[10px] bg-red-500 text-white rounded hover:bg-red-600"
          >
            Delete
          </button>
          <button
            type="button"
            onClick={handleCancelDelete}
            className="px-2 py-0.5 text-[10px] bg-slate-200 text-slate-600 rounded hover:bg-slate-300"
          >
            Cancel
          </button>
        </div>
      ) : (
        !isEditing && (
          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 sm:opacity-0 sm:group-hover/thread:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={handleStartEdit}
              className="p-1 rounded hover:bg-indigo-50 text-slate-400 hover:text-indigo-600"
              title="Rename"
              aria-label="Rename thread"
              data-testid={`thread-rename-${thread.id}`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={handleRequestDelete}
              className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500"
              title="Delete"
              aria-label="Delete thread"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        )
      )}
    </button>
  );
});
ThreadItem.displayName = 'ThreadItem';

const ChatThreadList: React.FC<ChatThreadListProps> = ({
  activeThreadId,
  onSelectThread,
  onNewThread,
  bookId,
  chapter,
}) => {
  const [threads, setThreads] = useState<ChatHistoryRecord[]>([]);
  const [search, setSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>(() => {
    try {
      const saved = localStorage.getItem(SORT_STORAGE_KEY);
      if (saved === 'modified' || saved === 'created' || saved === 'title' || saved === 'messages') return saved;
    } catch {}
    return 'modified';
  });

  const handleSortChange = useCallback((mode: SortMode) => {
    setSortMode(mode);
    try { localStorage.setItem(SORT_STORAGE_KEY, mode); } catch {}
  }, []);

  const load = useCallback(async () => {
    const all = await getAllThreads();
    setThreads(all);
  }, []);

  useEffect(() => {
    load();
    const handler = () => load();
    window.addEventListener('chathistory-updated', handler);
    return () => window.removeEventListener('chathistory-updated', handler);
  }, [load]);

  const handleNew = async () => {
    const thread = await createThread({ bookId, chapter });
    await load();
    onNewThread(thread);
  };

  const handleDelete = useCallback(async (id: string) => {
    await deleteThread(id);
    setConfirmDelete(null);
    await load();
  }, [load]);

  const handleRequestDelete = useCallback((id: string) => {
    setConfirmDelete(id);
  }, []);

  const handleCancelDelete = useCallback(() => {
    setConfirmDelete(null);
  }, []);

  const handleRename = useCallback(async (id: string, newTitle: string) => {
    // Optimistic update so the UI reflects the rename immediately.
    setThreads(prev => prev.map(t => t.id === id ? { ...t, title: newTitle } : t));
    try {
      await updateThread(id, { title: newTitle });
    } catch (err) {
      console.error('[ChatThreadList] Rename failed:', err);
      // Reload to recover from the optimistic update on failure.
      await load();
    }
  }, [load]);

  const filtered = search.trim()
    ? threads.filter(t => t.title.toLowerCase().includes(search.toLowerCase()))
    : threads;

  const sorted = sortThreads(filtered, sortMode);
  const groups = groupByDate(sorted, sortMode);

  return (
    <div className="flex flex-col h-full">
      {/* New Chat button */}
      <div className="p-3 border-b border-slate-200">
        <button
          onClick={handleNew}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Chat
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-slate-100">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search chats..."
          className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400"
        />
      </div>

      {/* Sort control */}
      <div className="px-3 py-1.5 border-b border-slate-100 flex items-center gap-2">
        <label htmlFor="thread-sort" className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
          Sort
        </label>
        <select
          id="thread-sort"
          value={sortMode}
          onChange={(e) => handleSortChange(e.target.value as SortMode)}
          className="flex-1 px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-400"
          data-testid="thread-sort-select"
        >
          {SORT_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Thread list */}
      <div className="flex-1 overflow-y-auto">
        {groups.length === 0 && (
          <div className="p-4 text-center text-xs text-slate-400">
            No conversations yet
          </div>
        )}
        {groups.map((group) => (
          <div key={group.label}>
            <div className="px-3 pt-3 pb-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              {group.label}
            </div>
            {group.threads.map((t) => (
              <ThreadItem
                key={t.id}
                thread={t}
                isActive={t.id === activeThreadId}
                confirmDelete={confirmDelete === t.id}
                onSelect={onSelectThread}
                onRequestDelete={handleRequestDelete}
                onConfirmDelete={handleDelete}
                onCancelDelete={handleCancelDelete}
                onRename={handleRename}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ChatThreadList;
