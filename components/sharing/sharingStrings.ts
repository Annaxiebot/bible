/**
 * sharingStrings.ts — user-facing lines of "last week's sharing" · 上周操练分享文案
 *
 * Single source (R3) for the section heading, the app-owned practice-count
 * line and the editor control's labels / typed failure lines (ADR-0008).
 * Pure module (no React) so the unit and Playwright tests import the same
 * text. Chinese first (ADR-0003 §1); app-owned lines are bilingual in every
 * content-language mode.
 */
import { bilingualLine } from '../studypack/principles';

/** The section heading on the editor and the TV slide. */
export const SHARING_HEADING = bilingualLine('上周操练分享', "Last week's sharing");

/** Lead of the practice-count line ("上周大家选择的操练 · Practices chosen last week: 健康 Health 3, 家庭 Family 2"). */
export const SHARING_PRACTICES_LEAD = bilingualLine('上周大家选择的操练', 'Practices chosen last week');

export interface PracticeCount { area: string; count: number }

/** The app-owned count line; areas keep their stored "中文 English" labels. */
export function practiceCountLine(practices: readonly PracticeCount[]): string {
  return `${SHARING_PRACTICES_LEAD}: ${practices.map(p => `${p.area} ${p.count}`).join(', ')}`;
}

/** Quotes are set off with 「」 on the slide (TVSlide renders them quieter). */
export const QUOTE_OPEN = '「';
export const QUOTE_CLOSE = '」';
export function quoteLine(text: string): string {
  return `${QUOTE_OPEN}${text}${QUOTE_CLOSE}`;
}
export function isQuoteLine(line: string): boolean {
  return line.startsWith(QUOTE_OPEN) && line.endsWith(QUOTE_CLOSE);
}

/** Stand-in for a name, email or phone number removed before anything is sent to the AI. */
export const SCRUBBED = '（…）';

// ---- Editor control · 编辑器控件 ----

export const SH_PREPARE = bilingualLine('生成上周分享', "Prepare last week's sharing");
export const SH_PREVIOUS_LABEL = bilingualLine('上一次查经', 'Previous study');
export const SH_HINT = bilingualLine(
  '只用组员选择“分享给组长”的回答；姓名、电话、邮箱不会发给AI。生成后请先审阅再放映。',
  'Uses only answers members chose to share with you; names, phones and emails are never sent to the AI. Review it before presenting.',
);
export const SH_LOADING = bilingualLine('正在读取上周的报名与分享…', "Reading last week's sign-ups and shared answers…");
export const SH_DRAFTING = bilingualLine('AI 正在整理分享…', 'The AI is drafting the summary…');
export const SH_DONE = bilingualLine('已加在标题之后，请审阅修改', 'Added after the title — review and edit it');
export const SH_DONE_COUNTS_ONLY = bilingualLine(
  '上周没有组员分享回答，只加入了操练人数（未使用AI）',
  'No member shared an answer last week, so only the practice counts were added (no AI used)',
);
export const SH_NO_PREVIOUS = bilingualLine('还没有更早的查经包', 'No earlier study yet');
export const SH_SIGN_IN = bilingualLine('请先登录，才能读取组员的分享', "Sign in to read your members' sharing");
export const SH_ERR_NOTHING = bilingualLine('上一次查经没有报名，也没有分享', 'The previous study has no sign-ups and no shared answers');
export const SH_ERR_LOAD = bilingualLine('读取上周分享失败', "Could not load last week's sharing");
export const SH_ERR_INVALID = bilingualLine('AI 返回的格式不对（已重试一次）', 'The AI reply was not in the expected format (retried once)');
export const SH_ERR_UNCONFIGURED = bilingualLine('此版本未连接数据库', 'This build has no database connection');
