/**
 * relatedPick.ts — question-aware related verses · 按问题选相关经文 (ADR-0016)
 *
 * ADR-0015 ranks the passage's cross-references by readers' votes, so the
 * verse that answers THIS question (Isaiah 65:17 for "creation renewed")
 * can sit at rank 40 and never reach the top 6. Here:
 *   1. the pool = the first RELATED_POOL_MAX ranked candidates (relatedVerses.rankPool);
 *   2. a short first AI call (role 'pick', server-owned system text in
 *      _shared/aiPrompts PICK_SYSTEM_PROMPT) sees the passage, the question
 *      and the candidates as "REF label" lines — no verse text;
 *   3. its reply keeps only lines that exactly match a candidate (junk is
 *      ignored and counted), at most RELATED_VERSES_MAX, RELATED_PER_BOOK
 *      applied, the rest filled from the vote ranking.
 * Never blocks the answer: an error, an empty or all-invalid reply, or a
 * call slower than PICK_TIMEOUT_MS falls back to the vote top 6, and the
 * reason is in the result's warnings with source 'votes' (R5).
 */
import { streamChatCompletionDetailed } from './askAIStream';
import { ChosenTargets, RELATED_VERSES_MAX, RankedTarget, TargetChooser, capByBook, targetLabel } from './relatedVerses';
import { PickCandidate, formatPickRequest } from '../../supabase/functions/_shared/aiPrompts';
import { ROLE_MAX_TOKENS } from '../../supabase/functions/ai-proxy/policy';

/** The switch (ADR-0016). Off: no pick call — the vote top 6, today's requests byte for byte. */
export const QUESTION_AWARE_ENABLED: boolean = false;
/** At most this many candidates go to the pick call. */
export const RELATED_POOL_MAX = 120;
/** The pick call must finish within this, or the vote ranking is used. */
export const PICK_TIMEOUT_MS = 3000;
/** The proxy clamps role 'pick' to the same cap (one number, policy.ts). */
export const PICK_MAX_TOKENS = ROLE_MAX_TOKENS.pick;

/** The candidates the pick call sees, in rank order. */
export function pickCandidates(pool: readonly RankedTarget[]): PickCandidate[] {
  return pool.slice(0, RELATED_POOL_MAX).map(t => ({ ref: t.ref, label: targetLabel(t) }));
}

/** The pick request in the data form (ADR-0014): no system message; reasoning off, deterministic. */
export function buildPickBody(passageRef: string, question: string, candidates: readonly PickCandidate[], model: string): string {
  return JSON.stringify({
    model,
    stream: true,
    max_tokens: PICK_MAX_TOKENS,
    temperature: 0,
    reasoning: { enabled: false, exclude: true },
    messages: [{ role: 'user', content: formatPickRequest(passageRef, question, candidates) }],
  });
}

export interface ParsedPick { picked: RankedTarget[]; ignored: string[] }

/**
 * The reply's valid picks in reply order: a trimmed line equal to a
 * candidate's ref, or to its whole "REF label" line. Anything else — and a
 * repeat — is ignored and returned for counting. At most RELATED_VERSES_MAX.
 */
export function parsePickReply(reply: string, pool: readonly RankedTarget[]): ParsedPick {
  const byLine = new Map<string, RankedTarget>();
  for (const t of pool.slice(0, RELATED_POOL_MAX)) {
    byLine.set(t.ref, t);
    byLine.set(`${t.ref} ${targetLabel(t)}`, t);
  }
  const picked: RankedTarget[] = [];
  const ignored: string[] = [];
  for (const line of reply.split('\n').map(l => l.trim()).filter(Boolean)) {
    const t = byLine.get(line);
    if (!t || picked.includes(t)) ignored.push(line);
    else picked.push(t);
  }
  return { picked: picked.slice(0, RELATED_VERSES_MAX), ignored };
}

/** The final list: the picks (per-book cap applied), filled from the vote ranking up to RELATED_VERSES_MAX. */
export function mergePicks(picked: readonly RankedTarget[], pool: readonly RankedTarget[]): RankedTarget[] {
  const kept = capByBook(picked);
  return capByBook([...kept, ...pool]);
}

/** Sends one pick body and resolves with the reply text; rejects on any failure. */
export type PickSender = (body: string, signal: AbortSignal) => Promise<string>;

/** The app's sender: the Ask-AI transport (own key → OpenRouter; signed in → ai-proxy), role 'pick'. */
export const sendPick: PickSender = async (body, signal) =>
  (await streamChatCompletionDetailed(body, () => undefined, signal, { role: 'pick' })).text;

/** The reply, or the reason there is none (error / timeout / cancel). Failures are returned, not thrown: the caller reports them. */
async function replyWithin(send: PickSender, body: string, signal: AbortSignal, timeoutMs: number): Promise<{ text: string } | { reason: string }> {
  const inner = new AbortController();
  const forward = () => inner.abort();
  if (signal.aborted) inner.abort(); else signal.addEventListener('abort', forward);
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; inner.abort(); }, timeoutMs);
  try {
    const text = await send(body, inner.signal);
    if (timedOut) return { reason: `timeout after ${timeoutMs} ms` };
    return signal.aborted ? { reason: 'cancelled' } : { text };
  } catch (err) {
    return { reason: timedOut ? `timeout after ${timeoutMs} ms` : `error: ${err instanceof Error ? err.message : String(err)}` };
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', forward);
  }
}

export interface PickOptions {
  passageRef: string;
  question: string;
  model: string;
  signal: AbortSignal;
  send?: PickSender;
  timeoutMs?: number;
}

/** The ADR-0016 chooser. Never rejects: every fallback comes back as source 'votes' + a warning saying why. */
export function questionAwareChooser(opts: PickOptions): TargetChooser {
  return async (pool, byVotes): Promise<ChosenTargets> => {
    const fallback = (reason: string): ChosenTargets =>
      ({ targets: byVotes, source: 'votes', warnings: [`pick fell back to votes: ${reason}`] });
    const body = buildPickBody(opts.passageRef, opts.question, pickCandidates(pool), opts.model);
    const reply = await replyWithin(opts.send ?? sendPick, body, opts.signal, opts.timeoutMs ?? PICK_TIMEOUT_MS);
    if ('reason' in reply) return fallback(reply.reason);
    if (!reply.text.trim()) return fallback('empty reply');
    const { picked, ignored } = parsePickReply(reply.text, pool);
    if (picked.length === 0) return fallback(`no valid picks (${ignored.length} lines ignored)`);
    const targets = mergePicks(picked, pool);
    const warnings = ignored.length ? [`pick ignored ${ignored.length} line(s): ${ignored.join(' | ')}`] : [];
    const filled = targets.filter(t => !picked.includes(t)).length;
    if (filled) warnings.push(`pick gave ${targets.length - filled} valid, ${filled} filled from votes`);
    return { targets, source: 'pick', warnings };
  };
}
