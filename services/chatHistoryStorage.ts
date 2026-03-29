/**
 * chatHistoryStorage.ts
 *
 * Persists AI chat threads per chapter context (bookId:chapter) in IndexedDB.
 * Uses the unified idbService / BibleApp database.
 */

import { idbService, ChatHistoryRecord, ChatHistoryMessage } from './idbService';
import { ChatMessage } from '../types';

// ---------------------------------------------------------------------------
// Helpers -- serialise / deserialise ChatMessage <-> ChatHistoryMessage
// ---------------------------------------------------------------------------

function serialiseMessage(m: ChatMessage): ChatHistoryMessage {
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

function deserialiseMessage(m: ChatHistoryMessage): ChatMessage {
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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Build the composite key used for chat history records. */
export function chatHistoryKey(bookId: string, chapter: number): string {
  return `${bookId}:${chapter}`;
}

/** Load persisted messages for a given chapter. Returns empty array if none. */
export async function loadChatHistory(bookId: string, chapter: number): Promise<ChatMessage[]> {
  try {
    const key = chatHistoryKey(bookId, chapter);
    const record = await idbService.get('chatHistory', key);
    if (!record) return [];
    return record.messages.map(deserialiseMessage);
  } catch {
    return [];
  }
}

/** Save the full message array for a chapter, overwriting any previous data. */
export async function saveChatHistory(
  bookId: string,
  chapter: number,
  messages: ChatMessage[],
): Promise<void> {
  if (messages.length === 0) {
    // Nothing to save -- clear instead
    await clearChatHistory(bookId, chapter);
    return;
  }

  const key = chatHistoryKey(bookId, chapter);
  const record: ChatHistoryRecord = {
    id: key,
    bookId,
    chapter,
    messages: messages.map(serialiseMessage),
    lastModified: Date.now(),
  };
  await idbService.put('chatHistory', record);
}

/** Delete persisted chat for a chapter. */
export async function clearChatHistory(bookId: string, chapter: number): Promise<void> {
  const key = chatHistoryKey(bookId, chapter);
  await idbService.delete('chatHistory', key);
}

/** Delete all persisted chat threads. */
export async function clearAllChatHistory(): Promise<void> {
  await idbService.clear('chatHistory');
}
