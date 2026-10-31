import React, { createRef } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BibleVersePanel from '../BibleVersePanel';
import { setReaderPreference } from '../../services/readerPreferences';
import { installMemoryStorage } from '../../tests/utils/memoryStorage';
import type { InlineBibleAnnotationHandle, AnnotationToolState } from '../InlineBibleAnnotation';

vi.mock('../../hooks/useSeasonTheme', () => ({
  useSeasonTheme: () => ({
    theme: {
      accent: '#4f46e5',
      paperBg: '#ffffff',
      paperGradient: 'none',
      paperShadow: 'none',
      verseHighlight: '#eef2ff',
      verseBorder: '#c7d2fe',
      accentMedium: '#818cf8',
      primary: '#1e1b4b',
      heartColor: '#ef4444',
    },
  }),
}));

vi.mock('../InlineBibleAnnotation', () => ({
  default: vi.fn(() => null),
  COLOR_PRESETS: ['#000000', '#ffffff'],
  InlineBibleAnnotationHandle: {},
}));

vi.mock('../VerseIndicators', () => ({
  default: vi.fn(() => null),
}));

vi.mock('../../services/chineseConverter', () => ({
  toSimplified: (text: string) => text,
}));

const baseVerses = [
  { book_id: 'genesis', book_name: '创世记', chapter: 1, verse: 1, text: '起初神创造天地。' },
  { book_id: 'genesis', book_name: '创世记', chapter: 1, verse: 2, text: '地是空虚混沌。' },
];

const englishVerses = [
  { book_id: 'genesis', book_name: 'Genesis', chapter: 1, verse: 1, text: 'In the beginning God created the heavens and the earth.' },
  { book_id: 'genesis', book_name: 'Genesis', chapter: 1, verse: 2, text: 'The earth was without form and void.' },
];

const defaultAnnotationToolState: AnnotationToolState = {
  tool: 'pen',
  color: '#000000',
  size: 4,
};

const makeProps = (overrides = {}) => ({
  verses: baseVerses,
  language: 'chinese' as const,
  selectedVerses: [],
  bookmarkedVerses: new Set<string>(),
  verseData: {},
  fontSize: 18,
  isSimplified: false,
  loading: false,
  scrollRef: createRef<HTMLDivElement>(),
  contentMeasureRef: createRef<HTMLDivElement>(),
  annotationRef: createRef<InlineBibleAnnotationHandle>(),
  annotationToolState: defaultAnnotationToolState,
  isAnnotationMode: false,
  panelWidth: 400,
  contentHeight: 800,
  bookId: 'genesis',
  chapter: 1,
  vSplitOffset: 50,
  englishVersion: 'web',
  onVerseClick: vi.fn(),
  onScroll: vi.fn(),
  onTouchStart: vi.fn(),
  onContextMenu: vi.fn(),
  onVerseIndicatorClick: vi.fn(),
  onToggleBookmark: vi.fn(),
  onAlignmentMismatch: vi.fn(),
  ...overrides,
});

