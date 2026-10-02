/**
 * landingStrings.ts — every user-visible landing string · 首頁文案
 *
 * Single source (R3): components render these, tests import them. Follows
 * ADR-0003: Chinese first, English second, on every bilingual line; only
 * the brand wordmark "Scripture to Life" stays first.
 */

export const BRAND_EN = 'Scripture to Life';
export const BRAND_ZH = '活出神的話';
export const SITE_LINE = 'Scripture to Life · scripturetolife.org';

/** The three-step loop, drawn as the animated hero diagram. */
export const LOOP_STEPS = [
  { zh: '明白神的話', en: 'Understand the Word' },
  { zh: '活出神的話', en: 'Live the Word' },
  { zh: '生命興盛', en: 'Flourish' },
] as const;

export const LOOP_LINE_ZH = LOOP_STEPS.map(s => s.zh).join(' → ');
export const LOOP_LINE_EN = LOOP_STEPS.map(s => s.en).join(' → ');

export const HERO_SUB_ZH = 'AI 查經不止於明白——它陪你走進一週的生活。';
export const HERO_SUB_EN =
  'AI-powered Bible study that doesn’t stop at understanding — it follows you into the week.';

export const GROUP_TITLE_ZH = '小組查經';
export const GROUP_TITLE_EN = 'Group Bible Study';
export const GROUP_CTA = '看示範 See a sample pack';
export const GROUP_POINTS = [
  { icon: 'deck', zh: '講義變成大屏簡報', en: 'Your study guide becomes a TV-ready deck' },
  { icon: 'question', zh: '討論題目，一題一頁', en: 'Discussion questions, one per slide' },
  { icon: 'qr', zh: '掃碼報名', en: 'QR sign-up for the group' },
  { icon: 'checkin', zh: '週中提醒，把神的話帶進一週', en: 'Mid-week check-ins that keep the Word in the week' },
] as const;

export const PERSONAL_TITLE_ZH = '個人研經';
export const PERSONAL_TITLE_EN = 'Personal Study';
export const PERSONAL_CTA = '進入應用 Open the app';
export const PERSONAL_POINTS = [
  { icon: 'bible', zh: '和合本 | BSB 雙語對照', en: 'Bilingual Bible, side by side' },
  { icon: 'pencil', zh: '手寫筆記，為 iPad 與 Pencil 而設', en: 'Handwriting notes, built for iPad and Pencil' },
  { icon: 'sparkle', zh: 'AI 研經，任何經節或字詞', en: 'AI research on any verse or word' },
] as const;

export type PointIcon =
  | (typeof GROUP_POINTS)[number]['icon']
  | (typeof PERSONAL_POINTS)[number]['icon'];

/** One-line AI setup entry under the two cards; opens the quick key dialog. */
export const SETUP_LINE = '一分鐘設置 AI：粘貼密鑰即可 · 1-minute AI setup';
/** Same line once a key is stored (still opens the dialog to change it). */
export const SETUP_DONE_LINE = 'AI 已設置 · AI is set up';

/** Third door, one line: the leader generates a pack from a passage (#/new). */
export const NEW_STUDY_LINE = '新建查經 New study';
export const NEW_STUDY_SUB = '輸入經文，AI 生成查經包，大屏演示 · Enter a passage; a study pack is drafted in your browser';

export const LEADER_ZH = '組長：上傳查經講義，變成大屏簡報。';
export const LEADER_EN =
  'Group leaders: bring your study guide PDF — it becomes a presentation with an AI helper.';

/* ---- sticky top nav: two scroll links ---- */
/* Section element ids — the nav scrolls to these; components set them from the same constants (R3). */
export const GROUP_SECTION_ID = 'group' as const;
export const PERSONAL_SECTION_ID = 'personal' as const;
export const NAV_LINKS = [
  { id: GROUP_SECTION_ID, zh: GROUP_TITLE_ZH, en: 'Group' },
  { id: PERSONAL_SECTION_ID, zh: PERSONAL_TITLE_ZH, en: 'Personal' },
] as const;
export type NavSectionId = (typeof NAV_LINKS)[number]['id'];
export const NAV_LABEL = '頁內導航 Page sections';

/* ---- 下次查經 Next study ---- */
export const NEXT_EYEBROW = '下次查經 · Next study';
export const NEXT_HEADING_ZH = '這週我們讀';
export const NEXT_HEADING_EN = 'This week we read';
export const NEXT_DESC = '當前查經包，隨時打開 · The current study pack, ready to open';
export const NEXT_OPEN_CTA = '打開查經包 Open the pack';
export const NEXT_SIGNUP_CTA = '掃碼報名 Sign up';
export const NEXT_SIGNUP_CLOSE = '收起 Close';
export const NEXT_SIGNUP_LINK = '或點此打開報名表 · or open the sign-up form';
/** Rendered instead of the pack when it cannot be loaded (no error noise). */
export const NEXT_NONE_YET = '暫無 · none yet';
export const NEXT_LOADING = '載入中 · loading';

/* ---- 真實的數字 Honest numbers ---- */
export const NUMBERS_EYEBROW = '真實的數字 · Honest numbers';
export const NUMBERS_HEADING_ZH = '只說能證明的';
export const NUMBERS_HEADING_EN = 'Only what we can prove';
export const NUMBERS_DESC = '沒有用戶數，沒有見證 · No user counts, no testimonials';
/**
 * 31,100: verses in the bundled 和合本 (public/bible-data/cuv, 1,189
 * chapters), produced by scripts/fetch-bible-data.mjs; BSB has 31,086.
 * LandingNumbers.test.tsx re-counts the bundled data and pins this label.
 */
export const VERSE_COUNT_LABEL = '31,100+';
export const BOOK_COUNT = 66;
export const OFFLINE_FIGURE = '離線';
export const HONEST_NUMBERS = [
  { value: String(BOOK_COUNT), zh: '卷', en: 'books' },
  { value: VERSE_COUNT_LABEL, zh: '節', en: 'verses' },
  { value: '2', zh: '譯本', en: 'translations', note: '和合本 · BSB' },
  { value: OFFLINE_FIGURE, zh: '可用', en: 'works offline', note: '大屏與經文不需網絡 · TV mode and verses need no network' },
] as const;
