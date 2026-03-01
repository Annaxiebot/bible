import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import NotesList from '../NotesList';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../services/verseDataStorage', () => ({
  verseDataStorage: {
    getAllData: vi.fn(),
  },
}));

vi.mock('../../services/notesStorage', () => ({
  notesStorage: {
    getAllNotes: vi.fn(),
  },
}));

vi.mock('../../hooks/useStorageUpdate', () => ({
  useStorageUpdate: () => 0,
}));

vi.mock('../../services/exportImportService', () => ({
  exportImportService: {
    exportAndDownload: vi.fn(),
    importFromJSON: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

import { verseDataStorage } from '../../services/verseDataStorage';
import { notesStorage } from '../../services/notesStorage';

const mockGeneral = {
  id: 'GENERAL:0:0',
  bookId: 'GENERAL',
  chapter: 0,
  verses: [0],
  personalNote: undefined,
  aiResearch: [
    {
      id: 'ai_gen_1',
      query: 'Sermon on the Mount notes',
      response: 'Jesus taught...',
      timestamp: Date.now(),
      tags: ['auto-saved', 'general-research'],
    },
  ],
};

const mockGenesis = {
  id: 'GEN:1:1',
  bookId: 'GEN',
  chapter: 1,
  verses: [1],
  personalNote: { text: 'In the beginning', createdAt: Date.now() - 1000, updatedAt: Date.now() - 1000 },
  aiResearch: [],
};

function setup(props = {}) {
  const onSelectNote = vi.fn();
  const onSelectGeneralNotes = vi.fn();
  const onClose = vi.fn();

  const utils = render(
    <NotesList
      onSelectNote={onSelectNote}
      onSelectGeneralNotes={onSelectGeneralNotes}
      onClose={onClose}
      {...props}
    />
  );

  return { ...utils, onSelectNote, onSelectGeneralNotes, onClose };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NotesList — General Notes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(notesStorage.getAllNotes).mockResolvedValue({});
  });

  it('renders "General Notes" entry when GENERAL bucket has AI research', async () => {
    vi.mocked(verseDataStorage.getAllData).mockResolvedValue([mockGeneral]);
    setup();

    await waitFor(() => {
      expect(screen.getByText('📝 General Notes')).toBeInTheDocument();
    });
  });

  it('calls onSelectGeneralNotes when General Notes entry is clicked', async () => {
    vi.mocked(verseDataStorage.getAllData).mockResolvedValue([mockGeneral]);
    const { onSelectGeneralNotes, onSelectNote } = setup();

    await waitFor(() => expect(screen.getByText('📝 General Notes')).toBeInTheDocument());

    fireEvent.click(screen.getByText('📝 General Notes').closest('[class*="cursor-pointer"]')!);

    expect(onSelectGeneralNotes).toHaveBeenCalledTimes(1);
    expect(onSelectNote).not.toHaveBeenCalled();
  });

  it('calls onSelectNote (not onSelectGeneralNotes) for regular Bible verse entries', async () => {
    vi.mocked(verseDataStorage.getAllData).mockResolvedValue([mockGenesis]);
    const { onSelectNote, onSelectGeneralNotes } = setup();

    await waitFor(() => expect(screen.getByText(/创世记 Genesis 1:1/)).toBeInTheDocument());

    fireEvent.click(screen.getByText(/创世记 Genesis 1:1/).closest('[class*="cursor-pointer"]')!);

    expect(onSelectNote).toHaveBeenCalledWith('GEN', 1, [1]);
    expect(onSelectGeneralNotes).not.toHaveBeenCalled();
  });

  it('places General Notes before Bible verse entries in latest-first sort', async () => {
    vi.mocked(verseDataStorage.getAllData).mockResolvedValue([mockGenesis, mockGeneral]);
    setup();

    await waitFor(() => {
      expect(screen.getByText('📝 General Notes')).toBeInTheDocument();
      expect(screen.getByText(/创世记 Genesis 1:1/)).toBeInTheDocument();
    });

    const items = screen.getAllByRole('generic').filter(el =>
      el.className.includes('cursor-pointer')
    );
    // First clickable item should be General Notes
    expect(items[0]).toHaveTextContent('📝 General Notes');
  });

  it('places General Notes before Bible verse entries in bible-order sort', async () => {
    vi.mocked(verseDataStorage.getAllData).mockResolvedValue([mockGenesis, mockGeneral]);
    setup();

    await waitFor(() => expect(screen.getByText('📝 General Notes')).toBeInTheDocument());

    // Switch to bible-order sort
    fireEvent.click(screen.getByText('圣经顺序 Bible Order'));

    const items = screen.getAllByRole('generic').filter(el =>
      el.className.includes('cursor-pointer')
    );
    expect(items[0]).toHaveTextContent('📝 General Notes');
  });

  it('renders General Notes AI research query in the list item', async () => {
    vi.mocked(verseDataStorage.getAllData).mockResolvedValue([mockGeneral]);
    setup();

    await waitFor(() => {
      expect(screen.getByText('Sermon on the Mount notes')).toBeInTheDocument();
    });
  });

  it('shows empty state when no notes exist', async () => {
    vi.mocked(verseDataStorage.getAllData).mockResolvedValue([]);
    setup();

    await waitFor(() => {
      expect(screen.getByText(/暂无笔记 No notes yet/)).toBeInTheDocument();
    });
  });

  it('does not render GENERAL bucket when it has no content', async () => {
    const emptyGeneral = {
      ...mockGeneral,
      aiResearch: [],
      personalNote: undefined,
    };
    vi.mocked(verseDataStorage.getAllData).mockResolvedValue([emptyGeneral]);
    setup();

    await waitFor(() => {
      expect(screen.queryByText('📝 General Notes')).not.toBeInTheDocument();
    });
  });

  it('shows research count badge for General Notes', async () => {
    const generalWith2 = {
      ...mockGeneral,
      aiResearch: [
        { id: 'r1', query: 'Q1', response: 'R1', timestamp: Date.now(), tags: [] },
        { id: 'r2', query: 'Q2', response: 'R2', timestamp: Date.now(), tags: [] },
      ],
    };
    vi.mocked(verseDataStorage.getAllData).mockResolvedValue([generalWith2]);
    setup();

    await waitFor(() => {
      expect(screen.getByText(/2 研究 research/)).toBeInTheDocument();
    });
  });
});

describe('NotesList — GENERAL_NOTES_ID constant export', () => {
  it('GENERAL_NOTES_ID is GENERAL:0:0', async () => {
    const { GENERAL_NOTES_ID } = await import('../../services/autoSaveResearchService');
    expect(GENERAL_NOTES_ID).toBe('GENERAL:0:0');
  });

  it('GENERAL_NOTES_BOOK_ID is GENERAL', async () => {
    const { GENERAL_NOTES_BOOK_ID } = await import('../../services/autoSaveResearchService');
    expect(GENERAL_NOTES_BOOK_ID).toBe('GENERAL');
  });

  it('GENERAL_NOTES_CHAPTER is 0', async () => {
    const { GENERAL_NOTES_CHAPTER } = await import('../../services/autoSaveResearchService');
    expect(GENERAL_NOTES_CHAPTER).toBe(0);
  });
});
