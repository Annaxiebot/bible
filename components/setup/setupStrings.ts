/**
 * setupStrings.ts — every user-visible string of the quick AI setup · 设置AI文案
 *
 * Single source (R3): the component renders these, unit + e2e tests import
 * them. Chinese first, English second (ADR-0003 §1). Pure module (no React)
 * so Playwright specs can import it. Lines shared with the TV overlay
 * (invalid key, model unavailable, "模型 Model:") come from tvHints.ts.
 */
import { bilingual, bilingualLine } from '../studypack/principles';
import { AI_INVALID_KEY_MESSAGE, AI_SIGN_IN_NEEDED } from '../studypack/tvHints';
import type { AIRole } from '../../supabase/functions/ai-proxy/policy';

/** ADR-0003 §15 floors: inputs/buttons ≥ 20px type, ≥ 48px tap targets (shared by setup, new study, sign-up; e2e asserts them). */
export const SETUP_MIN_FONT_PX = 20;
export const SETUP_MIN_TAP_PX = 48;

/** The AI page / dialog title: a status page since hosted AI (ADR-0007); the route stays #/setup. */
export const SETUP_TITLE = bilingual('AI 服务', 'AI service');

/** The button on an Ask-AI error line that opens the AI form (sign in, or fix a stored key/model). */
export const SETUP_OPEN_BUTTON = bilingual('设置AI', 'Set up AI');

// ---- Status (primary content, ADR-0007) · AI 状态 ---------------------------

/** Signed in, no own key: the site's AI answers. */
export const SETUP_HOSTED_READY = bilingualLine('已登录 · AI 已就绪（由本站提供）', 'Signed in · AI ready (provided by this site)');
/** Signed out, no own key: the prompt above the Google button (never "or paste a key"). */
export const SETUP_SIGN_IN_TO_USE_AI = AI_SIGN_IN_NEEDED;

/** Usage labels, Chinese only after the bilingual "本月 This month:" prefix. */
export const SETUP_USAGE_PREFIX = bilingual('本月', 'This month');
export const USAGE_ROLE_LABEL: Readonly<Record<AIRole, string>> = {
  ask: '提问', pack: '查经包', adjust: '调整', sharing: '分享',
};
export interface UsageEntry { role: AIRole; count: number; limit: number }
/** "本月 This month: 提问 12/300 · 查经包 1/10" */
export function usageLine(entries: readonly UsageEntry[]): string {
  return `${SETUP_USAGE_PREFIX}: ${entries.map(e => `${USAGE_ROLE_LABEL[e.role]} ${e.count}/${e.limit}`).join(' · ')}`;
}
/** Prefix of the red line when the usage read failed; the server message follows. */
export const SETUP_USAGE_FAILED = bilingualLine('无法读取本月用量', "could not read this month's usage");

/** The low-emphasis toggle at the bottom of the AI page: the only way into the own-key path. */
export const SETUP_OWN_KEY_TOGGLE = bilingualLine('高级：使用自己的 OpenRouter 密钥', 'Advanced: use your own OpenRouter key');

export const SETUP_EXPLANATION =
  '粘贴 OpenRouter 密钥即可，默认使用低成本可靠模型（约一分钱十次提问）· ' +
  'Paste your OpenRouter key; a low-cost reliable model is used by default (about a cent per ten questions)';

export const SETUP_KEY_LABEL = bilingual('OpenRouter 密钥', 'OpenRouter key');
export const SETUP_KEY_PLACEHOLDER = 'sk-or-…';

export const SETUP_SHOW_KEY = bilingual('显示', 'Show');
export const SETUP_HIDE_KEY = bilingual('隐藏', 'Hide');

export const SETUP_GET_KEY = bilingual('获取密钥', 'Get a key');

// ---- Saved state (a key is already stored) · 已保存状态 ----------------------

/** Masked display of a stored key: the placeholder prefix + its last 4 characters, never the whole key. */
export const SETUP_MASK_VISIBLE_CHARS = 4;
export function maskApiKey(key: string): string {
  return `${SETUP_KEY_PLACEHOLDER}${key.slice(-SETUP_MASK_VISIBLE_CHARS)}`;
}

/** "已保存密钥 sk-or-…abcd · Key saved" */
export function savedKeyLine(maskedKey: string): string {
  return bilingualLine(`已保存密钥 ${maskedKey}`, 'Key saved');
}

export const SETUP_REPLACE = bilingual('更换', 'Replace');

// ---- Models block (saved state): three configurable roles · 模型 ----------

export const SETUP_MODELS_TITLE = bilingual('模型', 'Models');
export const SETUP_MODEL_ASK = bilingual('问一问', 'Ask AI');
export const SETUP_MODEL_PACK = bilingual('新建查经', 'Pack generation');
export const SETUP_MODEL_FALLBACKS = bilingual('备用', 'Fallbacks');
/** Per-row reset to the shipped default (services/aiDefaults constants). */
export const SETUP_MODEL_RECOMMENDED = bilingual('推荐', 'Recommended');
/** Accessible name of a row's reset button: "推荐 Recommended · 问一问 Ask AI". */
export function recommendedFor(rowLabel: string): string {
  return bilingualLine(SETUP_MODEL_RECOMMENDED, rowLabel);
}

// ---- Sync line (under the Models block) · 同步设置 --------------------------
// The sign-in button label is SU_SIGN_IN_GOOGLE / SU_SIGNING_IN (signupStrings, R3).

export const SETUP_SYNC_SIGNED_OUT = bilingual('登录以在各设备同步设置', 'Sign in to sync settings across devices');
/** "已登录 Signed in · 设置已同步 settings synced" — the email follows on the same line. */
export const SETUP_SYNC_SIGNED_IN = bilingualLine(bilingual('已登录', 'Signed in'), bilingual('设置已同步', 'settings synced'));
export const SETUP_SIGN_OUT = bilingual('退出登录', 'Sign out');
/** Prefix of the red line when a pull/push failed; the server message follows. */
export const SETUP_SYNC_FAILED = bilingualLine('设置同步失败', 'settings sync failed');
/** Prefix of the red line when sign-out failed; the auth message follows. */
export const SETUP_SIGN_OUT_FAILED = bilingualLine('退出登录失败', 'sign-out failed');

// ---- Test outcomes · 测试结果 ----------------------------------------------

export const SETUP_TEST = bilingual('测试', 'Test');
export const SETUP_TESTING = bilingual('测试中…', 'Testing…');
export const SETUP_TEST_OK = bilingualLine('密钥有效', 'Key works');
export const SETUP_TEST_INVALID = AI_INVALID_KEY_MESSAGE;
export const SETUP_TEST_NO_CREDITS = bilingualLine('余额不足', 'no credits');
export const SETUP_TEST_ERROR = bilingualLine('测试失败', 'test failed');

export const SETUP_SAVE = bilingual('保存', 'Save');
export const SETUP_CANCEL = bilingual('取消', 'Cancel');
export const SETUP_CLOSE = bilingual('关闭', 'Close');

/** Shown in the field's error slot when Save/Test is pressed with nothing pasted and nothing stored. */
export const SETUP_EMPTY_KEY = bilingual('请先粘贴密钥', 'Paste a key first');
