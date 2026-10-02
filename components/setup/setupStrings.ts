/**
 * setupStrings.ts — every user-visible string of the quick AI setup · 设置AI文案
 *
 * Single source (R3): the component renders these, unit + e2e tests import
 * them. Chinese first, English second (ADR-0003 §1). Pure module (no React)
 * so Playwright specs can import it. Lines shared with the TV overlay
 * (invalid key, model unavailable, "模型 Model:") come from tvHints.ts.
 */
import { bilingual, bilingualLine } from '../studypack/principles';
import { AI_INVALID_KEY_MESSAGE } from '../studypack/tvHints';

export const SETUP_TITLE = bilingual('设置AI', 'Set up AI');

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
export const SETUP_USE_RECOMMENDED = bilingual('使用推荐模型', 'Use recommended model');

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
