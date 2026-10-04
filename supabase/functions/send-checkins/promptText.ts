/**
 * promptText.ts — a check-in prompt without a repeated kind label · 跟进问题去重
 *
 * Single source (R3) for the check-in page (components/checkin) and the
 * email template (templates.renderCheckin). Pure, no imports, so both
 * runtimes load it. The kind is already named once (the page's small
 * heading, the email's subject), but a pack's reflection line often starts
 * with it again — sometimes twice, e.g. the pack assembler's
 * "周末回顾：" + the AI's "周末:" — so each bilingual half drops every
 * leading label followed by a colon (":" or "："). A half that would be
 * left empty is kept as it was.
 */

const SEPARATOR = ' · ';

/** "周二跟进：", "周四：", "周末回顾：", "周末:" … (only when a colon follows). */
const ZH_LABEL = /^\s*周[二四末](?:跟进|回顾)?\s*[:：]\s*/;
/** "Tuesday check-in:", "Thursday:", "Weekend reflection:", "Weekend:", "End of week:" … (only when a colon follows). */
const EN_LABEL = /^\s*(?:end of (?:the )?week|weekend(?: reflection| check-in)?|tue(?:sday)?(?: check-in)?|thu(?:rsday)?(?: check-in)?)\s*[:：]\s*/i;

function stripHalf(half: string): string {
  let text = half;
  for (;;) {
    const next = text.replace(ZH_LABEL, '').replace(EN_LABEL, '');
    if (next === text) break;
    text = next;
  }
  return text.trim() ? text : half;
}

/** The prompt line with any leading kind label removed from each half ("中文 · English"). */
export function promptWithoutKindLabel(line: string): string {
  return line.split(SEPARATOR).map(stripHalf).join(SEPARATOR);
}
