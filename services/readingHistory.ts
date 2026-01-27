// Reading history service for automatic resume functionality
interface ReadingPosition {
  bookId: string;
  chapter: number;
  timestamp: number;
}

class ReadingHistory {
  private readonly STORAGE_KEY = 'bibleReadingHistory';

  async getLastReadingPosition(): Promise<ReadingPosition | null> {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Failed to get reading position:', error);
      return null;
    }
  }

  async saveReadingPosition(bookId: string, chapter: number): Promise<void> {
    try {
      const position: ReadingPosition = {
        bookId,
        chapter,
        timestamp: Date.now()
      };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(position));
    } catch (error) {
      console.error('Failed to save reading position:', error);
    }
  }
}

export const readingHistory = new ReadingHistory();