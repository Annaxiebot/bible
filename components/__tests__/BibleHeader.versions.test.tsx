import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { setReaderPreference } from '../../services/readerPreferences';
import { installMemoryStorage } from '../../tests/utils/memoryStorage';
import BibleHeader from '../BibleHeader';
import type { Book } from '../../types';

vi.mock('../../hooks/useSeasonTheme', () => ({
  useSeasonTheme: () => ({ theme: { accent: '#4f46e5' } }),
}));

const book = { id: 'JHN', name: '约翰福音 John', chapters: 21 } as unknown as Book;

const renderHeader = (isIPhone = false) => renderHeaderWith({ isIPhone });

const renderHeaderWith = ({ isIPhone = false, onToggleChineseMode = vi.fn() }: { isIPhone?: boolean; onToggleChineseMode?: () => void }) =>
  render(
    <BibleHeader
      selectedBook={book}
      selectedChapter={1}
      canNavigatePrev={false}
      canNavigateNext={true}
      onNavigateChapter={vi.fn()}
      bookSearchTerm=""
      showBookDropdown={false}
      filteredBooks={[]}
      bookSearchRef={React.createRef<HTMLDivElement>()}
      onBookSearchTermChange={vi.fn()}
      onBookDropdownOpen={vi.fn()}
      onBookSelect={vi.fn()}
      offlineChapters={new Set()}
      chaptersWithContent={{ withNotes: new Set(), withResearch: new Set() }}
      onChapterChange={vi.fn()}
      fontSize={18}
      onAdjustFontSize={vi.fn()}
      isSimplified={true}
      onToggleChineseMode={onToggleChineseMode}
      isOffline={false}
      isDownloading={false}
      autoDownloadInProgress={false}
      downloadProgress={0}
      downloadTimeRemaining=""
      downloadStatus=""
      showDownloadMenu={false}
      onStopDownload={vi.fn()}
      onToggleDownloadMenu={vi.fn()}
      onDownloadCurrentChapter={vi.fn()}
      onDownloadCurrentBook={vi.fn()}
      onDownloadBible={vi.fn()}
      isAnnotationMode={false}
      onToggleAnnotationMode={vi.fn()}
      showSearch={false}
      onToggleSearch={vi.fn()}
      onShowReadingHistory={vi.fn()}
      isIPhone={isIPhone}
      showMobileMenu={false}
      mobileMenuRef={React.createRef<HTMLDivElement>()}
      onToggleMobileMenu={vi.fn()}
      sidebarOpen={false}
      showSidebarToggle={false}
      chineseVersion="cuv"
      englishVersion="bsb"
      onChineseVersionChange={vi.fn()}
      onEnglishVersionChange={vi.fn()}
      allVersesSelected={false}
      selectedVersesCount={0}
    />,
  );

const optionValues = (title: string) =>
  Array.from((screen.getByTitle(title) as HTMLSelectElement).options).map(o => o.value);

describe('BibleHeader — edition selectors', () => {
  it.each([false, true])('offers only CUV for Chinese (isIPhone=%s)', (isIPhone) => {
    renderHeader(isIPhone);
    expect(optionValues('中文版本')).toEqual(['cuv']);
    expect(screen.queryByText(/CUNP/)).toBeNull();
  });

  it('keeps every English version choice', () => {
    renderHeader();
    expect(optionValues('English version')).toEqual(['bsb', 'web', 'kjv', 'asv', 'bbe', 'ylt']);
  });
});

describe('BibleHeader — interface language and script control', () => {
  beforeEach(() => { installMemoryStorage(); });

  it('labels the 简/繁 control by its current state, separately from the action', () => {
    renderHeader();
    const group = screen.getByRole('group', { name: '中文字体' });
    const buttons = Array.from(group.querySelectorAll('button'));
    expect(buttons.map(b => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([['简', 'true'], ['繁', 'false']]);
    expect(group).toHaveAttribute('title', '当前：简体 · 点击切换为繁體');
  });

  it('pressing the already-current script does nothing; the other one toggles', () => {
    const onToggle = vi.fn();
    renderHeaderWith({ onToggleChineseMode: onToggle });
    fireEvent.click(screen.getByRole('button', { name: '简' }));
    expect(onToggle).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '繁' }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('English interface: chapter options, navigation, search, history, script and edition labels are English', () => {
    setReaderPreference('uiLanguage', 'en');
    renderHeader();
    expect(screen.getByRole('button', { name: 'Previous chapter' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Next chapter' })).not.toBeNull();
    expect(screen.getByPlaceholderText('Search books…')).not.toBeNull();
    expect((screen.getByRole('textbox', { name: 'Book' }) as HTMLInputElement).value).toBe('John');
    const chapter = screen.getByRole('combobox', { name: 'Chapter' }) as HTMLSelectElement;
    expect(chapter.options[0].textContent).toBe('Chapter 1');
    expect(screen.getByRole('button', { name: 'Search verses' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Reading history' })).not.toBeNull();
    expect(screen.getByRole('group', { name: 'Chinese script' })).toHaveAttribute(
      'title', 'Now: Simplified — click to switch to Traditional');
    expect(screen.getByText('Online')).not.toBeNull();
    // The interface language never changes the editions on offer.
    expect(optionValues('English edition')).toEqual(['bsb', 'web', 'kjv', 'asv', 'bbe', 'ylt']);
    expect(optionValues('Chinese edition')).toEqual(['cuv']);
    expect(document.body.querySelector('[lang="en"]')).not.toBeNull();
  });
});
