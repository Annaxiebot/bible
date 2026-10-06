/**
 * textBody.ts — test helper: an email text part without its site line · 测试辅助
 *
 * Every email's text part ends with a blank line, the feedback line
 * ("意见反馈 · Feedback: <feedback page, from=email>", ADR-0011) and
 * SITE_FOOTER_LINE ("Scripture to Life · scripturetolife.org"); SMS never
 * does. bodyLines asserts that ending and returns the lines before it, so
 * the layout tests keep checking the message body itself.
 */
import { expect } from 'vitest';
import { SITE_FOOTER_LINE, SITE_ORIGIN } from '../templates.ts';
import { FEEDBACK_LABEL, FEEDBACK_HASH } from '../../_shared/feedback.ts';

const FEEDBACK_PREFIX = `${FEEDBACK_LABEL}: ${SITE_ORIGIN}/${FEEDBACK_HASH}?from=email&pack=`;

export function bodyLines(text: string): string[] {
  const lines = text.split('\n');
  expect(lines[lines.length - 3]).toBe('');
  expect(lines[lines.length - 2].startsWith(FEEDBACK_PREFIX)).toBe(true);
  expect(lines[lines.length - 1]).toBe(SITE_FOOTER_LINE);
  return lines.slice(0, -3);
}
