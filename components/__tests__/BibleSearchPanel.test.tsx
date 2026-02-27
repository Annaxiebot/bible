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

  it('renders search input', () => {
    render(<BibleSearchPanel {...defaultProps} />);

    const input = screen.getByPlaceholderText('搜索经文... Search verses...');
    expect(input).not.toBeNull();
  });

  it('calls onSearchChange when input value changes', () => {
    const onSearchChange = vi.fn();
    render(<BibleSearchPanel {...defaultProps} onSearchChange={onSearchChange} />);

    const input = screen.getByPlaceholderText('搜索经文... Search verses...');
    fireEvent.change(input, { target: { value: '神创造' } });
    expect(onSearchChange).toHaveBeenCalledWith('神创造');
  });

  it('calls onSearch when Enter key is pressed', () => {
    const onSearch = vi.fn();
    render(
      <BibleSearchPanel {...defaultProps} searchQuery="神" onSearch={onSearch} />
    );

    const input = screen.getByPlaceholderText('搜索经文... Search verses...');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSearch).toHaveBeenCalledWith('神');
  });

  it('calls onClose when Escape key is pressed', () => {
    const onClose = vi.fn();
    render(<BibleSearchPanel {...defaultProps} onClose={onClose} />);

    const input = screen.getByPlaceholderText('搜索经文... Search verses...');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<BibleSearchPanel {...defaultProps} onClose={onClose} />);

    // The close button contains an SVG with an X icon; find by its surrounding button
    // The close button is the last button in the header row
    const buttons = screen.getAllByRole('button');
    const closeButton = buttons[buttons.length - 1];
    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows "搜索中..." loading state when isSearching=true', () => {
    render(
      <BibleSearchPanel {...defaultProps} searchQuery="神" isSearching={true} />
    );

    const searchButton = screen.getByText('搜索中...');
    expect(searchButton).not.toBeNull();
  });

  it('shows "搜索 Search" label when isSearching=false', () => {
    render(<BibleSearchPanel {...defaultProps} searchQuery="神" isSearching={false} />);

    const searchButton = screen.getByText('搜索 Search');
    expect(searchButton).not.toBeNull();
  });

  it('renders search results when provided', () => {
    render(
      <BibleSearchPanel
        {...defaultProps}
        searchQuery="神创造"
        searchResults={[mockResult]}
      />
    );

    expect(screen.getByText('起初神创造天地。')).not.toBeNull();
    expect(screen.getByText('CUV')).not.toBeNull();
  });

  it('shows result count when search results are provided', () => {
    render(
      <BibleSearchPanel
        {...defaultProps}
        searchQuery="神"
        searchResults={[mockResult]}
      />
    );

    expect(screen.getByText(/找到 1 条结果/)).not.toBeNull();
  });

  it('calls onResultClick when a result is clicked', () => {
    const onResultClick = vi.fn();
    render(
      <BibleSearchPanel
        {...defaultProps}
        searchQuery="神创造"
        searchResults={[mockResult]}
        onResultClick={onResultClick}
      />
    );

    const resultButton = screen.getByText('起初神创造天地。').closest('button');
    expect(resultButton).not.toBeNull();
    fireEvent.click(resultButton!);
    expect(onResultClick).toHaveBeenCalledWith(mockResult);
  });

  it('shows no results message when query is set but results are empty and not searching', () => {
    render(
      <BibleSearchPanel
        {...defaultProps}
        searchQuery="xyz不存在"
        searchResults={[]}
        isSearching={false}
      />
    );

    expect(screen.getByText(/未找到结果/)).not.toBeNull();
  });

  it('does not show no-results message when still searching', () => {
    render(
      <BibleSearchPanel
        {...defaultProps}
        searchQuery="xyz"
        searchResults={[]}
        isSearching={true}
      />
    );

    const noResults = screen.queryByText(/未找到结果/);
    expect(noResults).toBeNull();
  });

  it('calls onSearch when search button is clicked', () => {
    const onSearch = vi.fn();
    render(
      <BibleSearchPanel {...defaultProps} searchQuery="神" onSearch={onSearch} />
    );

    const searchButton = screen.getByText('搜索 Search');
    fireEvent.click(searchButton);
    expect(onSearch).toHaveBeenCalledWith('神');
  });
});
