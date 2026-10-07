/**
 * eval-related-verses.mjs — ADR-0015 §6 blind evaluation: today's Ask AI vs "related verses first".
 *
 * For each question in the fixture (tests/fixtures/related-verses-eval.json):
 *   CONTROL   = today's exact request: the app's buildRequestBody with no
 *               related verses → no RELATED VERSES block, no rule sentence
 *               (pinned byte-identical to pre-ADR-0015 by relatedPrompt.test.ts);
 *   TREATMENT = the same request + the related verses relatedVerses.ts finds
 *               (block in the user message → the server rule sentence).
 * Both go through aiTransport.ownKeyBody — the final messages the proxy
 * builds — to OpenRouter with the SAME model, sampling and stream settings.
 * Per arm: "no such verse" refs (the CitationValidator, citations.ts), refs
 * cited from memory (relatedVerses.citedFromMemory), failed/empty answers.
 * A failed or empty answer is a FAILURE and loses its pair — never a pass (R14).
 * Then a blind judge, asked in both A/B orders; only a verdict that survives the swap counts.
 *
 * Usage:
 *   OPENROUTER_API_KEY=… node scripts/eval-related-verses.mjs <results.json> <vote.html> [fixture.json]
 * Costs real OpenRouter credit (2 answers + 2 judge calls per question).
 *   node scripts/eval-related-verses.mjs --dry-run [fixture.json]
 * builds both requests for every question (no network, no key, no files)
 * and prints the related verses and request sizes.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, serveBundledData, loadAppModules, buildPack } from './lib/evalAppModules.mjs';
import { blindPairs, votePageHtml } from './lib/evalVotePage.mjs';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_FIXTURE = 'tests/fixtures/related-verses-eval.json';
const TITLE = 'Scripture to Life related-verses eval';
/** Room for a two-sentence reason before the verdict line (a bare-letter reply showed pure position bias). */
const JUDGE_MAX_TOKENS = 400;

function usage(message) {
  process.stderr.write(`${message}\nusage: OPENROUTER_API_KEY=… node scripts/eval-related-verses.mjs <results.json> <vote.html> [fixture.json]\n`);
  process.exit(2);
}

function openRouterHeaders(key) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, 'HTTP-Referer': 'https://scripturetolife.org', 'X-Title': TITLE };
}

/** POST the app's own-key body (stream: true, as the TV sends it) and read the SSE with the app's parser. */
async function answer(app, key, body) {
  const res = await fetch(OPENROUTER_URL, { method: 'POST', headers: openRouterHeaders(key), body: app.aiTransport.ownKeyBody('ask', body) });
  if (!res.ok) return { text: '', error: `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}` };
  let text = '';
  let error = null;
  const feed = app.askAIStream.createSSEParser(event => {
    if (event.content) text += event.content;
    if (event.error) error = event.error.message;
  });
  feed(`${await res.text()}\n`);
  return { text: app.askAI.stripSplitMarker(text), error };
}