describe('BibleVersePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders verse text for given verses array', () => {
    render(<BibleVersePanel {...makeProps()} />);

    expect(screen.getByText('起初神创造天地。')).not.toBeNull();
    expect(screen.getByText('地是空虚混沌。')).not.toBeNull();
  });

  it('renders with empty verses array without crashing', () => {
    const { container } = render(<BibleVersePanel {...makeProps({ verses: [] })} />);
    expect(container.firstChild).not.toBeNull();
  });

  it('applies Chinese font class for language="chinese"', () => {
    const { container } = render(<BibleVersePanel {...makeProps({ language: 'chinese' })} />);

    const panelDiv = container.firstChild as HTMLElement;
    expect(panelDiv.className).toContain('font-serif-sc');
  });

  it('applies English font class for language="english"', () => {
    const { container } = render(
      <BibleVersePanel
        {...makeProps({ language: 'english', verses: englishVerses, vSplitOffset: 50 })}
      />
    );

    const panelDiv = container.firstChild as HTMLElement;
    expect(panelDiv.className).toContain('font-sans');
  });

  it('calls onVerseClick when a verse is clicked', () => {
    const onVerseClick = vi.fn();
    render(<BibleVersePanel {...makeProps({ onVerseClick })} />);

    const verseDiv = screen.getByText('起初神创造天地。').closest('[data-verse]');
    expect(verseDiv).not.toBeNull();
    fireEvent.click(verseDiv!);
    expect(onVerseClick).toHaveBeenCalledWith(1, expect.anything());
  });

  it('does not call onVerseClick when annotation mode is active', () => {
    const onVerseClick = vi.fn();
    render(<BibleVersePanel {...makeProps({ onVerseClick, isAnnotationMode: true, vSplitOffset: 50 })} />);

    // In annotation mode, pointer events are set to 'none' on verse divs,
    // so clicks are blocked at the DOM level. The onClick handler checks isAnnotationMode too.
    const verseDiv = screen.getByText('起初神创造天地。').closest('[data-verse]');
    expect(verseDiv).not.toBeNull();
    fireEvent.click(verseDiv!);
    expect(onVerseClick).not.toHaveBeenCalled();
  });

  it('renders verse numbers', () => {
    render(<BibleVersePanel {...makeProps()} />);

    const verseNums = screen.getAllByText('1');
    expect(verseNums.length).toBeGreaterThan(0);
  });

  it('shows loading skeleton when loading=true', () => {
    const { container } = render(<BibleVersePanel {...makeProps({ loading: true })} />);

    const skeleton = container.querySelector('.animate-pulse');
    expect(skeleton).not.toBeNull();
  });

  it('shows Chinese label for chinese language', () => {
    render(<BibleVersePanel {...makeProps({ language: 'chinese' })} />);

    expect(screen.getByText('和合本 CUV')).not.toBeNull();
  });

  it('shows English label for english language', () => {
    render(
      <BibleVersePanel
        {...makeProps({ language: 'english', verses: englishVerses, vSplitOffset: 50 })}
      />
    );

    expect(screen.getByText('English (WEB)')).not.toBeNull();
  });

  it('calls onToggleBookmark when bookmark button is clicked', () => {
    const onToggleBookmark = vi.fn();
    render(<BibleVersePanel {...makeProps({ onToggleBookmark })} />);

    const bookmarkButtons = screen.getAllByTitle('收藏 Bookmark');
    fireEvent.click(bookmarkButtons[0]);
    expect(onToggleBookmark).toHaveBeenCalledWith(1, '起初神创造天地。');
  });

  it('marks verse text with the language of its column (zh-Hans / zh-Hant / en)', () => {
    const { unmount } = render(<BibleVersePanel {...makeProps({ isSimplified: true })} />);
    expect(screen.getByText('起初神创造天地。')).toHaveAttribute('lang', 'zh-Hans');
    unmount();
    render(<BibleVersePanel {...makeProps({ isSimplified: false })} />);
    expect(screen.getByText('起初神创造天地。')).toHaveAttribute('lang', 'zh-Hant');
    render(<BibleVersePanel {...makeProps({ language: 'english', verses: englishVerses })} />);
    expect(screen.getByText(englishVerses[0].text)).toHaveAttribute('lang', 'en');
  });

  it('renders verses as given — script conversion is the parent\'s job (useChineseScript)', () => {
    render(<BibleVersePanel {...makeProps({ isSimplified: false, verses: [{ ...baseVerses[0], text: '起初神創造天地。' }] })} />);
    expect(screen.getByText('起初神創造天地。')).not.toBeNull();
  });

  it('a failed column shows its own localized error with a retry, not verses or a skeleton', () => {
    const onRetry = vi.fn();
    render(<BibleVersePanel {...makeProps({ verses: [], status: 'error', bookName: '马太福音', chapter: 7, onRetry })} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('无法加载中文经文：马太福音 第 7 章');
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('a loading column shows the skeleton and is aria-busy', () => {
    const { container } = render(<BibleVersePanel {...makeProps({ verses: [], status: 'loading' })} />);
    expect(container.querySelector('.animate-pulse')).not.toBeNull();
    expect(container.firstChild).toHaveAttribute('aria-busy', 'true');
  });

  it('marks a column served from the offline copy', () => {
    render(<BibleVersePanel {...makeProps({ offline: true })} />);
    expect(screen.getByText(/离线副本/)).not.toBeNull();
  });
});

describe('BibleVersePanel — English interface', () => {
  beforeEach(() => {
    installMemoryStorage();
    setReaderPreference('uiLanguage', 'en');
  });

  it('error and retry are in English for the English column', () => {
    render(<BibleVersePanel {...makeProps({ language: 'english', verses: [], status: 'error', bookName: 'Matthew', chapter: 7, onRetry: vi.fn() })} />);
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load the English text of Matthew 7. Check your connection.");
    expect(screen.getByRole('button', { name: 'Retry' })).not.toBeNull();
  });

  it('bookmark controls are in English', () => {
    render(<BibleVersePanel {...makeProps()} />);
    expect(screen.getAllByRole('button', { name: 'Bookmark' }).length).toBe(2);
  });
});
