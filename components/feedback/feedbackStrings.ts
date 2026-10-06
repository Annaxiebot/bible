/**
 * feedbackStrings.ts — every user-visible string of #/feedback · 意见反馈文案 (ADR-0011)
 *
 * Single source (R3); Chinese first (ADR-0003 §1). Pure, so the e2e spec
 * imports it. The page title / link text is FEEDBACK_LABEL (shared with the
 * emails, supabase/functions/_shared/feedback.ts).
 */
import { bilingual, bilingualLine } from '../studypack/principles';
import type { FeedbackProblem } from '../../supabase/functions/_shared/feedback';
import { FEEDBACK_MAX_CHARS } from '../../supabase/functions/_shared/feedback';

export const FB_MESSAGE_LABEL = bilingualLine('想对我们说什么？', 'What would you like to tell us?');
export const FB_EMAIL_LABEL = '想收到回复请留邮箱（可选）· Your email if you\'d like a reply (optional)';
export const FB_SEND = bilingual('发送', 'Send');
export const FB_SENDING = bilingual('发送中…', 'Sending…');
export const FB_THANKS = bilingualLine('谢谢！我们会认真阅读', 'Thank you — we read every message');

/** Every way a send can fail, each with its own line. */
export type FeedbackFailure = FeedbackProblem | 'rate-limited' | 'server' | 'network' | 'not-configured';

export const FB_ERRORS: Record<FeedbackFailure, string> = {
  'message-empty': bilingualLine('请先写下你的意见', 'Please write a message first'),
  'message-long': bilingualLine(`最多 ${FEEDBACK_MAX_CHARS} 字`, `At most ${FEEDBACK_MAX_CHARS} characters`),
  'email-shape': bilingualLine('邮箱格式不对', 'That email does not look right'),
  'email-long': bilingualLine('邮箱太长', 'That email is too long'),
  honeypot: bilingualLine('无法发送', 'Could not send'),
  'rate-limited': bilingualLine('发送太频繁，请一小时后再试', 'Too many messages — please try again in an hour'),
  server: bilingualLine('服务器出错，请稍后再试', 'Server error — please try again later'),
  network: bilingualLine('网络连接失败，请稍后再试', 'Network error — please try again later'),
  'not-configured': bilingualLine('反馈服务未配置', 'The feedback service is not configured'),
};
