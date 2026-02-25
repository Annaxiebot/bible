/**
 * Silent Background Bible Download Service
 *
 * Downloads the entire Bible (CUV + selected English translation) in the background
 * with a 3-second delay between requests to stay well under the API rate limit.
 * Resumes across sessions using IndexedDB metadata.
 */
import { bibleStorage, BibleTranslation } from './bibleStorage';
import { BIBLE_BOOKS } from './bibleBookData';
import { BIBLE_API_BASE } from './apiConfig';

export interface BgDownloadProgress {
  cached: number;
  total: number;
  currentBook: string;
  currentChapter: number;
  isRunning: boolean;
  isComplete: boolean;
}

type ProgressCallback = (progress: BgDownloadProgress) => void;

const TOTAL_CHAPTERS = BIBLE_BOOKS.reduce((sum, b) => sum + b.chapters, 0);
const DELAY_MS = 5000; // 5 seconds between requests
const API_PAUSE_MS = 10000; // Pause 10 seconds when AI/research API calls happen
const METADATA_KEY = 'bg_download_progress';

/** Build a flat list of all chapters in order */
function buildChapterList(): Array<{ bookId: string; bookName: string; chapter: number }> {
  const list: Array<{ bookId: string; bookName: string; chapter: number }> = [];
  for (const book of BIBLE_BOOKS) {
    for (let ch = 1; ch <= book.chapters; ch++) {
      list.push({ bookId: book.id, bookName: book.name, chapter: ch });
    }
  }
  return list;
}

function getEnglishVersion(): BibleTranslation {
  return (localStorage.getItem('bibleEnglishVersion') as BibleTranslation) || 'web';
}

class BackgroundBibleDownloadService {
  private running = false;
  private paused = false;
  private listeners: ProgressCallback[] = [];
  private abortController: AbortController | null = null;
  private apiPauseUntil = 0;
  private cachedCount = 0;
  private currentBook = '';
  private currentChapter = 0;
  private failedChapters: Array<{ bookId: string; chapter: number; translation: BibleTranslation }> = [];
  private sleepResolve: (() => void) | null = null;

  /** Register a progress listener. Returns unsubscribe function. */
  onProgress(callback: ProgressCallback): () => void {
    this.listeners.push(callback);
    // Immediately notify with current state
    callback(this.getProgress());
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  getProgress(): BgDownloadProgress {
    return {
      cached: this.cachedCount,
      total: TOTAL_CHAPTERS,
      currentBook: this.currentBook,
      currentChapter: this.currentChapter,
      isRunning: this.running && !this.paused,
      isComplete: this.cachedCount >= TOTAL_CHAPTERS,
    };
  }

  private notify() {
    const progress = this.getProgress();
    for (const cb of this.listeners) {
      try { cb(progress); } catch {}
    }
  }

  /** Call this when AI/research API calls happen to pause download for 10s */
  notifyApiActivity() {
    this.apiPauseUntil = Date.now() + API_PAUSE_MS;
  }

  /** Start the background download (idempotent) */
  async start() {
    if (this.running) return;
    this.running = true;
    this.paused = false;
    this.abortController = new AbortController();

    try {
      await this.run();
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') {
        console.error('[BgDownload] Error:', e);
      }
    } finally {
      this.running = false;
      this.notify();
    }
  }

  stop() {
    this.running = false;
    this.paused = false;
    this.abortController?.abort();
    this.abortController = null;
    // Wake up any sleeping delay
    if (this.sleepResolve) {
      this.sleepResolve();
      this.sleepResolve = null;
    }
    this.notify();
  }

  pause() {
    this.paused = true;
    this.notify();
  }

  resume() {
    this.paused = false;
    // Wake up any sleeping delay so it can proceed
    if (this.sleepResolve) {
      this.sleepResolve();
      this.sleepResolve = null;
    }
    this.notify();
  }

