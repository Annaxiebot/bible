/**
 * ScriptureRangeEditor.test.tsx — changing the range (bundled data mocked):
 * only the scripture section, passageRef, the title's passage part and the
 * title slide's passage line change; every AI-written section is the same
 * object (byte-identical); an unavailable range shows the bilingual error.
 */
import React, { useState } from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StudyPack, buildSlides, parseStudyPack } from '../../studypack/packTypes';
import { assemblePack } from '../packAssembly';
import { validateGenerated } from '../generatedPack';
import { packRange, withScripture } from '../scriptureRange';
import ScriptureRangeEditor from '../ScriptureRangeEditor';
import { JOHN3_GENERATED, JOHN3_REQUEST } from './fixtures';
import { NS_RANGE_UPDATED, NS_ERR_VERSES_OUT_OF_RANGE, NS_ERR_VERSES_UNAVAILABLE } from '../newStudyStrings';

/** Mirrors the real seam: John 3 has 36 verses in both translations; any other chapter is missing. */
const fetchMock = vi.fn();
vi.mock('../../../services/bibleDataSource', () => ({
  fetchBundledChapter: (...args: unknown[]) => fetchMock(...args),
}));
function bundledChapter(bookId: string, chapter: number, translation: string) {
  if (bookId !== 'JHN' || chapter !== 3) return null;
  return { verses: Array.from({ length: 36 }, (_, i) => ({ verse: i + 1, text: `${translation} ${i + 1}` })) };
}

const verses = Array.from({ length: 15 }, (_, i) => ({ num: 22 + i, cuv: `第${22 + i}节`, en: `verse ${22 + i}` }));
const original = assemblePack(JOHN3_REQUEST, verses, validateGenerated(JOHN3_GENERATED, JOHN3_REQUEST.contentLanguage));

const Host: React.FC<{ onChange: (p: StudyPack) => void }> = ({ onChange }) => {
  const [pack, setPack] = useState(original);
  return <ScriptureRangeEditor pack={pack} onApply={next => { setPack(next); onChange(next); }} />;
};

const select = (testId: string, value: string) => fireEvent.change(screen.getByTestId(testId), { target: { value } });

describe('packRange / withScripture', () => {
  it('reads the range back from passageRef + the scripture verses', () => {
    expect(packRange(original)).toEqual({ bookId: 'JHN', chapter: 3, verseFrom: 22, verseTo: 36 });
    expect(packRange({ ...original, sections: original.sections.filter(s => s.kind !== 'scripture') })).toBeNull();
  });

  it('rebuilds only scripture + passage labels; AI sections are the same objects', () => {
    const nine = verses.slice(0, 9);
    const next = withScripture(original, { ...JOHN3_REQUEST, verseTo: 30 }, nine);
    expect(next.passageRef).toBe('约翰福音 3:22–30 · John 3:22–30');
    expect(next.title).toBe('祂必兴旺，我必衰微 He Must Increase — 约翰福音 3:22–30');
    expect(next.sections[0].body![0]).toBe('约翰福音 3:22–30 · John 3:22–30');
    expect(next.sections[0].body![1]).toBe(original.sections[0].body![1]);
    const scripture = next.sections[1];
    expect(scripture.heading).toBe('经文 Scripture — 约翰福音 3:22–30 John');
    expect(scripture.verses).toEqual(nine);
    expect(scripture.keyPhrase).toBe(original.sections[1].keyPhrase);
    for (let i = 2; i < next.sections.length; i++) expect(next.sections[i]).toBe(original.sections[i]);
    expect(next.id).toBe(original.id);
    expect(() => parseStudyPack(next)).not.toThrow();
    expect(buildSlides(next)).toHaveLength(16); // 3 scripture parts instead of 5
  });
});

describe('ScriptureRangeEditor', () => {
  beforeEach(() => fetchMock.mockReset().mockImplementation(async (b: string, c: number, t: string) => bundledChapter(b, c, t)));

  it('is seeded from the pack, applies a new range from the bundled text and confirms bilingually', async () => {
    const onChange = vi.fn();
    render(<Host onChange={onChange} />);
    expect(screen.getByTestId('ns-range-chapter')).toHaveValue('3');
    await waitFor(() => expect(screen.getByTestId('ns-range-verse-to')).toBeEnabled());
    expect(screen.getByTestId('ns-range-verse-from')).toHaveValue('22');
    expect(screen.getByTestId('ns-range-verse-to')).toHaveValue('36');
    expect(screen.getByTestId('ns-range-verse-to').querySelectorAll('option')).toHaveLength(36);

    select('ns-range-verse-to', '30');
    fireEvent.click(screen.getByTestId('ns-range-apply'));
    await waitFor(() => expect(screen.getByTestId('ns-range-status')).toHaveTextContent(NS_RANGE_UPDATED));
    const next = onChange.mock.calls[0][0] as StudyPack;
    expect(next.passageRef).toBe('约翰福音 3:22–30 · John 3:22–30');
    expect(next.sections[1].verses!.map(v => v.num)).toEqual([22, 23, 24, 25, 26, 27, 28, 29, 30]);
    expect(next.sections[1].verses![0]).toEqual({ num: 22, cuv: 'cuv 22', en: 'bsb 22' });
    for (let i = 2; i < next.sections.length; i++) expect(next.sections[i]).toBe(original.sections[i]);
    expect(fetchMock).toHaveBeenCalledWith('JHN', 3, 'cuv');
    expect(fetchMock).toHaveBeenCalledWith('JHN', 3, 'bsb');
  });

  it('surfaces an unavailable chapter / out-of-range verses as the bilingual error and leaves the pack alone', async () => {
    const onChange = vi.fn();
    render(<Host onChange={onChange} />);
    await waitFor(() => expect(screen.getByTestId('ns-range-verse-to')).toBeEnabled());
    // Verse options come from a chapter that is unavailable → wide fallback; applying reports it.
    select('ns-range-chapter', '4');
    await waitFor(() => expect(screen.getByTestId('ns-range-verse-to')).toBeEnabled());
    fireEvent.click(screen.getByTestId('ns-range-apply'));
    expect(await screen.findByRole('alert')).toHaveTextContent(NS_ERR_VERSES_UNAVAILABLE);
    expect(onChange).not.toHaveBeenCalled();

    // A chapter that loads but lacks the verse: the second loadPassage error.
    fetchMock.mockImplementation(async (b: string, c: number, t: string) => {
      const data = bundledChapter('JHN', 3, t);
      return c === 4 && b === 'JHN' ? { verses: data!.verses.slice(0, 10) } : data;
    });
    select('ns-range-verse-to', '20');
    fireEvent.click(screen.getByTestId('ns-range-apply'));
    expect(await screen.findByRole('alert')).toHaveTextContent(NS_ERR_VERSES_OUT_OF_RANGE);
    expect(onChange).not.toHaveBeenCalled();
  });
});
