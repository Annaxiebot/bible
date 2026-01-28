// Reading history service for tracking Bible reading progress
interface ReadingPosition {
  bookId: string;
  bookName: string;
  chapter: number;
  timestamp: number;
}

interface ChapterHistory {
  bookId: string;
  bookName: string;
  chapter: number;
  lastRead: number;
  hasNotes?: boolean;
  hasAIResearch?: boolean;
}

interface ChaptersWithContent {
  withNotes: Set<number>;
  withResearch: Set<number>;
}

class ReadingHistory {
  private readonly STORAGE_KEY = 'bibleReadingHistory';
  private readonly LAST_READ_KEY = 'bibleLastRead';
  private readonly HISTORY_KEY = 'bibleChapterHistory';
  private readonly MAX_HISTORY_ITEMS = 100;

  // Get last reading position (for automatic resume)
  async getLastReadingPosition(): Promise<ReadingPosition | null> {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Failed to get reading position:', error);
      return null;
    }
  }

  // Save reading position
  async saveReadingPosition(bookId: string, chapter: number): Promise<void> {
    try {
      const position: ReadingPosition = {
        bookId,
        bookName: '', // Will be filled by other method
        chapter,
        timestamp: Date.now()
      };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(position));
    } catch (error) {
      console.error('Failed to save reading position:', error);
    }
  }

  // Get last read (synchronous version for App component)
  getLastRead(): ReadingPosition | null {
    try {
      const data = localStorage.getItem(this.LAST_READ_KEY);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Failed to get last read:', error);
      return null;
    }
  }

  // Save last read position with book name
  saveLastRead(bookId: string, bookName: string, chapter: number): void {
    try {
      const position: ReadingPosition = {
        bookId,
        bookName,
        chapter,
        timestamp: Date.now()
      };
      localStorage.setItem(this.LAST_READ_KEY, JSON.stringify(position));
      // Also save to the main storage key for compatibility
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(position));
    } catch (error) {
      console.error('Failed to save last read:', error);
    }
  }

  // Add to reading history
  addToHistory(
    bookId: string, 
    bookName: string, 
    chapter: number,
    hasNotes: boolean = false,
    hasAIResearch: boolean = false
  ): void {
    try {
      const history = this.getHistory();
      
      // Remove existing entry if present
      const filteredHistory = history.filter(
        h => !(h.bookId === bookId && h.chapter === chapter)
      );
      
      // Add new entry at the beginning
      const newEntry: ChapterHistory = {
        bookId,
        bookName,
        chapter,
        lastRead: Date.now(),
        hasNotes,
        hasAIResearch
      };
      
      filteredHistory.unshift(newEntry);
      
      // Keep only the most recent entries
      const trimmedHistory = filteredHistory.slice(0, this.MAX_HISTORY_ITEMS);
      
      localStorage.setItem(this.HISTORY_KEY, JSON.stringify(trimmedHistory));
    } catch (error) {
      console.error('Failed to add to history:', error);
    }
  }

  // Get reading history
  getHistory(): ChapterHistory[] {
    try {
      const data = localStorage.getItem(this.HISTORY_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Failed to get history:', error);
      return [];
    }
  }

  // Get recent reading (last N items)
  getRecentReading(limit: number = 10): ChapterHistory[] {
    return this.getHistory().slice(0, limit);
  }

  // Get chapters with content for a specific book
  async getChaptersWithContent(bookId: string): Promise<ChaptersWithContent> {
    try {
      const history = this.getHistory();
      const bookHistory = history.filter(h => h.bookId === bookId);
      
      const withNotes = new Set<number>();
      const withResearch = new Set<number>();
      
      bookHistory.forEach(h => {
        if (h.hasNotes) withNotes.add(h.chapter);
        if (h.hasAIResearch) withResearch.add(h.chapter);
      });
      
      return { withNotes, withResearch };
    } catch (error) {
      console.error('Failed to get chapters with content:', error);
      return { withNotes: new Set(), withResearch: new Set() };
    }
  }

  // Update chapter status
  async updateChapterStatus(
    bookId: string,
    chapter: number,
    hasNotes?: boolean,
    hasAIResearch?: boolean
  ): Promise<void> {
    try {
      const history = this.getHistory();
      const entry = history.find(h => h.bookId === bookId && h.chapter === chapter);
      
      if (entry) {
        if (hasNotes !== undefined) entry.hasNotes = hasNotes;
        if (hasAIResearch !== undefined) entry.hasAIResearch = hasAIResearch;
        localStorage.setItem(this.HISTORY_KEY, JSON.stringify(history));
      }
    } catch (error) {
      console.error('Failed to update chapter status:', error);
    }
  }

  // Clear all history
  clearHistory(): void {
    try {
      localStorage.removeItem(this.HISTORY_KEY);
      localStorage.removeItem(this.LAST_READ_KEY);
      localStorage.removeItem(this.STORAGE_KEY);
    } catch (error) {
      console.error('Failed to clear history:', error);
    }
  }

  // Get reading statistics
  getStatistics(): {
    totalChaptersRead: number;
    booksRead: Set<string>;
    lastReadDate: Date | null;
  } {
    const history = this.getHistory();
    const booksRead = new Set(history.map(h => h.bookId));
    const lastRead = this.getLastRead();
    
    return {
      totalChaptersRead: history.length,
      booksRead,
      lastReadDate: lastRead ? new Date(lastRead.timestamp) : null
    };
  }
}

export const readingHistory = new ReadingHistory();