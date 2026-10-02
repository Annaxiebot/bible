/**
 * setupStrings.ts — every user-visible string of the quick AI setup · 设置AI文案
 *
 * Single source (R3): the component renders these, unit + e2e tests import
 * them. Chinese first, English second (ADR-0003 §1). Pure module (no React)
 * so Playwright specs can import it.
 */
import { bilingual } from '../studypack/principles';

export const SETUP_TITLE = bilingual('设置AI', 'Set up AI');

export const SETUP_EXPLANATION =
  '粘贴 OpenRouter 密钥即可，默认使用免费模型 · Paste your OpenRouter key; free models are used by default';

export const SETUP_KEY_LABEL = bilingual('OpenRouter 密钥', 'OpenRouter key');
export const SETUP_KEY_PLACEHOLDER = 'sk-or-…';

export const SETUP_SHOW_KEY = bilingual('显示', 'Show');
export const SETUP_HIDE_KEY = bilingual('隐藏', 'Hide');

export const SETUP_GET_KEY = bilingual('获取密钥', 'Get a key');

export const SETUP_TEST = bilingual('测试', 'Test');
export const SETUP_TESTING = bilingual('测试中…', 'Testing…');
export const SETUP_TEST_OK = bilingual('密钥可用', 'Key works');
export const SETUP_TEST_FAILED = bilingual('密钥无效', 'Key did not work');

export const SETUP_SAVE = bilingual('保存', 'Save');
export const SETUP_CANCEL = bilingual('取消', 'Cancel');
export const SETUP_CLOSE = bilingual('关闭', 'Close');

/** Shown in the field's error slot when Save is pressed with nothing pasted. */
export const SETUP_EMPTY_KEY = bilingual('请先粘贴密钥', 'Paste a key first');
