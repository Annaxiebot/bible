/**
 * tvHints.ts — user-facing strings for TV presentation mode · 提示文案
 *
 * Single source (R3): the views render these and the unit + e2e tests
 * import them, so on-screen text can never drift from what the tests pin.
 * Pure module (no React) so Playwright specs can import it. All strings
 * are Chinese-first (ADR-0003 §1).
 */
import { bilingual, bilingualLine } from './principles';

/** First-slide navigation hint: arrows / swipe, select-to-ask, A, Esc. */
export const FIRST_SLIDE_HINT =
  '← → 或滑动翻页 · Arrow keys or swipe · 选中文字或按 A 问一问 · Select text or press A to ask AI · Esc 退出';

/** Compact first-slide hint for phone-sized viewports. */
export const FIRST_SLIDE_HINT_SHORT = '← → / 滑动 · swipe · 选中文字问一问';

/** One-time TV hint where the browser can go full screen (key F toggles it). */
export const FULLSCREEN_HINT = bilingualLine('按 F 全屏', 'Press F for full screen');

/** The same hint on a phone with no full-screen API (iPhone Safari), held upright. */
export const SIDEWAYS_HINT = bilingualLine('横屏观看更佳', 'Turn the phone sideways');

/** The Ask-AI button / panel title. */
export const ASK_AI_LABEL = bilingual('问一问', 'Ask AI');

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

/** After a reference the AI cited that does not exist (citations.ts): shown as plain text + this mark, no popover. */
export const NO_SUCH_VERSE_MARK = `（${bilingualLine('经文不存在', 'no such verse')}）`;

/** CC BY credit for the cross-references Ask AI draws related verses from (ADR-0015; shown while the switch is on). */
export const RELATED_VERSES_CREDIT = bilingualLine('相关经文：OpenBible.info（CC BY）', 'Related verses: OpenBible.info (CC BY)');

/** CC BY 4.0 credit for the original-language word data (ADR-0018; shown while that switch is on). */
export const STEP_BIBLE_NAME = 'STEP Bible';
export const STEP_BIBLE_URL = 'https://www.STEPBible.org';
export const ORIGINAL_WORDS_CREDIT = bilingualLine(`原文词汇：${STEP_BIBLE_NAME}（CC BY）`, `Original words: ${STEP_BIBLE_NAME} (CC BY)`);

/** Heading of the TV "verses cited" block under the latest Ask-AI answer. */
export const VERSES_CITED_HEADING = bilingualLine('引用经文', 'Verses cited');

// ---- Ask-AI model + failure lines · 问AI模型与失败提示 -------------------

/** "模型 Model: <id>" — shared by the overlay footer and the setup dialog. */
export const MODEL_LABEL = bilingual('模型', 'Model');
export function modelLine(modelId: string): string {
  return `${MODEL_LABEL}: ${modelId}`;
}

/** Thinking line naming the model, so a stuck state is identifiable. */
export function thinkingLine(modelId: string): string {
  return `${TV_THINKING} (${modelId})`;
}

/** Retry button after a recoverable failure. */
export const TV_RETRY = bilingual('重试', 'Retry');

// ---- Hosted AI (ADR-0007): no own key, the site's proxy answers · 本站AI ----

/** No own key and not signed in: signing in is all it takes (never "or paste a key"). Rendered with the AI button. */
export const AI_SIGN_IN_NEEDED = bilingualLine('登录即可使用AI', 'Sign in to use AI');

/** Proxy 429 { error: 'quota' }: this leader's monthly allowance for the role is spent. */
export function quotaLine(limit: number): string {
  return bilingualLine(`本月AI次数已用完（${limit}次）`, `this month's AI limit is reached (${limit})`);
}

/** Proxy 402 { error: 'no-credit' }: the site's OpenRouter credit is spent (a hard cap). */
export const AI_CREDIT_USED_UP = bilingualLine('AI 额度已用完，请联系管理员', 'AI credit used up, contact the admin');

/** Proxy 503 (kill switch, key missing or rejected): the site's AI is off for now. */
export const AI_SERVICE_PAUSED = bilingualLine('本站AI暂停服务，请稍后再试', "the site's AI is paused — try again later");

/**
 * The ONLY own-key hint outside the AI service page (owner decision): added,
 * as a link to that page, after AI_CREDIT_USED_UP and AI_SERVICE_PAUSED.
 */
export const AI_OWN_KEY_ON_STATUS_PAGE = bilingualLine('或在 AI 服务页使用自己的密钥', 'or use your own key on the AI service page');

/** OpenRouter 402: the chosen model needs credits. Rendered with a Set up AI button. */
export const AI_CREDITS_MESSAGE =
  '所选模型需要付费额度 — 请在“设置AI”改用免费模型，或为 OpenRouter 充值。 ' +
  'The chosen model needs OpenRouter credits — open Set up AI to use the free models, or add credits.';

/** OpenRouter 401/403. Rendered with a Set up AI button. */
export const AI_INVALID_KEY_MESSAGE = bilingualLine('密钥无效', 'invalid key');

/** OpenRouter 400/404: the model id is unknown or not routable. */
export const AI_MODEL_UNAVAILABLE = bilingualLine('模型不可用', 'model unavailable');
export function modelUnavailableLine(modelId: string): string {
  return `${AI_MODEL_UNAVAILABLE}: ${modelId}`;
}

/** Any other non-OK HTTP reply: status + OpenRouter's own message. */
export const AI_REQUEST_FAILED = bilingualLine('请求失败', 'request failed');
export function httpDetail(status: number, apiMessage: string): string {
  return apiMessage ? `HTTP ${status}: ${apiMessage}` : `HTTP ${status}`;
}

/** An error event OpenRouter sent inside an otherwise-OK stream. */
export const AI_STREAM_ERROR = bilingualLine('AI 返回错误', 'AI returned an error');
export function streamErrorLine(message: string, code: string | number | undefined): string {
  return `${AI_STREAM_ERROR}${code !== undefined ? ` (${code})` : ''}: ${message}`;
}

/** No first token within the budget. */
export const AI_TIMEOUT = bilingualLine('AI 没有回应', 'no reply from the AI');
export function timeoutLine(modelId: string, ms: number): string {
  return `${AI_TIMEOUT} (${Math.round(ms / 1000)}s) · ${modelLine(modelId)}`;
}

/** Could not reach OpenRouter at all (fetch threw). */
export const AI_NETWORK_ERROR = bilingualLine('无法连接 OpenRouter', 'could not reach OpenRouter');

/** The stream ended with no content at all (after the automatic retries). */
export const AI_EMPTY = bilingualLine('AI未返回内容', 'empty response from AI');
/** finish_reason "length" with reasoning but no content. */
export const AI_BUDGET_SPENT = bilingualLine('模型用尽了思考预算', 'the model spent its budget reasoning');
/** finish_reason "content_filter". */
export const AI_FILTERED = bilingualLine('内容被模型过滤', 'the model filtered this content');
export function withModel(line: string, modelId: string): string {
  return `${line} · ${modelLine(modelId)}`;
}
