import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SaveResearchModal from '../SaveResearchModal';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../services/verseDataStorage', () => ({
  verseDataStorage: {
    addAIResearch: vi.fn(),
  },
}));

// Mock readingHistory lazy import
vi.mock('../../services/readingHistory', () => ({
  readingHistory: {
    updateChapterStatus: vi.fn(),
  },
}));

import { verseDataStorage } from '../../services/verseDataStorage';

// ---------------------------------------------------------------------------
// Default props
// ---------------------------------------------------------------------------

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  onSuccess: vi.fn(),
  query: 'What does Genesis 1:1 mean?',
  response: 'In the beginning God created the heavens and the earth.',
  currentBookId: 'genesis',
  currentChapter: 1,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SaveResearchModal — General Notes mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verseDataStorage.addAIResearch).mockResolvedValue('new_id');
  });

  it('defaults to "Specific Verse" when a verse context is provided', () => {
    render(<SaveResearchModal {...defaultProps} />);
    // "Specific Verse" button should be active (indigo background)
    const specificBtn = screen.getByText('📖 Specific Verse');
    expect(specificBtn.className).toContain('bg-indigo-600');
  });

  it('defaults to "General Notes" when no currentBookId provided', () => {
    render(<SaveResearchModal {...defaultProps} currentBookId={undefined} currentChapter={undefined} />);
    const generalBtn = screen.getByText('📝 General Notes');
    expect(generalBtn.className).toContain('bg-indigo-600');
  });

  it('defaults to "General Notes" when currentBookId is GENERAL', () => {
    render(<SaveResearchModal {...defaultProps} currentBookId="GENERAL" currentChapter={0} />);
    const generalBtn = screen.getByText('📝 General Notes');
    expect(generalBtn.className).toContain('bg-indigo-600');
  });

  it('shows "General Notes" description text when in general mode', () => {
    render(<SaveResearchModal {...defaultProps} currentBookId={undefined} />);
    expect(screen.getByText(/Research will be saved to General Notes/i)).toBeInTheDocument();
  });

  it('saves to GENERAL:0:[0] when in General Notes mode', async () => {
    render(<SaveResearchModal {...defaultProps} currentBookId={undefined} />);

    fireEvent.click(screen.getByText('Save Research'));

    await waitFor(() => {
      expect(verseDataStorage.addAIResearch).toHaveBeenCalledWith(
        'GENERAL',
        0,
        [0],
        expect.objectContaining({
          tags: expect.arrayContaining(['general-research']),
        })
      );
    });
  });

  it('saves to specific verse when "Specific Verse" is selected', async () => {
    render(<SaveResearchModal {...defaultProps} />);

    fireEvent.click(screen.getByText('Save Research'));

    await waitFor(() => {
      expect(verseDataStorage.addAIResearch).toHaveBeenCalledWith(
        'genesis',
        1,
        expect.any(Array),
        expect.not.objectContaining({
          tags: expect.arrayContaining(['general-research']),
        })
      );
    });
  });

  it('can switch from Specific Verse to General Notes', async () => {
    render(<SaveResearchModal {...defaultProps} />);

    // Start on Specific Verse — switch to General Notes
    fireEvent.click(screen.getByText('📝 General Notes'));

    expect(screen.getByText(/Research will be saved to General Notes/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Save Research'));

    await waitFor(() => {
      expect(verseDataStorage.addAIResearch).toHaveBeenCalledWith(
        'GENERAL',
        0,
        [0],
        expect.objectContaining({
          tags: expect.arrayContaining(['general-research']),
        })
      );
    });
  });

  it('can switch from General Notes to Specific Verse', () => {
    render(<SaveResearchModal {...defaultProps} currentBookId={undefined} />);

    // Switch to Specific Verse
    fireEvent.click(screen.getByText('📖 Specific Verse'));

    // Book selector should now appear
    expect(screen.getByText('Book:')).toBeInTheDocument();
  });

  it('does not update reading history when saving to General Notes', async () => {
    const { readingHistory } = await import('../../services/readingHistory');
    render(<SaveResearchModal {...defaultProps} currentBookId={undefined} />);

    fireEvent.click(screen.getByText('Save Research'));

    await waitFor(() => {
      expect(verseDataStorage.addAIResearch).toHaveBeenCalled();
    });

    expect(readingHistory.updateChapterStatus).not.toHaveBeenCalled();
  });

  it('calls onSuccess and onClose after successful save', async () => {
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    render(<SaveResearchModal {...defaultProps} onSuccess={onSuccess} onClose={onClose} />);

    fireEvent.click(screen.getByText('Save Research'));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('previews the query in the modal', () => {
    render(<SaveResearchModal {...defaultProps} />);
    expect(screen.getByText('What does Genesis 1:1 mean?')).toBeInTheDocument();
  });

  it('shows image preview when imageData and imageMimeType are provided', () => {
    const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAABjE+ibYAAAAASUVORK5CYII=';
    render(
      <SaveResearchModal
        {...defaultProps}
        imageData={base64}
        imageMimeType="image/png"
      />
    );
    const img = screen.getByAltText('Research preview') as HTMLImageElement;
    expect(img.src).toContain('data:image/png;base64,');
  });
});
