/**
 * tvHints.ts — user-facing strings for TV presentation mode · 提示文案
 *
 * Single source (R3): the views render these and the unit + e2e tests
 * import them, so on-screen text can never drift from what the tests pin.
 * Pure module (no React) so Playwright specs can import it. All strings
 * are Chinese-first (ADR-0003 §1).
 */
import { bilingual } from './principles';

/** First-slide navigation hint: arrows / swipe, select-to-ask, A, Esc. */
export const FIRST_SLIDE_HINT =
  '← → 或滑动翻页 · Arrow keys or swipe · 选中文字或按 A 问AI · Select text or press A to ask AI · Esc 退出';

/** Compact first-slide hint for phone-sized viewports. */
export const FIRST_SLIDE_HINT_SHORT = '← → / 滑动 · swipe · 选中文字问AI';

/** The Ask-AI button / panel title. */
export const ASK_AI_LABEL = bilingual('问AI', 'Ask AI');

/** Ask-AI input placeholder. */
export const ASK_INPUT_PLACEHOLDER = bilingual('对这段经文提问…', 'Ask about this passage…');

/** Ask-AI submit button. */
export const ASK_SUBMIT_LABEL = bilingual('提问', 'Ask');

/** Shown while a pack or a verse popup chapter is loading. */
export const TV_LOADING = bilingual('加载中…', 'Loading…');

/** Shown while the AI is thinking (before the first streamed token). */
export const TV_THINKING = bilingual('思考中…', 'Thinking…');

/** Verse popup failure line (bundled chapter could not be loaded). */
export const VERSE_LOAD_ERROR = bilingual('无法加载', 'could not load');
