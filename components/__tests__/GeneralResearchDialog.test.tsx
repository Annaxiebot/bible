import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import GeneralResearchDialog from '../GeneralResearchDialog';
import { GeneralResearchEntry } from '../../hooks/useGeneralResearch';

// Mock the hook
vi.mock('../../hooks/useGeneralResearch', () => ({
  useGeneralResearch: vi.fn(),
}));

import { useGeneralResearch } from '../../hooks/useGeneralResearch';

const mockEntries: GeneralResearchEntry[] = [
  {
    id: 'ai_2',
    query: 'Another question without image',
    response: 'Simple response without bilingual split.',
    timestamp: 3000000000000, // Newest
    tags: ['general-research'],
  },
  {
    id: 'ai_3',
    query: 'Very long question that should be truncated in the list view because it exceeds the character limit',
    response: 'Response for long question',
    timestamp: 2000000000000,
  },
  {
    id: 'ai_1',
    query: 'What is this image about?',
    response: 'This is a test response in Chinese.\n[SPLIT]\nThis is a test response in English.',
    timestamp: 1000000000000, // Oldest
    tags: ['general-research', 'auto-saved'],
    image: {
      id: 'img_1',
      type: 'image',
      data: 'data:image/png;base64,test',
      timestamp: '2024-01-01T00:00:00Z',
    },
  },
];

