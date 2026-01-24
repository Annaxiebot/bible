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
  references?: Array<{
    title: string;
    uri: string;
  }>;
}

export interface Book {
  name: string;
  id: string;
  chapters: number;
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

export interface NoteData {
  text: string; 
  drawing: string;
  version?: number;
  timestamp?: string;
  lastModified?: string;
}