import { useCallback } from 'react';
import { Verse, Book, SelectionInfo } from '../types';
import { BIBLE_BOOKS } from '../constants';

interface ContextMenuState {
  position: { x: number; y: number };
  selectedText: string;
  verseInfo?: {
    bookId: string;
    bookName: string;
    chapter: number;
    verseNum: number;
    fullVerseText: string;
  };
}

interface UseBibleContextMenuParams {
  selectedBook: Book;
  selectedChapter: number;
  leftVerses: Verse[];
  rightVerses: Verse[];
  selectedVerses: number[];
  setSelectedVerses: (v: number[]) => void;
  contextMenu: ContextMenuState | null;
  setContextMenu: (v: ContextMenuState | null) => void;
  isTransitioning: boolean;
  setIsTransitioning: (v: boolean) => void;
  iosTextSelectionReady: boolean;
  setIosTextSelectionReady: (v: boolean) => void;
  isIPhone: boolean;
  isIOS: boolean;
  englishVersion: string;
  onSelectionChange?: (info: SelectionInfo) => void;
  onVersesSelectedForChat: (text: string, clearChat?: boolean) => void;
  setSelectedBook: (book: Book) => void;
  setSelectedChapter: (chapter: number) => void;
  onLayoutChange?: (splitOffset: number, bottomSplitOffset: number) => void;
}

