/**
 * aiFinalBody.ts — a data-form AI body as OpenRouter receives it · 最终请求体
 *
 * The browser sends AI requests in the data form (ADR-0014): no system
 * message of its own, plus `content_language` / `pack_source`. The ai-proxy
 * turns that into the final messages (server system message first). This
 * builds the SAME final messages locally, keeping the caller's model and
 * max_tokens — for the eval scripts (scripts/eval-*.mjs, a developer's own
 * OpenRouter key) and the tests that pin prompts. The site itself never calls
 * OpenRouter from the browser: every AI call needs sign-in and goes through
 * the proxy (ADR-0007, 2026-10-23).
 */
import { packSourceProblem, type AIRole } from '../supabase/functions/ai-proxy/policy';
import { buildFinalMessages, isContentLanguage, isPackSource, PromptMessage } from '../supabase/functions/_shared/aiPrompts';

/** `content_language` and `pack_source` are consumed, not forwarded; the proxy's own rules refuse alike. */
export function finalAIBody(role: AIRole, body: string): string {
  const { content_language: mode, pack_source: source, messages, ...rest } = JSON.parse(body) as Record<string, unknown>;
  if (mode !== undefined && !isContentLanguage(mode)) throw new Error(`Unknown content_language: ${String(mode)}`);
  const sourceProblem = packSourceProblem(role, source); // the proxy's own rule (ADR-0019)
  if (sourceProblem) throw new Error(sourceProblem);
  const sent = Array.isArray(messages) ? messages as PromptMessage[] : [];
  const final = buildFinalMessages(role, sent, isContentLanguage(mode) ? mode : undefined, isPackSource(source) ? source : undefined);
  return JSON.stringify({ ...rest, messages: final });
}
