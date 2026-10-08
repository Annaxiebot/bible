// Owner: the optional fields took half the form; they fold under one line showing their values.
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MoreOptions, { optionsSummary } from '../MoreOptions';
import { NS_MORE_OPTIONS } from '../newStudyStrings';

describe('MoreOptions', () => {
  it('folded by default: the summary shows, the fields are hidden; one click opens them', () => {
    render(<MoreOptions summary="中文为主 · 2026-10-07"><input data-testid="field" /></MoreOptions>);
    expect(screen.getByTestId('ns-more-summary')).toHaveTextContent('中文为主 · 2026-10-07');
    // jsdom applies no Tailwind CSS: pin the class that hides it (the real-browser check is in new-study.spec).
    expect(screen.getByTestId('ns-more-fields')).toHaveClass('hidden');
    expect(screen.getByTestId('ns-more-fields').className).not.toMatch(/\bflex\b/);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(NS_MORE_OPTIONS) }));
    expect(screen.getByTestId('ns-more-fields')).not.toHaveClass('hidden');
    expect(screen.getByRole('button', { name: new RegExp(NS_MORE_OPTIONS) })).toHaveAttribute('aria-expanded', 'true');
  });

  it('the summary names the language, the lesson, the title and the date, skipping empty ones', () => {
    const base = { bookId: 'MRK', chapter: 1, verseFrom: 1, verseTo: 15, date: '2026-10-07', contentLanguage: 'zh-keywords' as const };
    expect(optionsSummary(base)).toBe('中文为主 · 2026-10-07');
    expect(optionsSummary({ ...base, lessonNumber: 4, lessonTitle: ' 恩典 ', contentLanguage: 'bilingual' })).toBe('中英双语 · 第4课 · 恩典 · 2026-10-07');
  });
});
