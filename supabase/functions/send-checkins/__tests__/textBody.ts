/**
 * textBody.ts — test helper: an email text part without its site line · 测试辅助
 *
 * Every email's text part ends with a blank line + SITE_FOOTER_LINE
 * ("Scripture to Life · scripturetolife.org"); SMS never does. bodyLines
 * asserts that ending and returns the lines before it, so the layout tests
 * keep checking the message body itself.
 */
import { expect } from 'vitest';
import { SITE_FOOTER_LINE } from '../templates.ts';

export function bodyLines(text: string): string[] {
  const lines = text.split('\n');
  expect(lines.slice(-2)).toEqual(['', SITE_FOOTER_LINE]);
  return lines.slice(0, -2);
}
