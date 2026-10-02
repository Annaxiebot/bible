/**
 * verseRangeFields.tsx — chapter / from / to dropdowns driven by real data ·
 * 章节范围选择
 *
 * One copy (R3) used by NewStudyForm (new study) and ScriptureRangeEditor
 * (change the range of a generated pack). `useVerseRange` owns the rules:
 * verse options come from the bundled chapter (useVerseCount), a newly
 * chosen chapter defaults to its whole range, and To never drops below
 * From. `RangeSelects` renders the three native selects (large type,
 * ≥48px targets) under the caller's test-id prefix.
 */
import React, { useState } from 'react';
import { getBookById } from '../../services/bibleBookData';
import { TV_LOADING } from '../studypack/tvHints';
import { VerseRange } from './packAssembly';
import { NS_CHAPTER, NS_VERSE_FROM, NS_VERSE_TO } from './newStudyStrings';
import { textStyle, controlStyle, inputClass, labelClass } from './newStudyStyles';
import { useVerseCount, chapterKey, MAX_VERSES_IN_A_CHAPTER } from './useVerseCount';

export interface VerseRangeControl {
  /** Verse options: the real count, or a wide fallback when the chapter cannot load. */
  verseOptions: number;
  chapterCount: number;
  setChapter: (chapter: number) => void;
  setFrom: (verseFrom: number) => void;
  setTo: (verseTo: number) => void;
}

const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i + 1);

/** Native <select> of 1..count; disabled with the bilingual loading line while count is unknown. */
export const NumberSelect: React.FC<{
  label: string; value: number; count: number | undefined; testId: string;
  onChange: (n: number) => void;
}> = ({ label, value, count, testId, onChange }) => (
  <label className={labelClass} style={textStyle}>
    <span>{label}</span>
    <select
      value={count === undefined ? '' : value} disabled={count === undefined}
      data-testid={testId} aria-label={label}
      onChange={e => onChange(Number(e.target.value))}
      className={inputClass} style={controlStyle}
    >
      {count === undefined
        ? <option value="">{TV_LOADING}</option>
        : range(count).map(n => <option key={n} value={n}>{n}</option>)}
    </select>
  </label>
);

/**
 * Range rules over the caller's own state. Must be called by the component
 * that owns `value` (it updates that state during render, which React only
 * allows for the rendering component): whole chapter by default once a *new*
 * chapter's count arrives; the initial range keeps itself (its key is
 * pre-applied). Adjusted during render, not in an effect, so the selects
 * never show a stale range.
 */
export function useVerseRange(value: VerseRange, update: (patch: Partial<VerseRange>) => void): VerseRangeControl {
  const verseCount = useVerseCount(value.bookId, value.chapter);
  const verseOptions = verseCount === null ? MAX_VERSES_IN_A_CHAPTER : verseCount;
  const [appliedKey, setAppliedKey] = useState(chapterKey(value.bookId, value.chapter));
  const key = chapterKey(value.bookId, value.chapter);
  if (typeof verseCount === 'number' && appliedKey !== key) {
    setAppliedKey(key);
    update({ verseFrom: 1, verseTo: verseCount });
  }
  return {
    verseOptions,
    chapterCount: getBookById(value.bookId)?.chapters ?? 0,
    setChapter: chapter => update({ chapter, verseFrom: 1 }),
    setFrom: verseFrom => update({ verseFrom, verseTo: Math.max(verseFrom, value.verseTo) }),
    setTo: verseTo => update({ verseTo: Math.max(verseTo, value.verseFrom) }),
  };
}

/** The three selects; test ids are `${prefix}-chapter`, `${prefix}-verse-from`, `${prefix}-verse-to`. */
export const RangeSelects: React.FC<{ value: VerseRange; control: VerseRangeControl; prefix: string }> = ({
  value, control, prefix,
}) => (
  <div className="grid grid-cols-3 gap-4">
    <NumberSelect label={NS_CHAPTER} value={value.chapter} count={control.chapterCount} testId={`${prefix}-chapter`}
      onChange={control.setChapter} />
    <NumberSelect label={NS_VERSE_FROM} value={value.verseFrom} count={control.verseOptions} testId={`${prefix}-verse-from`}
      onChange={control.setFrom} />
    <NumberSelect label={NS_VERSE_TO} value={value.verseTo} count={control.verseOptions} testId={`${prefix}-verse-to`}
      onChange={control.setTo} />
  </div>
);
