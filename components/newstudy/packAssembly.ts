/**
 * packAssembly.ts — assemble a StudyPack from verses + generated content · 组装
 *
 * Mirrors the shape of the committed sample pack (public/packs/
 * 2026-10-02-matt6.json): same section order, same headings, Chinese-first
 * "中文 · English" body lines. Scripture verses come in from the bundled Bible
 * data; the model never touches them. The app-owned layers (reflection
 * privacy line, QR sign-up, closing lead line) are fixed here (ADR-0003 §7).
 */
import { StudyPack, PackSection, PackVerse, parseStudyPack } from '../studypack/packTypes';
import { bilingual, bilingualLine, TRANSLATIONS } from '../studypack/principles';
import { bilingualRefLabel } from '../studypack/refLabel';
import { makeLocalPackId } from '../studypack/packSource';
import { getBookById } from '../../services/bibleBookData';
import { GeneratedContent } from './generatedPack';

export interface StudyRequest {
  bookId: string;
  chapter: number;
  verseFrom: number;
  verseTo: number;
  lessonTitle?: string;
  lessonNumber?: number;
  date: string; // ISO yyyy-mm-dd
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

/** The group's sign-up QR, shared by every pack (same image + URL as the committed packs). */
export const SIGNUP_QR = {
  image: 'packs/signup-qr.png',
  url: 'https://forms.gle/kXamVsHcRTXHbZ4d6',
  body: bilingualLine('扫码登记周中提醒', 'Scan to get the Tue/Thu check-in texts'),
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
export function passageLabel(req: StudyRequest): { zh: string; en: string; ref: string } {
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

function scriptureSection(req: StudyRequest, verses: PackVerse[], gen: GeneratedContent): PackSection {
  const label = passageLabel(req);
  const enBook = label.en.split(' ').slice(0, -1).join(' ');
  return {
    kind: 'scripture',
    heading: `${SECTION_HEADINGS.scripture} — ${label.zh} ${enBook}`,
    keyPhrase: `${gen.keyPhrase.zh} ${gen.keyPhrase.en} (v.${gen.keyPhrase.verse})`,
    verses,
  };
}

function reflectionLines(gen: GeneratedContent): string[] {
  const r = gen.reflection;
  return [
    bilingualLine(REFLECTION_PREFIX.tue.zh + r.tue.zh, REFLECTION_PREFIX.tue.en + r.tue.en),
    bilingualLine(REFLECTION_PREFIX.thu.zh + r.thu.zh, REFLECTION_PREFIX.thu.en + r.thu.en),
    bilingualLine(REFLECTION_PREFIX.weekend.zh + r.weekend.zh, REFLECTION_PREFIX.weekend.en + r.weekend.en),
    PRIVACY_LINE,
  ];
}

/** Build and validate the pack. Throws (parseStudyPack) if anything is malformed. */
export function assemblePack(req: StudyRequest, verses: PackVerse[], gen: GeneratedContent): StudyPack {
  const label = passageLabel(req);
  const heading = titleHeading(req, gen);
  const lines = (items: { zh: string; en: string }[]) => items.map(i => bilingualLine(i.zh, i.en));
  const sections: PackSection[] = [
    { kind: 'title', heading, body: [label.ref, `${GROUP_LINE} · ${req.date}`] },
    scriptureSection(req, verses, gen),
    { kind: 'context', heading: SECTION_HEADINGS.context, body: lines(gen.context) },
    { kind: 'originalLanguage', heading: SECTION_HEADINGS.originalLanguage, body: lines(gen.originalLanguage) },
    {
      kind: 'crossRefs',
      heading: SECTION_HEADINGS.crossRefs,
      body: gen.crossRefs.map(c => `${bilingualRefLabel(c.ref)} — ${bilingualLine(c.zh, c.en)}`),
    },
    { kind: 'discussion', heading: SECTION_HEADINGS.discussion, questions: lines(gen.discussion) },
    {
      kind: 'lifeMenu',
      heading: SECTION_HEADINGS.lifeMenu,
      rows: gen.lifeMenu.map(l => ({ area: l.area, practice: bilingualLine(l.zh, l.en) })),
    },
    { kind: 'reflection', heading: SECTION_HEADINGS.reflection, body: reflectionLines(gen) },
    { kind: 'qr', heading: SECTION_HEADINGS.qr, image: SIGNUP_QR.image, url: SIGNUP_QR.url, body: [SIGNUP_QR.body] },
    {
      kind: 'closing',
      heading: SECTION_HEADINGS.closing,
      body: [CLOSING_LEAD, bilingualLine(`「${gen.closing.zh}」`, `“${gen.closing.en}”`)],
    },
  ];
  return parseStudyPack({
    id: makeLocalPackId(req.date, req.bookId, req.chapter),
    title: `${heading} — ${label.zh}`,
    date: req.date,
    passageRef: label.ref,
    enVersion: TRANSLATIONS.en.label,
    sections,
  });
}
