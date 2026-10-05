/**
 * packAssembly.ts — assemble a StudyPack from verses + generated content · 组装
 *
 * Mirrors the shape of the committed sample pack (public/packs/
 * 2026-10-02-matt6.json): same section order, same headings, Chinese-first
 * "中文 · English" body lines. Scripture verses come in from the bundled Bible
 * data; the model never touches them. The app-owned layers (reflection
 * privacy line, QR sign-up line, closing lead line) are fixed here (ADR-0003
 * §7); the QR itself is drawn per pack from its id (signupRoute).
 */
import { StudyPack, PackSection, PackVerse, parseStudyPack } from '../studypack/packTypes';
import { bilingual, bilingualLine, contentLine, ContentLanguage, TRANSLATIONS } from '../studypack/principles';
import { bilingualRefLabel } from '../studypack/refLabel';
import { HEADING_DETAIL_SEPARATOR } from '../studypack/slideText';
import { makeLocalPackId } from '../studypack/packSource';
import { getBookById } from '../../services/bibleBookData';
import { GeneratedContent } from './generatedPack';
import { SU_QR_BODY } from '../signup/signupStrings';
import { halfWithoutKindLabel } from '../../supabase/functions/send-checkins/promptText';

/** A passage inside one chapter (the editor's range change needs only this). */
export interface VerseRange {
  bookId: string;
  chapter: number;
  verseFrom: number;
  verseTo: number;
}

export interface StudyRequest extends VerseRange {
  lessonTitle?: string;
  lessonNumber?: number;
  date: string; // ISO yyyy-mm-dd
  /** Optional Google Form pasted by the leader (ADR-0004 §9); overrides the auto-created one. */
  feedbackFormUrl?: string;
  /** How much English the model-drafted lines carry (ADR-0003 §1 note). */
  contentLanguage: ContentLanguage;
}

/** Section headings, as the sample pack writes them (Chinese first). */
export const SECTION_HEADINGS = {
  scripture: bilingual('经文', 'Scripture'),
  context: bilingual('背景', 'Context'),
  originalLanguage: bilingual('原文', 'Original Language'),
  crossRefs: bilingual('交叉经文', 'Cross-references'),
  discussion: bilingual('讨论', 'Discussion'),
  lifeMenu: bilingual('生活应用', 'Life Menu'),
  reflection: bilingual('反思', 'Reflection'),
  qr: bilingual('签到', 'Sign up'),
  closing: bilingual('闭环', 'Closing'),
} as const;

export const GROUP_LINE = bilingual('周五小组', 'Friday Small Group');
export const PRIVACY_LINE = bilingualLine(
  '隐私规则：反思默认私密；分享由本人选择',
  'Privacy rule: reflections are private by default; sharing is opt-in'
);
export const CLOSING_LEAD = bilingualLine('下周五我们这样开场：', 'Next Friday opens with:');
export const REFLECTION_PREFIX = {
  tue: { zh: '周二跟进：', en: 'Tuesday check-in: ' },
  thu: { zh: '周四跟进：', en: 'Thursday check-in: ' },
  weekend: { zh: '周末回顾：', en: 'End of week: ' },
} as const;

const RANGE_DASH = '–';

/** "约翰福音 3:22–36 · John 3:22–36" plus the halves, from the canonical book table. */
export function passageLabel(req: VerseRange): { zh: string; en: string; ref: string } {
  const book = getBookById(req.bookId);
  if (!book) throw new Error(`Unknown book id: ${req.bookId}`);
  const [zhName, ...enParts] = book.name.split(' ');
  const enName = enParts.join(' ').replace(/^Psalms$/, 'Psalm');
  const range = req.verseFrom === req.verseTo
    ? `${req.chapter}:${req.verseFrom}`
    : `${req.chapter}:${req.verseFrom}${RANGE_DASH}${req.verseTo}`;
  const zh = `${zhName} ${range}`;
  const en = `${enName} ${range}`;
  return { zh, en, ref: bilingualLine(zh, en) };
}

function titleHeading(req: StudyRequest, gen: GeneratedContent): string {
  const lesson = req.lessonNumber ? `第${req.lessonNumber}课 ` : '';
  return `${lesson}${bilingual(gen.title.zh, gen.title.en)}`;
}

