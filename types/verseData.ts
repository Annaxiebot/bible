import type { MediaAttachment } from '../services/backup/types';
export type { MediaAttachment };

export interface PersonalNote {
  text: string;
  drawing?: string;
  media?: MediaAttachment[];
  createdAt: number;
  updatedAt: number;
}

export interface AIResearchEntry {
  id: string;
  query: string;
  response: string;
  selectedText?: string;
  timestamp: number;
  tags?: string[];
  highlighted?: string[]; // Array of highlighted text within the response
}

export interface VerseData {
  id: string; // "bookId_chapter_verse"
  bookId: string;
  chapter: number;
  verses: number[];
  
  personalNote?: PersonalNote;
  aiResearch: AIResearchEntry[];
}

export interface VerseDataDB {
  verseData: VerseData[];
}