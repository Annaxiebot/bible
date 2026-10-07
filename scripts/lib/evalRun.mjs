/**
 * evalRun.mjs — the shared half of the Ask-AI blind evaluations (ADR-0015 §6, ADR-0016):
 * send an arm's request, measure it, judge a pair in both orders, summarise.
 * Used by scripts/eval-related-verses.mjs and scripts/eval-question-aware.mjs,
 * so both arms of both evaluations are measured by one piece of code (R3, R14).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
export const DEFAULT_FIXTURE = 'tests/fixtures/related-verses-eval.json';
/** Room for a two-sentence reason before the verdict line (a bare-letter reply showed pure position bias). */
const JUDGE_MAX_TOKENS = 400;

export function openRouterHeaders(key, title) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, 'HTTP-Referer': 'https://scripturetolife.org', 'X-Title': title };
}

/**
 * POST a data-form body as the app's own-key path would (aiTransport.ownKeyBody
 * for `role`, stream: true) and read the SSE with the app's parser.
 * Never throws for an HTTP or stream error: it comes back in `error`.
 */
export async function streamOwnKey(app, key, title, role, body, signal) {
  const res = await fetch(OPENROUTER_URL, { method: 'POST', headers: openRouterHeaders(key, title), body: app.aiTransport.ownKeyBody(role, body), signal });
  if (!res.ok) return { text: '', error: `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}` };
  let text = '';
  let error = null;
  const feed = app.askAIStream.createSSEParser(event => {
    if (event.content) text += event.content;
    if (event.error) error = event.error.message;
  });
  feed(`${await res.text()}\n`);
  return { text, error };
}

/** One Ask-AI answer (role 'ask'), trimmed as the TV shows it. */
export async function answer(app, key, title, body) {
  const out = await streamOwnKey(app, key, title, 'ask', body);
  return { text: out.text.trim(), error: out.error };
}

/** One arm's measures. Empty text or an error = failed (counted, never a pass). */
export async function measure(app, pack, passage, result, related) {
  const failed = !!result.error || result.text.trim().length === 0;
  if (failed) return { ...result, failed, noSuchVerse: [], fromMemory: [] };
  const checked = await app.citations.checkAnswerRefs(result.text, pack);
  return {
    ...result,
    failed,
    noSuchVerse: checked.filter(c => c.verdict === 'invalid').map(c => c.ref.text),
    fromMemory: app.relatedVerses.citedFromMemory(result.text, passage, related).map(r => r.text),
  };
}

/** The judge's question for the ADR-0015/0016 evaluations (cross-references); ADR-0018 passes its own. */
export const DEFAULT_JUDGE_CRITERION = 'Which answer better serves a church small group: faithful to Scripture, apt cross-references, clear?';

function judgePrompt(item, first, second, criterion) {
  return [
    `A church small group is studying ${item.passageRef} on a TV. The leader asked:`,
    item.question,
    `ANSWER A:\n${first.text}`,
    `ANSWER B:\n${second.text}`,
    criterion,
    'The order of the answers is random and means nothing. Give at most two sentences of reasons,',
    'then a last line that is exactly "WINNER: A" or "WINNER: B".',
  ].join('\n\n');
}

/** One judge call with control as A (controlFirst) or as B → 'control' | 'treatment' | null + the raw reply. */
async function judgeOnce(key, title, model, item, controlFirst, criterion) {
  const { control, treatment } = item;
  const [first, second] = controlFirst ? [control, treatment] : [treatment, control];
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: openRouterHeaders(key, title),
    body: JSON.stringify({ model, max_tokens: JUDGE_MAX_TOKENS, temperature: 0, messages: [{ role: 'user', content: judgePrompt(item, first, second, criterion) }] }),
  });
  if (!res.ok) return { reply: `HTTP ${res.status}`, winner: null };
  const reply = ((await res.json()).choices?.[0]?.message?.content ?? '').trim();
  const letter = /WINNER:\s*([AB])\s*$/.exec(reply)?.[1];
  if (!letter) return { reply, winner: null };
  return { reply, winner: (letter === 'A') === controlFirst ? 'control' : 'treatment' };
}

