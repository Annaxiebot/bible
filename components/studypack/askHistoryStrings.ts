/**
 * askHistoryStrings.ts — every user-visible string of the saved Ask AI history · 问一问记录文案 (ADR-0021)
 *
 * One source (R3) for the TV panel (useAskHistory, AskHistoryNotice) and the
 * leader page section (LeaderAskHistory). Chinese first. Pure module so e2e
 * specs can import it.
 */
import { bilingual, bilingualLine } from './principles';
import { ASK_HISTORY_LIMIT } from './askHistoryRules';

// ---- TV panel ----
/** The notice under an answer when the study already holds the limit (ADR-0021 wording). */
export const AH_FULL_NOTICE = `${bilingualLine(`已存满 ${ASK_HISTORY_LIMIT} 条`, `${ASK_HISTORY_LIMIT} saved`)} — ${bilingualLine('以后替换最早的一条？', 'Replace the oldest from now on?')}`;
export const AH_REPLACE = bilingualLine('替换最早', 'Replace oldest');
export const AH_DONT_SAVE = bilingualLine('不保存', "Don't save");
export const AH_CLEAR = bilingualLine('清空', 'Clear');

// ---- failures (always shown, R5) ----
export const AH_ERR_LOAD = bilingualLine('读取问一问记录失败', 'Could not load the Ask AI history');
export const AH_ERR_SAVE = bilingualLine('这条问答未保存', 'This answer was not saved');
export const AH_ERR_TOO_LONG = bilingualLine('问答太长，无法保存', 'Too long to save');
export const AH_ERR_DELETE = bilingualLine('删除失败', 'Could not delete');
export const AH_ERR_SETTING = bilingualLine('更新替换设置失败', 'Could not change the replace setting');

// ---- leader page #/leader/<id> ----
export const AH_TITLE = bilingualLine('问一问记录', 'Ask AI history');
export const AH_HINT = bilingualLine('只有你能看到', 'Only you can see these');
export const AH_NONE = bilingualLine('还没有保存的问答', 'No saved questions yet');
export const AH_LOADING = bilingualLine('读取中', 'Loading');
export const AH_DELETE = bilingual('删除', 'Delete');
export const AH_DELETE_CONFIRM = bilingualLine('删除这条问答？', 'Delete this question and answer?');
export const AH_DELETE_ALL = bilingualLine('全部删除', 'Delete all');
export const AH_DELETE_ALL_CONFIRM = bilingualLine('删除本查经的全部问一问记录？', "Delete all of this study's Ask AI history?");
export const AH_REPLACE_ON = bilingualLine(
  `已存满 ${ASK_HISTORY_LIMIT} 条时，新问答替换最早的一条`, `With ${ASK_HISTORY_LIMIT} saved, each new answer replaces the oldest`,
);
export const AH_REPLACE_STOP = bilingualLine('停止替换', 'Stop replacing');

/** "12/20" next to the section heading. */
export function historyCountLine(n: number): string {
  return `${n}/${ASK_HISTORY_LIMIT}`;
}
