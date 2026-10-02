/**
 * NewStudyForm.tsx — passage picker for a new study · 选择经文
 *
 * Book (bilingual names from the canonical table, Chinese first), chapter
 * and verse range as native dropdowns driven by real data: chapters from
 * bibleBookData, verses from the bundled chapter (useVerseCount). Optional
 * lesson title/number, date. Large type and ≥48px targets (newStudyStyles).
 * Validation errors are bilingual and inline.
 */
import React, { useState } from 'react';
import { BIBLE_BOOKS, getBookById } from '../../services/bibleBookData';
import { TV_LOADING } from '../studypack/tvHints';
import { StudyRequest } from './packAssembly';
import {
  NS_BOOK, NS_CHAPTER, NS_VERSE_FROM, NS_VERSE_TO, NS_LESSON_TITLE, NS_LESSON_NUMBER,
  NS_DATE, NS_GENERATE, NS_GENERATING, NS_ERR_RANGE, NS_ERR_CHAPTER,
} from './newStudyStrings';
import { textStyle, controlStyle, inputClass, primaryButtonClass, labelClass } from './newStudyStyles';
import { useVerseCount, chapterKey, MAX_VERSES_IN_A_CHAPTER } from './useVerseCount';

/** Local ISO date (yyyy-mm-dd) for the date field's default. */
export function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const DEFAULT_REQUEST: StudyRequest = {
  bookId: 'MAT', chapter: 6, verseFrom: 25, verseTo: 34, date: '',
};

/** Pure validation so the unit tests pin the rules without rendering. */
export function validateRequest(req: StudyRequest): string | null {
  const book = getBookById(req.bookId);
  if (!book || req.chapter < 1 || req.chapter > book.chapters) return NS_ERR_CHAPTER;
  if (req.verseFrom < 1 || req.verseTo < req.verseFrom) return NS_ERR_RANGE;
  return null;
}

interface Props {
  busy: boolean;
  onGenerate: (req: StudyRequest) => void;
}

const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i + 1);

/** Native <select> of 1..count; disabled with the bilingual loading line while count is unknown. */
const NumberSelect: React.FC<{
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

/** Optional lesson title + the lesson-number/date sub-grid. */
const LessonFields: React.FC<{ req: StudyRequest; update: (patch: Partial<StudyRequest>) => void }> = ({ req, update }) => (
  <>
    <label className={labelClass} style={textStyle}>
      <span>{NS_LESSON_TITLE}</span>
      <input type="text" value={req.lessonTitle ?? ''} aria-label={NS_LESSON_TITLE} data-testid="ns-lesson-title"
        onChange={e => update({ lessonTitle: e.target.value })} className={inputClass} style={controlStyle} />
    </label>
    <div className="grid grid-cols-2 gap-4">
      <label className={labelClass} style={textStyle}>
        <span>{NS_LESSON_NUMBER}</span>
        <input type="number" inputMode="numeric" min={1} value={req.lessonNumber ?? ''} aria-label={NS_LESSON_NUMBER}
          data-testid="ns-lesson-number"
          onChange={e => update({ lessonNumber: e.target.value ? Number(e.target.value) : undefined })}
          className={inputClass} style={controlStyle} />
      </label>
      <label className={labelClass} style={textStyle}>
        <span>{NS_DATE}</span>
        <input type="date" value={req.date} aria-label={NS_DATE} data-testid="ns-date"
          onChange={e => update({ date: e.target.value })} className={inputClass} style={controlStyle} />
      </label>
    </div>
  </>
);

const NewStudyForm: React.FC<Props> = ({ busy, onGenerate }) => {
  const [req, setReq] = useState<StudyRequest>({ ...DEFAULT_REQUEST, date: todayIso() });
  const [error, setError] = useState<string | null>(null);
  const book = getBookById(req.bookId);
  const verseCount = useVerseCount(req.bookId, req.chapter);
  // Verse options: the real count, or a wide fallback when the chapter cannot load
  // (generation then reports the bilingual "unavailable" error).
  const verseOptions = verseCount === null ? MAX_VERSES_IN_A_CHAPTER : verseCount;
  const update = (patch: Partial<StudyRequest>) => { setReq(r => ({ ...r, ...patch })); setError(null); };

  // Whole chapter by default once a *new* chapter's count arrives; the initial
  // request keeps its own range (its key is pre-applied). Adjusted during
  // render, not in an effect, so the selects never show a stale range.
  const [appliedKey, setAppliedKey] = useState(chapterKey(DEFAULT_REQUEST.bookId, DEFAULT_REQUEST.chapter));
  const key = chapterKey(req.bookId, req.chapter);
  if (typeof verseCount === 'number' && appliedKey !== key) {
    setAppliedKey(key);
    setReq(r => ({ ...r, verseFrom: 1, verseTo: verseCount }));
  }

  const setFrom = (verseFrom: number) => update({ verseFrom, verseTo: Math.max(verseFrom, req.verseTo) });
  const setTo = (verseTo: number) => update({ verseTo: Math.max(verseTo, req.verseFrom) });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validateRequest(req);
    if (problem) { setError(problem); return; }
    onGenerate({ ...req, lessonTitle: req.lessonTitle?.trim() || undefined });
  };

  return (
    <form onSubmit={submit} data-testid="new-study-form" className="flex flex-col gap-5">
      <label className={labelClass} style={textStyle}>
        <span>{NS_BOOK}</span>
        <select
          value={req.bookId} aria-label={NS_BOOK} data-testid="ns-book"
          onChange={e => update({ bookId: e.target.value, chapter: 1, verseFrom: 1 })}
          className={inputClass} style={controlStyle}
        >
          {BIBLE_BOOKS.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-3 gap-4">
        <NumberSelect label={NS_CHAPTER} value={req.chapter} count={book?.chapters ?? 0} testId="ns-chapter"
          onChange={chapter => update({ chapter, verseFrom: 1 })} />
        <NumberSelect label={NS_VERSE_FROM} value={req.verseFrom} count={verseOptions} testId="ns-verse-from"
          onChange={setFrom} />
        <NumberSelect label={NS_VERSE_TO} value={req.verseTo} count={verseOptions} testId="ns-verse-to"
          onChange={setTo} />
      </div>
      <LessonFields req={req} update={update} />
      {error && <p role="alert" className="text-red-300" style={textStyle}>{error}</p>}
      <button type="submit" disabled={busy} className={primaryButtonClass} style={controlStyle} data-testid="ns-generate">
        {busy ? NS_GENERATING : NS_GENERATE}
      </button>
    </form>
  );
};

export default NewStudyForm;
