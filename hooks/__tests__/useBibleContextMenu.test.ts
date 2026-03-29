import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBibleContextMenu } from '../useBibleContextMenu';
import type { Book, Verse } from '../../types';

vi.mock('../../constants', () => ({
  BIBLE_BOOKS: [
    { id: 'genesis', name: '创世记', chapters: 50 },
    { id: 'exodus', name: '出埃及记', chapters: 40 },
  ],
}));

const mockBook: Book = { id: 'genesis', name: '创世记', chapters: 50 };

const mockLeftVerses: Verse[] = [
  { book_id: 'genesis', book_name: '创世记', chapter: 1, verse: 1, text: '起初神创造天地。' },
  { book_id: 'genesis', book_name: '创世记', chapter: 1, verse: 2, text: '地是空虚混沌。' },
];

const mockRightVerses: Verse[] = [
  { book_id: 'genesis', book_name: 'Genesis', chapter: 1, verse: 1, text: 'In the beginning God created the heavens and the earth.' },
  { book_id: 'genesis', book_name: 'Genesis', chapter: 1, verse: 2, text: 'The earth was without form and void.' },
];

const makeParams = (overrides = {}) => ({
  selectedBook: mockBook,
  selectedChapter: 1,
  leftVerses: mockLeftVerses,
  rightVerses: mockRightVerses,
  selectedVerses: [],
  setSelectedVerses: vi.fn(),
  contextMenu: null,
  setContextMenu: vi.fn(),
  isTransitioning: false,
  setIsTransitioning: vi.fn(),
  iosTextSelectionReady: false,
  setIosTextSelectionReady: vi.fn(),
  isIPhone: false,
  isIOS: false,
  englishVersion: 'web',
  onSelectionChange: vi.fn(),
  onVersesSelectedForChat: vi.fn(),
  setSelectedBook: vi.fn(),
  setSelectedChapter: vi.fn(),
  onLayoutChange: vi.fn(),
  ...overrides,
});

