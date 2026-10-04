/**
 * LandingNumbers.test.tsx — four honest figures, pinned to the repo · 真实的数字测试
 *
 * The strip must show exactly four figures and nothing about users. The
 * book and verse figures are re-derived here from public/bible-data (the
 * output of scripts/fetch-bible-data.mjs) so the label can never drift
 * from what is actually bundled.
 */
import React from 'react';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import LandingNumbers from '../LandingNumbers';
import { HONEST_NUMBERS, BOOK_COUNT, VERSE_COUNT_LABEL, OFFLINE_FIGURE } from '../landingStrings';
import { TRANSLATIONS } from '../../studypack/principles';

const CUV_DIR = path.resolve(__dirname, '../../../public/bible-data', TRANSLATIONS.zh.id);

function countBundledCuv(): { books: number; verses: number } {
  const books = readdirSync(CUV_DIR, { withFileTypes: true }).filter(d => d.isDirectory());
  let verses = 0;
  for (const book of books) {
    for (const file of readdirSync(path.join(CUV_DIR, book.name))) {
      if (!file.endsWith('.json')) continue;
      const chapter = JSON.parse(readFileSync(path.join(CUV_DIR, book.name, file), 'utf-8'));
      verses += chapter.verses.length;
    }
  }
  return { books: books.length, verses };
}

// Reading ~1,189 chapter files is >10 s under heavy CPU load (every read is
// also scanned by the endpoint antivirus). Count once at file collection,
// which has no timeout, so the slow I/O never counts against the test timeout.
const BUNDLED_CUV = countBundledCuv();

describe('LandingNumbers', () => {
  it('shows exactly the four figures, Chinese label before English', () => {
    render(<LandingNumbers />);
    expect(HONEST_NUMBERS).toHaveLength(4);
    const strip = screen.getByTestId('honest-numbers');
    const values = within(strip).getAllByRole('term').map(el => el.textContent);
    expect(values).toEqual(HONEST_NUMBERS.map(f => f.value));
    for (const figure of HONEST_NUMBERS) {
      expect(within(strip).getByText(figure.zh).nextElementSibling?.textContent).toBe(figure.en);
    }
    expect(values).toContain(String(BOOK_COUNT));
    expect(values).toContain(VERSE_COUNT_LABEL);
    expect(values).toContain(String(Object.keys(TRANSLATIONS).length));
    expect(values).toContain(OFFLINE_FIGURE);
  });

  it('names the two translations (和合本 · BSB) from the principles module', () => {
    render(<LandingNumbers />);
    expect(screen.getByTestId('honest-numbers'))
      .toHaveTextContent(`${TRANSLATIONS.zh.label} · ${TRANSLATIONS.en.label}`);
  });

  it('never mentions users, visitors, members or churches as a count', () => {
    const text = HONEST_NUMBERS.map(f => `${f.value} ${f.zh} ${f.en} ${'note' in f ? f.note : ''}`).join(' ');
    expect(text).not.toMatch(/user|visitor|member|church|用户|访客|教会/i);
  });

  it('book and verse figures match the bundled 和合本 data', () => {
    const { books, verses } = BUNDLED_CUV;
    expect(books).toBe(BOOK_COUNT);
    const labelFloor = Number(VERSE_COUNT_LABEL.replace(/[,+]/g, ''));
    expect(verses).toBeGreaterThanOrEqual(labelFloor);
    expect(verses - labelFloor).toBeLessThan(100);  // "31,100+" must stay an honest round-down
  });
});
