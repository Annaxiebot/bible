/**
 * aiHistoryFit.ts — conversation history that fits the AI proxy's limits · 对话历史裁剪
 *
 * One copy (R3) shared by the personal app's chat (services/studyAI) and
 * the TV Ask AI body (components/studypack/askAIStream), whose restored
 * history (ADR-0021: up to 20 saved exchanges) would otherwise pass the
 * proxy's MAX_MESSAGES. Pure; imports only the proxy's policy numbers.
 */
import { MAX_MESSAGES, MAX_TOTAL_CHARS } from '../supabase/functions/ai-proxy/policy';

export interface HistoryMessage { role: string; content: string }

/**
 * The newest history that fits the proxy's limits (policy MAX_MESSAGES /
 * MAX_TOTAL_CHARS) next to the system message and the new prompt — older
 * turns drop first, so a long thread never turns into a 400.
 */
export function fitHistory(history: readonly HistoryMessage[], fixedChars: number, fixedMessages: number): HistoryMessage[] {
  const kept: HistoryMessage[] = [];
  let chars = fixedChars;
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    if (kept.length + fixedMessages >= MAX_MESSAGES || chars + m.content.length > MAX_TOTAL_CHARS) break;
    kept.unshift({ role: m.role, content: m.content });
    chars += m.content.length;
  }
  return kept;
}
