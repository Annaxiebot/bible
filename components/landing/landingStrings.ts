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

export const LEADER_ZH = '組長：上傳查經講義，變成大屏簡報。';
export const LEADER_EN =
  'Group leaders: bring your study guide PDF — it becomes a presentation with an AI helper.';
