/**
 * NewStudyForm.tsx — passage picker for a new study · 选择经文
 *
 * Book (bilingual names from the canonical table, Chinese first), chapter
 * and verse range as native dropdowns driven by real data (verseRangeFields:
 * chapters from bibleBookData, verses from the bundled chapter). Optional
 * lesson title/number, date. Large type and ≥48px targets (newStudyStyles).
 * Validation errors are bilingual and inline. With a study guide (ADR-0019)
 * the guide's banner sits on top and its passage pre-fills the dropdowns.
 */
import React, { useState } from 'react';
import { BIBLE_BOOKS, getBookById } from '../../../shared/services/bibleBookData';
import { StudyRequest } from './packAssembly';
import {
  NS_BOOK, NS_LESSON_TITLE, NS_LESSON_NUMBER, NS_DATE, NS_GENERATE, NS_GENERATING, NS_ERR_RANGE, NS_ERR_CHAPTER,
  NS_CONTENT_LANGUAGE, NS_CONTENT_LANGUAGE_OPTIONS, NS_WORSHIP_OPTION,
  NS_AI_INSTRUCTIONS, NS_AI_INSTRUCTIONS_HINT,
} from '../../../shared/newstudy/newStudyStrings';
import { readLeaderInstructions, rememberLeaderInstructions, LEADER_INSTRUCTIONS_MAX_CHARS } from './leaderInstructionsDefault';
import { textStyle, controlStyle, inputClass, primaryButtonClass, labelClass } from './newStudyStyles';
import { useVerseRange, RangeSelects } from './verseRangeFields';
import { readDefaultContentLanguage, rememberContentLanguage, readDefaultWorship, rememberWorship } from './contentLanguageDefault';
import { CONTENT_LANGUAGES, DEFAULT_CONTENT_LANGUAGE, isContentLanguage } from '../../../shared/studypack/principles';
import { FIRST_STUDY, NextStudy } from './nextStudy';
import type { LoadedGuide } from './guide/loadGuide';
import { GuideBanner } from './guide/GuideEntry';
import MoreOptions, { optionsSummary } from './MoreOptions';

/** Local ISO date (yyyy-mm-dd) for the date field's default. */
export function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Before the suggestion arrives the form shows the first study (Mark 1:1–15, nextStudy.ts). */
export const DEFAULT_REQUEST: StudyRequest = { ...FIRST_STUDY, date: '', contentLanguage: DEFAULT_CONTENT_LANGUAGE };

/** Pure validation so the unit tests pin the rules without rendering. */
export function validateRequest(req: StudyRequest): string | null {
  const book = getBookById(req.bookId);
  if (!book || req.chapter < 1 || req.chapter > book.chapters) return NS_ERR_CHAPTER;
  if (req.verseFrom < 1 || req.verseTo < req.verseFrom) return NS_ERR_RANGE;
  return null;
}

/** "内容语言 Content language": the three modes in UI order, Chinese-first labels, large type (≥48px). */
const ContentLanguageField: React.FC<{ req: StudyRequest; update: (patch: Partial<StudyRequest>) => void }> = ({ req, update }) => (
  <label className={labelClass} style={textStyle}>
    <span>{NS_CONTENT_LANGUAGE}</span>
    <select value={req.contentLanguage} aria-label={NS_CONTENT_LANGUAGE} data-testid="ns-content-language"
      onChange={e => { if (isContentLanguage(e.target.value)) update({ contentLanguage: e.target.value }); }}
      className={inputClass} style={controlStyle}>
      {CONTENT_LANGUAGES.map(mode => <option key={mode} value={mode}>{NS_CONTENT_LANGUAGE_OPTIONS[mode]}</option>)}
    </select>
  </label>
);

/** "敬拜诗歌 Worship songs": AI suggestions from the catalog, off by default, remembered (ADR-0022 step 2). */
const WorshipField: React.FC<{ req: StudyRequest; update: (patch: Partial<StudyRequest>) => void }> = ({ req, update }) => (
  <label className="flex items-center gap-3 cursor-pointer" style={textStyle}>
    <input type="checkbox" checked={!!req.worship} data-testid="ns-worship-toggle"
      onChange={e => update({ worship: e.target.checked })} className="h-6 w-6 accent-amber-400" />
    <span>{NS_WORSHIP_OPTION}</span>
  </label>
);

/** "给 AI 的定制要求": free text honored on every generation (组长定制), remembered + synced like the content language. */
const InstructionsField: React.FC<{ req: StudyRequest; update: (patch: Partial<StudyRequest>) => void }> = ({ req, update }) => (
  <label className={labelClass} style={textStyle}>
    <span>{NS_AI_INSTRUCTIONS}</span>
    <textarea value={req.leaderInstructions ?? ''} aria-label={NS_AI_INSTRUCTIONS} data-testid="ns-ai-instructions"
      maxLength={LEADER_INSTRUCTIONS_MAX_CHARS} rows={2}
      onChange={e => update({ leaderInstructions: e.target.value })} className={inputClass} style={controlStyle} />
    <span className="text-slate-500" style={{ ...textStyle, fontSize: Number(textStyle.fontSize) * 0.75 }}>
      {NS_AI_INSTRUCTIONS_HINT}
    </span>
  </label>
);

interface Props {
  busy: boolean;
  onGenerate: (req: StudyRequest) => void;
  /** Where the next study starts (useNextStudy) — the form opens on it; absent → Mark 1:1–15. */
  suggestion?: NextStudy | null;
  /** A study guide read from the leader's PDF (ADR-0019): its passage pre-fills the form, Generate sends it along. */
  guide?: LoadedGuide | null;
  onDropGuide?: () => void;
  /** Shown as the form's error until the leader changes something (a guide whose passage must be picked). */
  message?: string;
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

const NewStudyForm: React.FC<Props> = ({ busy, onGenerate, suggestion = null, guide = null, onDropGuide, message }) => {
  const [req, setReq] = useState<StudyRequest>(() => ({
    ...DEFAULT_REQUEST, ...suggestion, ...guide?.passage.range, date: todayIso(), contentLanguage: readDefaultContentLanguage(),
    worship: readDefaultWorship(), leaderInstructions: readLeaderInstructions(),
  }));
  const [error, setError] = useState<string | null>(message ?? null);
  const update = (patch: Partial<StudyRequest>) => { setReq(r => ({ ...r, ...patch })); setError(null); };
  const range = useVerseRange(req, update);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validateRequest(req);
    if (problem) { setError(problem); return; }
    rememberContentLanguage(req.contentLanguage);
    rememberWorship(!!req.worship);
    rememberLeaderInstructions(req.leaderInstructions ?? '');
    onGenerate({
      ...req, lessonTitle: req.lessonTitle?.trim() || undefined,
      leaderInstructions: req.leaderInstructions?.trim() || undefined, ...(guide ? { guide } : {}),
    });
  };

  return (
    <form onSubmit={submit} data-testid="new-study-form" className="flex flex-col gap-5">
      {guide && <GuideBanner guide={guide} onDrop={() => onDropGuide?.()} />}
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
      <MoreOptions summary={optionsSummary(req)}>
        <ContentLanguageField req={req} update={update} />
        <WorshipField req={req} update={update} />
        <InstructionsField req={req} update={update} />
        <LessonFields req={req} update={update} />
      </MoreOptions>
      {error && <p role="alert" className="text-red-300" style={textStyle}>{error}</p>}
      <button type="submit" disabled={busy} className={primaryButtonClass} style={controlStyle} data-testid="ns-generate">
        {busy ? NS_GENERATING : NS_GENERATE}
      </button>
    </form>
  );
};

export default NewStudyForm;