  private async run() {
    const chapters = buildChapterList();
    const englishVersion = getEnglishVersion();

    // Count how many are already cached
    this.cachedCount = 0;
    for (const ch of chapters) {
      const hasCuv = await bibleStorage.hasChapterTranslation(ch.bookId, ch.chapter, 'cuv');
      const hasEng = await bibleStorage.hasChapterTranslation(ch.bookId, ch.chapter, englishVersion);
      if (hasCuv && hasEng) {
        this.cachedCount++;
      }
    }
    this.notify();

    if (this.cachedCount >= TOTAL_CHAPTERS) {
      return; // All done
    }

    // Load saved progress to know where to resume
    const savedProgress = await bibleStorage.getMetadata(METADATA_KEY);
    let startIndex = 0;
    if (savedProgress && savedProgress.englishVersion === englishVersion && savedProgress.lastIndex != null) {
      startIndex = savedProgress.lastIndex;
    }

    // First pass: download from startIndex forward, then wrap around
    const orderedIndices: number[] = [];
    for (let i = startIndex; i < chapters.length; i++) orderedIndices.push(i);
    for (let i = 0; i < startIndex; i++) orderedIndices.push(i);

    for (const idx of orderedIndices) {
      if (!this.running) return;

      // Wait while paused
      while (this.paused && this.running) {
        await this.sleep(500);
      }
      if (!this.running) return;

      // Wait for API pause to expire
      while (Date.now() < this.apiPauseUntil && this.running) {
        await this.sleep(500);
      }
      if (!this.running) return;

      const ch = chapters[idx];
      this.currentBook = ch.bookName;
      this.currentChapter = ch.chapter;

      const hasCuv = await bibleStorage.hasChapterTranslation(ch.bookId, ch.chapter, 'cuv');
      const hasEng = await bibleStorage.hasChapterTranslation(ch.bookId, ch.chapter, englishVersion);

      if (hasCuv && hasEng) {
        continue; // Already cached
      }

      // Download CUV if missing
      if (!hasCuv) {
        const ok = await this.fetchAndSave(ch.bookId, ch.chapter, 'cuv');
        if (!ok) {
          this.failedChapters.push({ bookId: ch.bookId, chapter: ch.chapter, translation: 'cuv' });
        }
        if (!this.running) return;
        await this.sleep(DELAY_MS);
      }

      // Download English if missing
      if (!hasEng) {
        const ok = await this.fetchAndSave(ch.bookId, ch.chapter, englishVersion);
        if (!ok) {
          this.failedChapters.push({ bookId: ch.bookId, chapter: ch.chapter, translation: englishVersion });
        }
        if (!this.running) return;
        await this.sleep(DELAY_MS);
      }

      // Recount after downloading both
      const nowHasCuv = await bibleStorage.hasChapterTranslation(ch.bookId, ch.chapter, 'cuv');
      const nowHasEng = await bibleStorage.hasChapterTranslation(ch.bookId, ch.chapter, englishVersion);
      if (nowHasCuv && nowHasEng) {
        this.cachedCount++;
      }

      // Save progress for resume
      await bibleStorage.saveMetadata(METADATA_KEY, {
        lastIndex: idx,
        englishVersion,
        timestamp: Date.now(),
      });

      this.notify();
    }

    // Retry failed chapters once
    if (this.failedChapters.length > 0 && this.running) {
      const retries = [...this.failedChapters];
      this.failedChapters = [];

      for (const item of retries) {
        if (!this.running) return;
        while (this.paused && this.running) await this.sleep(500);
        while (Date.now() < this.apiPauseUntil && this.running) await this.sleep(500);
        if (!this.running) return;

        const ok = await this.fetchAndSave(item.bookId, item.chapter, item.translation);
        if (ok) {
          // Check if the pair is now complete
          const hasCuv = await bibleStorage.hasChapterTranslation(item.bookId, item.chapter, 'cuv');
          const hasEng = await bibleStorage.hasChapterTranslation(item.bookId, item.chapter, englishVersion);
          if (hasCuv && hasEng) {
            this.cachedCount++;
            this.notify();
          }
        }
        await this.sleep(DELAY_MS);
      }
    }

    this.currentBook = '';
    this.notify();
  }

  private async fetchAndSave(bookId: string, chapter: number, translation: BibleTranslation): Promise<boolean> {
    try {
      const url = `${BIBLE_API_BASE}/${bookId}${chapter}?translation=${translation}`;
      const res = await fetch(url, { signal: this.abortController?.signal });
      if (!res.ok) {
        if (res.status === 429) {
          // Rate limited — back off then retry once
          await this.sleep(30000);
          const retry = await fetch(url, { signal: this.abortController?.signal });
          if (!retry.ok) return false;
          const retryData = await retry.json();
          if (retryData?.verses) {
            await bibleStorage.saveChapter(bookId, chapter, translation, retryData);
            return true;
          }
        }
        return false;
      }
      const data = await res.json();
      if (data?.verses) {
        await bibleStorage.saveChapter(bookId, chapter, translation, data);
        return true;
      }
      return false;
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') throw e;
      // A TypeError here often means bible-api.com returned 429 without CORS headers,
      // which the browser surfaces as a network error rather than an HTTP response.
      // Back off before continuing so we don't compound the rate limiting.
      console.warn(`[BgDownload] Failed ${bookId} ${chapter} ${translation}:`, e);
      await this.sleep(30000);
      return false;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => {
      this.sleepResolve = resolve;
      setTimeout(() => {
        this.sleepResolve = null;
        resolve();
      }, ms);
    });
  }
}

/** Singleton instance */
export const backgroundBibleDownload = new BackgroundBibleDownloadService();
