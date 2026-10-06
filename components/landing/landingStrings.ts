/**
 * landingStrings.ts — every user-visible landing string · 首页文案
 *
 * Single source (R3): components render these, tests import them. Follows
 * ADR-0003: Chinese first, English second, on every bilingual line; only
 * the brand wordmark "Scripture to Life" stays first. Lines marked
 * NEW COPY arrived with the 2026-10 "醒目 Bold" redesign (approved mockup).
 */

export const BRAND_EN = 'Scripture to Life';
export const BRAND_ZH = '活出神的话';
/** The highlighted (gold gradient) tail of the headline: 活出|神的话. */
export const BRAND_ZH_LEAD = BRAND_ZH.slice(0, 2);
export const BRAND_ZH_HIGHLIGHT = BRAND_ZH.slice(2);
export const SITE_LINE = 'Scripture to Life · scripturetolife.org';
/** Accessible name of the member pages' brand link home (shared/PaperHeader.tsx). */
export const HOME_LINK_LABEL = '返回首页 · Home';

export const HERO_SUB_ZH = 'AI 查经不止于明白——它陪你走进一周的生活。';
export const HERO_SUB_EN =
  'AI-powered Bible study that doesn’t stop at understanding — it follows you into the week.';
/** NEW COPY: hero eyebrow. */
export const HERO_EYEBROW = 'AI 查经 · AI Bible study';

export const GROUP_TITLE_ZH = '小组查经';
export const GROUP_TITLE_EN = 'Group Bible Study';
export const GROUP_CTA = '看示范 See a sample pack';
export const GROUP_POINTS = {
  deck: { zh: '讲义变成大屏简报', en: 'Your study guide becomes a TV-ready deck' },
  question: { zh: '讨论题目，一题一页', en: 'Discussion questions, one per slide' },
  checkin: { zh: '周中提醒，把神的话带进一周', en: 'Mid-week check-ins that keep the Word in the week' },
} as const;

export const PERSONAL_TITLE_ZH = '个人研经';
export const PERSONAL_TITLE_EN = 'Personal Study';
export const PERSONAL_CTA = '进入应用 Open the app';
export const PERSONAL_POINTS = [
  { zh: '和合本 | BSB 双语对照', en: 'Bilingual Bible, side by side' },
  { zh: '手写笔记，为 iPad 与 Pencil 而设', en: 'Handwriting notes, built for iPad and Pencil' },
  { zh: 'AI 研经，任何经节或字词', en: 'AI research on any verse or word' },
] as const;

/** The three-step loop: hero line, the 01/02/03 cards and the footer. */
export const LOOP_STEPS = [
  { zh: '明白神的话', en: 'Understand the Word', line: PERSONAL_POINTS[2] },
  { zh: '活出神的话', en: 'Live the Word', line: GROUP_POINTS.checkin },
  // NEW COPY: the live site had no one-liner for Flourish.
  { zh: '生命兴盛', en: 'Flourish', line: { zh: '一周又一周，生命被神的话塑造', en: 'Week after week, a life shaped by the Word' } },
] as const;

export const LOOP_LINE_ZH = LOOP_STEPS.map(s => s.zh).join(' → ');
export const LOOP_LINE_EN = LOOP_STEPS.map(s => s.en).join(' → ');
/** NEW COPY: the loop section's eyebrow and heading. */
export const LOOP_EYEBROW = '一个循环 · The loop';
export const LOOP_HEADING_ZH = '明白，活出，兴盛';
export const LOOP_HEADING_EN = 'Understand → Live → Flourish';

/** Third door: the leader generates a pack from a passage (#/new). */
export const NEW_STUDY_LINE = '新建查经 New study';
export const NEW_STUDY_SUB = '输入经文，AI 生成查经包，大屏演示 · Enter a passage; a study pack is drafted in your browser';

export const LEADER_ZH = '组长：上传查经讲义，变成大屏简报。';
export const LEADER_EN =
  'Group leaders: bring your study guide PDF — it becomes a presentation with an AI helper.';

/* ---- 小组查经 Group band: how a Friday works ---- */
/** NEW COPY: eyebrow, the heading's English tail, the "when" labels and the QR button. */
export const GROUP_EYEBROW = '小组查经 · Group study';
export const GROUP_HEADING_EN = `${GROUP_TITLE_EN} — how a Friday works`;
export const GROUP_QR_CTA = '扫码报名 QR sign-up';
/**
 * The three photos (Unsplash License, downloaded to public/landing/ as
 * 1200px WebP). width/height are the files' intrinsic size.
 *   group.webp — Nicolas Lobos, unsplash.com/photos/qbazkeo-R1o
 *   tv.webp    — Clay Banks, unsplash.com/photos/XwgC9tsm7jU
 *   phone.webp — Nathan Dumlao, unsplash.com/photos/y440_q4e-0E
 */
export const GROUP_PHOTOS = [
  {
    file: 'group.webp', width: 1200, height: 675, when: '周五 晚上 · Friday evening', caption: GROUP_POINTS.question,
    alt: '几个人围着木桌，桌上摊开圣经和荧光笔 · A small group around a wooden table with an open Bible and highlighters',
  },
  {
    file: 'tv.webp', width: 1200, height: 800, when: '客厅大屏 · On the TV', caption: GROUP_POINTS.deck,
    alt: '客厅里的电视与壁炉 · A living room with a TV above the fireplace',
  },
  {
    file: 'phone.webp', width: 1200, height: 1800, when: '周二 · 周四 · Tue / Thu', caption: GROUP_POINTS.checkin,
    alt: '一双手拿着手机，下面是手写笔记 · Hands holding a phone over handwritten notes',
  },
] as const;
/** Footer credit for the three photos (NEW COPY). */
export const PHOTO_CREDIT = '照片 Photos: Nicolas Lobos · Clay Banks · Nathan Dumlao · Unsplash';

/* ---- 个人研经 Personal ---- */
/** NEW COPY: eyebrow and the side-by-side verse card's note. */
export const PERSONAL_EYEBROW = '个人研经 · Personal study';
export const PERSONAL_VERSE_REF = { zh: '马太福音 6:34', en: 'Matthew 6:34' } as const;
export const PERSONAL_VERSE_NOTE = '双语对照，离线可读 · side by side, readable offline';

/* ---- sticky top nav: two scroll links ---- */
/* Section element ids — the nav scrolls to these; components set them from the same constants (R3). */
export const GROUP_SECTION_ID = 'group' as const;
export const PERSONAL_SECTION_ID = 'personal' as const;
export const NEXT_SECTION_ID = 'next' as const;
export const NAV_LINKS = [
  { id: GROUP_SECTION_ID, zh: GROUP_TITLE_ZH, en: 'Group' },
  { id: PERSONAL_SECTION_ID, zh: PERSONAL_TITLE_ZH, en: 'Personal' },
] as const;
export type NavSectionId = (typeof NAV_LINKS)[number]['id'] | typeof NEXT_SECTION_ID;
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
/** NEW COPY: the key verse shown beside the sample pack (Matthew 6). */
export const NEXT_VERSE_REF = { zh: '马太福音 6:33', en: 'Matthew 6:33' } as const;

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