describe('useBibleContextMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset window.getSelection mock
    Object.defineProperty(window, 'getSelection', {
      writable: true,
      value: vi.fn(() => ({ toString: () => '', removeAllRanges: vi.fn() })),
    });
  });

  it('initializes without errors (smoke test)', () => {
    const { result } = renderHook(() => useBibleContextMenu(makeParams()));
    expect(result.current).toBeDefined();
  });

  it('returns all expected handler functions', () => {
    const { result } = renderHook(() => useBibleContextMenu(makeParams()));

    expect(typeof result.current.notifySelection).toBe('function');
    expect(typeof result.current.handleVerseClick).toBe('function');
    expect(typeof result.current.handleMouseUp).toBe('function');
    expect(typeof result.current.handleIOSTouchEnd).toBe('function');
    expect(typeof result.current.handleTextSelection).toBe('function');
    expect(typeof result.current.handleContextMenuAction).toBe('function');
    expect(typeof result.current.handleSelectFromHistory).toBe('function');
  });

  it('handleVerseClick toggles verse selection', () => {
    const setSelectedVerses = vi.fn();
    const onVersesSelectedForChat = vi.fn();
    const { result } = renderHook(() =>
      useBibleContextMenu(makeParams({ setSelectedVerses, onVersesSelectedForChat }))
    );

    const mockEvent = {
      stopPropagation: vi.fn(),
      preventDefault: vi.fn(),
    } as unknown as React.MouseEvent;

    act(() => {
      result.current.handleVerseClick(1, mockEvent);
    });

    expect(setSelectedVerses).toHaveBeenCalledWith([1]);
  });

  it('handleVerseClick shows context menu on second tap (verse already selected)', () => {
    const setSelectedVerses = vi.fn();
    const setContextMenu = vi.fn();
    const { result } = renderHook(() =>
      useBibleContextMenu(makeParams({ setSelectedVerses, setContextMenu, selectedVerses: [1] }))
    );

    const mockEvent = {
      stopPropagation: vi.fn(),
      preventDefault: vi.fn(),
      currentTarget: {
        getBoundingClientRect: () => ({ left: 10, top: 20, width: 200, height: 30, bottom: 50, right: 210 }),
      },
    } as unknown as React.MouseEvent;

    act(() => {
      result.current.handleVerseClick(1, mockEvent);
    });

    // Should not deselect — instead shows context menu
    expect(setSelectedVerses).not.toHaveBeenCalled();
    expect(setContextMenu).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedText: expect.any(String),
        verseInfo: expect.objectContaining({ verseNum: 1 }),
      })
    );
  });

  it('handleVerseClick closes context menu and deselects on third tap', () => {
    const setSelectedVerses = vi.fn();
    const setContextMenu = vi.fn();
    const onVersesSelectedForChat = vi.fn();
    const contextMenu = {
      position: { x: 0, y: 0 },
      selectedText: 'some text',
      verseInfo: { bookId: 'genesis', bookName: '创世记', chapter: 1, verseNum: 1, fullVerseText: 'some text' },
    };
    const { result } = renderHook(() =>
      useBibleContextMenu(makeParams({
        setSelectedVerses,
        setContextMenu,
        contextMenu,
        selectedVerses: [1],
        onVersesSelectedForChat,
      }))
    );

    const mockEvent = {
      stopPropagation: vi.fn(),
      preventDefault: vi.fn(),
    } as unknown as React.MouseEvent;

    act(() => {
      result.current.handleVerseClick(1, mockEvent);
    });

    // Should close context menu and deselect
    expect(setContextMenu).toHaveBeenCalledWith(null);
    expect(setSelectedVerses).toHaveBeenCalledWith([]);
  });

  it('handleVerseClick does not fire if text is selected', () => {
    const setSelectedVerses = vi.fn();
    Object.defineProperty(window, 'getSelection', {
      writable: true,
      value: vi.fn(() => ({ toString: () => 'some selected text', removeAllRanges: vi.fn() })),
    });

    const { result } = renderHook(() =>
      useBibleContextMenu(makeParams({ setSelectedVerses }))
    );

    const mockEvent = {
      stopPropagation: vi.fn(),
      preventDefault: vi.fn(),
    } as unknown as React.MouseEvent;

    act(() => {
      result.current.handleVerseClick(1, mockEvent);
    });

    expect(setSelectedVerses).not.toHaveBeenCalled();
  });

  it('notifySelection calls onVersesSelectedForChat with formatted text', () => {
    const onVersesSelectedForChat = vi.fn();
    const onSelectionChange = vi.fn();
    const { result } = renderHook(() =>
      useBibleContextMenu(makeParams({ onVersesSelectedForChat, onSelectionChange }))
    );

    act(() => {
      result.current.notifySelection([1]);
    });

    expect(onVersesSelectedForChat).toHaveBeenCalledTimes(1);
    const arg = onVersesSelectedForChat.mock.calls[0][0];
    expect(arg).toContain('解读:');
    expect(arg).toContain('创世记 1:1');
  });

  it('handleSelectFromHistory navigates to the correct book and chapter', () => {
    const setSelectedBook = vi.fn();
    const setSelectedChapter = vi.fn();
    const setSelectedVerses = vi.fn();
    const { result } = renderHook(() =>
      useBibleContextMenu(makeParams({ setSelectedBook, setSelectedChapter, setSelectedVerses }))
    );

    act(() => {
      result.current.handleSelectFromHistory('genesis', 3);
    });

    expect(setSelectedBook).toHaveBeenCalledWith({ id: 'genesis', name: '创世记', chapters: 50 });
    expect(setSelectedChapter).toHaveBeenCalledWith(3);
    expect(setSelectedVerses).toHaveBeenCalledWith([]);
  });

  it('handleSelectFromHistory does nothing for unknown bookId', () => {
    const setSelectedBook = vi.fn();
    const setSelectedChapter = vi.fn();
    const { result } = renderHook(() =>
      useBibleContextMenu(makeParams({ setSelectedBook, setSelectedChapter }))
    );

    act(() => {
      result.current.handleSelectFromHistory('unknown-book', 1);
    });

    expect(setSelectedBook).not.toHaveBeenCalled();
    expect(setSelectedChapter).not.toHaveBeenCalled();
  });

  it('handleMouseUp does nothing on iOS', () => {
    const setContextMenu = vi.fn();
    const { result } = renderHook(() =>
      useBibleContextMenu(makeParams({ setContextMenu, isIOS: true }))
    );

    const mockEvent = {} as React.MouseEvent;

    act(() => {
      result.current.handleMouseUp(mockEvent);
    });

    expect(setContextMenu).not.toHaveBeenCalled();
  });

  it('handleContextMenuAction does nothing when contextMenu is null', () => {
    const onVersesSelectedForChat = vi.fn();
    const { result } = renderHook(() =>
      useBibleContextMenu(makeParams({ onVersesSelectedForChat, contextMenu: null }))
    );

    act(() => {
      result.current.handleContextMenuAction('research');
    });

    expect(onVersesSelectedForChat).not.toHaveBeenCalled();
  });
});