describe('GeneralResearchDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock implementation
    vi.mocked(useGeneralResearch).mockReturnValue({
      entries: [],
      loading: false,
      deleteEntry: vi.fn(),
    });
  });

  it('renders with loading state', () => {
    vi.mocked(useGeneralResearch).mockReturnValue({
      entries: [],
      loading: true,
      deleteEntry: vi.fn(),
    });

    render(<GeneralResearchDialog onClose={vi.fn()} />);
    expect(screen.getByText('加载中 Loading...')).not.toBeNull();
  });

  it('renders empty state when no entries', () => {
    vi.mocked(useGeneralResearch).mockReturnValue({
      entries: [],
      loading: false,
      deleteEntry: vi.fn(),
    });

    render(<GeneralResearchDialog onClose={vi.fn()} />);
    expect(screen.getByText('暂无通用研究')).not.toBeNull();
    expect(screen.getByText('No general research yet')).not.toBeNull();
  });

  it('renders list of entries', () => {
    vi.mocked(useGeneralResearch).mockReturnValue({
      entries: mockEntries,
      loading: false,
      deleteEntry: vi.fn(),
    });

    render(<GeneralResearchDialog onClose={vi.fn()} />);
    
    // Check that all entries are rendered in the list
    expect(screen.getAllByText('What is this image about?').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Another question without image').length).toBeGreaterThan(0);
    // Long question should be truncated
    expect(screen.getByText(/Very long question that should be truncated/)).not.toBeNull();
  });

  it('auto-selects first entry on load', async () => {
    vi.mocked(useGeneralResearch).mockReturnValue({
      entries: mockEntries,
      loading: false,
      deleteEntry: vi.fn(),
    });

    render(<GeneralResearchDialog onClose={vi.fn()} />);
    
    // The first entry (ai_2, newest) should be selected and details shown
    await waitFor(() => {
      expect(screen.getAllByText('Another question without image').length).toBeGreaterThan(0);
      expect(screen.getByText('Simple response without bilingual split.')).not.toBeNull();
    });
  });

  it('displays selected entry details', () => {
    vi.mocked(useGeneralResearch).mockReturnValue({
      entries: mockEntries,
      loading: false,
      deleteEntry: vi.fn(),
    });

    render(<GeneralResearchDialog onClose={vi.fn()} />);
    
    // Details of auto-selected first entry should be visible
    expect(screen.getByText('问题 Question:')).not.toBeNull();
    expect(screen.getByText('回复 Response:')).not.toBeNull();
    expect(screen.getByText(/时间 Timestamp:/)).not.toBeNull();
  });

  it('displays image when entry has image', () => {
    vi.mocked(useGeneralResearch).mockReturnValue({
      entries: mockEntries,
      loading: false,
      deleteEntry: vi.fn(),
    });

    const { container } = render(<GeneralResearchDialog onClose={vi.fn()} />);
    
    // Click on the entry with image (it appears in both list and details, use getAllByText)
    const entries = screen.getAllByText('What is this image about?');
    fireEvent.click(entries[0]);
    
    // Check that image is rendered
    const images = container.querySelectorAll('img');
    expect(images.length).toBeGreaterThan(0);
    const researchImage = Array.from(images).find(img => 
      img.src.includes('data:image/png;base64,test')
    );
    expect(researchImage).not.toBeNull();
  });

  it('displays bilingual response correctly', async () => {
    vi.mocked(useGeneralResearch).mockReturnValue({
      entries: mockEntries,
      loading: false,
      deleteEntry: vi.fn(),
    });

    render(<GeneralResearchDialog onClose={vi.fn()} />);
    
    // Click on entry with bilingual response
    const entries = screen.getAllByText('What is this image about?');
    fireEvent.click(entries[0]);
    
    await waitFor(() => {
      expect(screen.getByText('This is a test response in Chinese.')).not.toBeNull();
      expect(screen.getByText('This is a test response in English.')).not.toBeNull();
    });
  });

  it('switches selected entry on click', async () => {
    vi.mocked(useGeneralResearch).mockReturnValue({
      entries: mockEntries,
      loading: false,
      deleteEntry: vi.fn(),
    });

    render(<GeneralResearchDialog onClose={vi.fn()} />);
    
    // Click on different entry
    const secondEntry = screen.getByText(/Very long question/);
    fireEvent.click(secondEntry);
    
    await waitFor(() => {
      expect(screen.getByText('Response for long question')).not.toBeNull();
    });
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    vi.mocked(useGeneralResearch).mockReturnValue({
      entries: mockEntries,
      loading: false,
      deleteEntry: vi.fn(),
    });

    render(<GeneralResearchDialog onClose={onClose} />);
    
    const closeButtons = screen.getAllByRole('button');
    const closeButton = closeButtons.find(btn => {
      const svg = btn.querySelector('svg');
      return svg && svg.querySelector('path[d*="M6 18L18 6M6 6l12 12"]');
    });
    
    expect(closeButton).not.toBeNull();
    fireEvent.click(closeButton!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn();
    vi.mocked(useGeneralResearch).mockReturnValue({
      entries: mockEntries,
      loading: false,
      deleteEntry: vi.fn(),
    });

    const { container } = render(<GeneralResearchDialog onClose={onClose} />);
    
    const backdrop = container.querySelector('.fixed.inset-0');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when dialog content is clicked', () => {
    const onClose = vi.fn();
    vi.mocked(useGeneralResearch).mockReturnValue({
      entries: mockEntries,
      loading: false,
      deleteEntry: vi.fn(),
    });

    const { container } = render(<GeneralResearchDialog onClose={onClose} />);
    
    const dialogContent = container.querySelector('.bg-white.rounded-xl');
    expect(dialogContent).not.toBeNull();
    fireEvent.click(dialogContent!);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls deleteEntry and confirms before deletion', async () => {
    const deleteEntry = vi.fn();
    vi.mocked(useGeneralResearch).mockReturnValue({
      entries: mockEntries,
      loading: false,
      deleteEntry,
    });

    // Mock window.confirm
    const originalConfirm = window.confirm;
    window.confirm = vi.fn(() => true);

    render(<GeneralResearchDialog onClose={vi.fn()} />);
    
    // Find delete button
    const deleteButton = screen.getByText('🗑️ 删除 Delete');
    fireEvent.click(deleteButton);
    
    await waitFor(() => {
      expect(window.confirm).toHaveBeenCalled();
      expect(deleteEntry).toHaveBeenCalledWith('ai_2'); // First (auto-selected) entry
    });

    // Restore original confirm
    window.confirm = originalConfirm;
  });

  it('does not delete if user cancels confirmation', async () => {
    const deleteEntry = vi.fn();
    vi.mocked(useGeneralResearch).mockReturnValue({
      entries: mockEntries,
      loading: false,
      deleteEntry,
    });

    // Mock window.confirm to return false
    const originalConfirm = window.confirm;
    window.confirm = vi.fn(() => false);

    render(<GeneralResearchDialog onClose={vi.fn()} />);
    
    const deleteButton = screen.getByText('🗑️ 删除 Delete');
    fireEvent.click(deleteButton);
    
    await waitFor(() => {
      expect(window.confirm).toHaveBeenCalled();
      expect(deleteEntry).not.toHaveBeenCalled();
    });

    window.confirm = originalConfirm;
  });

  it('displays tags when entry has tags', async () => {
    vi.mocked(useGeneralResearch).mockReturnValue({
      entries: mockEntries,
      loading: false,
      deleteEntry: vi.fn(),
    });

    render(<GeneralResearchDialog onClose={vi.fn()} />);
    
    // Click on entry with tags
    const entries = screen.getAllByText('What is this image about?');
    fireEvent.click(entries[0]);
    
    await waitFor(() => {
      expect(screen.getByText(/标签 Tags:/)).not.toBeNull();
      expect(screen.getByText(/general-research, auto-saved/)).not.toBeNull();
    });
  });

  it('highlights selected entry in list', async () => {
    vi.mocked(useGeneralResearch).mockReturnValue({
      entries: mockEntries,
      loading: false,
      deleteEntry: vi.fn(),
    });

    const { container } = render(<GeneralResearchDialog onClose={vi.fn()} />);
    
    // Wait for auto-selection to happen
    await waitFor(() => {
      const entries = screen.getAllByText('Another question without image');
      // Find the one in the list (should be the first one)
      const selectedButton = entries[0].closest('button');
      expect(selectedButton).not.toBeNull();
      expect(selectedButton?.className).toContain('bg-indigo-100');
      expect(selectedButton?.className).toContain('border-indigo-400');
    });
  });

  it('formats timestamp correctly', () => {
    vi.mocked(useGeneralResearch).mockReturnValue({
      entries: mockEntries,
      loading: false,
      deleteEntry: vi.fn(),
    });

    render(<GeneralResearchDialog onClose={vi.fn()} />);
    
    // Check that timestamps are formatted in the list
    // The exact format may vary by locale, but should contain date/time components
    const timestamps = screen.getAllByText(/\d{4}[/-]\d{2}[/-]\d{2}/);
    expect(timestamps.length).toBeGreaterThan(0);
  });
});