/** One arm's measures. Empty text or an error = failed (counted, never a pass). */
async function measure(app, pack, passage, result, related) {
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

function judgePrompt(item, first, second) {
  return [
    `A church small group is studying ${item.passageRef} on a TV. The leader asked:`,
    item.question,
    `ANSWER A:\n${first.text}`,
    `ANSWER B:\n${second.text}`,
    'Which answer better serves a church small group: faithful to Scripture, apt cross-references, clear?',
    'The order of the answers is random and means nothing. Give at most two sentences of reasons,',
    'then a last line that is exactly "WINNER: A" or "WINNER: B".',
  ].join('\n\n');
}

/** One judge call with control as A (controlFirst) or as B → 'control' | 'treatment' | null + the raw reply. */
async function judgeOnce(key, model, item, controlFirst) {
  const { control, treatment } = item;
  const [first, second] = controlFirst ? [control, treatment] : [treatment, control];
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: openRouterHeaders(key),
    body: JSON.stringify({ model, max_tokens: JUDGE_MAX_TOKENS, temperature: 0, messages: [{ role: 'user', content: judgePrompt(item, first, second) }] }),
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
 * A failed arm loses without a call.
 */
async function judge(key, model, item) {
  const { control, treatment } = item;
  if (control.failed || treatment.failed) {
    const winner = control.failed && treatment.failed ? null : control.failed ? 'treatment' : 'control';
    return { order: null, reply: 'not judged: an arm failed', winner };
  }
  const asA = await judgeOnce(key, model, item, true);
  const asB = await judgeOnce(key, model, item, false);
  const winner = asA.winner !== null && asA.winner === asB.winner ? asA.winner : null;
  return { order: 'both', reply: [asA.reply, asB.reply], winner };
}

function questionText(app, q) {
  if (q.question) return q.question;
  if (q.selection) return app.askAI.questionForSelection(q.selection, q.verse ?? null);
  throw new Error(`${q.id}: needs "question" or "selection"`);
}

/** Build both requests for one question; throws if the control is not today's request or the arms differ elsewhere. */
async function requests(app, model, pack, slide, question) {
  const { related, warnings } = await app.relatedVerses.loadRelatedVerses(pack, question);
  const control = app.askAIStream.buildRequestBody(pack, slide, [], question, { model });
  const treatment = app.askAIStream.buildRequestBody(pack, slide, [], question, { model, related });
  if (control.includes('RELATED VERSES (')) throw new Error('control leaked the treatment block (R14)');
  const strip = body => { const { messages, ...rest } = JSON.parse(body); return JSON.stringify(rest); };
  if (strip(control) !== strip(treatment)) throw new Error('arms differ outside the messages (R14)');
  return { related, warnings, control, treatment };
}

async function runQuestion(app, key, fixture, packs, q) {
  const pack = packs.get(q.pack);
  if (!pack) throw new Error(`${q.id}: unknown pack ${q.pack}`);
  const slide = app.packTypes.buildSlides(pack).find(s => s.kind === 'scripture');
  const passage = app.relatedVerses.packPassage(pack);
  const question = questionText(app, q);
  const req = await requests(app, fixture.model, pack, slide, question);
  process.stdout.write(`${q.id}: ${req.related.length} related, asking both arms…\n`);
  const [c, t] = await Promise.all([answer(app, key, req.control), answer(app, key, req.treatment)]);
  const item = {
    id: q.id, kind: q.kind, pack: q.pack, passageRef: pack.passageRef, question,
    related: req.related.map(r => r.ref), relatedWarnings: req.warnings, treatmentHasBlock: req.related.length > 0,
    control: await measure(app, pack, passage, c, []),
    treatment: await measure(app, pack, passage, t, req.related),
  };
  item.judge = await judge(key, fixture.judge, item);
  return item;
}

function summarise(items) {
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
    treatmentWithoutBlock: items.filter(i => !i.treatmentHasBlock).map(i => i.id),
    relatedWarnings: items.flatMap(i => i.relatedWarnings.map(w => `${i.id}: ${w}`)),
  };
}

function printSummary(s) {
  const rows = ['answered', 'failed', 'noSuchVerse', 'citedFromMemory', 'judgeWins'];
  process.stdout.write(`\n${'measure'.padEnd(18)}${'control'.padStart(10)}${'treatment'.padStart(12)}\n`);
  for (const r of rows) process.stdout.write(`${r.padEnd(18)}${String(s.control[r]).padStart(10)}${String(s.treatment[r]).padStart(12)}\n`);
  process.stdout.write(`judge split or undecided (order changed the verdict): ${s.judgeUndecided} of ${s.questions}\n`);
  if (s.treatmentWithoutBlock.length) process.stdout.write(`treatment had NO related verses (same as control): ${s.treatmentWithoutBlock.join(', ')}\n`);
  if (s.relatedWarnings.length) process.stdout.write(`related-verse warnings:\n  ${s.relatedWarnings.join('\n  ')}\n`);
}

/** --dry-run: both requests per question, built and checked; nothing sent. */
async function dryRun(app, fixture, packs) {
  for (const q of fixture.questions) {
    const pack = packs.get(q.pack);
    const slide = app.packTypes.buildSlides(pack).find(s => s.kind === 'scripture');
    const req = await requests(app, fixture.model, pack, slide, questionText(app, q));
    const size = body => app.aiTransport.ownKeyBody('ask', body).length;
    process.stdout.write(`${q.id} ${pack.passageRef}: related [${req.related.map(r => r.ref).join(', ')}] ` +
      `control ${size(req.control)} chars, treatment ${size(req.treatment)} chars` +
      `${req.warnings.length ? `, WARNINGS ${req.warnings.join('; ')}` : ''}\n`);
  }
}

async function main() {
  if (process.argv[2] === '--dry-run') return withApp(process.argv[3] ?? DEFAULT_FIXTURE, dryRun);
  const [resultsPath, votePath, fixturePath = DEFAULT_FIXTURE] = process.argv.slice(2);
  if (!resultsPath || !votePath) usage('missing output paths');
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) usage('OPENROUTER_API_KEY is not set');
  await withApp(fixturePath, async (app, fixture, packs) => {
    const items = [];
    for (const q of fixture.questions) items.push(await runQuestion(app, key, fixture, packs, q));
    const summary = summarise(items);
    const meta = { date: new Date().toISOString(), model: fixture.model, judge: fixture.judge, fixture: fixturePath };
    writeFileSync(resultsPath, JSON.stringify({ meta, summary, items }, null, 2));
    writeFileSync(votePath, votePageHtml(blindPairs(items)));
    printSummary(summary);
    process.stdout.write(`\nresults: ${resultsPath}\nvote page: ${votePath}\n`);
  });
}

/** Load the fixture, the app modules and the packs; run `fn`; always close the module server. */
async function withApp(fixturePath, fn) {
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

await main();
