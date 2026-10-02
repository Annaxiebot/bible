/**
 * NewStudyForm.test.tsx — the passage dropdowns are driven by real data:
 * chapter options = the book's chapter count (bibleBookData) and reset on a
 * book change; verse options = the bundled chapter's verse count (data
 * source mocked) with To defaulting to the last verse; From > To clamps;
 * the verse selects are disabled with the bilingual loading line until the
 * chapter arrives; validateRequest stays the single source of range rules.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { getBookById } from '../../../services/bibleBookData';
import { TV_LOADING } from '../../studypack/tvHints';
import { NS_ERR_RANGE, NS_ERR_CHAPTER } from '../newStudyStrings';
import NewStudyForm, { validateRequest, DEFAULT_REQUEST } from '../NewStudyForm';
import { MAX_VERSES_IN_A_CHAPTER } from '../useVerseCount';

/** Verse counts the mocked bundled data reports; anything else is 30. */
const VERSE_COUNTS: Record<string, number> = { 'MAT/6': 34, 'JHN/1': 51, 'JHN/3': 36 };
const fetchMock = vi.fn();
vi.mock('../../../services/bibleDataSource', () => ({
  fetchBundledChapter: (...args: unknown[]) => fetchMock(...args),
}));

/** Mirrors the real seam: a ChapterStorageData-shaped object with `verses`. */
function bundledChapter(bookId: string, chapter: number) {
  const n = VERSE_COUNTS[`${bookId}/${chapter}`] ?? 30;
  return { verses: Array.from({ length: n }, (_, i) => ({ verse: i + 1, text: `v${i + 1}` })) };
}

const options = (testId: string) => Array.from(screen.getByTestId(testId).querySelectorAll('option'));
const values = (testId: string) => options(testId).map(o => o.value);
const select = (testId: string, value: string) => fireEvent.change(screen.getByTestId(testId), { target: { value } });
const versesReady = () => waitFor(() => expect(screen.getByTestId('ns-verse-to')).toBeEnabled());

describe('NewStudyForm dropdowns', () => {
  beforeEach(() => {
    fetchMock.mockReset().mockImplementation(async (bookId: string, chapter: number) => bundledChapter(bookId, chapter));
  });

  it('lists 1..N chapters for the book and resets to chapter 1 on a book change', async () => {
    render(<NewStudyForm busy={false} onGenerate={() => {}} />);
    expect(values('ns-chapter')).toHaveLength(getBookById('MAT')!.chapters);
    expect(screen.getByTestId('ns-chapter')).toHaveValue('6');
    select('ns-book', 'PSA');
    expect(values('ns-chapter')).toHaveLength(150);
    expect(values('ns-chapter')[149]).toBe('150');
    expect(screen.getByTestId('ns-chapter')).toHaveValue('1');
    await versesReady();
  });

  it('keeps the default MAT 6:25–34 on mount and loads 34 verse options from the bundled chapter', async () => {
    render(<NewStudyForm busy={false} onGenerate={() => {}} />);
    await versesReady();
    expect(fetchMock).toHaveBeenCalledWith('MAT', 6, 'cuv');
    expect(values('ns-verse-from')).toHaveLength(34);
    expect(screen.getByTestId('ns-verse-from')).toHaveValue(String(DEFAULT_REQUEST.verseFrom));
    expect(screen.getByTestId('ns-verse-to')).toHaveValue(String(DEFAULT_REQUEST.verseTo));
  });

  it('on a chapter change, verse options match that chapter and To defaults to its last verse', async () => {
    render(<NewStudyForm busy={false} onGenerate={() => {}} />);
    await versesReady();
    select('ns-book', 'JHN');
    await versesReady();
    expect(values('ns-verse-to')).toHaveLength(51);
    expect(screen.getByTestId('ns-verse-to')).toHaveValue('51');
    select('ns-chapter', '3');
    await versesReady();
    expect(values('ns-verse-from')).toHaveLength(36);
    expect(values('ns-verse-to')).toHaveLength(36);
    expect(screen.getByTestId('ns-verse-from')).toHaveValue('1');
    expect(screen.getByTestId('ns-verse-to')).toHaveValue('36');
    // The chapter is cached in component state: no second fetch for JHN 3.
    expect(fetchMock.mock.calls.filter(([b, c]) => b === 'JHN' && c === 3)).toHaveLength(1);
  });

  it('clamps To ≥ From: picking From above To snaps To to From, and To below From snaps up', async () => {
    const onGenerate = vi.fn();
    render(<NewStudyForm busy={false} onGenerate={onGenerate} />);
    await versesReady();
    select('ns-verse-to', '20');
    select('ns-verse-from', '30');
    expect(screen.getByTestId('ns-verse-from')).toHaveValue('30');
    expect(screen.getByTestId('ns-verse-to')).toHaveValue('30');
    select('ns-verse-to', '10');
    expect(screen.getByTestId('ns-verse-to')).toHaveValue('30');
    fireEvent.submit(screen.getByTestId('new-study-form'));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(onGenerate).toHaveBeenCalledWith(expect.objectContaining({ bookId: 'MAT', chapter: 6, verseFrom: 30, verseTo: 30 }));
  });

  it('disables the verse selects with the bilingual loading line until the chapter arrives', async () => {
    let resolve: (v: unknown) => void = () => {};
    fetchMock.mockReset().mockImplementation(() => new Promise(r => { resolve = r; }));
    render(<NewStudyForm busy={false} onGenerate={() => {}} />);
    for (const id of ['ns-verse-from', 'ns-verse-to']) {
      expect(screen.getByTestId(id)).toBeDisabled();
      expect(screen.getByTestId(id)).toHaveTextContent(TV_LOADING);
    }
    expect(screen.getByTestId('ns-chapter')).toBeEnabled();
    resolve(bundledChapter('MAT', 6));
    await versesReady();
    expect(screen.getByTestId('ns-verse-from')).toBeEnabled();
    expect(values('ns-verse-to')).toHaveLength(34);
  });

  it('falls back to a wide verse range when the bundled chapter cannot be loaded', async () => {
    fetchMock.mockReset().mockResolvedValue(null);
    render(<NewStudyForm busy={false} onGenerate={() => {}} />);
    await versesReady();
    expect(values('ns-verse-to')).toHaveLength(MAX_VERSES_IN_A_CHAPTER);
  });
});

describe('validateRequest', () => {
  it('is the single source of range rules', () => {
    expect(validateRequest(DEFAULT_REQUEST)).toBeNull();
    expect(validateRequest({ ...DEFAULT_REQUEST, verseFrom: 30, verseTo: 20 })).toBe(NS_ERR_RANGE);
    expect(validateRequest({ ...DEFAULT_REQUEST, verseFrom: 0 })).toBe(NS_ERR_RANGE);
    expect(validateRequest({ ...DEFAULT_REQUEST, chapter: 29 })).toBe(NS_ERR_CHAPTER);
    expect(validateRequest({ ...DEFAULT_REQUEST, bookId: 'NARNIA' })).toBe(NS_ERR_CHAPTER);
  });
});
