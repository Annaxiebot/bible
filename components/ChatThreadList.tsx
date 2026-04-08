/**
 * ChatThreadList.tsx
 *
 * ChatGPT-style sidebar listing all chat threads, grouped by date.
 * Supports new thread, select, delete, and search.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { ChatHistoryRecord } from '../services/idbService';
import { getAllThreads, createThread, deleteThread } from '../services/chatHistoryStorage';

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

function groupByDate(threads: ChatHistoryRecord[]): Array<{ label: string; threads: ChatHistoryRecord[] }> {
  const groups = new Map<string, ChatHistoryRecord[]>();
  for (const t of threads) {
    const label = formatRelativeDate(t.createdAt || new Date(t.lastModified).toISOString());
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(t);
  }
  return Array.from(groups.entries()).map(([label, threads]) => ({ label, threads }));
}

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

  const handleDelete = async (id: string) => {
    await deleteThread(id);
    setConfirmDelete(null);
    await load();
  };

  const filtered = search.trim()
    ? threads.filter(t => t.title.toLowerCase().includes(search.toLowerCase()))
    : threads;

  const groups = groupByDate(filtered);

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
              <div
                key={t.id}
                onClick={() => onSelectThread(t.id)}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  onSelectThread(t.id);
                }}
                className={`group relative mx-2 mb-0.5 px-3 py-2 rounded-lg cursor-pointer text-sm ${
                  t.id === activeThreadId
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'active:bg-slate-100 text-slate-700'
                }`}
              >
                <div className="truncate font-medium text-xs">
                  {t.title || 'New Chat'}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {t.bookId && (
                    <span className="text-[10px] text-slate-400">
                      {t.bookId} {t.chapter}
                    </span>
                  )}
                  <span className="text-[10px] text-slate-300">
                    {t.messages.length} msg{t.messages.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Delete button */}
                {confirmDelete === t.id ? (
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }}
                      className="px-2 py-0.5 text-[10px] bg-red-500 text-white rounded hover:bg-red-600"
                    >
                      Delete
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmDelete(null); }}
                      className="px-2 py-0.5 text-[10px] bg-slate-200 text-slate-600 rounded hover:bg-slate-300"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete(t.id); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ChatThreadList;