/**
 * Blind judge for one pair, asked in BOTH orders (R14: the first run's
 * bare-letter judge answered "B" 12 of 12 — pure position bias). Only a
 * verdict that survives the swap counts; a split is a tie (winner null).
 * A failed arm loses without a call. `criterion`: the question the judge answers.
 */
export async function judge(key, title, model, item, criterion = DEFAULT_JUDGE_CRITERION) {
  const { control, treatment } = item;
  if (control.failed || treatment.failed) {
    const winner = control.failed && treatment.failed ? null : control.failed ? 'treatment' : 'control';
    return { order: null, reply: 'not judged: an arm failed', winner };
  }
  const asA = await judgeOnce(key, title, model, item, true, criterion);
  const asB = await judgeOnce(key, title, model, item, false, criterion);
  const winner = asA.winner !== null && asA.winner === asB.winner ? asA.winner : null;
  return { order: 'both', reply: [asA.reply, asB.reply], winner };
}

export function questionText(app, q) {
  if (q.question) return q.question;
  if (q.selection) return app.askAI.questionForSelection(q.selection, q.verse ?? null);
  throw new Error(`${q.id}: needs "question" or "selection"`);
}

/** Throws unless the two bodies are identical outside `messages` (same model, sampling, stream — R14). */
export function assertSameOutsideMessages(control, treatment) {
  const strip = body => { const { messages, ...rest } = JSON.parse(body); return JSON.stringify(rest); };
  if (strip(control) !== strip(treatment)) throw new Error('arms differ outside the messages (R14)');
}

/** Per-arm counts + the judge's undecided pairs. */
export function summariseArms(items) {
  const arm = name => ({
    answered: items.filter(i => !i[name].failed).length,
    failed: items.filter(i => i[name].failed).length,
    noSuchVerse: items.reduce((n, i) => n + i[name].noSuchVerse.length, 0),
    citedFromMemory: items.reduce((n, i) => n + i[name].fromMemory.length, 0),
    judgeWins: items.filter(i => i.judge.winner === name).length,
  });
  return {
    questions: items.length,
    control: arm('control'),
    treatment: arm('treatment'),
    judgeUndecided: items.filter(i => i.judge.winner === null).length,
  };
}

export function printArms(s) {
  const rows = ['answered', 'failed', 'noSuchVerse', 'citedFromMemory', 'judgeWins'];
  process.stdout.write(`\n${'measure'.padEnd(18)}${'control'.padStart(10)}${'treatment'.padStart(12)}\n`);
  for (const r of rows) process.stdout.write(`${r.padEnd(18)}${String(s.control[r]).padStart(10)}${String(s.treatment[r]).padStart(12)}\n`);
  process.stdout.write(`judge split or undecided (order changed the verdict): ${s.judgeUndecided} of ${s.questions}\n`);
}

/** The pack and its scripture slide + passage for one fixture question. */
export function questionContext(app, packs, q) {
  const pack = packs.get(q.pack);
  if (!pack) throw new Error(`${q.id}: unknown pack ${q.pack}`);
  const slide = app.packTypes.buildSlides(pack).find(s => s.kind === 'scripture');
  return { pack, slide, passage: app.relatedVerses.packPassage(pack), question: questionText(app, q) };
}

/**
 * Load the fixture, the app modules and the packs; run `fn`; always close the module server.
 * Vite is imported here, not at the top, so the pure helpers above load in a test without it.
 */
export async function withApp(fixturePath, fn) {
  const { REPO_ROOT, serveBundledData, loadAppModules, buildPack } = await import('./evalAppModules.mjs');
  const fixture = JSON.parse(readFileSync(path.resolve(REPO_ROOT, fixturePath), 'utf-8'));
  serveBundledData();
  const app = await loadAppModules();
  try {
    const packs = new Map(fixture.packs.map(spec => [spec.id, buildPack(spec, app.packTypes.parseStudyPack)]));
    await fn(app, fixture, packs);
  } finally {
    await app.close();
  }
}
