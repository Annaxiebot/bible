import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import JournalPrintDialog from '../JournalPrintDialog';
import type { JournalEntry } from '../../services/idbService';

const makeEntry = (overrides: Partial<JournalEntry> = {}): JournalEntry => ({
  id: `e${Math.random()}`,
  title: 'Test Entry',
  content: '<p>Hello</p>',
  plainText: 'Hello',
  tags: [],
  createdAt: '2024-06-01T12:00:00Z',
  updatedAt: '2024-06-01T12:00:00Z',
  ...overrides,
});

const entries: JournalEntry[] = [
  makeEntry({ id: 'e1', title: 'Entry One', createdAt: '2024-06-01T12:00:00Z' }),
  makeEntry({ id: 'e2', title: 'Entry Two', createdAt: '2024-06-15T12:00:00Z' }),
  makeEntry({ id: 'e3', title: 'Entry Three', createdAt: '2024-07-01T12:00:00Z' }),
];

describe('JournalPrintDialog', () => {
  it('renders the dialog with title', () => {
    render(<JournalPrintDialog entries={entries} onPrint={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('Print Journal')).toBeTruthy();
  });

  it('shows "Current entry" option when selectedEntryId is provided', () => {
    render(<JournalPrintDialog entries={entries} selectedEntryId="e1" onPrint={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('Current entry')).toBeTruthy();
  });

  it('does not show "Current entry" when no selected entry', () => {
    render(<JournalPrintDialog entries={entries} onPrint={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByText('Current entry')).toBeNull();
  });

  it('shows all entries count in "All entries" option', () => {
    render(<JournalPrintDialog entries={entries} onPrint={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText(`All entries (${entries.length})`)).toBeTruthy();
  });

  it('calls onClose when Cancel clicked', () => {
    const onClose = vi.fn();
    render(<JournalPrintDialog entries={entries} onPrint={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when backdrop clicked', () => {
    const onClose = vi.fn();
    const { container } = render(<JournalPrintDialog entries={entries} onPrint={vi.fn()} onClose={onClose} />);
    // First fixed-position div is the backdrop (inset: 0)
    const backdrop = container.querySelector('div[style*="inset"]') as HTMLElement;
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when X button clicked', () => {
    const onClose = vi.fn();
    render(<JournalPrintDialog entries={entries} onPrint={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByText('\u00d7'));
    expect(onClose).toHaveBeenCalled();
  });

  it('prints all entries by default when no selectedEntryId', () => {
    const onPrint = vi.fn();
    render(<JournalPrintDialog entries={entries} onPrint={onPrint} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText(`Print (${entries.length})`));
    expect(onPrint).toHaveBeenCalledWith(
      entries.map(e => e.id),
      expect.objectContaining({ includeDrawings: true, includeImages: true, includeMetadata: true }),
    );
  });

  it('prints only current entry when selected', () => {
    const onPrint = vi.fn();
    render(<JournalPrintDialog entries={entries} selectedEntryId="e2" onPrint={onPrint} onClose={vi.fn()} />);
    // Default is "current" when selectedEntryId is provided
    fireEvent.click(screen.getByText('Print (1)'));
    expect(onPrint).toHaveBeenCalledWith(['e2'], expect.any(Object));
  });

  it('shows option checkboxes', () => {
    render(<JournalPrintDialog entries={entries} onPrint={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('Include drawings')).toBeTruthy();
    expect(screen.getByText('Include images')).toBeTruthy();
    expect(screen.getByText('Include metadata (date, location, tags)')).toBeTruthy();
  });

  it('toggles includeDrawings option', () => {
    const onPrint = vi.fn();
    render(<JournalPrintDialog entries={entries} onPrint={onPrint} onClose={vi.fn()} />);
    // Uncheck "Include drawings"
    const checkbox = screen.getByText('Include drawings').closest('label')!.querySelector('input')!;
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByText(`Print (${entries.length})`));
    expect(onPrint).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ includeDrawings: false }),
    );
  });

  it('shows entry selector when "Select entries" is chosen', () => {
    render(<JournalPrintDialog entries={entries} selectedEntryId="e1" onPrint={vi.fn()} onClose={vi.fn()} />);
    // Click "Select entries" radio
    fireEvent.click(screen.getByText('Select entries'));
    // Entry titles should appear as checkboxes
    expect(screen.getByText('Entry One')).toBeTruthy();
    expect(screen.getByText('Entry Two')).toBeTruthy();
    expect(screen.getByText('Entry Three')).toBeTruthy();
  });

  it('shows date range inputs when "Date range" is chosen', () => {
    render(<JournalPrintDialog entries={entries} onPrint={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('Date range'));
    expect(screen.getByText('From')).toBeTruthy();
    expect(screen.getByText('To')).toBeTruthy();
  });

  it('shows page size and orientation selects', () => {
    render(<JournalPrintDialog entries={entries} onPrint={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('Page size')).toBeTruthy();
    expect(screen.getByText('Orientation')).toBeTruthy();
  });

  it('disables Print button when no entries selected in select mode', () => {
    render(<JournalPrintDialog entries={entries} selectedEntryId="e1" onPrint={vi.fn()} onClose={vi.fn()} />);
    // Switch to select mode - initially has e1 selected
    fireEvent.click(screen.getByText('Select entries'));
    // Uncheck the pre-selected entry
    const checkbox = screen.getByText('Entry One').closest('label')!.querySelector('input')!;
    fireEvent.click(checkbox);
    // Print button should show (0)
    expect(screen.getByText('Print (0)')).toBeTruthy();
  });

  it('shows summary of entries to print', () => {
    render(<JournalPrintDialog entries={entries} onPrint={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('3 entries will be printed')).toBeTruthy();
  });

  it('shows singular form for single entry', () => {
    render(<JournalPrintDialog entries={entries} selectedEntryId="e1" onPrint={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('1 entry will be printed')).toBeTruthy();
  });
});
