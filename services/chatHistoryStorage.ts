/**
 * chatHistoryStorage.ts
 *
 * Persists AI chat threads in IndexedDB. Threads can be:
 *   - Linked to a Bible chapter (bookId + chapter)
 *   - Free-form (no book/chapter association)
 *
 * ChatGPT-style: each thread has a title, creation date, and messages.
 */

import { idbService, ChatHistoryRecord, ChatHistoryMessage } from './idbService';
import { ChatMessage } from '../types';

// ---------------------------------------------------------------------------
// Helpers -- serialise / deserialise ChatMessage <-> ChatHistoryMessage
// ---------------------------------------------------------------------------

export function serialiseMessage(m: ChatMessage): ChatHistoryMessage {
  return {
    role: m.role,
    content: m.content,
    timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : String(m.timestamp),
    type: m.type,
    mediaUrl: m.mediaUrl,
    model: m.model,
    responseTime: m.responseTime,
    references: m.references,
  };
}

export function deserialiseMessage(m: ChatHistoryMessage): ChatMessage {
  return {
    role: m.role,
    content: m.content,
    timestamp: new Date(m.timestamp),
    type: m.type,
    mediaUrl: m.mediaUrl,
    model: m.model,
    responseTime: m.responseTime,
    references: m.references,
  };
}

function notifyUpdate() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('chathistory-updated'));
  }
}

/** Generate a short title from the first user message */
function deriveTitle(messages: ChatMessage[]): string {
  const first = messages.find(m => m.role === 'user');
  if (!first) return 'New Chat';
  const text = first.content.replace(/^>\s.*\n\n/s, '').trim(); // strip quoted text
  if (text.length <= 60) return text;
  return text.slice(0, 57).trimEnd() + '...';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Create a new chat thread. Returns the created record. */
export async function createThread(opts?: {
  bookId?: string;
  chapter?: number;
}): Promise<ChatHistoryRecord> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const record: ChatHistoryRecord = {
    id,
    title: 'New Chat',
    bookId: opts?.bookId,
    chapter: opts?.chapter,
    messages: [],
    createdAt: now,
    lastModified: Date.now(),
  };
  await idbService.put('chatHistory', record);
  notifyUpdate();
  return record;
}

/** Get a thread by ID. */
export async function getThread(id: string): Promise<ChatHistoryRecord | undefined> {
  return idbService.get('chatHistory', id);
}

/** Get all threads, sorted by lastModified descending (newest first). */
export async function getAllThreads(): Promise<ChatHistoryRecord[]> {
  const all = await idbService.getAll('chatHistory');
  return all.sort((a, b) => b.lastModified - a.lastModified);
}

/** Load messages for a thread. */
export async function loadThreadMessages(threadId: string): Promise<ChatMessage[]> {
  const record = await idbService.get('chatHistory', threadId);
  if (!record) return [];
  return record.messages.map(deserialiseMessage);
}

/** Save messages to a thread. Auto-updates title from first user message. */
export async function saveThreadMessages(
  threadId: string,
  messages: ChatMessage[],
): Promise<void> {
  const existing = await idbService.get('chatHistory', threadId);
  if (!existing) return;

  const title = messages.length > 0 ? deriveTitle(messages) : existing.title;
  const record: ChatHistoryRecord = {
    ...existing,
    title,
    messages: messages.map(serialiseMessage),
    lastModified: Date.now(),
  };
  await idbService.put('chatHistory', record);
  notifyUpdate();
}

/** Update thread metadata (title, bookId, chapter). */
export async function updateThread(
  threadId: string,
  updates: Partial<Pick<ChatHistoryRecord, 'title' | 'bookId' | 'chapter'>>,
): Promise<void> {
  const existing = await idbService.get('chatHistory', threadId);
  if (!existing) return;
  await idbService.put('chatHistory', {
    ...existing,
    ...updates,
    lastModified: Date.now(),
  });
  notifyUpdate();
}

/** Delete a thread. */
export async function deleteThread(threadId: string): Promise<void> {
  await idbService.delete('chatHistory', threadId);
  notifyUpdate();
}

/** Delete all threads. */
export async function clearAllThreads(): Promise<void> {
  await idbService.clear('chatHistory');
  notifyUpdate();
}

// ---------------------------------------------------------------------------
// Legacy compat — find or create a thread for a bookId:chapter pair
// ---------------------------------------------------------------------------

/** Find existing thread for a chapter, or create one. */
/** Find an existing chapter thread without creating one. Returns null if none exists. */
export async function findChapterThread(
  bookId: string,
  chapter: number,
): Promise<ChatHistoryRecord | null> {
  const all = await idbService.getAll('chatHistory');
  // Check for legacy key format first
  const legacy = all.find(t => t.id === `${bookId}:${chapter}`);
  if (legacy) {
    // Migrate: add missing fields
    if (!legacy.title) legacy.title = `${bookId} ${chapter}`;
    if (!legacy.createdAt) legacy.createdAt = new Date(legacy.lastModified).toISOString();
    await idbService.put('chatHistory', legacy);
    return legacy;
  }
  // Then check by bookId + chapter
  return all.find(t => t.bookId === bookId && t.chapter === chapter) || null;
}

/** Find or create a chapter thread. Only call when user actually sends a message. */
export async function getOrCreateChapterThread(
  bookId: string,
  chapter: number,
): Promise<ChatHistoryRecord> {
  const existing = await findChapterThread(bookId, chapter);
  if (existing) return existing;
  return createThread({ bookId, chapter });
}