/** The scripture section for a range; the AI key phrase (if any) rides along. Also used when the range changes. */
export function scriptureSection(req: VerseRange, verses: PackVerse[], keyPhrase: string | undefined): PackSection {
  const label = passageLabel(req);
  const enBook = label.en.split(' ').slice(0, -1).join(' ');
  return {
    kind: 'scripture',
    heading: `${SECTION_HEADINGS.scripture}${HEADING_DETAIL_SEPARATOR}${label.zh} ${enBook}`,
    keyPhrase,
    verses,
  };
}

function keyPhraseLine(gen: GeneratedContent): string {
  return `${gen.keyPhrase.zh} ${gen.keyPhrase.en} (v.${gen.keyPhrase.verse})`;
}

/** The app's own label + the model's text without its own label ("周末回顾：" + "周末:回顾…" used to show both). */
function labelled(prefix: { zh: string; en: string }, text: { zh: string; en: string }, mode: ContentLanguage): string {
  return contentLine(mode, prefix.zh + halfWithoutKindLabel(text.zh), prefix.en + halfWithoutKindLabel(text.en));
}

function reflectionLines(mode: ContentLanguage, gen: GeneratedContent): string[] {
  const r = gen.reflection;
  return [
    labelled(REFLECTION_PREFIX.tue, r.tue, mode),
    labelled(REFLECTION_PREFIX.thu, r.thu, mode),
    labelled(REFLECTION_PREFIX.weekend, r.weekend, mode),
    PRIVACY_LINE,
  ];
}

/**
 * Give a pack its owner (ADR-0004): the signed-in leader's uid, so sign-ups
 * for it carry leader_id and only that leader can read them. Signed out
 * (null) leaves the pack untouched — it stays a demo pack with no sign-up.
 */
export function stampLeader(pack: StudyPack, leaderId: string | null): StudyPack {
  return leaderId ? { ...pack, leaderId } : pack;
}

/**
 * Build and validate the pack. Throws (parseStudyPack) if anything is malformed.
 * Model-drafted lines follow req.contentLanguage (contentLine); headings,
 * verses and the app-owned lines stay bilingual in every mode.
 */
export function assemblePack(req: StudyRequest, verses: PackVerse[], gen: GeneratedContent): StudyPack {
  const label = passageLabel(req);
  const heading = titleHeading(req, gen);
  const mode = req.contentLanguage;
  const lines = (items: { zh: string; en: string }[]) => items.map(i => contentLine(mode, i.zh, i.en));
  const sections: PackSection[] = [
    { kind: 'title', heading, body: [label.ref, `${GROUP_LINE} · ${req.date}`] },
    scriptureSection(req, verses, keyPhraseLine(gen)),
    { kind: 'context', heading: SECTION_HEADINGS.context, body: lines(gen.context) },
    { kind: 'originalLanguage', heading: SECTION_HEADINGS.originalLanguage, body: lines(gen.originalLanguage) },
    {
      kind: 'crossRefs',
      heading: SECTION_HEADINGS.crossRefs,
      body: gen.crossRefs.map(c => `${bilingualRefLabel(c.ref)} — ${contentLine(mode, c.zh, c.en)}`),
    },
    { kind: 'discussion', heading: SECTION_HEADINGS.discussion, questions: lines(gen.discussion) },
    {
      kind: 'lifeMenu',
      heading: SECTION_HEADINGS.lifeMenu,
      rows: gen.lifeMenu.map(l => ({ area: l.area, practice: contentLine(mode, l.zh, l.en) })),
    },
    { kind: 'reflection', heading: SECTION_HEADINGS.reflection, body: reflectionLines(mode, gen) },
    { kind: 'qr', heading: SECTION_HEADINGS.qr, body: [SU_QR_BODY] },
    {
      kind: 'closing',
      heading: SECTION_HEADINGS.closing,
      body: [CLOSING_LEAD, contentLine(mode, `「${gen.closing.zh}」`, `“${gen.closing.en}”`)],
    },
  ];
  return parseStudyPack({
    id: makeLocalPackId(req.date, req.bookId, req.chapter),
    title: `${heading} — ${label.zh}`,
    date: req.date,
    passageRef: label.ref,
    enVersion: TRANSLATIONS.en.label,
    contentLanguage: mode,
    ...(req.feedbackFormUrl ? { feedbackFormUrl: req.feedbackFormUrl } : {}),
    sections,
  });
}
