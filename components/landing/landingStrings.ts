/**
 * landingStrings.ts — every user-visible landing string · 首页文案
 *
 * Single source (R3): components render these, tests import them. Follows
 * ADR-0003: Chinese first, English second, on every bilingual line; only
 * the brand wordmark "Scripture to Life" stays first.
 */

export const BRAND_EN = 'Scripture to Life';
export const BRAND_ZH = '活出神的话';
export const SITE_LINE = 'Scripture to Life · scripturetolife.org';

/** The three-step loop, drawn as the animated hero diagram. */
export const LOOP_STEPS = [
  { zh: '明白神的话', en: 'Understand the Word' },
  { zh: '活出神的话', en: 'Live the Word' },
  { zh: '生命兴盛', en: 'Flourish' },
] as const;

export const LOOP_LINE_ZH = LOOP_STEPS.map(s => s.zh).join(' → ');
export const LOOP_LINE_EN = LOOP_STEPS.map(s => s.en).join(' → ');

export const HERO_SUB_ZH = 'AI 查经不止于明白——它陪你走进一周的生活。';
export const HERO_SUB_EN =
  'AI-powered Bible study that doesn’t stop at understanding — it follows you into the week.';

export const GROUP_TITLE_ZH = '小组查经';
export const GROUP_TITLE_EN = 'Group Bible Study';
export const GROUP_CTA = '看示范 See a sample pack';
export const GROUP_POINTS = [
  { icon: 'deck', zh: '讲义变成大屏简报', en: 'Your study guide becomes a TV-ready deck' },
  { icon: 'question', zh: '讨论题目，一题一页', en: 'Discussion questions, one per slide' },
  { icon: 'qr', zh: '扫码报名', en: 'QR sign-up for the group' },
  { icon: 'checkin', zh: '周中提醒，把神的话带进一周', en: 'Mid-week check-ins that keep the Word in the week' },
] as const;

export const PERSONAL_TITLE_ZH = '个人研经';
export const PERSONAL_TITLE_EN = 'Personal Study';
export const PERSONAL_CTA = '进入应用 Open the app';
export const PERSONAL_POINTS = [
  { icon: 'bible', zh: '和合本 | BSB 双语对照', en: 'Bilingual Bible, side by side' },
  { icon: 'pencil', zh: '手写笔记，为 iPad 与 Pencil 而设', en: 'Handwriting notes, built for iPad and Pencil' },
  { icon: 'sparkle', zh: 'AI 研经，任何经节或字词', en: 'AI research on any verse or word' },
] as const;

export type PointIcon =
  | (typeof GROUP_POINTS)[number]['icon']
  | (typeof PERSONAL_POINTS)[number]['icon'];

/** One-line AI entry under the two cards; opens the AI service dialog (hosted AI: sign in, no key — ADR-0007). */
export const SETUP_LINE = 'AI 服务：带领者登录即可使用 · AI service: sign in as a leader';
/** Same line once AI is available (signed in, or an own key stored); still opens the status dialog. */
export const SETUP_DONE_LINE = 'AI 已就绪 · AI ready';

/** Third door, one line: the leader generates a pack from a passage (#/new). */
export const NEW_STUDY_LINE = '新建查经 New study';
export const NEW_STUDY_SUB = '输入经文，AI 生成查经包，大屏演示 · Enter a passage; a study pack is drafted in your browser';

export const LEADER_ZH = '组长：上传查经讲义，变成大屏简报。';
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
export const NAV_LABEL = '页内导航 Page sections';
/** The nav's one context-aware leader control: signed out it starts Google sign-in; signed in it shows the leader's name → #/leader. */
export const NAV_LEADER_SIGNIN = { zh: '带领者登录', en: 'Leader sign-in' } as const;

/* ---- 下次查经 Next study ---- */
export const NEXT_EYEBROW = '下次查经 · Next study';
export const NEXT_HEADING_ZH = '这周我们读';
export const NEXT_HEADING_EN = 'This week we read';
export const NEXT_DESC = '当前查经包，随时打开 · The current study pack, ready to open';
export const NEXT_OPEN_CTA = '打开查经包 Open the pack';
export const NEXT_SIGNUP_CTA = '扫码报名 Sign up';
export const NEXT_SIGNUP_CLOSE = '收起 Close';
export const NEXT_SIGNUP_LINK = '或点此打开报名页 · or open the sign-up page';
/** Rendered instead of the pack when it cannot be loaded (no error noise). */
export const NEXT_NONE_YET = '暂无 · none yet';
export const NEXT_LOADING = '载入中 · loading';

/* ---- 真实的数字 Honest numbers ---- */
export const NUMBERS_EYEBROW = '完整圣经 · The whole Bible';
export const NUMBERS_HEADING_ZH = '随时可用';
export const NUMBERS_HEADING_EN = 'Ready anywhere';
export const NUMBERS_DESC = '和合本与 BSB 已内置，离线也能查经 · 和合本 and BSB are built in; study works offline';
/**
 * 31,100: verses in the bundled 和合本 (public/bible-data/cuv, 1,189
 * chapters), produced by scripts/fetch-bible-data.mjs; BSB has 31,086.
 * LandingNumbers.test.tsx re-counts the bundled data and pins this label.
 */
export const VERSE_COUNT_LABEL = '31,100+';
export const BOOK_COUNT = 66;
export const OFFLINE_FIGURE = '离线';
export const HONEST_NUMBERS = [
  { value: String(BOOK_COUNT), zh: '卷', en: 'books' },
  { value: VERSE_COUNT_LABEL, zh: '节', en: 'verses' },
  { value: '2', zh: '译本', en: 'translations', note: '和合本 · BSB' },
  { value: OFFLINE_FIGURE, zh: '可用', en: 'works offline', note: '大屏与经文不需网络 · TV mode and verses need no network' },
] as const;
