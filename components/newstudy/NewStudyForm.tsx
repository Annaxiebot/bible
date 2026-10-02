/**
 * NewStudyForm.tsx — passage picker for a new study · 选择经文
 *
 * Book (bilingual names from the canonical table, Chinese first), chapter
 * and verse range as native dropdowns driven by real data (verseRangeFields:
 * chapters from bibleBookData, verses from the bundled chapter). Optional
 * lesson title/number, date. Large type and ≥48px targets (newStudyStyles).
 * Validation errors are bilingual and inline.
 */
import React, { useState } from 'react';
import { BIBLE_BOOKS, getBookById } from '../../services/bibleBookData';
import { StudyRequest } from './packAssembly';
import {
  NS_BOOK, NS_LESSON_TITLE, NS_LESSON_NUMBER, NS_DATE, NS_GENERATE, NS_GENERATING, NS_ERR_RANGE, NS_ERR_CHAPTER,
  NS_FEEDBACK_FORM_LINK, NS_FEEDBACK_FORM_DEFAULT,
} from './newStudyStrings';
import { textStyle, controlStyle, inputClass, primaryButtonClass, labelClass } from './newStudyStyles';
import { useVerseRange, RangeSelects } from './verseRangeFields';
import { validateFeedbackFormUrl, readDefaultFormUrl, rememberDefaultFormUrl } from './feedbackFormDefault';

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
  return validateFeedbackFormUrl(req.feedbackFormUrl ?? '');
}

/** Optional Google Form link + "use for all my studies" (feedbackFormDefault remembers the default). */
const FeedbackLinkFields: React.FC<{
  url: string; useForAll: boolean; onUrl: (url: string) => void; onUseForAll: (on: boolean) => void;
}> = ({ url, useForAll, onUrl, onUseForAll }) => (
  <>
    <label className={labelClass} style={textStyle}>
      <span>{NS_FEEDBACK_FORM_LINK}</span>
      <input type="url" inputMode="url" value={url} aria-label={NS_FEEDBACK_FORM_LINK} data-testid="ns-feedback-link"
        placeholder="https://docs.google.com/forms/d/e/…/viewform" onChange={e => onUrl(e.target.value)}
        className={inputClass} style={controlStyle} />
    </label>
    <label className="flex items-center gap-3 text-slate-100" style={controlStyle}>
      <input type="checkbox" data-testid="ns-feedback-default" checked={useForAll} onChange={e => onUseForAll(e.target.checked)}
        style={{ width: 28, height: 28, accentColor: '#f59e0b' }} />
      <span>{NS_FEEDBACK_FORM_DEFAULT}</span>
    </label>
  </>
);

interface Props {
  busy: boolean;
  onGenerate: (req: StudyRequest) => void;
}

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
  const [req, setReq] = useState<StudyRequest>(() => {
    const feedbackFormUrl = readDefaultFormUrl();
    return { ...DEFAULT_REQUEST, date: todayIso(), ...(feedbackFormUrl ? { feedbackFormUrl } : {}) };
  });
  const [useForAll, setUseForAll] = useState(() => readDefaultFormUrl() !== '');
  const [error, setError] = useState<string | null>(null);
  const update = (patch: Partial<StudyRequest>) => { setReq(r => ({ ...r, ...patch })); setError(null); };
  const range = useVerseRange(req, update);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validateRequest(req);
    if (problem) { setError(problem); return; }
    const feedbackFormUrl = req.feedbackFormUrl?.trim() || undefined;
    rememberDefaultFormUrl(feedbackFormUrl ?? '', useForAll);
    onGenerate({ ...req, lessonTitle: req.lessonTitle?.trim() || undefined, feedbackFormUrl });
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
      <RangeSelects value={req} control={range} prefix="ns" />
      <LessonFields req={req} update={update} />
      <FeedbackLinkFields url={req.feedbackFormUrl ?? ''} useForAll={useForAll}
        onUrl={url => update({ feedbackFormUrl: url })} onUseForAll={setUseForAll} />
      {error && <p role="alert" className="text-red-300" style={textStyle}>{error}</p>}
      <button type="submit" disabled={busy} className={primaryButtonClass} style={controlStyle} data-testid="ns-generate">
        {busy ? NS_GENERATING : NS_GENERATE}
      </button>
    </form>
  );
};

export default NewStudyForm;
