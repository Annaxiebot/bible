export interface Verse {
  book_id: string;
  book_name: string;
  chapter: number;
  verse: number;
  text: string;
}

export interface BibleResponse {
  reference: string;
  verses: Verse[];
  text: string;
  translation_id: string;
  translation_name: string;
  translation_note: string;
}

export type MessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  role: MessageRole;
  content: string;
  timestamp: Date;
  type?: 'text' | 'image' | 'video' | 'audio';
  mediaUrl?: string;
  isThinking?: boolean;
  thinkingContent?: string;
  model?: string; // AI model used for this message
  responseTime?: number; // Round-trip time in milliseconds
  racePool?: { provider: string; model: string; responseMs: number | null; status: string }[];
  references?: Array<{
    title: string;
    uri: string;
  }>;
}

export interface Book {
  name: string;
  id: string;
  chapters: number;
  totalVerses?: number;
}

export type AspectRatio = "1:1" | "2:3" | "3:2" | "3:4" | "4:3" | "9:16" | "16:9" | "21:9";
export type ImageSize = "1K" | "2K" | "4K";

export interface SelectionInfo {
  bookId: string;
  bookName: string;
  chapter: number;
  verseNums: number[];
  id: string; // generated unique key e.g. GEN:1:5
  selectedRawText?: string;
}

export interface MediaAttachment {
  id: string;
  type: 'image' | 'video' | 'audio' | 'file';
  data: string; // base64, blob URL, or cloud storage URL
  cloudUrl?: string; // Supabase Storage URL (when uploaded to cloud)
  cloudPath?: string; // Supabase Storage path (for deletion)
  filename?: string;
  mimeType?: string;
  timestamp: string;
  caption?: string;
}

export interface NoteData {
  text: string;
  drawing: string;
  media?: MediaAttachment[]; // Array of attached media files
  version?: number;
  timestamp?: string;
  lastModified?: string;
}

export interface JournalEntry {
  id: string;
  title: string;
  content: string; // HTML rich text content
  drawing: string; // base64 drawing data
  tags?: string[];
  bibleReference?: string; // optional link to a verse e.g. "GEN:1:1"
  createdAt: number;
  updatedAt: number;
}