import React, { createRef } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BibleSearchPanel from '../BibleSearchPanel';

vi.mock('../../hooks/useSeasonTheme', () => ({
  useSeasonTheme: () => ({
    theme: {
      accent: '#4f46e5',
      paperBg: '#fff',
      paperGradient: '',
      paperShadow: '',
      verseHighlight: '#eef2ff',
      verseBorder: '#c7d2fe',
      accentMedium: '#818cf8',
      primary: '#1e1b4b',
      heartColor: '#ef4444',
    },
  }),
}));

vi.mock('../../services/unifiedSearchService', () => ({
  unifiedSearch: vi.fn().mockResolvedValue([]),
  highlightMatches: vi.fn((text: string) => text),
}));

const mockResult = {
  bookId: 'genesis',
  bookName: '创世记',
  chapter: 1,
  verse: 1,
  text: '起初神创造天地。',
  translation: 'CUV',
};

const defaultProps = {
  searchQuery: '',
  searchResults: [],
  isSearching: false,
  onSearchChange: vi.fn(),
  onSearch: vi.fn(),
  onClose: vi.fn(),
  onResultClick: vi.fn(),
  inputRef: createRef<HTMLInputElement>(),
};

describe('BibleSearchPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders search input with default "all" scope placeholder', () => {
    render(<BibleSearchPanel {...defaultProps} />);
    const input = screen.getByPlaceholderText('搜索全部内容... Search all content...');
    expect(input).not.toBeNull();
  });

  it('renders scope tabs', () => {
    render(<BibleSearchPanel {...defaultProps} />);
    expect(screen.getByText('全部 All')).not.toBeNull();
    expect(screen.getByText('经文 Bible')).not.toBeNull();
    expect(screen.getByText('AI研究 Research')).not.toBeNull();
    expect(screen.getByText('笔记 Notes')).not.toBeNull();
  });

  it('switches to Bible scope and shows Bible placeholder', () => {
    render(<BibleSearchPanel {...defaultProps} />);
    fireEvent.click(screen.getByText('经文 Bible'));
    const input = screen.getByPlaceholderText('搜索经文... Search verses...');
    expect(input).not.toBeNull();
  });

  it('calls onSearchChange when input value changes', () => {
    const onSearchChange = vi.fn();
    render(<BibleSearchPanel {...defaultProps} onSearchChange={onSearchChange} />);
    const input = screen.getByPlaceholderText('搜索全部内容... Search all content...');
    fireEvent.change(input, { target: { value: '神创造' } });
    expect(onSearchChange).toHaveBeenCalledWith('神创造');
  });

  it('calls onClose when Escape key is pressed', () => {
    const onClose = vi.fn();
    render(<BibleSearchPanel {...defaultProps} onClose={onClose} />);
    const input = screen.getByPlaceholderText('搜索全部内容... Search all content...');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<BibleSearchPanel {...defaultProps} onClose={onClose} />);
    const closeBtn = screen.getAllByRole('button').find(b => b.querySelector('svg path[d*="M6 18L18 6"]'));
    expect(closeBtn).not.toBeUndefined();
    fireEvent.click(closeBtn!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows loading state when isSearching=true', () => {
    render(<BibleSearchPanel {...defaultProps} searchQuery="神" isSearching={true} />);
    expect(screen.getByText('搜索中...')).not.toBeNull();
  });

  it('shows search button label when isSearching=false', () => {
    render(<BibleSearchPanel {...defaultProps} searchQuery="神" isSearching={false} />);
    expect(screen.getByText('搜索 Search')).not.toBeNull();
  });

  it('renders Bible search results when scope is Bible', () => {
    render(
      <BibleSearchPanel {...defaultProps} searchQuery="神创造" searchResults={[mockResult]} />
    );
    fireEvent.click(screen.getByText('经文 Bible'));
    expect(screen.getByText('起初神创造天地。')).not.toBeNull();
    expect(screen.getByText('CUV')).not.toBeNull();
  });

  it('shows result count in Bible scope', () => {
    render(
      <BibleSearchPanel {...defaultProps} searchQuery="神" searchResults={[mockResult]} />
    );
    fireEvent.click(screen.getByText('经文 Bible'));
    expect(screen.getByText(/找到 1 条结果/)).not.toBeNull();
  });

  it('calls onResultClick when a Bible result is clicked', () => {
    const onResultClick = vi.fn();
    render(
      <BibleSearchPanel {...defaultProps} searchQuery="神创造" searchResults={[mockResult]} onResultClick={onResultClick} />
    );
    fireEvent.click(screen.getByText('经文 Bible'));
    const resultButton = screen.getByText('起初神创造天地。').closest('button');
    fireEvent.click(resultButton!);
    expect(onResultClick).toHaveBeenCalledWith(mockResult);
  });

  it('shows no results message in Bible scope when empty', () => {
    render(
      <BibleSearchPanel {...defaultProps} searchQuery="xyz不存在" searchResults={[]} isSearching={false} />
    );
    fireEvent.click(screen.getByText('经文 Bible'));
    expect(screen.getByText(/未找到结果/)).not.toBeNull();
  });

  it('does not show no-results message when still searching', () => {
    render(
      <BibleSearchPanel {...defaultProps} searchQuery="xyz" searchResults={[]} isSearching={true} />
    );
    expect(screen.queryByText(/未找到结果/)).toBeNull();
  });
});