export function useBibleContextMenu({
  selectedBook,
  selectedChapter,
  leftVerses,
  rightVerses,
  selectedVerses,
  setSelectedVerses,
  contextMenu,
  setContextMenu,
  isTransitioning,
  setIsTransitioning,
  iosTextSelectionReady,
  setIosTextSelectionReady,
  isIPhone,
  isIOS,
  englishVersion,
  onSelectionChange,
  onVersesSelectedForChat,
  setSelectedBook,
  setSelectedChapter,
  onLayoutChange,
}: UseBibleContextMenuParams) {

  const notifySelection = useCallback((verseNums: number[], manualText?: string) => {
    const id = verseNums.length > 0
      ? `${selectedBook.id}:${selectedChapter}:${verseNums[0]}`
      : `${selectedBook.id}:${selectedChapter}`;

    let fullText = "";
    if (manualText) {
      fullText = manualText;
    } else if (verseNums.length > 0) {
      fullText = verseNums.map(vNum => {
        const leftV = leftVerses.find(v => v.verse === vNum);
        const rightV = rightVerses.find(v => v.verse === vNum);
        return `[${selectedBook.name} ${selectedChapter}:${vNum}]\n和合本: ${leftV?.text || ''}\n${englishVersion.toUpperCase()}: ${rightV?.text || ''}`;
      }).join('\n\n');
    }

    if (onSelectionChange) {
      onSelectionChange({
        bookId: selectedBook.id,
        bookName: selectedBook.name,
        chapter: selectedChapter,
        verseNums,
        id,
        selectedRawText: fullText
      });
    }

    // Add "解读:" prefix for research
    const textToSend = fullText && !manualText
      ? `解读: ${fullText}`
      : fullText;

    onVersesSelectedForChat(textToSend);
  }, [selectedBook, selectedChapter, leftVerses, rightVerses, englishVersion, onSelectionChange, onVersesSelectedForChat]);

  /**
   * 3-state verse tap cycle:
   *   1. Tap unselected verse -> select it (highlight)
   *   2. Tap selected verse   -> show context menu ("Research with AI", "Add to Notes")
   *   3. Tap again (or tap elsewhere) -> close menu & deselect
   */
  const handleVerseClick = (verseNum: number, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    // Don't respond to verse clicks if there's already text selection
    const selection = window.getSelection()?.toString();
    if (selection && selection.length > 0) return;

    // Clear any text selection when clicking a verse
    window.getSelection()?.removeAllRanges();

    const isCurrentlySelected = selectedVerses.includes(verseNum);

    // If a context menu is already visible, close it and deselect (state 3 -> 1)
    if (contextMenu) {
      setContextMenu(null);
      setSelectedVerses([]);
      notifySelection([]);
      return;
    }

    if (isCurrentlySelected) {
      // State 1 -> 2: verse is selected, show context menu on second tap
      const target = e.currentTarget as HTMLElement;
      const rect = target.getBoundingClientRect();

      const leftV = leftVerses.find(v => v.verse === verseNum);
      const rightV = rightVerses.find(v => v.verse === verseNum);
      const fullVerseText = leftV?.text || rightV?.text || '';

      setContextMenu({
        position: {
          x: rect.left + rect.width / 2,
          y: rect.bottom,
        },
        selectedText: fullVerseText,
        verseInfo: {
          bookId: selectedBook.id,
          bookName: selectedBook.name,
          chapter: selectedChapter,
          verseNum,
          fullVerseText,
        },
      });
    } else {
      // State unselected -> 1: select the verse
      const newSelection = [verseNum];
      setSelectedVerses(newSelection);
      notifySelection(newSelection);
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    // Skip on iOS - use touch events instead for two-step selection
    if (isIOS) return;

    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (text && text.length > 0) {
      // Don't notify selection here - let handleTextSelection determine the correct verse
      // Only show the context menu
      handleTextSelection();
    }
  };

  // iOS-only touch handler for two-step text selection
  const handleIOSTouchEnd = (e: React.TouchEvent) => {
    if (!isIOS) return;

    const selection = window.getSelection();
    const text = selection?.toString().trim();

    if (text && text.length > 0) {
      if (!iosTextSelectionReady) {
        // First selection - just mark as ready, don't show context menu
        setIosTextSelectionReady(true);
      } else {
        // Second tap on selected text - show context menu
        handleTextSelection();
        setIosTextSelectionReady(false);
      }
    } else {
      // No text selected - reset state
      setIosTextSelectionReady(false);
    }
  };

  // Handle text selection for context menu
  const handleTextSelection = () => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim()) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const selectedText = selection.toString();

      // Find which verse element contains the selection by checking the DOM
      let verseInfo = undefined;

      // Get the container element of the selection's anchor node
      let containerElement = selection.anchorNode?.parentElement;

      // Traverse up the DOM tree to find the verse container div with data-verse attribute
      let traversalDepth = 0;
      while (containerElement && !containerElement.hasAttribute('data-verse') && traversalDepth < 10) {
        containerElement = containerElement.parentElement;
        traversalDepth++;
      }


      // If we found a verse container, extract the verse number from its data-verse attribute
      if (containerElement && containerElement.hasAttribute('data-verse')) {
        const verseNum = parseInt(containerElement.getAttribute('data-verse') || '0');

        if (verseNum > 0) {
          // Find the verse data
          const allVerses = [...leftVerses, ...rightVerses];
          const verseData = allVerses.find(v => v.verse === verseNum);

          if (verseData) {
            verseInfo = {
              bookId: selectedBook.id,
              bookName: selectedBook.name,
              chapter: selectedChapter,
              verseNum: verseData.verse,
              fullVerseText: verseData.text
            };
          } else {
          }
        }
      } else {
      }

      // Fallback: if we couldn't find it by DOM, search by text (but this may get the wrong verse)
      if (!verseInfo) {
        const allVerses = [...leftVerses, ...rightVerses];
        for (const verse of allVerses) {
          const cleanVerseText = verse.text.replace(/\s+/g, ' ').trim();
          const cleanSelectedText = selectedText.replace(/\s+/g, ' ').trim();

          if (cleanVerseText.includes(cleanSelectedText)) {
            verseInfo = {
              bookId: selectedBook.id,
              bookName: selectedBook.name,
              chapter: selectedChapter,
              verseNum: verse.verse,
              fullVerseText: verse.text
            };
            break;
          }
        }
      }

      // Clear any existing verse selection first (text selection takes priority)
      setSelectedVerses([]);

      // If we have verse info and not on iOS, highlight just that verse
      // On iOS, avoid verse selection to prevent interference with page flipping
      if (verseInfo && !isIOS) {
        setSelectedVerses([verseInfo.verseNum]);
      }

      // Show context menu with the selected text and verse info
      setContextMenu({
        position: {
          x: rect.left + window.scrollX,
          y: rect.bottom + window.scrollY
        },
        selectedText: selectedText,
        verseInfo: verseInfo
      });
    } else {
      setContextMenu(null);
    }
  };

  // Context menu actions
  const handleContextMenuAction = (action: 'research' | 'note' | 'copy') => {
    if (!contextMenu) return;

    switch (action) {
      case 'research':
        // Save the selected text and verse info before clearing
        const selectedText = contextMenu.selectedText;
        const verseInfo = contextMenu.verseInfo;

        // If we have verse info, select that verse
        if (verseInfo) {
          setSelectedVerses([verseInfo.verseNum]);
        } else {
          // Clear verse selection if we couldn't find the verse
          setSelectedVerses([]);
        }

        // Immediately clear ALL text selections to prevent any expansion
        window.getSelection()?.removeAllRanges();
        document.getSelection()?.removeAllRanges();

        // Close context menu first
        setContextMenu(null);

        // Format the selected text with context
        const formattedText = verseInfo
          ? `解读："${selectedText}" in ${verseInfo.bookName} ${verseInfo.chapter}:${verseInfo.verseNum}\n\n完整经文：${verseInfo.fullVerseText}`
          : `解读："${selectedText}"`;

        // Send to AI chat - don't clear previous chat
        onVersesSelectedForChat(formattedText, false);

        // Adjust layout: horizontal divider to 50%, research view to 100%
        if (onLayoutChange) {
          onLayoutChange(50, 100);
        }

        break;
      case 'note':
        // Use verse info from context menu
        const noteVerseInfo = contextMenu.verseInfo;
        const noteSelectedText = contextMenu.selectedText;


        // If we have verse info, use it directly
        const versesToUse = noteVerseInfo
          ? [noteVerseInfo.verseNum]
          : selectedVerses.length > 0 ? selectedVerses : [];

        if (versesToUse.length > 0 || noteVerseInfo) {
          // Set the selected verses for visual feedback
          if (noteVerseInfo) {
            setSelectedVerses([noteVerseInfo.verseNum]);
          } else if (versesToUse.length > 0) {
            setSelectedVerses(versesToUse);
          }

          const noteId = noteVerseInfo
            ? `${noteVerseInfo.bookId}:${noteVerseInfo.chapter}:${noteVerseInfo.verseNum}`
            : `${selectedBook.id}:${selectedChapter}:${versesToUse[0]}`;


          onSelectionChange?.({
            id: noteId,
            bookId: noteVerseInfo?.bookId || selectedBook.id,
            bookName: noteVerseInfo?.bookName || selectedBook.name,
            chapter: noteVerseInfo?.chapter || selectedChapter,
            verseNums: noteVerseInfo ? [noteVerseInfo.verseNum] : versesToUse,
            selectedRawText: noteSelectedText
          });

          // Clear text selection but keep verse selection
          window.getSelection()?.removeAllRanges();
          document.getSelection()?.removeAllRanges();

          // No mode switching needed anymore
        }
        break;
      case 'copy':
        navigator.clipboard.writeText(contextMenu.selectedText);
        break;
    }

    // Close context menu
    setContextMenu(null);
  };

  // Handler for selecting chapter from history
  const handleSelectFromHistory = (bookId: string, chapter: number) => {
    const book = BIBLE_BOOKS.find(b => b.id === bookId);
    if (book) {
      setSelectedBook(book);
      setSelectedChapter(chapter);
      setSelectedVerses([]);
    }
  };

  return {
    notifySelection,
    handleVerseClick,
    handleMouseUp,
    handleIOSTouchEnd,
    handleTextSelection,
    handleContextMenuAction,
    handleSelectFromHistory,
  };
}
