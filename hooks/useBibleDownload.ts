import React, { useCallback, useEffect, useRef } from 'react';
import { BIBLE_BOOKS } from '../constants';
import { bibleStorage } from '../services/bibleStorage';
import { backgroundBibleDownload } from '../services/backgroundBibleDownload';
import { buildChapterUrl } from '../services/apiConfig';

interface UseBibleDownloadParams {
  selectedBookId: string;
  selectedBookName: string;
  selectedBookTotalVerses?: number;
  selectedBookChapters?: number;
  selectedChapter: number;
  englishVersion: string;
  isDownloading: boolean;
  setIsDownloading: (v: boolean) => void;
  downloadProgress: number;
  setDownloadProgress: (v: number) => void;
  setDownloadStatus: (v: string) => void;
  setDownloadStartTime: (v: number) => void;
  setDownloadTimeRemaining: (v: string) => void;
  setIsOffline: (v: boolean) => void;
  setShowDownloadMenu: (v: boolean) => void;
  setOfflineChapters: (v: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  setAutoDownloadInProgress: (v: boolean) => void;
  autoDownloadInProgress: boolean;
  downloadStartTime: number;
  downloadStatus: string;
  downloadTimeRemaining: string;
  downloadCancelRef: React.MutableRefObject<boolean>;
  onDownloadStateChange?: (isDownloading: boolean, progress: number, status?: string, timeRemaining?: string) => void;
  onDownloadFunctionsReady?: (downloadBible: () => void, downloadChapter: () => void, downloadBook: () => void) => void;
}

export function useBibleDownload({
  selectedBookId,
  selectedBookName,
  selectedBookTotalVerses,
  selectedBookChapters,
  selectedChapter,
  englishVersion,
  isDownloading,
  setIsDownloading,
  downloadProgress,
  setDownloadProgress,
  setDownloadStatus,
  setDownloadStartTime,
  setDownloadTimeRemaining,
  setIsOffline,
  setShowDownloadMenu,
  setOfflineChapters,
  setAutoDownloadInProgress,
  autoDownloadInProgress,
  downloadStartTime,
  downloadStatus,
  downloadTimeRemaining,
  downloadCancelRef,
  onDownloadStateChange,
  onDownloadFunctionsReady,
}: UseBibleDownloadParams) {

  // Calculate estimated time remaining for download
  const calculateTimeRemaining = (progress: number, startTime: number): string => {
    if (progress === 0 || progress === 100) return '';

    const elapsed = Date.now() - startTime;
    const estimatedTotal = (elapsed / progress) * 100;
    const remaining = estimatedTotal - elapsed;

    if (remaining < 1000) return '即将完成';

    const seconds = Math.floor(remaining / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `约 ${hours} 小时 ${minutes % 60} 分钟`;
    } else if (minutes > 0) {
      return `约 ${minutes} 分钟 ${seconds % 60} 秒`;
    } else {
      return `约 ${seconds} 秒`;
    }
  };

  const checkOfflineStatus = async () => {
    try {
      const offline = await bibleStorage.getAllOfflineChapters();
      setOfflineChapters(offline);
    } catch (error) {
      console.error('Error checking offline status:', error);
    }
  };

  const handleDownloadCurrentChapter = useCallback(async () => {
    setIsDownloading(true);
    setDownloadProgress(0);
    setDownloadStartTime(Date.now());
    setDownloadTimeRemaining('');
    setDownloadStatus(`正在下载: ${selectedBookName} 第 ${selectedChapter} 章`);

    try {
      // Download current chapter with retry logic
      let cuvSuccess = false;
      for (let retry = 0; retry < 3 && !cuvSuccess; retry++) {
        try {
          const cuvRes = await fetch(buildChapterUrl(selectedBookId, selectedChapter, 'cuv', selectedBookTotalVerses));
          if (cuvRes.ok) {
            const cuvData = await cuvRes.json();
            if (cuvData?.verses) {
              await bibleStorage.saveChapter(selectedBookId, selectedChapter, 'cuv', cuvData);
              cuvSuccess = true;
            }
          }
        } catch (e) {
          if (retry === 2) throw e;
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      setDownloadProgress(50);

      let webSuccess = false;
      for (let retry = 0; retry < 3 && !webSuccess; retry++) {
        try {
          const webRes = await fetch(buildChapterUrl(selectedBookId, selectedChapter, englishVersion, selectedBookTotalVerses));
          if (webRes.ok) {
            const webData = await webRes.json();
            if (webData?.verses) {
              await bibleStorage.saveChapter(selectedBookId, selectedChapter, englishVersion as any, webData);
              webSuccess = true;
            }
          }
        } catch (e) {
          if (retry === 2) throw e;
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      setDownloadProgress(100);

      await checkOfflineStatus();
      alert(`${selectedBookName} 第 ${selectedChapter} 章已下载！`);
    } catch (err) {
      console.error('Download error:', err);
      alert('下载失败，请检查网络连接后重试。');
    } finally {
      setIsDownloading(false);
      setDownloadProgress(0);
      setDownloadStatus('');
      setDownloadTimeRemaining('');
      setShowDownloadMenu(false);
    }
  }, [selectedBookId, selectedBookName, selectedBookTotalVerses, selectedChapter, englishVersion]);

  const handleDownloadCurrentBook = useCallback(async () => {
    setIsDownloading(true);
    setDownloadProgress(0);
    setDownloadStartTime(Date.now());
    setDownloadTimeRemaining('');

    try {
      const totalChapters = selectedBookChapters || 1;
      let completed = 0;
      const total = totalChapters * 2; // *2 for both translations

      for (let chapter = 1; chapter <= totalChapters; chapter++) {
        // Check if download was cancelled
        if (downloadCancelRef.current) {
          alert('下载已取消');
          return;
        }

        // Update status
        setDownloadStatus(`正在下载: ${selectedBookName} 第 ${chapter} 章`);

        // Skip if already downloaded
        const hasChapter = await bibleStorage.hasChapter(selectedBookId, chapter);
        if (hasChapter) {
          completed += 2;
          setDownloadProgress(Math.round((completed / total) * 100));
          continue;
        }

        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Download CUV
        try {
          const cuvRes = await fetch(buildChapterUrl(selectedBookId, chapter, 'cuv', selectedBookTotalVerses));
          if (cuvRes.ok) {
            const cuvData = await cuvRes.json();
            if (cuvData?.verses) {
              await bibleStorage.saveChapter(selectedBookId, chapter, 'cuv', cuvData);
            }
          }
        } catch (e) {
          console.error(`Failed to download ${selectedBookId} ${chapter} CUV:`, e);
        }
        completed++;
        setDownloadProgress(Math.round((completed / total) * 100));

        // Add delay between translations
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Download WEB
        try {
          const webRes = await fetch(buildChapterUrl(selectedBookId, chapter, englishVersion, selectedBookTotalVerses));
          if (webRes.ok) {
            const webData = await webRes.json();
            if (webData?.verses) {
              await bibleStorage.saveChapter(selectedBookId, chapter, englishVersion as any, webData);
            }
          }
        } catch (e) {
          console.error(`Failed to download ${selectedBookId} ${chapter} WEB:`, e);
        }
        completed++;
        setDownloadProgress(Math.round((completed / total) * 100));
      }

      await checkOfflineStatus();
      alert(`${selectedBookName} 已下载完成！`);
    } catch (err) {
      console.error('Download error:', err);
      alert('下载失败，请检查网络连接后重试。');
    } finally {
      setIsDownloading(false);
      setDownloadProgress(0);
      setDownloadStatus('');
      setDownloadTimeRemaining('');
      setShowDownloadMenu(false);
    }
  }, [selectedBookId, selectedBookName, selectedBookTotalVerses, selectedBookChapters, englishVersion]);

  const downloadBibleInternal = async (startBookIndex = 0, startChapter = 0, startCompleted = 0, existingFailedChapters: string[] = [], saveProgress = true, isAuto = false) => {
    const books = BIBLE_BOOKS;
    let completed = startCompleted;
    const total = books.reduce((sum, book) => sum + (book.chapters || 0), 0) * 2; // *2 for both translations
    let failedChapters = [...existingFailedChapters];

    for (let bookIndex = startBookIndex; bookIndex < books.length; bookIndex++) {
      const book = books[bookIndex];
      const startChapterForBook = bookIndex === startBookIndex ? startChapter : 1;

      for (let chapter = startChapterForBook; chapter <= (book.chapters || 1); chapter++) {
        // Check if download was cancelled
        if (downloadCancelRef.current) {
          if (saveProgress) {
            await bibleStorage.saveMetadata('download_progress', {
              bookIndex,
              chapter,
              completed,
              totalChapters: total,
              failedChapters,
              timestamp: Date.now()
            });
          }
          return { cancelled: true, failedChapters };
        }

        // Skip if already downloaded
        const hasChapter = await bibleStorage.hasChapter(book.id, chapter);
        if (hasChapter) {
          completed += 2;
          setDownloadProgress(Math.round((completed / total) * 100));
          continue;
        }

        // Skip if previously failed
        if (failedChapters.includes(`${book.id} ${chapter}`)) {
          completed += 2;
          setDownloadProgress(Math.round((completed / total) * 100));
          continue;
        }

        try {
          // Update download status
          setDownloadStatus(`正在下载: ${book.name} 第 ${chapter} 章`);

          // Add longer rate limiting delay between requests (2 seconds)
          await new Promise(resolve => setTimeout(resolve, 2000));

          // Download CUV with retry logic
          let cuvSuccess = false;
          for (let retry = 0; retry < 3 && !cuvSuccess; retry++) {
            try {
              const cuvRes = await fetch(buildChapterUrl(book.id, chapter, 'cuv', book.totalVerses));
              if (cuvRes.ok) {
                const cuvData = await cuvRes.json();
                if (cuvData?.verses) {
                  await bibleStorage.saveChapter(book.id, chapter, 'cuv', cuvData);
                  cuvSuccess = true;
                }
              } else if (cuvRes.status === 429) {
                // Rate limited - wait much longer
                const waitTime = (5 + retry * 5);
                await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
              } else if (retry < 2) {
                await new Promise(resolve => setTimeout(resolve, 2000));
              }
            } catch (e) {
              if (retry === 2) {
                console.error(`Failed to download ${book.id} ${chapter} CUV after retries:`, e);
                break; // Don't throw, just skip this chapter
              }
              await new Promise(resolve => setTimeout(resolve, 3000));
            }
          }
          if (!cuvSuccess) {
            failedChapters.push(`${book.id} ${chapter} CUV`);
          }
          completed++;
          setDownloadProgress(Math.round((completed / total) * 100));

          // Add delay between translations too (2 seconds)
          await new Promise(resolve => setTimeout(resolve, 2000));

          // Download WEB with retry logic
          let webSuccess = false;
          for (let retry = 0; retry < 3 && !webSuccess; retry++) {
            try {
              const webRes = await fetch(buildChapterUrl(book.id, chapter, englishVersion, book.totalVerses));
              if (webRes.ok) {
                const webData = await webRes.json();
                if (webData?.verses) {
                  await bibleStorage.saveChapter(book.id, chapter, englishVersion as any, webData);
                  webSuccess = true;
                }
              } else if (webRes.status === 429) {
                // Rate limited - wait much longer
                const waitTime = (5 + retry * 5);
                await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
              } else if (retry < 2) {
                await new Promise(resolve => setTimeout(resolve, 2000));
              }
            } catch (e) {
              if (retry === 2) {
                console.error(`Failed to download ${book.id} ${chapter} WEB after retries:`, e);
                break; // Don't throw, just skip this chapter
              }
              await new Promise(resolve => setTimeout(resolve, 3000));
            }
          }
          if (!webSuccess) {
            failedChapters.push(`${book.id} ${chapter} WEB`);
          }
          completed++;
          setDownloadProgress(Math.round((completed / total) * 100));

        } catch (chapterErr) {
          console.error(`Failed to download ${book.id} ${chapter}:`, chapterErr);
          failedChapters.push(`${book.id} ${chapter}`);
          completed += 2; // Skip both translations
          setDownloadProgress(Math.round((completed / total) * 100));
        }

        // Save progress periodically
        if (saveProgress && completed % 10 === 0) {
          await bibleStorage.saveMetadata('download_progress', {
            bookIndex,
            chapter,
            completed,
            totalChapters: total,
            failedChapters,
            timestamp: Date.now()
          });
        }

        // Delay between chapters to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, isAuto ? 800 : 500));
      }
    }

    if (saveProgress) {
      await bibleStorage.deleteMetadata('download_progress');
    }

    return { cancelled: false, failedChapters };
  };

  const handleDownloadBible = useCallback(async () => {
    // Warn user about download time due to rate limiting
    if (!confirm('下载整本圣经需要较长时间（约30-60分钟）以避免服务器限制。是否继续？\n\nDownloading the entire Bible will take 30-60 minutes to avoid server rate limits. Continue?')) {
      return;
    }

    // Stop background download to avoid dual processes
    backgroundBibleDownload.stop();
    setIsDownloading(true);
    setDownloadProgress(0);
    setDownloadStartTime(Date.now());
    setDownloadTimeRemaining('');
    downloadCancelRef.current = false;

    try {
      const result = await downloadBibleInternal();

      if (!result.cancelled) {
        if (result.failedChapters.length > 0) {
          alert(`部分章节下载失败：${result.failedChapters.join(', ')}。其他章节已成功下载。`);
        } else {
          await bibleStorage.saveMetadata('bible_offline_downloaded', true);
          alert('圣经已成功下载供离线使用！');
        }
      }
    } catch (err) {
      console.error('Download error:', err);
      alert('下载失败，请检查网络连接后重试。');
    } finally {
      setIsDownloading(false);
      setDownloadProgress(0);
      setDownloadStatus('');
      setShowDownloadMenu(false);
      await checkOfflineStatus();
      // Restart background download to pick up any remaining chapters
      backgroundBibleDownload.start();
    }
  }, []);

  const handleAutoDownloadBible = async () => {
    if (autoDownloadInProgress) return;

    // Stop background download to avoid dual processes
    backgroundBibleDownload.stop();
    setAutoDownloadInProgress(true);
    setDownloadProgress(0);
    setDownloadStartTime(Date.now());
    setDownloadTimeRemaining('');
    downloadCancelRef.current = false;

    try {
      const result = await downloadBibleInternal(0, 0, 0, [], true, true);

      if (!result.cancelled) {
        await bibleStorage.saveMetadata('bible_offline_downloaded', true);
      }
    } catch (err) {
      console.error('Auto-download error:', err);
    } finally {
      setAutoDownloadInProgress(false);
      setDownloadProgress(0);
      setDownloadStatus('');
      setDownloadTimeRemaining('');
      await checkOfflineStatus();
      // Restart background download to pick up any remaining chapters
      backgroundBibleDownload.start();
    }
  };

  const handleResumeDownload = async () => {
    const progress = await bibleStorage.getMetadata('download_progress');
    if (!progress) return;

    // Stop background download to avoid dual processes
    backgroundBibleDownload.stop();
    try {
      const { bookIndex, chapter, completed, failedChapters } = progress;
      setIsDownloading(true);
      setDownloadProgress(Math.round((completed / progress.totalChapters) * 100));
      downloadCancelRef.current = false;

      const result = await downloadBibleInternal(bookIndex, chapter + 1, completed, failedChapters || []);

      if (!result.cancelled) {
        if (result.failedChapters.length > 0) {
          alert(`部分章节下载失败：${result.failedChapters.join(', ')}。其他章节已成功下载。`);
        } else {
          await bibleStorage.saveMetadata('bible_offline_downloaded', true);
          alert('圣经已成功下载供离线使用！');
        }
      }
    } catch (err) {
      console.error('Resume download error:', err);
      alert('恢复下载失败，请重试。');
    } finally {
      setIsDownloading(false);
      setDownloadProgress(0);
      setDownloadStatus('');
      setShowDownloadMenu(false);
      await checkOfflineStatus();
    }
  };

  // Calculate time remaining whenever progress updates
  useEffect(() => {
    if ((isDownloading || autoDownloadInProgress) && downloadStartTime > 0 && downloadProgress > 0) {
      const timeRemaining = calculateTimeRemaining(downloadProgress, downloadStartTime);
      setDownloadTimeRemaining(timeRemaining);
    }
  }, [downloadProgress, downloadStartTime, isDownloading, autoDownloadInProgress]);

  // Notify parent of download state changes (use ref to avoid infinite loop from inline callback)
  const onDownloadStateChangeRef = useRef(onDownloadStateChange);
  onDownloadStateChangeRef.current = onDownloadStateChange;
  useEffect(() => {
    onDownloadStateChangeRef.current?.(isDownloading || autoDownloadInProgress, downloadProgress, downloadStatus, downloadTimeRemaining);
  }, [isDownloading, autoDownloadInProgress, downloadProgress, downloadStatus, downloadTimeRemaining]);

  // Expose download functions to parent (use ref to avoid infinite loop from inline callback)
  const onDownloadFunctionsReadyRef = useRef(onDownloadFunctionsReady);
  onDownloadFunctionsReadyRef.current = onDownloadFunctionsReady;
  useEffect(() => {
    onDownloadFunctionsReadyRef.current?.(handleDownloadBible, handleDownloadCurrentChapter, handleDownloadCurrentBook);
  }, [handleDownloadBible, handleDownloadCurrentChapter, handleDownloadCurrentBook]);

  return {
    handleDownloadCurrentChapter,
    handleDownloadCurrentBook,
    handleDownloadBible,
    handleAutoDownloadBible,
    handleResumeDownload,
  };
}
