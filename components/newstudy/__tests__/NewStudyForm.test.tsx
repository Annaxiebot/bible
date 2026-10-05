/**
 * NewStudyForm.test.tsx — the passage dropdowns are driven by real data:
 * chapter options = the book's chapter count (bibleBookData) and reset on a
 * book change; verse options = the bundled chapter's verse count (data
 * source mocked) with To defaulting to the last verse; From > To clamps;
 * the verse selects are disabled with the bilingual loading line until the
 * chapter arrives; validateRequest stays the single source of range rules.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setLeaderSettingListener } from '../../../services/leaderSettingsKeys';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { getBookById } from '../../../services/bibleBookData';
import { TV_LOADING } from '../../studypack/tvHints';
import { NS_ERR_RANGE, NS_ERR_CHAPTER } from '../newStudyStrings';
import NewStudyForm, { validateRequest, DEFAULT_REQUEST } from '../NewStudyForm';
import { STORAGE_KEYS } from '../../../constants/storageKeys';
import { MAX_VERSES_IN_A_CHAPTER } from '../useVerseCount';
import { readDefaultContentLanguage, rememberContentLanguage } from '../contentLanguageDefault';
import { NS_CONTENT_LANGUAGE_OPTIONS } from '../newStudyStrings';
import { CONTENT_LANGUAGES, DEFAULT_CONTENT_LANGUAGE } from '../../studypack/principles';

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

  it('has no Google Form field or "use for all my studies" box, and the request carries no form (removed 2026-10-05)', async () => {
    const onGenerate = vi.fn();
    render(<NewStudyForm busy={false} onGenerate={onGenerate} />);
    await versesReady();
    expect(screen.queryByTestId('ns-feedback-link')).toBeNull();
    expect(screen.queryByTestId('ns-feedback-default')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(document.body.innerHTML).not.toMatch(/Google|docs\.google\.com/);
    fireEvent.click(screen.getByTestId('ns-generate'));
    expect(Object.keys(onGenerate.mock.calls[0][0])).not.toContain('feedbackFormUrl');
  });
});

describe('内容语言 Content language', () => {
  const storage = () => window.localStorage as unknown as { getItem: ReturnType<typeof vi.fn>; setItem: ReturnType<typeof vi.fn> };

  it('defaults to Chinese with English keywords, lists the three modes Chinese-first in order, large type', async () => {
    storage().getItem.mockReset().mockReturnValue(null);
    render(<NewStudyForm busy={false} onGenerate={() => {}} />);
    await versesReady();
    const select = screen.getByTestId('ns-content-language');
    expect(DEFAULT_CONTENT_LANGUAGE).toBe('zh-keywords');
    expect(select).toHaveValue(DEFAULT_CONTENT_LANGUAGE);
    expect(values('ns-content-language')).toEqual([...CONTENT_LANGUAGES]);
    expect(options('ns-content-language').map(o => o.textContent)).toEqual(CONTENT_LANGUAGES.map(m => NS_CONTENT_LANGUAGE_OPTIONS[m]));
    expect(NS_CONTENT_LANGUAGE_OPTIONS['zh-keywords']).toMatch(/^中文为主，关键词英文 Chinese, English keywords$/);
    expect(select).toHaveStyle({ minHeight: '48px' });
  });

  it('carries the chosen mode on the request and remembers it under STORAGE_KEYS.CONTENT_LANGUAGE_DEFAULT', async () => {
    storage().getItem.mockReset().mockReturnValue(null);
    storage().setItem.mockReset();
    const onGenerate = vi.fn();
    render(<NewStudyForm busy={false} onGenerate={onGenerate} />);
    await versesReady();
    select('ns-content-language', 'en-keywords');
    fireEvent.click(screen.getByTestId('ns-generate'));
    expect(onGenerate.mock.calls[0][0]).toMatchObject({ contentLanguage: 'en-keywords' });
    expect(storage().setItem).toHaveBeenCalledWith(STORAGE_KEYS.CONTENT_LANGUAGE_DEFAULT, 'en-keywords');
  });

  it('opens on the remembered mode next time; an unknown stored value falls back to the default', async () => {
    storage().getItem.mockReset().mockImplementation((k: string) => (k === STORAGE_KEYS.CONTENT_LANGUAGE_DEFAULT ? 'bilingual' : null));
    expect(readDefaultContentLanguage()).toBe('bilingual');
    render(<NewStudyForm busy={false} onGenerate={() => {}} />);
    await versesReady();
    expect(screen.getByTestId('ns-content-language')).toHaveValue('bilingual');

    const mem = new Map<string, string>();
    const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); } };
    expect(readDefaultContentLanguage(store)).toBe(DEFAULT_CONTENT_LANGUAGE);
    rememberContentLanguage('en-keywords', store);
    expect(readDefaultContentLanguage(store)).toBe('en-keywords');
    mem.set(STORAGE_KEYS.CONTENT_LANGUAGE_DEFAULT, 'klingon');
    expect(readDefaultContentLanguage(store)).toBe(DEFAULT_CONTENT_LANGUAGE);
  });
});

describe('the remembered default tells the leader-settings sync (ADR-0005)', () => {
  const noted = vi.fn();
  beforeEach(() => { noted.mockReset(); setLeaderSettingListener(noted); });
  afterEach(() => setLeaderSettingListener(null));

  it('rememberContentLanguage notes its key', () => {
    const mem = new Map<string, string>();
    const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); } };
    rememberContentLanguage('bilingual', store);
    expect(noted.mock.calls.map(c => c[0])).toEqual([STORAGE_KEYS.CONTENT_LANGUAGE_DEFAULT]);
  });
});
