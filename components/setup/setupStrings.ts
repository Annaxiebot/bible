/**
 * setupStrings.ts — every user-visible string of the quick AI setup · 设置AI文案
 *
 * Single source (R3): the component renders these, unit + e2e tests import
 * them. Chinese first, English second (ADR-0003 §1). Pure module (no React)
 * so Playwright specs can import it. Lines shared with the TV overlay come
 * from tvHints.ts.
 */
import { bilingual, bilingualLine } from '../studypack/principles';
import { AI_SIGN_IN_NEEDED } from '../studypack/tvHints';
import type { AIRole } from '../../supabase/functions/ai-proxy/policy';
import { PERSONAL_TITLE_ZH, PERSONAL_TITLE_EN } from '../landing/landingStrings';

/** ADR-0003 §15 floors: inputs/buttons ≥ 20px type, ≥ 48px tap targets (shared by setup, new study, sign-up; e2e asserts them). */
export const SETUP_MIN_FONT_PX = 20;
export const SETUP_MIN_TAP_PX = 48;

/** The AI page / dialog title: a status page since hosted AI (ADR-0007); the route stays #/setup. */
export const SETUP_TITLE = bilingual('AI 服务', 'AI service');

/** The button on an Ask-AI error line that opens the AI form (sign in, or see this month's usage). */
export const SETUP_OPEN_BUTTON = bilingual('设置AI', 'Set up AI');

// ---- Status (primary content, ADR-0007) · AI 状态 ---------------------------

/** Signed in: the site's AI answers. */
export const SETUP_HOSTED_READY = bilingualLine('已登录 · AI 已就绪（由本站提供）', 'Signed in · AI ready (provided by this site)');
/** Signed out: the prompt above the sign-in choices. */
export const SETUP_SIGN_IN_TO_USE_AI = AI_SIGN_IN_NEEDED;

/** Usage labels, Chinese only after the bilingual "本月 This month:" prefix — except the personal app's, named as on the landing page. */
export const SETUP_USAGE_PREFIX = bilingual('本月', 'This month');
export const USAGE_ROLE_LABEL: Readonly<Record<AIRole, string>> = {
  ask: '提问', pack: '查经包', adjust: '调整', sharing: '分享', study: bilingual(PERSONAL_TITLE_ZH, PERSONAL_TITLE_EN), pick: '选经文',
};
export interface UsageEntry { role: AIRole; count: number; limit: number }
/** "本月 This month: 提问 12/300 · 查经包 1/10 · 个人研经 Personal Study 3/100" */
export function usageLine(entries: readonly UsageEntry[]): string {
  return `${SETUP_USAGE_PREFIX}: ${entries.map(e => `${USAGE_ROLE_LABEL[e.role]} ${e.count}/${e.limit}`).join(' · ')}`;
}
/** Prefix of the red line when the usage read failed; the server message follows. */
export const SETUP_USAGE_FAILED = bilingualLine('无法读取本月用量', "could not read this month's usage");

/**
 * Personal app (#app) features that need a provider the hosted AI does not
 * serve (vision, web search, Gemini speech/voice): paused, never routed to
 * an old provider path (ADR-0007 "Personal app").
 */
export const PERSONAL_AI_UNAVAILABLE_NOTE = bilingualLine('图片、联网搜索、朗读暂不可用', 'images, web search and read-aloud are unavailable for now');
/** Beside a paused control (the sidebar's Voice Session). */
export const PERSONAL_AI_FEATURE_PAUSED = bilingual('暂不可用', 'Unavailable for now');

// ---- Signing out (leader home, the personal app's sync line) · 退出登录 ------
// The sign-in buttons' labels live with the sign-in choices (components/signin/signInStrings, R3).

export const SETUP_SIGN_OUT = bilingual('退出登录', 'Sign out');
/** Prefix of the red line when sign-out failed; the auth message follows. */
export const SETUP_SIGN_OUT_FAILED = bilingualLine('退出登录失败', 'sign-out failed');

export const SETUP_CANCEL = bilingual('取消', 'Cancel');
export const SETUP_CLOSE = bilingual('关闭', 'Close');
