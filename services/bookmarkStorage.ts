import { idbService } from './idbService';

// Re-export Bookmark from idbService so consumers don't need to change imports
export type { Bookmark } from './idbService';
import type { Bookmark } from './idbService';

class BookmarkStorageService {
  async addBookmark(bookmark: Omit<Bookmark, 'createdAt'>): Promise<void> {
    await idbService.put('bookmarks', {
      ...bookmark,
      createdAt: Date.now(),
    });
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('bookmark-updated'));
  }

  async removeBookmark(id: string): Promise<void> {
    await idbService.delete('bookmarks', id);
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('bookmark-updated'));
  }

  async isBookmarked(id: string): Promise<boolean> {
    const bookmark = await idbService.get('bookmarks', id);
    return !!bookmark;
  }

  async getAllBookmarks(): Promise<Bookmark[]> {
    const all = await idbService.getAllFromIndex('bookmarks', 'by-created');
    return all.reverse(); // newest first
  }

  async getBookmarkCount(): Promise<number> {
    return idbService.count('bookmarks');
  }

  async importBookmark(bookmark: Bookmark): Promise<void> {
    await idbService.put('bookmarks', bookmark);
  }

  async toggleBookmark(bookmark: Omit<Bookmark, 'createdAt'>): Promise<boolean> {
    const exists = await this.isBookmarked(bookmark.id);
    if (exists) {
      await this.removeBookmark(bookmark.id);
      return false; // removed
    } else {
      await this.addBookmark(bookmark);
      return true; // added
    }
  }
}

export const bookmarkStorage = new BookmarkStorageService();
